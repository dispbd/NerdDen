/**
 * Alias gameplay over DB polling.
 *
 * Replaces the orphaned WebSocket handler: the game state lives in
 * `alias_rooms.game_state` (jsonb) instead of an in-memory Map, and a turn ends
 * because its deadline passed — evaluated lazily on each request — instead of a
 * `setTimeout`. Both are required on serverless (adapter-vercel), where nothing
 * persists between invocations. Same pattern as trivia party.
 *
 * The pure game helpers in ./rooms (startGame / startTurn / recordWordResult /
 * endTurn) are reused as-is; only storage and turn expiry changed.
 */

import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { aliasRooms, aliasTeamMembers } from '$lib/server/db/schema';
import { getRoomWithTeams, joinTeam, startGame, startTurn, recordWordResult, endTurn } from './rooms';
import type { AliasRoom, GameState, Team, TeamMember, WordResult } from '$lib/alias/protocol';

/** Role-aware snapshot handed to a polling client. */
export interface AliasPlayState {
	id: string;
	code: string;
	status: 'lobby' | 'playing' | 'finished';
	topic: string;
	difficulty: string;
	language: string;
	turnDuration: number;
	teams: Team[];
	/** Server clock (ms epoch) so clients can correct for skew */
	serverNow: number;
	/** When the current turn expires (ms epoch), or null outside a turn */
	turnEndsAt: number | null;
	currentTeamId: string | null;
	speakerName: string | null;
	/** True when the polling client is the current speaker */
	speakerIsMe: boolean;
	wordsRemaining: number;
	/** The word to explain — sent ONLY to the current speaker */
	currentWord: string | null;
	/** Results recorded so far in the current turn (everyone sees these) */
	turnResults: GameState['turnResults'];
	me: { joined: boolean; isHost: boolean; teamId: string | null };
}

type RoomRow = { gameState: unknown; turnEndsAt: Date | null };

async function readRow(roomId: string): Promise<RoomRow | null> {
	const [row] = await db
		.select({ gameState: aliasRooms.gameState, turnEndsAt: aliasRooms.turnEndsAt })
		.from(aliasRooms)
		.where(eq(aliasRooms.id, roomId));
	return row ?? null;
}

async function persist(roomId: string, state: GameState | null, turnEndsAt: Date | null) {
	await db.update(aliasRooms).set({ gameState: state, turnEndsAt }).where(eq(aliasRooms.id, roomId));
}

/** The member acting for this request (token first, signed-in user as fallback). */
function findMe(room: AliasRoom, token: string | null, userId: string | null): TeamMember | null {
	for (const team of room.teams) {
		for (const member of team.members) {
			const m = member as TeamMember & { token?: string | null };
			if (token && m.token === token) return member;
			if (!token && userId && member.userId === userId) return member;
		}
	}
	return null;
}

function teamOf(room: AliasRoom, member: TeamMember | null): Team | null {
	if (!member) return null;
	return room.teams.find((t) => t.members.some((m) => m.id === member.id)) ?? null;
}

/** Whose turn it is to speak, given the current state. */
function speakerOf(room: AliasRoom, state: GameState): { team: Team | null; speaker: TeamMember | null } {
	const team = room.teams[state.currentTeamIndex] ?? null;
	if (!team || team.members.length === 0) return { team, speaker: null };
	const speaker =
		team.members.find((m) => m.speakerOrder === state.currentSpeakerIndex % team.members.length) ??
		team.members[0];
	return { team, speaker };
}

/**
 * Load the room + state, ending the current turn if its deadline has passed.
 *
 * One turn is resolved per call and the next turn starts *now* rather than from
 * the old deadline: a room nobody polled for an hour loses a single turn instead
 * of silently burning through the whole hat.
 */
async function loadAndAdvance(
	roomId: string
): Promise<{ room: AliasRoom; state: GameState | null; turnEndsAt: Date | null } | null> {
	const room = await getRoomWithTeams(roomId);
	if (!room) return null;
	const row = await readRow(roomId);
	let state = (row?.gameState as GameState | null) ?? null;
	let turnEndsAt = row?.turnEndsAt ?? null;

	if (!state || room.status !== 'playing' || !turnEndsAt) return { room, state, turnEndsAt };

	if (Date.now() >= turnEndsAt.getTime()) {
		const { gameFinished } = await endTurn(roomId, state, room.teams);
		if (gameFinished) {
			state.status = 'finished';
			turnEndsAt = null;
		} else {
			startTurn(state); // draws the next word for the next speaker
			turnEndsAt = new Date(Date.now() + room.turnDuration * 1000);
		}
		await persist(roomId, state, turnEndsAt);
		// Scores/status changed in the DB — re-read so the caller sees them.
		const fresh = await getRoomWithTeams(roomId);
		if (fresh) return { room: fresh, state, turnEndsAt };
	}

	return { room, state, turnEndsAt };
}

/** Poll: everything the client needs, with the word hidden from non-speakers. */
export async function getAliasState(
	roomId: string,
	token: string | null,
	userId: string | null
): Promise<AliasPlayState | null> {
	const loaded = await loadAndAdvance(roomId);
	if (!loaded) return null;
	const { room, state, turnEndsAt } = loaded;

	const me = findMe(room, token, userId);
	const myTeam = teamOf(room, me);
	const { team, speaker } = state
		? speakerOf(room, state)
		: { team: null, speaker: null };
	const speakerIsMe = !!me && !!speaker && me.id === speaker.id;

	return {
		id: room.id,
		code: room.code,
		status: room.status,
		topic: room.topic,
		difficulty: room.difficulty,
		language: room.language,
		turnDuration: room.turnDuration,
		teams: room.teams,
		serverNow: Date.now(),
		turnEndsAt: turnEndsAt?.getTime() ?? null,
		currentTeamId: team?.id ?? null,
		speakerName: speaker?.userName ?? null,
		speakerIsMe,
		wordsRemaining: state ? state.hat.length + (state.currentWord ? 1 : 0) : 0,
		currentWord: speakerIsMe ? (state?.currentWord?.word ?? null) : null,
		turnResults: state?.turnResults ?? [],
		me: { joined: !!me, isHost: !!me && room.hostId === me.userId, teamId: myTeam?.id ?? null }
	};
}

/** Join (or switch to) a team. Guests are identified by their token. */
export async function joinAliasTeam(
	roomId: string,
	teamId: string,
	userName: string,
	token: string,
	userId: string | null
): Promise<{ ok: true } | { error: string }> {
	const room = await getRoomWithTeams(roomId);
	if (!room) return { error: 'not_found' };
	if (room.status !== 'lobby') return { error: 'already_started' };
	if (!room.teams.some((t) => t.id === teamId)) return { error: 'no_team' };

	// Drop any previous membership held by this token (team switching).
	const existing = findMe(room, token, null);
	if (existing) await db.delete(aliasTeamMembers).where(eq(aliasTeamMembers.id, existing.id));

	const member = await joinTeam(roomId, teamId, userId, userName.slice(0, 24) || 'Player');
	await db
		.update(aliasTeamMembers)
		.set({ token })
		.where(eq(aliasTeamMembers.id, member.id));
	return { ok: true };
}

/** Host starts the game: generate the hat and open the first turn. */
export async function startAliasGame(
	roomId: string,
	token: string | null,
	userId: string | null
): Promise<{ ok: true } | { error: string }> {
	const room = await getRoomWithTeams(roomId);
	if (!room) return { error: 'not_found' };
	if (room.status !== 'lobby') return { error: 'already_started' };

	const me = findMe(room, token, userId);
	if (!me) return { error: 'not_a_player' };
	// A guest-hosted room has no hostId, so any player may start it.
	if (room.hostId && room.hostId !== me.userId) return { error: 'not_host' };

	if (room.teams.filter((t) => t.members.length > 0).length < 2) return { error: 'need_two_teams' };

	const state = await startGame(room);
	startTurn(state);
	await persist(roomId, state, new Date(Date.now() + room.turnDuration * 1000));
	return { ok: true };
}

/** Current speaker reports the word as guessed or skipped. */
export async function submitWordResult(
	roomId: string,
	token: string | null,
	userId: string | null,
	result: WordResult
): Promise<{ ok: true; wordsRemaining: number } | { error: string }> {
	const loaded = await loadAndAdvance(roomId);
	if (!loaded) return { error: 'not_found' };
	const { room, state } = loaded;
	let { turnEndsAt } = loaded;
	if (!state || room.status !== 'playing') return { error: 'not_playing' };

	const me = findMe(room, token, userId);
	const { speaker } = speakerOf(room, state);
	if (!me || !speaker || me.id !== speaker.id) return { error: 'not_speaker' };

	const { next } = recordWordResult(state, room.teams, result);

	if (!next) {
		// Hat is empty — the turn (and possibly the game) ends right away.
		const { gameFinished } = await endTurn(roomId, state, room.teams);
		if (gameFinished) {
			state.status = 'finished';
			turnEndsAt = null;
		} else {
			startTurn(state);
			turnEndsAt = new Date(Date.now() + room.turnDuration * 1000);
		}
	}

	await persist(roomId, state, turnEndsAt);
	return { ok: true, wordsRemaining: state.hat.length + (state.currentWord ? 1 : 0) };
}

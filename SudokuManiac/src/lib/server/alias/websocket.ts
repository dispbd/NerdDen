/**
 * WebSocket handler for the Alias / Hat game.
 * Mounted at path /ws/alias (routed in hooks.server.ts).
 *
 * Turn timer: each turn is managed by a server-side setTimeout.
 * When it fires, the turn ends automatically.
 */

import type { ServerWebSocket } from 'bun';
import { auth } from '$lib/server/auth';
import {
	createTeam,
	endTurn,
	gameStates,
	getRoomWithTeams,
	joinTeam,
	recordWordResult,
	startGame,
	startTurn
} from '$lib/server/alias/rooms';
import type {
	AliasClientMessage,
	AliasServerMessage,
	AliasRoomState,
	AliasTurnStarted,
	AliasTurnEnded,
	AliasGameEnded,
	AliasTeamCreated,
	AliasPlayerJoined,
	AliasGameStarted,
	AliasNextWord,
	AliasWordResultBroadcast,
	Team
} from '$lib/alias/protocol';

// ─── Connection registry ──────────────────────────────────────────────────────

interface AliasWsData {
	userId: string | null;
	userName: string;
	roomId: string | null;
}

/** roomId → connected sockets */
const aliasRooms = new Map<string, Set<ServerWebSocket<AliasWsData>>>();

/** roomId → turn timer handle */
const turnTimers = new Map<string, ReturnType<typeof setTimeout>>();

function getRoomSockets(roomId: string): Set<ServerWebSocket<AliasWsData>> {
	if (!aliasRooms.has(roomId)) aliasRooms.set(roomId, new Set());
	return aliasRooms.get(roomId)!;
}

function broadcast(
	roomId: string,
	msg: AliasServerMessage,
	exclude?: ServerWebSocket<AliasWsData>
) {
	const sockets = aliasRooms.get(roomId);
	if (!sockets) return;
	const text = JSON.stringify(msg);
	for (const ws of sockets) {
		if (ws !== exclude && ws.readyState === 1) ws.send(text);
	}
}

function send(ws: ServerWebSocket<AliasWsData>, msg: AliasServerMessage) {
	if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function sendError(ws: ServerWebSocket<AliasWsData>, message: string) {
	send(ws, { type: 'alias_error', message });
}

// ─── Timer helpers ────────────────────────────────────────────────────────────

function clearTurnTimer(roomId: string) {
	const t = turnTimers.get(roomId);
	if (t) {
		clearTimeout(t);
		turnTimers.delete(roomId);
	}
}

async function scheduleTurnEnd(roomId: string, turnDuration: number) {
	clearTurnTimer(roomId);
	const handle = setTimeout(() => {
		void handleTurnEnd(roomId);
	}, turnDuration * 1000);
	turnTimers.set(roomId, handle);
}

async function handleTurnEnd(roomId: string) {
	clearTurnTimer(roomId);

	const room = await getRoomWithTeams(roomId);
	if (!room) return;

	const state = gameStates.get(roomId);
	if (!state) return;

	const { gameFinished } = await endTurn(roomId, state, room.teams);

	const scores = room.teams.map((t) => ({ teamId: t.id, score: t.score }));
	const currentTeam = room.teams[state.currentTeamIndex < room.teams.length
		? state.currentTeamIndex
		: 0];

	const turnEnded: AliasTurnEnded = {
		type: 'alias_turn_ended',
		teamId: room.teams[(state.currentTeamIndex - 1 + room.teams.length) % room.teams.length]?.id ?? '',
		wordsGuessed: state.turnResults.filter((r) => r.result === 'got_it').length,
		scores,
		nextTeamId: gameFinished ? null : currentTeam.id
	};
	broadcast(roomId, turnEnded);

	if (gameFinished) {
		const sorted = [...room.teams].sort((a, b) => b.score - a.score);
		const ended: AliasGameEnded = {
			type: 'alias_game_ended',
			standings: sorted.map((t) => ({ teamId: t.id, name: t.name, score: t.score })),
			winner: sorted[0]?.name ?? '?'
		};
		broadcast(roomId, ended);
	}
}

// ─── Message handlers ─────────────────────────────────────────────────────────

async function handleJoinRoom(ws: ServerWebSocket<AliasWsData>, roomId: string) {
	const room = await getRoomWithTeams(roomId);
	if (!room) {
		sendError(ws, 'Room not found');
		return;
	}

	ws.data.roomId = roomId;
	getRoomSockets(roomId).add(ws);

	const roomState: AliasRoomState = { type: 'alias_room_state', room };
	send(ws, roomState);
}

async function handleJoinTeam(ws: ServerWebSocket<AliasWsData>, teamId: string) {
	const roomId = ws.data.roomId;
	if (!roomId) { sendError(ws, 'Not in a room'); return; }

	const room = await getRoomWithTeams(roomId);
	if (!room) { sendError(ws, 'Room not found'); return; }
	if (room.status !== 'lobby') { sendError(ws, 'Game already started'); return; }

	const team = room.teams.find((t) => t.id === teamId);
	if (!team) { sendError(ws, 'Team not found'); return; }

	const member = await joinTeam(roomId, teamId, ws.data.userId, ws.data.userName);

	const joined: AliasPlayerJoined = { type: 'alias_player_joined', member, teamId };
	broadcast(roomId, joined);
	send(ws, joined);

	// Send updated room state to the joining player
	const updated = await getRoomWithTeams(roomId);
	if (updated) send(ws, { type: 'alias_room_state', room: updated });
}

async function handleCreateTeam(ws: ServerWebSocket<AliasWsData>, name: string, color: string) {
	const roomId = ws.data.roomId;
	if (!roomId) { sendError(ws, 'Not in a room'); return; }

	const room = await getRoomWithTeams(roomId);
	if (!room) { sendError(ws, 'Room not found'); return; }
	if (room.status !== 'lobby') { sendError(ws, 'Game already started'); return; }

	const team = await createTeam(roomId, name, color);
	const msg: AliasTeamCreated = { type: 'alias_team_created', team };
	broadcast(roomId, msg);
}

async function handleStartGame(ws: ServerWebSocket<AliasWsData>) {
	const roomId = ws.data.roomId;
	if (!roomId) { sendError(ws, 'Not in a room'); return; }

	const room = await getRoomWithTeams(roomId);
	if (!room) { sendError(ws, 'Room not found'); return; }
	if (room.hostId !== ws.data.userId) { sendError(ws, 'Only the host can start'); return; }
	if (room.status !== 'lobby') { sendError(ws, 'Already started'); return; }

	const teamsWithMembers = room.teams.filter((t) => t.members.length > 0);
	if (teamsWithMembers.length < 2) {
		sendError(ws, 'Need at least 2 teams with players');
		return;
	}

	const state = await startGame(room);
	const firstTeam = room.teams[0];
	const firstSpeaker = firstTeam.members.find((m) => m.speakerOrder === 0) ?? firstTeam.members[0];

	const started: AliasGameStarted = {
		type: 'alias_game_started',
		wordsInHat: state.hat.length,
		firstTeamId: firstTeam.id,
		firstSpeakerId: firstSpeaker?.userId ?? null,
		firstSpeakerName: firstSpeaker?.userName ?? 'Unknown'
	};
	broadcast(roomId, started);

	// Start the first turn
	await beginTurn(roomId, room.teams, room.turnDuration);
}

async function beginTurn(roomId: string, teams: Team[], turnDuration: number) {
	const state = gameStates.get(roomId);
	if (!state) return;

	const currentTeam = teams[state.currentTeamIndex];
	const speaker = currentTeam.members.find(
		(m) => m.speakerOrder === state.currentSpeakerIndex % currentTeam.members.length
	) ?? currentTeam.members[0];

	const word = startTurn(state);

	const turnStarted: AliasTurnStarted = {
		type: 'alias_turn_started',
		teamId: currentTeam.id,
		speakerId: speaker?.userId ?? null,
		speakerName: speaker?.userName ?? 'Unknown',
		turnDuration,
		wordsRemaining: state.hat.length + (word ? 1 : 0)
	};
	broadcast(roomId, turnStarted);

	// Send word only to the speaker
	if (word) {
		const sockets = aliasRooms.get(roomId);
		if (sockets) {
			for (const ws of sockets) {
				if (ws.data.userId === speaker?.userId) {
					const nextWord: AliasNextWord = {
						type: 'alias_next_word',
						word: word.word,
						wordId: word.id
					};
					send(ws, nextWord);
					break;
				}
			}
		}
	}

	await scheduleTurnEnd(roomId, turnDuration);
}

async function handleWordResult(ws: ServerWebSocket<AliasWsData>, result: 'got_it' | 'skip') {
	const roomId = ws.data.roomId;
	if (!roomId) return;

	const state = gameStates.get(roomId);
	if (!state || state.status !== 'playing') return;

	const room = await getRoomWithTeams(roomId);
	if (!room) return;

	const currentTeam = room.teams[state.currentTeamIndex];
	const speaker = currentTeam.members.find(
		(m) => m.speakerOrder === state.currentSpeakerIndex % currentTeam.members.length
	) ?? currentTeam.members[0];

	// Only the current speaker can submit results
	if (ws.data.userId !== speaker?.userId) {
		sendError(ws, 'Only the current speaker can submit word results');
		return;
	}

	const { next, teamScore } = recordWordResult(state, room.teams, result);

	const broadcastResult: AliasWordResultBroadcast = {
		type: 'alias_word_result_broadcast',
		result,
		teamId: currentTeam.id,
		teamScore,
		wordsRemaining: state.hat.length + (next ? 1 : 0)
	};
	broadcast(roomId, broadcastResult);

	if (next) {
		// Send next word to speaker only
		const nextWord: AliasNextWord = {
			type: 'alias_next_word',
			word: next.word,
			wordId: next.id
		};
		send(ws, nextWord);
	} else {
		// Hat is empty — end turn now (game will also end inside handleTurnEnd)
		void handleTurnEnd(roomId);
	}
}

// ─── handleAliasWebsocket export ─────────────────────────────────────────────

export const handleAliasWebsocket = {
	async upgrade(request: Request): Promise<AliasWsData | Response> {
		const session = await auth.api.getSession({ headers: request.headers });
		return {
			userId: session?.user?.id ?? null,
			userName: session?.user?.name ?? 'Guest',
			roomId: null
		};
	},

	open(_ws: ServerWebSocket<AliasWsData>) {
		// Player must send alias_join_room first
	},

	async message(ws: ServerWebSocket<AliasWsData>, raw: string | Buffer) {
		let msg: AliasClientMessage;
		try {
			msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString()) as AliasClientMessage;
		} catch {
			sendError(ws, 'Invalid JSON');
			return;
		}

		if (msg.type === 'alias_ping') {
			send(ws, { type: 'alias_pong' });
			return;
		}

		if (msg.type === 'alias_join_room') {
			await handleJoinRoom(ws, msg.roomId);
			return;
		}

		if (!ws.data.roomId) {
			sendError(ws, 'Send alias_join_room first');
			return;
		}

		switch (msg.type) {
			case 'alias_join_team':
				await handleJoinTeam(ws, msg.teamId);
				break;
			case 'alias_create_team':
				await handleCreateTeam(ws, msg.name, msg.color);
				break;
			case 'alias_start_game':
				await handleStartGame(ws);
				break;
			case 'alias_word_result':
				await handleWordResult(ws, msg.result);
				break;
			case 'alias_end_turn':
				void handleTurnEnd(ws.data.roomId);
				break;
		}
	},

	close(ws: ServerWebSocket<AliasWsData>) {
		const { roomId } = ws.data;
		if (!roomId) return;
		const sockets = aliasRooms.get(roomId);
		if (sockets) {
			sockets.delete(ws);
			if (sockets.size === 0) aliasRooms.delete(roomId);
		}
	}
};

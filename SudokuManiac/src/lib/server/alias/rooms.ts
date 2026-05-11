/**
 * Alias room management — DB operations and in-memory game state.
 */

import { eq, and } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { aliasRooms, aliasTeams, aliasTeamMembers } from '$lib/server/db/schema';
import { generateAliasWords } from '$lib/server/ai/alias';
import type {
	AliasRoom,
	GameState,
	HatWord,
	Team,
	TeamMember,
	WordResult
} from '$lib/alias/protocol';

// ─── In-memory game state registry ───────────────────────────────────────────

/** roomId → live game state */
export const gameStates = new Map<string, GameState>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomCode(): string {
	return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function shuffle<T>(arr: T[]): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

// ─── Room CRUD ────────────────────────────────────────────────────────────────

export interface CreateRoomInput {
	hostId: string | null;
	hostName: string;
	topic: string;
	language?: string;
	difficulty?: string;
	turnDuration?: number;
	wordCount?: number;
}

export async function createRoom(input: CreateRoomInput): Promise<AliasRoom> {
	let code = randomCode();
	// Retry on collision (extremely unlikely but safe)
	for (let i = 0; i < 5; i++) {
		const existing = await db.query.aliasRooms.findFirst({
			where: eq(aliasRooms.code, code)
		});
		if (!existing) break;
		code = randomCode();
	}

	const [room] = await db
		.insert(aliasRooms)
		.values({
			code,
			hostId: input.hostId,
			topic: input.topic,
			language: input.language ?? 'en',
			difficulty: (input.difficulty ?? 'medium') as 'beginner' | 'easy' | 'medium' | 'hard' | 'expert' | 'extreme',
			turnDuration: input.turnDuration ?? 60,
			wordCount: input.wordCount ?? 30
		})
		.returning();

	// Auto-create two starter teams
	const colors = ['#6366f1', '#f43f5e'];
	const teamNames = ['Team 1', 'Team 2'];
	const teams: Team[] = [];
	for (let i = 0; i < 2; i++) {
		const [t] = await db
			.insert(aliasTeams)
			.values({ roomId: room.id, name: teamNames[i], color: colors[i] })
			.returning();
		teams.push({ id: t.id, name: t.name, color: t.color, score: t.score, members: [] });
	}

	// Host joins team 1
	if (input.hostId) {
		const [m] = await db
			.insert(aliasTeamMembers)
			.values({
				teamId: teams[0].id,
				roomId: room.id,
				userId: input.hostId,
				userName: input.hostName,
				speakerOrder: 0
			})
			.returning();
		teams[0].members.push({
			id: m.id,
			userId: m.userId,
			userName: m.userName,
			speakerOrder: m.speakerOrder
		});
	}

	return {
		id: room.id,
		code: room.code,
		hostId: room.hostId,
		status: 'lobby',
		topic: room.topic,
		language: room.language,
		difficulty: room.difficulty,
		turnDuration: room.turnDuration,
		wordCount: room.wordCount,
		teams
	};
}

export async function getRoomWithTeams(roomId: string): Promise<AliasRoom | null> {
	const room = await db.query.aliasRooms.findFirst({
		where: eq(aliasRooms.id, roomId),
		with: {
			teams: {
				with: { members: true }
			}
		}
	});
	if (!room) return null;

	return {
		id: room.id,
		code: room.code,
		hostId: room.hostId,
		status: room.status as 'lobby' | 'playing' | 'finished',
		topic: room.topic,
		language: room.language,
		difficulty: room.difficulty,
		turnDuration: room.turnDuration,
		wordCount: room.wordCount,
		teams: room.teams.map((t) => ({
			id: t.id,
			name: t.name,
			color: t.color,
			score: t.score,
			members: t.members.map((m) => ({
				id: m.id,
				userId: m.userId,
				userName: m.userName,
				speakerOrder: m.speakerOrder
			}))
		}))
	};
}

export async function listOpenRooms() {
	return db.query.aliasRooms.findMany({
		where: eq(aliasRooms.status, 'lobby'),
		with: { teams: { with: { members: true } } },
		limit: 20
	});
}

/** Add a player to a team. Returns updated TeamMember. */
export async function joinTeam(
	roomId: string,
	teamId: string,
	userId: string | null,
	userName: string
): Promise<TeamMember> {
	// Remove from any other team in this room first
	if (userId) {
		const existing = await db.query.aliasTeamMembers.findFirst({
			where: and(
				eq(aliasTeamMembers.roomId, roomId),
				eq(aliasTeamMembers.userId, userId)
			)
		});
		if (existing) {
			await db.delete(aliasTeamMembers).where(eq(aliasTeamMembers.id, existing.id));
		}
	}

	const teamMembersInTeam = await db.query.aliasTeamMembers.findMany({
		where: eq(aliasTeamMembers.teamId, teamId)
	});

	const [m] = await db
		.insert(aliasTeamMembers)
		.values({
			teamId,
			roomId,
			userId,
			userName,
			speakerOrder: teamMembersInTeam.length
		})
		.returning();

	return {
		id: m.id,
		userId: m.userId,
		userName: m.userName,
		speakerOrder: m.speakerOrder
	};
}

/** Create a new team in a room */
export async function createTeam(
	roomId: string,
	name: string,
	color: string
): Promise<Team> {
	const [t] = await db
		.insert(aliasTeams)
		.values({ roomId, name, color })
		.returning();
	return { id: t.id, name: t.name, color: t.color, score: t.score, members: [] };
}

// ─── Game lifecycle ───────────────────────────────────────────────────────────

/**
 * Start the game: generate words, shuffle into hat, initialise game state.
 * Returns the initialised GameState.
 */
export async function startGame(room: AliasRoom): Promise<GameState> {
	// Generate words
	const rawWords = await generateAliasWords(
		room.topic,
		room.language,
		room.difficulty,
		room.wordCount
	);

	const hat: HatWord[] = shuffle(
		rawWords.map((w, i) => ({ id: `w${i}`, word: w }))
	);

	// Mark room as playing in DB
	await db
		.update(aliasRooms)
		.set({ status: 'playing' })
		.where(eq(aliasRooms.id, room.id));

	const state: GameState = {
		hat,
		usedWords: [],
		currentTeamIndex: 0,
		currentSpeakerIndex: 0,
		currentWord: null,
		turnStartedAt: null,
		turnResults: [],
		status: 'playing'
	};

	gameStates.set(room.id, state);
	return state;
}

/**
 * Start a speaking turn for the current team.
 * Draws the first word from the hat and sets the timer.
 */
export function startTurn(state: GameState): HatWord | null {
	state.turnStartedAt = Date.now();
	state.turnResults = [];
	return drawWord(state);
}

/** Draw the next word from the hat into currentWord */
function drawWord(state: GameState): HatWord | null {
	if (state.hat.length === 0) {
		state.currentWord = null;
		return null;
	}
	state.currentWord = state.hat.shift()!;
	return state.currentWord;
}

/**
 * Record a word result (got_it / skip).
 * Returns the next word or null if hat is empty.
 */
export function recordWordResult(
	state: GameState,
	teams: Team[],
	result: WordResult
): { next: HatWord | null; teamScore: number } {
	const word = state.currentWord;
	if (!word) return { next: null, teamScore: 0 };

	const currentTeam = teams[state.currentTeamIndex];

	state.turnResults.push({ wordId: word.id, word: word.word, result });
	state.usedWords.push({
		id: word.id,
		word: word.word,
		teamId: currentTeam.id,
		guessed: result === 'got_it'
	});

	if (result === 'got_it') {
		currentTeam.score += 1;
	} else {
		// Put skipped word back at the bottom of the hat
		state.hat.push(word);
	}

	const next = drawWord(state);
	return { next, teamScore: currentTeam.score };
}

/**
 * End the current turn.
 * Advances to the next team + speaker.
 * Returns whether the game is now finished.
 */
export async function endTurn(
	roomId: string,
	state: GameState,
	teams: Team[]
): Promise<{ gameFinished: boolean }> {
	const currentTeam = teams[state.currentTeamIndex];

	// Update score in DB
	await db
		.update(aliasTeams)
		.set({ score: currentTeam.score })
		.where(eq(aliasTeams.id, currentTeam.id));

	// Advance speaker within team
	if (currentTeam.members.length > 0) {
		state.currentSpeakerIndex =
			(state.currentSpeakerIndex + 1) % currentTeam.members.length;
	}

	// Advance to next team
	state.currentTeamIndex = (state.currentTeamIndex + 1) % teams.length;
	state.currentWord = null;
	state.turnStartedAt = null;

	// Game ends when hat is empty
	if (state.hat.length === 0) {
		state.status = 'finished';
		await db
			.update(aliasRooms)
			.set({ status: 'finished' })
			.where(eq(aliasRooms.id, roomId));
		gameStates.delete(roomId);
		return { gameFinished: true };
	}

	return { gameFinished: false };
}

/**
 * Room service — manages competitive room lifecycle.
 * Called from both REST API handlers and the WebSocket handler.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { competitiveRooms, roomParticipants, user, userStats } from '$lib/server/db/schema';
import { generatePuzzle } from '$lib/server/games/sudoku/generator';
import { applyEloResult } from '$lib/server/rating/elo';
import type { Difficulty, GridSize, PlayerInfo } from '$lib/competitive/protocol';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a random 6-character alphanumeric room code */
function generateRoomCode(): string {
	return Math.random().toString(36).slice(2, 8).toUpperCase();
}

/** Map DB participant + user row to PlayerInfo DTO */
function toPlayerInfo(
	p: typeof roomParticipants.$inferSelect,
	u: typeof user.$inferSelect,
	stats: typeof userStats.$inferSelect | undefined,
	totalCells: number
): PlayerInfo {
	const filled = p.gridState
		? (p.gridState as number[][]).flat().filter((v) => v !== 0).length
		: 0;
	return {
		userId: p.userId,
		name: u.name,
		progress: totalCells > 0 ? Math.round((filled / totalCells) * 100) : 0,
		finishPosition: p.finishPosition ?? null,
		eloRating: stats?.eloRating ?? 1200
	};
}

// ─── Room CRUD ────────────────────────────────────────────────────────────────

export interface CreateRoomInput {
	hostId: string;
	difficulty: Difficulty;
	gridSize: GridSize;
	maxPlayers?: number;
}

export interface RoomWithParticipants {
	id: string;
	code: string;
	hostId: string;
	status: 'waiting' | 'in_progress' | 'finished';
	difficulty: Difficulty;
	gridSize: GridSize;
	puzzle: number[][] | null;
	maxPlayers: number;
	players: PlayerInfo[];
}

export async function createRoom(input: CreateRoomInput): Promise<RoomWithParticipants> {
	const code = generateRoomCode();
	const { difficulty, gridSize, hostId, maxPlayers = 2 } = input;

	const [room] = await db
		.insert(competitiveRooms)
		.values({ code, hostId, difficulty, gridSize, maxPlayers })
		.returning();

	// Host automatically joins the room
	await db.insert(roomParticipants).values({ roomId: room.id, userId: hostId });

	return getRoomWithParticipants(room.id);
}

export async function joinRoom(
	roomId: string,
	userId: string
): Promise<RoomWithParticipants | { error: string }> {
	const room = await db.query.competitiveRooms.findFirst({
		where: eq(competitiveRooms.id, roomId)
	});

	if (!room) return { error: 'Room not found' };
	if (room.status !== 'waiting') return { error: 'Room is not accepting players' };

	const existing = await db.query.roomParticipants.findFirst({
		where: and(eq(roomParticipants.roomId, roomId), eq(roomParticipants.userId, userId))
	});

	if (!existing) {
		const count = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(roomParticipants)
			.where(eq(roomParticipants.roomId, roomId));

		if ((count[0]?.count ?? 0) >= room.maxPlayers) {
			return { error: 'Room is full' };
		}

		await db.insert(roomParticipants).values({ roomId, userId });
	}

	return getRoomWithParticipants(roomId);
}

export async function joinRoomByCode(
	code: string,
	userId: string
): Promise<RoomWithParticipants | { error: string }> {
	const room = await db.query.competitiveRooms.findFirst({
		where: eq(competitiveRooms.code, code.toUpperCase())
	});

	if (!room) return { error: 'Room not found' };
	return joinRoom(room.id, userId);
}

/** Start the game — generates the puzzle and marks status in_progress */
export async function startRoom(
	roomId: string,
	requesterId: string
): Promise<RoomWithParticipants | { error: string }> {
	const room = await db.query.competitiveRooms.findFirst({
		where: eq(competitiveRooms.id, roomId)
	});

	if (!room) return { error: 'Room not found' };
	if (room.hostId !== requesterId) return { error: 'Only the host can start the game' };
	if (room.status !== 'waiting') return { error: 'Room already started' };

	const generated = generatePuzzle(
		room.difficulty as Difficulty,
		room.gridSize as GridSize
	);

	await db
		.update(competitiveRooms)
		.set({
			status: 'in_progress',
			puzzle: generated.puzzle,
			solution: generated.solution,
			startedAt: new Date()
		})
		.where(eq(competitiveRooms.id, roomId));

	return getRoomWithParticipants(roomId);
}

/** Record a player's grid progress (periodic sync) */
export async function updateProgress(
	roomId: string,
	userId: string,
	gridState: number[][]
): Promise<void> {
	await db
		.update(roomParticipants)
		.set({ gridState })
		.where(
			and(eq(roomParticipants.roomId, roomId), eq(roomParticipants.userId, userId))
		);
}

// ─── Solve validation ─────────────────────────────────────────────────────────

export interface SolveResult {
	valid: boolean;
	finishPosition?: number;
	/** Set when all players have finished */
	finalStandings?: Awaited<ReturnType<typeof finishRoom>>;
}

export async function validateAndRecordSolve(
	roomId: string,
	userId: string,
	gridState: number[][],
	timeSpent: number,
	hintsUsed: number
): Promise<SolveResult | { error: string }> {
	const room = await db.query.competitiveRooms.findFirst({
		where: eq(competitiveRooms.id, roomId)
	});

	if (!room) return { error: 'Room not found' };
	if (room.status !== 'in_progress') return { error: 'Game is not in progress' };

	const solution = room.solution as number[][];
	const isCorrect = gridState.every((row, r) => row.every((val, c) => val === solution[r][c]));

	if (!isCorrect) return { valid: false };

	// Determine finish position
	const finished = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(roomParticipants)
		.where(
			and(
				eq(roomParticipants.roomId, roomId),
				sql`${roomParticipants.finishPosition} IS NOT NULL`
			)
		);

	const finishPosition = (finished[0]?.count ?? 0) + 1;

	await db
		.update(roomParticipants)
		.set({
			gridState,
			timeSpent,
			hintsUsed,
			finishPosition,
			finishedAt: new Date()
		})
		.where(
			and(eq(roomParticipants.roomId, roomId), eq(roomParticipants.userId, userId))
		);

	// Check if all players have finished
	const totalPlayers = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(roomParticipants)
		.where(eq(roomParticipants.roomId, roomId));

	const allDone = finishPosition >= (totalPlayers[0]?.count ?? 0);

	if (allDone) {
		const standings = await finishRoom(roomId);
		return { valid: true, finishPosition, finalStandings: standings };
	}

	return { valid: true, finishPosition };
}

// ─── Room finish + ELO ────────────────────────────────────────────────────────

export async function finishRoom(roomId: string) {
	await db
		.update(competitiveRooms)
		.set({ status: 'finished', finishedAt: new Date() })
		.where(eq(competitiveRooms.id, roomId));

	// Get participants ordered by finish position (null = did not finish)
	const participants = await db
		.select({
			participant: roomParticipants,
			userRow: user
		})
		.from(roomParticipants)
		.innerJoin(user, eq(roomParticipants.userId, user.id))
		.where(eq(roomParticipants.roomId, roomId));

	const sorted = [...participants].sort((a, b) => {
		const pa = a.participant.finishPosition;
		const pb = b.participant.finishPosition;
		if (pa === null && pb === null) return 0;
		if (pa === null) return 1;
		if (pb === null) return -1;
		return pa - pb;
	});

	// Apply ELO for 1v1 (winner = 1st, loser = 2nd or DNF)
	let eloMap: Record<string, { delta: number; newRating: number }> = {};
	if (sorted.length === 2) {
		const winnerId = sorted[0].participant.userId;
		const loserId = sorted[1].participant.userId;

		// Read ratings before the update so we can compute deltas
		const [wBefore, lBefore] = await Promise.all([
			db.query.userStats.findFirst({ where: eq(userStats.userId, winnerId) }),
			db.query.userStats.findFirst({ where: eq(userStats.userId, loserId) })
		]);

		const result = await applyEloResult(winnerId, loserId);

		eloMap[winnerId] = {
			delta: result.winnerNewRating - (wBefore?.eloRating ?? 1200),
			newRating: result.winnerNewRating
		};
		eloMap[loserId] = {
			delta: result.loserNewRating - (lBefore?.eloRating ?? 1200),
			newRating: result.loserNewRating
		};
	}

	// Update eloDelta on participants
	for (const { participant } of sorted) {
		const entry = eloMap[participant.userId];
		if (entry) {
			await db
				.update(roomParticipants)
				.set({ eloDelta: entry.delta })
				.where(
					and(
						eq(roomParticipants.roomId, roomId),
						eq(roomParticipants.userId, participant.userId)
					)
				);
		}
	}

	return sorted.map(({ participant, userRow }) => ({
		userId: participant.userId,
		name: userRow.name,
		finishPosition: participant.finishPosition,
		timeSpent: participant.timeSpent,
		eloDelta: eloMap[participant.userId]?.delta ?? 0,
		newRating: eloMap[participant.userId]?.newRating ?? 1200
	}));
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getRoomWithParticipants(roomId: string): Promise<RoomWithParticipants> {
	const room = await db.query.competitiveRooms.findFirst({
		where: eq(competitiveRooms.id, roomId)
	});

	if (!room) throw new Error(`Room ${roomId} not found`);

	const rows = await db
		.select({ participant: roomParticipants, userRow: user, stats: userStats })
		.from(roomParticipants)
		.innerJoin(user, eq(roomParticipants.userId, user.id))
		.leftJoin(userStats, eq(roomParticipants.userId, userStats.userId))
		.where(eq(roomParticipants.roomId, roomId));

	const totalCells = room.gridSize * room.gridSize;

	const players = rows.map(({ participant, userRow, stats }) =>
		toPlayerInfo(participant, userRow, stats ?? undefined, totalCells)
	);

	return {
		id: room.id,
		code: room.code,
		hostId: room.hostId,
		status: room.status as RoomWithParticipants['status'],
		difficulty: room.difficulty as Difficulty,
		gridSize: room.gridSize as GridSize,
		// Only reveal puzzle when game is in progress or finished
		puzzle: room.status !== 'waiting' ? (room.puzzle as number[][] | null) : null,
		maxPlayers: room.maxPlayers,
		players
	};
}

import { eq, and, desc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { gameSessions, userStats } from '$lib/server/db/schema';
import type { Grid } from './generator';

export type Difficulty = 'beginner' | 'easy' | 'medium' | 'hard' | 'expert' | 'extreme';

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createGameSession(params: {
	userId: string | null;
	difficulty: Difficulty;
	gridState: Grid;
	solution: Grid;
}) {
	const [session] = await db
		.insert(gameSessions)
		.values({
			userId: params.userId,
			gameType: 'sudoku',
			difficulty: params.difficulty,
			gridState: params.gridState,
			solution: params.solution
		})
		.returning();
	return session;
}

// ─── Update (save progress) ───────────────────────────────────────────────────

export async function saveGameSession(params: {
	id: string;
	userId: string | null;
	gridState: Grid;
	timeSpent: number;
	hintsUsed?: number;
}) {
	const where =
		params.userId != null
			? and(eq(gameSessions.id, params.id), eq(gameSessions.userId, params.userId))
			: eq(gameSessions.id, params.id);

	const [updated] = await db
		.update(gameSessions)
		.set({ gridState: params.gridState, timeSpent: params.timeSpent, hintsUsed: params.hintsUsed ?? 0 })
		.where(where)
		.returning();
	return updated ?? null;
}

// ─── Complete ─────────────────────────────────────────────────────────────────

export async function completeGameSession(params: {
	id: string;
	userId: string | null;
	timeSpent: number;
	hintsUsed: number;
}) {
	const where =
		params.userId != null
			? and(eq(gameSessions.id, params.id), eq(gameSessions.userId, params.userId))
			: eq(gameSessions.id, params.id);

	const [completed] = await db
		.update(gameSessions)
		.set({ status: 'completed', timeSpent: params.timeSpent, hintsUsed: params.hintsUsed, completedAt: new Date() })
		.where(where)
		.returning();

	if (completed?.userId) {
		await updateUserStats(completed.userId, params.timeSpent);
	}
	return completed ?? null;
}

// ─── Abandon ──────────────────────────────────────────────────────────────────

export async function abandonGameSession(id: string, userId: string | null) {
	const where =
		userId != null
			? and(eq(gameSessions.id, id), eq(gameSessions.userId, userId))
			: eq(gameSessions.id, id);

	await db.update(gameSessions).set({ status: 'abandoned' }).where(where);
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getActiveSession(userId: string) {
	return db.query.gameSessions.findFirst({
		where: and(
			eq(gameSessions.userId, userId),
			eq(gameSessions.gameType, 'sudoku'),
			eq(gameSessions.status, 'in_progress')
		),
		orderBy: desc(gameSessions.createdAt)
	});
}

export async function getUserGameHistory(userId: string, limit = 20) {
	return db.query.gameSessions.findMany({
		where: and(eq(gameSessions.userId, userId), eq(gameSessions.gameType, 'sudoku')),
		orderBy: desc(gameSessions.createdAt),
		limit
	});
}

// ─── Stats helpers ────────────────────────────────────────────────────────────

async function updateUserStats(userId: string, timeSpentSeconds: number) {
	const existing = await db.query.userStats.findFirst({
		where: eq(userStats.userId, userId)
	});

	if (!existing) {
		await db.insert(userStats).values({
			userId,
			sudokuPlayed: 1,
			sudokuSolved: 1,
			sudokuBestTimeSeconds: timeSpentSeconds,
			totalXp: calculateXp(timeSpentSeconds),
			level: 1
		});
	} else {
		const bestTime =
			existing.sudokuBestTimeSeconds == null || timeSpentSeconds < existing.sudokuBestTimeSeconds
				? timeSpentSeconds
				: existing.sudokuBestTimeSeconds;
		const newXp = existing.totalXp + calculateXp(timeSpentSeconds);

		await db
			.update(userStats)
			.set({
				sudokuPlayed: existing.sudokuPlayed + 1,
				sudokuSolved: existing.sudokuSolved + 1,
				sudokuBestTimeSeconds: bestTime,
				totalXp: newXp,
				level: calculateLevel(newXp)
			})
			.where(eq(userStats.userId, userId));
	}
}

function calculateXp(timeSpentSeconds: number): number {
	// Base 50 XP, bonus for speed (< 5 min = +50, < 10 min = +25)
	if (timeSpentSeconds < 300) return 100;
	if (timeSpentSeconds < 600) return 75;
	return 50;
}

function calculateLevel(xp: number): number {
	// Each level requires progressively more XP: level N needs N*100 XP cumulative threshold
	return Math.floor(1 + Math.sqrt(xp / 100));
}

import { eq, and, desc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { gameSessions, userStats } from '$lib/server/db/schema';
import type { Grid } from './generator';
import { awardAchievements, calculateLevel } from '$lib/server/games/achievements/engine';

export type Difficulty = 'beginner' | 'easy' | 'medium' | 'hard' | 'expert' | 'extreme';

/** XP granted per difficulty on solve */
const DIFFICULTY_XP: Record<Difficulty, number> = {
	beginner: 20,
	easy: 35,
	medium: 50,
	hard: 75,
	expert: 110,
	extreme: 160
};

/** Hint replenishment per solved puzzle */
const HINTS_PER_SOLVE = 1;

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

export interface CompleteResult {
	session: typeof gameSessions.$inferSelect;
	xpGained: number;
	levelUp: boolean;
	newLevel: number;
	hintsReplenished: number;
	newAchievements: { id: string; title: string; icon: string }[];
}

export async function completeGameSession(params: {
	id: string;
	userId: string | null;
	timeSpent: number;
	hintsUsed: number;
	difficulty: Difficulty;
}): Promise<CompleteResult | null> {
	const where =
		params.userId != null
			? and(eq(gameSessions.id, params.id), eq(gameSessions.userId, params.userId))
			: eq(gameSessions.id, params.id);

	const [completed] = await db
		.update(gameSessions)
		.set({ status: 'completed', timeSpent: params.timeSpent, hintsUsed: params.hintsUsed, completedAt: new Date() })
		.where(where)
		.returning();

	if (!completed) return null;

	if (!completed.userId) {
		return { session: completed, xpGained: 0, levelUp: false, newLevel: 1, hintsReplenished: 0, newAchievements: [] };
	}

	const result = await updateUserStatsOnComplete(completed.userId, {
		difficulty: params.difficulty,
		timeSpent: params.timeSpent,
		hintsUsed: params.hintsUsed
	});

	return { session: completed, ...result };
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

// ─── Hint spending ────────────────────────────────────────────────────────────

/** Spend one hint; returns updated hints count or null if insufficient */
export async function spendHint(userId: string): Promise<number | null> {
	const stats = await db.query.userStats.findFirst({ where: eq(userStats.userId, userId) });
	if (!stats || stats.hintsAvailable <= 0) return null;

	const newCount = stats.hintsAvailable - 1;
	await db.update(userStats).set({ hintsAvailable: newCount }).where(eq(userStats.userId, userId));
	return newCount;
}

// ─── Stats helpers ────────────────────────────────────────────────────────────

async function updateUserStatsOnComplete(
	userId: string,
	ctx: { difficulty: Difficulty; timeSpent: number; hintsUsed: number }
) {
	const existing = await db.query.userStats.findFirst({ where: eq(userStats.userId, userId) });

	const baseXp = DIFFICULTY_XP[ctx.difficulty] ?? 50;
	// Speed bonus: under 5 min +50%, under 10 min +25%
	const speedMult = ctx.timeSpent < 300 ? 1.5 : ctx.timeSpent < 600 ? 1.25 : 1;
	const earnedXp = Math.round(baseXp * speedMult);

	// Streak logic
	const today = new Date().toISOString().slice(0, 10);
	const lastPlayed = existing?.lastPlayedAt
		? new Date(existing.lastPlayedAt).toISOString().slice(0, 10)
		: null;

	let newStreak = 1;
	if (lastPlayed) {
		const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
		if (lastPlayed === today) {
			newStreak = existing?.streakDays ?? 1; // same day — keep streak
		} else if (lastPlayed === yesterday) {
			newStreak = (existing?.streakDays ?? 0) + 1; // consecutive day
		}
		// else streak resets to 1
	}

	const bestTime =
		existing?.sudokuBestTimeSeconds == null || ctx.timeSpent < existing.sudokuBestTimeSeconds
			? ctx.timeSpent
			: existing.sudokuBestTimeSeconds;

	const prevLevel = existing?.level ?? 1;
	const newXp = (existing?.totalXp ?? 0) + earnedXp;
	const newLevel = calculateLevel(newXp);

	if (!existing) {
		await db.insert(userStats).values({
			userId,
			sudokuPlayed: 1,
			sudokuSolved: 1,
			sudokuBestTimeSeconds: bestTime,
			totalXp: newXp,
			level: newLevel,
			hintsAvailable: HINTS_PER_SOLVE,
			streakDays: 1,
			lastPlayedAt: new Date()
		});
	} else {
		await db.update(userStats).set({
			sudokuPlayed: existing.sudokuPlayed + 1,
			sudokuSolved: existing.sudokuSolved + 1,
			sudokuBestTimeSeconds: bestTime,
			totalXp: newXp,
			level: newLevel,
			hintsAvailable: existing.hintsAvailable + HINTS_PER_SOLVE,
			streakDays: newStreak,
			lastPlayedAt: new Date()
		}).where(eq(userStats.userId, userId));
	}

	// Award achievements (non-blocking pattern — already applied stats before this)
	const achieveResult = await awardAchievements({
		userId,
		difficulty: ctx.difficulty,
		timeSpent: ctx.timeSpent,
		hintsUsed: ctx.hintsUsed
	});

	return {
		xpGained: earnedXp + achieveResult.xpGained,
		levelUp: newLevel > prevLevel,
		newLevel,
		hintsReplenished: HINTS_PER_SOLVE,
		newAchievements: achieveResult.newAchievements.map((a) => ({
			id: a.id,
			title: a.title,
			icon: a.icon
		}))
	};
}

/**
 * Achievement awarding engine.
 * Called after a puzzle is completed — checks which achievements the user
 * has just unlocked and inserts them + grants XP.
 */

import { eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { achievements, userAchievements, userStats } from '$lib/server/db/schema';
import { ACHIEVEMENTS, type AchievementDef } from './catalog';

export interface AwardResult {
	newAchievements: AchievementDef[];
	xpGained: number;
}

/**
 * Evaluate and award achievements after a sudoku solve.
 * Returns newly earned achievements (already persisted).
 */
export async function awardAchievements(params: {
	userId: string;
	difficulty: string;
	timeSpent: number;
	hintsUsed: number;
}): Promise<AwardResult> {
	const { userId, difficulty, timeSpent, hintsUsed } = params;

	// Load current stats + already-earned achievements in parallel
	const [stats, earned] = await Promise.all([
		db.query.userStats.findFirst({ where: eq(userStats.userId, userId) }),
		db.query.userAchievements.findMany({ where: eq(userAchievements.userId, userId) })
	]);

	if (!stats) return { newAchievements: [], xpGained: 0 };

	const earnedIds = new Set(earned.map((e) => e.achievementId));

	// Evaluate each achievement that hasn't been earned yet
	const toAward: AchievementDef[] = [];
	for (const def of ACHIEVEMENTS) {
		if (earnedIds.has(def.id)) continue;
		if (isUnlocked(def, stats, { difficulty, timeSpent, hintsUsed })) {
			toAward.push(def);
		}
	}

	if (toAward.length === 0) return { newAchievements: [], xpGained: 0 };

	// Persist newly earned achievements — ignore duplicates from concurrent requests
	await db
		.insert(userAchievements)
		.values(toAward.map((a) => ({ userId, achievementId: a.id })))
		.onConflictDoNothing();

	// Grant XP bonus
	const xpGained = toAward.reduce((sum, a) => sum + a.xpReward, 0);
	if (xpGained > 0) {
		const newXp = (stats.totalXp ?? 0) + xpGained;
		await db
			.update(userStats)
			.set({ totalXp: newXp, level: calculateLevel(newXp) })
			.where(eq(userStats.userId, userId));
	}

	return { newAchievements: toAward, xpGained };
}

/** Seed achievements catalog into the DB (idempotent — upsert by id) */
export async function seedAchievements(): Promise<void> {
	await db
		.insert(achievements)
		.values(
			ACHIEVEMENTS.map((a) => ({
				id: a.id,
				title: a.title,
				description: a.description,
				icon: a.icon,
				xpReward: a.xpReward,
				condition: a.condition
			}))
		)
		.onConflictDoUpdate({
			target: achievements.id,
			set: {
				title: achievements.title,
				description: achievements.description,
				icon: achievements.icon,
				xpReward: achievements.xpReward,
				condition: achievements.condition
			}
		});
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type StatsSnapshot = {
	sudokuSolved: number;
	streakDays: number;
};

type SolveContext = {
	difficulty: string;
	timeSpent: number;
	hintsUsed: number;
};

function isUnlocked(def: AchievementDef, stats: StatsSnapshot, ctx: SolveContext): boolean {
	const { condition } = def;
	switch (condition.type) {
		case 'solve_count':
			return stats.sudokuSolved >= condition.count;
		case 'solve_difficulty':
			return ctx.difficulty === condition.difficulty;
		case 'solve_under_time':
			return ctx.timeSpent <= condition.seconds;
		case 'streak_days':
			return stats.streakDays >= condition.days;
		case 'hints_free':
			// Checked cumulatively via a separate field — approximated here
			// by checking if the current solve was hint-free and total solves qualify
			return ctx.hintsUsed === 0 && stats.sudokuSolved >= condition.count;
		default:
			return false;
	}
}

export function calculateLevel(xp: number): number {
	return Math.floor(1 + Math.sqrt(xp / 100));
}

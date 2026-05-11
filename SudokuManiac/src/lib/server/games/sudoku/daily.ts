/**
 * Daily Task service.
 * One puzzle per calendar day — generated lazily on first request.
 */

import { eq, and } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { dailyTasks, userDailyTasks, userStats } from '$lib/server/db/schema';
import { generatePuzzle } from '$lib/server/games/sudoku/generator';
import type { Grid } from '$lib/server/games/sudoku/generator';
import { awardAchievements, calculateLevel } from '$lib/server/games/achievements/engine';

/** YYYY-MM-DD string for today */
function todayStr(): string {
	return new Date().toISOString().slice(0, 10);
}

/** Get (or create) today's daily task */
export async function getDailyTask() {
	const today = todayStr();

	const existing = await db.query.dailyTasks.findFirst({
		where: eq(dailyTasks.date, today)
	});
	if (existing) return existing;

	// Generate a medium puzzle as the daily challenge
	const { puzzle, solution } = generatePuzzle('medium');
	const [created] = await db
		.insert(dailyTasks)
		.values({ date: today, difficulty: 'medium', puzzle, solution })
		.returning();
	return created;
}

/** Get the signed-in user's progress on today's daily task */
export async function getUserDailyStatus(userId: string) {
	const task = await getDailyTask();
	const progress = await db.query.userDailyTasks.findFirst({
		where: and(eq(userDailyTasks.userId, userId), eq(userDailyTasks.dailyTaskId, task.id))
	});
	return { task, progress: progress ?? null };
}

/** Start or resume the daily task for a user */
export async function startDailyTask(userId: string): Promise<{
	taskId: string;
	userTaskId: string;
	puzzle: Grid;
	solution: Grid;
	timeSpent: number;
	status: 'in_progress' | 'completed';
}> {
	const task = await getDailyTask();

	const existing = await db.query.userDailyTasks.findFirst({
		where: and(eq(userDailyTasks.userId, userId), eq(userDailyTasks.dailyTaskId, task.id))
	});

	if (existing) {
		return {
			taskId: task.id,
			userTaskId: existing.id,
			puzzle: task.puzzle as Grid,
			solution: task.solution as Grid,
			timeSpent: existing.timeSpent,
			status: existing.status
		};
	}

	const [created] = await db
		.insert(userDailyTasks)
		.values({ userId, dailyTaskId: task.id })
		.returning();

	return {
		taskId: task.id,
		userTaskId: created.id,
		puzzle: task.puzzle as Grid,
		solution: task.solution as Grid,
		timeSpent: 0,
		status: 'in_progress'
	};
}

/** Complete the daily task for a user */
export async function completeDailyTask(params: {
	userTaskId: string;
	userId: string;
	timeSpent: number;
	hintsUsed: number;
}) {
	const [completed] = await db
		.update(userDailyTasks)
		.set({ status: 'completed', timeSpent: params.timeSpent, hintsUsed: params.hintsUsed, completedAt: new Date() })
		.where(and(eq(userDailyTasks.id, params.userTaskId), eq(userDailyTasks.userId, params.userId)))
		.returning();

	if (!completed) return null;

	// Grant XP + update streak
	const stats = await db.query.userStats.findFirst({ where: eq(userStats.userId, params.userId) });
	const bonusXp = 75; // daily bonus
	const newXp = (stats?.totalXp ?? 0) + bonusXp;

	if (!stats) {
		await db.insert(userStats).values({
			userId: params.userId,
			sudokuPlayed: 1,
			sudokuSolved: 1,
			totalXp: bonusXp,
			level: calculateLevel(bonusXp),
			hintsAvailable: 1,
			streakDays: 1,
			lastPlayedAt: new Date()
		});
	} else {
		await db.update(userStats).set({
			totalXp: newXp,
			level: calculateLevel(newXp),
			hintsAvailable: stats.hintsAvailable + 2, // extra hints for daily
			streakDays: stats.streakDays + 1,
			lastPlayedAt: new Date()
		}).where(eq(userStats.userId, params.userId));
	}

	const achieveResult = await awardAchievements({
		userId: params.userId,
		difficulty: 'medium',
		timeSpent: params.timeSpent,
		hintsUsed: params.hintsUsed
	});

	return {
		xpGained: bonusXp + achieveResult.xpGained,
		newAchievements: achieveResult.newAchievements
	};
}

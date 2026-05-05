/**
 * Story Mode service.
 * Manages chapters, sequential puzzle unlocking, and user progress.
 */

import { eq, and, count } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	storyChapters,
	storyPuzzles,
	userStoryProgress,
	userStats
} from '$lib/server/db/schema';
import { generatePuzzle } from '$lib/server/games/sudoku/generator';
import type { Grid, GridSize, Difficulty } from '$lib/server/games/sudoku/generator';
import { awardAchievements, calculateLevel } from '$lib/server/games/achievements/engine';

// ─── Chapter definitions (seeded once on first request) ──────────────────────

interface ChapterDef {
	title: string;
	description: string;
	orderIndex: number;
	requiredCompletedCount: number;
	puzzles: { difficulty: Difficulty; gridSize: GridSize }[];
}

const CHAPTER_DEFS: ChapterDef[] = [
	{
		title: 'First Steps',
		description: 'Mini 4×4 puzzles to learn the rules.',
		orderIndex: 1,
		requiredCompletedCount: 0,
		puzzles: Array(5).fill({ difficulty: 'beginner' as Difficulty, gridSize: 4 as GridSize })
	},
	{
		title: 'Warming Up',
		description: 'Classic 9×9 beginner puzzles.',
		orderIndex: 2,
		requiredCompletedCount: 3, // complete at least 3 from chapter 1
		puzzles: Array(5).fill({ difficulty: 'beginner' as Difficulty, gridSize: 9 as GridSize })
	},
	{
		title: 'Getting Serious',
		description: 'Easy 9×9 puzzles.',
		orderIndex: 3,
		requiredCompletedCount: 5,
		puzzles: Array(5).fill({ difficulty: 'easy' as Difficulty, gridSize: 9 as GridSize })
	},
	{
		title: 'The Challenge',
		description: 'Medium difficulty — real Sudoku starts here.',
		orderIndex: 4,
		requiredCompletedCount: 5,
		puzzles: Array(5).fill({ difficulty: 'medium' as Difficulty, gridSize: 9 as GridSize })
	},
	{
		title: 'Expert Territory',
		description: 'Hard puzzles for seasoned solvers.',
		orderIndex: 5,
		requiredCompletedCount: 5,
		puzzles: Array(5).fill({ difficulty: 'hard' as Difficulty, gridSize: 9 as GridSize })
	}
];

/** Seed all chapters + puzzles into the DB (idempotent) */
export async function seedStoryChapters(): Promise<void> {
	const existing = await db.query.storyChapters.findFirst();
	if (existing) return; // already seeded

	for (const def of CHAPTER_DEFS) {
		const [chapter] = await db
			.insert(storyChapters)
			.values({
				title: def.title,
				description: def.description,
				orderIndex: def.orderIndex,
				requiredCompletedCount: def.requiredCompletedCount
			})
			.returning();

		for (let i = 0; i < def.puzzles.length; i++) {
			const { difficulty, gridSize } = def.puzzles[i];
			const { puzzle, solution } = generatePuzzle(difficulty, gridSize);
			await db.insert(storyPuzzles).values({
				chapterId: chapter.id,
				orderIndex: i + 1,
				difficulty,
				gridSize,
				puzzle,
				solution
			});
		}
	}
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface ChapterWithProgress {
	id: string;
	title: string;
	description: string;
	orderIndex: number;
	puzzles: {
		id: string;
		orderIndex: number;
		difficulty: string;
		gridSize: number;
		status: 'locked' | 'available' | 'in_progress' | 'completed';
	}[];
	/** Count of completed puzzles by user */
	completedCount: number;
	/** Whether this chapter is accessible to the user */
	unlocked: boolean;
}

/** Get all chapters with per-puzzle progress for a user (null = guest) */
export async function getStoryChapters(userId: string | null): Promise<ChapterWithProgress[]> {
	await seedStoryChapters();

	const chapters = await db.query.storyChapters.findMany({
		orderBy: (t, { asc }) => [asc(t.orderIndex)],
		with: { puzzles: { orderBy: (t, { asc }) => [asc(t.orderIndex)] } }
	});

	// Load user progress once
	const progressMap = new Map<string, 'in_progress' | 'completed'>();
	if (userId) {
		const progRows = await db.query.userStoryProgress.findMany({
			where: eq(userStoryProgress.userId, userId)
		});
		for (const p of progRows) progressMap.set(p.puzzleId, p.status);
	}

	// Compute unlock state per chapter sequentially
	let prevChapterCompletedCount = Infinity; // chapter 1 always unlocked
	const result: ChapterWithProgress[] = [];

	for (const chapter of chapters) {
		const unlocked =
			chapter.orderIndex === 1 ||
			prevChapterCompletedCount >= chapter.requiredCompletedCount;

		const puzzlesWithStatus = chapter.puzzles.map((p) => {
			const userStatus = progressMap.get(p.id);
			let status: 'locked' | 'available' | 'in_progress' | 'completed';
			if (!unlocked) {
				status = 'locked';
			} else if (userStatus === 'completed') {
				status = 'completed';
			} else if (userStatus === 'in_progress') {
				status = 'in_progress';
			} else {
				status = 'available';
			}
			return {
				id: p.id,
				orderIndex: p.orderIndex,
				difficulty: p.difficulty,
				gridSize: p.gridSize,
				status
			};
		});

		const completedCount = puzzlesWithStatus.filter((p) => p.status === 'completed').length;
		result.push({
			id: chapter.id,
			title: chapter.title,
			description: chapter.description,
			orderIndex: chapter.orderIndex,
			puzzles: puzzlesWithStatus,
			completedCount,
			unlocked
		});

		prevChapterCompletedCount = completedCount;
	}

	return result;
}

/** Start or resume a story puzzle; returns puzzle data */
export async function startStoryPuzzle(
	userId: string,
	puzzleId: string
): Promise<{
	puzzle: Grid;
	solution: Grid;
	gridSize: GridSize;
	difficulty: string;
	timeSpent: number;
	status: 'in_progress' | 'completed';
} | null> {
	const sp = await db.query.storyPuzzles.findFirst({
		where: eq(storyPuzzles.id, puzzleId)
	});
	if (!sp) return null;

	const existing = await db.query.userStoryProgress.findFirst({
		where: and(eq(userStoryProgress.userId, userId), eq(userStoryProgress.puzzleId, puzzleId))
	});

	if (!existing) {
		await db.insert(userStoryProgress).values({ userId, puzzleId });
	}

	return {
		puzzle: sp.puzzle as Grid,
		solution: sp.solution as Grid,
		gridSize: sp.gridSize as GridSize,
		difficulty: sp.difficulty,
		timeSpent: existing?.timeSpent ?? 0,
		status: existing?.status ?? 'in_progress'
	};
}

/** Complete a story puzzle */
export async function completeStoryPuzzle(params: {
	userId: string;
	puzzleId: string;
	timeSpent: number;
	hintsUsed: number;
}): Promise<{ xpGained: number; newAchievements: { title: string; icon: string }[] } | null> {
	const [updated] = await db
		.update(userStoryProgress)
		.set({
			status: 'completed',
			timeSpent: params.timeSpent,
			hintsUsed: params.hintsUsed,
			completedAt: new Date()
		})
		.where(
			and(
				eq(userStoryProgress.userId, params.userId),
				eq(userStoryProgress.puzzleId, params.puzzleId)
			)
		)
		.returning();

	if (!updated) return null;

	const sp = await db.query.storyPuzzles.findFirst({
		where: eq(storyPuzzles.id, params.puzzleId)
	});
	const bonusXp = 30; // story puzzle flat reward

	const existingStats = await db.query.userStats.findFirst({
		where: eq(userStats.userId, params.userId)
	});

	const newXp = (existingStats?.totalXp ?? 0) + bonusXp;
	if (!existingStats) {
		await db.insert(userStats).values({
			userId: params.userId,
			sudokuPlayed: 1,
			sudokuSolved: 1,
			totalXp: bonusXp,
			level: calculateLevel(bonusXp),
			hintsAvailable: 1
		});
	} else {
		await db
			.update(userStats)
			.set({
				totalXp: newXp,
				level: calculateLevel(newXp),
				sudokuSolved: existingStats.sudokuSolved + 1,
				sudokuPlayed: existingStats.sudokuPlayed + 1
			})
			.where(eq(userStats.userId, params.userId));
	}

	const achieveResult = await awardAchievements({
		userId: params.userId,
		difficulty: (sp?.difficulty ?? 'beginner') as Difficulty,
		timeSpent: params.timeSpent,
		hintsUsed: params.hintsUsed
	});

	return {
		xpGained: bonusXp + achieveResult.xpGained,
		newAchievements: achieveResult.newAchievements
	};
}

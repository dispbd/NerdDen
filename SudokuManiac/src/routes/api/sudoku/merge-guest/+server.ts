import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { userStats, userAchievements } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { ACHIEVEMENTS } from '$lib/server/games/achievements/catalog';
import { calculateLevel } from '$lib/server/games/achievements/engine';

interface GuestStats {
	sudokuSolved: number;
	sudokuPlayed: number;
	sudokuBestTimeSeconds: number | null;
	totalXp: number;
	hintsAvailable: number;
	streakDays: number;
	earnedAchievementIds: string[];
}

/**
 * POST /api/sudoku/merge-guest
 * Called once after a guest signs in. Merges guest localStorage state into
 * the server-side userStats and userAchievements. Idempotent — safe to call
 * multiple times (uses Math.max / onConflictDoNothing).
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	const userId = locals.user.id;

	const body = (await request.json()) as Partial<GuestStats>;

	const guestSolved = body.sudokuSolved ?? 0;
	const guestPlayed = body.sudokuPlayed ?? 0;
	const guestBest = body.sudokuBestTimeSeconds ?? null;
	const guestXp = body.totalXp ?? 0;
	const guestHints = body.hintsAvailable ?? 0;
	const guestStreak = body.streakDays ?? 0;
	const guestAchIds = Array.isArray(body.earnedAchievementIds) ? body.earnedAchievementIds : [];

	const existing = await db.query.userStats.findFirst({
		where: eq(userStats.userId, userId)
	});

	if (!existing) {
		await db.insert(userStats).values({
			userId,
			sudokuSolved: guestSolved,
			sudokuPlayed: guestPlayed,
			sudokuBestTimeSeconds: guestBest,
			totalXp: guestXp,
			level: calculateLevel(guestXp),
			hintsAvailable: Math.max(3, guestHints),
			streakDays: guestStreak,
			lastPlayedAt: guestSolved > 0 ? new Date() : undefined
		});
	} else {
		const mergedXp = existing.totalXp + guestXp;
		const mergedBest =
			guestBest !== null && (existing.sudokuBestTimeSeconds === null || guestBest < existing.sudokuBestTimeSeconds)
				? guestBest
				: existing.sudokuBestTimeSeconds;

		await db.update(userStats).set({
			sudokuSolved: existing.sudokuSolved + guestSolved,
			sudokuPlayed: existing.sudokuPlayed + guestPlayed,
			sudokuBestTimeSeconds: mergedBest,
			totalXp: mergedXp,
			level: calculateLevel(mergedXp),
			hintsAvailable: existing.hintsAvailable + guestHints,
			streakDays: Math.max(existing.streakDays, guestStreak)
		}).where(eq(userStats.userId, userId));
	}

	// Merge achievements — insert only valid ones not already earned
	const validIds = new Set(ACHIEVEMENTS.map((a) => a.id));
	const toInsert = guestAchIds.filter((id) => validIds.has(id));
	if (toInsert.length > 0) {
		await db
			.insert(userAchievements)
			.values(toInsert.map((achievementId) => ({ userId, achievementId })))
			.onConflictDoNothing();
	}

	return json({ ok: true });
};

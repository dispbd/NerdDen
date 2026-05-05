/**
 * ELO rating calculation for competitive Sudoku.
 * Used in Phase 5 (competitive mode). Service is laid out here as groundwork.
 */

import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { userStats } from '$lib/server/db/schema';

const K_FACTOR = 32; // Standard K-factor for ELO

/**
 * Calculate the expected score (probability of winning) for player A
 * given ratings of both players.
 */
export function expectedScore(ratingA: number, ratingB: number): number {
	return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Calculate new ELO ratings after a match.
 * @returns [newRatingWinner, newRatingLoser]
 */
export function calculateEloChange(
	winnerRating: number,
	loserRating: number
): [number, number] {
	const expectedWin = expectedScore(winnerRating, loserRating);
	const expectedLose = expectedScore(loserRating, winnerRating);

	const newWinner = Math.round(winnerRating + K_FACTOR * (1 - expectedWin));
	const newLoser = Math.round(loserRating + K_FACTOR * (0 - expectedLose));

	return [newWinner, newLoser];
}

/**
 * Update ELO ratings in the database after a competitive match.
 * @param winnerId - user ID of the winner
 * @param loserId  - user ID of the loser
 */
export async function applyEloResult(
	winnerId: string,
	loserId: string
): Promise<{ winnerNewRating: number; loserNewRating: number }> {
	const [winnerStats, loserStats] = await Promise.all([
		db.query.userStats.findFirst({ where: eq(userStats.userId, winnerId) }),
		db.query.userStats.findFirst({ where: eq(userStats.userId, loserId) })
	]);

	const winnerRating = winnerStats?.eloRating ?? 1200;
	const loserRating = loserStats?.eloRating ?? 1200;

	const [winnerNewRating, loserNewRating] = calculateEloChange(winnerRating, loserRating);

	await Promise.all([
		db.update(userStats).set({ eloRating: winnerNewRating }).where(eq(userStats.userId, winnerId)),
		db.update(userStats).set({ eloRating: loserNewRating }).where(eq(userStats.userId, loserId))
	]);

	return { winnerNewRating, loserNewRating };
}

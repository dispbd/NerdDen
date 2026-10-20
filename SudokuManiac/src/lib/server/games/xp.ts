/**
 * Crediting XP from any game.
 *
 * A player gets a `user_stats` row on their first Sudoku solve, so a new account
 * that starts with another game has none — a bare UPDATE then credits nothing while
 * the UI shows "+XP". This upserts instead, and keeps `level` in step with the new
 * total, since the leaderboard reads the column.
 */

import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { userStats } from '$lib/server/db/schema';
import { calculateLevel } from '$lib/server/games/achievements/engine';

/** The database, or a transaction handle from `db.transaction`. */
export type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function creditXp(executor: Executor, userId: string, xp: number): Promise<void> {
	if (xp <= 0) return;
	await executor
		.insert(userStats)
		.values({ userId, totalXp: xp, level: calculateLevel(xp) })
		.onConflictDoUpdate({
			target: userStats.userId,
			set: {
				totalXp: sql`${userStats.totalXp} + ${xp}`,
				// Mirrors calculateLevel: floor(1 + sqrt(xp / 100)).
				level: sql`floor(1 + sqrt((${userStats.totalXp} + ${xp}) / 100.0))::int`
			}
		});
}

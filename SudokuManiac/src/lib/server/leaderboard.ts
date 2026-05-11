import { desc, eq, isNotNull, and } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { userStats, gameSessions } from '$lib/server/db/schema';
import { user } from '$lib/server/db/auth.schema';

/** Top N users by total XP */
export async function getXpLeaderboard(limit = 25) {
	return db
		.select({
			userId: userStats.userId,
			name: user.name,
			image: user.image,
			totalXp: userStats.totalXp,
			level: userStats.level,
			sudokuSolved: userStats.sudokuSolved,
			streakDays: userStats.streakDays
		})
		.from(userStats)
		.innerJoin(user, eq(userStats.userId, user.id))
		.orderBy(desc(userStats.totalXp))
		.limit(limit);
}

/** Top N users by best sudoku solve time */
export async function getSpeedLeaderboard(limit = 25) {
	return db
		.select({
			userId: userStats.userId,
			name: user.name,
			image: user.image,
			sudokuBestTimeSeconds: userStats.sudokuBestTimeSeconds,
			level: userStats.level,
			sudokuSolved: userStats.sudokuSolved
		})
		.from(userStats)
		.innerJoin(user, eq(userStats.userId, user.id))
		.where(isNotNull(userStats.sudokuBestTimeSeconds))
		.orderBy(userStats.sudokuBestTimeSeconds)
		.limit(limit);
}

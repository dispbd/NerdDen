import type { PageServerLoad } from './$types';
import { getActiveSessions } from '$lib/server/games/sudoku/sessions';
import { db } from '$lib/server/db';
import { userStats } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) return { activeSessions: [], isAuthenticated: false, stats: null };

	const [activeSessions, stats] = await Promise.all([
		getActiveSessions(locals.user.id),
		db.query.userStats.findFirst({ where: eq(userStats.userId, locals.user.id) })
	]);

	return {
		activeSessions,
		isAuthenticated: true,
		stats: stats
			? {
					solved: stats.sudokuSolved,
					bestTime: stats.sudokuBestTimeSeconds,
					streak: stats.streakDays
				}
			: null
	};
};

import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { userStats, gameSessions, userAchievements } from '$lib/server/db/schema';
import { user } from '$lib/server/db/auth.schema';
import { eq, desc, and } from 'drizzle-orm';
import { levelProgress } from '$lib/games/sudoku/level';
import { ACHIEVEMENTS } from '$lib/games/achievements/catalog';

/** Days covered by the activity heatmap (8 weeks). */
const HEATMAP_DAYS = 56;

/** Map a per-day solve count into one of 5 heatmap steps (0 = none … 4 = most). */
function heatLevel(count: number): number {
	if (count <= 0) return 0;
	if (count === 1) return 1;
	if (count <= 3) return 2;
	if (count <= 6) return 3;
	return 4;
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const targetUser = await db.query.user.findFirst({ where: eq(user.id, params.id) });
	if (!targetUser) error(404, 'User not found');

	const stats = await db.query.userStats.findFirst({ where: eq(userStats.userId, params.id) });

	const history = await db
		.select({
			id: gameSessions.id,
			difficulty: gameSessions.difficulty,
			status: gameSessions.status,
			timeSpent: gameSessions.timeSpent,
			hintsUsed: gameSessions.hintsUsed,
			createdAt: gameSessions.createdAt,
			completedAt: gameSessions.completedAt
		})
		.from(gameSessions)
		.where(eq(gameSessions.userId, params.id))
		.orderBy(desc(gameSessions.createdAt))
		.limit(20);

	// ─── Activity heatmap (real data) ───────────────────────────────────────────
	// Count completed games per day over the last 56 days, oldest → newest,
	// chunked into 8 weekly columns of 7 days for the grid.
	const completed = await db
		.select({
			completedAt: gameSessions.completedAt,
			hintsUsed: gameSessions.hintsUsed
		})
		.from(gameSessions)
		.where(and(eq(gameSessions.userId, params.id), eq(gameSessions.status, 'completed')));

	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const dayKey = (d: Date) => d.toISOString().slice(0, 10);
	const counts = new Map<string, number>();
	for (const row of completed) {
		if (!row.completedAt) continue;
		const k = dayKey(new Date(row.completedAt));
		counts.set(k, (counts.get(k) ?? 0) + 1);
	}

	const days: { level: number }[] = [];
	for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
		const d = new Date(today);
		d.setDate(d.getDate() - i);
		days.push({ level: heatLevel(counts.get(dayKey(d)) ?? 0) });
	}
	const heatmap: number[][] = [];
	for (let c = 0; c < 8; c++) {
		heatmap.push(days.slice(c * 7, c * 7 + 7).map((x) => x.level));
	}

	// ─── No-mistakes rate (approximation) ───────────────────────────────────────
	// The schema does not record mistakes; we approximate "clean" games as those
	// completed without spending any hints. TODO: track real mistake counts.
	const completedCount = completed.length;
	const cleanCount = completed.filter((c) => c.hintsUsed === 0).length;
	const noMistakesPct = completedCount > 0 ? Math.round((cleanCount / completedCount) * 100) : 0;

	// ─── Achievements (earned + locked) ─────────────────────────────────────────
	const earnedRows = await db
		.select({
			achievementId: userAchievements.achievementId,
			earnedAt: userAchievements.earnedAt
		})
		.from(userAchievements)
		.where(eq(userAchievements.userId, params.id));
	const earnedMap = new Map(earnedRows.map((r) => [r.achievementId, r.earnedAt]));

	const achievements = ACHIEVEMENTS.map((a) => ({
		id: a.id,
		title: a.title,
		description: a.description,
		icon: a.icon,
		earned: earnedMap.has(a.id),
		earnedAt: earnedMap.get(a.id)?.toISOString() ?? null
	})).sort((a, b) => Number(b.earned) - Number(a.earned));

	const totalXp = stats?.totalXp ?? 0;
	const progress = levelProgress(totalXp);
	const isOwn = locals.user?.id === params.id;

	return {
		profile: {
			id: targetUser.id,
			name: targetUser.name,
			email: isOwn ? targetUser.email : null,
			image: targetUser.image,
			createdAt: targetUser.createdAt
		},
		stats: stats
			? {
					sudokuSolved: stats.sudokuSolved,
					sudokuPlayed: stats.sudokuPlayed,
					sudokuBestTimeSeconds: stats.sudokuBestTimeSeconds,
					streakDays: stats.streakDays,
					noMistakesPct
				}
			: null,
		totalXp,
		progress,
		heatmap,
		achievements,
		history,
		isOwn
	};
};

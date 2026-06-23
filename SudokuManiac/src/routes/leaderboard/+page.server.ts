import type { PageServerLoad } from './$types';
import { getXpLeaderboard } from '$lib/server/leaderboard';
import { db } from '$lib/server/db';
import { userStats } from '$lib/server/db/schema';
import { gt } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

export interface LeaderRow {
	userId: string;
	rank: number;
	name: string;
	image: string | null;
	totalXp: number;
	level: number;
	sudokuSolved: number;
	me: boolean;
}

export const load: PageServerLoad = async ({ locals }) => {
	const meId = locals.user?.id ?? null;

	const rows = await getXpLeaderboard(25);
	const entries: LeaderRow[] = rows.map((r, i) => ({
		userId: r.userId,
		rank: i + 1,
		name: r.name,
		image: r.image ?? null,
		totalXp: r.totalXp,
		level: r.level,
		sudokuSolved: r.sudokuSolved,
		me: r.userId === meId
	}));

	// If the current player is outside the top 25, compute their real rank so their
	// row can still be shown (highlighted) at the bottom of the list.
	let meRow: LeaderRow | null = entries.find((e) => e.me) ?? null;
	if (meId && !meRow) {
		const mine = await db.query.userStats.findFirst({
			where: (s, { eq }) => eq(s.userId, meId)
		});
		if (mine) {
			const ahead = await db
				.select({ n: sql<number>`count(*)` })
				.from(userStats)
				.where(gt(userStats.totalXp, mine.totalXp));
			meRow = {
				userId: meId,
				rank: Number(ahead[0]?.n ?? 0) + 1,
				name: locals.user?.name ?? 'You',
				image: locals.user?.image ?? null,
				totalXp: mine.totalXp,
				level: mine.level,
				sudokuSolved: mine.sudokuSolved,
				me: true
			};
		}
	}

	return {
		podium: entries.slice(0, 3),
		list: entries,
		meRow,
		// True when meRow is not already part of the top-25 list (append separately)
		meOutside: !!meRow && !entries.some((e) => e.me)
	};
};

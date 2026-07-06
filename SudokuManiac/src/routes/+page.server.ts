/**
 * Home hub loader — assembles cross-game data for the signed-in player:
 * account level/XP, streak, Daily Den, per-game quick state, collectible
 * mascots (derived), and incoming friend challenges. Guests get a lighter
 * payload; the page fills the rest from localStorage (client-side).
 */
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import {
	userStats,
	gameSessions,
	crosswords,
	crosswordSessions,
	challenges
} from '$lib/server/db/schema';
import { user as userTable } from '$lib/server/db/auth.schema';
import { eq, and, or, desc, isNull, count } from 'drizzle-orm';
import { getUserDailyStatus } from '$lib/server/games/sudoku/daily';
import { levelProgress } from '$lib/games/sudoku/level';

/** Rotating Alias "topic of the day" — deterministic per calendar day. */
const ALIAS_TOPICS = ['Movies', 'Animals', 'Science', 'History', 'Music', 'Food', 'Sports', 'Travel'];

function dayOfYear(): number {
	const d = new Date();
	return Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86_400_000);
}

/** "4h 12m" until local midnight. */
function resetsIn(): string {
	const now = new Date();
	const midnight = new Date(now);
	midnight.setHours(24, 0, 0, 0);
	const ms = midnight.getTime() - now.getTime();
	return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
}

/** Incoming challenges/shares for the Home rail. Defensive: the table may not
 *  be migrated yet — return [] rather than 500 the whole page. */
async function incomingChallenges(uid: string) {
	try {
		return await db
			.select({
				id: challenges.id,
				kind: challenges.kind,
				gameType: challenges.gameType,
				label: challenges.label,
				fromName: userTable.name
			})
			.from(challenges)
			.innerJoin(userTable, eq(challenges.fromUserId, userTable.id))
			.where(or(eq(challenges.toUserId, uid), isNull(challenges.toUserId)))
			.orderBy(desc(challenges.createdAt))
			.limit(5);
	} catch {
		return [];
	}
}

export const load: PageServerLoad = async ({ locals }) => {
	const uid = locals.user?.id ?? null;
	const aliasTopic = ALIAS_TOPICS[dayOfYear() % ALIAS_TOPICS.length];

	if (!uid) {
		return { isAuthenticated: false, aliasTopic, resetsIn: resetsIn() };
	}

	const [stats, sudokuSession, cwCountRow, cwActive, cwSolvedRow, daily, challengeRows] =
		await Promise.all([
			db.query.userStats.findFirst({ where: eq(userStats.userId, uid) }),
			db.query.gameSessions.findFirst({
				where: and(
					eq(gameSessions.userId, uid),
					eq(gameSessions.status, 'in_progress'),
					eq(gameSessions.gameType, 'sudoku')
				),
				orderBy: desc(gameSessions.createdAt)
			}),
			db.select({ n: count() }).from(crosswords),
			db
				.select({ id: crosswordSessions.id, cwId: crosswords.id, title: crosswords.title })
				.from(crosswordSessions)
				.innerJoin(crosswords, eq(crosswordSessions.crosswordId, crosswords.id))
				.where(and(eq(crosswordSessions.userId, uid), eq(crosswordSessions.status, 'in_progress')))
				.orderBy(desc(crosswordSessions.createdAt))
				.limit(1),
			db
				.select({ n: count() })
				.from(crosswordSessions)
				.where(and(eq(crosswordSessions.userId, uid), eq(crosswordSessions.status, 'completed'))),
			getUserDailyStatus(uid).catch(() => null),
			incomingChallenges(uid)
		]);

	const totalXp = stats?.totalXp ?? 0;
	const progress = levelProgress(totalXp);
	const solved = stats?.sudokuSolved ?? 0;

	// Collectible mascots — derived from real progress (no dedicated table yet).
	const mascots = {
		maniac: solved > 0,
		owl: (cwSolvedRow[0]?.n ?? 0) > 0,
		hatter: false // TODO: track per-user Alias wins to unlock the Hatter
	};

	const sudokuDailyStatus = (daily?.progress?.status ?? 'not_started') as
		| 'not_started'
		| 'in_progress'
		| 'completed';
	const activeCrossword = cwActive[0] ?? null;
	const doneCount = sudokuDailyStatus === 'completed' ? 1 : 0;

	return {
		isAuthenticated: true,
		user: {
			name: locals.user!.name,
			level: progress.level,
			totalXp,
			ratio: progress.ratio,
			xpRemaining: progress.xpRemaining
		},
		streak: stats?.streakDays ?? 0,
		games: {
			sudoku: {
				hasContinue: !!sudokuSession,
				solved,
				bestTime: stats?.sudokuBestTimeSeconds ?? null
			},
			crossword: { libraryCount: cwCountRow[0]?.n ?? 0 }
		},
		daily: {
			doneCount,
			resetsIn: resetsIn(),
			sudoku: { status: sudokuDailyStatus, difficulty: daily?.task?.difficulty ?? 'medium' },
			crossword: activeCrossword
				? { id: activeCrossword.cwId, title: activeCrossword.title, active: true }
				: { id: null, title: null, active: false },
			alias: { topic: aliasTopic }
		},
		mascots: {
			...mascots,
			unlockedCount: [mascots.maniac, mascots.owl, mascots.hatter].filter(Boolean).length
		},
		challenges: challengeRows,
		aliasTopic,
		resetsIn: resetsIn()
	};
};

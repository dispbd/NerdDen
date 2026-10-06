/**
 * Nonogram service — generation ladder, library and play sessions.
 *
 * Generation (NONOGRAMS_PLAN.md §5): AI drawing for the requested topic → the curated
 * bank → the procedural generator. Never a 500 for lack of a puzzle: the curated bank
 * always has pictures in every size and difficulty (asserted in curated.test.ts).
 *
 * The solution grid stays on the server; play goes through `applySessionMoves`.
 */

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { nonograms, nonogramSessions, userStats } from '$lib/server/db/schema';
import { drawNonogram } from '$lib/server/ai/nonogram';
import { computeClues } from '$lib/games/nonogram/solver';
import {
	HINTS_PER_GAME,
	type ClientNonogram,
	type NonogramDifficulty,
	type NonogramLibraryItem,
	type NonogramSize,
	type NonogramSource,
	type PlayerGrid,
	type Reveal
} from '$lib/games/nonogram/types';
import { CURATED, rowsToGrid, type CuratedPicture } from './curated';
import {
	depthOf,
	gradeDifficulty,
	pickForDifficulty,
	prepareCandidate,
	repairWithReveals,
	type Puzzle
} from './pipeline';
import { generateProcedural } from './procedural';
import { applyMoves, pickHintCell, progressOf, type Move, type PlayStatus } from './play';

type Lang = 'en' | 'ru' | 'de' | 'es';
const asLang = (l: string): Lang => (['en', 'ru', 'de', 'es'].includes(l) ? (l as Lang) : 'en');

/** Total AI time across the first call and its single retry — well under maxDuration. */
const AI_TOTAL_MS = 40_000;
/** Don't start the retry with less than this left. */
const AI_RETRY_MIN_MS = 10_000;

const MYSTERY: Record<Lang, string> = {
	en: 'Mystery shape',
	ru: 'Загадочная фигура',
	de: 'Rätselform',
	es: 'Forma misteriosa'
};
const PALETTE = ['#3E5C76', '#B5462E', '#C29A45', '#5F7657', '#C2724F', '#322C24'];

const toRows = (grid: number[][]) => grid.map((r) => r.map((c) => (c ? '#' : '.')).join(''));
const pickColor = (key: string) => {
	let h = 0;
	for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
	return PALETTE[h % PALETTE.length];
};

// ─── Generation ──────────────────────────────────────────────────────────────

export interface GenerateInput {
	topic: string;
	size: NonogramSize;
	difficulty: NonogramDifficulty;
	language: string;
	userId: string | null;
}

/**
 * Why a requested topic wasn't drawn, so the UI can say so instead of silently
 * handing over a different picture: the drawing model was unreachable, or it drew
 * nothing usable.
 */
export type AiFallback = 'unavailable' | 'unusable';

export interface GenerateResult {
	id: string;
	source: NonogramSource;
	/** Set when a topic was requested but the puzzle came from the bank instead. */
	aiFallback: AiFallback | null;
}

export async function generateNonogram(input: GenerateInput): Promise<GenerateResult> {
	const lang = asLang(input.language);
	const topic = input.topic.trim().slice(0, 80);
	let aiFallback: AiFallback | null = null;

	if (topic) {
		const ai = await drawWithRetry(topic, input.size, input.difficulty, lang);
		if ('puzzle' in ai) {
			const id = await persist(ai.puzzle, {
				title: ai.title,
				topic,
				language: lang,
				source: 'ai',
				color: pickColor(topic)
			});
			return { id, source: 'ai', aiFallback: null };
		}
		aiFallback = ai.failure;
	}

	const curated = await pickCurated(input.size, input.difficulty, input.userId);
	if (curated) {
		const id = await persistOrReuse(curated.puzzle, {
			title: curated.picture.title[lang],
			topic,
			language: lang,
			source: 'curated',
			color: curated.picture.color
		});
		return { id, source: 'curated', aiFallback };
	}

	const proc = generateProcedural(input.size, input.difficulty, crypto.randomUUID());
	if (!proc) throw new Error('nonogram: no puzzle could be generated'); // the bank makes this unreachable
	const id = await persistOrReuse(proc, {
		title: MYSTERY[lang],
		topic,
		language: lang,
		source: 'procedural',
		color: pickColor(toRows(proc.grid).join(''))
	});
	return { id, source: 'procedural', aiFallback };
}

/**
 * One AI call, plus at most one retry when it yields no usable drawing — candidates
 * from a single response fail together (wrong size, wrong glyphs, truncation), so a
 * second response is the only real second chance. Both share one bounded budget.
 */
async function drawWithRetry(
	topic: string,
	size: number,
	difficulty: NonogramDifficulty,
	lang: Lang
): Promise<{ title: string; puzzle: Puzzle } | { failure: AiFallback }> {
	const deadline = Date.now() + AI_TOTAL_MS;
	for (let attempt = 0; attempt < 2; attempt++) {
		const remaining = deadline - Date.now();
		if (attempt > 0 && remaining < AI_RETRY_MIN_MS) break;
		const drawing = await drawNonogram(topic, size, lang, {
			deadlineMs: remaining,
			attemptMs: Math.min(remaining, 18_000)
		});
		if (!drawing) return { failure: 'unavailable' }; // no key / provider down → straight to the bank
		const valid: Puzzle[] = [];
		const reasons: string[] = [];
		for (const grid of drawing.grids) {
			const res = prepareCandidate(grid);
			if (res.ok) valid.push(res.puzzle);
			else reasons.push(res.reason);
		}
		const picked = pickForDifficulty(valid, difficulty);
		if (picked) return { title: drawing.title, puzzle: picked };
		console.warn(
			`[nonogram] attempt ${attempt + 1}: no usable drawing for "${topic}" (${drawing.grids.length} parsed; rejected: ${reasons.join(', ') || 'none'})`
		);
	}
	return { failure: 'unusable' };
}

interface GradedPicture {
	picture: CuratedPicture;
	puzzle: Puzzle;
}

let curatedCache: Map<number, GradedPicture[]> | null = null;

/** Clues, reveals and grade for every curated picture — computed once per process. */
function gradedCurated(): Map<number, GradedPicture[]> {
	if (curatedCache) return curatedCache;
	curatedCache = new Map();
	for (const [sizeKey, pictures] of Object.entries(CURATED)) {
		const size = Number(sizeKey);
		const graded: GradedPicture[] = [];
		for (const picture of pictures) {
			const grid = rowsToGrid(picture.rows);
			const { rowClues, colClues } = computeClues(grid);
			const repaired = repairWithReveals(grid, rowClues, colClues, 3);
			if (!repaired) continue; // curated.test.ts keeps this from happening
			const depth = depthOf(grid, rowClues, colClues, repaired.reveals);
			graded.push({
				picture,
				puzzle: {
					grid,
					rowClues,
					colClues,
					reveals: repaired.reveals,
					difficulty: gradeDifficulty(depth.rounds, size),
					stats: {
						depth: depth.rounds,
						firstRoundCoverage: depth.firstRoundCoverage,
						sweeps: repaired.result.sweeps,
						cellsChanged: 0
					}
				}
			});
		}
		curatedCache.set(size, graded);
	}
	return curatedCache;
}

/** A curated picture in the requested band, preferring ones this player hasn't seen. */
async function pickCurated(
	size: number,
	difficulty: NonogramDifficulty,
	userId: string | null
): Promise<GradedPicture | null> {
	const inBand = (gradedCurated().get(size) ?? []).filter(
		(g) => g.puzzle.difficulty === difficulty
	);
	if (!inBand.length) return null;

	let unseen = inBand;
	if (userId) {
		const played = await db
			.select({ grid: nonograms.grid })
			.from(nonogramSessions)
			.innerJoin(nonograms, eq(nonograms.id, nonogramSessions.nonogramId))
			.where(and(eq(nonogramSessions.userId, userId), eq(nonograms.source, 'curated')));
		const seen = new Set(played.map((p) => (p.grid as string[]).join('/')));
		const fresh = inBand.filter((g) => !seen.has(g.picture.rows.join('/')));
		if (fresh.length) unseen = fresh; // the band is exhausted → allow repeats
	}
	return unseen[Math.floor(Math.random() * unseen.length)];
}

interface Meta {
	title: string;
	topic: string;
	language: Lang;
	source: NonogramSource;
	color: string;
}

async function persist(puzzle: Puzzle, meta: Meta): Promise<string> {
	const [row] = await db
		.insert(nonograms)
		.values({
			title: meta.title,
			topic: meta.topic,
			language: meta.language,
			size: puzzle.grid.length,
			difficulty: puzzle.difficulty,
			grid: toRows(puzzle.grid),
			rowClues: puzzle.rowClues,
			colClues: puzzle.colClues,
			reveals: puzzle.reveals,
			source: meta.source,
			color: meta.color,
			solverStats: puzzle.stats
		})
		.returning({ id: nonograms.id });
	return row.id;
}

/** Curated and procedural pictures repeat — reuse the stored row instead of duplicating it. */
async function persistOrReuse(puzzle: Puzzle, meta: Meta): Promise<string> {
	const rows = toRows(puzzle.grid);
	const [existing] = await db
		.select({ id: nonograms.id })
		.from(nonograms)
		.where(
			and(
				eq(nonograms.source, meta.source),
				eq(nonograms.language, meta.language),
				sql`${nonograms.grid} = ${JSON.stringify(rows)}::jsonb`,
				sql`${nonograms.reveals} = ${JSON.stringify(puzzle.reveals)}::jsonb`
			)
		)
		.limit(1);
	return existing?.id ?? persist(puzzle, meta);
}

// ─── Reading ─────────────────────────────────────────────────────────────────

type NonogramRow = typeof nonograms.$inferSelect;

function toClient(row: NonogramRow): ClientNonogram {
	return {
		id: row.id,
		title: row.title,
		size: row.size as NonogramSize,
		difficulty: row.difficulty,
		source: row.source,
		color: row.color,
		rowClues: row.rowClues as number[][],
		colClues: row.colClues as number[][],
		reveals: row.reveals as Reveal[]
	};
}

export async function getClientNonogram(id: string): Promise<ClientNonogram | null> {
	const [row] = await db.select().from(nonograms).where(eq(nonograms.id, id));
	return row ? toClient(row) : null;
}

/** Recent puzzles, with this player's status. The picture is revealed only once solved. */
export async function listNonograms(
	userId: string | null,
	limit = 24
): Promise<NonogramLibraryItem[]> {
	const rows = await db.select().from(nonograms).orderBy(desc(nonograms.createdAt)).limit(limit);
	if (!rows.length) return [];

	const latest = new Map<string, typeof nonogramSessions.$inferSelect>();
	if (userId) {
		const sessions = await db
			.select()
			.from(nonogramSessions)
			.where(
				and(
					eq(nonogramSessions.userId, userId),
					inArray(
						nonogramSessions.nonogramId,
						rows.map((r) => r.id)
					)
				)
			)
			.orderBy(desc(nonogramSessions.createdAt));
		for (const s of sessions) if (!latest.has(s.nonogramId)) latest.set(s.nonogramId, s);
	}

	return rows.map((row) => {
		const s = latest.get(row.id);
		const solution = rowsToGrid(row.grid as string[]);
		return {
			id: row.id,
			title: row.title,
			size: row.size as NonogramSize,
			difficulty: row.difficulty,
			source: row.source,
			color: row.color,
			status: s ? s.status : 'new',
			progress: s ? progressOf(solution, row.reveals as Reveal[], s.playerGrid as PlayerGrid) : 0,
			solution: s?.status === 'completed' ? (row.grid as string[]) : null
		};
	});
}

// ─── Sessions ────────────────────────────────────────────────────────────────

export interface SessionView {
	id: string;
	nonogramId: string;
	status: PlayStatus;
	playerGrid: PlayerGrid;
	mistakes: number;
	hintsUsed: number;
	hintsLeft: number;
	timeSpent: number;
}

type SessionRow = typeof nonogramSessions.$inferSelect;

const view = (s: SessionRow): SessionView => ({
	id: s.id,
	nonogramId: s.nonogramId,
	status: s.status,
	playerGrid: s.playerGrid as PlayerGrid,
	mistakes: s.mistakes,
	hintsUsed: s.hintsUsed,
	hintsLeft: Math.max(0, HINTS_PER_GAME - s.hintsUsed),
	timeSpent: s.timeSpent
});

/**
 * Resume or start a session. Signed-in players resume their latest unfinished one;
 * guests resume by the session id their browser kept, if it belongs to this puzzle.
 */
export async function openSession(
	nonogramId: string,
	userId: string | null,
	resumeId: string | null
): Promise<SessionView | null> {
	const [puzzle] = await db
		.select({ id: nonograms.id })
		.from(nonograms)
		.where(eq(nonograms.id, nonogramId));
	if (!puzzle) return null;

	if (resumeId) {
		const [s] = await db.select().from(nonogramSessions).where(eq(nonogramSessions.id, resumeId));
		if (
			s &&
			s.nonogramId === nonogramId &&
			s.status === 'in_progress' &&
			(!s.userId || s.userId === userId)
		) {
			return view(s);
		}
	}
	if (userId) {
		const [s] = await db
			.select()
			.from(nonogramSessions)
			.where(
				and(
					eq(nonogramSessions.userId, userId),
					eq(nonogramSessions.nonogramId, nonogramId),
					eq(nonogramSessions.status, 'in_progress')
				)
			)
			.orderBy(desc(nonogramSessions.createdAt))
			.limit(1);
		if (s) return view(s);
	}
	const [created] = await db.insert(nonogramSessions).values({ nonogramId, userId }).returning();
	return view(created);
}

export type SessionError = 'not_found' | 'forbidden';

async function loadForPlay(sessionId: string, userId: string | null) {
	const [s] = await db.select().from(nonogramSessions).where(eq(nonogramSessions.id, sessionId));
	if (!s) return { error: 'not_found' as const };
	if (s.userId && s.userId !== userId) return { error: 'forbidden' as const };
	const [puzzle] = await db.select().from(nonograms).where(eq(nonograms.id, s.nonogramId));
	if (!puzzle) return { error: 'not_found' as const };
	return { session: s, puzzle, solution: rowsToGrid(puzzle.grid as string[]) };
}

/** XP for a solve: by size and grade. */
function xpFor(size: number, difficulty: NonogramDifficulty): number {
	const base = size <= 5 ? 10 : size <= 10 ? 25 : 45;
	const mult = difficulty === 'hard' ? 2 : difficulty === 'medium' ? 1.5 : 1;
	return Math.round(base * mult);
}

async function finishIfDone(
	before: SessionRow,
	status: PlayStatus,
	puzzle: NonogramRow
): Promise<number> {
	if (before.status === 'in_progress' && status === 'completed' && before.userId) {
		const xp = xpFor(puzzle.size, puzzle.difficulty);
		await db
			.update(userStats)
			.set({ totalXp: sql`${userStats.totalXp} + ${xp}` })
			.where(eq(userStats.userId, before.userId));
		return xp;
	}
	return 0;
}

export async function applySessionMoves(
	sessionId: string,
	userId: string | null,
	moves: Move[],
	timeSpent?: number
): Promise<
	| { error: SessionError }
	| {
			session: SessionView;
			wrong: { x: number; y: number }[];
			xpEarned: number;
			solution: string[] | null;
	  }
> {
	const loaded = await loadForPlay(sessionId, userId);
	if (loaded.error) return { error: loaded.error };
	const { session, puzzle, solution } = loaded;

	const out = applyMoves(
		solution,
		puzzle.reveals as Reveal[],
		{
			playerGrid: session.playerGrid as PlayerGrid,
			mistakes: session.mistakes,
			status: session.status
		},
		moves
	);
	const ended = out.status !== 'in_progress';
	const [updated] = await db
		.update(nonogramSessions)
		.set({
			playerGrid: out.playerGrid,
			mistakes: out.mistakes,
			status: out.status,
			...(timeSpent !== undefined
				? { timeSpent: Math.max(session.timeSpent, Math.floor(timeSpent)) }
				: {}),
			...(ended && session.status === 'in_progress' ? { completedAt: new Date() } : {})
		})
		.where(eq(nonogramSessions.id, sessionId))
		.returning();
	const xpEarned = await finishIfDone(session, out.status, puzzle);
	return {
		session: view(updated),
		wrong: out.wrong,
		xpEarned,
		// The picture is shown once the game is over — won or lost.
		solution: ended ? (puzzle.grid as string[]) : null
	};
}

export async function useSessionHint(
	sessionId: string,
	userId: string | null
): Promise<
	| { error: SessionError | 'no_hints' | 'not_in_progress' }
	| {
			session: SessionView;
			cell: { x: number; y: number } | null;
			xpEarned: number;
			solution: string[] | null;
	  }
> {
	const loaded = await loadForPlay(sessionId, userId);
	if (loaded.error) return { error: loaded.error };
	const { session, puzzle, solution } = loaded;
	if (session.status !== 'in_progress') return { error: 'not_in_progress' };
	if (session.hintsUsed >= HINTS_PER_GAME) return { error: 'no_hints' };

	const reveals = puzzle.reveals as Reveal[];
	const cell = pickHintCell(solution, reveals, session.playerGrid as PlayerGrid);
	const out = cell
		? applyMoves(
				solution,
				reveals,
				{
					playerGrid: session.playerGrid as PlayerGrid,
					mistakes: session.mistakes,
					status: session.status
				},
				[{ ...cell, action: 'fill' }]
			)
		: {
				playerGrid: session.playerGrid as PlayerGrid,
				mistakes: session.mistakes,
				status: session.status
			};
	const [updated] = await db
		.update(nonogramSessions)
		.set({
			playerGrid: out.playerGrid,
			status: out.status,
			hintsUsed: session.hintsUsed + 1,
			...(out.status !== 'in_progress' ? { completedAt: new Date() } : {})
		})
		.where(eq(nonogramSessions.id, sessionId))
		.returning();
	const xpEarned = await finishIfDone(session, out.status, puzzle);
	return {
		session: view(updated),
		cell,
		xpEarned,
		solution: out.status !== 'in_progress' ? (puzzle.grid as string[]) : null
	};
}

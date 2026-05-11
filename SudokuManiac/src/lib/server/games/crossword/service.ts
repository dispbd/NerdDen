/**
 * Crossword storage service — save, load, session management.
 */

import { and, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { crosswords, crosswordSessions } from '$lib/server/db/schema';
import { generateCrossword } from '$lib/server/games/crossword/generator';
import type { CrosswordClue, CrosswordGrid } from '$lib/games/crossword/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CrosswordRow {
	id: string;
	title: string;
	topic: string;
	language: string;
	difficulty: string;
	width: number;
	height: number;
	grid: CrosswordGrid;
	clues: CrosswordClue[];
	aiGenerated: boolean;
	createdAt: Date;
}

export interface CrosswordSessionRow {
	id: string;
	userId: string | null;
	crosswordId: string;
	status: 'in_progress' | 'completed' | 'abandoned';
	playerGrid: Record<string, string>;
	timeSpent: number;
	hintsUsed: number;
	createdAt: Date;
	completedAt: Date | null;
}

// ─── Crossword CRUD ───────────────────────────────────────────────────────────

/** Save a newly generated crossword to the DB and return its id */
export async function saveCrossword(
	data: Omit<CrosswordRow, 'id' | 'createdAt'>
): Promise<CrosswordRow> {
	const [row] = await db
		.insert(crosswords)
		.values({
			title: data.title,
			topic: data.topic,
			language: data.language,
			difficulty: data.difficulty as 'beginner' | 'easy' | 'medium' | 'hard' | 'expert' | 'extreme',
			width: data.width,
			height: data.height,
			grid: data.grid,
			clues: data.clues,
			aiGenerated: data.aiGenerated
		})
		.returning();

	return row as unknown as CrosswordRow;
}

/** Generate via AI (or fallback) and persist */
export async function createAndSaveCrossword(
	topic: string,
	language = 'en',
	difficulty = 'medium'
): Promise<CrosswordRow> {
	const generated = await generateCrossword(topic, language, difficulty);
	return saveCrossword({
		title: generated.title,
		topic: generated.topic,
		language: generated.language,
		difficulty: generated.difficulty,
		width: generated.width,
		height: generated.height,
		grid: generated.grid,
		clues: generated.clues,
		aiGenerated: true
	});
}

/** Fetch paginated list of crosswords */
export async function listCrosswords(
	opts: { topic?: string; language?: string; difficulty?: string; limit?: number; offset?: number } = {}
) {
	const { limit = 20, offset = 0 } = opts;

	const rows = await db
		.select({
			id: crosswords.id,
			title: crosswords.title,
			topic: crosswords.topic,
			language: crosswords.language,
			difficulty: crosswords.difficulty,
			width: crosswords.width,
			height: crosswords.height,
			aiGenerated: crosswords.aiGenerated,
			createdAt: crosswords.createdAt
		})
		.from(crosswords)
		.orderBy(desc(crosswords.createdAt))
		.limit(limit)
		.offset(offset);

	return rows;
}

/** Fetch a single crossword with full grid + clues */
export async function getCrossword(id: string): Promise<CrosswordRow | null> {
	const row = await db.query.crosswords.findFirst({
		where: eq(crosswords.id, id)
	});
	return row ? (row as unknown as CrosswordRow) : null;
}

// ─── Session management ───────────────────────────────────────────────────────

/** Get or create a crossword session for a user */
export async function getOrCreateSession(
	crosswordId: string,
	userId: string | null
): Promise<CrosswordSessionRow> {
	if (userId) {
		const existing = await db.query.crosswordSessions.findFirst({
			where: and(
				eq(crosswordSessions.crosswordId, crosswordId),
				eq(crosswordSessions.userId, userId)
			)
		});
		if (existing) return existing as unknown as CrosswordSessionRow;
	}

	const [session] = await db
		.insert(crosswordSessions)
		.values({ crosswordId, userId })
		.returning();

	return session as unknown as CrosswordSessionRow;
}

/** Save player progress */
export async function saveSessionProgress(
	sessionId: string,
	playerGrid: Record<string, string>,
	timeSpent: number
): Promise<void> {
	await db
		.update(crosswordSessions)
		.set({ playerGrid, timeSpent })
		.where(eq(crosswordSessions.id, sessionId));
}

/** Mark a session complete */
export async function completeSession(
	sessionId: string,
	playerGrid: Record<string, string>,
	timeSpent: number,
	hintsUsed: number
): Promise<void> {
	await db
		.update(crosswordSessions)
		.set({
			playerGrid,
			timeSpent,
			hintsUsed,
			status: 'completed',
			completedAt: new Date()
		})
		.where(eq(crosswordSessions.id, sessionId));
}

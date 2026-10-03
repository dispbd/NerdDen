/**
 * AI drawing for Nonograms.
 *
 * The model only draws: candidate silhouettes as rows of '#'/'.', plus a title.
 * Clues, uniqueness and difficulty are computed deterministically afterwards
 * (games/nonogram/pipeline.ts) — models are unreliable at both pixel art and
 * arithmetic, so nothing that must be correct is left to them.
 */

import { generateText } from 'ai';
import { hasAnyAiKey, parseJsonFromText, runAi, type AiBudget } from './provider';

const LANG_LABEL: Record<string, string> = {
	en: 'English',
	ru: 'Russian',
	de: 'German',
	es: 'Spanish'
};

/** Characters models use for a filled / an empty pixel. Anything else rejects the drawing. */
const FILLED = new Set(['#', '1', 'x', 'X', '*', '█', '■', '@']);
const EMPTY = new Set(['.', '0', '-', ' ', '_', '·', '□']);

/** How far a drawing may miss the requested size before it is rejected rather than fixed. */
const SIZE_TOLERANCE = 2;

/**
 * Model rows → an exactly size×size 0/1 grid, or null when the drawing is unusable.
 * Off-by-up-to-two rows/columns are padded or cropped (right and bottom); anything
 * further off, or any unknown character, rejects the drawing.
 */
export function normalizeDrawing(rows: unknown, size: number): number[][] | null {
	if (!Array.isArray(rows)) return null;
	const lines = rows.map((r) => String(r));
	if (Math.abs(lines.length - size) > SIZE_TOLERANCE) return null;

	const grid: number[][] = [];
	for (const line of lines.slice(0, size)) {
		let chars = [...line];
		// "# . # ." — characters separated by single spaces.
		if (chars.length >= 2 * size - 3 && chars.every((c, i) => i % 2 === 0 || c === ' ')) {
			chars = chars.filter((_, i) => i % 2 === 0);
		}
		if (Math.abs(chars.length - size) > SIZE_TOLERANCE) return null;
		const row: number[] = [];
		for (const c of chars.slice(0, size)) {
			if (FILLED.has(c)) row.push(1);
			else if (EMPTY.has(c)) row.push(0);
			else return null;
		}
		while (row.length < size) row.push(0);
		grid.push(row);
	}
	while (grid.length < size) grid.push(new Array<number>(size).fill(0));
	return grid;
}

export interface Drawing {
	title: string;
	/** Usable candidate grids, already normalized to size×size. */
	grids: number[][][];
}

function buildPrompt(topic: string, size: number, language: string, count: number): string {
	const lang = LANG_LABEL[language] ?? 'English';
	return `You draw pixel-art pictures for Picross (nonogram) puzzles.
Draw "${topic}" as ${count} different ${size}x${size} black-and-white silhouettes.
Rules:
- Each drawing is exactly ${size} rows, each exactly ${size} characters: '#' = filled, '.' = empty.
- Bold and simple: solid filled areas that read as the subject at a glance. Avoid one-pixel lines, isolated pixels and checkerboard texture.
- Fill roughly 35–60% of the cells. Keep at most a one-cell empty margin.
- Make the drawings genuinely different (pose, angle, or which part of the subject is shown).
Give the picture a short name in ${lang}.
Return ONLY a JSON object, no markdown, in exactly this shape:
{ "title": "...", "drawings": [ ["row 1", "row 2", "..."], ["..."] ] }`;
}

/**
 * Ask the model for candidate drawings. Returns null when no AI key is configured or
 * the call fails / times out — callers fall back to the curated bank, never a 500.
 */
export async function drawNonogram(
	topic: string,
	size: number,
	language: string,
	budget: AiBudget,
	count = 3
): Promise<Drawing | null> {
	if (!hasAnyAiKey()) return null;
	try {
		const { text } = await runAi(
			(model, call) =>
				generateText({
					model,
					prompt: buildPrompt(topic, size, language, count),
					// ~10 tokens per row per drawing plus JSON overhead; bounding it means a
					// truncated reply fails fast rather than silently losing every drawing.
					maxOutputTokens: Math.max(800, count * size * 16 + 300),
					...call
				}),
			budget
		);
		const data = parseJsonFromText(text) as { title?: unknown; drawings?: unknown };
		const drawings = Array.isArray(data.drawings) ? data.drawings : [];
		const grids = drawings
			.map((d) => normalizeDrawing(d, size))
			.filter((g): g is number[][] => g !== null);
		const title = typeof data.title === 'string' && data.title.trim() ? data.title.trim() : topic;
		return { title: title.slice(0, 60), grids };
	} catch (e) {
		console.error('[nonogram] AI drawing failed, falling back:', (e as Error)?.message ?? e);
		return null;
	}
}

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

/**
 * Output-token headroom for models that reason before answering. Kept modest on
 * purpose: Groq's free tier reserves the whole max_tokens against an 8,000
 * tokens-per-minute limit, so a large cap exhausts the minute in one call. Low
 * reasoning effort (below) keeps actual reasoning around 350 tokens.
 */
const REASONING_HEADROOM = 1500;

/**
 * Drawing doesn't need deep reasoning. Measured on Groq gpt-oss-120b for one 3×10×10
 * request: default effort 4,601 reasoning tokens / 10.5 s, low effort 346 / 1.5 s,
 * both producing valid drawings. Keyed per provider; other providers ignore the keys.
 */
const LOW_REASONING = {
	groq: { reasoningEffort: 'low' },
	openai: { reasoningEffort: 'low' }
} as const;

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
The goal: someone who sees only the finished silhouette should say "${topic}" straight away.
Rules:
- Each drawing is exactly ${size} rows, each exactly ${size} characters: '#' = filled, '.' = empty.
- Draw the subject large and centred, using most of the canvas. Keep at most a one-cell empty margin.
- Include the subject's most recognizable features in the outline — for an animal its ears, tail and legs; for an object its characteristic parts.
- Bold, solid filled areas. Avoid one-pixel lines, isolated pixels and checkerboard texture.
- Fill roughly 35–60% of the cells.
- Make the drawings genuinely different (pose, angle, or which part of the subject is shown).
Name the subject itself in ${lang}, in one to three words (for example "Cat", not "Cat silhouettes").
Return ONLY a JSON object, no markdown, in exactly this shape:
{ "title": "...", "drawings": [ ["row 1", "row 2", "..."], ["..."] ] }`;
}

/**
 * Ask the model for candidate drawings.
 *
 * - null: no AI key, or every provider failed / timed out. Retrying is pointless —
 *   callers go straight to the curated bank.
 * - `{ grids: [] }`: a reply came back but was unusable (garbled or truncated JSON).
 *   That is a property of one response, so it is worth the caller's single retry.
 */
export async function drawNonogram(
	topic: string,
	size: number,
	language: string,
	budget: AiBudget,
	count = 3
): Promise<Drawing | null> {
	if (!hasAnyAiKey()) return null;
	let text: string;
	try {
		({ text } = await runAi(
			(model, call) =>
				generateText({
					model,
					prompt: buildPrompt(topic, size, language, count),
					// ~10 tokens per drawing row plus JSON overhead, plus headroom for models
					// that reason first (their thinking counts against the same cap). Bounded,
					// so a runaway reply fails fast instead of running long.
					maxOutputTokens: Math.max(800, count * size * 16 + 300) + REASONING_HEADROOM,
					providerOptions: LOW_REASONING,
					...call
				}),
			budget
		));
	} catch (e) {
		console.error('[nonogram] AI drawing failed, falling back:', (e as Error)?.message ?? e);
		return null;
	}
	try {
		const data = parseJsonFromText(text) as { title?: unknown; drawings?: unknown };
		const drawings = Array.isArray(data.drawings) ? data.drawings : [];
		const grids = drawings
			.map((d) => normalizeDrawing(d, size))
			.filter((g): g is number[][] => g !== null);
		const title = typeof data.title === 'string' && data.title.trim() ? data.title.trim() : topic;
		return { title: title.slice(0, 60), grids };
	} catch (e) {
		console.warn(
			`[nonogram] unusable AI reply (${text.length} chars):`,
			(e as Error)?.message ?? e
		);
		return { title: topic, grids: [] };
	}
}

/**
 * Scoring for one hint. Everything except move extraction from free text is
 * deterministic and checked against the known solution.
 */
import { generateText, type LanguageModel } from 'ai';
import { LOW_REASONING } from '../../src/lib/server/ai/config.ts';
import { z } from 'zod';
import { parseJsonFromText } from '../../src/lib/server/ai/json.ts';
import type { HintCase } from './types.ts';
import type { HintPrompt } from './prompts.ts';
import { labelledBoard } from './sudoku.ts';

const Cell = z.object({
	row: z.coerce.number().int().min(1).max(9),
	col: z.coerce.number().int().min(1).max(9),
	digit: z.coerce.number().int().min(1).max(9)
});
type CellMove = z.infer<typeof Cell>;

export const V2Answer = Cell.extend({ technique: z.string().optional(), explanation: z.string() });

export interface Scores {
	/** v2: the reply is valid JSON in the requested shape */
	parsed?: boolean;
	/** the hint names a concrete cell and digit */
	specific: boolean;
	/** that digit is right for that (empty) cell */
	correct: boolean;
	/** and it follows by a single from the current board */
	logical: boolean;
	/** reveals at most one digit for an empty cell */
	oneDigit: boolean;
	/** v3: the move the model explains is the one the solver gave */
	faithful?: boolean;
	/** 2-4 sentences, as the prompt asks */
	brief: boolean;
}

export interface Extraction {
	moves: CellMove[];
	extractorText?: string;
	extractorError?: string;
}

/** v2 answers are parsed directly; free-text hints go through an extractor model. */
export async function extractMoves(
	c: HintCase,
	p: HintPrompt,
	text: string,
	extractor: LanguageModel
): Promise<Extraction & { explanation: string; parsed?: boolean }> {
	if (p.structured) {
		try {
			const a = V2Answer.parse(parseJsonFromText(text));
			return { moves: [{ row: a.row, col: a.col, digit: a.digit }], explanation: a.explanation, parsed: true };
		} catch {
			return { moves: [], explanation: text, parsed: false };
		}
	}

	const prompt = `You read a hint a Sudoku tutor gave for this board. Rows r1–r9 top to bottom, columns c1–c9 left to right, boxes 1–9 left to right, top to bottom.

${labelledBoard(c.playerGrid)}

Hint:
"""
${text}
"""

List every digit the hint tells the player to place in an EMPTY cell (".") — explicitly or by clearly implying it ("the only spot for 7 in row 3 is column 5"). Do not list digits that are already on the board and are only mentioned as reasons. If the hint never pins down both a cell and a digit, return an empty list. Translate any cell description (e.g. "top-left box, middle row") into row and column numbers.
Return ONLY JSON: { "moves": [ { "row": 1-9, "col": 1-9, "digit": 1-9 } ] }`;

	// API errors propagate, so the caller's throttle can retry them; only a bad reply is caught.
	const res = await generateText({
		model: extractor,
		prompt,
		temperature: 0,
		maxOutputTokens: 1200,
		providerOptions: LOW_REASONING,
		maxRetries: 0,
		abortSignal: AbortSignal.timeout(60_000)
	});
	try {
		const data = z.object({ moves: z.array(Cell) }).parse(parseJsonFromText(res.text));
		return { moves: data.moves, explanation: text, extractorText: res.text };
	} catch (e) {
		return { moves: [], explanation: text, extractorText: res.text, extractorError: (e as Error).message };
	}
}

export function score(c: HintCase, p: HintPrompt, ex: { moves: CellMove[]; explanation: string; parsed?: boolean }): Scores {
	const placements = ex.moves.filter((m) => c.playerGrid[m.row - 1][m.col - 1] === 0);
	const first = placements[0];
	const correct = !!first && c.solution[first.row - 1][first.col - 1] === first.digit;
	const logical =
		!!first && c.singles.some((s) => s.row === first.row && s.col === first.col && s.digit === first.digit);
	const sentences = ex.explanation
		.replace(/\b(r\d|c\d|e\.g|i\.e)\./gi, '$1')
		.split(/(?<=[.!?])\s+/)
		.filter((s) => s.trim().length > 2).length;

	const out: Scores = {
		specific: !!first,
		correct,
		logical,
		oneDigit: new Set(placements.map((m) => `${m.row},${m.col}`)).size <= 1,
		brief: sentences >= 1 && sentences <= 4
	};
	if (p.structured) out.parsed = !!ex.parsed;
	if (p.given) out.faithful = !!first && first.row === p.given.row && first.col === p.given.col && first.digit === p.given.digit;
	return out;
}

/**
 * Prompt versions under comparison.
 *
 * v1  production prompt (src/lib/server/ai/prompts/hints.ts): free text.
 * v2  labelled board + structured JSON answer (row, col, digit, technique, explanation).
 * v3  the solver finds the move; the model only explains it. Same idea as nonogram.ts:
 *     nothing that must be correct is left to the model.
 * v4  v3 plus the solver's argument (proof.ts): which cells are ruled out and by which
 *     digit where. v3 left the reasons to the model, and gpt-oss-120b invented them.
 */
import { moveProof } from './proof.ts';
import { buildHintPrompt } from '../../src/lib/server/ai/prompts/hints.ts';
import type { HintCase } from './types.ts';
import { describeMove, labelledBoard, type Move } from './sudoku.ts';

export type PromptVersion = 'v1' | 'v2' | 'v3' | 'v4';

export interface HintPrompt {
	prompt: string;
	/** v2 answers in JSON */
	structured: boolean;
	/** v3: the move the solver chose */
	given?: Move;
}

const CONVENTIONS = `Rows r1–r9 go top to bottom, columns c1–c9 left to right. Boxes 1–9 are numbered left to right, top to bottom (box 1 is top-left, box 9 bottom-right). "." is an empty cell.`;

/** The move v3 hands to the model: the first single, hidden-in-box first (findSingles order). */
export const pickMove = (c: HintCase): Move => c.singles[0];

export function buildPrompt(version: PromptVersion, c: HintCase): HintPrompt {
	switch (version) {
		case 'v1':
			return { prompt: buildHintPrompt(c.puzzle, c.playerGrid), structured: false };

		case 'v2':
			return {
				structured: true,
				prompt: `You are a Sudoku tutor. ${CONVENTIONS}

${labelledBoard(c.playerGrid)}

Find ONE next move that follows by pure logic from the board as it is now (a naked single or a hidden single), and explain it to the player.
Reveal only that one digit.
Return ONLY a JSON object, no markdown, in exactly this shape:
{ "row": 1-9, "col": 1-9, "digit": 1-9, "technique": "naked single" | "hidden single in row" | "hidden single in column" | "hidden single in box", "explanation": "2-4 sentences: which row/column/box to look at and why only this digit fits" }`
			};

		case 'v4': {
			const move = pickMove(c);
			return {
				structured: false,
				given: move,
				prompt: `You are a Sudoku tutor. ${CONVENTIONS}

${labelledBoard(c.playerGrid)}

The next move, found by a solver: ${describeMove(move)}.
Why it is forced (computed from the board, all true):
${moveProof(c.playerGrid, move)
	.map((f) => `- ${f}`)
	.join('\n')}

Explain this move to the player in 2-4 sentences, using only the facts above: point to where to look and what rules out the other options.
Do not state anything about the board that is not in the list. Name cells as "row R, column C". Do NOT reveal any other digit.`
			};
		}

		case 'v3': {
			const move = pickMove(c);
			return {
				structured: false,
				given: move,
				prompt: `You are a Sudoku tutor. ${CONVENTIONS}

${labelledBoard(c.playerGrid)}

The next move, found by a solver: ${describeMove(move)}.
Explain this move to the player in 2-4 sentences: point to the row/column/box to look at and why only this digit fits there.
Name the cell as "row R, column C". Do NOT reveal any other digit.`
			};
		}
	}
}

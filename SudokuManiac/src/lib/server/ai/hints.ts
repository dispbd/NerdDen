/**
 * AI hint service — generates a step-by-step hint explanation for the current
 * board state using the Vercel AI SDK (provider chosen and failed over by runAi).
 */

import { generateText } from 'ai';
import { runAi } from './provider';
import type { Grid } from '$lib/server/games/sudoku/generator';

function buildPrompt(puzzle: Grid, playerGrid: Grid): string {
	const rows = playerGrid
		.map((row, r) =>
			row
				.map((cell, c) => {
					if (puzzle[r][c] !== 0) return cell.toString(); // given
					return cell === 0 ? '.' : cell.toString(); // player-filled or empty
				})
				.join(' ')
		)
		.join('\n');

	return `You are a Sudoku tutor. Here is the current board state (. = empty, numbers = filled):

${rows}

Analyze the board and provide the next logical move using a concise step-by-step explanation (2-4 sentences max). 
Point out which row/column/box to focus on and why. Do NOT reveal more than one digit.`;
}

/**
 * Ask the AI tutor for a hint. Throws when no provider produces a complete answer —
 * callers must not charge the player in that case.
 */
export async function getAiHint(puzzle: Grid, playerGrid: Grid): Promise<string> {
	const { text } = await runAi(
		async (model, call) => {
			const res = await generateText({
				model,
				prompt: buildPrompt(puzzle, playerGrid),
				// Analysing a board is reasoning-heavy even at low effort: measured 397–936
				// reasoning tokens for the same board, which share this cap with the answer.
				// At 150 the hint came back empty; at 1000 one in three was cut mid-sentence.
				maxOutputTokens: 2500,
				...call
			});
			// A truncated or empty answer is a failure of this provider, so throw and let
			// runAi fail over rather than show the player half a sentence.
			if (!res.text.trim() || res.finishReason === 'length') {
				throw new Error(`incomplete hint (finish=${res.finishReason}, ${res.text.length} chars)`);
			}
			return res;
		},
		// The player is waiting on a button press, but leave room to fail over once.
		{ deadlineMs: 15_000, attemptMs: 8_000 }
	);

	return text.trim();
}

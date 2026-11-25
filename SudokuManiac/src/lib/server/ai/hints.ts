/**
 * AI hint service — generates a step-by-step hint explanation for the current
 * board state using the Vercel AI SDK (provider chosen and failed over by runAi).
 */

import { generateText } from 'ai';
import { runAi } from './provider';
import type { Grid } from '$lib/server/games/sudoku/generator';
import { buildHintPrompt, HINT_MAX_OUTPUT_TOKENS } from './prompts/hints';

/**
 * Ask the AI tutor for a hint. Throws when no provider produces a complete answer —
 * callers must not charge the player in that case.
 */
export async function getAiHint(puzzle: Grid, playerGrid: Grid): Promise<string> {
	const { text } = await runAi(
		async (model, call) => {
			const res = await generateText({
				model,
				prompt: buildHintPrompt(puzzle, playerGrid),
				// See HINT_MAX_OUTPUT_TOKENS: reasoning shares this cap with the answer.
				maxOutputTokens: HINT_MAX_OUTPUT_TOKENS,
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

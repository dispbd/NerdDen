/**
 * Prompt for the AI Sudoku tutor. Pure module (no `$env`), so the offline evals
 * (evals/hints) run exactly the prompt production sends.
 */
import type { Grid } from '$lib/games/sudoku/shared';

/**
 * Analysing a board is reasoning-heavy even at low effort: measured 397–936
 * reasoning tokens for the same board, which share this cap with the answer.
 * At 150 the hint came back empty; at 1000 one in three was cut mid-sentence.
 */
export const HINT_MAX_OUTPUT_TOKENS = 2500;

export function buildHintPrompt(puzzle: Grid, playerGrid: Grid): string {
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

/**
 * AI hint service — generates a step-by-step hint explanation for the current
 * board state using the Vercel AI SDK + OpenAI.
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

export async function getAiHint(puzzle: Grid, playerGrid: Grid): Promise<string> {
	const { text } = await runAi((model) =>
		generateText({ model, prompt: buildPrompt(puzzle, playerGrid), maxOutputTokens: 150 })
	);

	return text.trim();
}

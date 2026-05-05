/**
 * AI hint service — generates a step-by-step hint explanation for the current
 * board state using the Vercel AI SDK + OpenAI.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { env } from '$env/dynamic/private';
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
	const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });

	const { text } = await generateText({
		model: openai('gpt-4o-mini'),
		prompt: buildPrompt(puzzle, playerGrid),
		maxTokens: 150
	});

	return text.trim();
}

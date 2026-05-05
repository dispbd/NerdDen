import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generatePuzzle } from '$lib/server/games/sudoku/generator';
import type { Difficulty, GridSize } from '$lib/server/games/sudoku/generator';

/** GET /api/sudoku/generate?difficulty=medium&gridSize=9 */
export const GET: RequestHandler = async ({ url }) => {
	const difficulty = (url.searchParams.get('difficulty') ?? 'medium') as Difficulty;
	const gridSize = Number(url.searchParams.get('gridSize') ?? 9) as GridSize;

	const { puzzle, solution } = generatePuzzle(difficulty, gridSize);
	return json({ puzzle, solution });
};

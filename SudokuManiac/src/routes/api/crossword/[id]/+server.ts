import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCrossword } from '$lib/server/games/crossword/service';

/** GET /api/crossword/[id] — fetch puzzle (grid + clues, no answer leak) */
export const GET: RequestHandler = async ({ params }) => {
	const crossword = await getCrossword(params.id);
	if (!crossword) throw error(404, 'Crossword not found');

	// Strip answer letters from the grid before sending to client
	const publicGrid = crossword.grid.map((row) => row.map((cell) => (cell === '#' ? '#' : '')));

	// Strip answer letters from clues
	const publicClues = crossword.clues.map(({ answer: _answer, ...rest }) => rest);

	return json({
		id: crossword.id,
		title: crossword.title,
		topic: crossword.topic,
		language: crossword.language,
		difficulty: crossword.difficulty,
		width: crossword.width,
		height: crossword.height,
		grid: publicGrid,
		clues: publicClues
	});
};

import { getCrossword } from '$lib/server/games/crossword/service';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const crossword = await getCrossword(params.id);
	if (!crossword) throw error(404, 'Crossword not found');

	// Strip answers before sending to client
	const publicGrid = crossword.grid.map((row) => row.map((cell) => (cell === '#' ? '#' : '')));
	const publicClues = crossword.clues.map(({ answer: _, ...rest }) => rest);

	return {
		id: crossword.id,
		title: crossword.title,
		topic: crossword.topic,
		language: crossword.language,
		difficulty: crossword.difficulty,
		width: crossword.width,
		height: crossword.height,
		grid: publicGrid,
		clues: publicClues
	};
};

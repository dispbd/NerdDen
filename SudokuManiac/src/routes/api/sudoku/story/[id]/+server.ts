import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { startStoryPuzzle, completeStoryPuzzle } from '$lib/server/games/sudoku/story';

/**
 * GET /api/sudoku/story/[id] — start or resume a story puzzle.
 * Returns puzzle + solution (solution needed client-side for PixiJS validation;
 * this is single-player so there's no cheating concern).
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const data = await startStoryPuzzle(locals.user.id, params.id);
	if (!data) return json({ error: 'Puzzle not found' }, { status: 404 });

	return json(data);
};

/** POST /api/sudoku/story/[id] — mark puzzle as completed */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const { timeSpent, hintsUsed } = await request.json();

	const result = await completeStoryPuzzle({
		userId: locals.user.id,
		puzzleId: params.id,
		timeSpent: timeSpent ?? 0,
		hintsUsed: hintsUsed ?? 0
	});

	if (!result) return json({ error: 'Puzzle not found or not started' }, { status: 404 });
	return json(result);
};

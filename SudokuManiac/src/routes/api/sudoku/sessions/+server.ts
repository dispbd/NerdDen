import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createGameSession, getActiveSession } from '$lib/server/games/sudoku/sessions';
import type { Grid, Difficulty } from '$lib/server/games/sudoku';

/** GET /api/sudoku/sessions — returns the active in-progress session for the signed-in user */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json(null);
	const session = await getActiveSession(locals.user.id);
	return json(session ?? null);
};

/** POST /api/sudoku/sessions — create a new game session */
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = await request.json();
	const { difficulty, gridState, solution, gridSize } = body as {
		difficulty: Difficulty;
		gridState: Grid;
		solution: Grid;
		gridSize?: number;
	};

	if (!difficulty || !gridState || !solution) {
		return json({ error: 'Missing required fields' }, { status: 400 });
	}

	const session = await createGameSession({
		userId: locals.user?.id ?? null,
		difficulty,
		gridState,
		solution,
		gridSize
	});
	return json(session, { status: 201 });
};

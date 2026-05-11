import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { spendHint } from '$lib/server/games/sudoku/sessions';

/** POST /api/sudoku/hints — spend one hint */
export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const remaining = await spendHint(locals.user.id);
	if (remaining === null) return json({ error: 'No hints available' }, { status: 400 });

	return json({ hintsAvailable: remaining });
};

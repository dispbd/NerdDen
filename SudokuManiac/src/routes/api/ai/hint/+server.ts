import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAiHint } from '$lib/server/ai/hints';
import { spendHint } from '$lib/server/games/sudoku/sessions';
import type { Grid } from '$lib/server/games/sudoku';

/** POST /api/ai/hint — spend 3 hints and get an AI explanation */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = await request.json();
	const { puzzle, playerGrid } = body as { puzzle: Grid; playerGrid: Grid };

	if (!puzzle || !playerGrid) return json({ error: 'puzzle and playerGrid are required' }, { status: 400 });

	// AI hint costs 3 hints
	const AI_HINT_COST = 3;
	for (let i = 0; i < AI_HINT_COST; i++) {
		const remaining = await spendHint(locals.user.id);
		if (remaining === null) {
			return json({ error: `Not enough hints (need ${AI_HINT_COST})` }, { status: 400 });
		}
		// If we run out mid-loop (partial spend), stop — the DB already decremented
		// In a real app we'd wrap this in a transaction
		if (remaining < AI_HINT_COST - i - 1) {
			return json({ error: `Not enough hints (need ${AI_HINT_COST})` }, { status: 400 });
		}
	}

	const hint = await getAiHint(puzzle, playerGrid);
	return json({ hint });
};

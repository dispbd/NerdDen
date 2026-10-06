import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAiHint } from '$lib/server/ai/hints';
import { refundHints, spendHint } from '$lib/server/games/sudoku/sessions';
import type { Grid } from '$lib/server/games/sudoku';

/** POST /api/ai/hint — spend 3 hints and get an AI explanation */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = await request.json();
	const { puzzle, playerGrid } = body as { puzzle: Grid; playerGrid: Grid };

	if (!puzzle || !playerGrid)
		return json({ error: 'puzzle and playerGrid are required' }, { status: 400 });

	// AI hint costs 3 hints
	const AI_HINT_COST = 3;
	const userId = locals.user.id;
	let spent = 0;
	for (let i = 0; i < AI_HINT_COST; i++) {
		const remaining = await spendHint(userId);
		if (remaining === null) {
			await refundHints(userId, spent);
			return json({ error: `Not enough hints (need ${AI_HINT_COST})` }, { status: 400 });
		}
		spent++;
		// Ran short mid-way: give back what this request already took.
		// (Still not atomic — a transaction would be the full fix.)
		if (remaining < AI_HINT_COST - i - 1) {
			await refundHints(userId, spent);
			return json({ error: `Not enough hints (need ${AI_HINT_COST})` }, { status: 400 });
		}
	}

	try {
		const hint = await getAiHint(puzzle, playerGrid);
		return json({ hint });
	} catch (e) {
		// Previously the hints were already spent and the player got a bare 500.
		await refundHints(userId, spent);
		console.error('[ai/hint] tutor unavailable, hints refunded:', (e as Error)?.message ?? e);
		return json(
			{ error: 'The AI tutor is unavailable right now — your hints were not spent.' },
			{ status: 503 }
		);
	}
};

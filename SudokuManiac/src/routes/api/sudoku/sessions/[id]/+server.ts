import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	saveGameSession,
	completeGameSession,
	abandonGameSession,
	type Difficulty
} from '$lib/server/games/sudoku/sessions';
import type { Grid } from '$lib/server/games/sudoku';

/** PATCH /api/sudoku/sessions/[id] — save progress or mark as completed/abandoned */
export const PATCH: RequestHandler = async ({ request, params, locals }) => {
	const body = await request.json();
	const { action, gridState, timeSpent, hintsUsed, difficulty } = body as {
		action?: 'complete' | 'abandon';
		gridState?: Grid;
		timeSpent: number;
		hintsUsed?: number;
		difficulty?: Difficulty;
	};

	const userId = locals.user?.id ?? null;

	if (action === 'complete') {
		const result = await completeGameSession({
			id: params.id,
			userId,
			timeSpent,
			hintsUsed: hintsUsed ?? 0,
			difficulty: difficulty ?? 'medium'
		});
		return json(result);
	}

	if (action === 'abandon') {
		await abandonGameSession(params.id, userId);
		return json({ ok: true });
	}

	// default: save progress
	if (!gridState) return json({ error: 'gridState is required for save' }, { status: 400 });

	const updated = await saveGameSession({
		id: params.id,
		userId,
		gridState,
		timeSpent,
		hintsUsed: hintsUsed ?? 0
	});
	return json(updated);
};

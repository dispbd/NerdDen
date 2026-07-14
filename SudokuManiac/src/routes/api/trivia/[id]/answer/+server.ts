/** POST /api/trivia/[id]/answer — grade one answer and advance the session. */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { submitAnswer } from '$lib/server/games/trivia/service';

export const POST: RequestHandler = async ({ params, request }) => {
	const body = (await request.json().catch(() => ({}))) as {
		index?: number;
		chosen?: number;
		msLeft?: number;
	};

	const index = Number(body.index);
	const chosen = Number(body.chosen);
	const msLeft = Number(body.msLeft);
	if (!Number.isInteger(index) || index < 0) throw error(400, 'invalid index');
	// -1 = timed out with no selection (always graded wrong); 0–3 = a chosen option.
	if (!Number.isInteger(chosen) || chosen < -1 || chosen > 3) throw error(400, 'invalid chosen');

	const result = await submitAnswer(params.id, index, chosen, Number.isFinite(msLeft) ? msLeft : 0);
	if ('error' in result) {
		if (result.error === 'not_found') throw error(404, 'session not found');
		if (result.error === 'out_of_order') throw error(409, 'question already answered');
		throw error(400, result.error);
	}

	return json(result);
};

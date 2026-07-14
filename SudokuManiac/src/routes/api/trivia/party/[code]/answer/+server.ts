/** POST /api/trivia/party/[code]/answer — grade the current-question answer. */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { submitPartyAnswer } from '$lib/server/games/trivia/party';

export const POST: RequestHandler = async ({ params, request }) => {
	const body = (await request.json().catch(() => ({}))) as {
		token?: string;
		index?: number;
		chosen?: number;
		msLeft?: number;
	};
	const token = typeof body.token === 'string' && body.token ? body.token : null;
	if (!token) throw error(400, 'token is required');
	const index = Number(body.index);
	const chosen = Number(body.chosen);
	const msLeft = Number(body.msLeft);
	if (!Number.isInteger(index) || index < 0) throw error(400, 'invalid index');
	if (!Number.isInteger(chosen) || chosen < -1 || chosen > 3) throw error(400, 'invalid chosen');

	const res = await submitPartyAnswer(
		params.code.toUpperCase(),
		token,
		index,
		chosen,
		Number.isFinite(msLeft) ? msLeft : 0
	);
	if ('error' in res) {
		if (res.error === 'not_found') throw error(404, 'party not found');
		if (res.error === 'already_answered') throw error(409, 'already answered');
		throw error(400, res.error);
	}
	return json(res);
};

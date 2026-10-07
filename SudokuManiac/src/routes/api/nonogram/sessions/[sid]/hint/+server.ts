/** POST /api/nonogram/sessions/[sid]/hint — fill one correct cell, if charges remain. */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { useSessionHint } from '$lib/server/games/nonogram/service';

export const POST: RequestHandler = async ({ params, locals }) => {
	const res = await useSessionHint(params.sid, locals.user?.id ?? null);
	if ('error' in res) {
		const status = res.error === 'forbidden' ? 403 : res.error === 'not_found' ? 404 : 409;
		throw error(status, res.error);
	}
	return json(res);
};

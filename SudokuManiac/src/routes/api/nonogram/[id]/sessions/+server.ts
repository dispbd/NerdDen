/** POST /api/nonogram/[id]/sessions — resume or start a play session. Body: `{ resumeId? }`. */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { openSession } from '$lib/server/games/nonogram/service';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const body = (await request.json().catch(() => ({}))) as { resumeId?: unknown };
	const resumeId = typeof body.resumeId === 'string' ? body.resumeId : null;
	const session = await openSession(params.id, locals.user?.id ?? null, resumeId);
	if (!session) throw error(404, 'Nonogram not found');
	return json(session);
};

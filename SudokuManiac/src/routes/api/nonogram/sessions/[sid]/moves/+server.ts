/**
 * POST /api/nonogram/sessions/[sid]/moves — apply moves; fills are judged here.
 * Body: `{ moves: { x, y, action: 'fill' | 'mark' | 'clear' }[], timeSpent? }`.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { applySessionMoves } from '$lib/server/games/nonogram/service';
import type { Move } from '$lib/server/games/nonogram/play';

const ACTIONS = new Set(['fill', 'mark', 'clear']);
const MAX_MOVES = 256; // a full 15×15 drag is 225 cells

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const body = (await request.json().catch(() => ({}))) as { moves?: unknown; timeSpent?: unknown };
	if (!Array.isArray(body.moves) || body.moves.length > MAX_MOVES)
		throw error(400, 'invalid moves');
	const moves: Move[] = [];
	for (const m of body.moves as Record<string, unknown>[]) {
		if (!m || !ACTIONS.has(String(m.action))) throw error(400, 'invalid move');
		moves.push({ x: Number(m.x), y: Number(m.y), action: m.action as Move['action'] });
	}
	const timeSpent = Number.isFinite(Number(body.timeSpent)) ? Number(body.timeSpent) : undefined;

	const res = await applySessionMoves(params.sid, locals.user?.id ?? null, moves, timeSpent);
	if ('error' in res) throw error(res.error === 'forbidden' ? 403 : 404, res.error);
	return json(res);
};

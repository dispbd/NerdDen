/**
 * POST /api/competitive/rooms/[id]/start
 * Host starts the game — generates the puzzle and broadcasts to all players.
 */

import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { getRoom, startRoom } from '$lib/server/competitive/store';
import { broadcast } from '$lib/server/competitive/sse';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const room = getRoom(params.id);
	if (!room) error(404, 'Room not found');

	const playerId = locals.user?.id ?? request.headers.get('x-player-id');
	if (!playerId) error(400, 'Player ID required');

	const result = startRoom(room, playerId);
	if (result && 'error' in result) error(400, result.error);

	broadcast(params.id, 'game_started', {
		type: 'game_started',
		puzzle: room.puzzle,
		startedAt: new Date().toISOString()
	});

	return json({ ok: true });
};

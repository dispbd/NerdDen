/**
 * POST /api/competitive/rooms/[id]/progress
 * Player sends their current grid state and selected cell.
 * Broadcast to all other players in the room via SSE.
 */

import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { getRoom, updateProgress, toPlayerInfo } from '$lib/server/competitive/store';
import { broadcast } from '$lib/server/competitive/sse';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const room = getRoom(params.id);
	if (!room) error(404, 'Room not found');
	if (room.status !== 'in_progress') return json({ ok: true }); // silently ignore if not started

	const playerId = locals.user?.id ?? request.headers.get('x-player-id');
	if (!playerId) error(400, 'Player ID required');
	if (!room.players.has(playerId)) error(403, 'Not a participant');

	const body = await request.json();
	const { gridState, selectedRow = -1, selectedCol = -1, hintsUsed = 0 } = body;

	updateProgress(room, playerId, gridState ?? [], selectedRow, selectedCol, hintsUsed);

	const playerInfo = room.players.get(playerId);
	if (playerInfo) {
		broadcast(params.id, 'player_progress', {
			type: 'player_progress',
			...toPlayerInfo(playerInfo, room.gridSize)
		});
	}

	return json({ ok: true });
};

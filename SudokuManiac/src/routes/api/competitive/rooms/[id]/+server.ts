/**
 * GET  /api/competitive/rooms/[id]  — get room state
 * POST /api/competitive/rooms/[id]  — join room by id (guests welcome)
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRoom, joinRoom, toPlayerInfo } from '$lib/server/competitive/store';
import { broadcast } from '$lib/server/competitive/sse';

function resolvePlayer(request: Request, locals: App.Locals) {
	if (locals.user) return { id: locals.user.id, name: locals.user.name };
	const id = request.headers.get('x-player-id');
	const name = request.headers.get('x-player-name') ?? 'Guest';
	if (!id) return null;
	return { id, name };
}

export const GET: RequestHandler = async ({ params }) => {
	const room = getRoom(params.id);
	if (!room) error(404, 'Room not found');
	return json({
		id: room.id,
		code: room.code,
		status: room.status,
		hostId: room.hostId,
		difficulty: room.difficulty,
		gridSize: room.gridSize,
		maxPlayers: room.maxPlayers,
		players: [...room.players.values()].map((p) => toPlayerInfo(p, room.gridSize))
	});
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const room = getRoom(params.id);
	if (!room) error(404, 'Room not found');

	const player = resolvePlayer(request, locals);
	if (!player) error(400, 'Player ID required (send x-player-id header)');

	const result = joinRoom(room, player.id, player.name);
	if (result && 'error' in result) error(400, result.error);

	broadcast(params.id, 'player_joined', {
		type: 'player_joined',
		player: toPlayerInfo(room.players.get(player.id)!, room.gridSize)
	});

	return json({ id: room.id, code: room.code });
};

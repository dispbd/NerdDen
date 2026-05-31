/**
 * POST /api/competitive/rooms/join  — join by 6-char room code (guests welcome)
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRoomByCode, joinRoom, toPlayerInfo } from '$lib/server/competitive/store';
import { broadcast } from '$lib/server/competitive/sse';

export const POST: RequestHandler = async ({ request, locals }) => {
	const body = await request.json();
	const code: string = body.code;
	if (!code || typeof code !== 'string') error(400, 'Room code required');

	const room = getRoomByCode(code.toUpperCase());
	if (!room) error(404, 'Room not found');

	const playerId = locals.user?.id ?? (body.guestId as string | undefined);
	const playerName = locals.user?.name ?? (body.guestName as string | undefined) ?? 'Guest';
	if (!playerId) error(400, 'Player ID required');

	const result = joinRoom(room, playerId, playerName);
	if (result && 'error' in result) error(400, result.error);

	broadcast(room.id, 'player_joined', {
		type: 'player_joined',
		player: toPlayerInfo(room.players.get(playerId)!, room.gridSize)
	});

	return json({ id: room.id, code: room.code });
};

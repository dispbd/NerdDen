/**
 * POST /api/competitive/rooms  — create a new room (guests welcome)
 * GET  /api/competitive/rooms  — list open (waiting) rooms
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createRoom, listWaitingRooms } from '$lib/server/competitive/store';
import { dbSyncRoomCreated } from '$lib/server/competitive/db-sync';
import type { Difficulty, GridSize } from '$lib/competitive/protocol';

function resolvePlayer(request: Request, locals: App.Locals) {
	if (locals.user) return { id: locals.user.id, name: locals.user.name };
	const id = request.headers.get('x-player-id') ?? `guest_${crypto.randomUUID().slice(0, 8)}`;
	const name = request.headers.get('x-player-name') ?? 'Guest';
	return { id, name };
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const player = resolvePlayer(request, locals);
	const body = await request.json();
	const difficulty = (body.difficulty as Difficulty) ?? 'medium';
	const gridSize = (Number(body.gridSize) as GridSize) ?? 9;
	const maxPlayers = Math.min(Number(body.maxPlayers) || 2, 8);

	const room = createRoom(player.id, player.name, difficulty, gridSize, maxPlayers);

	// Persist to DB for auth users (guest-hosted rooms stay in-memory only)
	if (locals.user) dbSyncRoomCreated(room, locals.user.id);

	return json({ id: room.id, code: room.code }, { status: 201 });
};

export const GET: RequestHandler = async () => {
	const rooms = listWaitingRooms();
	return json(
		rooms.map((r) => ({
			id: r.id,
			code: r.code,
			difficulty: r.difficulty,
			gridSize: r.gridSize,
			maxPlayers: r.maxPlayers,
			playerCount: r.players.size
		}))
	);
};

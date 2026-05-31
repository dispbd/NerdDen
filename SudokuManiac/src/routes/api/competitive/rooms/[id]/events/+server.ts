/**
 * GET /api/competitive/rooms/[id]/events
 * Server-Sent Events stream — client subscribes here for real-time room updates.
 */

import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { getRoom, toPlayerInfo } from '$lib/server/competitive/store';
import { subscribe, broadcast } from '$lib/server/competitive/sse';

export const GET: RequestHandler = async ({ params, request, locals }) => {
	const room = getRoom(params.id);
	if (!room) error(404, 'Room not found');

	const playerId =
		locals.user?.id ??
		request.headers.get('x-player-id') ??
		`anon_${Math.random().toString(36).slice(2, 8)}`;

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			function write(chunk: string) {
				try {
					controller.enqueue(encoder.encode(chunk));
				} catch {
					/* stream closed */
				}
			}

			// Send full room state immediately
			const payload = {
				type: 'room_state',
				roomId: room.id,
				code: room.code,
				status: room.status,
				hostId: room.hostId,
				difficulty: room.difficulty,
				gridSize: room.gridSize,
				puzzle: room.status === 'in_progress' ? room.puzzle : null,
				maxPlayers: room.maxPlayers,
				players: [...room.players.values()].map((p) => toPlayerInfo(p, room.gridSize))
			};
			write(`event: room_state\ndata: ${JSON.stringify(payload)}\n\n`);

			const unsub = subscribe(params.id, write);

			request.signal.addEventListener('abort', () => {
				unsub();
				broadcast(params.id, 'player_left', { type: 'player_left', userId: playerId });
				try {
					controller.close();
				} catch {
					/* already closed */
				}
			});
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};

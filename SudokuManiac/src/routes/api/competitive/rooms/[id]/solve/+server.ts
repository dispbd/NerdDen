/**
 * POST /api/competitive/rooms/[id]/solve
 * Player claims they completed the puzzle — server validates.
 */

import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { getRoom, recordSolve, toPlayerInfo } from '$lib/server/competitive/store';
import { broadcast } from '$lib/server/competitive/sse';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const room = getRoom(params.id);
	if (!room) error(404, 'Room not found');
	if (room.status !== 'in_progress') error(400, 'Game not in progress');

	const playerId = locals.user?.id ?? request.headers.get('x-player-id');
	if (!playerId) error(400, 'Player ID required');
	if (!room.players.has(playerId)) error(403, 'Not a participant');

	const { gridState, timeSpent = 0 } = await request.json();

	const result = recordSolve(room, playerId, gridState, timeSpent);

	if (!result.valid) {
		return json({ valid: false });
	}

	broadcast(params.id, 'player_finished', {
		type: 'player_finished',
		userId: playerId,
		finishPosition: result.finishPosition,
		timeSpent
	});

	if (result.allFinished) {
		const standings = [...room.players.values()].map((p) => ({
			userId: p.id,
			name: p.name,
			finishPosition: p.finishPosition,
			timeSpent: p.timeSpent,
			eloDelta: 0,
			newRating: 1200
		}));
		broadcast(params.id, 'game_finished', { type: 'game_finished', standings });
	}

	return json({ valid: true, finishPosition: result.finishPosition });
};

/**
 * POST /api/competitive/rooms/[id]/leave
 * Player explicitly leaves the game. Unlike a simple disconnect, this:
 *   - Marks the player as permanently abandoned (no reconnect allowed)
 *   - Awards finish position 1 to every active opponent
 *   - Broadcasts player_abandoned + game_finished (reason: 'abandoned') when applicable
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRoom, abandonRoom, toPlayerInfo } from '$lib/server/competitive/store';
import { broadcast } from '$lib/server/competitive/sse';
import { dbSyncPlayerAbandoned, dbSyncGameFinished } from '$lib/server/competitive/db-sync';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const room = getRoom(params.id);
	if (!room) error(404, 'Room not found');

	const playerId = locals.user?.id ?? request.headers.get('x-player-id');
	if (!playerId) error(400, 'Player ID required');
	if (!room.players.has(playerId)) error(403, 'Not a participant');

	// In waiting rooms, just leave silently — no win to award
	if (room.status !== 'in_progress') {
		return json({ ok: true });
	}

	const player = room.players.get(playerId)!;
	const result = abandonRoom(room, playerId);

	broadcast(params.id, 'player_abandoned', {
		type: 'player_abandoned',
		userId: playerId,
		name: player.name
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
		broadcast(params.id, 'game_finished', {
			type: 'game_finished',
			standings,
			reason: 'abandoned'
		});

		// Persist to DB for auth users
		if (locals.user) {
			dbSyncPlayerAbandoned(params.id, locals.user.id);
			dbSyncGameFinished(params.id);
		}
	}

	return json({ ok: true });
};

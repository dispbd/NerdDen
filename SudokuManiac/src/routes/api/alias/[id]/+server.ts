import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRoomWithTeams } from '$lib/server/alias/rooms';

/** GET /api/alias/[id] — fetch room state */
export const GET: RequestHandler = async ({ params }) => {
	const room = await getRoomWithTeams(params.id);
	if (!room) throw error(404, 'Room not found');
	return json(room);
};

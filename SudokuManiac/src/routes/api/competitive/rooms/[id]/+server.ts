/**
 * GET  /api/competitive/rooms/[id]  — get room state
 * POST /api/competitive/rooms/[id]  — join room (by id) or start (action=start)
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getRoomWithParticipants,
	joinRoom,
	startRoom
} from '$lib/server/competitive/rooms';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) error(401, 'Sign in to view room');

	try {
		const room = await getRoomWithParticipants(params.id);
		return json(room);
	} catch {
		error(404, 'Room not found');
	}
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) error(401, 'Sign in to join room');

	const body = await request.json().catch(() => ({}));
	const action = (body as { action?: string }).action;

	if (action === 'start') {
		const result = await startRoom(params.id, locals.user.id);
		if ('error' in result) error(400, result.error);
		return json(result);
	}

	// Default action: join
	const result = await joinRoom(params.id, locals.user.id);
	if ('error' in result) error(400, result.error);
	return json(result);
};

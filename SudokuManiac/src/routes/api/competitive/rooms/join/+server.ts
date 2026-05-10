/**
 * POST /api/competitive/rooms/join  — join by 6-char room code
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { joinRoomByCode } from '$lib/server/competitive/rooms';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Sign in to join a room');

	const { code } = await request.json();
	if (!code || typeof code !== 'string') error(400, 'Room code required');

	const result = await joinRoomByCode(code, locals.user.id);
	if ('error' in result) error(400, result.error);

	return json(result);
};

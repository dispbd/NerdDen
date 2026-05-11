/**
 * POST /api/competitive/rooms  — create a new room
 * GET  /api/competitive/rooms  — list open (waiting) rooms
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createRoom, getRoomWithParticipants } from '$lib/server/competitive/rooms';
import { db } from '$lib/server/db';
import { competitiveRooms, roomParticipants } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';
import type { Difficulty, GridSize } from '$lib/competitive/protocol';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Sign in to create a room');

	const body = await request.json();
	const difficulty = (body.difficulty as Difficulty) ?? 'medium';
	const gridSize = (Number(body.gridSize) as GridSize) ?? 9;
	const maxPlayers = Math.min(Number(body.maxPlayers) || 2, 8);

	const room = await createRoom({
		hostId: locals.user.id,
		difficulty,
		gridSize,
		maxPlayers
	});

	return json(room, { status: 201 });
};

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) error(401, 'Sign in to view rooms');

	// Return waiting rooms with participant count
	const rows = await db
		.select({
			id: competitiveRooms.id,
			code: competitiveRooms.code,
			hostId: competitiveRooms.hostId,
			difficulty: competitiveRooms.difficulty,
			gridSize: competitiveRooms.gridSize,
			maxPlayers: competitiveRooms.maxPlayers,
			createdAt: competitiveRooms.createdAt,
			playerCount: sql<number>`count(${roomParticipants.id})::int`
		})
		.from(competitiveRooms)
		.leftJoin(roomParticipants, eq(competitiveRooms.id, roomParticipants.roomId))
		.where(eq(competitiveRooms.status, 'waiting'))
		.groupBy(
			competitiveRooms.id,
			competitiveRooms.code,
			competitiveRooms.hostId,
			competitiveRooms.difficulty,
			competitiveRooms.gridSize,
			competitiveRooms.maxPlayers,
			competitiveRooms.createdAt
		);

	return json(rows);
};

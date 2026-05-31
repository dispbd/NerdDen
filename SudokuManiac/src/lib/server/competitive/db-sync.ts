/**
 * Fire-and-forget DB persistence for competitive rooms.
 * All operations are wrapped in safe() so a DB failure never crashes a live game.
 * Only auth-user rooms are persisted (guests stay in-memory only due to FK constraints).
 */

import { db } from '$lib/server/db';
import { competitiveRooms, roomParticipants } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import type { Room } from './store';

function safe(label: string, fn: () => Promise<unknown>) {
	fn().catch((err) => console.error(`[competitive/db-sync:${label}]`, err));
}

/** Called when an auth user creates a room. Guest-hosted rooms are not persisted. */
export function dbSyncRoomCreated(room: Room, hostUserId: string) {
	safe('roomCreated', async () => {
		await db
			.insert(competitiveRooms)
			.values({
				id: room.id,
				code: room.code,
				hostId: hostUserId,
				status: 'waiting',
				difficulty: room.difficulty,
				gridSize: room.gridSize,
				maxPlayers: room.maxPlayers
			})
			.onConflictDoNothing();
	});
}

/** Called when an auth user joins a room. If the room isn't in DB (guest host) this is a no-op. */
export function dbSyncPlayerJoined(roomId: string, userId: string) {
	safe('playerJoined', async () => {
		await db
			.insert(roomParticipants)
			.values({
				roomId,
				userId,
				hintsUsed: 0,
				status: 'active'
			})
			.onConflictDoNothing();
	});
}

export function dbSyncGameStarted(roomId: string) {
	safe('gameStarted', async () => {
		await db
			.update(competitiveRooms)
			.set({ status: 'in_progress', startedAt: new Date() })
			.where(eq(competitiveRooms.id, roomId));
	});
}

export function dbSyncPlayerFinished(
	roomId: string,
	userId: string,
	finishPosition: number,
	timeSpent: number,
	hintsUsed: number
) {
	safe('playerFinished', async () => {
		await db
			.update(roomParticipants)
			.set({
				finishPosition,
				timeSpent,
				hintsUsed,
				status: 'finished',
				finishedAt: new Date()
			})
			.where(and(eq(roomParticipants.roomId, roomId), eq(roomParticipants.userId, userId)));
	});
}

export function dbSyncGameFinished(roomId: string) {
	safe('gameFinished', async () => {
		await db
			.update(competitiveRooms)
			.set({ status: 'finished', finishedAt: new Date() })
			.where(eq(competitiveRooms.id, roomId));
	});
}

export function dbSyncPlayerAbandoned(roomId: string, userId: string) {
	safe('playerAbandoned', async () => {
		await db
			.update(roomParticipants)
			.set({ status: 'abandoned', abandonedAt: new Date() })
			.where(and(eq(roomParticipants.roomId, roomId), eq(roomParticipants.userId, userId)));
	});
}

/**
 * WebSocket handler for competitive mode.
 * Bun's native WebSocket API is used via SvelteKit's handleWebsocket hook.
 *
 * Each connection is identified by userId (from session cookie) + roomId.
 * The in-process Map is sufficient for a single-server deployment.
 */

import type { ServerWebSocket } from 'bun';
import { auth } from '$lib/server/auth';
import {
	getRoomWithParticipants,
	joinRoom,
	startRoom,
	updateProgress,
	validateAndRecordSolve
} from '$lib/server/competitive/rooms';
import type {
	ClientMessage,
	ServerMessage,
	WsGameFinished,
	WsGameStarted,
	WsPlayerFinished,
	WsPlayerJoined,
	WsPlayerLeft,
	WsPlayerProgress,
	WsRoomState
} from '$lib/competitive/protocol';

// ─── Connection registry ──────────────────────────────────────────────────────

interface WsData {
	userId: string;
	userName: string;
	roomId: string | null;
}

/** roomId → set of open sockets */
const rooms = new Map<string, Set<ServerWebSocket<WsData>>>();

function getRoomSockets(roomId: string): Set<ServerWebSocket<WsData>> {
	if (!rooms.has(roomId)) rooms.set(roomId, new Set());
	return rooms.get(roomId)!;
}

function broadcast(roomId: string, msg: ServerMessage, exclude?: ServerWebSocket<WsData>) {
	const sockets = rooms.get(roomId);
	if (!sockets) return;
	const text = JSON.stringify(msg);
	for (const ws of sockets) {
		if (ws !== exclude && ws.readyState === 1 /* OPEN */) {
			ws.send(text);
		}
	}
}

function send(ws: ServerWebSocket<WsData>, msg: ServerMessage) {
	ws.send(JSON.stringify(msg));
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleJoinRoom(ws: ServerWebSocket<WsData>, roomId: string) {
	const { userId } = ws.data;

	const result = await joinRoom(roomId, userId);
	if ('error' in result) {
		send(ws, { type: 'error', message: result.error });
		return;
	}

	// Register socket in room
	ws.data.roomId = roomId;
	getRoomSockets(roomId).add(ws);

	// Send full room state to the joining player
	const roomState: WsRoomState = {
		type: 'room_state',
		roomId: result.id,
		status: result.status,
		hostId: result.hostId,
		difficulty: result.difficulty,
		gridSize: result.gridSize,
		puzzle: result.puzzle,
		maxPlayers: result.maxPlayers,
		players: result.players
	};
	send(ws, roomState);

	// Notify other players
	const joiningPlayer = result.players.find((p) => p.userId === userId);
	if (joiningPlayer) {
		const joined: WsPlayerJoined = { type: 'player_joined', player: joiningPlayer };
		broadcast(roomId, joined, ws);
	}
}

async function handleStartRoom(ws: ServerWebSocket<WsData>, roomId: string) {
	const result = await startRoom(roomId, ws.data.userId);
	if ('error' in result) {
		send(ws, { type: 'error', message: result.error });
		return;
	}

	const started: WsGameStarted = {
		type: 'game_started',
		puzzle: result.puzzle!,
		startedAt: new Date().toISOString()
	};
	broadcast(roomId, started);
	send(ws, started);
}

async function handleProgressUpdate(
	ws: ServerWebSocket<WsData>,
	roomId: string,
	gridState: number[][],
	filledCount: number
) {
	await updateProgress(roomId, ws.data.userId, gridState);

	const gridSize = gridState.length;
	const totalCells = gridSize * gridSize;
	const progress = Math.round((filledCount / totalCells) * 100);

	const msg: WsPlayerProgress = {
		type: 'player_progress',
		userId: ws.data.userId,
		progress
	};
	broadcast(roomId, msg, ws);
}

async function handleSolveAttempt(
	ws: ServerWebSocket<WsData>,
	roomId: string,
	gridState: number[][],
	timeSpent: number,
	hintsUsed: number
) {
	const result = await validateAndRecordSolve(
		roomId,
		ws.data.userId,
		gridState,
		timeSpent,
		hintsUsed
	);

	if ('error' in result) {
		send(ws, { type: 'error', message: result.error });
		return;
	}

	if (!result.valid) {
		send(ws, { type: 'solve_rejected', reason: 'Solution is incorrect' });
		return;
	}

	// Notify everyone this player finished
	const finished: WsPlayerFinished = {
		type: 'player_finished',
		userId: ws.data.userId,
		finishPosition: result.finishPosition!,
		timeSpent
	};
	broadcast(roomId, finished);
	send(ws, finished);

	// If the game is over, send final standings to all
	if (result.finalStandings) {
		const gameFinished: WsGameFinished = {
			type: 'game_finished',
			standings: result.finalStandings
		};
		broadcast(roomId, gameFinished);
		send(ws, gameFinished);
	}
}

// ─── handleWebsocket export (Bun SvelteKit) ───────────────────────────────────

export const handleWebsocket = {
	async upgrade(request: Request): Promise<WsData | Response> {
		// Authenticate via session cookie
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session?.user) {
			return new Response('Unauthorized', { status: 401 });
		}

		return {
			userId: session.user.id,
			userName: session.user.name,
			roomId: null
		};
	},

	open(ws: ServerWebSocket<WsData>) {
		// Nothing — player must send join_room first
	},

	async message(ws: ServerWebSocket<WsData>, raw: string | Buffer) {
		let msg: ClientMessage;
		try {
			msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString()) as ClientMessage;
		} catch {
			send(ws, { type: 'error', message: 'Invalid JSON' });
			return;
		}

		if (msg.type === 'ping') {
			send(ws, { type: 'pong' });
			return;
		}

		if (msg.type === 'join_room') {
			await handleJoinRoom(ws, msg.roomId);
			return;
		}

		// All subsequent messages require an active room
		const roomId = ws.data.roomId;
		if (!roomId) {
			send(ws, { type: 'error', message: 'Not in a room — send join_room first' });
			return;
		}

		switch (msg.type) {
			case 'start_room':
				await handleStartRoom(ws, roomId);
				break;
			case 'progress_update':
				await handleProgressUpdate(ws, roomId, msg.gridState, msg.filledCount);
				break;
			case 'solve_attempt':
				await handleSolveAttempt(ws, roomId, msg.gridState, msg.timeSpent, msg.hintsUsed);
				break;
		}
	},

	close(ws: ServerWebSocket<WsData>) {
		const { roomId, userId } = ws.data;
		if (!roomId) return;

		const sockets = rooms.get(roomId);
		if (sockets) {
			sockets.delete(ws);
			if (sockets.size === 0) rooms.delete(roomId);
		}

		const left: WsPlayerLeft = { type: 'player_left', userId };
		broadcast(roomId, left);
	}
};

/**
 * In-memory competitive room store.
 * Ephemeral — rooms disappear on server restart, no DB required.
 * This allows guest access without any authentication.
 */

import { generatePuzzle } from '$lib/server/games/sudoku/generator';
import type { Difficulty, GridSize } from '$lib/competitive/protocol';

export interface RoomPlayer {
	id: string;
	name: string;
	gridState: number[][] | null;
	selectedRow: number;
	selectedCol: number;
	finishPosition: number | null;
	timeSpent: number | null;
	hintsUsed: number;
}

export interface Room {
	id: string;
	code: string;
	hostId: string;
	status: 'waiting' | 'in_progress' | 'finished';
	difficulty: Difficulty;
	gridSize: GridSize;
	puzzle: number[][] | null;
	solution: number[][] | null;
	maxPlayers: number;
	players: Map<string, RoomPlayer>;
	createdAt: number;
}

const rooms = new Map<string, Room>();
const codeIndex = new Map<string, string>(); // code → id

function newCode(): string {
	let code: string;
	do {
		code = Math.random().toString(36).slice(2, 8).toUpperCase();
	} while (codeIndex.has(code));
	return code;
}

export function createRoom(
	hostId: string,
	hostName: string,
	difficulty: Difficulty,
	gridSize: GridSize,
	maxPlayers = 2
): Room {
	const id = crypto.randomUUID();
	const code = newCode();
	const room: Room = {
		id,
		code,
		hostId,
		status: 'waiting',
		difficulty,
		gridSize,
		puzzle: null,
		solution: null,
		maxPlayers,
		players: new Map([
			[
				hostId,
				{
					id: hostId,
					name: hostName,
					gridState: null,
					selectedRow: -1,
					selectedCol: -1,
					finishPosition: null,
					timeSpent: null,
					hintsUsed: 0
				}
			]
		]),
		createdAt: Date.now()
	};
	rooms.set(id, room);
	codeIndex.set(code, id);
	// Auto-cleanup after 2 hours
	setTimeout(
		() => {
			codeIndex.delete(rooms.get(id)?.code ?? '');
			rooms.delete(id);
		},
		2 * 60 * 60 * 1000
	);
	return room;
}

export function getRoom(id: string): Room | undefined {
	return rooms.get(id);
}

export function getRoomByCode(code: string): Room | undefined {
	const id = codeIndex.get(code.toUpperCase());
	return id ? rooms.get(id) : undefined;
}

export function listWaitingRooms() {
	return [...rooms.values()].filter((r) => r.status === 'waiting');
}

export function joinRoom(
	room: Room,
	playerId: string,
	playerName: string
): { error: string } | void {
	if (room.status !== 'waiting') return { error: 'Game already started' };
	if (room.players.size >= room.maxPlayers && !room.players.has(playerId))
		return { error: 'Room is full' };
	if (!room.players.has(playerId)) {
		room.players.set(playerId, {
			id: playerId,
			name: playerName,
			gridState: null,
			selectedRow: -1,
			selectedCol: -1,
			finishPosition: null,
			timeSpent: null,
			hintsUsed: 0
		});
	}
}

export function startRoom(room: Room, requesterId: string): { error: string } | void {
	if (room.hostId !== requesterId) return { error: 'Only the host can start' };
	if (room.status !== 'waiting') return { error: 'Room already started' };
	const { puzzle, solution } = generatePuzzle(room.difficulty, room.gridSize);
	room.puzzle = puzzle;
	room.solution = solution;
	room.status = 'in_progress';
}

export function updateProgress(
	room: Room,
	playerId: string,
	gridState: number[][],
	selectedRow: number,
	selectedCol: number,
	hintsUsed: number
): void {
	const player = room.players.get(playerId);
	if (player) {
		player.gridState = gridState;
		player.selectedRow = selectedRow;
		player.selectedCol = selectedCol;
		player.hintsUsed = hintsUsed;
	}
}

export interface SolveResult {
	valid: boolean;
	finishPosition?: number;
	allFinished?: boolean;
}

export function recordSolve(
	room: Room,
	playerId: string,
	gridState: number[][],
	timeSpent: number
): SolveResult {
	if (!room.solution) return { valid: false };

	const isValid = gridState.every((row, r) =>
		row.every((v, c) => v === room.solution![r][c])
	);
	if (!isValid) return { valid: false };

	const player = room.players.get(playerId);
	if (!player) return { valid: false };

	const alreadyFinished = [...room.players.values()].filter(
		(p) => p.finishPosition !== null
	).length;
	player.finishPosition = alreadyFinished + 1;
	player.timeSpent = timeSpent;
	player.gridState = gridState;

	const allFinished = [...room.players.values()].every((p) => p.finishPosition !== null);
	if (allFinished) room.status = 'finished';

	return { valid: true, finishPosition: player.finishPosition, allFinished };
}

export function toPlayerInfo(player: RoomPlayer, gridSize: number) {
	const total = gridSize * gridSize;
	const filled = player.gridState?.flat().filter((v) => v !== 0).length ?? 0;
	return {
		userId: player.id,
		name: player.name,
		progress: total > 0 ? Math.round((filled / total) * 100) : 0,
		finishPosition: player.finishPosition,
		eloRating: 1200,
		selectedRow: player.selectedRow,
		selectedCol: player.selectedCol,
		gridState: player.gridState
	};
}

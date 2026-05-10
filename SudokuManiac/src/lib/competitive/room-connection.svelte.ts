/**
 * Client-side WebSocket connection helper for competitive mode.
 * Returns a reactive store with room state and message senders.
 */

import type {
	ClientMessage,
	PlayerInfo,
	RoomStatus,
	ServerMessage,
	Difficulty,
	GridSize
} from '$lib/competitive/protocol';

export interface RoomState {
	connected: boolean;
	roomId: string | null;
	hostId: string | null;
	status: RoomStatus;
	difficulty: Difficulty;
	gridSize: GridSize;
	puzzle: number[][] | null;
	maxPlayers: number;
	players: PlayerInfo[];
	/** null while game running, set when game_finished received */
	finalStandings: ServerMessage extends { type: 'game_finished' }
		? Extract<ServerMessage, { type: 'game_finished' }>['standings'] | null
		: null;
	error: string | null;
}

export type RoomEventHandlers = {
	onGameStarted?: (puzzle: number[][], startedAt: string) => void;
	onPlayerFinished?: (userId: string, finishPosition: number, timeSpent: number) => void;
	onGameFinished?: (standings: Extract<ServerMessage, { type: 'game_finished' }>['standings']) => void;
	onSolveRejected?: (reason: string) => void;
};

export function createRoomConnection(handlers: RoomEventHandlers = {}) {
	let ws: WebSocket | null = null;

	let state = $state<RoomState>({
		connected: false,
		roomId: null,
		hostId: null,
		status: 'waiting',
		difficulty: 'medium',
		gridSize: 9,
		puzzle: null,
		maxPlayers: 2,
		players: [],
		finalStandings: null,
		error: null
	});

	function send(msg: ClientMessage) {
		if (ws?.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(msg));
		}
	}

	function connect(roomId: string) {
		if (ws) ws.close();

		const proto = location.protocol === 'https:' ? 'wss' : 'ws';
		ws = new WebSocket(`${proto}://${location.host}/ws`);

		ws.onopen = () => {
			state.connected = true;
			state.error = null;
			send({ type: 'join_room', roomId });
		};

		ws.onclose = () => {
			state.connected = false;
		};

		ws.onerror = () => {
			state.error = 'Connection error';
		};

		ws.onmessage = (event: MessageEvent) => {
			let msg: ServerMessage;
			try {
				msg = JSON.parse(event.data as string) as ServerMessage;
			} catch {
				return;
			}
			handleMessage(msg);
		};
	}

	function handleMessage(msg: ServerMessage) {
		switch (msg.type) {
			case 'room_state':
				state.roomId = msg.roomId;
				state.hostId = msg.hostId;
				state.status = msg.status;
				state.difficulty = msg.difficulty;
				state.gridSize = msg.gridSize;
				state.puzzle = msg.puzzle;
				state.maxPlayers = msg.maxPlayers;
				state.players = msg.players;
				break;

			case 'player_joined':
				if (!state.players.find((p) => p.userId === msg.player.userId)) {
					state.players = [...state.players, msg.player];
				}
				break;

			case 'player_left':
				state.players = state.players.filter((p) => p.userId !== msg.userId);
				break;

			case 'game_started':
				state.status = 'in_progress';
				state.puzzle = msg.puzzle;
				handlers.onGameStarted?.(msg.puzzle, msg.startedAt);
				break;

			case 'player_progress':
				state.players = state.players.map((p) =>
					p.userId === msg.userId ? { ...p, progress: msg.progress } : p
				);
				break;

			case 'player_finished':
				state.players = state.players.map((p) =>
					p.userId === msg.userId ? { ...p, finishPosition: msg.finishPosition } : p
				);
				handlers.onPlayerFinished?.(msg.userId, msg.finishPosition, msg.timeSpent);
				break;

			case 'game_finished':
				state.status = 'finished';
				state.finalStandings = msg.standings;
				handlers.onGameFinished?.(msg.standings);
				break;

			case 'solve_rejected':
				handlers.onSolveRejected?.(msg.reason);
				break;

			case 'error':
				state.error = msg.message;
				break;

			case 'pong':
				break;
		}
	}

	function disconnect() {
		ws?.close();
		ws = null;
	}

	function sendProgress(roomId: string, gridState: number[][], filledCount: number) {
		send({ type: 'progress_update', roomId, gridState, filledCount });
	}

	function sendSolveAttempt(
		roomId: string,
		gridState: number[][],
		timeSpent: number,
		hintsUsed: number
	) {
		send({ type: 'solve_attempt', roomId, gridState, timeSpent, hintsUsed });
	}

	function sendStartRoom(roomId: string) {
		send({ type: 'start_room', roomId });
	}

	return {
		get state() {
			return state;
		},
		connect,
		disconnect,
		sendProgress,
		sendSolveAttempt,
		sendStartRoom
	};
}

/**
 * Client-side SSE + fetch connection for competitive mode.
 *
 * Identity: authenticated users are identified server-side via session cookie.
 * Guests use a `guestId` + `guestName` stored in localStorage.
 *
 * Reconnect: the active roomId is persisted to localStorage so a player can
 * return to an in-progress game after a page reload or accidental tab close.
 * Rooms survive for 2 h on the server, so reconnect works within that window.
 */

import type {
	PlayerInfo,
	RoomStatus,
	ServerMessage,
	Difficulty,
	GridSize
} from '$lib/competitive/protocol';

// ─── Guest identity ───────────────────────────────────────────────────────────

export function getOrCreateGuestId(): string {
	let id = localStorage.getItem('competitive_guest_id');
	if (!id) {
		id = `guest_${crypto.randomUUID().slice(0, 8)}`;
		localStorage.setItem('competitive_guest_id', id);
	}
	return id;
}

export function getOrCreateGuestName(): string {
	let name = localStorage.getItem('competitive_guest_name');
	if (!name) {
		name = `Player_${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
		localStorage.setItem('competitive_guest_name', name);
	}
	return name;
}

export function setGuestName(name: string) {
	localStorage.setItem('competitive_guest_name', name);
}

// ─── Reconnect persistence ────────────────────────────────────────────────────

const SAVED_ROOM_KEY = 'competitive_saved_room';

export interface SavedRoomData {
	roomId: string;
	roomCode: string;
	/** Unix timestamp (ms) when the game started — used to restore the timer */
	gameStartedAt: number | null;
}

export function getSavedRoom(): SavedRoomData | null {
	try {
		const raw = localStorage.getItem(SAVED_ROOM_KEY);
		return raw ? (JSON.parse(raw) as SavedRoomData) : null;
	} catch {
		return null;
	}
}

export function clearSavedRoom() {
	localStorage.removeItem(SAVED_ROOM_KEY);
}

function persistRoom(roomId: string, roomCode: string, gameStartedAt: number | null) {
	localStorage.setItem(SAVED_ROOM_KEY, JSON.stringify({ roomId, roomCode, gameStartedAt }));
}

// ─── State ────────────────────────────────────────────────────────────────────

export interface RoomState {
	connected: boolean;
	roomId: string | null;
	roomCode: string | null;
	hostId: string | null;
	status: RoomStatus;
	difficulty: Difficulty;
	gridSize: GridSize;
	puzzle: number[][] | null;
	maxPlayers: number;
	players: PlayerInfo[];
	finalStandings: Extract<ServerMessage, { type: 'game_finished' }>['standings'] | null;
	/** Populated when the game ends */
	finishReason: 'all_finished' | 'abandoned' | null;
	error: string | null;
}

export type RoomEventHandlers = {
	onGameStarted?: (puzzle: number[][], startedAt: string) => void;
	onPlayerFinished?: (userId: string, finishPosition: number, timeSpent: number) => void;
	onGameFinished?: (
		standings: Extract<ServerMessage, { type: 'game_finished' }>['standings'],
		reason: 'all_finished' | 'abandoned'
	) => void;
	/** Fires when the opponent explicitly left (you win automatically) */
	onOpponentAbandoned?: (userId: string, name: string) => void;
	onSolveRejected?: (reason: string) => void;
};

// ─── Connection factory ───────────────────────────────────────────────────────

export function createRoomConnection(
	handlers: RoomEventHandlers = {},
	/** Pass the authenticated user ID if known; null = guest */
	userId: string | null = null
) {
	let es: EventSource | null = null;
	let guestId = '';
	let guestName = '';

	const state = $state<RoomState>({
		connected: false,
		roomId: null,
		roomCode: null,
		hostId: null,
		status: 'waiting',
		difficulty: 'medium',
		gridSize: 9,
		puzzle: null,
		maxPlayers: 2,
		players: [],
		finalStandings: null,
		finishReason: null,
		error: null
	});

	function myId(): string {
		return userId ?? guestId;
	}

	/** Build fetch headers that identify this player */
	function playerHeaders(): HeadersInit {
		if (userId) return { 'Content-Type': 'application/json' };
		return {
			'Content-Type': 'application/json',
			'x-player-id': guestId,
			'x-player-name': guestName
		};
	}

	function connect(roomId: string) {
		if (typeof localStorage !== 'undefined') {
			guestId = getOrCreateGuestId();
			guestName = getOrCreateGuestName();
		}

		if (es) es.close();

		// Persist for reconnect (code + gameStartedAt updated as events arrive)
		if (typeof localStorage !== 'undefined') {
			const existing = getSavedRoom();
			persistRoom(roomId, existing?.roomCode ?? '', existing?.gameStartedAt ?? null);
		}

		const url = userId
			? `/api/competitive/rooms/${roomId}/events`
			: `/api/competitive/rooms/${roomId}/events?guestId=${encodeURIComponent(guestId)}`;

		es = new EventSource(url);

		es.addEventListener('room_state', (e: MessageEvent) => {
			const msg = JSON.parse(e.data);
			state.roomId = msg.roomId;
			state.roomCode = msg.code;
			state.hostId = msg.hostId;
			state.status = msg.status;
			state.difficulty = msg.difficulty;
			state.gridSize = msg.gridSize;
			state.puzzle = msg.puzzle;
			state.maxPlayers = msg.maxPlayers;
			state.players = msg.players;
			state.connected = true;
			// Keep persisted room code up to date
			if (typeof localStorage !== 'undefined') {
				const saved = getSavedRoom();
				if (saved?.roomId === msg.roomId) {
					persistRoom(msg.roomId, msg.code, saved.gameStartedAt);
				}
			}
		});

		es.addEventListener('player_joined', (e: MessageEvent) => {
			const msg = JSON.parse(e.data);
			if (!state.players.find((p) => p.userId === msg.player.userId)) {
				state.players = [...state.players, msg.player];
			}
		});

		es.addEventListener('player_left', (e: MessageEvent) => {
			const msg = JSON.parse(e.data);
			state.players = state.players.filter((p) => p.userId !== msg.userId);
		});

		es.addEventListener('game_started', (e: MessageEvent) => {
			const msg = JSON.parse(e.data);
			state.status = 'in_progress';
			state.puzzle = msg.puzzle;
			// Persist start time so the timer can be restored on reconnect
			if (typeof localStorage !== 'undefined') {
				const saved = getSavedRoom();
				persistRoom(
					saved?.roomId ?? state.roomId ?? '',
					saved?.roomCode ?? state.roomCode ?? '',
					Date.now()
				);
			}
			handlers.onGameStarted?.(msg.puzzle, msg.startedAt);
		});

		es.addEventListener('player_progress', (e: MessageEvent) => {
			const msg = JSON.parse(e.data);
			state.players = state.players.map((p) =>
				p.userId === msg.userId
					? {
							...p,
							progress: msg.progress,
							selectedRow: msg.selectedRow,
							selectedCol: msg.selectedCol,
							gridState: msg.gridState
						}
					: p
			);
		});

		es.addEventListener('player_finished', (e: MessageEvent) => {
			const msg = JSON.parse(e.data);
			state.players = state.players.map((p) =>
				p.userId === msg.userId ? { ...p, finishPosition: msg.finishPosition } : p
			);
			handlers.onPlayerFinished?.(msg.userId, msg.finishPosition, msg.timeSpent);
		});

		es.addEventListener('player_abandoned', (e: MessageEvent) => {
			const msg = JSON.parse(e.data);
			// Mark the player as gone in local state
			state.players = state.players.map((p) =>
				p.userId === msg.userId ? { ...p, abandoned: true } : p
			);
			// If it's the opponent (not us), notify the UI
			if (msg.userId !== myId()) {
				handlers.onOpponentAbandoned?.(msg.userId, msg.name);
			}
		});

		es.addEventListener('game_finished', (e: MessageEvent) => {
			const msg = JSON.parse(e.data);
			state.status = 'finished';
			state.finalStandings = msg.standings;
			state.finishReason = msg.reason ?? 'all_finished';
			if (typeof localStorage !== 'undefined') clearSavedRoom();
			handlers.onGameFinished?.(msg.standings, msg.reason ?? 'all_finished');
		});

		es.onerror = () => {
			state.connected = false;
		};
	}

	function disconnect() {
		es?.close();
		es = null;
		state.connected = false;
	}

	async function sendProgress(
		roomId: string,
		gridState: number[][],
		selectedRow: number,
		selectedCol: number,
		hintsUsed: number
	) {
		await fetch(`/api/competitive/rooms/${roomId}/progress`, {
			method: 'POST',
			headers: playerHeaders(),
			body: JSON.stringify({ gridState, selectedRow, selectedCol, hintsUsed })
		}).catch(() => {});
	}

	async function sendSolveAttempt(
		roomId: string,
		gridState: number[][],
		timeSpent: number,
		hintsUsed: number
	): Promise<boolean> {
		const res = await fetch(`/api/competitive/rooms/${roomId}/solve`, {
			method: 'POST',
			headers: playerHeaders(),
			body: JSON.stringify({ gridState, timeSpent, hintsUsed })
		});
		if (!res.ok) return false;
		const data = await res.json();
		if (!data.valid) handlers.onSolveRejected?.('Solution is incorrect');
		return data.valid;
	}

	async function sendStartRoom(roomId: string) {
		await fetch(`/api/competitive/rooms/${roomId}/start`, {
			method: 'POST',
			headers: playerHeaders()
		});
	}

	/**
	 * Explicitly leave an in-progress game.
	 * This is permanent — the player cannot reconnect. The opponent wins automatically.
	 * Clears the saved-room entry so the rejoin prompt won't appear.
	 */
	async function sendLeave(roomId: string) {
		if (typeof localStorage !== 'undefined') clearSavedRoom();
		await fetch(`/api/competitive/rooms/${roomId}/leave`, {
			method: 'POST',
			headers: playerHeaders()
		}).catch(() => {});
	}

	return {
		get state() {
			return state;
		},
		get myId() {
			return myId();
		},
		connect,
		disconnect,
		sendProgress,
		sendSolveAttempt,
		sendStartRoom,
		sendLeave
	};
}

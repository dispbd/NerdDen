/**
 * WebSocket message protocol for competitive mode.
 * All messages are JSON-serialized over the WebSocket connection.
 *
 * Client → Server messages have `type` starting with lowercase verb.
 * Server → Client messages have `type` describing the event.
 */

// ─── Shared ───────────────────────────────────────────────────────────────────

export type Difficulty = 'beginner' | 'easy' | 'medium' | 'hard' | 'expert' | 'extreme';
export type GridSize = 4 | 6 | 9;
export type RoomStatus = 'waiting' | 'in_progress' | 'finished';

export interface PlayerInfo {
	userId: string;
	name: string;
	/** 0–100 approximate completion percentage */
	progress: number;
	/** null while still playing */
	finishPosition: number | null;
	eloRating: number;
	/** Opponent’s selected cell coordinates (-1 = none) */
	selectedRow: number;
	selectedCol: number;
	/** Opponent’s committed grid state (given + player-entered digits) */
	gridState: number[][] | null;	/** true when the player explicitly left via the Leave button */
	abandoned?: boolean;}

// ─── Client → Server ─────────────────────────────────────────────────────────

/** Join (or re-join after disconnect) an existing room */
export interface WsJoinRoom {
	type: 'join_room';
	roomId: string;
}

/** Player updated their grid (throttled, sent every ~1 s) */
export interface WsProgressUpdate {
	type: 'progress_update';
	roomId: string;
	/** Serialised grid — 0 = empty */
	gridState: number[][];
	/** Filled cells count so the server can compute % without the solution */
	filledCount: number;
}

/** Player claims they solved the puzzle — server validates */
export interface WsSolveAttempt {
	type: 'solve_attempt';
	roomId: string;
	gridState: number[][];
	timeSpent: number;
	hintsUsed: number;
}

/** Host starts the room (all players ready) */
export interface WsStartRoom {
	type: 'start_room';
	roomId: string;
}

/** Ping to keep connection alive */
export interface WsPing {
	type: 'ping';
}

export type ClientMessage =
	| WsJoinRoom
	| WsProgressUpdate
	| WsSolveAttempt
	| WsStartRoom
	| WsPing;

// ─── Server → Client ─────────────────────────────────────────────────────────

/** Sent to the joining player with current room state */
export interface WsRoomState {
	type: 'room_state';
	roomId: string;
	code: string;
	status: RoomStatus;
	hostId: string;
	difficulty: Difficulty;
	gridSize: GridSize;
	/** puzzle is null until the room starts */
	puzzle: number[][] | null;
	maxPlayers: number;
	players: PlayerInfo[];
}

/** A new player joined the room */
export interface WsPlayerJoined {
	type: 'player_joined';
	player: PlayerInfo;
}

/** A player disconnected (but may reconnect) */
export interface WsPlayerLeft {
	type: 'player_left';
	userId: string;
}

/** Host started the match — puzzle is revealed */
export interface WsGameStarted {
	type: 'game_started';
	puzzle: number[][];
	startedAt: string; // ISO timestamp
}

/** Progress broadcast from server to all other players in the room */
export interface WsPlayerProgress {
	type: 'player_progress';
	userId: string;
	name: string;
	progress: number;
	selectedRow: number;
	selectedCol: number;
	gridState: number[][] | null;
}

/** A player finished — broadcast to all */
export interface WsPlayerFinished {
	type: 'player_finished';
	userId: string;
	finishPosition: number;
	timeSpent: number;
}

/** The match is over — final standings + ELO deltas */
export interface WsGameFinished {
	type: 'game_finished';
	standings: Array<{
		userId: string;
		name: string;
		finishPosition: number | null;
		timeSpent: number | null;
		eloDelta: number;
		newRating: number;
	}>;
	/** Why the game ended */
	reason?: 'all_finished' | 'abandoned';
}

/** A player explicitly left the game (cannot rejoin; opponent wins) */
export interface WsPlayerAbandoned {
	type: 'player_abandoned';
	userId: string;
	name: string;
}

/** Server rejected a solve attempt */
export interface WsSolveRejected {
	type: 'solve_rejected';
	reason: string;
}

/** Error response */
export interface WsError {
	type: 'error';
	message: string;
}

/** Pong reply */
export interface WsPong {
	type: 'pong';
}

export type ServerMessage =
	| WsRoomState
	| WsPlayerJoined
	| WsPlayerLeft
	| WsGameStarted
	| WsPlayerProgress
	| WsPlayerFinished
	| WsPlayerAbandoned
	| WsGameFinished
	| WsSolveRejected
	| WsError
	| WsPong;

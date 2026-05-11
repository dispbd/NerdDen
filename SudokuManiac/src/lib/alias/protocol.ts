/**
 * Shared types for the Alias / Hat game.
 * Safe to import in both browser and server code.
 */

// ─── Room / Lobby ─────────────────────────────────────────────────────────────

export type RoomStatus = 'lobby' | 'playing' | 'finished';

export interface TeamMember {
	id: string;
	userId: string | null;
	userName: string;
	speakerOrder: number;
}

export interface Team {
	id: string;
	name: string;
	color: string;
	score: number;
	members: TeamMember[];
}

export interface AliasRoom {
	id: string;
	code: string;
	hostId: string | null;
	status: RoomStatus;
	topic: string;
	language: string;
	difficulty: string;
	turnDuration: number;
	wordCount: number;
	teams: Team[];
}

// ─── In-memory game state (not persisted) ─────────────────────────────────────

export interface HatWord {
	id: string; // uuid
	word: string;
}

export type WordResult = 'got_it' | 'skip';

export interface TurnResult {
	wordId: string;
	word: string;
	result: WordResult;
}

export interface GameState {
	hat: HatWord[]; // words still in the hat
	usedWords: (HatWord & { teamId: string; guessed: boolean })[];
	currentTeamIndex: number;
	currentSpeakerIndex: number; // index within team.members
	currentWord: HatWord | null;
	turnStartedAt: number | null; // Date.now()
	turnResults: TurnResult[]; // results in the current turn
	status: RoomStatus;
}

// ─── WebSocket protocol ───────────────────────────────────────────────────────

// Client → Server

export interface AliasJoinRoom {
	type: 'alias_join_room';
	roomId: string;
}

export interface AliasCreateTeam {
	type: 'alias_create_team';
	name: string;
	color: string;
}

export interface AliasJoinTeam {
	type: 'alias_join_team';
	teamId: string;
}

export interface AliasStartGame {
	type: 'alias_start_game';
}

export interface AliasWordResult {
	type: 'alias_word_result';
	result: WordResult;
}

export interface AliasEndTurn {
	type: 'alias_end_turn';
}

export interface AliasPing {
	type: 'alias_ping';
}

export type AliasClientMessage =
	| AliasJoinRoom
	| AliasCreateTeam
	| AliasJoinTeam
	| AliasStartGame
	| AliasWordResult
	| AliasEndTurn
	| AliasPing;

// Server → Client

export interface AliasRoomState {
	type: 'alias_room_state';
	room: AliasRoom;
}

export interface AliasTeamCreated {
	type: 'alias_team_created';
	team: Team;
}

export interface AliasPlayerJoined {
	type: 'alias_player_joined';
	member: TeamMember;
	teamId: string;
}

export interface AliasGameStarted {
	type: 'alias_game_started';
	wordsInHat: number;
	firstTeamId: string;
	firstSpeakerId: string | null;
	firstSpeakerName: string;
}

export interface AliasTurnStarted {
	type: 'alias_turn_started';
	teamId: string;
	speakerId: string | null;
	speakerName: string;
	turnDuration: number;
	wordsRemaining: number;
}

/** Sent ONLY to the current speaker */
export interface AliasNextWord {
	type: 'alias_next_word';
	word: string;
	wordId: string;
}

/** Broadcast after each word result */
export interface AliasWordResultBroadcast {
	type: 'alias_word_result_broadcast';
	result: WordResult;
	teamId: string;
	teamScore: number;
	wordsRemaining: number;
}

export interface AliasTurnEnded {
	type: 'alias_turn_ended';
	teamId: string;
	wordsGuessed: number;
	scores: { teamId: string; score: number }[];
	nextTeamId: string | null;
}

export interface AliasGameEnded {
	type: 'alias_game_ended';
	standings: { teamId: string; name: string; score: number }[];
	winner: string; // winning team name
}

export interface AliasError {
	type: 'alias_error';
	message: string;
}

export interface AliasPong {
	type: 'alias_pong';
}

export type AliasServerMessage =
	| AliasRoomState
	| AliasTeamCreated
	| AliasPlayerJoined
	| AliasGameStarted
	| AliasTurnStarted
	| AliasNextWord
	| AliasWordResultBroadcast
	| AliasTurnEnded
	| AliasGameEnded
	| AliasError
	| AliasPong;

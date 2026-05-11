/**
 * Svelte 5 reactive WebSocket connection for the Alias game.
 * Connects to /ws/alias and handles all protocol messages.
 */

import type {
	AliasClientMessage,
	AliasServerMessage,
	AliasRoom,
	Team,
	TeamMember,
	AliasGameStarted,
	AliasTurnStarted,
	AliasNextWord,
	AliasWordResultBroadcast,
	AliasTurnEnded,
	AliasGameEnded
} from '$lib/alias/protocol';

export type AliasView = 'lobby' | 'game' | 'results';

export interface Handlers {
	onRoomState?: (room: AliasRoom) => void;
	onTeamCreated?: (team: Team) => void;
	onPlayerJoined?: (member: TeamMember, teamId: string) => void;
	onGameStarted?: (e: AliasGameStarted) => void;
	onTurnStarted?: (e: AliasTurnStarted) => void;
	onNextWord?: (e: AliasNextWord) => void;
	onWordResult?: (e: AliasWordResultBroadcast) => void;
	onTurnEnded?: (e: AliasTurnEnded) => void;
	onGameEnded?: (e: AliasGameEnded) => void;
	onError?: (msg: string) => void;
}

export function createAliasConnection(handlers: Handlers) {
	let ws: WebSocket | null = null;

	const state = $state({
		connected: false,
		room: null as AliasRoom | null,
		error: ''
	});

	function connect(roomId: string) {
		const proto = location.protocol === 'https:' ? 'wss' : 'ws';
		ws = new WebSocket(`${proto}://${location.host}/ws/alias`);

		ws.onopen = () => {
			state.connected = true;
			send({ type: 'alias_join_room', roomId });
		};

		ws.onclose = () => {
			state.connected = false;
		};

		ws.onerror = () => {
			state.error = 'WebSocket error';
		};

		ws.onmessage = (ev: MessageEvent) => {
			const msg = JSON.parse(ev.data as string) as AliasServerMessage;
			dispatch(msg);
		};
	}

	function disconnect() {
		ws?.close();
		ws = null;
	}

	function send(msg: AliasClientMessage) {
		if (ws?.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(msg));
		}
	}

	function dispatch(msg: AliasServerMessage) {
		switch (msg.type) {
			case 'alias_room_state':
				state.room = msg.room;
				handlers.onRoomState?.(msg.room);
				break;
			case 'alias_team_created':
				if (state.room) {
					state.room.teams = [...state.room.teams, msg.team];
				}
				handlers.onTeamCreated?.(msg.team);
				break;
			case 'alias_player_joined':
				if (state.room) {
					const team = state.room.teams.find((t) => t.id === msg.teamId);
					if (team) {
						team.members = [...team.members, msg.member];
					}
				}
				handlers.onPlayerJoined?.(msg.member, msg.teamId);
				break;
			case 'alias_game_started':
				handlers.onGameStarted?.(msg);
				break;
			case 'alias_turn_started':
				handlers.onTurnStarted?.(msg);
				break;
			case 'alias_next_word':
				handlers.onNextWord?.(msg);
				break;
			case 'alias_word_result_broadcast':
				if (state.room) {
					const team = state.room.teams.find((t) => t.id === msg.teamId);
					if (team) team.score = msg.teamScore;
				}
				handlers.onWordResult?.(msg);
				break;
			case 'alias_turn_ended':
				if (state.room) {
					for (const s of msg.scores) {
						const team = state.room.teams.find((t) => t.id === s.teamId);
						if (team) team.score = s.score;
					}
				}
				handlers.onTurnEnded?.(msg);
				break;
			case 'alias_game_ended':
				handlers.onGameEnded?.(msg);
				break;
			case 'alias_error':
				state.error = msg.message;
				handlers.onError?.(msg.message);
				break;
			case 'alias_pong':
				break;
		}
	}

	return {
		state,
		connect,
		disconnect,
		joinTeam: (teamId: string) => send({ type: 'alias_join_team', teamId }),
		createTeam: (name: string, color: string) => send({ type: 'alias_create_team', name, color }),
		startGame: () => send({ type: 'alias_start_game' }),
		wordResult: (result: 'got_it' | 'skip') => send({ type: 'alias_word_result', result }),
		endTurn: () => send({ type: 'alias_end_turn' })
	};
}

/**
 * Svelte 5 reactive Alias connection over DB polling.
 *
 * Replaces the WebSocket client: the app runs on serverless, where a socket
 * cannot be held open, so the room is polled (~1.2s) and the turn timer ticks
 * locally between polls using the server clock. Same idea as trivia party.
 */

import type { AliasPlayState, WordResult } from './protocol';

const POLL_MS = 1200;
const TICK_MS = 200;

export function createAliasPolling() {
	let state = $state<AliasPlayState | null>(null);
	let errorMsg = $state('');
	let now = $state(Date.now());

	let roomId: string | null = null;
	let token = '';
	let clockOffset = 0; // serverNow - localNow
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let tickTimer: ReturnType<typeof setInterval> | null = null;

	/** A stable per-room id so guests keep their seat across reloads. */
	function tokenFor(id: string): string {
		const key = `alias_token:${id}`;
		let t = localStorage.getItem(key);
		if (!t) {
			t = crypto.randomUUID();
			localStorage.setItem(key, t);
		}
		return t;
	}

	async function poll() {
		if (!roomId) return;
		try {
			const res = await fetch(`/api/alias/${roomId}/state?token=${encodeURIComponent(token)}`);
			if (!res.ok) return;
			const s = (await res.json()) as AliasPlayState;
			clockOffset = s.serverNow - Date.now();
			state = s;
		} catch {
			/* transient network error — the next tick retries */
		}
	}

	async function post(path: string, body: Record<string, unknown>) {
		if (!roomId) return;
		try {
			const res = await fetch(`/api/alias/${roomId}/${path}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ...body, token })
			});
			if (!res.ok) {
				const b = (await res.json().catch(() => ({}))) as { message?: string };
				errorMsg = b.message ?? `Error ${res.status}`;
				setTimeout(() => (errorMsg = ''), 4000);
			}
			await poll();
		} catch (e: unknown) {
			errorMsg = e instanceof Error ? e.message : 'Request failed';
		}
	}

	return {
		get state() {
			return state;
		},
		get error() {
			return errorMsg;
		},
		/** Seconds left in the current turn (0 outside a turn). */
		get turnTimeLeft() {
			const s = state;
			if (!s?.turnEndsAt) return 0;
			return Math.max(0, Math.ceil((s.turnEndsAt - (now + clockOffset)) / 1000));
		},
		connect(id: string) {
			roomId = id;
			token = tokenFor(id);
			void poll();
			pollTimer = setInterval(poll, POLL_MS);
			tickTimer = setInterval(() => (now = Date.now()), TICK_MS);
		},
		disconnect() {
			if (pollTimer) clearInterval(pollTimer);
			if (tickTimer) clearInterval(tickTimer);
			pollTimer = tickTimer = null;
			roomId = null;
		},
		joinTeam(teamId: string, name: string) {
			return post('join', { teamId, name });
		},
		startGame() {
			return post('start', {});
		},
		wordResult(result: WordResult) {
			return post('word', { result });
		}
	};
}

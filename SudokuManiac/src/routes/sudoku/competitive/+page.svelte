<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { createRoomConnection } from '$lib/competitive/room-connection.svelte';
	import SudokuBoardComponent from '$lib/components/sudoku/SudokuBoard.svelte';
	import GameTimer from '$lib/components/sudoku/GameTimer.svelte';
	import Numpad from '$lib/components/sudoku/Numpad.svelte';
	import type { PageData } from './$types';
	import type { Difficulty, GridSize } from '$lib/games/sudoku/shared.js';

	let { data }: { data: PageData } = $props();

	// ─── Lobby state ────────────────────────────────────────────────────────────
	type View = 'lobby' | 'room' | 'game' | 'results';
	let view = $state<View>('lobby');

	let selectedDifficulty = $state<Difficulty>('medium');
	let selectedGridSize = $state<GridSize>(9);
	let joinCode = $state('');
	let openRooms = $state<
		Array<{
			id: string;
			code: string;
			difficulty: string;
			gridSize: number;
			maxPlayers: number;
			playerCount: number;
		}>
	>([]);
	let lobbyError = $state('');

	// ─── Room / game state ───────────────────────────────────────────────────────
	let boardRef = $state<ReturnType<typeof SudokuBoardComponent> | null>(null);
	let timerRef = $state<ReturnType<typeof GameTimer> | null>(null);
	let timerRunning = $state(false);
	let hintsUsed = $state(0);

	// Progress throttle
	let progressTimer: ReturnType<typeof setInterval> | null = null;

	const conn = createRoomConnection({
		onGameStarted(puzzle) {
			view = 'game';
			timerRunning = true;
			hintsUsed = 0;
			if (progressTimer) clearInterval(progressTimer);
			progressTimer = setInterval(sendProgress, 1500);
		},
		onPlayerFinished(userId) {
			if (userId === data.user.id) {
				timerRunning = false;
				if (progressTimer) {
					clearInterval(progressTimer);
					progressTimer = null;
				}
			}
		},
		onGameFinished() {
			timerRunning = false;
			view = 'results';
			if (progressTimer) {
				clearInterval(progressTimer);
				progressTimer = null;
			}
		},
		onSolveRejected(reason) {
			alert(`Incorrect solution: ${reason}`);
		}
	});

	const room = $derived(conn.state);

	// ─── Helpers ─────────────────────────────────────────────────────────────────

	function sendProgress() {
		if (!room.roomId || !boardRef) return;
		const grid = boardRef.getCurrentGrid();
		if (!grid) return;
		const filled = grid.flat().filter((v) => v !== 0).length;
		conn.sendProgress(room.roomId, grid, filled);
	}

	async function loadOpenRooms() {
		try {
			const res = await fetch('/api/competitive/rooms');
			if (res.ok) openRooms = await res.json();
		} catch {
			/* ignore */
		}
	}

	// ─── Actions ─────────────────────────────────────────────────────────────────

	async function createRoom() {
		lobbyError = '';
		const res = await fetch('/api/competitive/rooms', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				difficulty: selectedDifficulty,
				gridSize: selectedGridSize,
				maxPlayers: 2
			})
		});
		if (!res.ok) {
			lobbyError = await res.text();
			return;
		}
		const created = await res.json();
		enterRoom(created.id);
	}

	async function joinByCode() {
		lobbyError = '';
		const res = await fetch('/api/competitive/rooms/join', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ code: joinCode.trim().toUpperCase() })
		});
		if (!res.ok) {
			lobbyError = await res.text();
			return;
		}
		const joined = await res.json();
		enterRoom(joined.id);
	}

	async function joinById(roomId: string) {
		lobbyError = '';
		const res = await fetch(`/api/competitive/rooms/${roomId}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({})
		});
		if (!res.ok) {
			lobbyError = await res.text();
			return;
		}
		const joined = await res.json();
		enterRoom(joined.id);
	}

	function enterRoom(roomId: string) {
		conn.connect(roomId);
		view = 'room';
	}

	function startGame() {
		if (!room.roomId) return;
		conn.sendStartRoom(room.roomId);
	}

	function handleSolved() {
		if (!room.roomId || !boardRef) return;
		const grid = boardRef.getCurrentGrid();
		if (!grid) return;
		const elapsed = timerRef?.getElapsed() ?? 0;
		conn.sendSolveAttempt(room.roomId, grid, elapsed, hintsUsed);
	}

	function handleRevealHint() {
		boardRef?.revealHint();
		hintsUsed++;
	}

	function backToLobby() {
		conn.disconnect();
		view = 'lobby';
		timerRunning = false;
		hintsUsed = 0;
		loadOpenRooms();
	}

	const DIFFICULTIES: Difficulty[] = ['beginner', 'easy', 'medium', 'hard', 'expert', 'extreme'];
	const GRID_SIZES: GridSize[] = [4, 6, 9];

	onMount(loadOpenRooms);
	onDestroy(() => conn.disconnect());
</script>

<!-- ══════════════════ LOBBY ══════════════════ -->
{#if view === 'lobby'}
<main class="min-h-screen bg-base-200 flex flex-col items-center gap-8 py-12 px-4">
	<h1 class="text-4xl font-bold">Competitive Mode</h1>

	{#if lobbyError}
	<p class="text-error">{lobbyError}</p>
	{/if}

	<!-- Create room -->
	<section class="card bg-base-100 shadow-md w-full max-w-md p-6 flex flex-col gap-4">
		<h2 class="text-xl font-semibold">Create Room</h2>

		<fieldset class="flex flex-col gap-2">
			<legend class="label-text font-medium">Difficulty</legend>
			<div class="flex flex-wrap gap-2">
				{#each DIFFICULTIES as d (d)}
				<button
					class="btn btn-sm {selectedDifficulty === d ? 'btn-primary' : 'btn-outline'}"
					onclick={() => (selectedDifficulty = d)}>{d}</button>
				{/each}
			</div>
		</fieldset>

		<fieldset class="flex flex-col gap-2">
			<legend class="label-text font-medium">Grid size</legend>
			<div class="flex gap-2">
				{#each GRID_SIZES as s (s)}
				<button
					class="btn btn-sm {selectedGridSize === s ? 'btn-primary' : 'btn-outline'}"
					onclick={() => (selectedGridSize = s)}>{s}×{s}</button>
				{/each}
			</div>
		</fieldset>

		<button class="btn btn-primary" onclick={createRoom}>Create & Host</button>
	</section>

	<!-- Join by code -->
	<section class="card bg-base-100 shadow-md w-full max-w-md p-6 flex flex-col gap-3">
		<h2 class="text-xl font-semibold">Join by Code</h2>
		<div class="flex gap-2">
			<input
				class="input input-bordered flex-1 uppercase tracking-widest"
				maxlength="6"
				placeholder="ABC123"
				bind:value={joinCode}
			/>
			<button class="btn btn-secondary" onclick={joinByCode} disabled={joinCode.length < 6}>Join</button>
		</div>
	</section>

	<!-- Open rooms -->
	{#if openRooms.length > 0}
	<section class="card bg-base-100 shadow-md w-full max-w-md p-6 flex flex-col gap-3">
		<h2 class="text-xl font-semibold">Open Rooms</h2>
		{#each openRooms as r (r.id)}
		<div class="flex items-center justify-between border-b border-base-300 pb-2 last:border-0 last:pb-0">
			<span class="font-mono text-sm">{r.code}</span>
			<span class="text-sm text-base-content/60">{r.difficulty} · {r.gridSize}×{r.gridSize}</span>
			<span class="text-sm">{r.playerCount}/{r.maxPlayers}</span>
			<button class="btn btn-xs btn-outline" onclick={() => joinById(r.id)}>Join</button>
		</div>
		{/each}
	</section>
	{/if}
</main>

<!-- ══════════════════ ROOM (waiting) ══════════════════ -->
{:else if view === 'room'}
<main class="min-h-screen bg-base-200 flex flex-col items-center gap-8 py-12 px-4">
	<h1 class="text-3xl font-bold">Room <span class="font-mono text-primary">{room.roomId?.slice(0,8)}</span></h1>

	{#if room.error}
	<p class="text-error">{room.error}</p>
	{/if}

	<section class="card bg-base-100 shadow-md w-full max-w-md p-6 flex flex-col gap-4">
		<div class="flex justify-between text-sm text-base-content/60">
			<span>{room.difficulty} · {room.gridSize}×{room.gridSize}</span>
			<span>{room.players.length}/{room.maxPlayers} players</span>
		</div>

		<ul class="flex flex-col gap-2">
			{#each room.players as p (p.userId)}
			<li class="flex items-center gap-3">
				<span class="flex-1 font-medium">{p.eloRating} ELO</span>
				{#if room.hostId === p.userId}<span class="badge badge-primary badge-sm">Host</span>{/if}
			</li>
			{/each}
		</ul>

		{#if room.hostId === data.user.id}
		<button
			class="btn btn-primary"
			onclick={startGame}
			disabled={room.players.length < 2}>
			{room.players.length < 2 ? 'Waiting for opponent…' : 'Start Game'}
		</button>
		{:else}
		<p class="text-center text-base-content/60">Waiting for host to start…</p>
		{/if}

		<button class="btn btn-ghost btn-sm" onclick={backToLobby}>← Back to lobby</button>
	</section>
</main>

<!-- ══════════════════ GAME ══════════════════ -->
{:else if view === 'game'}
<main class="min-h-screen bg-base-200 flex flex-col items-center gap-4 py-6 px-2">
	<!-- Opponent progress bar -->
	{#each room.players.filter(p => p.userId !== data.user.id) as opponent (opponent.userId)}
	<section class="w-full max-w-lg flex items-center gap-3">
		<span class="text-sm font-medium w-24 truncate">{opponent.eloRating} ELO</span>
		<progress class="progress progress-secondary flex-1" value={opponent.progress} max="100"></progress>
		<span class="text-sm w-10 text-right">{opponent.progress}%</span>
		{#if opponent.finishPosition}<span class="badge badge-success">✓ #{opponent.finishPosition}</span>{/if}
	</section>
	{/each}

	<!-- Timer -->
	<GameTimer
		bind:this={timerRef}
		running={timerRunning}
	/>

	<!-- Board -->
	<SudokuBoardComponent
		bind:this={boardRef}
		puzzle={room.puzzle!}
		solution={[]}
		gridSize={room.gridSize}
		onSolved={handleSolved}
	/>

	<!-- Numpad -->
	<Numpad
		gridSize={room.gridSize}
		onDigit={(n) => boardRef?.placeDigit(n)}
	/>

	<!-- Controls -->
	<section class="flex gap-3">
		<button class="btn btn-sm btn-outline" onclick={handleRevealHint}>💡 Hint</button>
		<button class="btn btn-sm btn-ghost" onclick={backToLobby}>Abandon</button>
	</section>
</main>

<!-- ══════════════════ RESULTS ══════════════════ -->
{:else if view === 'results'}
<main class="min-h-screen bg-base-200 flex flex-col items-center gap-8 py-12 px-4">
	<h1 class="text-4xl font-bold">Results</h1>

	{#if room.finalStandings}
	<section class="card bg-base-100 shadow-md w-full max-w-md p-6">
		<table class="table table-zebra w-full">
			<thead>
				<tr><th>#</th><th>Player</th><th>Time</th><th>ELO</th></tr>
			</thead>
			<tbody>
				{#each room.finalStandings as s (s.userId)}
				<tr class={s.userId === data.user.id ? 'font-bold' : ''}>
					<td>{s.finishPosition ?? '—'}</td>
					<td>{s.name}</td>
					<td>{s.timeSpent != null ? `${s.timeSpent}s` : 'DNF'}</td>
					<td class={s.eloDelta >= 0 ? 'text-success' : 'text-error'}>
						{s.eloDelta >= 0 ? '+' : ''}{s.eloDelta} ({s.newRating})
					</td>
				</tr>
				{/each}
			</tbody>
		</table>
	</section>
	{/if}

	<button class="btn btn-primary" onclick={backToLobby}>Play Again</button>
</main>
{/if}

<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import {
		createRoomConnection,
		getOrCreateGuestId,
		getOrCreateGuestName,
		setGuestName,
		getSavedRoom,
		clearSavedRoom,
		type SavedRoomData
	} from '$lib/competitive/room-connection.svelte';
	import SudokuBoardComponent from '$lib/components/sudoku/SudokuBoard.svelte';
	import GameTimer from '$lib/components/sudoku/GameTimer.svelte';
	import Numpad from '$lib/components/sudoku/Numpad.svelte';
	import DifficultyPicker from '$lib/components/sudoku/DifficultyPicker.svelte';
	import GridSizePicker from '$lib/components/sudoku/GridSizePicker.svelte';
	import type { PageData } from './$types';
	import type { Difficulty, GridSize } from '$lib/games/sudoku/shared.js';

	let { data }: { data: PageData } = $props();

	// ─── Identity ────────────────────────────────────────────────────────────────
	let guestId = $state('');
	let guestName = $state('');
	let editingName = $state(false);
	let nameInput = $state('');

	// ─── Lobby state ─────────────────────────────────────────────────────────────
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
	/** Code from ?room= URL param — triggers invite prompt on load */
	let inviteCode = $state('');
	/** Transient 'copied!' toast visible for a moment */
	let copiedToast = $state(false);

	// ─── Layout mode ─────────────────────────────────────────────────────────────
	type LayoutMode = 'split' | 'pip';
	let layoutMode = $state<LayoutMode>('split');

	// ─── Game state ──────────────────────────────────────────────────────────────
	let boardRef = $state<ReturnType<typeof SudokuBoardComponent> | null>(null);
	let timerRef = $state<ReturnType<typeof GameTimer> | null>(null);
	let timerRunning = $state(false);
	let hintsUsed = $state(0);
	let selectedRow = $state(-1);
	let selectedCol = $state(-1);

	/** Saved room data for reconnect prompt */
	let savedRoom = $state<SavedRoomData | null>(null);
	/** Set when the opponent explicitly left — triggers win overlay */
	let opponentAbandonedName = $state('');
	/** Inline confirmation state for the Leave button */
	let confirmLeave = $state(false);
	/** Grid to restore when entering the game view (empty = new game, populated = reconnect) */
	let gameInitialGrid = $state<number[][]>([]);

	/** Prevents the reconnect $effect from re-entering game view while leaving */
	let leaving = false;

	let progressTimer: ReturnType<typeof setInterval> | null = null;

	const conn = createRoomConnection(
		{
			onGameStarted() {
				gameInitialGrid = []; // fresh game — board starts empty
				view = 'game';
				timerRunning = true;
				hintsUsed = 0;
				if (progressTimer) clearInterval(progressTimer);
				progressTimer = setInterval(sendProgress, 1500);
			},
			onPlayerFinished(userId) {
				if (userId === (data.user?.id ?? guestId)) {
					timerRunning = false;
					clearProgress();
				}
			},
			onGameFinished(_standings, reason) {
				timerRunning = false;
				clearProgress();
				// 'abandoned' case: the win overlay already shows, don't auto-navigate
				if (reason !== 'abandoned') view = 'results';
			},
			onOpponentAbandoned(_userId, name) {
				opponentAbandonedName = name;
				timerRunning = false;
				clearProgress();
			},
			onSolveRejected() {
				// noop — solution stays unverified
			}
		},
		data.user?.id ?? null
	);

	const room = $derived(conn.state);
	const myId = $derived(data.user?.id ?? guestId);
	const opponent = $derived(room.players.find((p) => p.userId !== myId) ?? null);

	function clearProgress() {
		if (progressTimer) {
			clearInterval(progressTimer);
			progressTimer = null;
		}
	}

	// ─── Progress sending ─────────────────────────────────────────────────────────
	function sendProgress() {
		if (!room.roomId || !boardRef) return;
		const grid = boardRef.getCurrentGrid();
		if (!grid) return;
		conn.sendProgress(room.roomId, grid, selectedRow, selectedCol, hintsUsed);
	}

	// ─── Lobby helpers ────────────────────────────────────────────────────────────
	async function loadOpenRooms() {
		try {
			const res = await fetch('/api/competitive/rooms');
			if (res.ok) openRooms = await res.json();
		} catch {
			/* ignore */
		}
	}

	function guestHeaders() {
		if (data.user) return {};
		return { 'x-player-id': guestId, 'x-player-name': guestName };
	}

	// ─── Actions ─────────────────────────────────────────────────────────────────
	async function createRoom() {
		lobbyError = '';
		const res = await fetch('/api/competitive/rooms', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...guestHeaders() },
			body: JSON.stringify({
				difficulty: selectedDifficulty,
				gridSize: selectedGridSize,
				maxPlayers: 2
			})
		});
		if (!res.ok) { lobbyError = await res.text(); return; }
		const created = await res.json();
		enterRoom(created.id, created.code);
	}

	async function joinByCode(code = joinCode) {
		lobbyError = '';
		const res = await fetch('/api/competitive/rooms/join', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				code: code.trim().toUpperCase(),
				guestId: data.user ? undefined : guestId,
				guestName: data.user ? undefined : guestName
			})
		});
		if (!res.ok) { lobbyError = await res.text(); return; }
		const joined = await res.json();
		enterRoom(joined.id, joined.code);
	}

	async function joinById(roomId: string) {
		lobbyError = '';
		const res = await fetch(`/api/competitive/rooms/${roomId}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...guestHeaders() }
		});
		if (!res.ok) { lobbyError = await res.text(); return; }
		const joined = await res.json();
		enterRoom(joined.id);
	}

	function enterRoom(roomId: string, code?: string) {
		conn.connect(roomId);
		view = 'room';
		// Put the room code in the URL so the host can share the tab directly
		const c = code ?? room.roomCode;
		if (c && typeof history !== 'undefined') {
			history.replaceState({}, '', `?room=${c}`);
		}
	}

	function startGame() {
		if (!room.roomId) return;
		conn.sendStartRoom(room.roomId);
	}

	async function handleSolved() {
		if (!room.roomId || !boardRef) return;
		const grid = boardRef.getCurrentGrid();
		if (!grid) return;
		const elapsed = timerRef?.getElapsed() ?? 0;
		await conn.sendSolveAttempt(room.roomId, grid, elapsed, hintsUsed);
	}

	function handleRevealHint() {
		boardRef?.revealHint();
		hintsUsed++;
		sendProgress();
	}

	function handleCellSelect(r: number, c: number) {
		selectedRow = r;
		selectedCol = c;
	}

	function backToLobby() {
		leaving = false;
		conn.disconnect();
		view = 'lobby';
		timerRunning = false;
		hintsUsed = 0;
		selectedRow = -1;
		selectedCol = -1;
		confirmLeave = false;
		opponentAbandonedName = '';
		clearProgress();
		if (typeof history !== 'undefined') history.replaceState({}, '', location.pathname);
		loadOpenRooms();
	}

	/** Explicit leave — notifies server, marks as abandoned, opponent wins. */
	function leaveGame() {
		if (!room.roomId) { backToLobby(); return; }
		leaving = true;
		const roomId = room.roomId;
		backToLobby(); // navigate away immediately
		conn.sendLeave(roomId); // notify server in background
	}

	/** Rejoin an in-progress game from a previous session (saved in localStorage). */
	function rejoinGame() {
		if (!savedRoom) return;
		conn.connect(savedRoom.roomId);
		view = 'room'; // the $effect below will transition to 'game' once room_state arrives
		savedRoom = null;
	}

	/** Copy the invite link and show a brief toast. */
	function copyInviteLink() {
		if (!room.roomCode) return;
		const url = `${location.origin}/sudoku/competitive?room=${room.roomCode}`;
		navigator.clipboard.writeText(url).then(() => {
			copiedToast = true;
			setTimeout(() => (copiedToast = false), 2000);
		});
	}

	function saveName() {
		const trimmed = nameInput.trim();
		if (trimmed) { setGuestName(trimmed); guestName = trimmed; }
		editingName = false;
	}

	onMount(() => {
		guestId = getOrCreateGuestId();
		guestName = getOrCreateGuestName();
		nameInput = guestName;
		loadOpenRooms();
		// If opened via invite link, pre-fill the code and show invite prompt
		const urlCode = new URL(location.href).searchParams.get('room');
		if (urlCode) {
			inviteCode = urlCode.toUpperCase();
			joinCode = inviteCode;
		}
		// Check for an active room from a previous session
		const saved = getSavedRoom();
		if (saved) {
			fetch(`/api/competitive/rooms/${saved.roomId}`)
				.then((r) => (r.ok ? r.json() : null))
				.then((r) => {
					if (r && r.status === 'in_progress') {
						savedRoom = saved;
					} else {
						clearSavedRoom();
					}
				})
				.catch(() => clearSavedRoom());
		}
	});

	/**
	 * When SSE sends room_state with status 'in_progress' while we're on the lobby/room
	 * view (e.g. reconnecting mid-game), jump straight to the game view and restore timer.
	 */
	$effect(() => {
		if (!leaving && room.status === 'in_progress' && (view === 'room' || view === 'lobby') && room.puzzle) {
			const me = room.players.find((p) => p.userId === myId);
			gameInitialGrid = me?.gridState ?? [];
			const saved = typeof localStorage !== 'undefined' ? getSavedRoom() : null;
			const offset = saved?.gameStartedAt
				? Math.floor((Date.now() - saved.gameStartedAt) / 1000)
				: 0;
			view = 'game';
			timerRunning = true;
			if (!progressTimer) progressTimer = setInterval(sendProgress, 1500);
			if (offset > 0) tick().then(() => timerRef?.addOffset(offset));
		}
	});

	onDestroy(() => conn.disconnect());
</script>

<!-- ══════════════════ LOBBY ══════════════════ -->
{#if view === 'lobby'}
<main class="min-h-screen bg-gray-100 flex flex-col items-center gap-8 py-12 px-4">
	<h1 class="text-4xl font-bold">Online Mode</h1>

	<!-- ── Rejoin prompt ── -->
	{#if savedRoom}
	<section class="bg-yellow-50 border border-yellow-300 rounded-xl shadow-md w-full max-w-md p-6 flex flex-col gap-4">
		<div class="flex items-center gap-3">
			<span class="text-3xl">🔄</span>
			<div>
				<p class="font-bold text-lg">You have an active game!</p>
				<p class="text-sm text-gray-400">Room: <span class="font-mono font-bold tracking-widest">{savedRoom.roomCode}</span></p>
			</div>
		</div>
		<div class="flex gap-2">
			<button class="flex-1 px-4 py-2 bg-yellow-500 text-white rounded-lg font-semibold hover:bg-yellow-600 cursor-pointer transition-colors" onclick={rejoinGame}>Return to game</button>
			<button class="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 cursor-pointer transition-colors" onclick={() => { savedRoom = null; clearSavedRoom(); }}>Dismiss</button>
		</div>
	</section>
	{/if}

	<!-- ── Invite prompt ── -->
	{#if inviteCode}
	<section class="bg-blue-50 border border-blue-200 rounded-xl shadow-md w-full max-w-md p-6 flex flex-col gap-4">
		<div class="flex items-center gap-3">
			<span class="text-2xl">🎮</span>
			<div>
				<p class="font-bold text-lg">You've been invited!</p>
				<p class="text-sm text-gray-400">Room code: <span class="font-mono font-bold tracking-widest">{inviteCode}</span></p>
			</div>
		</div>
		{#if !data.user}
		<div class="flex items-center gap-2">
			<span class="text-sm text-gray-400 shrink-0">Your name:</span>
			<input
				class="border border-gray-300 rounded-lg px-2 py-1 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
				bind:value={guestName}
				onchange={() => setGuestName(guestName)}
				maxlength="20"
			/>
		</div>
		{/if}
		{#if lobbyError}<p class="text-red-500 text-sm">{lobbyError}</p>{/if}
		<div class="flex gap-2">
			<button class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 cursor-pointer transition-colors" onclick={() => joinByCode(inviteCode)}>Join Room</button>
			<button class="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 cursor-pointer transition-colors" onclick={() => { inviteCode = ''; joinCode = ''; history.replaceState({}, '', location.pathname); }}>✕</button>
		</div>
	</section>
	{/if}

	<!-- Guest identity banner -->
	{#if !data.user && !inviteCode}
	<section class="bg-white rounded-xl shadow-sm w-full max-w-md p-4 flex items-center gap-3">
		<span class="text-gray-400 text-sm">Playing as:</span>
		{#if editingName}
		<input
			class="border border-gray-300 rounded-lg px-2 py-1 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
			bind:value={nameInput}
			onkeydown={(e) => e.key === 'Enter' && saveName()}
			maxlength="20"
		/>
		<button class="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 cursor-pointer transition-colors" onclick={saveName}>Save</button>
		{:else}
		<span class="font-semibold flex-1">{guestName}</span>
		<button class="px-2 py-1 text-xs rounded-lg hover:bg-gray-100 cursor-pointer transition-colors" onclick={() => (editingName = true)}>✏️ Edit name</button>
		{/if}
	</section>
	{/if}

	{#if lobbyError && !inviteCode}
	<p class="text-red-500 text-sm">{lobbyError}</p>
	{/if}

	<!-- Create room -->
	<section class="bg-white rounded-xl shadow-md w-full max-w-md p-6 flex flex-col gap-4">
		<h2 class="text-xl font-semibold">Create Room</h2>
		<div class="flex flex-col gap-2">
			<span class="text-sm font-medium text-gray-600">Difficulty</span>
			<DifficultyPicker value={selectedDifficulty} onchange={(d) => (selectedDifficulty = d)} />
		</div>
		<div class="flex flex-col gap-2">
			<span class="text-sm font-medium text-gray-600">Grid size</span>
			<GridSizePicker value={selectedGridSize} onchange={(s) => (selectedGridSize = s)} />
		</div>
		<button class="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 cursor-pointer transition-colors" onclick={createRoom}>Create & Host</button>
	</section>

	<!-- Join by code -->
	<section class="bg-white rounded-xl shadow-md w-full max-w-md p-6 flex flex-col gap-3">
		<h2 class="text-xl font-semibold">Join by Code</h2>
		<div class="flex gap-2">
			<input
				class="border border-gray-300 rounded-lg px-3 py-2 flex-1 uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-400"
				maxlength="6"
				placeholder="ABC123"
				bind:value={joinCode}
			/>
			<button class="px-4 py-2 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50 cursor-pointer transition-colors" onclick={() => joinByCode()} disabled={joinCode.length < 6}>Join</button>
		</div>
	</section>

	<!-- Open rooms -->
	{#if openRooms.length > 0}
	<section class="bg-white rounded-xl shadow-md w-full max-w-md p-6 flex flex-col gap-3">
		<h2 class="text-xl font-semibold">Open Rooms</h2>
		{#each openRooms as r (r.id)}
		<div class="flex items-center justify-between border-b border-gray-200 pb-2 last:border-0 last:pb-0">
			<span class="font-mono text-sm">{r.code}</span>
			<span class="text-sm text-gray-400">{r.difficulty} · {r.gridSize}×{r.gridSize}</span>
			<span class="text-sm">{r.playerCount}/{r.maxPlayers}</span>
			<button class="px-2 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors" onclick={() => joinById(r.id)}>Join</button>
		</div>
		{/each}
	</section>
	{/if}
</main>

<!-- ══════════════════ ROOM (waiting) ══════════════════ -->
{:else if view === 'room'}
<main class="min-h-screen bg-gray-100 flex flex-col items-center gap-8 py-12 px-4">
	<h1 class="text-3xl font-bold">Room <span class="font-mono text-blue-600">{room.roomCode}</span></h1>

	<!-- Invite link -->
	{#if room.roomCode}
	<section class="bg-white rounded-xl shadow-md w-full max-w-md p-5 flex flex-col gap-3">
		<p class="text-sm font-medium">Invite a friend — share this link:</p>
		<div class="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
			<span class="text-xs text-gray-400 truncate flex-1 select-all">
				{typeof location !== 'undefined' ? `${location.origin}/sudoku/competitive?room=${room.roomCode}` : `…?room=${room.roomCode}`}
			</span>
		</div>
		<button
			class="w-full px-4 py-2 {copiedToast ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'} text-white rounded-lg font-semibold cursor-pointer transition-colors"
			onclick={copyInviteLink}>
			{#if copiedToast}✅ Copied!{:else}📋 Copy invite link{/if}
		</button>
		<p class="text-xs text-gray-400 text-center">Or share the code: <span class="font-mono font-bold tracking-widest text-blue-600">{room.roomCode}</span></p>
	</section>
	{/if}

	{#if room.error}
	<p class="text-red-500">{room.error}</p>
	{/if}

	<section class="bg-white rounded-xl shadow-md w-full max-w-md p-6 flex flex-col gap-4">
		<div class="flex justify-between text-sm text-gray-400">
			<span>{room.difficulty} · {room.gridSize}×{room.gridSize}</span>
			<span>{room.players.length}/{room.maxPlayers} players</span>
		</div>

		<ul class="flex flex-col gap-2">
			{#each room.players as p (p.userId)}
			<li class="flex items-center gap-3">
				<span class="flex-1 font-medium">{p.name}</span>
				{#if p.userId === myId}<span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">You</span>{/if}
				{#if room.hostId === p.userId}<span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Host</span>{/if}
			</li>
			{/each}
		</ul>

		{#if room.hostId === myId}
		<button class="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 cursor-pointer transition-colors" onclick={startGame} disabled={room.players.length < 2}>
			{room.players.length < 2 ? 'Waiting for opponent…' : 'Start Game!'}
		</button>
		{:else}
		<p class="text-center text-gray-400">Waiting for host to start…</p>
		{/if}

		<button class="px-4 py-2 text-sm rounded-lg hover:bg-gray-100 cursor-pointer transition-colors" onclick={backToLobby}>← Back</button>
	</section>
</main>

<!-- ══════════════════ GAME ══════════════════ -->
{:else if view === 'game'}

<!-- Top bar: leave / timer / layout toggle -->
<header class="fixed top-0 left-0 right-0 z-10 bg-white/90 backdrop-blur-sm border-b border-gray-100 flex items-center justify-between px-3 py-1.5 h-11">
	{#if confirmLeave}
	<div class="flex items-center gap-2 flex-1">
		<span class="text-sm font-medium text-red-500">Leave the game?</span>
		<button class="px-2 py-1 text-xs bg-red-500 text-white rounded-lg font-semibold hover:bg-red-600 cursor-pointer transition-colors" onclick={leaveGame}>Yes, leave</button>
		<button class="px-2 py-1 text-xs rounded-lg hover:bg-gray-100 cursor-pointer transition-colors" onclick={() => (confirmLeave = false)}>Cancel</button>
	</div>
	{:else}
	<button class="px-2 py-1 text-xs rounded-lg hover:bg-gray-100 cursor-pointer transition-colors" onclick={() => (confirmLeave = true)}>🚪 Leave</button>
	<GameTimer bind:this={timerRef} running={timerRunning} />
	<div class="flex gap-1">
		<button
			class="px-2 py-1 text-xs rounded-lg border-2 font-semibold cursor-pointer transition-all
				{layoutMode === 'split' ? 'border-blue-600 bg-blue-100 text-blue-700' : 'border-transparent bg-blue-50 hover:bg-blue-100'}"
			onclick={() => (layoutMode = 'split')}
			title="Split screen">⬛⬛</button>
		<button
			class="px-2 py-1 text-xs rounded-lg border-2 font-semibold cursor-pointer transition-all
				{layoutMode === 'pip' ? 'border-blue-600 bg-blue-100 text-blue-700' : 'border-transparent bg-blue-50 hover:bg-blue-100'}"
			onclick={() => (layoutMode = 'pip')}
			title="Full + floating">⬛◻</button>
	</div>
	{/if}
</header>

<!-- Opponent-left win overlay -->
{#if opponentAbandonedName}
<div class="fixed inset-0 z-30 bg-black/50 flex items-center justify-center p-4">
	<div class="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 flex flex-col gap-4">
		<div class="text-center">
			<span class="text-5xl">🏆</span>
			<h2 class="text-2xl font-bold mt-2">You win!</h2>
			<p class="text-gray-400 text-sm mt-1">{opponentAbandonedName} left the game early</p>
		</div>
		<div class="flex flex-col gap-2">
			<button
				class="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 cursor-pointer transition-colors"
				onclick={() => { opponentAbandonedName = ''; view = 'results'; }}>
				See results
			</button>
			<button class="px-4 py-2 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors" onclick={() => (opponentAbandonedName = '')}>
				Keep solving (for fun)
			</button>
		</div>
	</div>
</div>
{/if}

<!-- SPLIT -->
{#if layoutMode === 'split'}
<main class="pt-11 min-h-screen bg-gray-100 flex flex-col lg:flex-row gap-2 p-2">
	<!-- My side -->
	<section class="flex-1 flex flex-col items-center gap-2">
		<p class="text-xs font-semibold text-gray-400 uppercase tracking-wide">
			You{data.user ? ` · ${data.user.name}` : ` · ${guestName}`}
		</p>
		<SudokuBoardComponent
			bind:this={boardRef}
			puzzle={room.puzzle!}
			solution={[]}
			playerGrid={gameInitialGrid}
			gridSize={room.gridSize}
			onCellSelect={handleCellSelect}
			onSolved={handleSolved}
		/>
		<Numpad gridSize={room.gridSize} onDigit={(n) => boardRef?.placeDigit(n)} />
		<button class="px-3 py-1.5 text-sm border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50 cursor-pointer transition-colors" onclick={handleRevealHint}>💡 Hint</button>
	</section>

	<div class="hidden lg:block w-px bg-gray-200 self-stretch"></div>
	<div class="lg:hidden h-px bg-gray-200 w-full"></div>

	<!-- Opponent side -->
	<section class="flex-1 flex flex-col items-center gap-2">
		{#if opponent}
		<div class="flex items-center gap-2">
			<p class="text-xs font-semibold text-gray-400 uppercase tracking-wide">{opponent.name}</p>
			{#if opponent.finishPosition}<span class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">✓ #{opponent.finishPosition}</span>{/if}
		</div>
		<SudokuBoardComponent
			puzzle={room.puzzle!}
			solution={[]}
			playerGrid={opponent.gridState ?? []}
			gridSize={room.gridSize}
			readonly={true}
			hideDigits={true}
			opponentRow={opponent.selectedRow}
			opponentCol={opponent.selectedCol}
		/>
		<div class="w-full max-w-xs flex items-center gap-2 px-2">
			<progress class="flex-1 h-2 accent-purple-500" value={opponent.progress} max="100"></progress>
			<span class="text-xs w-10 text-right">{opponent.progress}%</span>
		</div>
		{:else}
		<p class="text-gray-300 text-sm mt-8">Waiting for opponent…</p>
		{/if}
	</section>
</main>

<!-- PiP -->
{:else}
<main class="pt-11 min-h-screen bg-gray-100 flex flex-col items-center gap-2 p-2">
	<SudokuBoardComponent
		bind:this={boardRef}
		puzzle={room.puzzle!}
		solution={[]}
		playerGrid={gameInitialGrid}
		gridSize={room.gridSize}
		onCellSelect={handleCellSelect}
		onSolved={handleSolved}
	/>
	<Numpad gridSize={room.gridSize} onDigit={(n) => boardRef?.placeDigit(n)} />
	<button class="px-3 py-1.5 text-sm border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50 cursor-pointer transition-colors" onclick={handleRevealHint}>💡 Hint</button>

	{#if opponent}
	<aside class="fixed bottom-16 right-3 z-20 w-44 rounded-xl overflow-hidden shadow-2xl border-2 border-gray-200 bg-white flex flex-col">
		<header class="px-2 py-1 bg-gray-100 flex items-center justify-between text-xs">
			<span class="font-semibold truncate">{opponent.name}</span>
			{#if opponent.finishPosition}
			<span class="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">✓</span>
			{:else}
			<span class="text-gray-400">{opponent.progress}%</span>
			{/if}
		</header>
		<SudokuBoardComponent
			puzzle={room.puzzle!}
			solution={[]}
			playerGrid={opponent.gridState ?? []}
			gridSize={room.gridSize}
			readonly={true}
			hideDigits={true}
			opponentRow={opponent.selectedRow}
			opponentCol={opponent.selectedCol}
			size={168}
		/>
	</aside>
	{/if}
</main>
{/if}

<!-- ══════════════════ RESULTS ══════════════════ -->
{:else if view === 'results'}
<main class="min-h-screen bg-gray-100 flex flex-col items-center gap-8 py-12 px-4">
	<h1 class="text-4xl font-bold">Results</h1>

	{#if room.finalStandings}
	<section class="bg-white rounded-xl shadow-md w-full max-w-md p-6">
		<table class="w-full text-left border-collapse">
			<thead><tr class="border-b border-gray-200"><th class="pb-2 font-semibold">#</th><th class="pb-2 font-semibold">Player</th><th class="pb-2 font-semibold">Time</th></tr></thead>
			<tbody>
				{#each room.finalStandings as s (s.userId)}
				<tr class="border-b border-gray-100 last:border-0 {s.userId === myId ? 'font-bold' : ''}">
					<td class="py-2">{s.finishPosition ?? '—'}</td>
					<td class="py-2">{s.name}</td>
					<td class="py-2">{s.timeSpent != null ? `${s.timeSpent}s` : 'DNF'}</td>
				</tr>
				{/each}
			</tbody>
		</table>
	</section>
	{/if}

	<button class="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 cursor-pointer transition-colors" onclick={backToLobby}>Play Again</button>
</main>
{/if}


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
	import KraftTopBar from '$lib/components/shared/KraftTopBar.svelte';
	import Pill from '$lib/components/shared/Pill.svelte';
	import XpBar from '$lib/components/shared/XpBar.svelte';
	import { m } from '$lib/paraglide/messages.js';
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

	function enterRoom(roomId: string, code: string) {
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
<competitive-screen class="flex min-h-screen flex-col bg-paper">
	<KraftTopBar title={m.duel_title()} backHref="/sudoku">
		{#snippet right()}
			<Pill accent="var(--color-forest)">● {m.duel_online({ count: openRooms.length + room.players.length })}</Pill>
		{/snippet}
	</KraftTopBar>

	<div class="mx-auto flex w-full max-w-md flex-col items-stretch gap-5 p-4 sm:p-6">

	<!-- ── Rejoin prompt ── -->
	{#if savedRoom}
	<section class="card-kraft kraft-radius flex flex-col gap-4 p-5">
		<div class="flex items-center gap-3">
			<span class="text-3xl">🔄</span>
			<div>
				<p class="m-0 text-lg font-bold text-ink">You have an active game!</p>
				<p class="m-0 text-sm text-muted">Room: <span class="font-hand text-lg font-bold tracking-widest text-navy">{savedRoom.roomCode}</span></p>
			</div>
		</div>
		<div class="flex gap-2">
			<button class="btn-primary kraft-radius-sm flex-1 px-4 py-2 text-lg" onclick={rejoinGame}>Return to game</button>
			<button class="btn-secondary kraft-radius-sm px-3 py-1.5 text-base" onclick={() => { savedRoom = null; clearSavedRoom(); }}>Dismiss</button>
		</div>
	</section>
	{/if}

	<!-- ── Invite prompt ── -->
	{#if inviteCode}
	<section class="card-kraft kraft-radius flex flex-col gap-4 p-5">
		<div class="flex items-center gap-3">
			<span class="text-2xl">🎮</span>
			<div>
				<p class="m-0 text-lg font-bold text-ink">You've been invited!</p>
				<p class="m-0 text-sm text-muted">Room code: <span class="font-hand text-lg font-bold tracking-widest text-navy">{inviteCode}</span></p>
			</div>
		</div>
		{#if !data.user}
		<div class="flex items-center gap-2">
			<span class="label-caps shrink-0">Your name</span>
			<input
				class="flex-1 rounded-[11px] border-[1.5px] border-ink bg-surface-2 px-3 py-1.5 font-hand text-lg font-bold text-ink focus:outline-none"
				bind:value={guestName}
				onchange={() => setGuestName(guestName)}
				maxlength="20"
			/>
		</div>
		{/if}
		{#if lobbyError}<p class="m-0 text-sm text-terracotta-ink">{lobbyError}</p>{/if}
		<div class="flex gap-2">
			<button class="btn-primary kraft-radius-sm flex-1 px-4 py-2 text-lg" onclick={() => joinByCode(inviteCode)}>Join Room</button>
			<button class="btn-secondary kraft-radius-sm px-3 py-1.5 text-base" onclick={() => { inviteCode = ''; joinCode = ''; history.replaceState({}, '', location.pathname); }}>✕</button>
		</div>
	</section>
	{/if}

	<!-- Guest identity banner -->
	{#if !data.user && !inviteCode}
	<section class="card-kraft kraft-radius-sm flex items-center gap-3 p-4">
		<span class="label-caps">Playing as</span>
		{#if editingName}
		<input
			class="flex-1 rounded-[11px] border-[1.5px] border-ink bg-surface-2 px-3 py-1.5 font-hand text-lg font-bold text-ink focus:outline-none"
			bind:value={nameInput}
			onkeydown={(e) => e.key === 'Enter' && saveName()}
			maxlength="20"
		/>
		<button class="btn-primary kraft-radius-sm px-3 py-1.5 text-base" onclick={saveName}>Save</button>
		{:else}
		<span class="flex-1 font-hand text-xl font-bold text-ink">{guestName}</span>
		<button class="btn-secondary kraft-radius-sm px-2.5 py-1 text-sm" onclick={() => (editingName = true)}>✏️ Edit</button>
		{/if}
	</section>
	{/if}

	{#if lobbyError && !inviteCode}
	<p class="m-0 text-center text-sm text-terracotta-ink">{lobbyError}</p>
	{/if}

	<!-- Create room -->
	<section class="card-kraft kraft-radius flex flex-col gap-4 p-5">
		<h2 class="m-0 text-xl">Create room</h2>
		<div class="flex flex-col gap-2">
			<span class="label-caps">{m.duel_difficulty()}</span>
			<DifficultyPicker value={selectedDifficulty} onchange={(d) => (selectedDifficulty = d)} />
		</div>
		<div class="flex flex-col gap-2">
			<span class="label-caps">{m.duel_size()}</span>
			<GridSizePicker value={selectedGridSize} onchange={(s) => (selectedGridSize = s)} />
		</div>
		<button class="btn-primary kraft-radius px-4 py-2.5 text-xl" onclick={createRoom}>Create &amp; Host</button>
	</section>

	<!-- Join by code -->
	<section class="card-kraft kraft-radius flex flex-col gap-3 p-5">
		<h2 class="m-0 text-xl">Join by code</h2>
		<div class="flex gap-2">
			<input
				class="flex-1 rounded-[12px] border-[1.5px] border-ink bg-surface-2 px-3 py-2 text-center font-hand text-2xl font-bold tracking-[2px] text-navy uppercase focus:outline-none"
				maxlength="6"
				placeholder="ABC123"
				bind:value={joinCode}
			/>
			<button class="btn-secondary kraft-radius-sm bg-navy px-4 py-2 text-lg text-surface-2 disabled:opacity-50" style="border-color:#322c24" onclick={() => joinByCode()} disabled={joinCode.length < 6}>Join</button>
		</div>
	</section>

	<!-- Open rooms -->
	{#if openRooms.length > 0}
	<section class="card-kraft kraft-radius flex flex-col gap-1 p-5">
		<h2 class="m-0 mb-2 text-xl">Open rooms</h2>
		{#each openRooms as r (r.id)}
		<div class="flex items-center justify-between border-b-[1.5px] border-dashed border-dash py-2.5 last:border-0">
			<span class="font-hand text-lg font-bold text-navy">{r.code}</span>
			<span class="text-sm text-muted">{r.difficulty} · {r.gridSize}×{r.gridSize}</span>
			<span class="text-sm font-semibold text-ink">{r.playerCount}/{r.maxPlayers}</span>
			<button class="btn-secondary kraft-radius-sm px-2.5 py-1 text-sm" onclick={() => joinById(r.id)}>Join</button>
		</div>
		{/each}
	</section>
	{/if}
	</div>
</competitive-screen>

<!-- ══════════════════ ROOM (waiting) ══════════════════ -->
{:else if view === 'room'}
<competitive-screen class="flex min-h-screen flex-col bg-paper">
	<KraftTopBar title={m.duel_title()} backHref="/sudoku" />

	<div class="mx-auto flex w-full max-w-md flex-col items-stretch gap-5 p-4 sm:p-6">

	<!-- VS / searching panel -->
	<section class="card-kraft kraft-radius p-6">
		{#if opponent}
		<div class="flex items-center justify-between gap-3">
			<div class="flex-1 text-center">
				<div class="mx-auto mb-2 flex size-[66px] items-center justify-center rounded-[17px] border-[1.5px] border-ink bg-surface-2">
					<img src="/sudoku-maniac.webp" alt="" class="size-[50px]" style="image-rendering:pixelated" />
				</div>
				<div class="text-[13px] leading-tight font-semibold text-ink">{data.user?.name ?? guestName}</div>
				<div class="text-[11px] font-medium text-muted">{m.lb_you()}</div>
			</div>
			<div class="font-hand text-4xl leading-none font-bold text-terracotta">{m.duel_vs()}</div>
			<div class="flex-1 text-center">
				<div class="mx-auto mb-2 flex size-[66px] items-center justify-center rounded-[17px] border-[1.5px] border-ink bg-surface-2 font-hand text-3xl font-bold text-navy">{opponent.name.charAt(0).toUpperCase()}</div>
				<div class="text-[13px] leading-tight font-semibold text-ink">{opponent.name}</div>
			</div>
		</div>
		{:else}
		<!-- searching for opponent -->
		<div class="py-2 text-center">
			<div class="relative mx-auto mb-5 size-[150px]">
				<span class="absolute inset-0 animate-spin rounded-full border-2 border-dashed border-[#c2b69c]" style="animation-duration:8s"></span>
				<span class="absolute inset-[18px] rounded-full border-[1.5px] border-hairline"></span>
				<div class="absolute inset-[30px] flex items-center justify-center rounded-full border-[1.5px] border-ink bg-surface-2"><img src="/sudoku-maniac.webp" alt="" class="size-16" style="image-rendering:pixelated" /></div>
			</div>
			<div class="font-display text-2xl font-bold text-ink">{m.duel_finding()}</div>
			<div class="mt-1 text-sm text-ink-soft">{room.difficulty} · {room.gridSize}×{room.gridSize} · {m.duel_whos_faster()}</div>
			<div class="mt-5 flex justify-center gap-2">
				<span class="size-2.5 rounded-full bg-terracotta"></span>
				<span class="size-2.5 rounded-full bg-terracotta opacity-50"></span>
				<span class="size-2.5 rounded-full bg-terracotta opacity-25"></span>
			</div>
		</div>
		{/if}

		<div class="divider-dashed my-5"></div>
		<div class="label-caps mb-2.5">{m.duel_terms()}</div>
		<div class="flex flex-col gap-2">
			<div class="flex justify-between text-[13px] text-ink-soft"><span>{m.duel_difficulty()}</span><span class="font-semibold text-ink capitalize">{room.difficulty}</span></div>
			<div class="flex justify-between text-[13px] text-ink-soft"><span>{m.duel_size()}</span><span class="font-semibold text-ink">{room.gridSize}×{room.gridSize}</span></div>
			<div class="flex justify-between text-[13px] text-ink-soft"><span>{m.duel_victory()}</span><span class="font-semibold text-ink">{m.duel_whos_faster()}</span></div>
		</div>
	</section>

	<!-- Invite link -->
	{#if room.roomCode}
	<section class="card-kraft kraft-radius flex flex-col gap-3 p-5">
		<p class="m-0 text-sm font-semibold text-ink">Invite a friend — share this link:</p>
		<div class="flex items-center gap-2 rounded-[10px] border-[1.5px] border-dashed border-dash bg-surface-2 px-3 py-2">
			<span class="flex-1 truncate text-xs text-muted select-all">
				{typeof location !== 'undefined' ? `${location.origin}/sudoku/competitive?room=${room.roomCode}` : `…?room=${room.roomCode}`}
			</span>
		</div>
		<button
			class="btn-primary kraft-radius-sm w-full px-4 py-2 text-lg {copiedToast ? '!bg-forest' : ''}"
			onclick={copyInviteLink}>
			{#if copiedToast}✅ Copied!{:else}📋 Copy invite link{/if}
		</button>
		<p class="m-0 text-center text-xs text-muted">Or share the code: <span class="font-hand text-base font-bold tracking-widest text-navy">{room.roomCode}</span></p>
	</section>
	{/if}

	{#if room.error}
	<p class="m-0 text-center text-terracotta-ink">{room.error}</p>
	{/if}

	<section class="card-kraft kraft-radius flex flex-col gap-4 p-5">
		<div class="flex justify-between text-sm text-muted">
			<span class="capitalize">{room.difficulty} · {room.gridSize}×{room.gridSize}</span>
			<span>{room.players.length}/{room.maxPlayers} players</span>
		</div>

		<ul class="flex list-none flex-col gap-2 p-0">
			{#each room.players as p (p.userId)}
			<li class="flex items-center gap-3">
				<span class="flex-1 font-semibold text-ink">{p.name}</span>
				{#if p.userId === myId}<span class="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-ink-soft">You</span>{/if}
				{#if room.hostId === p.userId}<span class="rounded-full bg-navy px-2 py-0.5 text-xs font-semibold text-surface-2">Host</span>{/if}
			</li>
			{/each}
		</ul>

		{#if room.hostId === myId}
		<button class="btn-primary kraft-radius px-4 py-2.5 text-xl disabled:opacity-60" onclick={startGame} disabled={room.players.length < 2}>
			{room.players.length < 2 ? 'Waiting for opponent…' : m.duel_ready()}
		</button>
		{:else}
		<p class="m-0 text-center text-muted">Waiting for host to start…</p>
		{/if}

		<button class="btn-secondary kraft-radius-sm px-4 py-2 text-base" onclick={backToLobby}>← Back</button>
	</section>
	</div>
</competitive-screen>

<!-- ══════════════════ GAME ══════════════════ -->
{:else if view === 'game'}

<!-- Top bar: leave / timer / layout toggle -->
<header class="fixed top-0 right-0 left-0 z-10 flex h-12 items-center justify-between border-b-[1.5px] border-dashed border-dash bg-paper-card px-3 py-1.5">
	{#if confirmLeave}
	<div class="flex flex-1 items-center gap-2">
		<span class="text-sm font-semibold text-terracotta-ink">Leave the game?</span>
		<button class="btn-secondary kraft-radius-sm bg-terracotta px-2.5 py-1 text-sm text-surface-2" onclick={leaveGame}>Yes, leave</button>
		<button class="btn-secondary kraft-radius-sm px-2.5 py-1 text-sm" onclick={() => (confirmLeave = false)}>Cancel</button>
	</div>
	{:else}
	<button class="btn-secondary kraft-radius-sm px-2.5 py-1 text-sm" onclick={() => (confirmLeave = true)}>🚪 Leave</button>
	<span class="font-hand text-2xl leading-none font-bold text-ink"><GameTimer bind:this={timerRef} running={timerRunning} /></span>
	<div class="flex gap-1.5">
		<button
			class="kraft-radius-sm border-[1.5px] border-ink px-2 py-1 text-xs font-semibold transition-all
				{layoutMode === 'split' ? 'bg-navy text-surface-2' : 'bg-transparent text-ink'}"
			onclick={() => (layoutMode = 'split')}
			title="Split screen">⬛⬛</button>
		<button
			class="kraft-radius-sm border-[1.5px] border-ink px-2 py-1 text-xs font-semibold transition-all
				{layoutMode === 'pip' ? 'bg-navy text-surface-2' : 'bg-transparent text-ink'}"
			onclick={() => (layoutMode = 'pip')}
			title="Full + floating">⬛◻</button>
	</div>
	{/if}
</header>

<!-- Opponent-left win overlay -->
{#if opponentAbandonedName}
<div class="fixed inset-0 z-30 flex items-center justify-center bg-ink/50 p-4">
	<div class="card-kraft kraft-radius flex w-full max-w-sm flex-col gap-4 p-6 shadow-float">
		<div class="text-center">
			<span class="text-5xl">🏆</span>
			<h2 class="mt-2 text-2xl">You win!</h2>
			<p class="mt-1 text-sm text-muted">{opponentAbandonedName} left the game early</p>
		</div>
		<div class="flex flex-col gap-2">
			<button
				class="btn-primary kraft-radius px-4 py-2.5 text-xl"
				onclick={() => { opponentAbandonedName = ''; view = 'results'; }}>
				See results
			</button>
			<button class="btn-secondary kraft-radius-sm px-4 py-2 text-base" onclick={() => (opponentAbandonedName = '')}>
				Keep solving (for fun)
			</button>
		</div>
	</div>
</div>
{/if}

<!-- SPLIT -->
{#if layoutMode === 'split'}
<main class="flex min-h-screen flex-col gap-2 bg-paper p-2 pt-14 lg:flex-row">
	<!-- My side -->
	<section class="flex flex-1 flex-col items-center gap-2">
		<p class="label-caps text-forest">
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
		<button class="btn-secondary kraft-radius-sm px-4 py-1.5 text-base" onclick={handleRevealHint}>💡 Hint</button>
	</section>

	<div class="hidden w-[1.5px] self-stretch border-l-[1.5px] border-dashed border-dash lg:block"></div>
	<div class="border-t-[1.5px] border-dashed border-dash lg:hidden"></div>

	<!-- Opponent side -->
	<section class="flex flex-1 flex-col items-center gap-2">
		{#if opponent}
		<div class="flex items-center gap-2">
			<p class="label-caps text-terracotta">{opponent.name}</p>
			{#if opponent.finishPosition}<span class="rounded-full bg-forest px-2 py-0.5 text-xs font-semibold text-surface-2">✓ #{opponent.finishPosition}</span>{/if}
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
		<div class="flex w-full max-w-xs items-center gap-2 px-2">
			<XpBar ratio={opponent.progress / 100} color="var(--color-terracotta)" height={14} class="flex-1" />
			<span class="w-10 text-right font-hand text-lg font-bold text-terracotta">{opponent.progress}%</span>
		</div>
		{:else}
		<p class="mt-8 text-sm text-muted">Waiting for opponent…</p>
		{/if}
	</section>
</main>

<!-- PiP -->
{:else}
<main class="flex min-h-screen flex-col items-center gap-2 bg-paper p-2 pt-14">
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
	<button class="btn-secondary kraft-radius-sm px-4 py-1.5 text-base" onclick={handleRevealHint}>💡 Hint</button>

	{#if opponent}
	<aside class="card-kraft fixed right-3 bottom-16 z-20 flex w-44 flex-col overflow-hidden shadow-float" style="border-radius:14px 11px 13px 12px">
		<header class="flex items-center justify-between border-b-[1.5px] border-dashed border-dash bg-paper-card px-2 py-1 text-xs">
			<span class="truncate font-semibold text-ink">{opponent.name}</span>
			{#if opponent.finishPosition}
			<span class="rounded-full bg-forest px-1.5 py-0.5 text-xs font-semibold text-surface-2">✓</span>
			{:else}
			<span class="font-hand text-base font-bold text-terracotta">{opponent.progress}%</span>
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
<competitive-screen class="flex min-h-screen flex-col bg-paper">
	<KraftTopBar title={m.duel_title()} backHref="/sudoku" />
	<div class="mx-auto flex w-full max-w-md flex-col items-stretch gap-6 p-4 pt-10 sm:p-6">
		<h1 class="m-0 text-center text-4xl">Results</h1>

		{#if room.finalStandings}
		<section class="card-kraft kraft-radius overflow-hidden p-5">
			<table class="w-full border-collapse text-left">
				<thead><tr class="border-b-[1.5px] border-dashed border-dash text-muted"><th class="label-caps pb-2">#</th><th class="label-caps pb-2">Player</th><th class="label-caps pb-2 text-right">Time</th></tr></thead>
				<tbody>
					{#each room.finalStandings as s (s.userId)}
					<tr class="border-b-[1.5px] border-dashed border-dash last:border-0 {s.userId === myId ? 'bg-cell-selected-bg' : ''}">
						<td class="py-2.5 font-hand text-xl font-bold text-ink">{s.finishPosition ?? '—'}</td>
						<td class="py-2.5 font-semibold text-ink">{s.name}</td>
						<td class="py-2.5 text-right font-hand text-lg font-bold text-forest">{s.timeSpent != null ? `${s.timeSpent}s` : 'DNF'}</td>
					</tr>
					{/each}
				</tbody>
			</table>
		</section>
		{/if}

		<button class="btn-primary kraft-radius mx-auto px-8 py-2.5 text-xl" onclick={backToLobby}>Play Again</button>
	</div>
</competitive-screen>
{/if}


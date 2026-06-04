<!--
  /sudoku page — main game screen.
  Difficulty picker, PixiJS board, numpad, timer, controls.
  Authenticated users have their sessions saved/resumed automatically.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages.js';
	import SudokuBoardComponent from '$lib/components/sudoku/SudokuBoard.svelte';
	import Numpad from '$lib/components/sudoku/Numpad.svelte';
	import GameTimer from '$lib/components/sudoku/GameTimer.svelte';
	import SaveSlotCard from '$lib/components/sudoku/SaveSlotCard.svelte';
	import DifficultyPicker from '$lib/components/sudoku/DifficultyPicker.svelte';
	import GridSizePicker from '$lib/components/sudoku/GridSizePicker.svelte';
	import PrintModal from '$lib/components/sudoku/PrintModal.svelte';
	import { generatePuzzle } from '$lib/games/sudoku/generator.js';
	import type { Difficulty, Grid, GridSize, SaveSlot } from '$lib/games/sudoku/shared.js';
	import {
		loadGuestSaves,
		createGuestSave,
		updateGuestSave,
		deleteGuestSave
	} from '$lib/games/sudoku/guestSaves.js';
	import {
		recordGuestSolve,
		spendGuestHint,
		loadGuestStats
	} from '$lib/games/sudoku/guestProgress.js';

	let { data } = $props();

	const DIFFICULTIES: Difficulty[] = ['beginner', 'easy', 'medium', 'hard', 'expert', 'extreme'];
	const GRID_SIZES: GridSize[] = [4, 6, 9];

	let difficulty = $state<Difficulty>('medium');
	let gridSize = $state<GridSize>(9);
	let puzzle = $state<Grid>([]);
	let solution = $state<Grid>([]);
	/** Player grid when restoring a saved game. Empty array = new game (board initialises from puzzle). */
	let playerGrid = $state<Grid>([]);
	let gameStarted = $state(false);
	let gameSolved = $state(false);
	let timerRunning = $state(false);
	let boardRef = $state<ReturnType<typeof SudokuBoardComponent> | null>(null);
	let showPrintModal = $state(false);
	let timerRef = $state<ReturnType<typeof GameTimer> | null>(null);

	/** ID of the current DB session row (auth users only) */
	let sessionId = $state<string | null>(null);
	/** ISO date of when the current DB session was created (for save-slot card) */
	let sessionCreatedAt = $state<string | null>(null);
	/** ID of the current localStorage save (guest users only) */
	let localSessionId = $state<string | null>(null);
	/** Auto-save interval handle */
	let saveInterval: ReturnType<typeof setInterval> | null = null;
	/** Number of hints used in the current game */
	let hintsUsed = $state(0);
	/** Unified save slots shown in the lobby */
	let saves = $state<SaveSlot[]>([]);

	onMount(() => {
		if (data.isAuthenticated) {
			saves = data.activeSessions.map((s) => ({
				id: s.id,
				source: 'db' as const,
				difficulty: s.difficulty as Difficulty,
				gridSize: (s.gridSize ?? 9) as GridSize,
				puzzle: (s.puzzle as Grid | null) ?? undefined,
				gridState: s.gridState as Grid,
				solution: s.solution as Grid,
				timeSpent: s.timeSpent,
				createdAt: new Date(s.createdAt).toISOString()
			}));
		} else {
			saves = loadGuestSaves().map((s) => ({ ...s, source: 'local' as const }));
			const gStats = loadGuestStats();
			hintsAvailable = gStats.hintsAvailable;
		}
	});

	async function restoreTimerOffset(seconds: number) {
		// Wait a tick for timerRef to mount, then apply offset
		await Promise.resolve();
		timerRef?.addOffset(seconds);
	}

	async function continueSession(slot: SaveSlot) {
		// Original puzzle (0 = blank) may be absent for saves created before this feature.
		// Fallback: treat gridState as puzzle (old behaviour — givens won't be locked).
		puzzle = slot.puzzle ?? slot.gridState;
		playerGrid = slot.gridState;
		solution = slot.solution;
		difficulty = slot.difficulty;
		gridSize = slot.gridSize;
		gameStarted = true;
		gameSolved = false;
		hintsUsed = 0;
		timerRunning = true;
		timerRef?.reset();
		if (slot.timeSpent > 0) void restoreTimerOffset(slot.timeSpent);
		if (slot.source === 'db') {
			sessionId = slot.id;
			sessionCreatedAt = slot.createdAt;
			localSessionId = null;
		} else {
			localSessionId = slot.id;
			sessionId = null;
		}
		// Remove from saves list while the game is active
		saves = saves.filter((s) => s.id !== slot.id);
		startAutoSave();
	}

	/**
	 * Save current DB session progress and add/update it in the saves list.
	 * Clears sessionId when done. Used by Back to Menu and startGame (auth).
	 */
	async function stashCurrentDbSession() {
		if (!sessionId) return;
		const currentGrid = boardRef?.getCurrentGrid?.() ?? playerGrid;
		const elapsed = timerRef?.getElapsed() ?? 0;
		await fetch(`/api/sudoku/sessions/${sessionId}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ gridState: currentGrid, timeSpent: elapsed })
		});
		const updatedSlot: SaveSlot = {
			id: sessionId,
			source: 'db',
			difficulty,
			gridSize,
			puzzle,
			gridState: currentGrid,
			solution,
			timeSpent: elapsed,
			createdAt: sessionCreatedAt ?? new Date().toISOString()
		};
		saves = [updatedSlot, ...saves.filter((s) => s.id !== sessionId)].slice(0, 3);
		sessionId = null;
		sessionCreatedAt = null;
	}

	async function deleteSlot(slot: SaveSlot) {
		if (slot.source === 'db') {
			await fetch(`/api/sudoku/sessions/${slot.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'abandon', timeSpent: 0 })
			});
		} else {
			deleteGuestSave(slot.id);
		}
		saves = saves.filter((s) => s.id !== slot.id);
	}

	async function startGame(diff?: Difficulty) {
		// Stash / clean up previous sessions
		if (sessionId) {
			await stashCurrentDbSession(); // saves progress, adds to saves list
		}
		if (localSessionId) {
			deleteGuestSave(localSessionId);
			localSessionId = null;
		}

		const generated = generatePuzzle(diff ?? difficulty, gridSize);
		puzzle = generated.puzzle;
		playerGrid = []; // new game — board initialises player grid from puzzle
		solution = generated.solution;
		if (diff) difficulty = diff;
		gameStarted = true;
		gameSolved = false;
		hintsUsed = 0;
		timerRunning = true;
		timerRef?.reset();

		if (data.isAuthenticated) {
			const res = await fetch('/api/sudoku/sessions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					difficulty: diff ?? difficulty,
					puzzle: generated.puzzle,
					gridState: generated.puzzle,
					solution: generated.solution,
					gridSize
				})
			});
			if (res.ok) {
				const newSession = await res.json();
				sessionId = newSession.id ?? null;
				sessionCreatedAt = newSession.createdAt
					? new Date(newSession.createdAt).toISOString()
					: new Date().toISOString();
				startAutoSave();
			}
		} else {
			const save = createGuestSave({
				difficulty: diff ?? difficulty,
				gridSize,
				puzzle: generated.puzzle,
				gridState: generated.puzzle,
				solution: generated.solution
			});
			localSessionId = save.id;
			saves = loadGuestSaves().map((s) => ({ ...s, source: 'local' as const }));
			startAutoSave();
		}
	}

	function startAutoSave() {
		stopAutoSave();
		saveInterval = setInterval(() => void autoSave(), 30_000);
	}

	function stopAutoSave() {
		if (saveInterval != null) {
			clearInterval(saveInterval);
			saveInterval = null;
		}
	}

	async function autoSave() {
		if (gameSolved) return;
		const currentGrid = boardRef?.getCurrentGrid?.() ?? puzzle;
		const elapsed = timerRef?.getElapsed() ?? 0;
		if (sessionId) {
			await fetch(`/api/sudoku/sessions/${sessionId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ gridState: currentGrid, timeSpent: elapsed })
			});
		} else if (localSessionId) {
			updateGuestSave(localSessionId, { gridState: currentGrid, timeSpent: elapsed });
		}
	}

	let hintsAvailable = $state<number | null>(null);
	/** Show "Sign in to sync" nudge after a guest solves a puzzle */
	let showSyncNudge = $state(false);

	/** Toast notifications for achievements / level-up */
	interface Toast {
		id: number;
		icon: string;
		text: string;
	}
	let toasts = $state<Toast[]>([]);
	let toastSeq = 0;

	function showToast(icon: string, text: string) {
		const id = ++toastSeq;
		toasts = [...toasts, { id, icon, text }];
		setTimeout(() => {
			toasts = toasts.filter((t) => t.id !== id);
		}, 4000);
	}

	async function handleSolved() {
		gameSolved = true;
		timerRunning = false;
		stopAutoSave();

		if (sessionId) {
			const res = await fetch(`/api/sudoku/sessions/${sessionId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'complete',
					timeSpent: timerRef?.getElapsed() ?? 0,
					hintsUsed: hintsUsed,
					difficulty
				})
			});
			sessionId = null;

			if (res.ok) {
				const result = await res.json();
				if (result?.xpGained) showToast('⭐', `+${result.xpGained} XP`);
				if (result?.levelUp) showToast('🎉', `Level up! Now Level ${result.newLevel}`);
				if (result?.hintsReplenished) {
					hintsAvailable = (hintsAvailable ?? 0) + result.hintsReplenished;
					showToast('💡', `+${result.hintsReplenished} hint`);
				}
				for (const ach of result?.newAchievements ?? []) {
					showToast(ach.icon, `Achievement: ${ach.title}`);
				}
			}
		} else if (localSessionId) {
			const lsId = localSessionId;
			localSessionId = null;
			deleteGuestSave(lsId);
			saves = saves.filter((s) => s.id !== lsId);
			// Record guest solve + award achievements
			const result = recordGuestSolve({
				difficulty,
				timeSpent: timerRef?.getElapsed() ?? 0,
				hintsUsed
			});
			if (result.xpGained) showToast('⭐', m.toast_xp_gained({ xp: result.xpGained }));
			if (result.levelUp) showToast('🎉', m.toast_level_up({ level: result.newLevel }));
			for (const ach of result.newAchievements) showToast(ach.icon, m.toast_achievement({ title: ach.title }));
			hintsAvailable = loadGuestStats().hintsAvailable;
			showSyncNudge = true;
		}
	}

	const DIFFICULTY_LABELS: Record<string, () => string> = {
		beginner: m.difficulty_beginner,
		easy: m.difficulty_easy,
		medium: m.difficulty_medium,
		hard: m.difficulty_hard,
		expert: m.difficulty_expert,
		extreme: m.difficulty_extreme
	};

	/** Translated difficulty name */
	function diffLabel(d: string): string {
		return DIFFICULTY_LABELS[d]?.() ?? d;
	}

	function startRandom() {
		const random = DIFFICULTIES[Math.floor(Math.random() * DIFFICULTIES.length)];
		void startGame(random);
	}

	function handleDigit(n: number) {
		boardRef?.placeDigit(n);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!gameStarted || gameSolved) return;
		if (e.key >= '1' && e.key <= '9') {
			boardRef?.placeDigit(Number(e.key));
		} else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
			boardRef?.placeDigit(0);
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if showPrintModal}
	<PrintModal
		onclose={() => (showPrintModal = false)}
		diffLabelFn={diffLabel}
		initialPuzzle={gameStarted && puzzle.length > 0
			? { puzzle, playerGrid: boardRef?.getCurrentGrid?.() ?? playerGrid, difficulty, gridSize }
			: null}
	/>
{/if}

<sudoku-page class="flex flex-col items-center w-full max-w-lg mx-auto px-3 py-4 gap-4 sm:px-4 sm:py-6 sm:gap-6">
	<h1 class="text-4xl font-extrabold m-0">SudokuManiac <img src="/sudoku-maniac.webp" alt="SudokuManiac" class="inline-block size-7 -mt-1"></h1>

	{#if !gameStarted}
		<game-lobby class="flex flex-col items-center gap-6 w-full">

			<!-- Save slots -->
			{#if saves.length > 0}
				<saves-section class="flex flex-col gap-3 w-full max-w-sm">
					<h2 class="m-0 text-base font-semibold text-gray-500 uppercase tracking-wide">{m.sudoku_continue_playing()}</h2>
					{#each saves as slot (slot.id)}
						<SaveSlotCard
							{slot}
							onContinue={() => void continueSession(slot)}
							onDelete={() => void deleteSlot(slot)}
						/>
					{/each}
				</saves-section>
				<divider class="w-full max-w-sm border-t border-gray-200"></divider>
			{/if}

			<!-- Other game modes -->
			<other-modes class="grid grid-cols-2 gap-3 w-full max-w-sm">
				<a
					href={resolve('/sudoku/story')}
					class="flex flex-col gap-1.5 p-4 rounded-xl border-2 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 transition-colors no-underline"
				>
					<span class="text-2xl">📖</span>
				<span class="font-bold text-indigo-800">{m.sudoku_story_mode()}</span>
				<span class="text-xs text-indigo-500">{m.sudoku_story_desc()}</span>
				</a>
				<a
					href={resolve('/sudoku/competitive')}
					class="flex flex-col gap-1.5 p-4 rounded-xl border-2 border-rose-200 bg-rose-50 hover:bg-rose-100 transition-colors no-underline"
				>
					<span class="text-2xl">⚡</span>
				<span class="font-bold text-rose-800">{m.sudoku_competitive()}</span>
				<span class="text-xs text-rose-500">{m.sudoku_competitive_desc()}</span>
				</a>
				<button
					class="col-span-2 flex items-center gap-3 p-4 rounded-xl border-2 border-gray-200 bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors text-left"
					onclick={() => (showPrintModal = true)}
				>
					<span class="text-2xl">🖨️</span>
					<div class="flex flex-col">
						<span class="font-bold text-gray-700">{m.sudoku_print_puzzles()}</span>
						<span class="text-xs text-gray-400">{m.sudoku_print_desc()}</span>
					</div>
				</button>
			</other-modes>

			<divider class="w-full max-w-sm border-t border-gray-200"></divider>

			<!-- Quick Play -->
			<h2 class="m-0 text-base font-semibold text-gray-500 uppercase tracking-wide">{m.sudoku_quick_play()}</h2>

			<difficulty-grid class="max-w-sm">
				<DifficultyPicker value={difficulty} onchange={(d) => (difficulty = d)} labelFn={diffLabel} />
			</difficulty-grid>

			<settings-row class="flex flex-col items-center gap-2">
				<span class="text-sm font-semibold text-gray-600">{m.sudoku_grid_size()}</span>
				<size-selector class="flex gap-2">
					<GridSizePicker value={gridSize} onchange={(s) => (gridSize = s)} />
				</size-selector>
			</settings-row>

			<lobby-actions class="flex gap-3 items-center justify-center">
				<button
					class="px-10 py-3 bg-blue-600 text-white text-lg font-bold rounded-xl border-0 cursor-pointer hover:bg-blue-700 transition-colors"
					onclick={() => void startGame()}
				>
					{m.sudoku_start_game()}
				</button>
				<button
					class="px-6 py-3 bg-violet-600 text-white text-lg font-bold rounded-xl border-0 cursor-pointer hover:bg-violet-700 transition-colors"
					onclick={startRandom}
				>
					{m.sudoku_random()}
				</button>
			</lobby-actions>
		</game-lobby>
	{:else}
		<game-screen class="flex flex-col items-center gap-3 w-full sm:gap-4">
			<game-header class="flex items-center justify-between w-full">
				<difficulty-badge class="inline-block px-3 py-1 rounded-full bg-blue-100 text-blue-700 font-bold text-sm">
					{diffLabel(difficulty)}
				</difficulty-badge>

				<GameTimer bind:this={timerRef} running={timerRunning} />

				<header-actions class="flex gap-2">
					<button
						class="px-3 py-1.5 rounded-md border border-gray-300 bg-white font-semibold cursor-pointer hover:bg-blue-50 transition-colors"
						title="New game"
						onclick={() => void startGame()}
				>{m.sudoku_new_game()}</button>
					<button
						class="px-3 py-1.5 rounded-md border border-gray-300 bg-white font-semibold cursor-pointer hover:bg-blue-50 transition-colors"
						title="Random game"
						onclick={startRandom}
					>🎲</button>
				</header-actions>
			</game-header>

			{#if gameSolved}
				<solved-banner class="block w-full text-center py-2.5 bg-green-100 text-green-800 rounded-lg font-bold text-lg">
				{m.sudoku_solved()}
				</solved-banner>
			{/if}

			<board-wrap class="block w-full rounded-lg shadow-lg overflow-hidden">
				<SudokuBoardComponent
					bind:this={boardRef}
					{puzzle}
					{solution}
					{playerGrid}
					{gridSize}
					onSolved={() => void handleSolved()}
				/>
			</board-wrap>

			<Numpad onDigit={handleDigit} {gridSize} />

			<game-footer class="flex gap-3 flex-wrap justify-center">
				{#if hintsAvailable !== null && hintsAvailable > 0 && !gameSolved}
					<button
						class="px-5 py-2 border border-amber-400 bg-amber-50 text-amber-700 rounded-lg font-semibold cursor-pointer hover:bg-amber-100 transition-colors"
						onclick={async () => {
						if (data.isAuthenticated) {
							if (!sessionId) return;
							const res = await fetch('/api/sudoku/hints', { method: 'POST' });
							if (res.ok) {
								const d = await res.json();
								hintsAvailable = d.hintsAvailable;
								hintsUsed++;
								boardRef?.revealHint();
							}
						} else {
							const remaining = spendGuestHint();
							if (remaining !== null) {
								hintsAvailable = remaining;
								hintsUsed++;
								boardRef?.revealHint();
							}
							}
						}}
					>
						{m.sudoku_hint({ count: hintsAvailable })}
					</button>
				{/if}
				<button
					class="px-5 py-2 border border-gray-300 rounded-lg bg-white font-semibold cursor-pointer hover:bg-gray-50 transition-colors"
					onclick={() => (showPrintModal = true)}
					title="Print puzzles"
			>{m.sudoku_print()}</button>
				<button
					class="px-5 py-2 border border-gray-300 rounded-lg bg-white font-semibold cursor-pointer hover:bg-blue-50 transition-colors"
					onclick={async () => {
						if (!gameSolved) {
							if (sessionId) {
								await stashCurrentDbSession();
							} else if (localSessionId) {
								const currentGrid = boardRef?.getCurrentGrid?.() ?? puzzle;
								updateGuestSave(localSessionId, { gridState: currentGrid, timeSpent: timerRef?.getElapsed() ?? 0 });
								saves = loadGuestSaves().map((s) => ({ ...s, source: 'local' as const }));
								localSessionId = null;
							}
						}
						stopAutoSave();
						gameStarted = false;
						timerRunning = false;
					}}
				>
					{m.sudoku_back_to_menu()}
				</button>
			</game-footer>
		</game-screen>
	{/if}
</sudoku-page>

<!-- Toast notifications -->
{#if toasts.length > 0}
	<toast-container class="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
		{#each toasts as toast (toast.id)}
			<toast-item class="flex items-center gap-2 px-4 py-3 bg-gray-900 text-white rounded-xl shadow-lg text-sm font-semibold animate-bounce-in">
				<span>{toast.icon}</span>
				<span>{toast.text}</span>
			</toast-item>
		{/each}
	</toast-container>
{/if}

<!-- Sign-in sync nudge (guests only, shown after solving) -->
{#if showSyncNudge && !data.isAuthenticated}
	<sync-nudge class="fixed bottom-4 left-4 flex items-center gap-3 bg-white border border-blue-200 shadow-lg rounded-xl px-4 py-3 max-w-xs">
		<span class="text-2xl shrink-0">☁️</span>
		<sync-text class="flex flex-col gap-0.5">
			<p class="m-0 text-sm font-semibold text-gray-800">{m.sync_saved_locally()}</p>
			<p class="m-0 text-xs text-gray-500">
				<a href={resolve('/sign-in')} class="text-blue-600 font-semibold no-underline hover:underline">{m.sync_sign_in()}</a>
				{m.sync_across_devices()}
			</p>
		</sync-text>
		<button
			onclick={() => (showSyncNudge = false)}
			class="ml-auto text-gray-400 hover:text-gray-600 border-0 bg-transparent cursor-pointer text-lg leading-none shrink-0"
		>×</button>
	</sync-nudge>
{/if}

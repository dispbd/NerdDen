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
	import KraftAvatar from '$lib/components/shared/KraftAvatar.svelte';
	import StatTile from '$lib/components/shared/StatTile.svelte';
	import DayStreak from '$lib/components/shared/DayStreak.svelte';
	import Pill from '$lib/components/shared/Pill.svelte';
	import XpBar from '$lib/components/shared/XpBar.svelte';
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
	/** Lobby right-rail stats (solved / best time / streak) — DB for auth, localStorage for guests */
	let lobbyStats = $state<{ solved: number; bestTime: number | null; streak: number } | null>(null);

	/** Last 7 calendar days as closed/open cells for the streak card (approximation). */
	const streakWeek = $derived.by(() => {
		const streak = lobbyStats?.streak ?? 0;
		const INI = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
		const days: boolean[] = [];
		const labels: string[] = [];
		const today = new Date();
		for (let i = 6; i >= 0; i--) {
			const d = new Date(today);
			d.setDate(d.getDate() - i);
			labels.push(INI[d.getDay()]);
			days.push(i < Math.min(streak, 7));
		}
		return { days, labels };
	});

	function fmtBest(seconds: number | null): string {
		if (seconds == null) return '—';
		const m = Math.floor(seconds / 60);
		const s = seconds % 60;
		return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	}

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
			lobbyStats = data.stats;
		} else {
			saves = loadGuestSaves().map((s) => ({ ...s, source: 'local' as const }));
			const gStats = loadGuestStats();
			hintsAvailable = gStats.hintsAvailable;
			lobbyStats = {
				solved: gStats.sudokuSolved,
				bestTime: gStats.sudokuBestTimeSeconds,
				streak: gStats.streakDays
			};
		}

		// Auto-start from Custom mode handoff (/sudoku/custom → /sudoku?…&autostart=1)
		const sp = new URLSearchParams(location.search);
		if (sp.get('autostart') === '1') {
			const d = sp.get('difficulty') as Difficulty | null;
			const s = Number(sp.get('size'));
			if (s === 4 || s === 6 || s === 9) gridSize = s as GridSize;
			const diff = d && DIFFICULTIES.includes(d) ? d : difficulty;
			// Clean the URL so a refresh doesn't restart the game
			history.replaceState(null, '', location.pathname);
			void startGame(diff);
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

	async function startGame(diff: Difficulty | undefined = undefined) {
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

	// ─── Victory modal stats ──────────────────────────────────────────────────────
	let victoryTime = $state('00:00');
	let victoryXp = $state(0);
	let victoryStreak = $state(1);

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
		victoryTime = fmtBest(timerRef?.getElapsed() ?? 0);
		victoryXp = 0;
		victoryStreak = 1;

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
				victoryXp = result?.xpGained ?? 0;
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
			victoryXp = result.xpGained ?? 0;
			if (result.xpGained) showToast('⭐', m.toast_xp_gained({ xp: result.xpGained }));
			if (result.levelUp) showToast('🎉', m.toast_level_up({ level: result.newLevel }));
			for (const ach of result.newAchievements) showToast(ach.icon, m.toast_achievement({ title: ach.title }));
			const gstats = loadGuestStats();
			hintsAvailable = gstats.hintsAvailable;
			victoryStreak = gstats.streakDays || 1;
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

	// ─── In-game derived board state (numpad badges, progress, mistakes) ──────────
	let numpadCounts = $state<number[]>([]);
	/** 0..1 fill ratio for the progress bar under the board */
	let boardProgress = $state(0);
	/** Current incorrect cells (display only; the "/3" limit is not enforced — stub) */
	let mistakes = $state(0);
	/** Notes/pencil-marks toggle — visual stub (input logic not implemented yet) */
	let notesMode = $state(false);

	function refreshFromGrid(g: Grid) {
		if (!g?.length) return;
		const counts = Array(gridSize).fill(gridSize);
		let filled = 0;
		let mist = 0;
		for (let r = 0; r < g.length; r++) {
			for (let c = 0; c < g[r].length; c++) {
				const v = g[r][c];
				if (v >= 1 && v <= gridSize) {
					counts[v - 1]--;
					filled++;
					if (solution.length && v !== solution[r][c]) mist++;
				}
			}
		}
		numpadCounts = counts.map((x) => Math.max(0, x));
		boardProgress = filled / (gridSize * gridSize);
		mistakes = mist;
	}

	function refreshBoard() {
		refreshFromGrid(boardRef?.getCurrentGrid?.() ?? (playerGrid.length ? playerGrid : puzzle));
	}

	// Initial / on-new-puzzle counts (board may not have mounted yet)
	$effect(() => {
		if (gameStarted && puzzle.length) refreshFromGrid(playerGrid.length ? playerGrid : puzzle);
	});

	function handleDigit(n: number) {
		boardRef?.placeDigit(n);
		refreshBoard();
	}

	function handleErase() {
		boardRef?.placeDigit(0);
		refreshBoard();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!gameStarted || gameSolved) return;
		if (e.key >= '1' && e.key <= '9') {
			boardRef?.placeDigit(Number(e.key));
			refreshBoard();
		} else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
			boardRef?.placeDigit(0);
			refreshBoard();
		}
	}

	/** Spend a hint and reveal a cell (auth → server, guest → localStorage). */
	async function useHint() {
		if (gameSolved || hintsAvailable === null || hintsAvailable <= 0) return;
		if (data.isAuthenticated) {
			if (!sessionId) return;
			const res = await fetch('/api/sudoku/hints', { method: 'POST' });
			if (res.ok) {
				const d = await res.json();
				hintsAvailable = d.hintsAvailable;
				hintsUsed++;
				boardRef?.revealHint();
				refreshBoard();
			}
		} else {
			const remaining = spendGuestHint();
			if (remaining !== null) {
				hintsAvailable = remaining;
				hintsUsed++;
				boardRef?.revealHint();
				refreshBoard();
			}
		}
	}

	/** Save progress and return to the lobby. */
	async function backToMenu() {
		if (!gameSolved) {
			if (sessionId) {
				await stashCurrentDbSession();
			} else if (localSessionId) {
				const currentGrid = boardRef?.getCurrentGrid?.() ?? puzzle;
				updateGuestSave(localSessionId, {
					gridState: currentGrid,
					timeSpent: timerRef?.getElapsed() ?? 0
				});
				saves = loadGuestSaves().map((s) => ({ ...s, source: 'local' as const }));
				localSessionId = null;
			}
		}
		stopAutoSave();
		gameStarted = false;
		timerRunning = false;
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

{#snippet modeCard(href: string, glyph: string, accent: string, title: string, desc: string)}
	<a
		{href}
		class="card-kraft kraft-radius-sm flex flex-col gap-2 p-4 no-underline transition-transform hover:-translate-y-0.5"
	>
		<span
			class="flex size-10 items-center justify-center rounded-[11px] border-[1.5px] border-ink font-hand text-lg font-bold text-surface-2"
			style="background:{accent}"
		>{glyph}</span>
		<span class="font-display text-base font-bold text-ink">{title}</span>
		<span class="text-xs text-ink-soft">{desc}</span>
	</a>
{/snippet}

{#if !gameStarted}
	<lobby-screen class="mx-auto flex w-full max-w-5xl flex-col gap-7 px-3 py-6 sm:px-4">
		<!-- Hero -->
		<lobby-hero class="flex items-center gap-4">
			<KraftAvatar mascot size={70} radius={16} />
			<div>
				<h1 class="m-0 text-4xl leading-none">{m.nav_sudoku()}</h1>
				<p class="m-0 mt-1.5 text-sm text-ink-soft">{m.sudoku_hero_subtitle()}</p>
			</div>
		</lobby-hero>

		<lobby-cols class="flex flex-col gap-6 lg:flex-row lg:items-start">
			<!-- Main column -->
			<main-col class="order-2 flex min-w-0 flex-1 flex-col gap-6 lg:order-1">
				<!-- Quick game -->
				<section class="card-kraft kraft-radius flex flex-col gap-5 p-5">
					<h2 class="label-caps m-0">{m.sudoku_quick_play()}</h2>
					<div class="flex flex-col gap-2">
						<span class="field-label">{m.custom_difficulty()}</span>
						<DifficultyPicker value={difficulty} onchange={(d) => (difficulty = d)} labelFn={diffLabel} />
					</div>
					<div class="flex flex-col gap-2">
						<span class="field-label">{m.sudoku_grid_size()}</span>
						<GridSizePicker value={gridSize} onchange={(s) => (gridSize = s)} />
					</div>
					<div class="flex flex-wrap gap-3">
						<button class="btn-primary kraft-radius flex-1 px-6 py-2.5 text-xl" onclick={() => void startGame()}>
							{m.sudoku_start_game()}
						</button>
						<button class="btn-secondary kraft-radius px-6 py-2.5 text-xl" onclick={startRandom}>
							{m.sudoku_random_mode()}
						</button>
					</div>
				</section>

				<!-- Game modes -->
				<section class="grid grid-cols-2 gap-3">
					{@render modeCard(resolve('/sudoku/story'), '▶', 'var(--color-terracotta)', m.sudoku_story_mode(), m.sudoku_story_desc())}
					{@render modeCard(resolve('/sudoku/custom'), '▤', 'var(--color-navy)', m.sudoku_custom(), m.sudoku_custom_desc())}
					<button
						onclick={startRandom}
						class="card-kraft kraft-radius-sm flex cursor-pointer flex-col gap-2 p-4 text-left transition-transform hover:-translate-y-0.5"
					>
						<span class="flex size-10 items-center justify-center rounded-[11px] border-[1.5px] border-ink text-lg" style="background:var(--color-mustard)">🎲</span>
						<span class="font-display text-base font-bold text-ink">{m.sudoku_random_mode()}</span>
						<span class="text-xs text-ink-soft">{m.sudoku_random_desc()}</span>
					</button>
					{@render modeCard(resolve('/sudoku/competitive'), 'VS', 'var(--color-forest)', m.sudoku_competitive(), m.sudoku_competitive_desc())}
				</section>

				<!-- Print -->
				<button
					class="btn-secondary kraft-radius-sm self-start px-4 py-1.5 text-base"
					onclick={() => (showPrintModal = true)}
				>🖨️ {m.sudoku_print_puzzles()}</button>
			</main-col>

			<!-- Right rail -->
			<aside class="order-1 flex w-full flex-col gap-5 lg:order-2 lg:w-[316px] lg:flex-none">
				{#if saves.length > 0}
					<section class="flex flex-col gap-3">
						<h2 class="label-caps m-0">{m.sudoku_continue_playing()}</h2>
						{#each saves as slot (slot.id)}
							<SaveSlotCard
								{slot}
								{diffLabel}
								onContinue={() => void continueSession(slot)}
								onDelete={() => void deleteSlot(slot)}
							/>
						{/each}
					</section>
				{/if}

				<!-- Day streak (desktop) -->
				<div class="hidden lg:block">
					<DayStreak days={streakWeek.days} labels={streakWeek.labels} count={lobbyStats?.streak ?? 0} title={m.stat_day_streak()} />
				</div>

				<!-- Mini stats (desktop) -->
				<div class="hidden grid-cols-2 gap-3 lg:grid">
					<StatTile value={lobbyStats?.solved ?? 0} label={m.stat_solved()} valueSize={28} radius="13px 10px 12px 11px" />
					<StatTile value={fmtBest(lobbyStats?.bestTime ?? null)} label={m.stat_best_time()} color="var(--color-forest)" valueSize={28} radius="10px 13px 11px 12px" />
				</div>
			</aside>
		</lobby-cols>
	</lobby-screen>
	{:else}
		<game-screen class="mx-auto flex w-full max-w-5xl flex-col gap-5 px-3 py-5 sm:px-4 sm:py-6">
			<!-- controls -->
			<game-controls class="flex items-center justify-between gap-3">
				<div class="flex items-center gap-2 sm:gap-3">
					<button class="btn-secondary kraft-radius-sm bg-surface px-3 py-1 text-lg sm:px-4 sm:text-xl" onclick={() => void backToMenu()}>← <span class="hidden sm:inline">{m.topbar_menu()}</span></button>
					<Pill variant="solid"><span class="capitalize">{diffLabel(difficulty)}</span> · {gridSize}×{gridSize}</Pill>
				</div>
				<div class="flex items-center gap-3 sm:gap-4">
					<div class="flex items-center gap-1.5">
						<span class="label-caps hidden sm:inline">{m.game_mistakes()}</span>
						<span class="font-hand text-xl leading-none font-bold" style="color:{mistakes > 0 ? 'var(--color-marker-red)' : 'var(--color-muted)'}">{mistakes}</span>
						<span class="text-sm text-muted">/3</span>
					</div>
					<GameTimer bind:this={timerRef} running={timerRunning} />
					<button class="flex size-9 flex-none cursor-pointer items-center justify-center rounded-[10px] border-[1.5px] border-ink bg-surface text-sm" aria-label="Pause" onclick={() => (timerRunning = !timerRunning)}>{timerRunning ? '⏸' : '▶'}</button>
				</div>
			</game-controls>

			<!-- body -->
			<game-body class="flex flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-center">
				<!-- board -->
				<board-col class="flex w-full max-w-md flex-col gap-3.5 lg:w-auto lg:flex-none">
					<board-wrap class="block overflow-hidden border-[2.5px] border-ink bg-[#fbf8f1] shadow-[3px_5px_0_rgba(50,44,36,.18)]" style="border-radius:14px">
						<SudokuBoardComponent
							bind:this={boardRef}
							{puzzle}
							{solution}
							{playerGrid}
							{gridSize}
							onSolved={() => void handleSolved()}
						/>
					</board-wrap>
					<div class="flex items-center gap-2.5 px-1">
						<XpBar ratio={boardProgress} color="var(--color-forest)" height={8} class="flex-1" />
						<span class="w-9 text-right text-xs font-semibold text-ink-soft">{Math.round(boardProgress * 100)}%</span>
					</div>
				</board-col>

				<!-- panel -->
				<panel-col class="flex w-full max-w-md flex-col gap-5 lg:w-[330px] lg:flex-none">
					<Numpad onDigit={handleDigit} {gridSize} counts={numpadCounts} showErase={false} />

					<div class="grid grid-cols-4 gap-2.5 lg:grid-cols-2">
						<button class="btn-secondary kraft-radius-sm shadow-btn-sm flex flex-col items-center gap-0.5 bg-surface px-0 py-2 text-base lg:flex-row lg:justify-center lg:gap-1.5 lg:text-lg" onclick={handleErase}><span>↶</span><span>{m.game_undo()}</span></button>
						<button class="btn-secondary kraft-radius-sm shadow-btn-sm flex flex-col items-center gap-0.5 bg-surface px-0 py-2 text-base !text-terracotta-ink lg:flex-row lg:justify-center lg:gap-1.5 lg:text-lg" onclick={handleErase}><span>⌫</span><span>{m.game_erase()}</span></button>
						<button class="kraft-radius-sm shadow-btn-sm flex cursor-pointer flex-col items-center gap-0.5 border-[1.5px] border-ink px-0 py-2 font-hand text-base font-bold lg:flex-row lg:justify-center lg:gap-1.5 lg:text-lg {notesMode ? 'bg-navy text-surface-2' : 'bg-surface text-ink'}" onclick={() => (notesMode = !notesMode)}><span>✎</span><span>{m.game_notes()}{notesMode ? ' · on' : ''}</span></button>
						<button class="btn-secondary kraft-radius-sm shadow-btn-sm relative flex cursor-pointer flex-col items-center gap-0.5 bg-surface px-0 py-2 text-base disabled:opacity-50 lg:flex-row lg:justify-center lg:gap-1.5 lg:text-lg" onclick={() => void useHint()} disabled={!hintsAvailable || gameSolved}>
							<span>💡</span><span>{m.game_hint()}</span>
							{#if hintsAvailable !== null}
								<span class="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-[1.5px] border-ink bg-mustard px-1 text-[11px] font-bold text-ink" style="font-family:var(--font-sans)">{hintsAvailable}</span>
							{/if}
						</button>
					</div>

					<!-- mascot tip -->
					<div class="card-kraft flex items-start gap-3.5 p-4" style="border-radius:16px 13px 15px 12px">
						<img src="/sudoku-maniac.webp" alt="" class="size-[52px] flex-none" style="image-rendering:pixelated" />
						<div>
							<div class="font-hand text-xl leading-none font-bold text-ink">{m.game_mascot()}</div>
							<div class="mt-1 text-[13px] leading-snug text-ink-soft">{m.game_tip()}</div>
						</div>
					</div>

					<!-- secondary actions -->
					<div class="flex flex-wrap gap-2">
						<button class="btn-secondary kraft-radius-sm px-3 py-1.5 text-base" onclick={() => void startGame()}>{m.sudoku_new_game()}</button>
						<button class="btn-secondary kraft-radius-sm px-3 py-1.5 text-base" onclick={startRandom} aria-label="Random">🎲</button>
						<button class="btn-secondary kraft-radius-sm px-3 py-1.5 text-base" onclick={() => (showPrintModal = true)}>{m.sudoku_print()}</button>
					</div>
				</panel-col>
			</game-body>
		</game-screen>

		<!-- Victory modal -->
		{#if gameSolved}
			<div class="fixed inset-0 z-40 flex items-center justify-center bg-ink/35 p-4">
				<div class="card-kraft w-full max-w-sm p-6 text-center" style="border-radius:22px 18px 20px 16px;box-shadow:4px 6px 0 rgba(50,44,36,.2)">
					<KraftAvatar mascot size={96} radius={20} class="mx-auto" />
					<div class="mt-3.5 font-display text-3xl font-bold text-ink">{m.victory_solved()}</div>
					<div class="mt-2 text-sm text-ink-soft"><span class="capitalize">{diffLabel(difficulty)}</span> · {gridSize}×{gridSize}{mistakes === 0 ? ' — no mistakes' : ''}</div>
					<div class="mt-4 flex gap-2.5">
						<div class="flex-1 rounded-[12px] border-[1.5px] border-ink bg-surface-2 py-2.5"><div class="font-hand text-2xl leading-none font-bold text-ink">{victoryTime}</div><div class="mt-0.5 text-[10px] text-muted">{m.victory_time()}</div></div>
						<div class="flex-1 rounded-[12px] border-[1.5px] border-ink bg-surface-2 py-2.5"><div class="font-hand text-2xl leading-none font-bold text-forest">+{victoryXp}</div><div class="mt-0.5 text-[10px] text-muted">{m.victory_xp()}</div></div>
						<div class="flex-1 rounded-[12px] border-[1.5px] border-ink bg-surface-2 py-2.5"><div class="font-hand text-2xl leading-none font-bold text-terracotta">+{victoryStreak}</div><div class="mt-0.5 text-[10px] text-muted">{m.victory_streak()}</div></div>
					</div>
					<div class="mt-5 flex gap-2.5">
						<button class="btn-primary kraft-radius flex-1 py-2.5 text-xl" onclick={() => void startGame()}>{m.victory_again()}</button>
						<button class="btn-secondary kraft-radius flex-1 py-2.5 text-xl" onclick={() => void backToMenu()}>{m.victory_to_menu()}</button>
					</div>
				</div>
			</div>
		{/if}
	{/if}

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

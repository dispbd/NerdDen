<!--
  Story Mode map — /sudoku/story
  Lists chapters with puzzles; shows lock / progress state.
  Clicking an available puzzle loads it in the game page overlay.
-->
<script lang="ts">
	import SudokuBoardComponent from '$lib/components/sudoku/SudokuBoard.svelte';
	import Numpad from '$lib/components/sudoku/Numpad.svelte';
	import GameTimer from '$lib/components/sudoku/GameTimer.svelte';
	import Pill from '$lib/components/shared/Pill.svelte';
	import type { GridSize } from '$lib/games/sudoku/shared.js';

	let { data } = $props();

	// ── Active puzzle state ──────────────────────────────────────────────────
	interface ActivePuzzle {
		id: string;
		puzzle: number[][];
		solution: number[][];
		gridSize: GridSize;
		difficulty: string;
		timeSpent: number;
	}

	let activePuzzle = $state<ActivePuzzle | null>(null);
	let gameSolved = $state(false);
	let timerRunning = $state(false);
	let boardRef: ReturnType<typeof SudokuBoardComponent> | null = $state(null);
	let timerRef: ReturnType<typeof GameTimer> | null = $state(null);

	interface Toast { id: number; icon: string; text: string }
	let toasts = $state<Toast[]>([]);
	let toastSeq = 0;

	function showToast(icon: string, text: string) {
		const id = ++toastSeq;
		toasts = [...toasts, { id, icon, text }];
		setTimeout(() => { toasts = toasts.filter(t => t.id !== id); }, 4000);
	}

	const STATUS_ICON: Record<string, string> = {
		locked: '🔒',
		available: '▶',
		in_progress: '⏳',
		completed: '✅'
	};

	const DIFF_COLOR: Record<string, string> = {
		beginner: 'text-forest',
		easy: 'text-forest',
		medium: 'text-mustard',
		hard: 'text-terracotta',
		expert: 'text-terracotta-ink',
		extreme: 'text-navy'
	};

	async function playPuzzle(puzzleId: string) {
		if (!data.userId) {
			showToast('🔒', 'Sign in to play story mode');
			return;
		}

		const res = await fetch(`/api/sudoku/story/${puzzleId}`);
		if (!res.ok) { showToast('❌', 'Failed to load puzzle'); return; }

		const pd = await res.json();

		activePuzzle = {
			id: puzzleId,
			puzzle: pd.puzzle,
			solution: pd.solution,
			gridSize: pd.gridSize as GridSize,
			difficulty: pd.difficulty,
			timeSpent: pd.timeSpent
		};
		gameSolved = pd.status === 'completed';
		timerRunning = !gameSolved;
		await Promise.resolve();
		if (pd.timeSpent > 0) timerRef?.addOffset(pd.timeSpent);
	}

	async function handleSolved() {
		gameSolved = true;
		timerRunning = false;
		if (!activePuzzle) return;

		const res = await fetch(`/api/sudoku/story/${activePuzzle.id}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ timeSpent: timerRef?.getElapsed() ?? 0, hintsUsed: 0 })
		});

		if (res.ok) {
			const result = await res.json();
			if (result?.xpGained) showToast('⭐', `+${result.xpGained} XP`);
			for (const ach of result?.newAchievements ?? []) showToast(ach.icon, `Achievement: ${ach.title}`);
			// Refresh chapter data
			const chapRes = await fetch('/api/sudoku/story');
			if (chapRes.ok) data = { ...data, chapters: await chapRes.json() };
		}
	}

	function closeGame() {
		activePuzzle = null;
		gameSolved = false;
		timerRunning = false;
	}

	function handleDigit(n: number) { boardRef?.placeDigit(n); }

	function handleKeydown(e: KeyboardEvent) {
		if (!activePuzzle || gameSolved) return;
		if (e.key >= '1' && e.key <= '9') boardRef?.placeDigit(Number(e.key));
		else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') boardRef?.placeDigit(0);
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<story-page class="mx-auto flex max-w-3xl flex-col items-center gap-8 px-4 py-8">
	<story-header class="flex flex-col items-center gap-2 text-center">
		<h1 class="m-0 text-4xl">Story Mode</h1>
		<p class="m-0 text-ink-soft">Progress through puzzle chains, unlock new chapters.</p>
	</story-header>

	{#each data.chapters as chapter (chapter.id)}
		<chapter-card class="card-kraft kraft-radius flex w-full flex-col overflow-hidden {chapter.unlocked ? '' : 'opacity-60'}">

			<chapter-header class="flex items-center gap-3 border-b-[1.5px] border-dashed border-dash bg-paper-card px-5 py-4">
				<span class="text-2xl">{chapter.unlocked ? '📖' : '🔒'}</span>
				<chapter-info class="flex min-w-0 flex-1 flex-col">
					<span class="font-display text-lg font-bold text-ink">{chapter.title}</span>
					<span class="text-sm text-ink-soft">{chapter.description}</span>
				</chapter-info>
				<Pill accent={chapter.completedCount === chapter.puzzles.length ? 'var(--color-forest)' : 'var(--color-navy)'}>
					{chapter.completedCount}/{chapter.puzzles.length}
				</Pill>
			</chapter-header>

			<puzzle-list class="flex flex-wrap gap-3 p-4">
				{#each chapter.puzzles as puzzle (puzzle.id)}
					<button
						class="kraft-radius-sm flex size-20 flex-col items-center justify-center gap-1 border-[1.5px] text-sm font-semibold transition-all
							{puzzle.status === 'completed' ? 'border-ink bg-[#e6efe2] text-forest' :
							 puzzle.status === 'in_progress' ? 'border-ink bg-cell-same-bg text-navy' :
							 puzzle.status === 'available' ? 'shadow-btn-sm cursor-pointer border-ink bg-surface-2 text-ink hover:-translate-y-0.5' :
							 'cursor-not-allowed border-dashed border-[#b6a98c] bg-[#efe7d6] text-muted'}"
						disabled={puzzle.status === 'locked'}
						onclick={() => puzzle.status !== 'locked' && playPuzzle(puzzle.id)}
					>
						<span class="text-2xl">{STATUS_ICON[puzzle.status] ?? '?'}</span>
						<span class="font-hand text-base font-bold">#{puzzle.orderIndex}</span>
						<span class="text-[11px] capitalize {DIFF_COLOR[puzzle.difficulty] ?? ''}">{puzzle.difficulty}</span>
					</button>
				{/each}
			</puzzle-list>
		</chapter-card>
	{/each}

	{#if !data.userId}
		<sign-in-cta class="flex flex-col items-center gap-2 py-4 text-center text-ink-soft">
			<span class="text-4xl">🔑</span>
			<p class="m-0">Sign in to save your story progress.</p>
			<a href="/sign-in" class="font-semibold text-navy hover:underline">Sign In</a>
		</sign-in-cta>
	{/if}
</story-page>

<!-- ── In-game overlay ──────────────────────────────────────────────────────── -->
{#if activePuzzle}
	<game-overlay class="fixed inset-0 z-40 flex items-center justify-center bg-ink/60 p-4">
		<game-modal class="card-kraft flex max-h-screen w-full max-w-lg flex-col items-center gap-4 overflow-y-auto p-6 shadow-float" style="border-radius:22px 18px 20px 16px">

			<modal-header class="flex w-full items-center justify-between">
				<Pill variant="solid"><span class="capitalize">{activePuzzle.difficulty}</span> · {activePuzzle.gridSize}×{activePuzzle.gridSize}</Pill>
				<GameTimer bind:this={timerRef} running={timerRunning} />
				<button
					class="cursor-pointer border-0 bg-transparent text-xl leading-none text-muted hover:text-ink"
					onclick={closeGame}
					aria-label="Close"
				>✕</button>
			</modal-header>

			{#if gameSolved}
				<solved-banner class="w-full rounded-[12px] border-[1.5px] border-ink bg-[#e6efe2] py-2.5 text-center font-hand text-2xl font-bold text-forest">
					🎉 Solved!
				</solved-banner>
			{/if}

			<board-wrap class="block w-full overflow-hidden border-[2.5px] border-ink bg-[#fbf8f1] shadow-[3px_5px_0_rgba(50,44,36,.18)]" style="border-radius:14px">
				<SudokuBoardComponent
					bind:this={boardRef}
					puzzle={activePuzzle.puzzle}
					solution={activePuzzle.solution}
					gridSize={activePuzzle.gridSize}
					size={480}
					onSolved={() => void handleSolved()}
				/>
			</board-wrap>

			<Numpad onDigit={handleDigit} gridSize={activePuzzle.gridSize} />
		</game-modal>
	</game-overlay>
{/if}

<!-- Toast notifications -->
{#if toasts.length > 0}
	<toast-container class="fixed right-4 bottom-4 z-50 flex flex-col gap-2">
		{#each toasts as toast (toast.id)}
			<toast-item class="flex items-center gap-2 rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-surface-2 shadow-lg">
				<span>{toast.icon}</span>
				<span>{toast.text}</span>
			</toast-item>
		{/each}
	</toast-container>
{/if}

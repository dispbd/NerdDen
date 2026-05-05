<!--
  Story Mode map — /sudoku/story
  Lists chapters with puzzles; shows lock / progress state.
  Clicking an available puzzle loads it in the game page overlay.
-->
<script lang="ts">
	import SudokuBoardComponent from '$lib/components/sudoku/SudokuBoard.svelte';
	import Numpad from '$lib/components/sudoku/Numpad.svelte';
	import GameTimer from '$lib/components/sudoku/GameTimer.svelte';
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
	let boardRef: ReturnType<typeof SudokuBoardComponent> | null = null;
	let timerRef: ReturnType<typeof GameTimer> | null = null;

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
		beginner: 'text-green-600',
		easy: 'text-teal-600',
		medium: 'text-yellow-600',
		hard: 'text-orange-600',
		expert: 'text-red-600',
		extreme: 'text-purple-700'
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

<story-page class="flex flex-col items-center max-w-3xl mx-auto px-4 py-8 gap-8">
	<story-header class="flex flex-col items-center gap-2 text-center">
		<h1 class="text-4xl font-extrabold m-0">Story Mode</h1>
		<p class="text-gray-500 m-0">Progress through puzzle chains, unlock new chapters.</p>
	</story-header>

	{#each data.chapters as chapter (chapter.id)}
		<chapter-card class="flex flex-col w-full rounded-2xl border border-gray-200 overflow-hidden shadow-sm
			{chapter.unlocked ? '' : 'opacity-60'}">

			<chapter-header class="flex items-center gap-3 px-5 py-4 bg-gray-50 border-b border-gray-200">
				{#if !chapter.unlocked}
					<span class="text-2xl">🔒</span>
				{:else}
					<span class="text-2xl">📖</span>
				{/if}
				<chapter-info class="flex flex-col flex-1 min-w-0">
					<span class="font-bold text-lg">{chapter.title}</span>
					<span class="text-sm text-gray-500">{chapter.description}</span>
				</chapter-info>
				<progress-pill class="text-sm font-semibold px-3 py-1 rounded-full
					{chapter.completedCount === chapter.puzzles.length ? 'bg-green-100 text-green-700' : 'bg-blue-50 text-blue-600'}">
					{chapter.completedCount}/{chapter.puzzles.length}
				</progress-pill>
			</chapter-header>

			<puzzle-list class="flex flex-wrap gap-3 p-4">
				{#each chapter.puzzles as puzzle (puzzle.id)}
					<button
						class="flex flex-col items-center justify-center gap-1 w-20 h-20 rounded-xl border-2
							font-semibold text-sm cursor-pointer transition-all
							{puzzle.status === 'completed' ? 'border-green-400 bg-green-50 text-green-700' :
							 puzzle.status === 'in_progress' ? 'border-blue-400 bg-blue-50 text-blue-700' :
							 puzzle.status === 'available' ? 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50' :
							 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'}"
						disabled={puzzle.status === 'locked'}
						onclick={() => puzzle.status !== 'locked' && playPuzzle(puzzle.id)}
					>
						<span class="text-2xl">{STATUS_ICON[puzzle.status] ?? '?'}</span>
						<span class="text-xs font-bold">#{puzzle.orderIndex}</span>
						<span class="text-xs {DIFF_COLOR[puzzle.difficulty] ?? ''}">{puzzle.difficulty}</span>
					</button>
				{/each}
			</puzzle-list>
		</chapter-card>
	{/each}

	{#if !data.userId}
		<sign-in-cta class="flex flex-col items-center gap-2 py-4 text-center text-gray-500">
			<span class="text-4xl">🔑</span>
			<p class="m-0">Sign in to save your story progress.</p>
			<a href="/sign-in" class="text-blue-600 font-semibold hover:underline">Sign In</a>
		</sign-in-cta>
	{/if}
</story-page>

<!-- ── In-game overlay ──────────────────────────────────────────────────────── -->
{#if activePuzzle}
	<game-overlay class="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4">
		<game-modal class="flex flex-col items-center gap-4 bg-white rounded-2xl p-6 shadow-2xl
			max-w-lg w-full max-h-screen overflow-y-auto">

			<modal-header class="flex items-center justify-between w-full">
				<difficulty-badge class="px-3 py-1 rounded-full bg-blue-100 text-blue-700 font-bold text-sm">
					{activePuzzle.difficulty} · {activePuzzle.gridSize}×{activePuzzle.gridSize}
				</difficulty-badge>
				<GameTimer bind:this={timerRef} running={timerRunning} />
				<button
					class="p-2 rounded-lg hover:bg-gray-100 cursor-pointer border-0 text-gray-500 text-xl"
					onclick={closeGame}
					aria-label="Close"
				>✕</button>
			</modal-header>

			{#if gameSolved}
				<solved-banner class="w-full text-center py-2.5 bg-green-100 text-green-800 rounded-lg font-bold text-lg">
					🎉 Solved!
				</solved-banner>
			{/if}

			<board-wrap class="w-full aspect-square rounded-lg overflow-hidden shadow">
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
	<toast-container class="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
		{#each toasts as toast (toast.id)}
			<toast-item class="flex items-center gap-2 px-4 py-3 bg-gray-900 text-white rounded-xl shadow-lg text-sm font-semibold">
				<span>{toast.icon}</span>
				<span>{toast.text}</span>
			</toast-item>
		{/each}
	</toast-container>
{/if}

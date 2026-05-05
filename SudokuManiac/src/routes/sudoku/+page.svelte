<!--
  /sudoku page — main game screen.
  Difficulty picker, PixiJS board, numpad, timer, controls.
-->
<script lang="ts">
	import SudokuBoardComponent from '$lib/components/sudoku/SudokuBoard.svelte';
	import Numpad from '$lib/components/sudoku/Numpad.svelte';
	import GameTimer from '$lib/components/sudoku/GameTimer.svelte';
	import { generatePuzzle } from '$lib/server/games/sudoku/generator.js';
	import type { Difficulty, Grid } from '$lib/server/games/sudoku/generator.js';

	const DIFFICULTIES: Difficulty[] = ['beginner', 'easy', 'medium', 'hard', 'expert', 'extreme'];

	let difficulty = $state<Difficulty>('medium');
	let puzzle = $state<Grid>([]);
	let solution = $state<Grid>([]);
	let gameStarted = $state(false);
	let gameSolved = $state(false);
	let timerRunning = $state(false);
	let boardRef: ReturnType<typeof SudokuBoardComponent> | null = null;
	let timerRef: ReturnType<typeof GameTimer> | null = null;

	function startGame(diff?: Difficulty) {
		const generated = generatePuzzle(diff ?? difficulty);
		puzzle = generated.puzzle;
		solution = generated.solution;
		if (diff) difficulty = diff;
		gameStarted = true;
		gameSolved = false;
		timerRunning = true;
		timerRef?.reset();
	}

	function startRandom() {
		const random = DIFFICULTIES[Math.floor(Math.random() * DIFFICULTIES.length)];
		startGame(random);
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

<sudoku-page class="flex flex-col items-center max-w-2xl mx-auto px-4 py-6 gap-6">
	<h1 class="text-4xl font-extrabold m-0">SudokuManiac</h1>

	{#if !gameStarted}
		<game-lobby class="flex flex-col items-center gap-5 w-full">
			<h2 class="m-0 text-xl font-semibold">Select Difficulty</h2>

			<difficulty-grid class="grid grid-cols-3 gap-2 w-full max-w-sm">
				{#each DIFFICULTIES as d (d)}
					<button
						class="px-2 py-2.5 rounded-lg border-2 font-semibold cursor-pointer transition-all
							{difficulty === d
							? 'border-blue-600 bg-blue-100 text-blue-700'
							: 'border-transparent bg-blue-50 hover:bg-blue-100'}"
						onclick={() => (difficulty = d)}
					>
						{d.charAt(0).toUpperCase() + d.slice(1)}
					</button>
				{/each}
			</difficulty-grid>

			<lobby-actions class="flex gap-3 items-center">
				<button
					class="px-10 py-3 bg-blue-600 text-white text-lg font-bold rounded-xl border-0 cursor-pointer hover:bg-blue-700 transition-colors"
					onclick={() => startGame()}
				>
					Start Game
				</button>
				<button
					class="px-6 py-3 bg-violet-600 text-white text-lg font-bold rounded-xl border-0 cursor-pointer hover:bg-violet-700 transition-colors"
					onclick={startRandom}
				>
					🎲 Random
				</button>
			</lobby-actions>
		</game-lobby>
	{:else}
		<game-screen class="flex flex-col items-center gap-4 w-full">
			<game-header class="flex items-center justify-between w-full max-w-135">
				<difficulty-badge class="inline-block px-3 py-1 rounded-full bg-blue-100 text-blue-700 font-bold text-sm">
					{difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
				</difficulty-badge>

				<GameTimer bind:this={timerRef} running={timerRunning} />

				<header-actions class="flex gap-2">
					<button
						class="px-3 py-1.5 rounded-md border border-gray-300 bg-white font-semibold cursor-pointer hover:bg-blue-50 transition-colors"
						title="New game"
						onclick={() => startGame()}
					>↺ New</button>
					<button
						class="px-3 py-1.5 rounded-md border border-gray-300 bg-white font-semibold cursor-pointer hover:bg-blue-50 transition-colors"
						title="Random game"
						onclick={startRandom}
					>🎲</button>
				</header-actions>
			</game-header>

			{#if gameSolved}
				<solved-banner class="block w-full max-w-135 text-center py-2.5 bg-green-100 text-green-800 rounded-lg font-bold text-lg">
					🎉 Solved!
				</solved-banner>
			{/if}

			<board-wrap class="block w-full max-w-135 aspect-square overflow-hidden rounded-lg shadow-lg">
				<SudokuBoardComponent
					bind:this={boardRef}
					{puzzle}
					{solution}
					size={Math.min(540, 90 * 9)}
					onSolved={() => {
						gameSolved = true;
						timerRunning = false;
					}}
				/>
			</board-wrap>

			<Numpad onDigit={handleDigit} />

			<game-footer class="flex gap-3">
				<button
					class="px-5 py-2 border border-gray-300 rounded-lg bg-white font-semibold cursor-pointer hover:bg-blue-50 transition-colors"
					onclick={() => {
						gameStarted = false;
						timerRunning = false;
					}}
				>
					Back to Menu
				</button>
			</game-footer>
		</game-screen>
	{/if}
</sudoku-page>

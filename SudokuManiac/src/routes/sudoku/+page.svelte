<!--
  /sudoku page — main game screen.
  Difficulty picker, PixiJS board, numpad, timer, controls.
-->
<script lang="ts">
	import { onMount } from 'svelte';
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

<div class="page">
	<h1 class="title">SudokuManiac</h1>

	{#if !gameStarted}
		<!-- Lobby / start screen -->
		<section class="lobby">
			<h2>Select Difficulty</h2>
			<div class="difficulty-grid">
				{#each DIFFICULTIES as d (d)}
					<button
						class="diff-btn"
						class:selected={difficulty === d}
						onclick={() => (difficulty = d)}
					>
						{d.charAt(0).toUpperCase() + d.slice(1)}
					</button>
				{/each}
			</div>
			<div class="lobby-actions">
				<button class="start-btn" onclick={() => startGame()}>Start Game</button>
				<button class="random-btn" onclick={startRandom}>🎲 Random</button>
			</div>
		</section>
	{:else}
		<!-- Active game -->
		<section class="game">
			<div class="game-header">
				<span class="badge">{difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}</span>
				<GameTimer bind:this={timerRef} running={timerRunning} />
				<div class="header-actions">
					<button class="btn-icon" title="New game" onclick={() => startGame()}>↺ New</button>
					<button class="btn-icon" title="Random game" onclick={startRandom}>🎲</button>
				</div>
			</div>

			{#if gameSolved}
				<div class="solved-banner">🎉 Solved!</div>
			{/if}

			<div class="board-wrap">
				<SudokuBoardComponent
					bind:this={boardRef}
					{puzzle}
					{solution}
					size={Math.min(540, 90 * 9)}
					onSolved={() => { gameSolved = true; timerRunning = false; }}
				/>
			</div>

			<Numpad onDigit={handleDigit} />

			<div class="footer-actions">
				<button class="btn-secondary" onclick={() => { gameStarted = false; timerRunning = false; }}>
					Back to Menu
				</button>
			</div>
		</section>
	{/if}
</div>

<style>
	.page {
		max-width: 600px;
		margin: 0 auto;
		padding: 1.5rem 1rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
	}

	.title {
		font-size: 2rem;
		font-weight: 800;
		margin: 0;
	}

	/* Lobby */
	.lobby {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.25rem;
		width: 100%;
	}

	.lobby h2 {
		margin: 0;
		font-size: 1.25rem;
	}

	.difficulty-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.5rem;
		width: 100%;
		max-width: 360px;
	}

	.diff-btn {
		padding: 0.6rem 0.5rem;
		border-radius: 0.5rem;
		border: 2px solid transparent;
		background: #f0f4ff;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s;
	}

	.diff-btn.selected {
		border-color: #2563eb;
		background: #dbeafe;
		color: #1d4ed8;
	}

	.diff-btn:hover:not(.selected) {
		background: #e0e7ff;
	}

	.lobby-actions {
		display: flex;
		gap: 0.75rem;
		align-items: center;
	}

	.start-btn {
		padding: 0.75rem 2.5rem;
		background: #2563eb;
		color: white;
		font-size: 1.1rem;
		font-weight: 700;
		border: none;
		border-radius: 0.6rem;
		cursor: pointer;
		transition: background 0.15s;
	}

	.start-btn:hover {
		background: #1d4ed8;
	}

	.random-btn {
		padding: 0.75rem 1.5rem;
		background: #7c3aed;
		color: white;
		font-size: 1.1rem;
		font-weight: 700;
		border: none;
		border-radius: 0.6rem;
		cursor: pointer;
		transition: background 0.15s;
	}

	.random-btn:hover {
		background: #6d28d9;
	}

	/* Game */
	.game {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		width: 100%;
	}

	.game-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		max-width: 540px;
	}

	.badge {
		display: inline-block;
		padding: 0.2rem 0.75rem;
		border-radius: 999px;
		background: #dbeafe;
		color: #1d4ed8;
		font-weight: 700;
		font-size: 0.85rem;
	}

	.header-actions {
		display: flex;
		gap: 0.5rem;
	}

	.btn-icon {
		padding: 0.3rem 0.75rem;
		border-radius: 0.4rem;
		border: 1.5px solid #b0b8cc;
		background: white;
		cursor: pointer;
		font-weight: 600;
	}

	.btn-icon:hover {
		background: #f0f4ff;
	}

	.solved-banner {
		width: 100%;
		max-width: 540px;
		text-align: center;
		padding: 0.6rem;
		background: #d1fae5;
		color: #065f46;
		border-radius: 0.5rem;
		font-weight: 700;
		font-size: 1.1rem;
	}

	.board-wrap {
		width: 100%;
		max-width: 540px;
		aspect-ratio: 1;
		overflow: hidden;
		border-radius: 0.5rem;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
	}

	.footer-actions {
		display: flex;
		gap: 0.75rem;
	}

	.btn-secondary {
		padding: 0.5rem 1.25rem;
		border: 1.5px solid #b0b8cc;
		border-radius: 0.5rem;
		background: white;
		font-weight: 600;
		cursor: pointer;
	}

	.btn-secondary:hover {
		background: #f0f4ff;
	}
</style>

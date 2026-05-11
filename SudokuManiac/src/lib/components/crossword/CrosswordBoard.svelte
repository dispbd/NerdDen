<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { CrosswordBoard } from '$lib/pixi/CrosswordBoard';
	import type { CrosswordClue } from '$lib/games/crossword/types';

	interface Props {
		/** '#' = black, '' = empty white cell */
		grid: string[][];
		clues: CrosswordClue[];
		width: number;
		height: number;
		playerGrid: Record<string, string>;
		selectedRow?: number;
		selectedCol?: number;
		selectedDirection?: 'across' | 'down';
		oncellselect?: (e: { row: number; col: number }) => void;
	}

	let {
		grid,
		clues,
		width,
		height,
		playerGrid,
		selectedRow = -1,
		selectedCol = -1,
		selectedDirection = 'across',
		oncellselect
	}: Props = $props();

	let canvas: HTMLCanvasElement;
	let board: CrosswordBoard | null = null;
	let container: HTMLElement;
	let ro: ResizeObserver | null = null;

	onMount(async () => {
		board = new CrosswordBoard();
		await board.init(canvas);
		board.setLayout(grid, clues, width, height);
		board.setPlayerGrid(playerGrid);
		board.on('cellSelect', (e) => oncellselect?.(e));

		if (selectedRow >= 0) {
			board.setSelectedCell(selectedRow, selectedCol, selectedDirection);
		}

		ro = new ResizeObserver((entries) => {
			const { width: w, height: h } = entries[0].contentRect;
			board?.resize(w, h);
		});
		ro.observe(container);
	});

	onDestroy(() => {
		ro?.disconnect();
		board?.destroy();
	});

	$effect(() => {
		if (!board) return;
		board.setPlayerGrid(playerGrid);
	});

	$effect(() => {
		if (!board || selectedRow < 0) return;
		board.setSelectedCell(selectedRow, selectedCol, selectedDirection);
	});
</script>

<crossword-board-wrap bind:this={container} class="block w-full aspect-square max-w-2xl mx-auto">
	<canvas bind:this={canvas} class="w-full h-full"></canvas>
</crossword-board-wrap>

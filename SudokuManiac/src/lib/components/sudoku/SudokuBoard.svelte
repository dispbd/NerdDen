<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { SudokuBoard } from '$lib/pixi/SudokuBoard.js';
	import { darkTheme, lightTheme } from '$lib/pixi/themes.js';
	import type { Grid } from '$lib/server/games/sudoku/generator.js';

	interface Props {
		puzzle: Grid;
		solution: Grid;
		/** Currently selected digit (1-9) to place, or 0 for erase */
		activeDigit?: number;
		theme?: 'light' | 'dark';
		size?: number;
		onCellSelect?: (row: number, col: number) => void;
		onSolved?: () => void;
	}

	let {
		puzzle,
		solution,
		activeDigit = $bindable(0),
		theme = 'light',
		size = 540,
		onCellSelect,
		onSolved
	}: Props = $props();

	let canvas: HTMLCanvasElement;
	let board: SudokuBoard | null = null;

	onMount(async () => {
		board = new SudokuBoard({ size, theme: theme === 'dark' ? darkTheme : lightTheme });
		await board.init(canvas);
		// Load puzzle that may have been set before init completed
		if (puzzle.length) board.loadPuzzle(puzzle, solution);

		board.on('cellSelect', ({ row, col }) => {
			onCellSelect?.(row, col);
			if (activeDigit > 0) {
				board?.setDigit(activeDigit);
			}
		});

		board.on('solved', () => {
			onSolved?.();
		});
	});

	onDestroy(() => {
		board?.destroy();
		board = null;
	});

	// React to puzzle changes
	$effect(() => {
		board?.loadPuzzle(puzzle, solution);
	});

	// React to theme changes
	$effect(() => {
		board?.setTheme(theme === 'dark' ? darkTheme : lightTheme);
	});

	// Expose setDigit for external use (keyboard / numpad)
	export function placeDigit(num: number) {
		board?.setDigit(num);
	}

	/** Returns a snapshot of the current player grid for session saving */
	export function getCurrentGrid(): Grid | null {
		return board?.getPlayerGrid() ?? null;
	}
</script>

<canvas
	bind:this={canvas}
	width={size}
	height={size}
	class="block touch-none"
	style="width:{size}px; height:{size}px;"
></canvas>

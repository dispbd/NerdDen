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
	}

	let {
		puzzle,
		solution,
		activeDigit = $bindable(0),
		theme = 'light',
		size = 540,
		onCellSelect
	}: Props = $props();

	let canvas: HTMLCanvasElement;
	let board: SudokuBoard | null = null;

	onMount(async () => {
		board = new SudokuBoard({ size, theme: theme === 'dark' ? darkTheme : lightTheme });
		await board.init(canvas);
		board.loadPuzzle(puzzle, solution);

		board.on('cellSelect', ({ row, col }) => {
			onCellSelect?.(row, col);
			if (activeDigit > 0) {
				board?.setDigit(activeDigit);
			}
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
</script>

<canvas
	bind:this={canvas}
	width={size}
	height={size}
	style="display:block; width:{size}px; height:{size}px; touch-action:none;"
></canvas>

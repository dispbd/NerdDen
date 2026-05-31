<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { SudokuBoard } from '$lib/pixi/SudokuBoard.js';
	import { darkTheme, notebookTheme } from '$lib/pixi/themes.js';
	import type { Grid, GridSize } from '$lib/games/sudoku/shared.js';

	function resolveTheme(t: string) {
		return t === 'dark' ? darkTheme : notebookTheme;
	}

	interface Props {
		puzzle: Grid;
		solution: Grid;
		/** Player grid to restore when continuing a saved game. Empty array = new game. */
		playerGrid?: Grid;
		/** Currently selected digit (1-N) to place, or 0 for erase */
		activeDigit?: number;
		theme?: 'light' | 'dark';
		/** Explicit pixel size. Pass 0 (or omit) to auto-size to the container width. */
		size?: number;
		gridSize?: GridSize;
		/** Read-only mode — disables all input (for opponent board display) */
		readonly?: boolean;
		/** Opponent's selected cell row (-1 = none) */
		opponentRow?: number;
		/** Opponent's selected cell col (-1 = none) */
		opponentCol?: number;
		onCellSelect?: (row: number, col: number) => void;
		onSolved?: () => void;
	}

	let {
		puzzle,
		solution,
		playerGrid = [],
		activeDigit = $bindable(0),
		theme = 'light',
		size = 0,
		gridSize = 9,
		readonly = false,
		opponentRow = -1,
		opponentCol = -1,
		onCellSelect,
		onSolved
	}: Props = $props();

	let wrapper: HTMLElement;
	let canvas: HTMLCanvasElement;
	let board: SudokuBoard | null = null;

	function resolveSize(): number {
		if (size > 0) return size;
		return wrapper?.clientWidth || 320;
	}

	onMount(async () => {
		// Ensure handwriting font is ready before first PixiJS render
		try { await document.fonts.load('700 40px Caveat'); } catch { /* fallback ok */ }

		const px = resolveSize();
		board = new SudokuBoard({ size: px, theme: resolveTheme(theme), gridSize });
		await board.init(canvas);
		if (puzzle.length) {
			if (playerGrid.length) {
				board.loadState(puzzle, playerGrid, solution);
			} else {
				board.loadPuzzle(puzzle, solution);
			}
		}

		board.on('cellSelect', ({ row, col }) => {
			if (readonly) return; // no interaction in read-only mode
			onCellSelect?.(row, col);
			if (activeDigit > 0) board?.setDigit(activeDigit);
		});

		board.on('solved', () => onSolved?.());

		// Resize observer — re-init board when container size changes
		const ro = new ResizeObserver(() => {
			const newPx = resolveSize();
			board?.resize(newPx);
		});
		ro.observe(wrapper);

		return () => ro.disconnect();
	});

	onDestroy(() => {
		board?.destroy();
		board = null;
	});

	$effect(() => {
		if (playerGrid.length) {
			board?.loadState(puzzle, playerGrid, solution);
		} else {
			board?.loadPuzzle(puzzle, solution);
		}
	});
	$effect(() => { board?.setTheme(resolveTheme(theme)); });
	$effect(() => { board?.setOpponentSelection(opponentRow, opponentCol); });

	export function placeDigit(num: number) { board?.setDigit(num); }
	export function getCurrentGrid(): Grid | null { return board?.getPlayerGrid() ?? null; }
	export function revealHint(): void { board?.revealHint(); }
</script>

<board-container bind:this={wrapper} class="block w-full aspect-square">
	<canvas
		bind:this={canvas}
		class="block w-full h-full"
		style="touch-action:none;"
	></canvas>
</board-container>

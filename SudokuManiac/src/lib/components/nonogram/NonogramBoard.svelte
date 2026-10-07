<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { NonogramBoard } from '$lib/pixi/NonogramBoard';
	import {
		gutterSlots,
		maxCellFor,
		naturalSize,
		type Cell,
		type Tool
	} from '$lib/games/nonogram/board';
	import type { Clue } from '$lib/games/nonogram/solver';
	import type { NonogramMove, PlayerGrid, Reveal } from '$lib/games/nonogram/types';

	interface Props {
		rowClues: Clue[];
		colClues: Clue[];
		reveals: Reveal[];
		/** The player's marks. Mutating it in place or replacing it both redraw. */
		playerGrid: PlayerGrid;
		tool?: Tool;
		/** No input — the game is over or not loaded. */
		readonly?: boolean;
		label?: string;
		/** One call per cell a stroke changes. Apply it to `playerGrid` to see it. */
		onpaint?: (move: NonogramMove) => void;
		/** The stroke ended — send the batched moves now. */
		onstrokeend?: () => void;
	}

	let {
		rowClues,
		colClues,
		reveals,
		playerGrid,
		tool = 'fill',
		readonly = false,
		label,
		onpaint,
		onstrokeend
	}: Props = $props();

	/** The frame: 2.5px ink border, matching the mockup's board card. */
	const BORDER = 2.5;

	let wrap: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let board = $state.raw<NonogramBoard | null>(null);

	// The frame takes the board's natural size and proportions, so the canvas has no dead
	// margin at full size and the board scales down evenly when the column is narrower.
	const natural = $derived.by(() => {
		const s = gutterSlots(rowClues, colClues);
		return naturalSize(rowClues.length, s.rowSlots, s.colSlots, maxCellFor(rowClues.length));
	});

	onMount(() => {
		const b = new NonogramBoard();
		let ro: ResizeObserver | null = null;
		let disposed = false;

		(async () => {
			// Clue numbers are rasterised when first drawn — draw them in the real font.
			try {
				await document.fonts.load('700 12px "Hanken Grotesk"');
			} catch {
				/* the fallback font is fine */
			}
			if (disposed) return;
			await b.init(canvas, wrap.clientWidth, wrap.clientHeight);
			if (disposed) return; // cleanup already ran; init() tore itself down
			b.onPaint((m) => onpaint?.(m));
			b.onStrokeEnd(() => onstrokeend?.());
			ro = new ResizeObserver(([entry]) =>
				b.resize(entry.contentRect.width, entry.contentRect.height)
			);
			ro.observe(wrap);
			board = b;
		})();

		// Synchronous cleanup: Svelte ignores a cleanup returned from an async onMount.
		return () => {
			disposed = true;
			ro?.disconnect();
			b.destroy();
			board = null;
		};
	});

	// Each effect depends only on what it names; the board's internals are untracked,
	// so a new mark redraws cells and never rebuilds the clue gutters.
	$effect(() => {
		const b = board;
		const puzzle = { rowClues, colClues, reveals };
		untrack(() =>
			b?.setPuzzle(
				puzzle.rowClues,
				puzzle.colClues,
				puzzle.reveals,
				maxCellFor(puzzle.rowClues.length)
			)
		);
	});

	$effect(() => {
		const b = board;
		const grid = $state.snapshot(playerGrid) as PlayerGrid;
		untrack(() => b?.setPlayerGrid(grid));
	});

	$effect(() => {
		const b = board;
		const t = tool;
		untrack(() => b?.setTool(t));
	});

	$effect(() => {
		const b = board;
		const on = !readonly;
		untrack(() => b?.setInteractive(on));
	});

	export function flashWrong(cells: Cell[]): void {
		board?.flashWrong(cells);
	}

	export function flashHint(cell: Cell): void {
		board?.flashHint(cell);
	}

	/** Show the solved picture in the puzzle's colour (a CSS hex like "#3E5C76"). */
	export function revealPicture(color: string): void {
		board?.revealPicture(parseInt(color.replace('#', ''), 16));
	}
</script>

<div
	bind:this={wrap}
	class="nonogram-board"
	role="group"
	aria-label={label}
	style:max-width="{natural.width + BORDER * 2}px"
	style:aspect-ratio="{natural.width + BORDER * 2} / {natural.height + BORDER * 2}"
	style:border-width="{BORDER}px"
>
	<canvas bind:this={canvas}></canvas>
</div>

<style>
	.nonogram-board {
		position: relative;
		box-sizing: border-box; /* the inline max-width and aspect-ratio include the frame */
		/* Fluid, capped at the natural size: fits block, flex-column and grid (1fr/auto)
		   parents. The canvas is out of flow, so the board has no content width — inside
		   a shrink-to-fit parent (inline-block, a flex row item) give it a width. */
		width: 100%;
		margin-inline: auto;
		border-style: solid;
		border-color: var(--color-ink, #322c24);
		border-radius: 12px;
		overflow: hidden;
		/* Same paper as the Pixi canvas, so the top-left corner notch reads as one card. */
		background: #fbf8f1;
		box-shadow: 3px 5px 0 rgba(50, 44, 36, 0.18);
	}

	canvas {
		position: absolute;
		inset: 0;
		display: block;
	}
</style>

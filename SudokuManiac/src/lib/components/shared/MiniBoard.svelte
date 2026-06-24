<!--
  Mini sudoku board — small grid preview with ink box borders. Two modes:
  `showDigits` renders Caveat digits (given = ink, player = marker colors) for
  setup previews; otherwise filled cells render as small blocks for thumbnails
  (lobby continue cards). `givens` marks which cells are clues.
-->
<script lang="ts">
	import { getBoxDim, type Grid, type GridSize } from '$lib/games/sudoku/shared.js';

	let {
		grid,
		cellPx = 30,
		showDigits = true,
		givens = null,
		frameRadius = 11,
		blockColor = 'var(--color-terracotta)',
		class: cls = ''
	}: {
		grid: Grid;
		cellPx?: number;
		showDigits?: boolean;
		givens?: boolean[][] | null;
		frameRadius?: number;
		blockColor?: string;
		class?: string;
	} = $props();

	const size = $derived(grid?.length ?? 9);
	const box = $derived(getBoxDim(size as GridSize));
	const MARKERS = ['#b5462e', '#3e5c76', '#5b7355'];
</script>

<div
	class="grid w-max overflow-hidden border-[2.5px] border-ink bg-[#fbf8f1] {cls}"
	style="grid-template-columns:repeat({size},{cellPx}px);border-radius:{frameRadius}px"
>
	{#each grid as row, r (r)}
		{#each row as val, c (c)}
			{@const filled = val > 0}
			{@const isGiven = givens ? !!givens[r]?.[c] : true}
			<div
				class="flex items-center justify-center bg-white"
				style="width:{cellPx}px;height:{cellPx}px;
					border-right:{(c + 1) % box.cols === 0 && c < size - 1 ? '2px solid #322c24' : '1px solid #dcd5c6'};
					border-bottom:{(r + 1) % box.rows === 0 && r < size - 1 ? '2px solid #322c24' : '1px solid #dcd5c6'};
					{showDigits
					? `font-family:var(--font-hand);font-weight:700;font-size:${Math.round(cellPx * 0.63)}px;line-height:1;color:${isGiven ? '#322c24' : MARKERS[(r + c) % 3]}`
					: ''}"
			>
				{#if showDigits}
					{filled ? val : ''}
				{:else if filled}
					<span
						style="width:60%;height:60%;border-radius:2px;background:{isGiven ? '#322c24' : blockColor}"
					></span>
				{/if}
			</div>
		{/each}
	{/each}
</div>

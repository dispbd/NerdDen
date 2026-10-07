<!--
  Pixel-grid picture of a nonogram: library cards (8px cells) and the solved card
  (larger cells, no grid gaps). With no `solution` every cell is flat — the picture
  stays secret until it is solved.
-->
<script lang="ts">
	let {
		size,
		solution = null,
		color = '#3E5C76',
		cell = 8,
		gaps = true,
		label
	}: {
		size: number;
		/** Picture rows, '#' filled */
		solution?: string[] | null;
		color?: string;
		cell?: number;
		/** Ink hairlines between cells (library); off for the clean solved picture */
		gaps?: boolean;
		label?: string;
	} = $props();

	const cells = $derived(
		Array.from({ length: size * size }, (_, i) =>
			solution ? solution[Math.floor(i / size)]?.[i % size] === '#' : null
		)
	);
</script>

<div
	class="nono-thumb"
	class:gaps
	role="img"
	aria-label={label}
	style:grid-template-columns="repeat({size}, {cell}px)"
>
	{#each cells as filled, i (i)}
		<span
			style:width="{cell}px"
			style:height="{cell}px"
			style:background={filled === null ? '#e7dcc6' : filled ? color : '#fbf8f1'}
		></span>
	{/each}
</div>

<style>
	.nono-thumb {
		display: grid;
		width: max-content;
		overflow: hidden;
		border: 1.5px solid var(--color-ink);
		border-radius: 6px;
		background: #e4dccb;
	}
	.nono-thumb.gaps {
		gap: 1px;
		background: var(--color-ink);
	}
</style>

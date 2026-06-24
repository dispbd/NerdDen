<script lang="ts">
	import type { GridSize } from '$lib/games/sudoku/shared.js';
	import Chip from '$lib/components/shared/Chip.svelte';

	const GRID_SIZES: GridSize[] = [4, 6, 9];

	let {
		value,
		onchange
	}: {
		value: GridSize;
		onchange: (s: GridSize) => void;
	} = $props();
</script>

<div class="flex gap-2.5">
	{#each GRID_SIZES as s (s)}
		<Chip
			active={value === s}
			accent="var(--color-navy)"
			class="kraft-radius-sm px-6 py-2 text-lg sm:text-xl"
			onclick={() => onchange(s)}
		>
			{s}×{s}
		</Chip>
	{/each}
</div>

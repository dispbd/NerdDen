<script lang="ts">
	import type { GridSize } from '$lib/games/sudoku/shared.js';

	const GRID_SIZES: GridSize[] = [4, 6, 9];

	let {
		value,
		onchange
	}: {
		value: GridSize;
		onchange: (s: GridSize) => void;
	} = $props();
</script>

<div class="flex gap-2">
	{#each GRID_SIZES as s (s)}
		<button
			class="px-4 py-2 rounded-lg border-2 font-semibold cursor-pointer transition-all
				{value === s
				? 'border-blue-600 bg-blue-100 text-blue-700'
				: 'border-transparent bg-blue-50 hover:bg-blue-100'}"
			onclick={() => onchange(s)}
		>{s}×{s}</button>
	{/each}
</div>

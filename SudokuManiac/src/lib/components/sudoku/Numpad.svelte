<!--
  Numpad component: digits 1-N + Erase button, where N matches the grid size.
-->
<script lang="ts">
	import type { GridSize } from '$lib/games/sudoku/shared.js';

	interface Props {
		onDigit: (n: number) => void;
		gridSize?: GridSize;
	}

	let { onDigit, gridSize = 9 }: Props = $props();

	const digits = $derived(Array.from({ length: gridSize }, (_, i) => i + 1));
	// For 9 digits → 5 cols (4+1 erase), for 4 → 3 cols (2+1), for 6 → 4 cols (3+1)
	const cols = $derived(Math.ceil(gridSize / 2) + 1);
</script>

<num-pad class="grid gap-1.5" style="grid-template-columns: repeat({cols}, minmax(0, 1fr))">
	{#each digits as n (n)}
		<button
			class="aspect-square text-xl font-semibold rounded-lg bg-blue-50 border border-gray-300 cursor-pointer transition-colors hover:bg-blue-200"
			onclick={() => onDigit(n)}
		>{n}</button>
	{/each}
	<button
		class="aspect-square text-xl font-semibold rounded-lg bg-red-50 border border-red-300 text-red-600 cursor-pointer transition-colors hover:bg-red-100"
		onclick={() => onDigit(0)}
	>✕</button>
</num-pad>

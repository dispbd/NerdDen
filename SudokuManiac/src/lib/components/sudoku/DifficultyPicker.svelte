<script lang="ts">
	import type { Difficulty } from '$lib/games/sudoku/shared.js';

	const DIFFICULTIES: Difficulty[] = ['beginner', 'easy', 'medium', 'hard', 'expert', 'extreme'];

	let {
		value,
		onchange,
		labelFn = (d: Difficulty) => d
	}: {
		value: Difficulty;
		onchange: (d: Difficulty) => void;
		labelFn?: (d: Difficulty) => string;
	} = $props();
</script>

<div class="grid grid-cols-3 gap-2 w-full">
	{#each DIFFICULTIES as d (d)}
		<button
			class="px-2 py-2.5 rounded-lg border-2 font-semibold cursor-pointer transition-all capitalize
				{value === d
				? 'border-blue-600 bg-blue-100 text-blue-700'
				: 'border-transparent bg-blue-50 hover:bg-blue-100'}"
			onclick={() => onchange(d)}
		>{labelFn(d)}</button>
	{/each}
</div>

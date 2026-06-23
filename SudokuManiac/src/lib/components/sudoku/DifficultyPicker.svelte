<script lang="ts">
	import type { Difficulty } from '$lib/games/sudoku/shared.js';
	import Chip from '$lib/components/shared/Chip.svelte';

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

<div class="flex w-full flex-wrap gap-2.5">
	{#each DIFFICULTIES as d (d)}
		<Chip
			active={value === d}
			accent="var(--color-terracotta)"
			class="kraft-radius-sm px-4 py-1.5 text-lg sm:text-xl"
			onclick={() => onchange(d)}
		>
			{labelFn(d)}
		</Chip>
	{/each}
</div>

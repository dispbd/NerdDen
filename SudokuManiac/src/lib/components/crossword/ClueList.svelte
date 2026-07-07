<script lang="ts">
	import type { CrosswordClue, Direction } from '$lib/games/crossword/types';

	interface Props {
		clues: CrosswordClue[];
		selectedNumber?: number;
		selectedDirection?: Direction;
		onselect?: (clue: CrosswordClue) => void;
	}

	let {
		clues,
		selectedNumber = -1,
		selectedDirection = 'across',
		onselect
	}: Props = $props();

	const across = $derived(
		[...clues].filter((c) => c.direction === 'across').sort((a, b) => a.number - b.number)
	);
	const down = $derived(
		[...clues].filter((c) => c.direction === 'down').sort((a, b) => a.number - b.number)
	);

	function isActive(clue: CrosswordClue): boolean {
		return clue.number === selectedNumber && clue.direction === selectedDirection;
	}
</script>

<clue-panel class="grid max-h-[60vh] grid-cols-2 gap-4 overflow-y-auto text-sm">
	{#snippet section(title: string, list: CrosswordClue[])}
		<clue-section>
			<h3 class="mb-2.5 border-b-[1.5px] border-dashed border-dash pb-1.5 text-[13px] font-bold text-ink">{title}</h3>
			<clue-list class="flex flex-col gap-0.5">
				{#each list as clue (clue.number + clue.direction)}
					<button
						type="button"
						class="flex items-center gap-1.5 rounded-[8px] px-2 py-1 text-left transition-colors {isActive(clue)
							? 'bg-cell-selected-bg font-semibold text-ink'
							: 'text-ink-soft hover:bg-surface-2'}"
						onclick={() => onselect?.(clue)}
					>
						<span class="font-bold text-ink">{clue.number}</span><span>{clue.clue}</span>
					</button>
				{/each}
			</clue-list>
		</clue-section>
	{/snippet}
	{@render section('Across', across)}
	{@render section('Down', down)}
</clue-panel>

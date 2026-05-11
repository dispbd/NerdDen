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

<clue-panel class="grid grid-cols-2 gap-4 text-sm overflow-y-auto max-h-[60vh]">
	<clue-section>
		<h3 class="font-bold text-base mb-2 text-gray-700">Across</h3>
		<clue-list class="flex flex-col gap-1">
			{#each across as clue (clue.number + clue.direction)}
				<button
					type="button"
					class="text-left px-2 py-1 rounded transition-colors {isActive(clue)
						? 'bg-blue-200 font-semibold'
						: 'hover:bg-gray-100'}"
					onclick={() => onselect?.(clue)}
				>
					<span class="font-bold mr-1">{clue.number}.</span>{clue.clue}
				</button>
			{/each}
		</clue-list>
	</clue-section>

	<clue-section>
		<h3 class="font-bold text-base mb-2 text-gray-700">Down</h3>
		<clue-list class="flex flex-col gap-1">
			{#each down as clue (clue.number + clue.direction)}
				<button
					type="button"
					class="text-left px-2 py-1 rounded transition-colors {isActive(clue)
						? 'bg-blue-200 font-semibold'
						: 'hover:bg-gray-100'}"
					onclick={() => onselect?.(clue)}
				>
					<span class="font-bold mr-1">{clue.number}.</span>{clue.clue}
				</button>
			{/each}
		</clue-list>
	</clue-section>
</clue-panel>

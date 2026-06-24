<!--
  Numpad — Kraft digit keys. Optional `counts` shows a remaining-count badge per
  digit (and dims a digit with 0 left). `showErase` appends a danger erase key
  (used by competitive; the in-game screen puts Erase in its actions row).
  Mobile: a single strip; desktop: a compact grid (matches NerdDen Game.dc.html).
-->
<script lang="ts">
	import type { GridSize } from '$lib/games/sudoku/shared.js';

	let {
		onDigit,
		gridSize = 9,
		counts = null,
		showErase = true
	}: {
		onDigit: (n: number) => void;
		gridSize?: GridSize;
		/** Remaining occurrences per digit (index = digit-1); null hides badges */
		counts?: number[] | null;
		showErase?: boolean;
	} = $props();

	const digits = $derived(Array.from({ length: gridSize }, (_, i) => i + 1));

	// Literal class strings so Tailwind keeps them: strip on mobile, grid on desktop.
	const COL_CLASS: Record<number, string> = {
		4: 'grid-cols-4 lg:grid-cols-2',
		6: 'grid-cols-6 lg:grid-cols-3',
		9: 'grid-cols-9 lg:grid-cols-3'
	};
	const colClass = $derived(COL_CLASS[gridSize] ?? 'grid-cols-9 lg:grid-cols-3');

	function remaining(n: number): number | null {
		return counts ? (counts[n - 1] ?? 0) : null;
	}
</script>

<num-pad class="grid w-full gap-2 lg:gap-2.5 {colClass}">
	{#each digits as n (n)}
		{@const left = remaining(n)}
		<button
			onclick={() => onDigit(n)}
			disabled={left === 0}
			class="kraft-radius-sm relative h-12 touch-manipulation border-[1.5px] font-hand text-2xl font-bold select-none lg:h-[62px] lg:text-[32px]
				{left === 0
				? 'cursor-not-allowed border-[#cdbfa6] bg-[#efe7d6] text-muted-2'
				: 'cursor-pointer border-ink bg-surface-2 text-ink shadow-btn-sm transition-transform hover:-translate-y-0.5'}"
		>
			{n}
			{#if left !== null}
				<span
					class="absolute right-1.5 bottom-1 text-[10px] font-semibold {left === 0 ? 'text-[#c3b9a4]' : 'text-muted-2'}"
					style="font-family:var(--font-sans)"
				>{left}</span>
			{/if}
		</button>
	{/each}
	{#if showErase}
		<button
			onclick={() => onDigit(0)}
			aria-label="Erase"
			class="kraft-radius-sm h-12 cursor-pointer touch-manipulation border-[1.5px] border-ink bg-surface font-hand text-2xl font-bold text-terracotta-ink shadow-btn-sm select-none lg:h-[62px]"
		>✕</button>
	{/if}
</num-pad>

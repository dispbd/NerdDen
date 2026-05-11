<script lang="ts">
	import type { SaveSlot, Difficulty } from '$lib/games/sudoku/shared';

	let { slot, onContinue, onDelete }: {
		slot: SaveSlot;
		onContinue: () => void;
		onDelete: () => void;
	} = $props();

	const DIFF_COLORS: Record<Difficulty, string> = {
		beginner: 'bg-green-100 text-green-700',
		easy: 'bg-emerald-100 text-emerald-700',
		medium: 'bg-blue-100 text-blue-700',
		hard: 'bg-orange-100 text-orange-700',
		expert: 'bg-red-100 text-red-700',
		extreme: 'bg-purple-100 text-purple-700'
	};

	const timeLabel = $derived(
		`${Math.floor(slot.timeSpent / 60)}:${(slot.timeSpent % 60).toString().padStart(2, '0')}`
	);

	const dateLabel = $derived(
		new Date(slot.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
	);

	const filledCount = $derived(slot.gridState.flat().filter((n) => n !== 0).length);
	const totalCells = $derived(slot.gridSize * slot.gridSize);
	const pct = $derived(Math.round((filledCount / totalCells) * 100));

	const cellSize = $derived(100 / slot.gridSize);

	const cells = $derived(
		slot.gridState.flatMap((row, ri) =>
			row.map((val, ci) => ({
				x: ci * cellSize,
				y: ri * cellSize,
				w: cellSize - 0.5,
				filled: val !== 0
			}))
		)
	);
</script>

<save-slot-card class="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow transition-shadow">
	<!-- Mini grid thumbnail -->
	<mini-grid class="shrink-0">
		<svg width="54" height="54" viewBox="0 0 100 100" class="rounded">
			{#each cells as cell}
				<rect
					x={cell.x}
					y={cell.y}
					width={cell.w}
					height={cell.w}
					fill={cell.filled ? '#60a5fa' : '#e2e8f0'}
				/>
			{/each}
		</svg>
	</mini-grid>

	<!-- Info -->
	<slot-info class="flex flex-col gap-1 flex-1 min-w-0">
		<slot-badges class="flex items-center gap-1.5 flex-wrap">
			<span class="text-xs font-semibold px-1.5 py-0.5 rounded capitalize {DIFF_COLORS[slot.difficulty]}">
				{slot.difficulty}
			</span>
			<span class="text-xs text-gray-400">{slot.gridSize}×{slot.gridSize}</span>
		</slot-badges>
		<slot-stats class="flex items-center gap-3 text-xs text-gray-500">
			<span>⏱ {timeLabel}</span>
			<span>{pct}% done</span>
			<span>📅 {dateLabel}</span>
		</slot-stats>
	</slot-info>

	<!-- Actions -->
	<slot-actions class="flex items-center gap-1 shrink-0">
		<button
			onclick={onContinue}
			class="px-3 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors cursor-pointer border-0"
		>
			Continue
		</button>
		<button
			onclick={onDelete}
			class="px-2 py-1.5 text-gray-400 hover:text-red-500 transition-colors cursor-pointer border-0 bg-transparent text-xl leading-none"
			title="Delete save"
		>
			×
		</button>
	</slot-actions>
</save-slot-card>

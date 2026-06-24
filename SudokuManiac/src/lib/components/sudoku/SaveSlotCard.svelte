<script lang="ts">
	import type { SaveSlot, Difficulty } from '$lib/games/sudoku/shared';
	import MiniBoard from '$lib/components/shared/MiniBoard.svelte';
	import Pill from '$lib/components/shared/Pill.svelte';

	let {
		slot,
		onContinue,
		onDelete,
		diffLabel = (d: Difficulty) => d
	}: {
		slot: SaveSlot;
		onContinue: () => void;
		onDelete: () => void;
		diffLabel?: (d: Difficulty) => string;
	} = $props();

	const timeLabel = $derived(
		`${Math.floor(slot.timeSpent / 60)}:${(slot.timeSpent % 60).toString().padStart(2, '0')}`
	);
	const dateLabel = $derived(
		new Date(slot.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
	);

	const filledCount = $derived(slot.gridState.flat().filter((n) => n !== 0).length);
	const pct = $derived(Math.round((filledCount / (slot.gridSize * slot.gridSize)) * 100));

	/** Thumbnail cell size — keep the whole board near ~54px wide. */
	const cellPx = $derived(Math.max(5, Math.floor(54 / slot.gridSize)));
	/** Mark given cells (from the original puzzle, if stored) for ink vs marker blocks. */
	const givens = $derived(slot.puzzle ? slot.puzzle.map((row) => row.map((v) => v !== 0)) : null);
</script>

<save-slot-card class="card-kraft kraft-radius-sm flex items-center gap-3 p-3">
	<!-- Mini board thumbnail -->
	<div class="shrink-0">
		<MiniBoard grid={slot.gridState} {givens} showDigits={false} {cellPx} frameRadius={6} />
	</div>

	<!-- Info -->
	<slot-info class="flex min-w-0 flex-1 flex-col gap-1.5">
		<slot-badges class="flex flex-wrap items-center gap-2">
			<Pill class="!px-2.5 !py-1 !text-[11px]">{diffLabel(slot.difficulty)}</Pill>
			<span class="text-xs font-semibold text-muted">{slot.gridSize}×{slot.gridSize}</span>
		</slot-badges>
		<slot-stats class="flex items-center gap-2 text-xs font-medium text-muted">
			<span class="font-hand text-sm font-bold text-ink">{timeLabel}</span>
			<span>·</span>
			<span>{pct}%</span>
			<span>·</span>
			<span>{dateLabel}</span>
		</slot-stats>
	</slot-info>

	<!-- Actions -->
	<slot-actions class="flex shrink-0 items-center gap-1">
		<button
			onclick={onContinue}
			class="btn-secondary kraft-radius-sm bg-navy px-3 py-1.5 text-base text-surface-2"
		>
			Continue
		</button>
		<button
			onclick={onDelete}
			class="cursor-pointer border-0 bg-transparent text-xl leading-none text-muted transition-colors hover:text-terracotta-ink"
			title="Delete save"
			aria-label="Delete save"
		>
			×
		</button>
	</slot-actions>
</save-slot-card>

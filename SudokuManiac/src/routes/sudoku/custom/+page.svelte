<!--
  Custom mode — /sudoku/custom  ("Kraft Draft")
  Manual game setup: board size, difficulty, assist toggles and a live preview.
  "Start game" hands off to /sudoku with the chosen config (auto-start).
-->
<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import KraftTopBar from '$lib/components/shared/KraftTopBar.svelte';
	import Chip from '$lib/components/shared/Chip.svelte';
	import KraftToggle from '$lib/components/shared/KraftToggle.svelte';
	import MiniBoard from '$lib/components/shared/MiniBoard.svelte';
	import { getBoxDim, type Difficulty, type GridSize } from '$lib/games/sudoku/shared.js';

	// Board size — 16×16 is laid out but not yet supported by the generator (disabled).
	const SIZES: { value: number; label: string; supported: boolean }[] = [
		{ value: 4, label: '4×4', supported: true },
		{ value: 6, label: '6×6', supported: true },
		{ value: 9, label: '9×9', supported: true },
		{ value: 16, label: '16×16', supported: false }
	];
	const DIFFICULTIES: Difficulty[] = ['beginner', 'easy', 'medium', 'hard', 'expert'];
	const DIFF_LABEL: Record<Difficulty, () => string> = {
		beginner: m.difficulty_beginner,
		easy: m.difficulty_easy,
		medium: m.difficulty_medium,
		hard: m.difficulty_hard,
		expert: m.difficulty_expert,
		extreme: m.difficulty_extreme
	};

	let size = $state<number>(9);
	let difficulty = $state<Difficulty>('medium');
	let mistakeHighlight = $state(true);
	let autoNotes = $state(false);
	let hintLimit = $state(true);

	const HINT_COUNT = 3;

	/** Decorative preview board (Latin-square pattern) for the chosen size. */
	const preview = $derived.by(() => {
		const s = (size === 16 ? 9 : size) as GridSize;
		const { rows: boxRows, cols: boxCols } = getBoxDim(s);
		const grid: number[][] = [];
		const givens: boolean[][] = [];
		for (let r = 0; r < s; r++) {
			const gridRow: number[] = [];
			const givRow: boolean[] = [];
			for (let c = 0; c < s; c++) {
				const v = ((c + boxCols * (r % boxRows) + Math.floor(r / boxRows)) % s) + 1;
				const show = (r + c * 2) % 2 === 0;
				gridRow.push(show ? v : 0);
				givRow.push((r * 3 + c * 7 + (r % 2)) % 3 === 0);
			}
			grid.push(gridRow);
			givens.push(givRow);
		}
		return { s, grid, givens };
	});

	function startGame() {
		const params = new URLSearchParams({
			difficulty,
			size: String(size === 16 ? 9 : size),
			mistakes: mistakeHighlight ? '1' : '0',
			autonotes: autoNotes ? '1' : '0',
			hintlimit: hintLimit ? String(HINT_COUNT) : '0',
			autostart: '1'
		});
		goto(`${resolve('/sudoku')}?${params.toString()}`);
	}
</script>

<svelte:head>
	<title>{m.custom_title()} — NerdDen</title>
</svelte:head>

<custom-screen class="flex min-h-screen flex-col bg-paper">
	<KraftTopBar title={m.custom_title()} backHref="/sudoku" />

	<div class="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6 lg:flex-row lg:gap-7">
		<!-- ─── Options ─── -->
		<div class="flex min-w-0 flex-1 flex-col gap-6">
			<!-- size -->
			<div>
				<div class="label-caps mb-3">{m.custom_board_size()}</div>
				<div class="grid grid-cols-4 gap-2.5 sm:flex sm:flex-wrap">
					{#each SIZES as s (s.value)}
						<Chip
							active={size === s.value}
							disabled={!s.supported}
							accent="var(--color-navy)"
							class="kraft-radius-sm px-2 py-2 text-lg sm:px-6 sm:text-[22px]"
							onclick={() => s.supported && (size = s.value)}
						>
							{s.label}
						</Chip>
					{/each}
				</div>
			</div>

			<!-- difficulty -->
			<div>
				<div class="label-caps mb-3">{m.custom_difficulty()}</div>
				<div class="flex flex-wrap gap-2.5">
					{#each DIFFICULTIES as d (d)}
						<Chip
							active={difficulty === d}
							accent="var(--color-terracotta)"
							class="kraft-radius-sm px-[18px] py-1.5 text-lg sm:text-xl"
							onclick={() => (difficulty = d)}
						>
							{DIFF_LABEL[d]()}
						</Chip>
					{/each}
				</div>
			</div>

			<!-- assists -->
			<div>
				<div class="label-caps mb-3">{m.custom_assists()}</div>
				<div class="flex flex-col gap-3">
					<div class="card-kraft flex items-center justify-between px-4 py-3.5" style="border-radius:13px 11px 12px 10px">
						<div>
							<div class="text-sm leading-tight font-semibold text-ink">{m.custom_mistake_hl()}</div>
							<div class="text-xs font-medium text-muted">{m.custom_mistake_hl_desc()}</div>
						</div>
						<KraftToggle on={mistakeHighlight} label={m.custom_mistake_hl()} onclick={() => (mistakeHighlight = !mistakeHighlight)} />
					</div>
					<div class="card-kraft flex items-center justify-between px-4 py-3.5" style="border-radius:11px 13px 10px 12px">
						<div>
							<div class="text-sm leading-tight font-semibold text-ink">{m.custom_auto_notes()}</div>
							<div class="text-xs font-medium text-muted">{m.custom_auto_notes_desc()}</div>
						</div>
						<KraftToggle on={autoNotes} label={m.custom_auto_notes()} onclick={() => (autoNotes = !autoNotes)} />
					</div>
					<div class="card-kraft flex items-center justify-between px-4 py-3.5" style="border-radius:12px 10px 13px 11px">
						<div>
							<div class="text-sm leading-tight font-semibold text-ink">{m.custom_hint_limit()}</div>
							<div class="text-xs font-medium text-muted">{m.custom_hint_limit_desc({ count: HINT_COUNT })}</div>
						</div>
						<KraftToggle on={hintLimit} label={m.custom_hint_limit()} onclick={() => (hintLimit = !hintLimit)} />
					</div>
				</div>
			</div>
		</div>

		<!-- ─── Preview ─── -->
		<div class="w-full lg:w-[340px] lg:flex-none">
			<div class="label-caps mb-3">{m.custom_preview()}</div>
			<div class="card-kraft kraft-radius p-5 text-center" style="border-radius:18px 15px 17px 14px">
				<div class="mb-4 flex justify-center">
					<MiniBoard grid={preview.grid} givens={preview.givens} cellPx={30} />
				</div>

				<div class="mb-5 flex flex-col gap-1.5 text-left">
					<div class="flex justify-between text-[13px] font-medium text-ink-soft">
						<span>{m.custom_board()}</span><span class="font-semibold text-ink">{size}×{size}</span>
					</div>
					<div class="flex justify-between text-[13px] font-medium text-ink-soft">
						<span>{m.custom_difficulty()}</span><span class="font-semibold text-terracotta">{DIFF_LABEL[difficulty]()}</span>
					</div>
					<div class="flex justify-between text-[13px] font-medium text-ink-soft">
						<span>{m.custom_hints()}</span><span class="font-semibold text-ink">{hintLimit ? HINT_COUNT : '∞'}</span>
					</div>
				</div>

				<button
					onclick={startGame}
					class="btn-primary w-full px-0 py-2.5 text-2xl"
					style="border-radius:15px 12px 16px 11px"
				>{m.custom_start()}</button>
			</div>
		</div>
	</div>
</custom-screen>

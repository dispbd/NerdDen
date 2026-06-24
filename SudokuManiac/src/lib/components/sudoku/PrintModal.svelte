<!--
  PrintModal.svelte
  - When `initialPuzzle` is provided (called from active game): pre-loads current puzzle as #1.
  - Count picker = total puzzles (current + N-1 additional).
  - Color theme + font choice applied to the generated print window.
-->
<script lang="ts">
	import type { Difficulty, GridSize, Grid } from '$lib/games/sudoku/shared.js';
	import { generatePuzzle, getBoxDim } from '$lib/games/sudoku/generator.js';
	import { untrack } from 'svelte';
	import { m } from '$lib/paraglide/messages.js';
	import DifficultyPicker from './DifficultyPicker.svelte';
	import GridSizePicker from './GridSizePicker.svelte';
	import Chip from '$lib/components/shared/Chip.svelte';

	let {
		onclose,
		diffLabelFn = (d: Difficulty) => d as string,
		initialPuzzle = null
	}: {
		onclose: () => void;
		diffLabelFn?: (d: Difficulty) => string;
		initialPuzzle?: { puzzle: Grid; playerGrid?: Grid; difficulty: Difficulty; gridSize: GridSize } | null;
	} = $props();

	// Snapshot prop values at mount (modal is always recreated, never reused)
	let difficulty = $state<Difficulty>(untrack(() => initialPuzzle?.difficulty ?? 'medium'));
	let gridSize = $state<GridSize>(untrack(() => initialPuzzle?.gridSize ?? 9));
	// count = total puzzles (including initial if present)
	let count = $state(untrack(() => initialPuzzle != null ? 1 : 4));
	const additionalCount = $derived(initialPuzzle ? count - 1 : count);

	let generating = $state(false);
	let progress = $state(0);

	// ── Color themes ──────────────────────────────────────────────────────────
	const THEME_LIST = [
		{ id: 'red',    label: 'Red',    swatch: '#ef4444', boxBorder: '#b91c1c', cellBorder: '#fecaca', givenColor: '#7f1d1d', givenBg: '#fee2e2'     },
		{ id: 'classic', label: 'Classic', swatch: '#374151', boxBorder: '#222',    cellBorder: '#bbb',    givenColor: '#111',    givenBg: 'transparent' },
		{ id: 'blue',    label: 'Blue',    swatch: '#1d4ed8', boxBorder: '#1d4ed8', cellBorder: '#bfdbfe', givenColor: '#1e3a8a', givenBg: '#dbeafe'     },
		{ id: 'forest',  label: 'Forest',  swatch: '#16a34a', boxBorder: '#166534', cellBorder: '#bbf7d0', givenColor: '#14532d', givenBg: '#dcfce7'     },
		{ id: 'warm',    label: 'Warm',    swatch: '#d97706', boxBorder: '#92400e', cellBorder: '#fde68a', givenColor: '#78350f', givenBg: '#fef3c7'     },
	] as const;
	type ColorTheme = (typeof THEME_LIST)[number]['id'];
	let colorTheme = $state<ColorTheme>('red');

	// ── Fonts ─────────────────────────────────────────────────────────────────
	const FONT_LIST = [		
		{ id: 'caveat',  label: 'Caveat',     family: "'Caveat', cursive",         googleFont: 'Caveat:wght@600' },
		{ id: 'system',  label: 'Sans-serif', family: 'Arial, sans-serif',        googleFont: null              },
		{ id: 'courier', label: 'Courier',    family: "'Courier New', monospace",  googleFont: null              },
	] as const;
	type FontId = (typeof FONT_LIST)[number]['id'];
	let fontId = $state<FontId>('caveat');

	const slowWarning = $derived(
		additionalCount >= 5 && gridSize === 9 && (difficulty === 'expert' || difficulty === 'extreme')
	);

	// ── Print HTML builder ────────────────────────────────────────────────────
	type PuzzleEntry = { puzzle: Grid; playerGrid?: Grid; difficulty: Difficulty; gridSize: GridSize; isInitial: boolean };

	function buildPrintHtml(allPuzzles: PuzzleEntry[]): string {
		const theme = THEME_LIST.find((t) => t.id === colorTheme)!;
		const font  = FONT_LIST.find((f) => f.id === fontId)!;

		function puzzleHtml(entry: PuzzleEntry, idx: number): string {
			const { puzzle: pz, playerGrid: pg, difficulty: d, gridSize: gs, isInitial } = entry;
			const { rows: bRows, cols: bCols } = getBoxDim(gs);
			const cellMm = gs === 9 ? 10 : gs === 6 ? 13 : 17;
			const fontMm = (cellMm * 0.52).toFixed(1);

			// player-filled: same hue as theme but at 55% opacity
			const playerColor = theme.id === 'classic' ? '#6b7280' : theme.givenColor;

			let tbody = '';
			for (let r = 0; r < gs; r++) {
				let cells = '';
				for (let c = 0; c < gs; c++) {
					const original  = pz[r][c];           // 0 = blank in original puzzle
					const filled    = pg?.[r]?.[c] ?? 0;  // what the player typed
					const isGiven   = original !== 0;
					const isPlayer  = !isGiven && filled !== 0;
					const displayVal = isGiven ? original : (isPlayer ? filled : 0);

					const bB = (r + 1) % bRows === 0 && r < gs - 1 ? `3px solid ${theme.boxBorder}` : `1px solid ${theme.cellBorder}`;
					const bR = (c + 1) % bCols === 0 && c < gs - 1 ? `3px solid ${theme.boxBorder}` : `1px solid ${theme.cellBorder}`;

					let color: string, bg: string, fw: number, opacity: string;
					if (isGiven) {
						color = theme.givenColor; bg = theme.givenBg; fw = 700; opacity = '1';
					} else if (isPlayer) {
						color = playerColor; bg = 'transparent'; fw = 500; opacity = '0.55';
					} else {
						color = '#ccc'; bg = 'transparent'; fw = 400; opacity = '1';
					}

					cells += `<td style="`
						+ `width:${cellMm}mm;height:${cellMm}mm;`
						+ `border-top:1px solid ${theme.cellBorder};border-left:1px solid ${theme.cellBorder};`
						+ `border-bottom:${bB};border-right:${bR};`
						+ `text-align:center;vertical-align:middle;`
						+ `font-size:${fontMm}mm;font-weight:${fw};opacity:${opacity};`
						+ `color:${color};background:${bg};`
						+ `">${displayVal || ''}</td>`;
				}
				tbody += `<tr>${cells}</tr>`;
			}

			const star = isInitial ? '&#9733; ' : '';
			const label = `${star}#${idx + 1} &middot; ${d} &middot; ${gs}&times;${gs}`;
			return [
				`<div style="break-inside:avoid;display:flex;flex-direction:column;align-items:center;gap:5px;padding:8px 6px;">`,
				`<div style="font-size:8.5pt;color:${theme.boxBorder};opacity:0.8;text-transform:capitalize;letter-spacing:.04em;">${label}</div>`,
				`<table style="border-collapse:collapse;border:3px solid ${theme.boxBorder};">${tbody}</table>`,
				`</div>`,
			].join('');
		}

		const primarySize = allPuzzles[0]?.gridSize ?? 9;
		const cols = primarySize === 4 ? 3 : 2;

		const googleLink = font.googleFont
			? `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=${font.googleFont}&display=swap" rel="stylesheet">`
			: '';

		return [
			`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">`,
			`<title>Sudoku &mdash; Print</title>`,
			googleLink,
			`<style>`,
			`@page{margin:12mm;size:A4 portrait;}`,
			`*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;}`,
			`body{font-family:${font.family};background:#fff;}`,
			`.wrap{display:grid;grid-template-columns:repeat(${cols},1fr);}`,
			`</style></head><body>`,
			`<div class="wrap">${allPuzzles.map((p, i) => puzzleHtml(p, i)).join('')}</div>`,
			`<script>document.fonts.ready.then(()=>window.print());</scr` + `ipt>`,
			`</body></html>`,
		].join('');
	}

	// ── Generate & open print window ──────────────────────────────────────────
	async function handlePrint() {
		generating = true;
		progress = 0;
		await new Promise<void>((r) => setTimeout(r, 20));

		const allPuzzles: PuzzleEntry[] = [];

		if (initialPuzzle) {
			allPuzzles.push({ ...initialPuzzle, isInitial: true });
			progress = 1;
		}

		for (let i = 0; i < additionalCount; i++) {
			const gen = generatePuzzle(difficulty, gridSize);
			allPuzzles.push({ ...gen, isInitial: false });
			progress = allPuzzles.length;
			await new Promise<void>((r) => setTimeout(r, 0));
		}

		const html = buildPrintHtml(allPuzzles);
		const win = window.open('', '_blank');
		if (win) {
			win.document.write(html);
			win.document.close();
			win.focus();
		}

		generating = false;
		onclose();
	}
</script>

<!-- backdrop -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
	role="dialog"
	aria-modal="true"
	aria-label="Print Sudoku"
>
	<div class="card-kraft kraft-radius flex max-h-[90dvh] w-full max-w-sm flex-col gap-5 overflow-y-auto p-6 shadow-float">

		<!-- header -->
		<div class="flex items-center justify-between">
			<h2 class="m-0 text-xl">{m.print_title()}</h2>
			<button
				class="cursor-pointer border-0 bg-transparent text-lg leading-none text-muted transition-colors hover:text-ink"
				onclick={onclose}
				aria-label="Close"
			>✕</button>
		</div>

		<!-- current puzzle banner -->
		{#if initialPuzzle}
			<div class="flex items-center gap-2 rounded-[10px] border-[1.5px] border-dashed border-dash bg-surface-2 px-3 py-2 text-sm">
				<span class="text-base text-terracotta">★</span>
				<span class="text-ink-soft">{m.print_current_banner()}</span>
			</div>
		{/if}

		<!-- count -->
		<div class="flex flex-col gap-2">
			<span class="field-label">
				{initialPuzzle ? m.print_total_puzzles() : m.print_puzzle_count()}
			</span>
			<div class="grid grid-cols-9 gap-1">
				{#each [1, 2, 3, 4, 5, 6, 7, 8, 9] as n (n)}
					<Chip active={count === n} accent="var(--color-navy)" class="kraft-radius-sm py-1.5 text-base" onclick={() => (count = n)}>{n}</Chip>
				{/each}
			</div>
			{#if initialPuzzle && count > 1}
				<p class="text-xs text-muted">{m.print_current_plus({ n: count - 1 })}</p>
			{/if}
			{#if slowWarning}
				<p class="text-xs text-mustard">⚠️ {m.print_slow_warning({ count: additionalCount, difficulty })}</p>
			{/if}
		</div>

		<!-- difficulty + grid size — only when generating additional puzzles -->
		{#if !initialPuzzle || count > 1}
			<div class="flex flex-col gap-2">
				<span class="field-label">
					{initialPuzzle ? m.print_difficulty_additional() : m.print_difficulty()}
				</span>
				<DifficultyPicker value={difficulty} onchange={(d) => (difficulty = d)} labelFn={diffLabelFn} />
			</div>
			<div class="flex flex-col gap-2">
				<span class="field-label">
					{initialPuzzle ? m.print_grid_size_additional() : m.sudoku_grid_size()}
				</span>
				<GridSizePicker value={gridSize} onchange={(s) => (gridSize = s)} />
			</div>
		{/if}

		<!-- color theme -->
		<div class="flex flex-col gap-2">
			<span class="field-label">{m.print_color_theme()}</span>
			<div class="flex flex-wrap gap-2">
				{#each THEME_LIST as t (t.id)}
					<button
						class="kraft-radius-sm flex cursor-pointer items-center gap-1.5 border-[1.5px] px-3 py-1.5 text-sm font-semibold transition-all
							{colorTheme === t.id ? 'border-ink bg-surface-2 shadow-btn-sm' : 'border-[#cdbfa6] bg-transparent text-ink-soft'}"
						onclick={() => (colorTheme = t.id)}
					>
						<span class="inline-block size-3.5 shrink-0 rounded-full border border-ink/30" style="background:{t.swatch}"></span>
						{t.label}
					</button>
				{/each}
			</div>
		</div>

		<!-- font -->
		<div class="flex flex-col gap-2">
			<span class="field-label">{m.print_font()}</span>
			<div class="flex flex-wrap gap-2">
				{#each FONT_LIST as f (f.id)}
					<Chip active={fontId === f.id} accent="var(--color-terracotta)" class="kraft-radius-sm px-3 py-1.5 text-base" onclick={() => (fontId = f.id)}>{f.label}</Chip>
				{/each}
			</div>
		</div>

		<!-- actions -->
		<div class="flex gap-3 pt-1">
			<button
				class="btn-primary kraft-radius flex-1 px-4 py-2.5 text-lg disabled:cursor-not-allowed disabled:opacity-60"
				onclick={handlePrint}
				disabled={generating}
			>
				{#if generating}
					{m.print_generating({ progress, count })}
				{:else}
					{m.print_generate()}
				{/if}
			</button>
			<button class="btn-secondary kraft-radius px-4 py-2.5 text-lg" onclick={onclose}>{m.print_cancel()}</button>
		</div>
	</div>
</div>

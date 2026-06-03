<!--
  PrintModal.svelte — lets the user pick difficulty, grid size, and count (1–9),
  then generates the puzzles and opens a browser print dialog in a new window
  so the current session is never disrupted.
-->
<script lang="ts">
	import type { Difficulty, GridSize } from '$lib/games/sudoku/shared.js';
	import { generatePuzzle, getBoxDim } from '$lib/games/sudoku/generator.js';
	import DifficultyPicker from './DifficultyPicker.svelte';
	import GridSizePicker from './GridSizePicker.svelte';

	let { onclose, diffLabelFn = (d: Difficulty) => d as string }: {
		onclose: () => void;
		diffLabelFn?: (d: Difficulty) => string;
	} = $props();

	let difficulty = $state<Difficulty>('medium');
	let gridSize = $state<GridSize>(9);
	let count = $state(4);
	let generating = $state(false);
	let progress = $state(0);

	async function handlePrint() {
		generating = true;
		progress = 0;
		// Yield to UI so the spinner renders before the heavy computation starts.
		await new Promise<void>((r) => setTimeout(r, 20));

		const puzzles: { puzzle: number[][] }[] = [];
		for (let i = 0; i < count; i++) {
			puzzles.push(generatePuzzle(difficulty, gridSize));
			progress = i + 1;
			// Yield between puzzles so the progress counter updates.
			await new Promise<void>((r) => setTimeout(r, 0));
		}

		const { rows: bRows, cols: bCols } = getBoxDim(gridSize);

		// --- Print layout constants ---
		// How many puzzles to show per row on the page.
		const cols = gridSize === 4 ? 3 : 2;
		// Cell dimensions in mm so the grid scales predictably on paper.
		const cellMm = gridSize === 9 ? 10 : gridSize === 6 ? 13 : 17;
		const fontMm = cellMm * 0.48;
		const borderHeavy = '3px solid #222';
		const borderLight = '1px solid #bbb';

		function puzzleHtml(pz: number[][], idx: number): string {
			let tbody = '';
			for (let r = 0; r < gridSize; r++) {
				let cells = '';
				for (let c = 0; c < gridSize; c++) {
					const v = pz[r][c];
					// Thick borders mark box boundaries; outer border handled by <table>.
					const bb = (r + 1) % bRows === 0 && r < gridSize - 1 ? borderHeavy : borderLight;
					const br = (c + 1) % bCols === 0 && c < gridSize - 1 ? borderHeavy : borderLight;
					cells += `<td style="width:${cellMm}mm;height:${cellMm}mm;border-bottom:${bb};border-right:${br};`
						+ `border-top:${borderLight};border-left:${borderLight};`
						+ `text-align:center;vertical-align:middle;`
						+ `font-size:${fontMm.toFixed(1)}mm;font-weight:600;color:#111;">${v || ''}</td>`;
				}
				tbody += `<tr>${cells}</tr>`;
			}
			const label = `#${idx + 1} &nbsp;&middot;&nbsp; ${difficulty} &nbsp;&middot;&nbsp; ${gridSize}&times;${gridSize}`;
			return `<div style="break-inside:avoid;display:flex;flex-direction:column;align-items:center;gap:5px;padding:8px 6px;">
  <div style="font-size:9pt;color:#999;text-transform:capitalize;letter-spacing:0.04em;">${label}</div>
  <table style="border-collapse:collapse;border:3px solid #222;">${tbody}</table>
</div>`;
		}

		const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<title>Sudoku &mdash; Print</title>
<style>
@page { margin: 12mm; size: A4 portrait; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, sans-serif; background: #fff; }
.wrap { display: grid; grid-template-columns: repeat(${cols}, 1fr); }
</style>
</head><body>
<div class="wrap">
${puzzles.map((p, i) => puzzleHtml(p.puzzle, i)).join('\n')}
</div>
</body></html>`;

		const win = window.open('', '_blank');
		if (win) {
			win.document.write(html);
			win.document.close();
			win.focus();
			// Small delay for the browser to finish rendering before the dialog opens.
			setTimeout(() => win.print(), 300);
		}

		generating = false;
		onclose();
	}

	const slowWarning = $derived(
		count >= 6 && gridSize === 9 && (difficulty === 'expert' || difficulty === 'extreme')
	);
</script>

<!-- backdrop -->
<div
	class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
	role="dialog"
	aria-modal="true"
	aria-label="Print Sudoku"
>
	<div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col gap-5 p-6">
		<!-- header -->
		<div class="flex items-center justify-between">
			<h2 class="text-xl font-bold">🖨️ Print Sudoku</h2>
			<button
				class="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors text-gray-400 hover:text-gray-600 text-lg leading-none"
				onclick={onclose}
				aria-label="Close"
			>✕</button>
		</div>

		<!-- difficulty -->
		<div class="flex flex-col gap-2">
			<span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Difficulty</span>
			<DifficultyPicker value={difficulty} onchange={(d) => (difficulty = d)} labelFn={diffLabelFn} />
		</div>

		<!-- grid size -->
		<div class="flex flex-col gap-2">
			<span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Grid size</span>
			<GridSizePicker value={gridSize} onchange={(s) => (gridSize = s)} />
		</div>

		<!-- count -->
		<div class="flex flex-col gap-2">
			<span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Number of puzzles</span>
			<div class="grid grid-cols-9 gap-1">
				{#each [1, 2, 3, 4, 5, 6, 7, 8, 9] as n (n)}
					<button
						class="py-2 rounded-lg border-2 font-semibold cursor-pointer transition-all text-sm
							{count === n
							? 'border-blue-600 bg-blue-100 text-blue-700'
							: 'border-transparent bg-blue-50 hover:bg-blue-100'}"
						onclick={() => (count = n)}
					>{n}</button>
				{/each}
			</div>
			{#if slowWarning}
				<p class="text-xs text-amber-600">⚠️ Generating {count} {difficulty} puzzles may take a moment.</p>
			{/if}
		</div>

		<!-- actions -->
		<div class="flex gap-3 pt-1">
			<button
				class="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer transition-colors"
				onclick={handlePrint}
				disabled={generating}
			>
				{#if generating}
					Generating {progress}/{count}…
				{:else}
					Generate &amp; Print
				{/if}
			</button>
			<button
				class="px-4 py-2.5 rounded-lg border-2 border-gray-200 font-semibold hover:bg-gray-100 cursor-pointer transition-colors"
				onclick={onclose}
			>Cancel</button>
		</div>
	</div>
</div>

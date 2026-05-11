<script lang="ts">
	import { onMount } from 'svelte';
	import CrosswordBoard from '$lib/components/crossword/CrosswordBoard.svelte';
	import ClueList from '$lib/components/crossword/ClueList.svelte';
	import type { PageServerData } from './$types';
	import type { CrosswordClue, Direction } from '$lib/games/crossword/types';

	let { data }: { data: PageServerData } = $props();

	// ─── State ─────────────────────────────────────────────────────────────────

	let playerGrid = $state<Record<string, string>>({});
	let selectedRow = $state(-1);
	let selectedCol = $state(-1);
	let selectedDirection = $state<Direction>('across');
	let sessionId = $state<string | null>(null);
	let completed = $state(false);
	let submitting = $state(false);
	let errorMsg = $state('');

	// Timer
	let secondsElapsed = $state(0);
	let timerHandle: ReturnType<typeof setInterval> | null = null;

	// Active clue
	const activeClue = $derived(
		(data.clues as CrosswordClue[]).find(
			(cl) =>
				cl.direction === selectedDirection &&
				((selectedDirection === 'across' &&
					cl.row === selectedRow &&
					cl.col <= selectedCol &&
					selectedCol < cl.col + cl.length) ||
					(selectedDirection === 'down' &&
						cl.col === selectedCol &&
						cl.row <= selectedRow &&
						selectedRow < cl.row + cl.length))
		) ?? null
	);

	// ─── Lifecycle ─────────────────────────────────────────────────────────────

	onMount(() => {
		// Start session
		fetch(`/api/crossword/${data.id}/sessions`, { method: 'POST' }).then(async (res) => {
			if (res.ok) {
				const s = await res.json();
				sessionId = s.id;
				if (s.playerGrid && Object.keys(s.playerGrid as object).length > 0) {
					playerGrid = s.playerGrid as Record<string, string>;
				}
			}
		});

		// Start timer
		timerHandle = setInterval(() => {
			if (!completed) secondsElapsed++;
		}, 1000);

		// Auto-save every 30 s
		const autoSave = setInterval(() => saveProgress(), 30_000);

		return () => {
			clearInterval(timerHandle!);
			clearInterval(autoSave);
		};
	});

	// ─── Input handling ─────────────────────────────────────────────────────────

	function onCellSelect(e: { row: number; col: number }) {
		if (e.row === selectedRow && e.col === selectedCol) {
			// Toggle direction
			selectedDirection = selectedDirection === 'across' ? 'down' : 'across';
		} else {
			selectedRow = e.row;
			selectedCol = e.col;
		}
	}

	function onClueSelect(clue: CrosswordClue) {
		selectedRow = clue.row;
		selectedCol = clue.col;
		selectedDirection = clue.direction;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (selectedRow < 0) return;
		const key = e.key.toUpperCase();

		if (/^[A-Z]$/.test(key)) {
			e.preventDefault();
			playerGrid = { ...playerGrid, [`${selectedRow},${selectedCol}`]: key };
			advanceCursor();
		} else if (e.key === 'Backspace' || e.key === 'Delete') {
			e.preventDefault();
			if (playerGrid[`${selectedRow},${selectedCol}`]) {
				playerGrid = { ...playerGrid, [`${selectedRow},${selectedCol}`]: '' };
			} else {
				retreatCursor();
			}
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			if (selectedDirection === 'across') advanceCursor();
			else selectedDirection = 'across';
		} else if (e.key === 'ArrowLeft') {
			e.preventDefault();
			if (selectedDirection === 'across') retreatCursor();
			else selectedDirection = 'across';
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (selectedDirection === 'down') advanceCursor();
			else selectedDirection = 'down';
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			if (selectedDirection === 'down') retreatCursor();
			else selectedDirection = 'down';
		} else if (e.key === 'Tab') {
			e.preventDefault();
			cycleClue(e.shiftKey ? -1 : 1);
		}
	}

	function advanceCursor() {
		const dr = selectedDirection === 'down' ? 1 : 0;
		const dc = selectedDirection === 'across' ? 1 : 0;
		const nr = selectedRow + dr;
		const nc = selectedCol + dc;
		if (nr < data.height && nc < data.width && data.grid[nr][nc] !== '#') {
			selectedRow = nr;
			selectedCol = nc;
		}
	}

	function retreatCursor() {
		const dr = selectedDirection === 'down' ? 1 : 0;
		const dc = selectedDirection === 'across' ? 1 : 0;
		const nr = selectedRow - dr;
		const nc = selectedCol - dc;
		if (nr >= 0 && nc >= 0 && data.grid[nr][nc] !== '#') {
			selectedRow = nr;
			selectedCol = nc;
		}
	}

	function cycleClue(delta: 1 | -1) {
		const clues = data.clues as CrosswordClue[];
		const sorted = [...clues].sort(
			(a, b) => a.number - b.number || (a.direction === 'across' ? -1 : 1)
		);
		const current = sorted.findIndex(
			(c) => c.number === activeClue?.number && c.direction === activeClue?.direction
		);
		const next = sorted[(current + delta + sorted.length) % sorted.length];
		if (next) {
			selectedRow = next.row;
			selectedCol = next.col;
			selectedDirection = next.direction;
		}
	}

	// ─── Save / submit ─────────────────────────────────────────────────────────

	async function saveProgress() {
		if (!sessionId) return;
		await fetch(`/api/crossword/sessions/${sessionId}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ playerGrid, timeSpent: secondsElapsed })
		});
	}

	async function submit() {
		if (!sessionId || submitting) return;
		submitting = true;
		errorMsg = '';

		const res = await fetch(`/api/crossword/sessions/${sessionId}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ playerGrid, timeSpent: secondsElapsed, complete: true })
		});

		if (res.ok) {
			completed = true;
			clearInterval(timerHandle!);
		} else {
			const body = await res.json().catch(() => ({}));
			errorMsg = (body as { message?: string }).message ?? 'Check your answers and try again.';
		}
		submitting = false;
	}

	// ─── Timer display ─────────────────────────────────────────────────────────

	const timerLabel = $derived(() => {
		const m = Math.floor(secondsElapsed / 60)
			.toString()
			.padStart(2, '0');
		const s = (secondsElapsed % 60).toString().padStart(2, '0');
		return `${m}:${s}`;
	});
</script>

<svelte:head>
	<title>{data.title} — Crosswords</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<main class="max-w-7xl mx-auto px-4 py-6">
	<!-- Header row -->
	<crossword-header class="flex items-center justify-between mb-4">
		<div>
			<h1 class="text-2xl font-bold">{data.title}</h1>
			<p class="text-sm text-gray-500 capitalize">{data.difficulty} · {data.topic}</p>
		</div>
		<timer-display class="font-mono text-xl tabular-nums text-gray-700">
			{timerLabel()}
		</timer-display>
	</crossword-header>

	{#if completed}
		<completion-banner class="block bg-green-100 border border-green-300 rounded-xl p-6 text-center mb-6">
			<p class="text-2xl font-bold text-green-700 mb-1">Puzzle solved!</p>
			<p class="text-gray-600">Time: {timerLabel()} · <a href="/crossword" class="underline text-blue-600">Play another</a></p>
		</completion-banner>
	{/if}

	<!-- Active clue banner -->
	{#if activeClue && !completed}
		<active-clue class="block bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 mb-4 text-sm">
			<span class="font-bold">{activeClue.number} {activeClue.direction.toUpperCase()}:</span>
			{activeClue.clue}
		</active-clue>
	{/if}

	<!-- Board + clue list -->
	<crossword-layout class="flex flex-col lg:flex-row gap-6">
		<board-wrap class="flex-1 min-w-0">
			<CrosswordBoard
				grid={data.grid}
				clues={data.clues as CrosswordClue[]}
				width={data.width}
				height={data.height}
				{playerGrid}
				{selectedRow}
				{selectedCol}
				{selectedDirection}
				oncellselect={onCellSelect}
			/>
		</board-wrap>

		<sidebar class="w-full lg:w-72 shrink-0 flex flex-col gap-4">
			<ClueList
				clues={data.clues as CrosswordClue[]}
				selectedNumber={activeClue?.number ?? -1}
				{selectedDirection}
				onselect={onClueSelect}
			/>

			{#if !completed}
				<submit-area class="flex flex-col gap-2">
					{#if errorMsg}
						<p class="text-red-600 text-sm">{errorMsg}</p>
					{/if}
					<button
						onclick={submit}
						disabled={submitting}
						class="w-full bg-green-600 text-white py-2 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
					>
						{submitting ? 'Checking…' : 'Submit'}
					</button>
					<button
						onclick={saveProgress}
						class="w-full border border-gray-300 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
					>
						Save progress
					</button>
				</submit-area>
			{/if}
		</sidebar>
	</crossword-layout>
</main>

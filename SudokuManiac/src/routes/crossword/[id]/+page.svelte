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

	// ─── Hint helpers (Reveal letter / word / Ask the Owl) ──────────────────────
	let revealsLeft = $state(5);
	let owlNudge = $state('');

	/** Ask the server for the answer(s) and drop them into the grid. */
	async function reveal(payload: Record<string, unknown>) {
		if (revealsLeft <= 0) return;
		const res = await fetch(`/api/crossword/${data.id}/reveal`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
		if (!res.ok) return;
		const { cells } = (await res.json()) as { cells: { r: number; c: number; letter: string }[] };
		if (!cells.length) return;
		const next = { ...playerGrid };
		for (const { r, c, letter } of cells) next[`${r},${c}`] = letter;
		playerGrid = next;
		revealsLeft--;
	}

	function revealLetter() {
		if (selectedRow < 0) return;
		void reveal({ mode: 'letter', row: selectedRow, col: selectedCol }).then(advanceCursor);
	}

	function revealWord() {
		if (!activeClue) return;
		void reveal({ mode: 'word', clueNumber: activeClue.number, direction: activeClue.direction });
	}

	/** Ask the Owl — surfaces a nudge for the active clue (AI hint is a future upgrade). */
	function askOwl() {
		owlNudge = activeClue
			? `${activeClue.number} ${activeClue.direction} — “${activeClue.clue}” (${activeClue.length} letters).`
			: 'Select a clue and I’ll give you a nudge.';
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

<main class="mx-auto flex w-full max-w-6xl flex-col gap-4 px-1 py-2">
	<!-- header -->
	<div class="flex items-center justify-between gap-3">
		<div class="flex items-center gap-3 sm:gap-4">
			<a href="/crossword" class="btn-secondary kraft-radius-sm px-3 py-1 text-lg no-underline">← <span class="hidden sm:inline">Library</span></a>
			<div>
				<h1 class="m-0 font-display text-xl leading-none font-bold text-ink">{data.title}</h1>
				<div class="mt-0.5 text-[11px] font-medium text-muted capitalize">{data.difficulty} · {data.width}×{data.height} · {data.language.toUpperCase()}</div>
			</div>
		</div>
		<div class="flex items-center gap-1.5">
			<span class="label-caps hidden sm:inline">Time</span>
			<span class="font-hand text-2xl leading-none font-bold text-ink">{timerLabel()}</span>
		</div>
	</div>

	{#if completed}
		<div class="card-kraft mx-auto flex w-full max-w-md flex-col items-center gap-3 p-7 text-center" style="border-radius:22px 18px 20px 16px;box-shadow:4px 6px 0 rgba(50,44,36,.18)">
			<div class="flex size-24 items-center justify-center rounded-[24px] border-[1.5px] border-ink bg-surface-2"><img src="/mascot-owl.png" alt="" class="size-20" /></div>
			<div class="font-display text-3xl font-bold text-ink">All filled in!</div>
			<div class="text-sm text-ink-soft">{data.title} · <span class="capitalize">{data.difficulty}</span> · {revealsLeft === 5 ? 'no reveals used' : `${5 - revealsLeft} reveals`}</div>
			<div class="flex w-full gap-2.5">
				<div class="flex-1 rounded-[12px] border-[1.5px] border-ink bg-surface-2 py-2.5"><div class="font-hand text-2xl leading-none font-bold text-ink">{timerLabel()}</div><div class="mt-0.5 text-[10px] text-muted">time</div></div>
				<div class="flex-1 rounded-[12px] border-[1.5px] border-ink bg-surface-2 py-2.5"><div class="font-hand text-2xl leading-none font-bold text-terracotta">{revealsLeft}</div><div class="mt-0.5 text-[10px] text-muted">reveals left</div></div>
			</div>
			<div class="flex w-full gap-2.5">
				<a href="/crossword" class="btn-primary kraft-radius flex-1 py-2.5 text-xl no-underline">New topic</a>
				<a href="/crossword" class="btn-secondary kraft-radius flex-1 py-2.5 text-center text-xl no-underline">Library</a>
			</div>
		</div>
	{:else}
		<!-- active clue banner -->
		{#if activeClue}
			<div class="flex w-max max-w-full items-center gap-3 rounded-[13px] bg-navy px-4 py-2.5">
				<span class="font-hand text-xl leading-none font-bold whitespace-nowrap text-surface-2">{activeClue.number} {activeClue.direction === 'across' ? 'Across' : 'Down'}</span>
				<span class="h-5 w-px bg-[rgba(251,246,236,.4)]"></span>
				<span class="text-sm text-surface-2">{activeClue.clue} ({activeClue.length})</span>
			</div>
		{/if}

		<div class="flex flex-col gap-6 lg:flex-row lg:items-start">
			<!-- board + hints -->
			<div class="flex flex-col gap-4 lg:flex-none">
				<board-wrap class="block overflow-hidden rounded-[12px] border-[2.5px] border-ink bg-ink shadow-[3px_5px_0_rgba(50,44,36,.18)]">
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
				<div class="flex flex-wrap gap-2.5">
					<button onclick={revealLetter} disabled={revealsLeft <= 0} class="btn-secondary kraft-radius-sm relative bg-surface px-4 py-2 text-lg disabled:opacity-50">
						💡 Reveal letter
						<span class="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-[1.5px] border-ink bg-mustard px-1 text-[11px] font-bold text-ink" style="font-family:var(--font-sans)">{revealsLeft}</span>
					</button>
					<button onclick={revealWord} disabled={revealsLeft <= 0} class="btn-secondary kraft-radius-sm bg-surface px-4 py-2 text-lg disabled:opacity-50">🔑 Reveal word</button>
					<button onclick={askOwl} class="kraft-radius-sm border-[1.5px] border-ink bg-navy px-4 py-2 font-hand text-lg font-bold text-surface-2 shadow-btn-sm">🦉 Ask the Owl</button>
				</div>
			</div>

			<!-- clue list + submit -->
			<div class="flex w-full min-w-0 flex-col gap-4 lg:flex-1">
				<ClueList
					clues={data.clues as CrosswordClue[]}
					selectedNumber={activeClue?.number ?? -1}
					{selectedDirection}
					onselect={onClueSelect}
				/>

				{#if owlNudge}
					<div class="card-kraft flex items-start gap-3 p-4" style="border-radius:15px 12px 14px 11px">
						<img src="/mascot-owl.png" alt="" class="size-11 flex-none" />
						<div><div class="font-hand text-lg leading-none font-bold text-ink">Owl's nudge</div><div class="mt-1 text-[13px] text-ink-soft">{owlNudge}</div></div>
					</div>
				{/if}

				{#if errorMsg}<p class="m-0 text-sm text-terracotta-ink">{errorMsg}</p>{/if}
				<div class="flex gap-2.5">
					<button onclick={submit} disabled={submitting} class="btn-primary kraft-radius flex-1 py-2.5 text-xl disabled:opacity-60">{submitting ? 'Checking…' : 'Submit'}</button>
					<button onclick={saveProgress} class="btn-secondary kraft-radius px-5 py-2.5 text-xl">Save</button>
				</div>
			</div>
		</div>
	{/if}
</main>

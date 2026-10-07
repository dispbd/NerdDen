<!--
  Nonogram in play — /nonogram/[id]  ("Kraft Draft")  → NerdDen Nonograms.dc.html
  Board with clue gutters, Fill/Mark tools, Undo, Hint, mistakes and timer, progress,
  the Cat's tip; then the solved card (the picture appears) or "out of ink".

  Every move goes through NonogramSync: it shows at once and the server judges it.
-->
<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages.js';
	import KraftTopBar from '$lib/components/shared/KraftTopBar.svelte';
	import NonogramBoard from '$lib/components/nonogram/NonogramBoard.svelte';
	import NonogramThumb from '$lib/components/nonogram/NonogramThumb.svelte';
	import {
		catTip,
		formatTime,
		gradeFor,
		NonogramSync,
		undoMoves,
		type CatTip,
		type PlayResult,
		type SessionView,
		type StrokeEntry
	} from '$lib/games/nonogram/client';
	import type { Tool } from '$lib/games/nonogram/board';
	import {
		cellKey,
		MAX_MISTAKES,
		type NonogramMove,
		type PlayerGrid
	} from '$lib/games/nonogram/types';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();
	const puzzle = $derived(data.puzzle);

	type Phase = 'loading' | 'error' | 'in_progress' | 'completed' | 'failed';

	let phase = $state<Phase>('loading');
	let sessionId = '';
	let grid = $state<PlayerGrid>({});
	let mistakes = $state(0);
	let hintsLeft = $state(0);
	let hintsUsed = $state(0);
	let seconds = $state(0);
	let xpEarned = $state(0);
	let solution = $state<string[] | null>(null);
	let offline = $state(false);
	let hinting = $state(false);
	/** The solved/failed card appears after the board has shown the picture. */
	let showCard = $state(false);
	let copied = $state(false);
	let fallbackDismissed = $state(false);

	let tool = $state<Tool>('fill');
	let board: ReturnType<typeof NonogramBoard> | undefined = $state();
	let sync: NonogramSync | null = null;

	// Undo history: one entry per stroke, recorded as it is painted.
	let strokes = $state<StrokeEntry[][]>([]);
	let stroke: StrokeEntry[] | null = null;

	const playing = $derived(phase === 'in_progress');
	const fallback = $derived(page.url.searchParams.get('fallback'));

	const totalFilled = $derived(
		puzzle.rowClues.reduce((s, clue) => s + clue.reduce((a, b) => a + b, 0), 0)
	);
	const progress = $derived.by(() => {
		let found = puzzle.reveals.filter((r) => r.state === 'filled').length;
		for (const v of Object.values(grid)) if (v === 'filled') found++;
		return totalFilled ? Math.min(100, Math.round((found / totalFilled) * 100)) : 0;
	});

	const tip = $derived(catTip(puzzle.rowClues, puzzle.colClues, grid, puzzle.reveals));

	function tipText(t: CatTip): string {
		if (t.kind === 'edges') return m.nono_tip_edges();
		const line = t.axis === 'row' ? m.nono_row({ n: t.line }) : m.nono_col({ n: t.line });
		if (t.kind === 'full') return m.nono_tip_full({ line });
		if (t.kind === 'empty') return m.nono_tip_empty({ line });
		return m.nono_tip_overlap({ line, block: t.block, sure: t.sure });
	}

	const diffLabel = $derived(
		puzzle.difficulty === 'easy'
			? m.difficulty_easy()
			: puzzle.difficulty === 'hard'
				? m.difficulty_hard()
				: m.difficulty_medium()
	);
	const sizeLabel = $derived(`${puzzle.size}×${puzzle.size}`);
	const meta = $derived(
		[diffLabel, sizeLabel, puzzle.source === 'ai' ? 'AI' : null].filter(Boolean).join(' · ')
	);

	// ─── Session ────────────────────────────────────────────────────────────────

	const storageKey = $derived(`nonogram_session_${puzzle.id}`);

	async function post<T>(url: string, body?: unknown): Promise<T> {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body ?? {})
		});
		if (!res.ok) throw new Error(String(res.status));
		return res.json() as Promise<T>;
	}

	async function openSession(resume: boolean) {
		phase = 'loading';
		seconds = 0; // a resumed session brings its own time back
		showCard = false;
		solution = null;
		strokes = [];
		let resumeId: string | null = null;
		try {
			if (resume) resumeId = localStorage.getItem(storageKey);
		} catch {
			/* storage blocked: a fresh session is fine */
		}
		try {
			const s = await post<SessionView>(`/api/nonogram/${puzzle.id}/sessions`, { resumeId });
			try {
				localStorage.setItem(storageKey, s.id);
			} catch {
				/* storage blocked */
			}
			sessionId = s.id;
			apply(s);
			sync = new NonogramSync(
				s.playerGrid,
				puzzle.reveals,
				{
					moves: (moves) =>
						post<PlayResult>(`/api/nonogram/sessions/${sessionId}/moves`, {
							moves,
							timeSpent: seconds
						}),
					hint: () => post<PlayResult>(`/api/nonogram/sessions/${sessionId}/hint`)
				},
				(g) => {
					grid = g;
					offline = sync?.offline ?? false;
				},
				onResult
			);
			grid = s.playerGrid;
			phase = s.status === 'in_progress' ? 'in_progress' : s.status;
		} catch {
			phase = 'error';
		}
	}

	function apply(s: SessionView) {
		mistakes = s.mistakes;
		hintsLeft = s.hintsLeft;
		hintsUsed = s.hintsUsed;
		seconds = Math.max(seconds, s.timeSpent);
	}

	function onResult(res: PlayResult) {
		apply(res.session);
		if (res.wrong?.length) board?.flashWrong(res.wrong);
		if (res.cell) board?.flashHint(res.cell);
		if (res.session.status !== 'in_progress' && phase === 'in_progress') {
			phase = res.session.status;
			xpEarned = res.xpEarned;
			solution = res.solution;
			if (phase === 'completed') {
				board?.revealPicture(puzzle.color);
				setTimeout(() => (showCard = true), 1100);
			} else {
				showCard = true;
			}
		}
	}

	// Open (or resume) the session for this puzzle — again if the id changes, since
	// back/forward between two puzzles reuses this component.
	$effect(() => {
		void puzzle.id;
		untrack(() => void openSession(true));
	});

	onMount(() => {
		const timer = setInterval(() => {
			if (phase === 'in_progress' && !document.hidden) seconds++;
		}, 1000);
		// Leaving or hiding the tab: send what is still unsent.
		const flush = () => {
			if (document.visibilityState === 'hidden') sync?.flush();
		};
		document.addEventListener('visibilitychange', flush);
		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', flush);
			sync?.flush();
		};
	});

	// ─── Input ──────────────────────────────────────────────────────────────────

	function onPaint(move: NonogramMove) {
		if (!playing || !sync) return;
		(stroke ??= []).push({ move, before: sync.grid[cellKey(move.x, move.y)] });
		sync.paint(move);
	}

	function onStrokeEnd() {
		if (stroke?.length) strokes = [...strokes, stroke];
		stroke = null;
		sync?.flush();
	}

	function undo() {
		if (!playing || !sync) return;
		// Skip strokes with nothing left to take back (e.g. only a wrong fill's cross).
		let moves: NonogramMove[] = [];
		let left = strokes;
		while (left.length && !moves.length) {
			moves = undoMoves(left[left.length - 1], sync.grid);
			left = left.slice(0, -1);
		}
		strokes = left;
		for (const mv of moves) sync.paint(mv);
		if (moves.length) sync.flush();
	}

	async function hint() {
		if (!playing || !sync || hinting || hintsLeft <= 0) return;
		hinting = true;
		try {
			await sync.hint();
		} finally {
			hinting = false;
		}
	}

	function onKeydown(e: KeyboardEvent) {
		if (!playing || e.target instanceof HTMLInputElement) return;
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
			e.preventDefault();
			undo();
		} else if (e.key === 'f' || e.key === 'F') tool = 'fill';
		else if (e.key === 'x' || e.key === 'X' || e.key === 'm' || e.key === 'M') tool = 'mark';
	}

	async function share() {
		const url = `${location.origin}${resolve('/nonogram/[id]', { id: puzzle.id })}`;
		try {
			if (navigator.share) {
				await navigator.share({ title: puzzle.title, text: m.nono_share_text(), url });
				return;
			}
			await navigator.clipboard.writeText(url);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			/* the share sheet was dismissed */
		}
	}
</script>

<svelte:head><title>{puzzle.title} — {m.game_nonograms()} — NerdDen</title></svelte:head>
<svelte:window onkeydown={onKeydown} />

<nonogram-play class="flex min-h-screen flex-col bg-paper">
	<KraftTopBar title={puzzle.title} backHref={resolve('/nonogram')} backLabel={m.nono_library()}>
		{#snippet right()}
			<div class="flex items-baseline gap-1.5" title={m.nono_mistakes()}>
				<span class="label-caps hidden sm:inline">{m.nono_mistakes()}</span>
				<span class="font-hand text-[22px] leading-none font-bold text-marker-red">{mistakes}</span>
				<span class="text-[13px] font-medium text-muted">/{MAX_MISTAKES}</span>
			</div>
			<div class="flex items-baseline gap-1.5" title={m.nono_time()}>
				<span class="label-caps hidden sm:inline">{m.nono_time()}</span>
				<span class="font-hand text-[26px] leading-none font-bold text-ink tabular-nums"
					>{formatTime(seconds)}</span
				>
			</div>
		{/snippet}
	</KraftTopBar>

	{#if fallback && !fallbackDismissed}
		<div
			class="mx-auto mt-4 flex w-[calc(100%-2rem)] max-w-3xl items-start gap-3 border-[1.5px] border-dashed border-[#b6a98c] bg-surface px-4 py-3 text-sm text-ink-soft"
			style="border-radius:14px 11px 15px 12px"
			role="status"
		>
			<img src="/mascot-nono.png" alt="" class="size-8 flex-none" />
			<span class="flex-1"
				>{fallback === 'unavailable'
					? m.nono_fallback_unavailable()
					: m.nono_fallback_unusable()}</span
			>
			<button
				class="text-muted"
				aria-label={m.nono_close()}
				onclick={() => (fallbackDismissed = true)}>✕</button
			>
		</div>
	{/if}

	<div
		class="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center gap-6 px-4 py-6 lg:flex-row lg:items-start lg:justify-center lg:gap-10"
	>
		<!-- board + progress -->
		<div class="flex w-full min-w-0 flex-col items-center gap-4 lg:w-auto lg:flex-1">
			<div class="w-full max-w-[640px]">
				<NonogramBoard
					bind:this={board}
					rowClues={puzzle.rowClues}
					colClues={puzzle.colClues}
					reveals={puzzle.reveals}
					playerGrid={grid}
					{tool}
					readonly={!playing}
					label={puzzle.title}
					onpaint={onPaint}
					onstrokeend={onStrokeEnd}
				/>
			</div>
			{#if phase === 'loading'}
				<p class="m-0 text-sm text-muted">{m.nono_loading()}</p>
			{:else if phase === 'error'}
				<p class="m-0 text-sm text-terracotta-ink" role="alert">{m.nono_load_failed()}</p>
			{/if}
			<div class="flex w-full max-w-[360px] items-center gap-2.5">
				<div
					class="h-2 flex-1 overflow-hidden rounded-full border border-[#cdbfa6] bg-[#ddd3bf]"
					role="progressbar"
					aria-valuenow={progress}
					aria-valuemin={0}
					aria-valuemax={100}
				>
					<div class="h-full bg-forest transition-[width]" style:width="{progress}%"></div>
				</div>
				<span class="text-xs font-semibold text-ink-soft tabular-nums">{progress}%</span>
			</div>
			{#if offline}
				<p class="m-0 text-xs text-terracotta-ink" role="status">{m.nono_offline()}</p>
			{/if}
		</div>

		<!-- rail: tools, undo/hint, the Cat's tip -->
		<aside class="flex w-full max-w-[640px] flex-col gap-[18px] lg:w-[280px] lg:flex-none">
			<div class="hidden text-xs font-medium text-muted lg:block">{meta}</div>
			<div class="flex flex-col gap-2.5">
				<span class="label-caps hidden lg:block">{m.nono_tool()}</span>
				<div class="grid grid-cols-2 gap-[9px] lg:gap-2.5">
					<button
						onclick={() => (tool = 'fill')}
						aria-pressed={tool === 'fill'}
						class="kraft-radius-sm border-[1.5px] border-ink py-2.5 font-hand text-[19px] font-bold lg:py-3.5 lg:text-xl {tool ===
						'fill'
							? 'bg-ink text-surface-2'
							: 'bg-surface text-terracotta-ink'}"
						style:box-shadow={tool === 'fill' ? '2px 3px 0 rgba(50,44,36,.5)' : 'none'}
						><span aria-hidden="true">■</span> {m.nono_fill()}</button
					>
					<button
						onclick={() => (tool = 'mark')}
						aria-pressed={tool === 'mark'}
						class="border-[1.5px] border-ink py-2.5 font-hand text-[19px] font-bold lg:py-3.5 lg:text-xl {tool ===
						'mark'
							? 'bg-ink text-surface-2'
							: 'bg-surface text-terracotta-ink'}"
						style="border-radius:10px 12px 9px 11px"
						style:box-shadow={tool === 'mark' ? '2px 3px 0 rgba(50,44,36,.5)' : 'none'}
						><span aria-hidden="true">✕</span> {m.nono_mark()}</button
					>
				</div>
				<p class="m-0 hidden text-xs leading-snug text-muted-2 lg:block">{m.nono_tool_help()}</p>
			</div>

			<div class="grid grid-cols-2 gap-[11px]">
				<button
					onclick={undo}
					disabled={!playing || !strokes.length}
					class="btn-secondary kraft-radius-sm bg-surface py-2 text-[17px] shadow-btn-sm lg:text-[19px]"
					><span aria-hidden="true">↶</span> {m.nono_undo()}</button
				>
				<button
					onclick={hint}
					disabled={!playing || hinting || hintsLeft <= 0}
					class="btn-secondary relative bg-surface py-2 text-[17px] shadow-btn-sm lg:text-[19px]"
					style="border-radius:12px 10px 11px 9px"
				>
					<span aria-hidden="true">💡</span>
					{m.nono_hint()}
					<span
						class="absolute -top-[7px] -right-[6px] flex h-5 min-w-5 items-center justify-center rounded-full border-[1.5px] border-ink bg-mustard px-1 font-sans text-[11px] font-bold text-ink"
						>{hintsLeft}</span
					>
				</button>
			</div>

			{#if playing}
				<div
					class="card-kraft hidden gap-[13px] p-4 lg:flex"
					style="border-radius:16px 13px 15px 12px"
				>
					<img src="/mascot-nono.png" alt="" class="size-[50px] flex-none" />
					<div>
						<div class="font-hand text-xl font-bold text-ink">{m.nono_tip_title()}</div>
						<p class="m-0 mt-0.5 text-[13px] leading-[1.45] text-ink-soft">{tipText(tip)}</p>
					</div>
				</div>
			{/if}
		</aside>
	</div>
</nonogram-play>

<!-- solved / out of ink -->
{#if showCard && (phase === 'completed' || phase === 'failed')}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4">
		<div
			class="card-kraft flex w-full max-w-[430px] flex-col items-center gap-4 p-[30px] text-center"
			style="border-radius:22px 18px 20px 16px; box-shadow:4px 6px 0 rgba(50,44,36,.18)"
			role="dialog"
			aria-modal="true"
			aria-labelledby="nono-end-title"
		>
			<button
				class="self-end -mt-3 -mr-2 -mb-2 text-lg text-muted"
				aria-label={m.nono_close()}
				onclick={() => (showCard = false)}>✕</button
			>
			{#if solution}
				<div class="max-w-full overflow-hidden">
					<NonogramThumb
						size={puzzle.size}
						{solution}
						color={phase === 'completed' ? puzzle.color : 'var(--color-ink-soft)'}
						cell={puzzle.size <= 5 ? 40 : puzzle.size <= 10 ? 22 : 16}
						gaps={false}
						label={puzzle.title}
					/>
				</div>
			{/if}

			{#if phase === 'completed'}
				<h2 id="nono-end-title" class="m-0 text-[32px] leading-tight">
					{m.nono_solved_title({ title: puzzle.title })}
				</h2>
				<div class="text-sm font-medium text-ink-soft">
					{diffLabel} · {sizeLabel} · {mistakes
						? m.nono_with_mistakes({ n: mistakes })
						: m.nono_no_mistakes()}
				</div>
				<div class="grid w-full grid-cols-3 gap-[11px]">
					<div class="kraft-radius-sm border-[1.5px] border-ink bg-surface-2 py-3">
						<div class="font-hand text-[27px] leading-none font-bold text-ink">
							{formatTime(seconds)}
						</div>
						<div class="mt-1 text-[10px] font-medium text-muted">{m.nono_stat_time()}</div>
					</div>
					<div
						class="border-[1.5px] border-ink bg-surface-2 py-3"
						style="border-radius:10px 12px 9px 11px"
					>
						{#if data.signedIn}
							<div class="font-hand text-[27px] leading-none font-bold text-forest">
								+{xpEarned}
							</div>
							<div class="mt-1 text-[10px] font-medium text-muted">{m.nono_stat_xp()}</div>
						{:else}
							<div class="font-hand text-[27px] leading-none font-bold text-muted">—</div>
							<div class="mt-1 text-[10px] font-medium text-muted">{m.nono_xp_guest()}</div>
						{/if}
					</div>
					<div
						class="border-[1.5px] border-ink bg-surface-2 py-3"
						style="border-radius:12px 9px 11px 10px"
					>
						<div class="font-hand text-[27px] leading-none font-bold text-terracotta">
							{gradeFor(mistakes, hintsUsed)}
						</div>
						<div class="mt-1 text-[10px] font-medium text-muted">{m.nono_stat_grade()}</div>
					</div>
				</div>
				<div class="flex w-full gap-2.5">
					<a
						href={resolve('/nonogram')}
						class="btn-primary kraft-radius-sm flex-1 py-2.5 text-[21px] no-underline"
						>{m.nono_new_picture()}</a
					>
					<button onclick={share} class="btn-secondary kraft-radius-sm flex-1 py-2.5 text-[21px]"
						>{copied ? m.nono_link_copied() : `${m.nono_share()} ↗`}</button
					>
				</div>
			{:else}
				<h2 id="nono-end-title" class="m-0 text-[32px] leading-tight">{m.nono_failed_title()}</h2>
				<p class="m-0 text-sm text-ink-soft">{m.nono_failed_body()}</p>
				<div class="flex w-full gap-2.5">
					<button
						onclick={() => openSession(false)}
						class="btn-primary kraft-radius-sm flex-1 py-2.5 text-[21px]"
						>{m.nono_try_again()}</button
					>
					<a
						href={resolve('/nonogram')}
						class="btn-secondary kraft-radius-sm flex-1 py-2.5 text-[21px] no-underline"
						>{m.nono_library()}</a
					>
				</div>
			{/if}
		</div>
	</div>
{/if}

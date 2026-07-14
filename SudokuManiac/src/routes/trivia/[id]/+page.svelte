<!--
  Trivia — play (solo)  ("Kraft Draft")  → NerdDen Trivia.dc.html
  Client state machine: question → feedback → … → results. Per-question timer ring,
  streak multiplier, correct/wrong feedback with the Fox + explanation. Answers are
  graded on the server (/api/trivia/[id]/answer); the result is finalized via
  /complete. Questions arrive with the correct answer + explanation stripped.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { m } from '$lib/paraglide/messages.js';
	import type { PageData } from './$types';
	import { QUESTION_SECONDS } from '$lib/games/trivia/types';
	import type { AnswerResult } from '$lib/games/trivia/types';

	let { data }: { data: PageData } = $props();

	// Snapshot the load data into plain locals — a quiz session is static per
	// navigation, and this captures the initial resume values without reactivity.
	const { sessionId, set, questions, session: session0 } = data;

	const QUESTION_MS = QUESTION_SECONDS * 1000;
	const total = questions.length;
	const KEYS = ['A', 'B', 'C', 'D'];
	const startTime = Date.now();

	type Phase = 'question' | 'feedback' | 'results';

	let idx = $state(session0.currentIndex);
	let score = $state(session0.score);
	let streak = $state(session0.currentStreak);
	let bestStreak = $state(session0.bestStreak);
	let correctCount = $state(session0.correctCount);
	// Resume as results if the run is finished or every question was already answered.
	let phase = $state<Phase>(
		session0.status === 'completed' || session0.currentIndex >= total ? 'results' : 'question'
	);

	let chosen = $state<number | null>(null);
	let result = $state<AnswerResult | null>(null);
	let locked = $state(false);
	let errorMsg = $state('');
	let msLeft = $state(QUESTION_MS);

	// Progress marks: true = correct, false = wrong, null = unanswered.
	let marks = $state<(boolean | null)[]>(
		Array.from({ length: total }, (_, i) => (i < session0.currentIndex ? true : null))
	);

	type Summary = {
		score: number;
		correctCount: number;
		questionCount: number;
		bestStreak: number;
		xpEarned: number;
	};
	let summary = $state<Summary | null>(null);
	let copied = $state(false);

	const current = $derived(questions[idx]);
	const secondsLeft = $derived(Math.max(0, Math.ceil(msLeft / 1000)));
	const ringFrac = $derived(Math.max(0, Math.min(1, msLeft / QUESTION_MS)));
	const RING_LEN = 138; // ≈ 2πr, r = 22

	// Per-question countdown — restarts whenever a new question begins.
	$effect(() => {
		if (phase !== 'question') return;
		void idx; // re-run the timer for each question
		const deadline = Date.now() + QUESTION_MS;
		msLeft = QUESTION_MS;
		const iv = setInterval(() => {
			const left = deadline - Date.now();
			msLeft = left > 0 ? left : 0;
			if (left <= 0) {
				clearInterval(iv);
				answer(-1); // timed out → graded wrong
			}
		}, 100);
		return () => clearInterval(iv);
	});

	onMount(() => {
		if (phase === 'results' && !summary) void finish();
	});

	async function answer(choice: number) {
		if (locked || phase !== 'question') return;
		locked = true;
		chosen = choice;
		const sentMsLeft = msLeft;
		try {
			const res = await fetch(`/api/trivia/${sessionId}/answer`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ index: idx, chosen: choice, msLeft: sentMsLeft })
			});
			if (!res.ok) throw new Error(`Error ${res.status}`);
			const r = (await res.json()) as AnswerResult;
			result = r;
			score = r.score;
			streak = r.streak;
			bestStreak = Math.max(bestStreak, r.streak);
			if (r.correct) correctCount += 1;
			marks[idx] = r.correct;
			phase = 'feedback';
		} catch (e: unknown) {
			errorMsg = e instanceof Error ? e.message : 'Failed to submit answer';
			locked = false; // allow retry (a click re-submits)
		}
	}

	async function next() {
		if (idx + 1 >= total) {
			await finish();
			return;
		}
		idx += 1;
		chosen = null;
		result = null;
		locked = false;
		errorMsg = '';
		phase = 'question';
	}

	async function finish() {
		try {
			const res = await fetch(`/api/trivia/${sessionId}/complete`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ timeSpent: Math.round((Date.now() - startTime) / 1000) })
			});
			if (res.ok) summary = (await res.json()) as Summary;
		} catch {
			// Fall back to locally-tracked numbers if the finalize call fails.
		}
		summary ??= {
			score,
			correctCount,
			questionCount: total,
			bestStreak,
			xpEarned: correctCount * 10
		};
		phase = 'results';
	}

	async function share() {
		if (!summary) return;
		const text = m.trivia_share_text({
			correct: summary.correctCount,
			total: summary.questionCount,
			score: summary.score,
			topic: set.topic
		});
		try {
			await navigator.clipboard.writeText(`${text} ${location.origin}/trivia`);
			copied = true;
		} catch {
			/* clipboard unavailable */
		}
	}

	const diffLabel = (v: string) =>
		v === 'easy' ? m.trivia_diff_easy() : v === 'hard' ? m.trivia_diff_hard() : v === 'medium' ? m.trivia_diff_medium() : v;

	function segColor(i: number): string {
		const m = marks[i];
		if (m === true) return 'var(--color-forest)';
		if (m === false) return 'var(--color-marker-red)';
		if (i === idx && phase !== 'results') return 'var(--color-terracotta)';
		return 'var(--color-track)';
	}

	/** 'correct' | 'wrong' | 'neutral' for an option in the feedback state. */
	function optState(i: number): 'correct' | 'wrong' | 'neutral' {
		if (phase !== 'feedback' || !result) return 'neutral';
		if (i === result.correctIndex) return 'correct';
		if (i === chosen) return 'wrong';
		return 'neutral';
	}

	const headline = $derived.by(() => {
		const s = summary;
		if (!s || s.questionCount === 0) return m.trivia_res_over();
		const r = s.correctCount / s.questionCount;
		if (r >= 0.9) return m.trivia_res_sharp();
		if (r >= 0.7) return m.trivia_res_well();
		if (r >= 0.4) return m.trivia_res_notbad();
		return m.trivia_res_keep();
	});

	const noteLine = $derived.by(() => {
		const s = summary;
		if (!s) return '';
		if (s.correctCount === s.questionCount && s.questionCount > 0)
			return m.trivia_note_flawless({ xp: s.xpEarned });
		if (s.bestStreak >= 5) return m.trivia_note_streak({ xp: s.xpEarned, n: s.bestStreak });
		return m.trivia_note_plain({ xp: s.xpEarned });
	});
</script>

<svelte:head><title>{set.title} — NerdDen</title></svelte:head>

<trivia-play class="mx-auto block w-full max-w-md px-1 py-4">
	{#if phase !== 'results'}
		<!-- header: exit + progress + counter -->
		<div class="mb-4 flex items-center gap-2.5">
			<a href="/trivia" aria-label={m.trivia_exit()} class="btn-secondary kraft-radius-sm px-3 py-1 text-lg no-underline">✕</a>
			<div class="flex flex-1 gap-1">
				{#each marks as _m, i (i)}
					<span class="h-[7px] flex-1 rounded-full border border-ink/25" style="background:{segColor(i)}"></span>
				{/each}
			</div>
			<span class="text-xs font-semibold text-muted">{Math.min(idx + 1, total)}/{total}</span>
		</div>

		<!-- fox + streak / timer ring -->
		<div class="mb-4 flex items-center justify-between">
			<div class="flex items-center gap-2.5">
				<div class="flex size-10 items-center justify-center rounded-[11px] border-[1.5px] border-ink bg-surface-2">
					<img src="/mascot-trivia.png" alt="" class="size-8" />
				</div>
				<div>
					<div class="field-label">{m.trivia_streak()}</div>
					<div class="font-hand text-xl font-bold leading-none text-terracotta">×{streak}</div>
				</div>
			</div>
			<div class="relative size-[52px]">
				<svg width="52" height="52" viewBox="0 0 52 52">
					<circle cx="26" cy="26" r="22" fill="none" stroke="var(--color-track)" stroke-width="5" />
					<circle
						cx="26" cy="26" r="22" fill="none"
						stroke={secondsLeft <= 5 ? 'var(--color-marker-red)' : 'var(--color-forest)'}
						stroke-width="5" stroke-linecap="round"
						stroke-dasharray={RING_LEN}
						stroke-dashoffset={RING_LEN * (1 - ringFrac)}
						transform="rotate(-90 26 26)"
					/>
				</svg>
				<div class="absolute inset-0 flex items-center justify-center font-hand text-xl font-bold text-ink">{secondsLeft}</div>
			</div>
		</div>

		<!-- question -->
		<div class="card-kraft kraft-radius mb-4 p-5">
			<div class="label-caps mb-2.5">{m.trivia_question_n({ n: idx + 1 })}</div>
			<div class="font-display text-[22px] font-bold leading-tight text-ink">{current.question}</div>
		</div>

		<!-- options -->
		<div class="flex flex-col gap-2.5">
			{#each current.options as opt, i (i)}
				{@const st = optState(i)}
				<button
					onclick={() => answer(i)}
					disabled={phase === 'feedback'}
					class="kraft-radius-sm flex items-center gap-3 border-[1.5px] px-3.5 py-3 text-left
						{st === 'correct' ? 'border-forest bg-forest/15' : st === 'wrong' ? 'border-marker-red bg-marker-red/15' : 'border-ink bg-surface'}
						{phase === 'question' ? 'shadow-btn-sm' : ''}"
				>
					<span
						class="flex size-[30px] flex-none items-center justify-center rounded-[9px] border-[1.5px] font-hand text-lg font-bold
							{st === 'correct' ? 'border-forest bg-forest text-surface-2' : st === 'wrong' ? 'border-marker-red bg-marker-red text-surface-2' : 'border-ink bg-paper text-ink'}"
					>{KEYS[i]}</span>
					<span class="font-semibold {st === 'wrong' ? 'text-terracotta-ink' : 'text-ink'}">{opt}</span>
					{#if st === 'correct'}<span class="ml-auto font-hand text-xl font-bold text-forest">✓</span>{/if}
					{#if st === 'wrong'}<span class="ml-auto font-hand text-xl font-bold text-marker-red">✕</span>{/if}
				</button>
			{/each}
		</div>

		{#if errorMsg}<p class="mt-3 mb-0 text-sm text-terracotta-ink">{errorMsg}</p>{/if}

		<!-- feedback -->
		{#if phase === 'feedback' && result}
			<div
				class="kraft-radius mt-4 flex items-start gap-3 border-[1.5px] border-ink p-4 shadow-card {result.correct ? 'bg-forest' : 'bg-marker-red'}"
			>
				<div class="flex size-11 flex-none items-center justify-center rounded-xl border-[1.5px] border-ink bg-surface-2">
					<img src="/mascot-trivia.png" alt="" class="size-9" />
				</div>
				<div>
					<div class="mb-1 font-hand text-xl font-bold leading-none text-surface-2">
						{#if result.correct}{m.trivia_correct({ points: result.points })}{:else}{m.trivia_wrong({ answer: current.options[result.correctIndex] })}{/if}
					</div>
					<div class="text-[13px] leading-snug text-surface-2/90">{result.explanation}</div>
				</div>
			</div>
			<button onclick={next} class="btn-primary kraft-radius mt-3.5 w-full py-2.5 text-xl">
				{idx + 1 >= total ? m.trivia_see_results() : m.trivia_next()}
			</button>
		{/if}
	{:else if summary}
		<!-- solo result -->
		<div class="py-2 text-center">
			<div class="mx-auto mb-3.5 flex size-28 items-center justify-center rounded-[26px] border-[1.5px] border-ink bg-surface-2">
				<img src="/mascot-trivia.png" alt="" class="size-24" />
			</div>
			<div class="font-display text-3xl font-bold text-ink">{headline}</div>
			<div class="mt-1 mb-5 font-medium text-ink-soft">{set.topic} · {diffLabel(set.difficulty)}</div>

			<div class="mb-4 flex gap-2.5">
				<div class="flex-1 rounded-[14px] border-[1.5px] border-ink bg-forest py-3.5">
					<div class="font-hand text-3xl font-bold leading-none text-surface-2">{summary.correctCount}/{summary.questionCount}</div>
					<div class="mt-1 text-[10px] font-medium text-surface-2/90">{m.trivia_correct_label()}</div>
				</div>
				<div class="flex-1 rounded-[14px] border-[1.5px] border-ink bg-surface py-3.5">
					<div class="font-hand text-3xl font-bold leading-none text-ink">{summary.score}</div>
					<div class="mt-1 text-[10px] font-medium text-muted">{m.trivia_points_label()}</div>
				</div>
				<div class="flex-1 rounded-[14px] border-[1.5px] border-ink bg-surface py-3.5">
					<div class="font-hand text-3xl font-bold leading-none text-terracotta">×{summary.bestStreak}</div>
					<div class="mt-1 text-[10px] font-medium text-muted">{m.trivia_best_streak()}</div>
				</div>
			</div>

			<div class="card-kraft kraft-radius mb-4 flex items-center gap-2.5 px-4 py-3 text-left">
				<span class="text-base">💡</span>
				<div class="text-[13px] leading-snug text-ink-soft">{noteLine}</div>
			</div>

			<div class="flex gap-2.5">
				<button onclick={() => goto('/trivia')} class="btn-primary kraft-radius flex-1 py-2.5 text-xl">{m.trivia_new_topic()}</button>
				<button onclick={share} class="btn-secondary kraft-radius flex-1 py-2.5 text-xl">{copied ? m.trivia_copied() : m.trivia_share()}</button>
			</div>
		</div>
	{/if}
</trivia-play>

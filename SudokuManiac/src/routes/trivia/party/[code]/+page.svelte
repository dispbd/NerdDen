<!--
  Trivia — Party ("Kraft Draft"). Multiplayer over DB polling (no WebSockets):
  the client polls /api/trivia/party/[code] ~every 1.2s and the server advances the
  shared question timeline lazily. Lobby → playing (answering/reveal) → finished.
-->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { m } from '$lib/paraglide/messages.js';
	import type { PageData } from './$types';
	import type { PartyState } from '$lib/games/trivia/types';

	let { data }: { data: PageData } = $props();
	const code = data.code;
	const KEYS = ['A', 'B', 'C', 'D'];

	let token = $state<string | null>(null);
	let name = $state('');
	let joining = $state(false);
	let party = $state<PartyState | null>(null);
	let errorMsg = $state('');
	let myChoice = $state<number | null>(null);
	let answeredIndex = $state(-1);
	let now = $state(Date.now());

	let clockOffset = 0; // serverNow - localNow
	let seenIndex = -1;
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let tickTimer: ReturnType<typeof setInterval> | null = null;

	const RING_LEN = 138;

	const answerLeft = $derived.by(() => {
		const s = party;
		if (!s || s.questionStartedAt == null) return 0;
		const serverTime = now + clockOffset;
		return Math.max(0, s.answerMs - (serverTime - s.questionStartedAt));
	});
	const secondsLeft = $derived(Math.ceil(answerLeft / 1000));
	const ringFrac = $derived(party ? Math.max(0, Math.min(1, answerLeft / party.answerMs)) : 0);

	const answered = $derived(!!party && (party.me.answeredCurrent || answeredIndex === party.currentIndex));
	const leaderboard = $derived(party ? [...party.players].sort((a, b) => b.score - a.score) : []);

	onMount(() => {
		token = localStorage.getItem(`trivia_party_token:${code}`);
		name = localStorage.getItem('trivia_party_name') ?? '';
		void poll();
		pollTimer = setInterval(poll, 1200);
		tickTimer = setInterval(() => (now = Date.now()), 100);
	});
	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer);
		if (tickTimer) clearInterval(tickTimer);
	});

	async function poll() {
		try {
			const url = token
				? `/api/trivia/party/${code}?token=${encodeURIComponent(token)}`
				: `/api/trivia/party/${code}`;
			const res = await fetch(url);
			if (!res.ok) {
				if (res.status === 404) errorMsg = 'not_found';
				return;
			}
			const s = (await res.json()) as PartyState;
			clockOffset = s.serverNow - Date.now();
			if (s.currentIndex !== seenIndex) {
				seenIndex = s.currentIndex;
				myChoice = null; // new question — clear my local pick
			}
			party = s;
		} catch {
			/* transient network error — next tick retries */
		}
	}

	async function join() {
		if (joining || !name.trim()) return;
		joining = true;
		errorMsg = '';
		const t = crypto.randomUUID();
		try {
			const res = await fetch(`/api/trivia/party/${code}/join`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: name.trim(), token: t })
			});
			if (!res.ok) throw new Error(`Error ${res.status}`);
			token = t;
			localStorage.setItem(`trivia_party_token:${code}`, t);
			localStorage.setItem('trivia_party_name', name.trim());
			await poll();
		} catch (e: unknown) {
			errorMsg = e instanceof Error ? e.message : 'join_failed';
		}
		joining = false;
	}

	async function start() {
		try {
			await fetch(`/api/trivia/party/${code}/start`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token })
			});
			await poll();
		} catch {
			/* ignore; poll will reflect party */
		}
	}

	async function answer(choice: number) {
		const s = party;
		if (!s || s.phase !== 'answering' || answered || !token) return;
		myChoice = choice;
		answeredIndex = s.currentIndex;
		try {
			await fetch(`/api/trivia/party/${code}/answer`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token, index: s.currentIndex, chosen: choice, msLeft: answerLeft })
			});
			await poll();
		} catch {
			/* poll will reconcile */
		}
	}

	async function copyCode() {
		try {
			await navigator.clipboard.writeText(`${location.origin}/trivia/party/${code}`);
		} catch {
			/* clipboard unavailable */
		}
	}

	function optState(i: number): 'correct' | 'wrong' | 'chosen' | 'neutral' {
		const s = party;
		if (!s) return 'neutral';
		if (s.phase === 'reveal' && s.correctIndex != null) {
			if (i === s.correctIndex) return 'correct';
			if (i === myChoice && myChoice !== s.correctIndex) return 'wrong';
			return 'neutral';
		}
		if (s.phase === 'answering' && i === myChoice) return 'chosen';
		return 'neutral';
	}
</script>

<svelte:head><title>{m.game_trivia()} · {code} — NerdDen</title></svelte:head>

<trivia-party class="mx-auto block w-full max-w-md px-1 py-4">
	{#if errorMsg === 'not_found'}
		<div class="card-kraft kraft-radius p-6 text-center">
			<div class="font-display text-xl font-bold text-ink">404</div>
			<a href="/trivia" class="btn-primary kraft-radius-sm mt-4 inline-block px-5 py-2 text-lg no-underline">{m.trivia_new_topic()}</a>
		</div>
	{:else if !party}
		<div class="py-16 text-center text-muted">…</div>
	{:else if !party.me.joined && party.status === 'lobby'}
		<!-- join gate -->
		<div class="card-kraft kraft-radius mx-auto max-w-sm p-6 text-center">
			<img src="/mascot-trivia.png" alt="" class="mx-auto mb-2 size-16" />
			<div class="font-display text-2xl font-bold text-ink">{m.trivia_party_join_title()}</div>
			<div class="mt-1 mb-4 text-sm text-ink-soft capitalize">{party.topic}</div>
			<input bind:value={name} placeholder={m.trivia_party_your_name()} maxlength="24" onkeydown={(e) => e.key === 'Enter' && join()} class="kraft-input mb-3 w-full px-4 py-2.5 text-center text-xl outline-none" />
			<button onclick={join} disabled={!name.trim() || joining} class="btn-primary kraft-radius w-full py-2.5 text-xl disabled:opacity-50">{m.trivia_party_join()}</button>
		</div>
	{:else if !party.me.joined}
		<!-- started without you — spectate the leaderboard -->
		<div class="card-kraft kraft-radius mb-4 p-4 text-center text-sm text-ink-soft">{m.trivia_party_started()}</div>
		{@render standings(m.trivia_party_standings())}
	{:else if party.status === 'lobby'}
		<!-- lobby -->
		<div class="text-center">
			<div class="label-caps">{m.trivia_party_room_code()}</div>
			<button onclick={copyCode} class="mt-1 font-hand text-5xl font-bold tracking-widest text-terracotta">{code}</button>
			<div class="mt-1 mb-5 text-xs text-muted">{m.trivia_party_share_hint()}</div>
		</div>
		<div class="card-kraft kraft-radius mb-4 overflow-hidden">
			<div class="label-caps border-b-[1.5px] border-dashed border-dash px-4 py-2.5">{m.trivia_party_players_n({ n: party.players.length })}</div>
			{#each party.players as p, i (i)}
				<div class="flex items-center gap-3 px-4 py-2.5 {i > 0 ? 'border-t-[1.5px] border-dashed border-dash' : ''}">
					<div class="flex size-8 flex-none items-center justify-center rounded-[9px] border-[1.5px] border-ink bg-surface-2 font-hand text-base font-bold text-ink">{p.name.charAt(0).toUpperCase()}</div>
					<span class="font-semibold text-ink">{p.name}</span>
					{#if p.isMe}<span class="text-xs text-muted">· {m.trivia_party_you()}</span>{/if}
					{#if p.isHost}<span class="ml-auto text-base">👑</span>{/if}
				</div>
			{/each}
		</div>
		{#if party.me.isHost}
			<button onclick={start} class="btn-primary kraft-radius w-full py-3 text-2xl">{m.trivia_party_start()}</button>
		{:else}
			<div class="text-center text-sm text-muted">{m.trivia_party_waiting_host()}</div>
		{/if}
	{:else if party.status === 'playing' && party.question}
		<!-- playing -->
		<div class="mb-4 flex items-center justify-between">
			<span class="text-xs font-semibold text-muted">{party.currentIndex + 1}/{party.questionCount}</span>
			<div class="relative size-[52px]">
				<svg width="52" height="52" viewBox="0 0 52 52">
					<circle cx="26" cy="26" r="22" fill="none" stroke="var(--color-track)" stroke-width="5" />
					<circle cx="26" cy="26" r="22" fill="none" stroke={secondsLeft <= 5 ? 'var(--color-marker-red)' : 'var(--color-forest)'} stroke-width="5" stroke-linecap="round" stroke-dasharray={RING_LEN} stroke-dashoffset={RING_LEN * (1 - ringFrac)} transform="rotate(-90 26 26)" />
				</svg>
				<div class="absolute inset-0 flex items-center justify-center font-hand text-xl font-bold text-ink">{party.phase === 'reveal' ? '·' : secondsLeft}</div>
			</div>
		</div>

		<div class="card-kraft kraft-radius mb-4 p-5">
			<div class="label-caps mb-2.5">{m.trivia_question_n({ n: party.currentIndex + 1 })}</div>
			<div class="font-display text-[22px] font-bold leading-tight text-ink">{party.question.question}</div>
		</div>

		<div class="mb-4 flex flex-col gap-2.5">
			{#each party.question.options as opt, i (i)}
				{@const st = optState(i)}
				<button
					onclick={() => answer(i)}
					disabled={party.phase !== 'answering' || answered}
					class="kraft-radius-sm flex items-center gap-3 border-[1.5px] px-3.5 py-3 text-left
						{st === 'correct' ? 'border-forest bg-forest/15' : st === 'wrong' ? 'border-marker-red bg-marker-red/15' : st === 'chosen' ? 'border-navy bg-navy/15' : 'border-ink bg-surface'}
						{party.phase === 'answering' && !answered ? 'shadow-btn-sm' : ''}"
				>
					<span class="flex size-[30px] flex-none items-center justify-center rounded-[9px] border-[1.5px] font-hand text-lg font-bold
						{st === 'correct' ? 'border-forest bg-forest text-surface-2' : st === 'wrong' ? 'border-marker-red bg-marker-red text-surface-2' : st === 'chosen' ? 'border-navy bg-navy text-surface-2' : 'border-ink bg-paper text-ink'}">{KEYS[i]}</span>
					<span class="font-semibold text-ink">{opt}</span>
					{#if st === 'correct'}<span class="ml-auto font-hand text-xl font-bold text-forest">✓</span>{/if}
					{#if st === 'wrong'}<span class="ml-auto font-hand text-xl font-bold text-marker-red">✕</span>{/if}
				</button>
			{/each}
		</div>

		{#if answered && party.phase === 'answering'}
			<div class="mb-4 text-center text-sm text-navy">{m.trivia_party_answered()}</div>
		{/if}

		{@render standings(m.trivia_party_standings())}
	{:else if party.status === 'finished'}
		<!-- results -->
		<div class="mb-5 text-center">
			<div class="text-3xl">🏆</div>
			<div class="mx-auto my-2 flex size-24 items-center justify-center rounded-[24px] border-[1.5px] border-ink bg-surface-2 font-hand text-4xl font-bold text-terracotta">{leaderboard[0]?.name.charAt(0).toUpperCase() ?? '?'}</div>
			<div class="font-display text-2xl font-bold text-ink">{m.trivia_party_wins({ name: leaderboard[0]?.name ?? '' })}</div>
			<div class="mt-1 text-sm text-ink-soft">{m.trivia_party_correct_line({ correct: leaderboard[0]?.correctCount ?? 0, total: party.questionCount })} · {leaderboard[0]?.score ?? 0}</div>
		</div>
		{@render standings(m.trivia_party_final())}
		<div class="mt-4 flex gap-2.5">
			<button onclick={() => goto('/trivia')} class="btn-primary kraft-radius flex-1 py-2.5 text-xl">{m.trivia_party_rematch()}</button>
			<button onclick={() => goto('/trivia')} class="btn-secondary kraft-radius flex-1 py-2.5 text-xl">{m.trivia_new_topic()}</button>
		</div>
	{/if}
</trivia-party>

{#snippet standings(title: string)}
	<div class="card-kraft kraft-radius overflow-hidden">
		<div class="label-caps border-b-[1.5px] border-dashed border-dash px-4 py-2.5">{title}</div>
		{#each leaderboard as p, i (i)}
			<div class="flex items-center gap-3 px-4 py-2.5 {i > 0 ? 'border-t-[1.5px] border-dashed border-dash' : ''} {p.isMe ? 'bg-navy/10' : ''}">
				<span class="w-6 text-center font-hand text-xl font-bold {i === 0 ? 'text-terracotta' : 'text-ink'}">{i + 1}</span>
				<div class="flex size-8 flex-none items-center justify-center rounded-[9px] border-[1.5px] border-ink bg-surface-2 font-hand text-base font-bold text-ink">{p.name.charAt(0).toUpperCase()}</div>
				<span class="min-w-0 flex-1 truncate font-semibold text-ink">{p.name}{#if p.isMe}<span class="text-xs text-muted"> · {m.trivia_party_you()}</span>{/if}</span>
				{#if party && party.status !== 'lobby'}<span class="text-xs text-muted">{p.correctCount}</span>{/if}
				<span class="w-14 text-right font-hand text-xl font-bold text-ink">{p.score}</span>
			</div>
		{/each}
	</div>
{/snippet}

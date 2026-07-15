<!--
  Trivia — create quiz ("Kraft Draft") → NerdDen Trivia.dc.html (create + AI gen)
  Topic + suggestion chips, difficulty, question count, language, mode (Solo now;
  Party reserved for a later phase). "Generate quiz" posts to /api/trivia and shows
  a "The Fox writes questions…" overlay while the AI set is generated.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { m } from '$lib/paraglide/messages.js';

	let topic = $state('');
	let language = $state('en');
	let difficulty = $state('medium');
	let count = $state(10);
	let mode = $state<'solo' | 'party'>('solo');
	let playerName = $state('');
	let creating = $state(false);
	let errorMsg = $state('');

	const LANGS = ['en', 'ru', 'de'];
	const DIFFS = ['easy', 'medium', 'hard'];
	const COUNTS = [5, 10, 20];

	const suggestions = $derived([m.trivia_sugg_1(), m.trivia_sugg_2(), m.trivia_sugg_3(), m.trivia_sugg_4()]);
	const diffLabel = (v: string) =>
		v === 'easy' ? m.trivia_diff_easy() : v === 'hard' ? m.trivia_diff_hard() : m.trivia_diff_medium();

	async function generate() {
		if (!topic.trim() || creating) return;
		creating = true;
		errorMsg = '';
		try {
			if (mode === 'party') {
				const hostToken = crypto.randomUUID();
				const hostName = playerName.trim() || 'Host';
				const res = await fetch('/api/trivia/party', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ topic: topic.trim(), language, difficulty, count, hostName, hostToken })
				});
				if (!res.ok) throw new Error(`Error ${res.status}`);
				const { code } = (await res.json()) as { code: string };
				localStorage.setItem(`trivia_party_token:${code}`, hostToken);
				localStorage.setItem('trivia_party_name', hostName);
				await goto(`/trivia/party/${code}`);
			} else {
				const res = await fetch('/api/trivia', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ topic: topic.trim(), language, difficulty, count, mode })
				});
				if (!res.ok) throw new Error(`Error ${res.status}`);
				const { sessionId } = (await res.json()) as { sessionId: string };
				await goto(`/trivia/${sessionId}`);
			}
		} catch (e: unknown) {
			errorMsg = e instanceof Error ? e.message : 'Failed to generate quiz';
			creating = false;
		}
	}
</script>

<svelte:head><title>{m.game_trivia()} — NerdDen</title></svelte:head>

{#snippet chipRow(label: string, options: (string | number)[], value: string | number, set: (v: never) => void, accent: string, fmt: (v: string | number) => string)}
	<div class="flex-1">
		<div class="field-label mb-2.5">{label}</div>
		<div class="flex gap-1.5">
			{#each options as o (o)}
				<button
					onclick={() => set(o as never)}
					class="kraft-radius-sm flex-1 border-[1.5px] border-ink py-1.5 font-hand text-base font-bold {value === o ? 'text-surface-2 shadow-btn-sm' : 'bg-transparent text-ink'}"
					style={value === o ? `background:${accent}` : ''}
				>{fmt(o)}</button>
			{/each}
		</div>
	</div>
{/snippet}

<trivia-create class="mx-auto flex w-full max-w-2xl flex-col gap-6 px-1 py-4">
	<div class="flex items-center gap-3">
		<img src="/mascot-trivia.png" alt="" class="size-9" />
		<h1 class="m-0 text-3xl">{m.trivia_new_quiz()}</h1>
	</div>

	<!-- topic -->
	<div>
		<div class="field-label mb-2.5">{m.trivia_topic()}</div>
		<div class="card-kraft flex items-center gap-2.5 px-4 py-2.5" style="border-radius:13px 10px 12px 11px">
			<span class="text-lg">🔎</span>
			<input bind:value={topic} placeholder={m.trivia_topic_ph()} maxlength="80" onkeydown={(e) => e.key === 'Enter' && generate()} class="w-full bg-transparent font-hand text-2xl font-bold text-ink outline-none" />
		</div>
		<div class="mt-2.5 flex flex-wrap gap-2">
			{#each suggestions as s (s)}
				<button onclick={() => (topic = s)} class="rounded-full border-[1.5px] border-ink bg-surface px-3 py-1 font-hand text-base font-bold text-ink">{s}</button>
			{/each}
		</div>
	</div>

	<!-- difficulty / language -->
	<div class="flex gap-4">
		{@render chipRow(m.trivia_difficulty(), DIFFS, difficulty, (v) => (difficulty = v), 'var(--color-terracotta)', (v) => diffLabel(String(v)))}
		{@render chipRow(m.trivia_language(), LANGS, language, (v) => (language = v), 'var(--color-forest)', (v) => String(v).toUpperCase())}
	</div>

	<!-- questions / mode -->
	<div class="flex gap-4">
		{@render chipRow(m.trivia_questions(), COUNTS, count, (v) => (count = v), 'var(--color-navy)', (v) => String(v))}
		<div class="flex-1">
			<div class="field-label mb-2.5">{m.trivia_mode()}</div>
			<div class="flex gap-1.5">
				<button
					onclick={() => (mode = 'solo')}
					class="kraft-radius-sm flex-1 border-[1.5px] border-ink py-1.5 font-hand text-base font-bold {mode === 'solo' ? 'bg-forest text-surface-2 shadow-btn-sm' : 'bg-transparent text-ink'}"
				>{m.trivia_solo()}</button>
				<button
					onclick={() => (mode = 'party')}
					class="kraft-radius-sm flex-1 border-[1.5px] border-ink py-1.5 font-hand text-base font-bold {mode === 'party' ? 'bg-navy text-surface-2 shadow-btn-sm' : 'bg-transparent text-ink'}"
				>Party</button>
			</div>
		</div>
	</div>

	<!-- host name (party only) -->
	{#if mode === 'party'}
		<div>
			<div class="field-label mb-2.5">{m.trivia_party_host_name()}</div>
			<div class="card-kraft flex items-center gap-2.5 px-4 py-2.5" style="border-radius:12px 11px 13px 10px">
				<span class="text-lg">🙂</span>
				<input bind:value={playerName} placeholder="Alex" maxlength="24" class="w-full bg-transparent font-hand text-2xl font-bold text-ink outline-none" />
			</div>
		</div>
	{/if}

	{#if errorMsg}<p class="m-0 text-sm text-terracotta-ink">{errorMsg}</p>{/if}

	<button onclick={generate} disabled={!topic.trim()} class="btn-primary kraft-radius w-full py-3 text-2xl disabled:opacity-50">{m.trivia_generate()}</button>
</trivia-create>

<!-- generating overlay -->
{#if creating}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4">
		<div class="card-kraft kraft-radius flex w-full max-w-sm flex-col items-center gap-3 p-8 text-center shadow-float">
			<div class="relative mx-auto mb-1 size-40">
				<span class="absolute inset-0 animate-pulse rounded-full border-2 border-dashed border-muted-2"></span>
				<div class="absolute inset-[22px] flex items-center justify-center rounded-full border-[1.5px] border-ink bg-surface-2">
					<img src="/mascot-trivia.png" alt="" class="size-24 animate-bounce" />
				</div>
				<span class="absolute right-1.5 top-2 animate-pulse text-2xl">💡</span>
			</div>
			<div class="flex gap-2">
				<span class="size-2.5 animate-pulse rounded-full bg-terracotta"></span>
				<span class="size-2.5 animate-pulse rounded-full bg-terracotta" style="animation-delay:.2s"></span>
				<span class="size-2.5 animate-pulse rounded-full bg-terracotta" style="animation-delay:.4s"></span>
			</div>
			<div class="font-display text-2xl font-bold text-ink">{m.trivia_fox_writing()}</div>
			<div class="text-sm text-ink-soft">{m.trivia_gen_summary({ topic, difficulty: diffLabel(difficulty), count })}</div>
		</div>
	</div>
{/if}

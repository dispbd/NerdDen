<!--
  Crosswords library — /crossword  ("Kraft Draft")  → NerdDen Crosswords.dc.html
  Owl hero + AI "Generate with AI" bar (topic + difficulty/language + Generate),
  filters, and a grid of library puzzle cards. A Kraft "the Owl is building it"
  overlay covers the generation wait.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	let topic = $state('');
	let language = $state('en');
	let difficulty = $state('medium');
	let generating = $state(false);
	let errorMsg = $state('');

	// Client-side library filters (visual + local filtering on the loaded list).
	let filterDiff = $state<'all' | 'easy' | 'medium' | 'expert'>('all');

	const DIFFS: { id: 'easy' | 'medium' | 'expert'; label: string; hint: string }[] = [
		{ id: 'easy', label: 'Easy', hint: 'Simple, direct definitions' },
		{ id: 'medium', label: 'Medium', hint: 'Definitions + gentle wordplay' },
		{ id: 'expert', label: 'Expert', hint: 'Cryptic clue conventions' }
	];
	const LANGS = [
		{ id: 'en', label: 'EN' },
		{ id: 'ru', label: 'RU' },
		{ id: 'de', label: 'DE' },
		{ id: 'es', label: 'ES' }
	];
	const SUGGESTIONS = ['Space', 'World capitals', '90s music', 'Biology', 'Greek mythology'];

	const filtered = $derived(
		filterDiff === 'all'
			? data.recentCrosswords
			: data.recentCrosswords.filter((c) => c.difficulty === filterDiff)
	);

	const DIFF_ACCENT: Record<string, string> = {
		beginner: 'var(--color-forest)',
		easy: 'var(--color-forest)',
		medium: 'var(--color-terracotta)',
		hard: 'var(--color-terracotta)',
		expert: 'var(--color-terracotta-ink)',
		extreme: 'var(--color-navy)'
	};

	onMount(() => {
		const t = page.url.searchParams.get('topic');
		if (t) topic = t;
	});

	async function generate() {
		if (!topic.trim()) return;
		generating = true;
		errorMsg = '';
		try {
			const res = await fetch('/api/crossword', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ topic: topic.trim(), language, difficulty })
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error((err as { message?: string }).message ?? `Error ${res.status}`);
			}
			const crossword = await res.json();
			await goto(`/crossword/${crossword.id}`);
		} catch (e: unknown) {
			errorMsg = e instanceof Error ? e.message : 'Generation failed';
			generating = false;
		}
	}
</script>

<svelte:head><title>Crosswords — NerdDen</title></svelte:head>

<crossword-library class="mx-auto flex w-full max-w-6xl flex-col gap-6 px-1 py-2">
	<!-- hero + quick generate -->
	<div class="flex flex-col gap-5 lg:flex-row lg:items-stretch">
		<div class="flex flex-1 items-center gap-4">
			<div class="flex size-[78px] flex-none items-center justify-center rounded-[18px] border-[1.5px] border-ink bg-surface-2 shadow-card">
				<img src="/mascot-owl.png" alt="" class="size-16" />
			</div>
			<div>
				<h1 class="m-0 text-4xl">Crosswords</h1>
				<p class="m-0 mt-1 max-w-sm text-[15px] text-ink-soft">Pick a ready puzzle below — or let the Owl spin up a fresh one on any topic.</p>
			</div>
		</div>

		<!-- AI generate bar -->
		<div class="flex items-center gap-3.5 rounded-[16px] bg-ink p-4 lg:w-[560px] lg:flex-none">
			<div class="flex-1">
				<div class="mb-2 text-[11px] font-semibold tracking-[.12em] text-[#b3a890] uppercase">Generate with AI</div>
				<div class="flex items-center gap-2.5">
					<div class="flex flex-1 items-center gap-2 rounded-[11px] border-[1.5px] border-[#1c1813] bg-surface-2 px-3 py-2">
						<span>🔎</span>
						<input bind:value={topic} placeholder="Greek mythology" onkeydown={(e) => e.key === 'Enter' && generate()} class="w-full bg-transparent font-hand text-lg font-bold text-ink outline-none" />
					</div>
					<button onclick={generate} disabled={!topic.trim()} class="btn-primary kraft-radius-sm px-5 py-2 text-lg disabled:opacity-50" style="box-shadow:2px 3px 0 rgba(0,0,0,.5)">Generate</button>
				</div>
				<div class="mt-2.5 flex flex-wrap items-center gap-2">
					<span class="text-[11px] font-medium text-[#9b917f]">Try:</span>
					{#each SUGGESTIONS.slice(0, 3) as s (s)}
						<button onclick={() => (topic = s)} class="text-[11px] font-semibold text-[#d9c7a6] underline underline-offset-2">{s}</button>
					{/each}
				</div>
			</div>
			<div class="hidden size-16 flex-none items-center justify-center rounded-full border-[1.5px] border-[#1c1813] bg-surface-2 sm:flex">
				<img src="/mascot-owl.png" alt="" class="size-[50px]" />
			</div>
		</div>
	</div>

	<!-- full create controls (difficulty · clue style + language) -->
	<div class="flex flex-wrap items-center gap-x-6 gap-y-3">
		<div class="flex items-center gap-2">
			<span class="field-label">Difficulty · clue style</span>
			{#each DIFFS as d (d.id)}
				<button
					onclick={() => (difficulty = d.id)}
					title={d.hint}
					class="kraft-radius-sm border-[1.5px] border-ink px-3.5 py-1 font-hand text-lg font-bold {difficulty === d.id ? 'bg-terracotta text-surface-2 shadow-btn-sm' : 'bg-transparent text-ink'}"
				>{d.label}</button>
			{/each}
		</div>
		<div class="h-6 w-px bg-[#cdbfa6]"></div>
		<div class="flex items-center gap-1.5">
			<span class="field-label">Lang</span>
			{#each LANGS as l (l.id)}
				<button
					onclick={() => (language = l.id)}
					class="rounded-full border-[1.5px] px-2.5 py-1 text-xs font-semibold {language === l.id ? 'border-ink bg-surface text-ink' : 'border-[#cdbfa6] text-muted'}"
				>{l.label}</button>
			{/each}
		</div>
	</div>

	{#if errorMsg}<p class="m-0 text-sm text-terracotta-ink">{errorMsg}</p>{/if}

	<!-- library filter + grid -->
	{#if data.recentCrosswords.length > 0}
		<div class="flex items-center gap-2">
			<span class="field-label">Filter</span>
			{#each ['all', 'easy', 'medium', 'expert'] as f (f)}
				<button
					onclick={() => (filterDiff = f as typeof filterDiff)}
					class="kraft-radius-sm border-[1.5px] border-ink px-3 py-1 font-hand text-base font-bold capitalize {filterDiff === f ? 'bg-navy text-surface-2 shadow-btn-sm' : 'bg-transparent text-ink'}"
				>{f}</button>
			{/each}
		</div>

		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{#each filtered as cw (cw.id)}
				<a href="/crossword/{cw.id}" class="card-kraft kraft-radius flex flex-col gap-2 p-4 no-underline transition-transform hover:-translate-y-0.5">
					<div class="mx-auto mb-1 grid grid-cols-6 gap-px overflow-hidden rounded-[6px] border-[1.5px] border-ink bg-ink" style="width:78px">
						{#each Array(36) as _, i (i)}
							<span class="size-3" style="background:{(i * 7 + (i % 5)) % 3 === 0 ? '#322c24' : '#fbf8f1'}"></span>
						{/each}
					</div>
					<div class="flex items-center gap-1.5">
						<span class="font-display text-base leading-tight font-bold text-ink">{cw.title}</span>
						{#if cw.aiGenerated}<span class="rounded-full border border-[rgba(62,92,118,.35)] bg-[rgba(62,92,118,.13)] px-1.5 py-0.5 text-[9px] font-bold text-navy">AI</span>{/if}
					</div>
					<div class="text-xs font-medium text-muted">{cw.width}×{cw.height} · {cw.language.toUpperCase()}</div>
					<div class="mt-auto flex items-center justify-between pt-1">
						<span class="rounded-full px-2 py-0.5 text-[11px] font-semibold text-surface-2 capitalize" style="background:{DIFF_ACCENT[cw.difficulty] ?? 'var(--color-terracotta)'}">{cw.difficulty}</span>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</crossword-library>

<!-- generating overlay (the Owl builds it) -->
{#if generating}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4">
		<div class="card-kraft kraft-radius flex w-full max-w-sm flex-col items-center gap-4 p-8 text-center shadow-float">
			<div class="relative size-40">
				<span class="absolute inset-0 animate-pulse rounded-full border-2 border-dashed border-[#c2b69c]"></span>
				<div class="absolute inset-6 flex items-center justify-center rounded-full border-[1.5px] border-ink bg-surface-2"><img src="/mascot-owl.png" alt="" class="size-20 animate-bounce" /></div>
			</div>
			<div class="font-display text-2xl font-bold text-ink">The Owl is thinking…</div>
			<div class="text-sm text-ink-soft">Topic: <b class="text-ink">{topic}</b> · {difficulty} · {language.toUpperCase()}</div>
			<div class="flex flex-col gap-2 self-stretch text-left text-[13px]">
				<div class="flex items-center gap-2.5"><span class="flex size-6 flex-none items-center justify-center rounded-[8px] bg-forest text-xs font-bold text-surface-2">✓</span> Word list ready</div>
				<div class="flex items-center gap-2.5"><span class="flex size-6 flex-none items-center justify-center rounded-[8px] bg-mustard text-xs font-bold text-ink">…</span> Weaving the grid</div>
				<div class="flex items-center gap-2.5 opacity-45"><span class="flex size-6 flex-none items-center justify-center rounded-[8px] border-[1.5px] border-[#cdbfa6] bg-track text-xs font-bold text-muted">3</span> Numbering &amp; saving</div>
			</div>
		</div>
	</div>
{/if}

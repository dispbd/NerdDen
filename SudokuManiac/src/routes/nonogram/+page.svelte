<!--
  Nonograms library — /nonogram  ("Kraft Draft")  → NerdDen Nonograms.dc.html
  Cat hero + dark "Paint one with AI" panel, size/difficulty filters, and the
  catalogue of pixel-grid cards. "The Cat paints a grid…" covers the generation wait.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime';
	import Chip from '$lib/components/shared/Chip.svelte';
	import NonogramThumb from '$lib/components/nonogram/NonogramThumb.svelte';
	import {
		NONOGRAM_DIFFICULTIES,
		NONOGRAM_SIZES,
		type NonogramDifficulty,
		type NonogramLibraryItem,
		type NonogramSize
	} from '$lib/games/nonogram/types';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	// What to paint next
	let topic = $state('');
	let size = $state<NonogramSize>(10);
	let difficulty = $state<NonogramDifficulty>('medium');

	// Catalogue filters
	let filterSize = $state<NonogramSize | 'all'>('all');
	let filterDiff = $state<NonogramDifficulty | 'all'>('all');

	let generating = $state(false);
	/** Generation steps done: 0 while the picture is being made, 3 once it is checked */
	let stepsDone = $state(0);
	let errorMsg = $state('');

	const SUGGESTIONS = $derived([m.nono_sugg_1(), m.nono_sugg_2(), m.nono_sugg_3()]);

	const filtered = $derived(
		data.items.filter(
			(p) =>
				(filterSize === 'all' || p.size === filterSize) &&
				(filterDiff === 'all' || p.difficulty === filterDiff)
		)
	);

	onMount(() => {
		const t = page.url.searchParams.get('topic');
		if (t) topic = t;
	});

	function diffLabel(d: NonogramDifficulty): string {
		return d === 'easy'
			? m.difficulty_easy()
			: d === 'hard'
				? m.difficulty_hard()
				: m.difficulty_medium();
	}

	const sizeLabel = (n: number) => `${n}×${n}`;

	/** Thumbnails stay roughly the same size whatever the grid. */
	const thumbCell = (n: number) => (n <= 5 ? 14 : n <= 10 ? 8 : 6);

	function status(p: NonogramLibraryItem): { text: string; color: string } {
		switch (p.status) {
			case 'completed':
				return { text: m.nono_status_done(), color: 'var(--color-forest)' };
			case 'in_progress':
				return { text: `${p.progress}%`, color: 'var(--color-terracotta)' };
			case 'failed':
				return { text: m.nono_status_failed(), color: 'var(--color-terracotta-ink)' };
			default:
				return { text: m.nono_status_new(), color: 'var(--color-muted)' };
		}
	}

	async function paint() {
		if (generating) return;
		generating = true;
		stepsDone = 0;
		errorMsg = '';
		try {
			const res = await fetch('/api/nonogram', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ topic: topic.trim(), size, difficulty, language: getLocale() })
			});
			if (!res.ok) throw new Error(String(res.status));
			const out = (await res.json()) as { id: string; aiFallback: string | null };
			// The server does all three steps in one call; tick the last two off
			// before leaving so the checklist doesn't just vanish.
			stepsDone = 1;
			await new Promise((r) => setTimeout(r, 250));
			stepsDone = 3;
			await new Promise((r) => setTimeout(r, 350));
			const query = out.aiFallback ? `?fallback=${out.aiFallback}` : '';
			// The path is resolved; only the fallback notice rides along as a query.
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			await goto(`${resolve('/nonogram/[id]', { id: out.id })}${query}`);
		} catch {
			errorMsg = m.nono_gen_failed();
			generating = false;
		}
	}

	const STEPS = $derived([m.nono_step_picture(), m.nono_step_clues(), m.nono_step_unique()]);
</script>

<svelte:head><title>{m.game_nonograms()} — NerdDen</title></svelte:head>

<nonogram-library class="mx-auto flex w-full max-w-6xl flex-col gap-6 px-1 py-2">
	<!-- hero + AI paint panel -->
	<div class="flex flex-col gap-5 lg:flex-row lg:items-stretch">
		<div class="flex flex-1 items-center gap-4">
			<div
				class="flex size-[78px] flex-none items-center justify-center rounded-[18px] border-[1.5px] border-ink bg-surface-2 shadow-card"
			>
				<img src="/mascot-nono.png" alt="" class="size-16" />
			</div>
			<div>
				<h1 class="m-0 text-4xl">{m.game_nonograms()}</h1>
				<p class="m-0 mt-1 max-w-sm text-[15px] leading-snug text-ink-soft">{m.nono_subtitle()}</p>
			</div>
		</div>

		<div
			class="flex items-center gap-3.5 bg-ink p-[18px] lg:w-[560px] lg:flex-none"
			style="border-radius:16px 13px 15px 12px"
		>
			<div class="min-w-0 flex-1">
				<div class="mb-2 text-[11px] font-semibold tracking-[.12em] text-[#b3a890] uppercase">
					{m.nono_paint_ai()}
				</div>
				<div class="flex items-center gap-2.5">
					<label
						class="flex min-w-0 flex-1 items-center gap-2 border-[1.5px] border-[#1c1813] bg-surface-2 px-3 py-2"
						style="border-radius:11px 13px 10px 12px"
					>
						<span aria-hidden="true">🔎</span>
						<input
							bind:value={topic}
							maxlength="80"
							placeholder={m.nono_topic_ph()}
							aria-label={m.nono_paint_ai()}
							onkeydown={(e) => e.key === 'Enter' && paint()}
							class="w-full min-w-0 border-0 bg-transparent p-0 font-hand text-xl font-bold text-ink outline-none focus:ring-0"
						/>
					</label>
					<button
						onclick={paint}
						disabled={generating}
						class="btn-primary kraft-radius-sm px-5 py-2 text-xl"
						style="box-shadow:2px 3px 0 rgba(0,0,0,.5)">{m.nono_paint()}</button
					>
				</div>
				<div class="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
					<span class="text-[11px] font-medium text-[#9b917f]">{m.nono_try()}</span>
					{#each SUGGESTIONS as s (s)}
						<button
							onclick={() => (topic = s)}
							class="text-[11px] font-semibold text-[#d9c7a6] underline underline-offset-2"
							>{s}</button
						>
					{/each}
				</div>
				<!-- size + difficulty of the next painting -->
				<div class="mt-3 flex flex-wrap items-center gap-1.5">
					{#each NONOGRAM_SIZES as s (s)}
						<button
							onclick={() => (size = s)}
							aria-pressed={size === s}
							class="rounded-full border-[1.5px] px-2.5 py-0.5 text-xs font-semibold {size === s
								? 'border-surface-2 bg-surface-2 text-ink'
								: 'border-[#6b6151] text-[#b3a890]'}">{sizeLabel(s)}</button
						>
					{/each}
					<span class="mx-1 h-4 w-px bg-[#6b6151]"></span>
					{#each NONOGRAM_DIFFICULTIES as d (d)}
						<button
							onclick={() => (difficulty = d)}
							aria-pressed={difficulty === d}
							class="rounded-full border-[1.5px] px-2.5 py-0.5 text-xs font-semibold {difficulty ===
							d
								? 'border-surface-2 bg-surface-2 text-ink'
								: 'border-[#6b6151] text-[#b3a890]'}">{diffLabel(d)}</button
						>
					{/each}
				</div>
				<div class="mt-2 text-[11px] text-[#9b917f]">{m.nono_empty_topic_hint()}</div>
			</div>
			<div
				class="hidden size-[60px] flex-none items-center justify-center rounded-full border-[1.5px] border-[#1c1813] bg-surface-2 sm:flex"
			>
				<img src="/mascot-nono.png" alt="" class="size-12" />
			</div>
		</div>
	</div>

	{#if errorMsg}<p class="m-0 text-sm text-terracotta-ink" role="alert">{errorMsg}</p>{/if}

	<!-- filters -->
	<div class="flex flex-wrap items-center gap-x-3 gap-y-2.5">
		<span class="field-label">{m.nono_size()}</span>
		<Chip
			active={filterSize === 'all'}
			accent="var(--color-forest)"
			class="kraft-radius-sm px-3 py-0.5 text-[17px]"
			onclick={() => (filterSize = 'all')}>{m.nono_filter_all()}</Chip
		>
		{#each NONOGRAM_SIZES as s (s)}
			<Chip
				active={filterSize === s}
				accent="var(--color-forest)"
				class="kraft-radius-sm px-3 py-0.5 text-[17px]"
				onclick={() => (filterSize = s)}>{sizeLabel(s)}</Chip
			>
		{/each}
		<span class="h-6 w-px bg-[#cdbfa6]"></span>
		<span class="field-label">{m.nono_difficulty()}</span>
		<Chip
			active={filterDiff === 'all'}
			class="kraft-radius-sm px-3 py-0.5 text-[17px]"
			onclick={() => (filterDiff = 'all')}>{m.nono_filter_all()}</Chip
		>
		{#each NONOGRAM_DIFFICULTIES as d (d)}
			<Chip
				active={filterDiff === d}
				class="kraft-radius-sm px-3 py-0.5 text-[17px]"
				onclick={() => (filterDiff = d)}>{diffLabel(d)}</Chip
			>
		{/each}
	</div>

	<!-- catalogue -->
	{#if !data.items.length}
		<p class="m-0 text-ink-soft">{m.nono_library_empty()}</p>
	{:else if !filtered.length}
		<p class="m-0 text-ink-soft">{m.nono_filter_empty()}</p>
	{:else}
		<div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
			{#each filtered as p (p.id)}
				{@const st = status(p)}
				<a
					href={resolve('/nonogram/[id]', { id: p.id })}
					class="card-kraft flex flex-col p-4 no-underline transition-transform hover:-translate-y-0.5"
					style="border-radius:16px 13px 15px 12px"
				>
					<div class="mx-auto mb-[13px] flex h-[112px] items-center">
						<NonogramThumb
							size={p.size}
							solution={p.solution}
							color={p.color}
							cell={thumbCell(p.size)}
						/>
					</div>
					<div class="flex min-w-0 items-center gap-1.5">
						<span class="truncate font-display text-base leading-tight font-bold text-ink"
							>{p.title}</span
						>
						{#if p.source === 'ai'}
							<span
								class="flex-none rounded-full border border-[rgba(62,92,118,.35)] bg-[rgba(62,92,118,.13)] px-[7px] py-[3px] text-[9px] leading-none font-bold text-navy"
								>AI</span
							>
						{/if}
					</div>
					<div class="mt-auto flex items-center justify-between gap-2 pt-1.5">
						<span class="truncate text-xs font-medium text-muted"
							>{sizeLabel(p.size)} · {diffLabel(p.difficulty)}</span
						>
						<span class="flex-none font-hand text-[17px] font-bold" style:color={st.color}
							>{st.text}</span
						>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</nonogram-library>

<!-- generating: the Cat paints a grid -->
{#if generating}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4" role="status">
		<div
			class="card-kraft flex w-full max-w-sm flex-col items-center gap-4 p-8 text-center shadow-float"
			style="border-radius:22px 18px 20px 16px"
		>
			<div class="font-display text-lg font-bold text-ink">{m.nono_painting_title()}</div>
			<div class="relative size-40">
				<span class="nd-pulse absolute inset-0 rounded-full border-2 border-dashed border-[#c2b69c]"
				></span>
				<div
					class="absolute inset-[22px] flex items-center justify-center rounded-full border-[1.5px] border-ink bg-surface-2"
				>
					<img src="/mascot-nono.png" alt="" class="nd-bob size-[100px]" />
				</div>
			</div>
			<div class="flex gap-1.5" aria-hidden="true">
				{#each [0, 0.2, 0.4] as delay (delay)}
					<span
						class="nd-dot size-[9px] rounded-full bg-terracotta"
						style:animation-delay="{delay}s"
					></span>
				{/each}
			</div>
			<div class="font-display text-[23px] font-bold text-ink">
				{topic.trim() ? m.nono_painting_headline() : m.nono_picking_headline()}
			</div>
			<div class="text-sm text-ink-soft">
				{topic.trim() || m.nono_from_collection()} · {diffLabel(difficulty)} · {sizeLabel(size)}
			</div>
			<div class="flex max-w-[260px] flex-col gap-2.5 self-center text-left text-[13px]">
				{#each STEPS as label, i (label)}
					{@const state = i < stepsDone ? 'done' : i === stepsDone ? 'active' : 'pending'}
					<div class="flex items-center gap-2.5" class:opacity-45={state === 'pending'}>
						{#if state === 'done'}
							<span
								class="flex size-6 flex-none items-center justify-center rounded-[8px] bg-forest text-xs font-bold text-surface-2"
								>✓</span
							>
						{:else if state === 'active'}
							<span
								class="nd-pulse flex size-6 flex-none items-center justify-center rounded-[8px] bg-mustard text-xs font-bold text-ink"
								>…</span
							>
						{:else}
							<span
								class="flex size-6 flex-none items-center justify-center rounded-[8px] border-[1.5px] border-[#cdbfa6] bg-track text-xs font-bold text-muted"
								>{i + 1}</span
							>
						{/if}
						<span class={state === 'active' ? 'font-semibold' : 'font-medium'}>{label}</span>
					</div>
				{/each}
			</div>
		</div>
	</div>
{/if}

<style>
	/* The three keyframes from the mockup: Cat bob, ring pulse, staggered dots. */
	.nd-bob {
		animation: nd-bob 1.8s ease-in-out infinite;
	}
	.nd-pulse {
		animation: nd-pulse 1.6s ease-in-out infinite;
	}
	.nd-dot {
		animation: nd-dot 1.4s ease-in-out infinite;
	}
	@keyframes nd-bob {
		0%,
		100% {
			transform: translateY(0) rotate(-2deg);
		}
		50% {
			transform: translateY(-7px) rotate(2deg);
		}
	}
	@keyframes nd-pulse {
		0%,
		100% {
			opacity: 0.5;
		}
		50% {
			opacity: 1;
		}
	}
	@keyframes nd-dot {
		0%,
		100% {
			opacity: 0.25;
			transform: translateY(0);
		}
		50% {
			opacity: 1;
			transform: translateY(-4px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.nd-bob,
		.nd-pulse,
		.nd-dot {
			animation: none;
		}
	}
</style>

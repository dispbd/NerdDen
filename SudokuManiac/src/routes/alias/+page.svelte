<!--
  Alias — create room  ("Kraft Draft")  → NerdDen Alias.dc.html (create + AI words)
  Topic + suggestions, language, difficulty, turn timer, words-in-hat, then
  "Create & fill the hat" with a Hatter "filling the hat" overlay while the AI
  word set is generated.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	let topic = $state('');
	let language = $state('en');
	let difficulty = $state('medium');
	let turnDuration = $state(60);
	let wordCount = $state(40);
	let creating = $state(false);
	let errorMsg = $state('');

	const SUGGESTIONS = ['Movies & TV', 'Animals', 'Sports', 'Food'];
	const LANGS = ['en', 'ru', 'de', 'es'];
	const DIFFS = ['easy', 'medium', 'hard'];
	const TIMERS = [30, 60, 90];
	const WORDS = [20, 40, 60];

	async function createRoom() {
		if (!topic.trim() || creating) return;
		creating = true;
		errorMsg = '';
		try {
			const res = await fetch('/api/alias', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ topic: topic.trim(), language, difficulty, turnDuration, wordCount })
			});
			if (!res.ok) throw new Error(`Error ${res.status}`);
			const room = await res.json();
			await goto(`/alias/${room.id}`);
		} catch (e: unknown) {
			errorMsg = e instanceof Error ? e.message : 'Failed to create room';
			creating = false;
		}
	}

	function totalPlayers(room: { teams: { members: unknown[] }[] }) {
		return room.teams.reduce((s, t) => s + t.members.length, 0);
	}
</script>

<svelte:head><title>Alias — NerdDen</title></svelte:head>

{#snippet chipCol(label: string, options: (string | number)[], value: string | number, set: (v: never) => void, accent: string, fmt: (v: string | number) => string)}
	<div class="flex-1">
		<div class="field-label mb-2.5">{label}</div>
		<div class="flex flex-col gap-1.5">
			{#each options as o (o)}
				<button
					onclick={() => set(o as never)}
					class="kraft-radius-sm border-[1.5px] border-ink py-1.5 font-hand text-base font-bold {value === o ? 'text-surface-2 shadow-btn-sm' : 'bg-transparent text-ink'}"
					style={value === o ? `background:${accent}` : ''}
				>{fmt ? fmt(o) : o}</button>
			{/each}
		</div>
	</div>
{/snippet}

<alias-create class="mx-auto flex w-full max-w-2xl flex-col gap-6 px-1 py-4">
	<div class="flex items-center gap-3">
		<img src="/mascot-alias.png" alt="" class="size-9" />
		<h1 class="m-0 text-3xl">New Alias room</h1>
	</div>

	<!-- topic -->
	<div>
		<div class="field-label mb-2.5">Topic for the words</div>
		<div class="card-kraft flex items-center gap-2.5 px-4 py-2.5" style="border-radius:13px 10px 12px 11px">
			<span class="text-lg">🎩</span>
			<input bind:value={topic} placeholder="Movies & TV" maxlength="80" onkeydown={(e) => e.key === 'Enter' && createRoom()} class="w-full bg-transparent font-hand text-2xl font-bold text-ink outline-none" />
		</div>
		<div class="mt-2.5 flex flex-wrap gap-2">
			{#each SUGGESTIONS as s (s)}
				<button onclick={() => (topic = s)} class="rounded-full border-[1.5px] border-ink bg-surface px-3 py-1 font-hand text-base font-bold text-ink">{s}</button>
			{/each}
		</div>
	</div>

	<!-- language -->
	<div>
		<div class="field-label mb-2.5">Language</div>
		<div class="flex gap-2">
			{#each LANGS as l (l)}
				<button onclick={() => (language = l)} class="kraft-radius-sm border-[1.5px] border-ink px-4 py-1.5 font-hand text-lg font-bold {language === l ? 'bg-forest text-surface-2 shadow-btn-sm' : 'bg-transparent text-ink'}">{l.toUpperCase()}</button>
			{/each}
		</div>
	</div>

	<!-- difficulty / timer / words -->
	<div class="flex gap-4">
		{@render chipCol('Difficulty', DIFFS, difficulty, (v) => (difficulty = v), 'var(--color-terracotta)', (v) => String(v).charAt(0).toUpperCase() + String(v).slice(1))}
		{@render chipCol('Turn timer', TIMERS, turnDuration, (v) => (turnDuration = v), 'var(--color-navy)', (v) => `${v}s`)}
		{@render chipCol('Words', WORDS, wordCount, (v) => (wordCount = v), 'var(--color-mustard)', (v) => String(v))}
	</div>

	{#if errorMsg}<p class="m-0 text-sm text-terracotta-ink">{errorMsg}</p>{/if}

	<button onclick={createRoom} disabled={!topic.trim()} class="btn-primary kraft-radius w-full py-3 text-2xl disabled:opacity-50">Create &amp; fill the hat</button>

	<!-- open rooms -->
	{#if data.openRooms.length > 0}
		<div class="mt-2">
			<div class="field-label mb-3">Open rooms</div>
			<div class="flex flex-col gap-3">
				{#each data.openRooms as room (room.id)}
					<a href="/alias/{room.id}" class="card-kraft kraft-radius-sm flex items-center justify-between px-4 py-3 no-underline">
						<div>
							<p class="m-0 font-semibold text-ink">{room.topic}</p>
							<p class="m-0 text-sm text-muted capitalize">{room.difficulty} · {room.language} · {room.turnDuration}s</p>
						</div>
						<div class="text-right">
							<p class="m-0 font-hand text-lg font-bold text-navy">{room.code}</p>
							<p class="m-0 text-xs text-muted">{totalPlayers(room)} players</p>
						</div>
					</a>
				{/each}
			</div>
		</div>
	{/if}
</alias-create>

<!-- filling the hat overlay -->
{#if creating}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4">
		<div class="card-kraft kraft-radius flex w-full max-w-sm flex-col items-center gap-4 p-8 text-center shadow-float">
			<div class="relative flex h-32 w-48 items-end justify-center">
				<img src="/mascot-alias.png" alt="" class="absolute bottom-0 left-2 size-24 animate-bounce" />
				<div class="absolute right-4 bottom-0 h-16 w-24">
					<div class="absolute bottom-0 left-0 h-4 w-24 rounded-full bg-ink"></div>
					<div class="absolute bottom-2 left-4 h-14 w-16 rounded-t-[10px] bg-ink"></div>
					<div class="absolute bottom-7 left-4 h-3 w-16 bg-terracotta"></div>
				</div>
			</div>
			<div class="font-display text-2xl font-bold text-ink">The Hatter picks words</div>
			<div class="text-sm text-ink-soft">{topic} · <span class="capitalize">{difficulty}</span> · {language.toUpperCase()} · {wordCount} words</div>
			<div class="flex gap-2">
				<span class="size-2.5 animate-pulse rounded-full bg-terracotta"></span>
				<span class="size-2.5 animate-pulse rounded-full bg-terracotta" style="animation-delay:.2s"></span>
				<span class="size-2.5 animate-pulse rounded-full bg-terracotta" style="animation-delay:.4s"></span>
			</div>
		</div>
	</div>
{/if}

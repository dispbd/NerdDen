<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	let topic = $state('');
	let language = $state('en');
	let difficulty = $state('medium');
	let generating = $state(false);
	let errorMsg = $state('');

	const DIFFICULTIES = ['beginner', 'easy', 'medium', 'hard', 'expert', 'extreme'];
	const LANGUAGES = [
		{ value: 'en', label: 'English' },
		{ value: 'de', label: 'German' },
		{ value: 'es', label: 'Spanish' },
		{ value: 'ru', label: 'Russian (Latin)' }
	];

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
		} finally {
			generating = false;
		}
	}
</script>

<svelte:head>
	<title>Crosswords — NerdDen</title>
</svelte:head>

<main class="max-w-3xl mx-auto px-4 py-8">
	<h1 class="text-3xl font-bold mb-2">Crosswords</h1>
	<p class="text-gray-500 mb-8">Generate a crossword on any topic with AI, then solve it.</p>

	<!-- Generator card -->
	<crossword-generator class="block bg-white rounded-2xl shadow p-6 mb-10">
		<h2 class="text-xl font-semibold mb-4">Generate a new crossword</h2>

		<form
			class="flex flex-col gap-4"
			onsubmit={(e) => { e.preventDefault(); generate(); }}
		>
			<label class="flex flex-col gap-1">
				<span class="text-sm font-medium text-gray-600">Topic</span>
				<input
					type="text"
					bind:value={topic}
					placeholder="e.g. Space exploration, Jazz music, Medieval history…"
					maxlength="80"
					class="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
				/>
			</label>

			<field-row class="grid grid-cols-2 gap-4">
				<label class="flex flex-col gap-1">
					<span class="text-sm font-medium text-gray-600">Language</span>
					<select
						bind:value={language}
						class="border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
					>
						{#each LANGUAGES as lang (lang.value)}
							<option value={lang.value}>{lang.label}</option>
						{/each}
					</select>
				</label>

				<label class="flex flex-col gap-1">
					<span class="text-sm font-medium text-gray-600">Difficulty</span>
					<select
						bind:value={difficulty}
						class="border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
					>
						{#each DIFFICULTIES as d (d)}
							<option value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
						{/each}
					</select>
				</label>
			</field-row>

			{#if errorMsg}
				<p class="text-red-600 text-sm">{errorMsg}</p>
			{/if}

			<button
				type="submit"
				disabled={generating || !topic.trim()}
				class="self-start bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
			>
				{generating ? 'Generating…' : 'Generate & Play'}
			</button>
		</form>
	</crossword-generator>

	<!-- Recent crosswords -->
	{#if data.recentCrosswords.length > 0}
		<section>
			<h2 class="text-xl font-semibold mb-4">Recent puzzles</h2>
			<crossword-grid class="grid grid-cols-2 sm:grid-cols-3 gap-4">
				{#each data.recentCrosswords as cw (cw.id)}
					<a
						href="/crossword/{cw.id}"
						class="block bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
					>
						<p class="font-semibold truncate">{cw.title}</p>
						<p class="text-sm text-gray-500 capitalize">{cw.difficulty} · {cw.language}</p>
						<p class="text-xs text-gray-400 mt-1">{cw.width}×{cw.height}</p>
					</a>
				{/each}
			</crossword-grid>
		</section>
	{/if}
</main>

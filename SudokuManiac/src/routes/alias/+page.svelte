<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	let topic = $state('');
	let language = $state('en');
	let difficulty = $state('medium');
	let turnDuration = $state(60);
	let wordCount = $state(30);
	let creating = $state(false);
	let errorMsg = $state('');

	const DIFFICULTIES = ['beginner', 'easy', 'medium', 'hard', 'expert', 'extreme'];
	const LANGUAGES = [
		{ value: 'en', label: 'English' },
		{ value: 'ru', label: 'Russian' },
		{ value: 'de', label: 'German' },
		{ value: 'es', label: 'Spanish' }
	];

	async function createRoom() {
		if (!topic.trim()) return;
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
		} finally {
			creating = false;
		}
	}

	function totalPlayers(room: { teams: { members: unknown[] }[] }) {
		return room.teams.reduce((s, t) => s + t.members.length, 0);
	}
</script>

<svelte:head>
	<title>Hat / Alias — NerdDen</title>
</svelte:head>

<main class="max-w-3xl mx-auto px-4 py-8">
	<h1 class="text-3xl font-bold mb-1">Hat / Alias</h1>
	<p class="text-gray-500 mb-8">
		A party word-guessing game. One player describes — the team guesses. Race against the clock!
	</p>

	<!-- Create room -->
	<alias-creator class="block bg-white rounded-2xl shadow p-6 mb-10">
		<h2 class="text-xl font-semibold mb-4">Create a room</h2>
		<form
			class="flex flex-col gap-4"
			onsubmit={(e) => { e.preventDefault(); createRoom(); }}
		>
			<label class="flex flex-col gap-1">
				<span class="text-sm font-medium text-gray-600">Word topic</span>
				<input
					type="text"
					bind:value={topic}
					placeholder="e.g. Movies, Space, Animals, History…"
					maxlength="80"
					class="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400"
				/>
			</label>

			<settings-row class="grid grid-cols-2 gap-4">
				<label class="flex flex-col gap-1">
					<span class="text-sm font-medium text-gray-600">Language</span>
					<select bind:value={language} class="border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
						{#each LANGUAGES as lang (lang.value)}
							<option value={lang.value}>{lang.label}</option>
						{/each}
					</select>
				</label>
				<label class="flex flex-col gap-1">
					<span class="text-sm font-medium text-gray-600">Difficulty</span>
					<select bind:value={difficulty} class="border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
						{#each DIFFICULTIES as d (d)}
							<option value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
						{/each}
					</select>
				</label>
				<label class="flex flex-col gap-1">
					<span class="text-sm font-medium text-gray-600">Turn duration (seconds)</span>
					<input type="number" bind:value={turnDuration} min="20" max="180" class="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
				</label>
				<label class="flex flex-col gap-1">
					<span class="text-sm font-medium text-gray-600">Words in hat</span>
					<input type="number" bind:value={wordCount} min="10" max="100" class="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
				</label>
			</settings-row>

			{#if errorMsg}
				<p class="text-red-600 text-sm">{errorMsg}</p>
			{/if}

			<button
				type="submit"
				disabled={creating || !topic.trim()}
				class="self-start bg-indigo-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
			>
				{creating ? 'Creating…' : 'Create Room'}
			</button>
		</form>
	</alias-creator>

	<!-- Open rooms -->
	{#if data.openRooms.length > 0}
		<section>
			<h2 class="text-xl font-semibold mb-4">Open rooms</h2>
			<rooms-list class="flex flex-col gap-3">
				{#each data.openRooms as room (room.id)}
					<a
						href="/alias/{room.id}"
						class="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 hover:shadow-md transition-shadow"
					>
						<room-info>
							<p class="font-semibold">{room.topic}</p>
							<p class="text-sm text-gray-500 capitalize">{room.difficulty} · {room.language} · {room.turnDuration}s turns</p>
						</room-info>
						<room-meta class="text-right">
							<p class="text-xs font-mono bg-gray-100 px-2 py-1 rounded">{room.code}</p>
							<p class="text-xs text-gray-400 mt-1">{totalPlayers(room)} players</p>
						</room-meta>
					</a>
				{/each}
			</rooms-list>
		</section>
	{/if}
</main>

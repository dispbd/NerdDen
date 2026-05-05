<!--
  Leaderboard — /leaderboard
  Two tabs: by XP (rating) and by speed (best time).
-->
<script lang="ts">
	let { data } = $props();

	type Tab = 'xp' | 'speed';
	let tab = $state<Tab>('xp');

	function formatTime(seconds: number | null): string {
		if (seconds == null) return '—';
		const m = Math.floor(seconds / 60);
		const s = seconds % 60;
		return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	}

	const medals = ['🥇', '🥈', '🥉'];
</script>

<leaderboard-page class="flex flex-col items-center max-w-2xl mx-auto px-4 py-8 gap-6">
	<h1 class="text-3xl font-extrabold m-0">Leaderboard</h1>

	<tab-bar class="flex rounded-xl overflow-hidden border border-gray-200 self-center">
		<button
			class="px-6 py-2.5 font-semibold text-sm cursor-pointer border-0 transition-colors
				{tab === 'xp' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-blue-50'}"
			onclick={() => (tab = 'xp')}
		>⭐ Rating</button>
		<button
			class="px-6 py-2.5 font-semibold text-sm cursor-pointer border-0 transition-colors
				{tab === 'speed' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-blue-50'}"
			onclick={() => (tab = 'speed')}
		>⚡ Speed</button>
	</tab-bar>

	{#if tab === 'xp'}
		<leaderboard-table class="flex flex-col gap-2 w-full">
			{#each data.xp as entry, i (entry.userId)}
				<leaderboard-row class="flex items-center gap-3 px-4 py-3 bg-white rounded-xl shadow-sm border border-gray-100">
					<rank-badge class="w-8 text-xl text-center shrink-0">
						{medals[i] ?? `${i + 1}`}
					</rank-badge>

					{#if entry.image}
						<img src={entry.image} alt={entry.name} class="w-9 h-9 rounded-full object-cover shrink-0" />
					{:else}
						<avatar-placeholder class="flex items-center justify-center w-9 h-9 rounded-full bg-blue-200 text-blue-700 font-bold shrink-0">
							{entry.name.charAt(0).toUpperCase()}
						</avatar-placeholder>
					{/if}

					<row-info class="flex flex-col flex-1 min-w-0">
						<a href="/profile/{entry.userId}" class="font-semibold text-gray-800 hover:text-blue-600 no-underline truncate">
							{entry.name}
						</a>
						<span class="text-xs text-gray-400">{entry.sudokuSolved} solved · {entry.streakDays}🔥 streak</span>
					</row-info>

					<row-score class="flex flex-col items-end shrink-0">
						<span class="font-bold text-blue-600">{entry.totalXp} XP</span>
						<span class="text-xs text-gray-400">Lv.{entry.level}</span>
					</row-score>
				</leaderboard-row>
			{:else}
				<p class="text-gray-400 text-sm text-center">No players yet.</p>
			{/each}
		</leaderboard-table>
	{:else}
		<leaderboard-table class="flex flex-col gap-2 w-full">
			{#each data.speed as entry, i (entry.userId)}
				<leaderboard-row class="flex items-center gap-3 px-4 py-3 bg-white rounded-xl shadow-sm border border-gray-100">
					<rank-badge class="w-8 text-xl text-center shrink-0">
						{medals[i] ?? `${i + 1}`}
					</rank-badge>

					{#if entry.image}
						<img src={entry.image} alt={entry.name} class="w-9 h-9 rounded-full object-cover shrink-0" />
					{:else}
						<avatar-placeholder class="flex items-center justify-center w-9 h-9 rounded-full bg-blue-200 text-blue-700 font-bold shrink-0">
							{entry.name.charAt(0).toUpperCase()}
						</avatar-placeholder>
					{/if}

					<row-info class="flex flex-col flex-1 min-w-0">
						<a href="/profile/{entry.userId}" class="font-semibold text-gray-800 hover:text-blue-600 no-underline truncate">
							{entry.name}
						</a>
						<span class="text-xs text-gray-400">{entry.sudokuSolved} puzzles solved</span>
					</row-info>

					<row-score class="shrink-0">
						<span class="font-bold text-green-600 font-mono">{formatTime(entry.sudokuBestTimeSeconds)}</span>
					</row-score>
				</leaderboard-row>
			{:else}
				<p class="text-gray-400 text-sm text-center">No records yet.</p>
			{/each}
		</leaderboard-table>
	{/if}
</leaderboard-page>

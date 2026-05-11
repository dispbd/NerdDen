<!--
  Public user profile page — /profile/[id]
  Shows avatar, name, sudoku stats and game history.
-->
<script lang="ts">
	let { data } = $props();

	const profile = $derived(data.profile);
	const stats = $derived(data.stats);
	const history = $derived(data.history);
	const isOwn = $derived(data.isOwn);

	function formatTime(seconds: number): string {
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = seconds % 60;
		const pad = (n: number) => String(n).padStart(2, '0');
		return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
	}

	function formatDate(date: Date | string): string {
		return new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
	}

	const difficultyColor: Record<string, string> = {
		beginner: 'bg-green-100 text-green-700',
		easy: 'bg-teal-100 text-teal-700',
		medium: 'bg-blue-100 text-blue-700',
		hard: 'bg-orange-100 text-orange-700',
		expert: 'bg-red-100 text-red-700',
		extreme: 'bg-purple-100 text-purple-700'
	};

	const statusIcon: Record<string, string> = {
		completed: '✅',
		abandoned: '❌',
		in_progress: '⏳'
	};
</script>

<profile-page class="flex flex-col items-center max-w-2xl mx-auto px-4 py-8 gap-8">

	<!-- Avatar + Identity -->
	<profile-hero class="flex flex-col items-center gap-3 text-center">
		{#if profile.image}
			<img src={profile.image} alt={profile.name} class="w-24 h-24 rounded-full object-cover shadow" />
		{:else}
			<profile-avatar class="flex items-center justify-center w-24 h-24 rounded-full bg-blue-200 text-blue-700 text-4xl font-bold shadow">
				{profile.name.charAt(0).toUpperCase()}
			</profile-avatar>
		{/if}

		<profile-identity class="flex flex-col gap-0.5">
			<h1 class="text-2xl font-bold m-0">{profile.name}</h1>
			{#if profile.email}
				<p class="text-sm text-gray-500 m-0">{profile.email}</p>
			{/if}
			<p class="text-xs text-gray-400 m-0">Member since {formatDate(profile.createdAt)}</p>
		</profile-identity>

		{#if isOwn}
			<a href="/sudoku" class="mt-2 px-5 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors">
				Play Sudoku
			</a>
		{/if}
	</profile-hero>

	<!-- Stats -->
	<profile-section class="flex flex-col gap-3 w-full">
		<h2 class="text-xl font-semibold m-0">Sudoku Stats</h2>

		{#if stats}
			<stats-grid class="grid grid-cols-2 gap-3 sm:grid-cols-4">
				<stat-card class="flex flex-col items-center p-4 bg-white rounded-xl shadow-sm border border-gray-100">
					<span class="text-3xl font-extrabold text-blue-600">{stats.sudokuSolved}</span>
					<span class="text-xs text-gray-500 mt-1">Solved</span>
				</stat-card>
				<stat-card class="flex flex-col items-center p-4 bg-white rounded-xl shadow-sm border border-gray-100">
					<span class="text-3xl font-extrabold text-gray-700">{stats.sudokuPlayed}</span>
					<span class="text-xs text-gray-500 mt-1">Played</span>
				</stat-card>
				<stat-card class="flex flex-col items-center p-4 bg-white rounded-xl shadow-sm border border-gray-100">
					<span class="text-3xl font-extrabold text-green-600">
						{stats.sudokuBestTimeSeconds != null ? formatTime(stats.sudokuBestTimeSeconds) : '—'}
					</span>
					<span class="text-xs text-gray-500 mt-1">Best Time</span>
				</stat-card>
				<stat-card class="flex flex-col items-center p-4 bg-white rounded-xl shadow-sm border border-gray-100">
					<span class="text-3xl font-extrabold text-violet-600">Lv.{stats.level}</span>
					<span class="text-xs text-gray-500 mt-1">{stats.totalXp} XP</span>
				</stat-card>
			</stats-grid>
		{:else}
			<p class="text-gray-400 text-sm">No games played yet.</p>
		{/if}
	</profile-section>

	<!-- Game History -->
	<profile-section class="flex flex-col gap-3 w-full">
		<h2 class="text-xl font-semibold m-0">Recent Games</h2>

		{#if history.length === 0}
			<p class="text-gray-400 text-sm">No game history yet.</p>
		{:else}
			<history-list class="flex flex-col gap-2">
				{#each history as session (session.id)}
					<history-item class="flex items-center justify-between px-4 py-3 bg-white rounded-xl shadow-sm border border-gray-100">
						<history-left class="flex items-center gap-3">
							<span class="text-lg">{statusIcon[session.status]}</span>
							<span class="px-2 py-0.5 rounded-full text-xs font-semibold {difficultyColor[session.difficulty] ?? 'bg-gray-100 text-gray-600'}">
								{session.difficulty.charAt(0).toUpperCase() + session.difficulty.slice(1)}
							</span>
						</history-left>
						<history-right class="flex items-center gap-4 text-sm text-gray-600">
							{#if session.status === 'completed'}
								<span class="font-mono font-semibold text-green-700">{formatTime(session.timeSpent)}</span>
							{/if}
							{#if session.hintsUsed > 0}
								<span class="text-xs text-gray-400">{session.hintsUsed} hints</span>
							{/if}
							<span class="text-xs text-gray-400">{formatDate(session.createdAt)}</span>
						</history-right>
					</history-item>
				{/each}
			</history-list>
		{/if}
	</profile-section>

</profile-page>

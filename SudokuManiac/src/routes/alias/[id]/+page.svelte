<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { createAliasConnection } from '$lib/alias/connection.svelte';
	import type { PageServerData } from './$types';
	import type {
		AliasRoom,
		AliasGameStarted,
		AliasTurnStarted,
		AliasNextWord,
		AliasTurnEnded,
		AliasGameEnded
	} from '$lib/alias/protocol';

	let { data }: { data: PageServerData } = $props();

	// ─── View state ────────────────────────────────────────────────────────────

	type View = 'lobby' | 'game' | 'results';
	let view = $state<View>('lobby');

	// Game state
	let currentWord = $state<string | null>(null);
	let currentWordId = $state<string | null>(null);
	let isSpeaker = $state(false);
	let speakerName = $state('');
	let currentTeamId = $state<string | null>(null);
	let wordsRemaining = $state(0);
	let turnTimeLeft = $state(0);
	let turnDuration = $derived(data.room.turnDuration);
	let timerHandle: ReturnType<typeof setInterval> | null = null;
	let lastTurnResults = $state<{ teamId: string; wordsGuessed: number; scores: { teamId: string; score: number }[] } | null>(null);
	let standings = $state<{ teamId: string; name: string; score: number }[]>([]);
	let winner = $state('');
	let errorMsg = $state('');

	// ─── WS connection ─────────────────────────────────────────────────────────

	const conn = createAliasConnection({
		onRoomState: (_room: AliasRoom) => {
			// room is reactive via conn.state.room
		},
		onGameStarted: (e: AliasGameStarted) => {
			view = 'game';
			wordsRemaining = e.wordsInHat;
			currentTeamId = e.firstTeamId;
		},
		onTurnStarted: (e: AliasTurnStarted) => {
			currentTeamId = e.teamId;
			speakerName = e.speakerName;
			isSpeaker = e.speakerId === data.currentUserId;
			wordsRemaining = e.wordsRemaining;
			turnDuration = e.turnDuration;
			startTimer(e.turnDuration);
			if (!isSpeaker) currentWord = null;
		},
		onNextWord: (e: AliasNextWord) => {
			currentWord = e.word;
			currentWordId = e.wordId;
		},
		onWordResult: (e) => {
			wordsRemaining = e.wordsRemaining;
		},
		onTurnEnded: (e: AliasTurnEnded) => {
			clearTimer();
			lastTurnResults = { teamId: e.teamId, wordsGuessed: e.wordsGuessed, scores: e.scores };
			currentWord = null;
			isSpeaker = false;
		},
		onGameEnded: (e: AliasGameEnded) => {
			clearTimer();
			standings = e.standings;
			winner = e.winner;
			view = 'results';
		},
		onError: (msg: string) => {
			errorMsg = msg;
			setTimeout(() => (errorMsg = ''), 4000);
		}
	});

	// ─── Timer ─────────────────────────────────────────────────────────────────

	function startTimer(duration: number) {
		clearTimer();
		turnTimeLeft = duration;
		timerHandle = setInterval(() => {
			if (turnTimeLeft > 0) turnTimeLeft--;
		}, 1000);
	}

	function clearTimer() {
		if (timerHandle) {
			clearInterval(timerHandle);
			timerHandle = null;
		}
	}

	const timerLabel = $derived(
		`${Math.floor(turnTimeLeft / 60).toString().padStart(2, '0')}:${(turnTimeLeft % 60).toString().padStart(2, '0')}`
	);

	// ─── Lifecycle ─────────────────────────────────────────────────────────────

	onMount(() => {
		conn.connect(data.room.id);
	});

	onDestroy(() => {
		conn.disconnect();
		clearTimer();
	});

	// ─── Helpers ───────────────────────────────────────────────────────────────

	const room = $derived(conn.state.room ?? data.room);
	const isHost = $derived(room.hostId === data.currentUserId);
	const currentTeam = $derived(room.teams.find((t) => t.id === currentTeamId));
	const myTeam = $derived(
		room.teams.find((t) => t.members.some((m) => m.userId === data.currentUserId))
	);
	const canStart = $derived(
		isHost &&
		room.status === 'lobby' &&
		room.teams.filter((t) => t.members.length >= 1).length >= 2
	);
</script>

<svelte:head>
	<title>{room.topic} — Hat / Alias</title>
</svelte:head>

{#if errorMsg}
	<error-toast class="fixed top-4 right-4 z-50 bg-red-100 border border-red-300 rounded-lg px-4 py-3 text-red-700 shadow-lg">
		{errorMsg}
	</error-toast>
{/if}

<!-- ═══════════════════════════════════════════════════════ LOBBY -->
{#if view === 'lobby'}
<main class="max-w-3xl mx-auto px-4 py-8">
	<lobby-header class="flex items-center justify-between mb-6">
		<div>
			<h1 class="text-2xl font-bold">{room.topic}</h1>
			<p class="text-sm text-gray-500 capitalize">{room.difficulty} · {room.language} · {room.turnDuration}s turns · {room.wordCount} words</p>
		</div>
		<invite-code class="text-center">
			<p class="text-xs text-gray-400 mb-1">Room code</p>
			<p class="text-2xl font-mono font-bold tracking-widest text-indigo-700">{room.code}</p>
		</invite-code>
	</lobby-header>

	<!-- Teams -->
	<teams-grid class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
		{#each room.teams as team (team.id)}
			<team-card class="block bg-white rounded-xl border-2 p-4" style="border-color: {team.color}">
				<team-header class="flex items-center justify-between mb-3">
					<h3 class="font-bold text-lg">{team.name}</h3>
					<score-badge class="bg-gray-100 px-2 py-1 rounded font-mono text-sm">{team.score}</score-badge>
				</team-header>

				<members-list class="flex flex-col gap-1 mb-3">
					{#each team.members as member (member.id)}
						<member-row class="flex items-center gap-2 text-sm">
							<member-dot class="w-2 h-2 rounded-full inline-block" style="background: {team.color}"></member-dot>
							{member.userName}
							{#if member.userId === room.hostId}
								<span class="text-xs text-gray-400">(host)</span>
							{/if}
						</member-row>
					{/each}
					{#if team.members.length === 0}
						<p class="text-sm text-gray-400 italic">No players yet</p>
					{/if}
				</members-list>

				{#if myTeam?.id !== team.id}
					<button
						onclick={() => conn.joinTeam(team.id)}
						class="w-full py-1.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
						style="background: {team.color}"
					>
						Join {team.name}
					</button>
				{:else}
					<p class="text-center text-xs text-gray-400 py-1">You are here</p>
				{/if}
			</team-card>
		{/each}
	</teams-grid>

	{#if isHost}
		<button
			onclick={() => conn.startGame()}
			disabled={!canStart}
			class="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold text-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
		>
			{canStart ? 'Start Game' : 'Waiting for players (min 2 teams)'}
		</button>
	{:else}
		<p class="text-center text-gray-500">Waiting for the host to start…</p>
	{/if}
</main>

<!-- ═══════════════════════════════════════════════════════ GAME -->
{:else if view === 'game'}
<main class="max-w-2xl mx-auto px-4 py-8">
	<!-- Status bar -->
	<game-status class="flex items-center justify-between mb-6">
		<team-indicator>
			<p class="text-sm text-gray-500">Current team</p>
			<p class="font-bold text-lg" style="color: {currentTeam?.color ?? '#374151'}">{currentTeam?.name ?? '—'}</p>
		</team-indicator>

		<timer-display class="font-mono text-4xl font-bold tabular-nums {turnTimeLeft <= 10 ? 'text-red-600' : 'text-gray-800'}">
			{timerLabel}
		</timer-display>

		<words-left>
			<p class="text-sm text-gray-500 text-right">Words left</p>
			<p class="font-bold text-lg text-right">{wordsRemaining}</p>
		</words-left>
	</game-status>

	<!-- Scores -->
	<scores-row class="flex gap-3 mb-6 justify-center flex-wrap">
		{#each room.teams as team (team.id)}
			<score-chip
				class="px-4 py-2 rounded-full font-semibold text-white text-sm"
				style="background: {team.color}"
			>
				{team.name}: {team.score}
			</score-chip>
		{/each}
	</scores-row>

	{#if isSpeaker}
		<!-- Speaker view -->
		<speaker-panel class="block text-center">
			<p class="text-sm text-gray-500 mb-2">Describe this word — don't say it!</p>

			{#if currentWord}
				<word-display class="block bg-indigo-50 border-2 border-indigo-300 rounded-2xl py-10 px-6 mb-6">
					<p class="text-4xl font-extrabold text-indigo-800">{currentWord}</p>
				</word-display>

				<button-row class="flex gap-4 justify-center">
					<button
						onclick={() => conn.wordResult('got_it')}
						class="flex-1 max-w-xs bg-green-500 text-white py-4 rounded-xl font-bold text-xl hover:bg-green-600 transition-colors"
					>
						✓ Got it!
					</button>
					<button
						onclick={() => conn.wordResult('skip')}
						class="flex-1 max-w-xs bg-gray-300 text-gray-800 py-4 rounded-xl font-bold text-xl hover:bg-gray-400 transition-colors"
					>
						↩ Skip
					</button>
				</button-row>
			{:else}
				<p class="text-gray-500 text-lg">Waiting for the next word…</p>
			{/if}
		</speaker-panel>
	{:else}
		<!-- Guesser view -->
		<guesser-panel class="block text-center py-10">
			<p class="text-2xl font-bold text-gray-700 mb-2">{speakerName} is describing…</p>
			<p class="text-gray-400 text-lg">Listen and shout your guess!</p>
		</guesser-panel>
	{/if}

	<!-- Last turn results -->
	{#if lastTurnResults}
		<turn-summary class="block mt-8 bg-gray-50 rounded-xl p-4 text-sm">
			<p class="font-semibold mb-1">Last turn: {lastTurnResults.wordsGuessed} words guessed</p>
			<scores-summary class="flex gap-4 flex-wrap">
				{#each lastTurnResults.scores as s (s.teamId)}
					{@const team = room.teams.find((t) => t.id === s.teamId)}
					<span>{team?.name ?? '?'}: {s.score}</span>
				{/each}
			</scores-summary>
		</turn-summary>
	{/if}
</main>

<!-- ═══════════════════════════════════════════════════════ RESULTS -->
{:else}
<main class="max-w-lg mx-auto px-4 py-12 text-center">
	<h1 class="text-4xl font-extrabold mb-2">🎉 Game Over!</h1>
	<p class="text-xl text-indigo-600 font-bold mb-8">{winner} wins!</p>

	<standings-table class="block bg-white rounded-2xl shadow overflow-hidden mb-8">
		<table class="w-full">
			<thead>
				<tr class="bg-gray-50 text-left text-sm text-gray-500">
					<th class="px-4 py-3">#</th>
					<th class="px-4 py-3">Team</th>
					<th class="px-4 py-3 text-right">Score</th>
				</tr>
			</thead>
			<tbody>
				{#each standings as team, i (team.teamId)}
					<tr class="border-t border-gray-100 {i === 0 ? 'bg-indigo-50 font-bold' : ''}">
						<td class="px-4 py-3">{i + 1}</td>
						<td class="px-4 py-3">{team.name}</td>
						<td class="px-4 py-3 text-right">{team.score}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</standings-table>

	<a href="/alias" class="inline-block bg-indigo-600 text-white px-8 py-3 rounded-xl font-semibold hover:bg-indigo-700 transition-colors">
		Play Again
	</a>
</main>
{/if}

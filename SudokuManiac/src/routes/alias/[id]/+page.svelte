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
	<div class="card-kraft kraft-radius-sm fixed top-4 right-4 z-50 px-4 py-3 text-terracotta-ink shadow-float">{errorMsg}</div>
{/if}

{#snippet ring(size: number, stroke: number, color: string, track: string, ratio: number, label: string)}
	{@const r = size / 2 - stroke - 2}
	{@const circ = 2 * Math.PI * r}
	<div class="relative" style="width:{size}px;height:{size}px">
		<svg width={size} height={size} viewBox="0 0 {size} {size}">
			<circle cx={size / 2} cy={size / 2} {r} fill="none" stroke={track} stroke-width={stroke} />
			<circle cx={size / 2} cy={size / 2} {r} fill="none" stroke={color} stroke-width={stroke} stroke-linecap="round" stroke-dasharray={circ} stroke-dashoffset={circ * (1 - Math.max(0, Math.min(1, ratio)))} transform="rotate(-90 {size / 2} {size / 2})" />
		</svg>
		<div class="absolute inset-0 flex items-center justify-center font-hand font-bold" style="font-size:{size * 0.4}px;color:inherit">{label}</div>
	</div>
{/snippet}

<!-- ═══════════════════════════════════════════════════════ LOBBY -->
{#if view === 'lobby'}
<main class="mx-auto flex w-full max-w-3xl flex-col gap-5 px-1 py-4">
	<div class="flex items-center gap-3">
		<img src="/mascot-alias.png" alt="" class="size-8" />
		<h1 class="m-0 text-2xl">Room lobby</h1>
	</div>

	<!-- room code -->
	<div class="flex items-center justify-between rounded-[16px] bg-ink p-4">
		<div>
			<div class="text-[10px] font-semibold tracking-[.14em] text-[#b3a890] uppercase">Room code</div>
			<div class="font-hand text-3xl leading-none font-bold tracking-[3px] text-surface-2">{room.code}</div>
		</div>
		<button onclick={() => navigator.clipboard?.writeText(room.code)} class="kraft-radius-sm border-[1.5px] border-[#1c1813] bg-surface-2 px-3.5 py-1.5 font-hand text-base font-bold text-ink">Copy</button>
	</div>

	<!-- teams -->
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		{#each room.teams as team (team.id)}
			<div class="card-kraft kraft-radius p-4">
				<div class="mb-3 flex items-center gap-2.5">
					<span class="size-4 rounded-[5px] border-[1.5px] border-ink" style="background:{team.color}"></span>
					<span class="font-display text-lg font-bold text-ink">{team.name}</span>
					<span class="ml-auto text-xs font-medium text-muted">{team.members.length} players</span>
				</div>
				<div class="flex flex-wrap gap-2">
					{#each team.members as member (member.id)}
						<span class="rounded-full border-[1.5px] border-ink bg-surface-2 px-3 py-1 font-hand text-base font-bold text-ink">{member.userName}{member.userId === room.hostId ? ' ★' : ''}</span>
					{/each}
					{#if myTeam?.id !== team.id}
						<button onclick={() => conn.joinTeam(team.id)} class="rounded-full border-[1.5px] border-dashed px-3.5 py-1 font-hand text-base font-bold" style="color:{team.color};border-color:{team.color}">+ Join</button>
					{/if}
				</div>
			</div>
		{/each}
	</div>

	<!-- settings summary -->
	<div class="flex flex-wrap gap-2">
		{#each [`🎬 ${room.topic}`, room.difficulty, `⏱ ${room.turnDuration}s`, `🎩 ${room.wordCount} words`] as chip (chip)}
			<span class="rounded-full border border-[#cdbfa6] bg-paper px-3 py-1.5 text-[11px] font-semibold text-ink-soft capitalize">{chip}</span>
		{/each}
	</div>

	{#if isHost}
		<button onclick={() => conn.startGame()} disabled={!canStart} class="btn-primary kraft-radius w-full py-3 text-2xl disabled:opacity-50">
			{canStart ? 'Start game' : 'Waiting for players (min 2 teams)'}
		</button>
	{:else}
		<p class="m-0 text-center text-muted">Waiting for the host to start…</p>
	{/if}
</main>

<!-- ═══════════════════════════════════════════════════════ GAME -->
{:else if view === 'game'}
	{#if isSpeaker}
		<!-- Speaker — dark screen -->
		<main class="flex min-h-screen flex-col bg-ink px-6 py-6 text-surface-2">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2">
					<span class="size-3.5 rounded-[5px] border-[1.5px] border-surface-2" style="background:{currentTeam?.color ?? '#c2724f'}"></span>
					<span class="text-sm font-semibold">{currentTeam?.name ?? '—'}</span>
				</div>
				{@render ring(58, 5, '#c29a45', '#4a4236', turnDuration ? turnTimeLeft / turnDuration : 0, String(turnTimeLeft))}
				<div class="text-right">
					<div class="text-[10px] font-semibold tracking-[.1em] text-[#8a7f6b] uppercase">Left</div>
					<div class="font-hand text-2xl leading-none font-bold text-[#5f9670]">{wordsRemaining}</div>
				</div>
			</div>

			<div class="flex flex-1 items-center justify-center py-6">
				{#if currentWord}
					<div class="flex w-full max-w-xs flex-col items-center justify-center rounded-[24px] border-[1.5px] border-[#1c1813] bg-surface-2 px-6 py-10 text-center shadow-[-6px_8px_0_rgba(0,0,0,.25)]">
						<div class="mb-3.5 text-[11px] font-semibold tracking-[.16em] text-muted-2 uppercase">Explain this</div>
						<div class="font-display text-4xl leading-none font-bold text-ink">{currentWord}</div>
						<div class="mt-3 font-hand text-lg font-bold text-muted">no rhymes · no parts of the word</div>
					</div>
				{:else}
					<p class="text-lg text-[#8a7f6b]">Waiting for the next word…</p>
				{/if}
			</div>

			<div class="flex gap-3.5">
				<button onclick={() => conn.wordResult('skip')} class="kraft-radius flex-1 border-[1.5px] border-[#1c1813] bg-[#b5462e] py-3 font-hand text-2xl font-bold text-surface-2 shadow-[2px_3px_0_rgba(0,0,0,.45)]">✕ Skip</button>
				<button onclick={() => conn.wordResult('got_it')} class="kraft-radius flex-[1.3] border-[1.5px] border-[#1c1813] bg-forest py-3 font-hand text-2xl font-bold text-surface-2 shadow-[2px_3px_0_rgba(0,0,0,.45)]">✓ Got it</button>
			</div>
			<div class="mt-3.5 text-center text-[11px] text-[#8a7f6b]">{wordsRemaining} words left in the hat</div>
		</main>
	{:else}
		<!-- Guessers -->
		<main class="mx-auto flex w-full max-w-sm flex-col items-center gap-4 px-4 py-8 text-center">
			<div class="flex items-center gap-2">
				<span class="size-3 rounded-[5px] border-[1.5px] border-ink" style="background:{currentTeam?.color ?? '#c2724f'}"></span>
				<span class="font-display text-lg font-bold text-ink">{currentTeam?.name ?? '—'} — guess!</span>
			</div>
			<div class="flex size-28 items-center justify-center rounded-full border-[1.5px] border-ink bg-surface-2"><img src="/sudoku-maniac.webp" alt="" class="size-16" style="image-rendering:pixelated" /></div>
			<div class="font-display text-2xl leading-tight font-bold text-ink">{speakerName || 'Speaker'} is explaining</div>
			<div class="text-sm text-ink-soft">Shout your guesses out loud!</div>
			<div class="text-ink">{@render ring(150, 9, '#c2724f', '#ddd3bf', turnDuration ? turnTimeLeft / turnDuration : 0, timerLabel)}</div>
			<div class="flex w-full gap-3">
				<div class="flex-1 rounded-[13px] border-[1.5px] border-ink bg-surface py-3"><div class="font-hand text-3xl leading-none font-bold text-forest">{(currentTeam?.score ?? 0)}</div><div class="mt-1 text-[11px] text-muted">team score</div></div>
				<div class="flex-1 rounded-[13px] border-[1.5px] border-ink bg-surface py-3"><div class="font-hand text-3xl leading-none font-bold text-ink">{wordsRemaining}</div><div class="mt-1 text-[11px] text-muted">words left</div></div>
			</div>
		</main>
	{/if}

<!-- ═══════════════════════════════════════════════════════ RESULTS -->
{:else}
<main class="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-4 py-10 text-center">
	<div class="text-3xl">🏆</div>
	<div class="flex size-28 items-center justify-center rounded-[26px] border-[1.5px] border-ink bg-surface-2"><img src="/mascot-alias.png" alt="" class="size-24" /></div>
	<div class="font-display text-3xl font-bold text-ink">{winner} win!</div>
	<div class="flex w-full flex-col gap-2.5">
		{#each standings as team, i (team.teamId)}
			<div class="flex items-center gap-3 rounded-[12px] border-[1.5px] px-4 py-3 {i === 0 ? 'border-terracotta bg-[rgba(194,114,79,.16)]' : 'border-ink bg-surface'}">
				<span class="w-6 text-center font-hand text-2xl leading-none font-bold" style="color:{i === 0 ? 'var(--color-terracotta)' : 'var(--color-muted)'}">{i + 1}</span>
				<span class="flex-1 text-left font-display text-lg font-bold text-ink">{team.name}</span>
				<span class="font-hand text-2xl leading-none font-bold text-ink">{team.score}</span>
			</div>
		{/each}
	</div>
	<div class="flex w-full gap-2.5">
		<a href="/alias" class="btn-primary kraft-radius flex-1 py-2.5 text-center text-xl no-underline">Rematch</a>
		<a href="/alias" class="btn-secondary kraft-radius flex-1 py-2.5 text-center text-xl no-underline">New room</a>
	</div>
</main>
{/if}

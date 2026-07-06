<!--
  Home hub — /  ("Kraft Draft")  → NerdDen Home.dc.html
  Cross-game front door: account level/XP, Daily Den, per-game quick actions,
  Generate-anything, collectible mascots and the friends rail. Renders its own
  top bar (global Header hidden for `/`) + a mobile bottom nav.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages.js';
	import { createAuthClient } from 'better-auth/svelte';
	import KraftAvatar from '$lib/components/shared/KraftAvatar.svelte';
	import XpBar from '$lib/components/shared/XpBar.svelte';
	import BottomNav from '$lib/components/shared/BottomNav.svelte';
	import { loadGuestStats } from '$lib/games/sudoku/guestProgress.js';
	import { levelProgress } from '$lib/games/sudoku/level.js';

	let { data } = $props();

	const client = createAuthClient();
	const session = client.useSession();

	// ─── Player status (server for auth, localStorage for guests) ────────────────
	let guest = $state<{ level: number; totalXp: number; ratio: number; xpRemaining: number; streak: number; solved: number; best: number | null } | null>(null);

	onMount(() => {
		if (!data.isAuthenticated) {
			const g = loadGuestStats();
			const p = levelProgress(g.totalXp);
			guest = {
				level: p.level,
				totalXp: g.totalXp,
				ratio: p.ratio,
				xpRemaining: p.xpRemaining,
				streak: g.streakDays,
				solved: g.sudokuSolved,
				best: g.sudokuBestTimeSeconds
			};
		}
	});

	const name = $derived(data.user?.name ?? $session?.data?.user?.name ?? m.home_player());
	const level = $derived(data.user?.level ?? guest?.level ?? 1);
	const ratio = $derived(data.user?.ratio ?? guest?.ratio ?? 0);
	const xpRemaining = $derived(data.user?.xpRemaining ?? guest?.xpRemaining ?? 0);
	const totalXp = $derived(data.user?.totalXp ?? guest?.totalXp ?? 0);
	const streak = $derived(data.streak ?? guest?.streak ?? 0);
	const solved = $derived(data.games?.sudoku.solved ?? guest?.solved ?? 0);
	const bestTime = $derived(data.games?.sudoku.bestTime ?? guest?.best ?? null);

	function greeting(): string {
		const h = new Date().getHours();
		if (h < 12) return m.home_greet_morning({ name });
		if (h < 18) return m.home_greet_afternoon({ name });
		return m.home_greet_evening({ name });
	}
	function fmt(s: number | null): string {
		if (s == null) return '—';
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	}

	let genTopic = $state('');
	function generate() {
		const q = genTopic.trim();
		window.location.href = q ? `${resolve('/crossword')}?topic=${encodeURIComponent(q)}` : resolve('/crossword');
	}

	const MASCOT_BG = 'repeating-linear-gradient(45deg,#ece3d2,#ece3d2 7px,#f3ecdd 7px,#f3ecdd 14px)';
</script>

<svelte:head><title>NerdDen</title></svelte:head>

<home-screen class="flex min-h-screen flex-col bg-paper">
	<!-- top bar -->
	<home-topbar class="flex min-h-[66px] items-center justify-between gap-3 border-b-[1.5px] border-dashed border-dash bg-paper-card px-4 py-2.5 sm:px-6">
		<div class="flex items-center gap-2.5">
			<span class="font-display text-2xl font-bold tracking-tight text-ink">NerdDen</span>
			<span class="hidden font-hand text-lg font-bold text-terracotta-ink sm:inline" style="transform:rotate(-4deg)">{m.home_tagline_hand()}</span>
		</div>
		<div class="flex items-center gap-3 sm:gap-4">
			<span class="flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-2.5 py-1.5">
				🔥 <span class="font-hand text-lg leading-none font-bold text-terracotta">{streak}</span>
				<span class="hidden text-xs font-medium text-muted sm:inline">{m.home_day_streak()}</span>
			</span>
			{#if data.isAuthenticated || $session?.data?.user}
				<a href={resolve('/profile')} class="flex items-center gap-2.5 no-underline">
					<div class="hidden text-right sm:block">
						<div class="text-[13px] font-semibold text-ink">{name}</div>
						<div class="text-[11px] font-medium text-muted">{m.profile_level({ level })} · {totalXp} XP</div>
					</div>
					<KraftAvatar {name} image={$session?.data?.user?.image ?? null} size={38} radius={11} letterColor="var(--color-surface-2)" class="!bg-terracotta" />
				</a>
			{:else}
				<a href={resolve('/sign-in')} class="btn-primary kraft-radius-sm px-4 py-1.5 text-base no-underline">{m.nav_sign_in()}</a>
			{/if}
		</div>
	</home-topbar>

	<div class="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6">
		<!-- greeting + level -->
		<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<h1 class="m-0 text-3xl sm:text-4xl">{greeting()}</h1>
				<p class="mt-1.5 m-0 text-[15px] text-ink-soft">{m.home_daily_subtitle({ count: data.daily?.doneCount ?? 0 })}</p>
			</div>
			<div class="w-full sm:w-80 sm:flex-none">
				<div class="mb-2 flex justify-between text-[11px] font-semibold text-ink-soft">
					<span>{m.profile_level({ level })}</span>
					<span class="text-muted">{m.home_xp_to_next({ level: level + 1, xp: xpRemaining })}</span>
				</div>
				<XpBar {ratio} height={12} />
			</div>
		</div>

		<!-- generate anything (mobile: near top) -->
		<div class="rounded-[15px] bg-ink p-4 sm:hidden">
			<div class="mb-2 text-[10px] font-semibold tracking-[.12em] text-[#b3a890] uppercase">{m.home_generate_anything()}</div>
			<div class="mb-2.5 flex items-center gap-2 rounded-[11px] border-[1.5px] border-[#1c1813] bg-surface-2 px-3 py-2">
				<span>🔎</span>
				<input bind:value={genTopic} placeholder={m.home_topic_placeholder()} class="w-full bg-transparent font-hand text-lg font-bold text-ink outline-none" />
			</div>
			<button onclick={generate} class="btn-primary kraft-radius-sm w-full py-2 text-lg" style="box-shadow:2px 2px 0 rgba(0,0,0,.5)">{m.home_generate_puzzle()}</button>
		</div>

		<!-- daily den -->
		<div>
			<div class="mb-3.5 flex flex-wrap items-center gap-2.5">
				<span class="font-display text-xl font-bold text-ink">{m.home_daily_den()}</span>
				<span class="rounded-full border border-[rgba(95,118,87,.4)] bg-[rgba(95,118,87,.14)] px-2.5 py-1 text-[11px] font-semibold text-forest">{m.home_daily_done({ done: data.daily?.doneCount ?? 0 })}</span>
				<span class="ml-auto text-xs font-medium text-muted">{m.home_resets_in({ time: data.resetsIn ?? '' })}</span>
			</div>
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
				<!-- sudoku -->
				<div class="card-kraft flex flex-col p-[18px]" style="border-radius:16px 13px 15px 12px">
					{@render dailyHead('/sudoku-maniac.webp', true, m.game_sudoku(), m.home_sudoku_meta(), data.daily?.sudoku.status === 'completed' ? '✓' : '')}
					<p class="mt-3.5 mb-3.5 m-0 text-[13px] text-ink-soft">{data.daily?.sudoku.status === 'completed' ? m.home_sudoku_done() : m.home_sudoku_play_hint()}</p>
					<a href={resolve('/sudoku')} class="btn-secondary kraft-radius-sm mt-auto py-2 text-center text-lg no-underline">{data.daily?.sudoku.status === 'completed' ? m.home_see_solution() : m.sudoku_start_game()}</a>
				</div>
				<!-- crossword -->
				<div class="card-kraft flex flex-col p-[18px]" style="border-radius:13px 16px 12px 15px">
					{@render dailyHead('/mascot-owl.png', false, m.game_crossword(), m.home_crossword_meta(), data.daily?.crossword.active ? '61%' : '')}
					<p class="mt-3.5 mb-3.5 m-0 text-[13px] text-ink-soft">{data.daily?.crossword.active ? m.home_crossword_progress() : m.home_crossword_hint()}</p>
					<a href={resolve('/crossword')} class="kraft-radius-sm mt-auto border-[1.5px] border-ink bg-navy py-2 text-center font-hand text-lg font-bold text-surface-2 no-underline shadow-btn-sm">{data.daily?.crossword.active ? m.home_continue() : m.sudoku_start_game()}</a>
				</div>
				<!-- alias -->
				<div class="card-kraft flex flex-col p-[18px]" style="border-radius:15px 12px 16px 13px">
					{@render dailyHead('/mascot-alias.png', false, m.game_alias(), m.home_alias_meta(), '🎩')}
					<p class="mt-3.5 mb-3.5 m-0 text-[13px] text-ink-soft">{m.home_alias_topic({ topic: data.aliasTopic ?? '' })}</p>
					<a href={resolve('/alias')} class="btn-primary kraft-radius-sm mt-auto py-2 text-center text-lg no-underline">{m.home_start_room()}</a>
				</div>
			</div>
		</div>

		<!-- games + rail -->
		<div class="flex flex-col gap-6 lg:flex-row lg:items-start">
			<!-- your games -->
			<div class="flex min-w-0 flex-1 flex-col gap-3.5">
				<div class="font-display text-xl font-bold text-ink">{m.home_your_games()}</div>
				{@render gameRow('/sudoku-maniac.webp', true, m.game_sudoku(), m.home_sudoku_desc({ solved, best: fmt(bestTime) }), false, '/sudoku', m.home_continue(), '/sudoku', m.home_play(), 'var(--color-terracotta)')}
				{@render gameRow('/mascot-owl.png', false, m.game_crosswords(), m.home_crossword_desc({ count: data.games?.crossword.libraryCount ?? 0 }), true, '/crossword', m.home_library(), '/crossword', m.home_generate(), 'var(--color-navy)')}
				{@render gameRow('/mascot-alias.png', false, m.game_alias(), m.home_alias_desc(), false, '/alias', m.home_join_code(), '/alias', m.home_new_room(), 'var(--color-terracotta)')}
				<!-- coming soon -->
				<div class="flex items-center gap-4 rounded-[14px] border-[1.5px] border-dashed border-[#b6a98c] p-4">
					<div class="flex size-[60px] flex-none items-center justify-center rounded-[15px] border-[1.5px] border-dashed border-[#b6a98c] text-2xl" style="background:{MASCOT_BG}">✨</div>
					<div class="min-w-0 flex-1">
						<div class="font-display text-lg font-bold text-ink-soft">{m.home_soon_title()}</div>
						<div class="mt-1 text-[13px] text-muted">{m.home_soon_desc()}</div>
					</div>
					<button class="btn-secondary kraft-radius-sm flex-none border-[#cdbfa6] px-4 py-1.5 text-base !text-muted">{m.home_notify_me()}</button>
				</div>
			</div>

			<!-- rail -->
			<aside class="flex w-full flex-col gap-4 lg:w-80 lg:flex-none">
				<!-- generate anything (desktop) -->
				<div class="hidden rounded-[16px] bg-ink p-5 sm:block">
					<div class="mb-2.5 text-[11px] font-semibold tracking-[.12em] text-[#b3a890] uppercase">{m.home_generate_anything()}</div>
					<div class="mb-3.5 font-hand text-2xl leading-tight font-bold text-surface-2">{m.home_generate_pitch()}</div>
					<div class="mb-2.5 flex items-center gap-2 rounded-[11px] border-[1.5px] border-[#1c1813] bg-surface-2 px-3 py-2.5">
						<span>🔎</span>
						<input bind:value={genTopic} placeholder={m.home_topic_placeholder()} class="w-full bg-transparent font-hand text-lg font-bold text-ink outline-none" />
					</div>
					<button onclick={generate} class="btn-primary kraft-radius-sm w-full py-2.5 text-lg" style="box-shadow:2px 3px 0 rgba(0,0,0,.5)">{m.home_generate()}</button>
				</div>

				<!-- mascots -->
				<div class="card-kraft p-[18px]" style="border-radius:14px 16px 12px 15px">
					<div class="mb-3.5 flex items-center justify-between">
						<span class="label-caps">{m.profile_mascots()}</span>
						<span class="text-[11px] font-medium text-muted">{m.home_mascots_unlocked({ n: data.mascots?.unlockedCount ?? (guest ? (solved > 0 ? 1 : 0) : 0) })}</span>
					</div>
					<div class="flex gap-2.5">
						{@render mascotTile('/sudoku-maniac.webp', m.mascot_maniac(), data.mascots?.maniac ?? solved > 0, true)}
						{@render mascotTile('/mascot-owl.png', m.mascot_owl(), data.mascots?.owl ?? false, false)}
						{@render mascotTile('/mascot-alias.png', m.mascot_hatter(), data.mascots?.hatter ?? false, false)}
					</div>
					<div class="mt-3 text-[11px] text-muted">{m.home_mascots_hint()}</div>
				</div>

				<!-- friends -->
				<div class="card-kraft p-[18px]" style="border-radius:16px 13px 15px 12px">
					<div class="label-caps mb-3.5">{m.home_friends()}</div>
					{#if data.challenges && data.challenges.length > 0}
						<div class="flex flex-col gap-3">
							{#each data.challenges as ch (ch.id)}
								<div class="flex items-center gap-2.5">
									<div class="flex size-8 flex-none items-center justify-center rounded-[9px] border-[1.5px] border-ink font-hand text-base font-bold text-surface-2" style="background:{ch.kind === 'share' ? 'var(--color-forest)' : 'var(--color-navy)'}">{(ch.fromName ?? '?').charAt(0).toUpperCase()}</div>
									<div class="text-xs leading-snug text-ink-soft"><b class="text-ink">{ch.fromName}</b> {ch.kind === 'share' ? m.home_shared({ game: ch.gameType }) : m.home_challenged()} · {ch.label}</div>
								</div>
							{/each}
						</div>
						<a href={resolve('/leaderboard')} class="btn-secondary kraft-radius-sm mt-3.5 block py-2 text-center text-base no-underline">{m.home_see_all()}</a>
					{:else}
						<p class="m-0 text-[13px] text-muted">{m.home_no_friends()}</p>
					{/if}
				</div>
			</aside>
		</div>
	</div>

	<BottomNav />
</home-screen>

{#snippet dailyHead(img: string, pixel: boolean, title: string, meta: string, badge: string)}
	<div class="flex items-center gap-2.5">
		<div class="flex size-12 flex-none items-center justify-center rounded-[13px] border-[1.5px] border-ink bg-surface-2">
			<img src={img} alt="" class="size-9" style={pixel ? 'image-rendering:pixelated' : ''} />
		</div>
		<div class="min-w-0">
			<div class="font-display text-[17px] leading-none font-bold text-ink">{title}</div>
			<div class="mt-0.5 text-xs font-medium text-muted">{meta}</div>
		</div>
		{#if badge}
			<span class="ml-auto font-hand text-xl font-bold text-forest">{badge}</span>
		{/if}
	</div>
{/snippet}

{#snippet gameRow(img: string, pixel: boolean, title: string, desc: string, ai: boolean, hrefA: string, labelA: string, hrefB: string, labelB: string, accent: string)}
	<div class="card-kraft flex items-center gap-4 p-[18px]" style="border-radius:16px 13px 15px 12px">
		<div class="flex size-[60px] flex-none items-center justify-center rounded-[15px] border-[1.5px] border-ink bg-surface-2">
			<img src={img} alt="" class="size-11" style={pixel ? 'image-rendering:pixelated' : ''} />
		</div>
		<div class="min-w-0 flex-1">
			<div class="flex items-center gap-2">
				<span class="font-display text-xl leading-none font-bold text-ink">{title}</span>
				{#if ai}<span class="rounded-full border border-[rgba(62,92,118,.35)] bg-[rgba(62,92,118,.13)] px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-navy">AI</span>{/if}
			</div>
			<div class="mt-1 text-[13px] text-ink-soft">{desc}</div>
		</div>
		<div class="hidden flex-none gap-2.5 sm:flex">
			<a href={hrefA} class="btn-secondary kraft-radius-sm px-4 py-1.5 text-base no-underline">{labelA}</a>
			<a href={hrefB} class="kraft-radius-sm border-[1.5px] border-ink px-4 py-1.5 font-hand text-base font-bold text-surface-2 no-underline shadow-btn-sm" style="background:{accent}">{labelB}</a>
		</div>
	</div>
{/snippet}

{#snippet mascotTile(img: string, label: string, unlocked: boolean, pixel: boolean)}
	<div class="flex-1 rounded-[12px] p-2 text-center {unlocked ? 'border-[1.5px] border-ink bg-surface-2' : 'border-[1.5px] border-dashed border-[#b6a98c] bg-[#efe7d6] opacity-70'}">
		<img src={img} alt="" class="mx-auto size-10" style={pixel ? 'image-rendering:pixelated' : ''} />
		<div class="mt-1 text-[9px] font-semibold {unlocked ? 'text-ink' : 'text-muted'}">{unlocked ? label : `🔒 ${label}`}</div>
	</div>
{/snippet}

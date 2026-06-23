<!--
  Profile / XP — /profile/[id]  ("Kraft Draft" redesign)
  Identity card with level badge + XP bar, owned mascots, stat tiles,
  8-week activity heatmap and the achievements grid.
-->
<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import KraftTopBar from '$lib/components/shared/KraftTopBar.svelte';

	let { data } = $props();

	const profile = $derived(data.profile);
	const stats = $derived(data.stats);
	const progress = $derived(data.progress);
	const heatmap = $derived(data.heatmap);
	const achievements = $derived(data.achievements);
	const isOwn = $derived(data.isOwn);

	function formatTime(seconds: number | null): string {
		if (seconds == null) return '—';
		const m = Math.floor(seconds / 60);
		const s = seconds % 60;
		return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	}

	function monthYear(date: Date | string): string {
		return new Date(date).toLocaleDateString(getLocale(), { month: 'short', year: 'numeric' });
	}
	function shortDate(date: string): string {
		return new Date(date).toLocaleDateString(getLocale(), { month: 'short', day: 'numeric' });
	}

	/** 5-step heatmap palette (less → more). */
	const HEAT = ['#e7dcc6', '#cdbfa0', '#a9bf9c', '#7c9e78', '#5f7657'];
	/** Accent backgrounds cycled for earned achievement icons. */
	const ACH_BG = ['#c29a45', '#3e5c76', '#5f7657', '#c2724f'];
</script>

<svelte:head>
	<title>{profile.name} — NerdDen</title>
</svelte:head>

<profile-screen class="flex min-h-screen flex-col bg-paper">
	<KraftTopBar title="Profile" backHref="/">
		{#snippet right()}
			{#if isOwn}
				<button class="btn-secondary kraft-radius-sm bg-surface px-3 py-1 text-base sm:px-4 sm:text-lg">
					⚙ <span class="hidden sm:inline">{m.profile_settings()}</span>
				</button>
			{/if}
		{/snippet}
	</KraftTopBar>

	<div class="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6 lg:flex-row lg:gap-6">
		<!-- ─── Identity column ─── -->
		<div class="flex w-full flex-col gap-5 lg:w-[330px] lg:flex-none">
			<!-- identity card -->
			<div class="card-kraft kraft-radius px-5 pt-6 pb-7 text-center" style="border-radius:18px 15px 17px 14px">
				<div
					class="mx-auto flex size-24 items-center justify-center rounded-[24px] border-[1.5px] border-ink bg-surface-2"
				>
					{#if profile.image}
						<img src={profile.image} alt={profile.name} class="size-20 rounded-[20px] object-cover" />
					{:else}
						<img src="/sudoku-maniac.webp" alt={profile.name} class="size-20" style="image-rendering:pixelated" />
					{/if}
				</div>
				<div class="-mt-3 flex justify-center">
					<span
						class="rounded-full border-[1.5px] border-ink bg-terracotta px-3.5 py-1 text-xs font-bold text-surface-2"
					>
						{m.profile_level({ level: progress.level })}
					</span>
				</div>
				<div class="mt-3 font-hand text-[32px] leading-none font-bold text-ink">{profile.name}</div>
				<div class="mt-1 text-[13px] font-medium text-muted">
					{m.profile_member_since({ date: monthYear(profile.createdAt) })}
				</div>

				<!-- XP bar -->
				<div class="mt-4 text-left">
					<div class="mb-2 flex justify-between text-[11px] font-semibold text-ink-soft">
						<span>{m.profile_xp({ xp: data.totalXp })}</span>
						<span class="text-muted">{m.profile_to_level({ level: progress.level + 1, xp: progress.xpRemaining })}</span>
					</div>
					<div class="h-3 overflow-hidden rounded-full border-[1.5px] border-ink bg-track">
						<div class="h-full bg-terracotta transition-[width]" style="width:{Math.round(progress.ratio * 100)}%"></div>
					</div>
				</div>
			</div>

			<!-- owned mascots -->
			<div class="card-kraft p-[18px]" style="border-radius:15px 18px 14px 17px">
				<div class="label-caps mb-3.5">{m.profile_mascots()}</div>
				<div class="flex gap-3">
					<div class="flex-1 rounded-[13px] border-[1.5px] border-ink bg-surface-2 p-2.5 text-center">
						<img src="/sudoku-maniac.webp" alt={m.mascot_maniac()} class="mx-auto size-11" style="image-rendering:pixelated" />
						<div class="mt-1 text-[10px] font-semibold text-ink">{m.mascot_maniac()}</div>
					</div>
					<div class="flex-1 rounded-[13px] border-[1.5px] border-dashed border-[#b6a98c] bg-[#efe7d6] p-2.5 text-center opacity-70">
						<img src="/mascot-owl.png" alt={m.mascot_owl()} class="mx-auto size-11" />
						<div class="mt-1 text-[10px] font-semibold text-muted">🔒 {m.mascot_owl()}</div>
					</div>
					<div class="flex-1 rounded-[13px] border-[1.5px] border-dashed border-[#b6a98c] bg-[#efe7d6] p-2.5 text-center opacity-70">
						<img src="/mascot-alias.png" alt={m.mascot_hatter()} class="mx-auto size-11" />
						<div class="mt-1 text-[10px] font-semibold text-muted">🔒 {m.mascot_hatter()}</div>
					</div>
				</div>
			</div>
		</div>

		<!-- ─── Stats + achievements column ─── -->
		<div class="flex min-w-0 flex-1 flex-col gap-5">
			<!-- stat tiles -->
			<div class="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
				<div class="card-kraft p-4" style="border-radius:14px 11px 13px 12px">
					<div class="font-hand text-[34px] leading-[.85] font-bold text-ink">{stats?.sudokuSolved ?? 0}</div>
					<div class="mt-1.5 text-[11px] font-medium text-muted">{m.stat_solved()}</div>
				</div>
				<div class="card-kraft p-4" style="border-radius:11px 14px 12px 13px">
					<div class="font-hand text-[34px] leading-[.85] font-bold text-forest">{formatTime(stats?.sudokuBestTimeSeconds ?? null)}</div>
					<div class="mt-1.5 text-[11px] font-medium text-muted">{m.stat_best_time()}</div>
				</div>
				<div class="card-kraft p-4" style="border-radius:13px 12px 14px 11px">
					<div class="font-hand text-[34px] leading-[.85] font-bold text-terracotta">{stats?.streakDays ?? 0}</div>
					<div class="mt-1.5 text-[11px] font-medium text-muted">{m.stat_day_streak()}</div>
				</div>
				<div class="card-kraft p-4" style="border-radius:12px 13px 11px 14px">
					<div class="font-hand text-[34px] leading-[.85] font-bold text-navy">{stats?.noMistakesPct ?? 0}%</div>
					<div class="mt-1.5 text-[11px] font-medium text-muted">{m.stat_no_mistakes()}</div>
				</div>
			</div>

			<!-- activity heatmap -->
			<div class="card-kraft p-5" style="border-radius:16px 13px 15px 12px">
				<div class="mb-4 flex items-center justify-between">
					<div class="label-caps">{m.profile_activity()}</div>
					<div class="text-xs font-medium text-muted">{m.profile_activity_legend()}</div>
				</div>
				<div class="flex gap-[5px]">
					{#each heatmap as col (col)}
						<div class="flex flex-col gap-[5px]">
							{#each col as level, r (r)}
								<span
									class="h-3.5 w-6 rounded-[4px] border border-[rgba(50,44,36,.12)]"
									style="background:{HEAT[level]}"
								></span>
							{/each}
						</div>
					{/each}
				</div>
			</div>

			<!-- achievements -->
			<div class="card-kraft p-5" style="border-radius:13px 16px 12px 15px">
				<div class="label-caps mb-4">{m.profile_achievements()}</div>
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
					{#each achievements as ach, i (ach.id)}
						<div class="flex items-center gap-3 {ach.earned ? '' : 'opacity-45'}">
							<div
								class="flex size-11 flex-none items-center justify-center rounded-[13px] border-[1.5px] text-xl"
								style={ach.earned
									? `background:${ACH_BG[i % ACH_BG.length]};border-color:#322c24`
									: 'background:#e3d8c2;border-style:dashed;border-color:#b6a98c'}
							>
								{ach.earned ? ach.icon : '🔒'}
							</div>
							<div class="min-w-0">
								<div class="text-[13px] leading-tight font-semibold {ach.earned ? 'text-ink' : 'text-ink-soft'}">{ach.title}</div>
								<div class="text-[11px] font-medium text-muted">
									{#if ach.earned && ach.earnedAt}
										{m.achievement_earned({ date: shortDate(ach.earnedAt) })}
									{:else}
										{ach.description}
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>
</profile-screen>

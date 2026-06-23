<!--
  Leaderboard — /leaderboard  ("Kraft Draft" redesign)
  Period switcher (week / all / friends), top-3 podium and a ranked list with
  the current player's row highlighted. Only "All time" is backed by real data;
  "This week" and "Friends" are placeholders (TODO: time-windowed + social queries).
-->
<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { resolve } from '$app/paths';
	import KraftTopBar from '$lib/components/shared/KraftTopBar.svelte';
	import type { LeaderRow } from './+page.server';

	let { data } = $props();

	type Period = 'all' | 'week' | 'friends';
	let period = $state<Period>('all');

	const RANK_COLOR = ['#c2724f', '#3e5c76', '#5f7657']; // 1st, 2nd, 3rd

	function initial(name: string): string {
		return name.trim().charAt(0).toUpperCase() || '?';
	}

	const PERIODS: { id: Period; label: () => string; short: () => string }[] = [
		{ id: 'week', label: m.lb_week, short: m.lb_week_short },
		{ id: 'all', label: m.lb_all_time, short: m.lb_all_short },
		{ id: 'friends', label: m.lb_friends, short: m.lb_friends }
	];
</script>

<svelte:head>
	<title>{m.lb_title()} — NerdDen</title>
</svelte:head>

<leaderboard-screen class="flex min-h-screen flex-col bg-paper">
	<KraftTopBar title={m.lb_title()} backHref="/">
		{#snippet right()}
			<div class="hidden gap-2 sm:flex">
				{#each PERIODS as p (p.id)}
					<button
						onclick={() => (period = p.id)}
						class="kraft-radius-sm px-4 py-1 font-hand text-lg font-bold whitespace-nowrap
							{period === p.id
							? 'border-[1.5px] border-ink bg-terracotta text-surface-2 shadow-[2px_2px_0_rgba(50,44,36,.6)]'
							: 'border-[1.5px] border-ink bg-transparent text-ink'}"
					>{p.label()}</button>
				{/each}
			</div>
		{/snippet}
	</KraftTopBar>

	<div class="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
		<!-- mobile period switcher -->
		<div class="flex gap-1.5 sm:hidden">
			{#each PERIODS as p (p.id)}
				<button
					onclick={() => (period = p.id)}
					class="kraft-radius-sm flex-1 py-1.5 font-hand text-base font-bold
						{period === p.id
						? 'border-[1.5px] border-ink bg-terracotta text-surface-2 shadow-[1px_2px_0_rgba(50,44,36,.6)]'
						: 'border-[1.5px] border-ink bg-transparent text-ink'}"
				>{p.short()}</button>
			{/each}
		</div>

		{#if period !== 'all'}
			<!-- placeholder for week / friends -->
			<div class="card-kraft kraft-radius flex flex-col items-center gap-3 p-10 text-center">
				<img src="/sudoku-maniac.webp" alt="" class="size-16" style="image-rendering:pixelated" />
				<p class="m-0 text-base font-semibold text-ink-soft">{m.lb_friends_soon()}</p>
			</div>
		{:else if data.list.length === 0}
			<div class="card-kraft kraft-radius p-10 text-center text-ink-soft">{m.lb_empty()}</div>
		{:else}
			<!-- ─── Podium (top 3) ─── -->
			{#if data.podium.length === 3}
				{@const second = data.podium[1]}
				{@const first = data.podium[0]}
				{@const third = data.podium[2]}
				<div class="hidden items-end justify-center gap-[18px] sm:flex">
					<!-- 2nd -->
					<div class="w-[200px] text-center">
						<div
							class="mx-auto mb-2.5 flex size-[62px] items-center justify-center rounded-[16px] border-[1.5px] border-ink bg-surface-2 font-hand text-[30px] font-bold"
							style="color:{RANK_COLOR[1]}"
						>{initial(second.name)}</div>
						<div class="text-sm leading-tight font-semibold text-ink">{second.name}</div>
						<div class="my-0.5 font-hand text-[22px] leading-none font-bold text-muted">{second.totalXp} XP</div>
						<div class="mt-1.5 flex h-[90px] items-center justify-center rounded-t-[12px] border-[1.5px] border-ink bg-surface font-hand text-[46px] font-bold" style="color:{RANK_COLOR[1]}">2</div>
					</div>
					<!-- 1st -->
					<div class="w-[210px] text-center">
						<div class="mb-1 text-2xl leading-none">👑</div>
						<div
							class="mx-auto mb-2.5 flex size-[74px] items-center justify-center rounded-[18px] border-[1.5px] border-ink bg-surface-2 font-hand text-[36px] font-bold"
							style="color:{RANK_COLOR[0]}"
						>{initial(first.name)}</div>
						<div class="text-[15px] leading-tight font-bold text-ink">{first.name}</div>
						<div class="my-0.5 font-hand text-2xl leading-none font-bold text-terracotta">{first.totalXp} XP</div>
						<div class="mt-1.5 flex h-[124px] items-center justify-center rounded-t-[12px] border-[1.5px] border-ink bg-terracotta font-hand text-[58px] font-bold text-surface-2">1</div>
					</div>
					<!-- 3rd -->
					<div class="w-[200px] text-center">
						<div
							class="mx-auto mb-2.5 flex size-[58px] items-center justify-center rounded-[15px] border-[1.5px] border-ink bg-surface-2 font-hand text-[28px] font-bold"
							style="color:{RANK_COLOR[2]}"
						>{initial(third.name)}</div>
						<div class="text-sm leading-tight font-semibold text-ink">{third.name}</div>
						<div class="my-0.5 font-hand text-[22px] leading-none font-bold text-muted">{third.totalXp} XP</div>
						<div class="mt-1.5 flex h-[72px] items-center justify-center rounded-t-[12px] border-[1.5px] border-ink bg-surface font-hand text-[42px] font-bold" style="color:{RANK_COLOR[2]}">3</div>
					</div>
				</div>
			{/if}

			<!-- ─── List ─── -->
			<div class="card-kraft overflow-hidden" style="border-radius:16px 13px 15px 12px">
				{#each data.list as row, i (row.userId)}
					{@render listRow(row, i > 0)}
				{/each}
				{#if data.meOutside && data.meRow}
					<div class="border-t-[1.5px] border-dashed border-dash"></div>
					{@render listRow(data.meRow, false)}
				{/if}
			</div>
		{/if}
	</div>
</leaderboard-screen>

{#snippet listRow(row: LeaderRow, divider: boolean)}
	<a
		href={resolve(`/profile/${row.userId}`)}
		class="flex items-center gap-3 px-3.5 py-3 no-underline sm:gap-3.5 sm:px-[18px]
			{divider ? 'border-t-[1.5px] border-dashed border-dash' : ''}
			{row.me ? 'bg-cell-selected-bg' : ''}"
	>
		<span
			class="w-[26px] flex-none text-center font-hand text-xl leading-none font-bold sm:w-[34px] sm:text-2xl"
			style="color:{row.rank <= 3 ? RANK_COLOR[row.rank - 1] : '#322c24'}"
		>{row.rank}</span>
		<div class="flex size-8 flex-none items-center justify-center overflow-hidden rounded-[10px] border-[1.5px] border-ink bg-surface-2 font-hand text-lg font-bold text-ink sm:size-[38px] sm:rounded-[11px] sm:text-xl">
			{#if row.image}
				<img src={row.image} alt={row.name} class="size-full object-cover" />
			{:else}
				{initial(row.name)}
			{/if}
		</div>
		<span class="flex-1 truncate text-[13px] font-semibold text-ink sm:text-sm">
			{row.name}{#if row.me}<span class="text-muted"> · {m.lb_you()}</span>{/if}
		</span>
		<span class="hidden w-20 text-right text-xs font-medium text-muted sm:inline">{m.lb_solved_short({ count: row.sudokuSolved })}</span>
		<span class="font-hand text-lg leading-none font-bold text-ink sm:w-24 sm:text-right sm:text-[22px]">{row.totalXp}</span>
	</a>
{/snippet}

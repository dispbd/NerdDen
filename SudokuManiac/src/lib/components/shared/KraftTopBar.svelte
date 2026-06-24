<!--
  Kraft Draft in-page top bar — used on full-screen views that hide the global
  Header (profile, leaderboard, online duel, custom). Paper-card surface with a
  hand-drawn dashed bottom edge, a "← Menu" button (Caveat) and a Bricolage title.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		backHref = '/sudoku',
		backLabel = 'Menu',
		right
	}: {
		title: string;
		backHref?: string;
		backLabel?: string;
		right?: Snippet;
	} = $props();
</script>

<kraft-topbar
	class="flex min-h-[66px] items-center justify-between gap-3 border-b-[1.5px] border-dashed border-dash bg-paper-card px-4 py-2.5 sm:px-6"
>
	<div class="flex min-w-0 items-center gap-3 sm:gap-4">
		<a
			href={backHref}
			class="btn-secondary kraft-radius-sm flex-none px-3 py-1 text-lg no-underline sm:px-4 sm:text-xl"
		>
			<span class="hidden sm:inline">← {backLabel}</span>
			<span class="sm:hidden">←</span>
		</a>
		<h1 class="m-0 truncate text-lg sm:text-xl">{title}</h1>
	</div>

	{#if right}
		<div class="flex flex-none items-center gap-2 sm:gap-3">
			{@render right()}
		</div>
	{/if}
</kraft-topbar>

<!--
  Mobile bottom navigation (Home / Games / Ranks / Profile). Paper-card bar with a
  dashed top edge; the active item is terracotta. Shown only on small screens.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages.js';

	const ITEMS = [
		{ href: '/', icon: '🏠', label: () => m.nav_home() },
		{ href: '/sudoku', icon: '🎯', label: () => m.nav_games() },
		{ href: '/leaderboard', icon: '🏆', label: () => m.nav_ranks() },
		{ href: '/profile', icon: '🙂', label: () => m.nav_profile() }
	];

	function active(href: string): boolean {
		const p = page.url.pathname;
		return href === '/' ? p === '/' : p.startsWith(href);
	}
</script>

<nav
	class="flex items-center justify-around border-t-[1.5px] border-dashed border-dash bg-paper-card px-0 pt-2.5 pb-3.5 md:hidden"
>
	{#each ITEMS as item (item.href)}
		<a
			href={item.href}
			class="flex flex-col items-center gap-0.5 no-underline {active(item.href) ? '' : 'opacity-55'}"
		>
			<span class="text-lg">{item.icon}</span>
			<span class="text-[10px] font-semibold {active(item.href) ? 'text-terracotta' : 'text-ink-soft'}"
				>{item.label()}</span
			>
		</a>
	{/each}
</nav>

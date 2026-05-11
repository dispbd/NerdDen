<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { createAuthClient } from 'better-auth/svelte';

	const NAV_LINKS = [
		{ href: resolve('/'), label: 'Home' },
		{ href: resolve('/sudoku'), label: 'Sudoku' },
		{ href: resolve('/coming-soon'), label: 'Crosswords' },
		{ href: resolve('/coming-soon'), label: 'Hat / Alias' },
		{ href: resolve('/leaderboard'), label: 'Leaderboard' }
	] as const;

	const client = createAuthClient();
	const session = client.useSession();

	async function signOut() {
		await client.signOut();
		window.location.href = '/';
	}
</script>

<header class="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white/80 backdrop-blur-sm">
	<a href={resolve('/')} class="text-xl font-extrabold text-blue-700 no-underline hover:text-blue-800 transition-colors">
		NerdDen
	</a>

	<nav>
		<ul class="flex gap-6 list-none m-0 p-0">
			{#each NAV_LINKS as link (link.href)}
				<li>
					<a
						href={link.href}
						aria-current={page.url.pathname === link.href || (link.href !== '/' && page.url.pathname.startsWith(link.href)) ? 'page' : undefined}
						class="font-semibold text-sm no-underline transition-colors
							{page.url.pathname === link.href || (link.href !== '/' && page.url.pathname.startsWith(link.href))
							? 'text-blue-600'
							: 'text-gray-600 hover:text-blue-500'}"
					>
						{link.label}
					</a>
				</li>
			{/each}
		</ul>
	</nav>

	<header-auth class="flex items-center gap-3">
		{#if $session?.data?.user}
			<a href="/profile" class="text-sm font-semibold text-gray-700 hover:text-blue-600 transition-colors no-underline">
				{$session.data.user.name}
			</a>
			<button
				onclick={signOut}
				class="text-sm font-semibold text-gray-500 hover:text-red-500 transition-colors cursor-pointer border-0 bg-transparent p-0"
			>
				Sign Out
			</button>
		{:else}
			<a href="/sign-in" class="text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors no-underline">
				Sign In
			</a>
			<a href="/sign-up" class="px-3 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors no-underline">
				Sign Up
			</a>
		{/if}
	</header-auth>
</header>


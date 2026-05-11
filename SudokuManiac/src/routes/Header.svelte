<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { createAuthClient } from 'better-auth/svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale, setLocale, locales } from '$lib/paraglide/runtime.js';

	const NAV_LINKS = $derived([
		{ href: resolve('/'), label: m.nav_home() },
		{ href: resolve('/sudoku'), label: m.nav_sudoku() },
		{ href: resolve('/coming-soon'), label: m.nav_crosswords() },
		{ href: resolve('/coming-soon'), label: m.nav_hat_alias() },
		{ href: resolve('/leaderboard'), label: m.nav_leaderboard() }
	]);

	const client = createAuthClient();
	const session = client.useSession();

	async function signOut() {
		await client.signOut();
		window.location.href = '/';
	}

	const LOCALE_LABELS: Record<string, string> = {
		en: 'English',
		ru: 'Русский',
		de: 'Deutsch',
		es: 'Español'
	};

	let langOpen = $state(false);
	const currentLocale = $derived(getLocale());
</script>

<svelte:window onclick={(e) => {
	if (!(e.target as HTMLElement)?.closest?.('lang-switcher')) langOpen = false;
}} />

<header class="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white/80 backdrop-blur-sm">
	<a href={resolve('/')} class="text-xl font-extrabold text-blue-700 no-underline hover:text-blue-800 transition-colors">
		NerdDen
	</a>

	<nav>
		<ul class="flex gap-6 list-none m-0 p-0">
			{#each NAV_LINKS as link (link.label)}
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
		<!-- Language switcher -->
		<lang-switcher class="relative">
			<button
				onclick={() => (langOpen = !langOpen)}
				class="flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-blue-600 cursor-pointer border-0 bg-transparent p-0 transition-colors"
				aria-label={m.lang_switcher_label()}
			>
				🌐 <span class="uppercase">{currentLocale}</span>
			</button>
			{#if langOpen}
				<lang-dropdown class="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-50 min-w-32">
					{#each locales as locale (locale)}
						<button
							onclick={() => { setLocale(locale); langOpen = false; }}
							class="flex w-full px-4 py-2 text-sm text-left cursor-pointer border-0 bg-transparent transition-colors
								{locale === currentLocale ? 'font-bold text-blue-600 bg-blue-50' : 'text-gray-700 hover:bg-gray-50'}"
						>
							{LOCALE_LABELS[locale] ?? locale}
						</button>
					{/each}
				</lang-dropdown>
			{/if}
		</lang-switcher>

		{#if $session?.data?.user}
			<a href="/profile" class="text-sm font-semibold text-gray-700 hover:text-blue-600 transition-colors no-underline">
				{$session.data.user.name}
			</a>
			<button
				onclick={signOut}
				class="text-sm font-semibold text-gray-500 hover:text-red-500 transition-colors cursor-pointer border-0 bg-transparent p-0"
			>
				{m.nav_sign_out()}
			</button>
		{:else}
			<a href="/sign-in" class="text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors no-underline">
				{m.nav_sign_in()}
			</a>
			<a href="/sign-up" class="px-3 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors no-underline">
				{m.nav_sign_up()}
			</a>
		{/if}
	</header-auth>
</header>


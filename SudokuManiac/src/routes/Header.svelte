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
	let mobileOpen = $state(false);
	const currentLocale = $derived(getLocale());

	function isActive(href: string) {
		return page.url.pathname === href || (href !== resolve('/') && page.url.pathname.startsWith(href));
	}
</script>

<svelte:window
	onclick={(e) => {
		const t = e.target as HTMLElement;
		if (!t?.closest?.('lang-switcher')) langOpen = false;
		if (!t?.closest?.('mobile-menu') && !t?.closest?.('[data-hamburger]')) mobileOpen = false;
	}}
/>

<header class="relative flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white/90 backdrop-blur-sm z-30">
	<a href={resolve('/')} class="text-xl font-extrabold text-blue-700 no-underline hover:text-blue-800 transition-colors">
		NerdDen
	</a>

	<!-- Desktop nav -->
	<nav class="hidden md:block">
		<ul class="flex gap-6 list-none m-0 p-0">
			{#each NAV_LINKS as link (link.label)}
				<li>
					<a
						href={link.href}
						aria-current={isActive(link.href) ? 'page' : undefined}
						class="font-semibold text-sm no-underline transition-colors {isActive(link.href) ? 'text-blue-600' : 'text-gray-600 hover:text-blue-500'}"
					>
						{link.label}
					</a>
				</li>
			{/each}
		</ul>
	</nav>

	<header-auth class="hidden md:flex items-center gap-3">
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

	<!-- Hamburger button (mobile) -->
	<button
		data-hamburger
		onclick={() => (mobileOpen = !mobileOpen)}
		aria-label="Menu"
		aria-expanded={mobileOpen}
		class="md:hidden flex flex-col justify-center gap-1.5 w-10 h-10 border-0 bg-transparent cursor-pointer p-2"
	>
		<span class="block h-0.5 w-full bg-gray-700 transition-all {mobileOpen ? 'translate-y-2 rotate-45' : ''}"></span>
		<span class="block h-0.5 w-full bg-gray-700 transition-all {mobileOpen ? 'opacity-0' : ''}"></span>
		<span class="block h-0.5 w-full bg-gray-700 transition-all {mobileOpen ? '-translate-y-2 -rotate-45' : ''}"></span>
	</button>
</header>

<!-- Mobile menu drawer -->
{#if mobileOpen}
	<mobile-menu class="md:hidden fixed inset-x-0 top-14.25 bg-white border-b border-gray-200 shadow-lg z-20 flex flex-col">
		<nav class="flex flex-col px-4 py-3 gap-1">
			{#each NAV_LINKS as link (link.label)}
				<a
					href={link.href}
					onclick={() => (mobileOpen = false)}
					aria-current={isActive(link.href) ? 'page' : undefined}
					class="py-3 px-2 font-semibold text-base no-underline border-b border-gray-100 last:border-0 transition-colors {isActive(link.href) ? 'text-blue-600' : 'text-gray-700 hover:text-blue-500'}"
				>
					{link.label}
				</a>
			{/each}
		</nav>

		<mobile-auth class="flex flex-col px-4 pb-4 gap-3">
			<!-- Language row -->
			<lang-row class="flex flex-wrap gap-2 pt-2">
				{#each locales as locale (locale)}
					<button
						onclick={() => { setLocale(locale); mobileOpen = false; }}
						class="px-3 py-1.5 rounded-full text-sm font-semibold border cursor-pointer transition-colors
							{locale === currentLocale ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}"
					>
						{LOCALE_LABELS[locale] ?? locale}
					</button>
				{/each}
			</lang-row>

			{#if $session?.data?.user}
				<mobile-user class="flex items-center justify-between">
					<span class="text-sm font-semibold text-gray-700">{$session.data.user.name}</span>
					<button
						onclick={() => { void signOut(); mobileOpen = false; }}
						class="text-sm font-semibold text-red-500 cursor-pointer border-0 bg-transparent p-0"
					>
						{m.nav_sign_out()}
					</button>
				</mobile-user>
			{:else}
				<mobile-auth-links class="flex gap-3">
					<a href={resolve('/sign-in')} onclick={() => (mobileOpen = false)} class="flex-1 text-center py-2.5 border border-blue-600 text-blue-600 font-semibold rounded-lg no-underline hover:bg-blue-50 transition-colors">
						{m.nav_sign_in()}
					</a>
					<a href={resolve('/sign-up')} onclick={() => (mobileOpen = false)} class="flex-1 text-center py-2.5 bg-blue-600 text-white font-semibold rounded-lg no-underline hover:bg-blue-700 transition-colors">
						{m.nav_sign_up()}
					</a>
				</mobile-auth-links>
			{/if}
		</mobile-auth>
	</mobile-menu>
{/if}


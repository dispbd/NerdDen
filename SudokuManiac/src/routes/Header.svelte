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

<header
	class="relative z-30 flex min-h-[66px] items-center justify-between border-b-[1.5px] border-dashed border-dash bg-paper-card px-4 py-3"
>
	<a
		href={resolve('/')}
		class="flex items-center gap-2 font-display text-xl font-bold text-ink no-underline"
	>
		NerdDen <img src="/sudoku-maniac.webp" alt="SudokuManiac" class="inline-block size-7" style="image-rendering:pixelated" />
	</a>

	<!-- Desktop nav -->
	<nav class="hidden md:block">
		<ul class="m-0 flex list-none gap-6 p-0">
			{#each NAV_LINKS as link (link.label)}
				<li>
					<a
						href={link.href}
						aria-current={isActive(link.href) ? 'page' : undefined}
						class="text-sm font-semibold no-underline transition-colors {isActive(link.href)
							? 'text-terracotta'
							: 'text-ink-soft hover:text-terracotta'}"
					>
						{link.label}
					</a>
				</li>
			{/each}
		</ul>
	</nav>

	<header-auth class="hidden items-center gap-3 md:flex">
		<!-- Language switcher -->
		<lang-switcher class="relative">
			<button
				onclick={() => (langOpen = !langOpen)}
				class="flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-sm font-semibold text-ink-soft transition-colors hover:text-terracotta"
				aria-label={m.lang_switcher_label()}
			>
				🌐 <span class="uppercase">{currentLocale}</span>
			</button>
			{#if langOpen}
				<lang-dropdown
					class="absolute top-full right-0 z-50 mt-1 min-w-32 overflow-hidden rounded-[12px] border-[1.5px] border-ink bg-surface shadow-card"
				>
					{#each locales as locale (locale)}
						<button
							onclick={() => { setLocale(locale); langOpen = false; }}
							class="flex w-full cursor-pointer border-0 bg-transparent px-4 py-2 text-left text-sm transition-colors
								{locale === currentLocale ? 'bg-cell-selected-bg font-bold text-terracotta' : 'text-ink-soft hover:bg-surface-2'}"
						>
							{LOCALE_LABELS[locale] ?? locale}
						</button>
					{/each}
				</lang-dropdown>
			{/if}
		</lang-switcher>

		{#if $session?.data?.user}
			<a href="/profile" class="text-sm font-semibold text-ink no-underline transition-colors hover:text-terracotta">
				{$session.data.user.name}
			</a>
			<button
				onclick={signOut}
				class="cursor-pointer border-0 bg-transparent p-0 text-sm font-semibold text-muted transition-colors hover:text-terracotta-ink"
			>
				{m.nav_sign_out()}
			</button>
		{:else}
			<a href="/sign-in" class="text-sm font-semibold text-navy no-underline transition-colors hover:text-ink">
				{m.nav_sign_in()}
			</a>
			<a
				href="/sign-up"
				class="btn-primary kraft-radius-sm px-4 py-1.5 text-base no-underline"
			>
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
		class="flex h-10 w-10 cursor-pointer flex-col justify-center gap-1.5 border-0 bg-transparent p-2 md:hidden"
	>
		<span class="block h-0.5 w-full bg-ink transition-all {mobileOpen ? 'translate-y-2 rotate-45' : ''}"></span>
		<span class="block h-0.5 w-full bg-ink transition-all {mobileOpen ? 'opacity-0' : ''}"></span>
		<span class="block h-0.5 w-full bg-ink transition-all {mobileOpen ? '-translate-y-2 -rotate-45' : ''}"></span>
	</button>
</header>

<!-- Mobile menu drawer -->
{#if mobileOpen}
	<mobile-menu
		class="fixed inset-x-0 top-[66px] z-20 flex flex-col border-b-[1.5px] border-dashed border-dash bg-paper-card shadow-card md:hidden"
	>
		<nav class="flex flex-col gap-1 px-4 py-3">
			{#each NAV_LINKS as link (link.label)}
				<a
					href={link.href}
					onclick={() => (mobileOpen = false)}
					aria-current={isActive(link.href) ? 'page' : undefined}
					class="border-b-[1.5px] border-dashed border-dash px-2 py-3 text-base font-semibold no-underline transition-colors last:border-0 {isActive(link.href)
						? 'text-terracotta'
						: 'text-ink hover:text-terracotta'}"
				>
					{link.label}
				</a>
			{/each}
		</nav>

		<mobile-auth class="flex flex-col gap-3 px-4 pb-4">
			<!-- Language row -->
			<lang-row class="flex flex-wrap gap-2 pt-2">
				{#each locales as locale (locale)}
					<button
						onclick={() => { setLocale(locale); mobileOpen = false; }}
						class="kraft-radius-sm cursor-pointer border-[1.5px] px-3 py-1.5 text-sm font-semibold transition-colors
							{locale === currentLocale
							? 'border-ink bg-terracotta text-surface-2'
							: 'border-ink bg-transparent text-ink-soft'}"
					>
						{LOCALE_LABELS[locale] ?? locale}
					</button>
				{/each}
			</lang-row>

			{#if $session?.data?.user}
				<mobile-user class="flex items-center justify-between">
					<span class="text-sm font-semibold text-ink">{$session.data.user.name}</span>
					<button
						onclick={() => { void signOut(); mobileOpen = false; }}
						class="cursor-pointer border-0 bg-transparent p-0 text-sm font-semibold text-terracotta-ink"
					>
						{m.nav_sign_out()}
					</button>
				</mobile-user>
			{:else}
				<mobile-auth-links class="flex gap-3">
					<a
						href={resolve('/sign-in')}
						onclick={() => (mobileOpen = false)}
						class="btn-secondary kraft-radius-sm flex-1 py-2.5 text-center text-base no-underline"
					>
						{m.nav_sign_in()}
					</a>
					<a
						href={resolve('/sign-up')}
						onclick={() => (mobileOpen = false)}
						class="btn-primary kraft-radius-sm flex-1 py-2.5 text-center text-base no-underline"
					>
						{m.nav_sign_up()}
					</a>
				</mobile-auth-links>
			{/if}
		</mobile-auth>
	</mobile-menu>
{/if}

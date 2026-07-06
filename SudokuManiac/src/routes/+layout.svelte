<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import { locales, localizeHref, getLocale, setLocale } from '$lib/paraglide/runtime';
	import { createAuthClient } from 'better-auth/svelte';
	import Header from './Header.svelte';
	import './layout.css';

	let { children } = $props();

	const client = createAuthClient();
	const session = client.useSession();

	// Full-screen Kraft views render their own in-page top bar (KraftTopBar) and
	// hide the global Header / footer chrome.
	const FULLSCREEN_ROUTES = new Set([
		'/',
		'/profile/[id]',
		'/leaderboard',
		'/sudoku/competitive',
		'/sudoku/custom'
	]);
	const fullScreen = $derived(FULLSCREEN_ROUTES.has(page.route.id ?? ''));

	const MERGE_KEY = 'sudoku_guest_merged';

	// When a user signs in, merge any guest progress to the server (once).
	$effect(() => {
		const user = $session?.data?.user;
		if (!user) return;
		if (localStorage.getItem(MERGE_KEY) === user.id) return;
		const raw = localStorage.getItem('sudoku_guest_stats');
		if (!raw) return;
		// Fire-and-forget; mark as merged immediately to avoid duplicates
		localStorage.setItem(MERGE_KEY, user.id);
		fetch('/api/sudoku/merge-guest', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: raw
		}).then((res) => {
			if (res.ok) localStorage.removeItem('sudoku_guest_stats');
			else localStorage.removeItem(MERGE_KEY); // retry next visit
		});
	});

	// ?lang= URL parameter — apply locale and remove param from URL.
	$effect(() => {
		const langParam = page.url.searchParams.get('lang');
		if (!langParam) return;
		if ((locales as readonly string[]).includes(langParam)) {
			if (langParam !== getLocale()) {
				setLocale(langParam as (typeof locales)[number]);
			}
			const url = new URL(page.url);
			url.searchParams.delete('lang');
			replaceState(url, {});
		}
	});

	// First-visit locale auto-detection from browser language preference.
	$effect(() => {
		const hasCookie = document.cookie.split(';').some((c) => c.trim().startsWith('PARAGLIDE_LOCALE='));
		if (hasCookie) return;
		const preferred = navigator.language?.split('-')[0];
		if (preferred && preferred !== getLocale() && (locales as readonly string[]).includes(preferred)) {
			setLocale(preferred as typeof locales[number]);
		}
	});
</script>

<nerd-den-app class="flex min-h-screen flex-col">
	{#if fullScreen}
		{@render children()}
	{:else}
		<Header />
		<main class="m-auto my-0 box-border flex w-full max-w-5xl flex-1 flex-col p-4">
			{@render children()}
		</main>

		<footer class="flex flex-col items-center justify-center p-3 sm:px-0">
			<p class="text-sm text-muted">
				Made with ❤️ on <a class="font-bold text-navy" href="https://svelte.dev">Svelte</a>
			</p>
		</footer>
	{/if}
</nerd-den-app>

<div style="display:none">
	{#each locales as locale (locale)}
		<a href={resolve(localizeHref(page.url.pathname, { locale }))}>{locale}</a>
	{/each}
</div>

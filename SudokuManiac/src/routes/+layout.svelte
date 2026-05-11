<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { locales, localizeHref } from '$lib/paraglide/runtime';
	import { createAuthClient } from 'better-auth/svelte';
	import Header from './Header.svelte';
	import './layout.css';

	let { children } = $props();

	const client = createAuthClient();
	const session = client.useSession();

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
</script>

<nerd-den-app class="flex min-h-screen flex-col">
	<Header />
	<main class="m-auto my-0 box-border flex w-full max-w-5xl flex-1 flex-col p-4">
		{@render children()}
	</main>

	<footer class="flex flex-col items-center justify-center p-3 sm:px-0">
		<p class="text-sm text-gray-500">
			Made with ❤️ by <a class="font-bold" href="https://svelte.dev">Svelte</a>
		</p>
	</footer>
</nerd-den-app>

<div style="display:none">
	{#each locales as locale (locale)}
		<a href={resolve(localizeHref(page.url.pathname, { locale }))}>{locale}</a>
	{/each}
</div>

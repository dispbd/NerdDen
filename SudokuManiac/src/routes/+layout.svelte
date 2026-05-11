<script lang="ts">
	import type { Pathname } from '$app/types';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { locales, localizeHref } from '$lib/paraglide/runtime';
	import Header from './Header.svelte';
	import './layout.css';

	let { children } = $props();
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
		<a href={resolve(localizeHref(page.url.pathname, { locale }) as Pathname)}>{locale}</a>
	{/each}
</div>

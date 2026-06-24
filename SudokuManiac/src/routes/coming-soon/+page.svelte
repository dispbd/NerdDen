<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { resolve } from '$app/paths';
</script>

<svelte:head>
	<title>NerdDen</title>
</svelte:head>

<coming-soon-page class="flex min-h-[70vh] flex-col items-center justify-center gap-8 px-4 py-24 text-center">
	<coming-icon class="text-7xl select-none">🚧</coming-icon>

	<coming-text class="flex flex-col gap-3">
		<h1 class="m-0 text-4xl tracking-tight">{m.coming_soon_title()}</h1>
		<p class="m-0 max-w-md text-lg text-ink-soft">
			{m.coming_soon_body()}
		</p>
	</coming-text>

	<a
		href={resolve('/')}
		class="btn-primary kraft-radius inline-flex items-center gap-2 px-6 py-3 text-xl no-underline"
	>
		{m.coming_soon_back()}
	</a>
</coming-soon-page>

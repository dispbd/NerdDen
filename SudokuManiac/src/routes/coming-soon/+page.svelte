<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { resolve } from '$app/paths';
</script>

<svelte:head>
	<title>NerdDen</title>
</svelte:head>

<coming-soon-page class="flex flex-col items-center justify-center gap-8 px-4 py-24 text-center">
	<coming-icon class="text-7xl select-none">🚧</coming-icon>

	<coming-text class="flex flex-col gap-3">
		<h1 class="text-4xl font-extrabold tracking-tight m-0">{m.coming_soon_title()}</h1>
		<p class="text-lg text-gray-500 m-0 max-w-md">
			{m.coming_soon_body()}
		</p>
	</coming-text>

	<a
		href={resolve('/')}
		class="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors no-underline"
	>
		{m.coming_soon_back()}
	</a>
</coming-soon-page>

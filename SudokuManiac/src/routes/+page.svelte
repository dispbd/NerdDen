<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { resolve } from '$app/paths';
</script>

<svelte:head>
	<title>NerdDen</title>
	<meta name="description" content="NerdDen — a multi-game platform" />
</svelte:head>

<home-page class="flex flex-col items-center justify-center gap-10 px-4 py-16">
	<home-hero class="flex flex-col items-center gap-3 text-center">
		<img src="/sudoku-maniac.webp" alt="" class="size-20" style="image-rendering:pixelated" />
		<h1 class="m-0 text-5xl font-bold tracking-tight">NerdDen</h1>
		<p class="m-0 text-xl text-ink-soft">{m.home_tagline()}</p>
	</home-hero>

	<games-grid class="grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
		<a
			href={resolve('/sudoku')}
			class="card-kraft kraft-radius flex flex-col gap-2 p-6 no-underline transition-transform hover:-translate-y-0.5"
		>
			<span class="text-4xl">🧩</span>
			<game-card-title class="block font-display text-xl font-bold text-ink">SudokuManiac</game-card-title>
			<p class="m-0 text-sm text-ink-soft">{m.home_sudoku_desc()}</p>
		</a>

		<a
			href={resolve('/coming-soon')}
			class="flex flex-col gap-2 rounded-[16px] border-[1.5px] border-dashed border-[#b6a98c] bg-[#efe7d6] p-6 no-underline opacity-80 transition-opacity hover:opacity-100"
		>
			<span class="text-4xl">🔤</span>
			<game-card-title class="block font-display text-xl font-bold text-muted">{m.nav_crosswords()}</game-card-title>
			<wip-badge
				class="inline-flex w-fit items-center gap-1 rounded-full border border-[rgba(194,154,69,.5)] bg-[rgba(194,154,69,.18)] px-2 py-0.5 text-xs font-semibold text-mustard"
			>
				{m.home_wip_badge()}
			</wip-badge>
		</a>

		<a
			href={resolve('/coming-soon')}
			class="flex flex-col gap-2 rounded-[16px] border-[1.5px] border-dashed border-[#b6a98c] bg-[#efe7d6] p-6 no-underline opacity-80 transition-opacity hover:opacity-100"
		>
			<span class="text-4xl">🎩</span>
			<game-card-title class="block font-display text-xl font-bold text-muted">{m.nav_hat_alias()}</game-card-title>
			<wip-badge
				class="inline-flex w-fit items-center gap-1 rounded-full border border-[rgba(194,154,69,.5)] bg-[rgba(194,154,69,.18)] px-2 py-0.5 text-xs font-semibold text-mustard"
			>
				{m.home_wip_badge()}
			</wip-badge>
		</a>
	</games-grid>
</home-page>

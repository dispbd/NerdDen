<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	const NAV_LINKS = [
		{ href: resolve('/'), label: 'Home' },
		{ href: resolve('/sudoku'), label: 'Sudoku' }
	] as const;
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
</header>


<svelte:head>
	<title>NerdDen</title>
	<meta name="description" content="NerdDen — a multi-game platform" />
</svelte:head>

<home-page class="flex flex-col items-center justify-center gap-10 px-4 py-16">
	<home-hero class="flex flex-col items-center gap-3 text-center">
		<h1 class="text-5xl font-extrabold tracking-tight m-0">NerdDen</h1>
		<p class="text-xl text-gray-500 m-0">A multi-game platform for nerds</p>
	</home-hero>

	<games-grid class="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-xl">
		<a
			href="/sudoku"
			class="flex flex-col gap-2 p-6 rounded-2xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors no-underline"
		>
			<span class="text-4xl">🧩</span>
			<game-card-title class="block text-xl font-bold text-blue-800">SudokuManiac</game-card-title>
			<p class="text-sm text-blue-600 m-0">Classic 9×9 Sudoku with multiple difficulties</p>
		</a>

		<game-card class="flex flex-col gap-2 p-6 rounded-2xl border-2 border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed">
			<span class="text-4xl">🔤</span>
			<game-card-title class="block text-xl font-bold text-gray-500">Crosswords</game-card-title>
			<p class="text-sm text-gray-400 m-0">Coming soon</p>
		</game-card>
	</games-grid>
</home-page>

<script lang="ts">
	/**
	 * Story harness: the board plus a client-side stand-in for the server's play rules
	 * (src/lib/server/games/nonogram/play.ts), so the board can be played in Storybook.
	 */
	import NonogramBoard from '$lib/components/nonogram/NonogramBoard.svelte';
	import { computeClues } from '$lib/games/nonogram/solver';
	import type { Tool } from '$lib/games/nonogram/board';
	import {
		cellKey,
		type NonogramMove,
		type PlayerGrid,
		type Reveal
	} from '$lib/games/nonogram/types';

	interface Props {
		/** Picture rows, '#' filled */
		picture: string[];
		reveals?: Reveal[];
		color?: string;
	}

	let { picture, reveals = [], color = '#3E5C76' }: Props = $props();

	const solution = $derived(picture.map((row) => [...row].map((c) => (c === '#' ? 1 : 0))));
	const clues = $derived(computeClues(solution));

	let grid = $state<PlayerGrid>({});
	let tool = $state<Tool>('fill');
	let mistakes = $state(0);
	let solved = $state(false);
	let log = $state<string[]>([]);
	let boardRef: ReturnType<typeof NonogramBoard> | undefined = $state();

	function paint(m: NonogramMove) {
		const k = cellKey(m.x, m.y);
		if (m.action === 'fill') {
			if (solution[m.y][m.x]) grid[k] = 'filled';
			else {
				grid[k] = 'marked';
				mistakes++;
				boardRef?.flashWrong([m]);
			}
		} else if (m.action === 'mark') grid[k] = 'marked';
		else delete grid[k];
		log = [`${m.action} ${m.x},${m.y}`, ...log].slice(0, 6);
	}

	function strokeEnd() {
		const given = new Set(
			reveals.filter((r) => r.state === 'filled').map((r) => cellKey(r.x, r.y))
		);
		const done = solution.every((row, y) =>
			row.every((v, x) => !v || grid[cellKey(x, y)] === 'filled' || given.has(cellKey(x, y)))
		);
		if (done && !solved) {
			solved = true;
			boardRef?.revealPicture(color);
		}
	}

	function hint() {
		for (let y = 0; y < solution.length; y++) {
			for (let x = 0; x < solution.length; x++) {
				if (solution[y][x] && grid[cellKey(x, y)] !== 'filled') {
					grid[cellKey(x, y)] = 'filled';
					boardRef?.flashHint({ x, y });
					strokeEnd();
					return;
				}
			}
		}
	}
</script>

<svelte:head>
	<!-- Storybook doesn't load app.html, so bring the app's clue font along. -->
	<link
		rel="stylesheet"
		href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;700&display=swap"
	/>
</svelte:head>

<div
	style="display: grid; gap: 12px; max-width: 640px; padding: 16px; font-family: 'Hanken Grotesk', sans-serif"
>
	<div style="display: flex; gap: 8px; align-items: center">
		<button onclick={() => (tool = 'fill')} aria-pressed={tool === 'fill'}>Fill</button>
		<button onclick={() => (tool = 'mark')} aria-pressed={tool === 'mark'}>Mark ✕</button>
		<button onclick={hint}>Hint</button>
		<span>Mistakes {mistakes}/3 {solved ? '· solved' : ''}</span>
	</div>
	<NonogramBoard
		bind:this={boardRef}
		rowClues={clues.rowClues}
		colClues={clues.colClues}
		{reveals}
		playerGrid={grid}
		{tool}
		readonly={solved}
		label="Nonogram board"
		onpaint={paint}
		onstrokeend={strokeEnd}
	/>
	<small>{log.join(' · ')}</small>
</div>

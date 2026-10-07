<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import NonogramPlayground from './NonogramPlayground.svelte';

	const heart = ['.#.#.', '#####', '#####', '.###.', '..#..'];

	// The mockup's sailing boat.
	const boat = [
		'.....#....',
		'.....##...',
		'.....#.#..',
		'.....#..#.',
		'..########',
		'..########',
		'...######.',
		'.....##...',
		'.########.',
		'..######..'
	];

	const cat = [
		'..#.......#....',
		'..##.....##....',
		'..#########....',
		'..#.##.##.#....',
		'..#########....',
		'...#..#..#.....',
		'....#####......',
		'....######.....',
		'...########....',
		'...#########...',
		'..##########...',
		'..###########..',
		'..###########.#',
		'...#########.##',
		'....##..###.##.'
	];

	const { Story } = defineMeta({
		title: 'Nonogram/NonogramBoard',
		component: NonogramPlayground,
		parameters: { layout: 'fullscreen' },
		args: { picture: boat, reveals: [], color: '#3E5C76' }
	});
</script>

<!-- Drag to paint a run; right-click marks. Fills off the picture cost a mistake. -->
<Story name="10×10 boat" exportName="Boat10" args={{ picture: boat }} />

<Story
	name="5×5 heart, with reveals"
	exportName="Heart5"
	args={{
		picture: heart,
		color: '#B5462E',
		reveals: [
			{ x: 2, y: 4, state: 'filled' },
			{ x: 0, y: 0, state: 'empty' }
		]
	}}
/>

<Story name="15×15 cat" exportName="Cat15" args={{ picture: cat, color: '#C29A45' }} />

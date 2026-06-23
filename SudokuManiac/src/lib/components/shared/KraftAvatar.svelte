<!--
  Kraft avatar — square rounded surface-2 box with an ink border. Shows the user
  image, the platform mascot, or the name's initial (Caveat). Used in profile,
  leaderboard, online duel.
-->
<script lang="ts">
	let {
		name = '',
		image = null,
		size = 44,
		radius,
		letterColor = 'var(--color-ink)',
		mascot = false,
		class: cls = ''
	}: {
		name?: string;
		image?: string | null;
		size?: number;
		radius?: number;
		letterColor?: string;
		mascot?: boolean;
		class?: string;
	} = $props();

	const r = $derived(radius ?? Math.round(size * 0.22));
	const initial = $derived(name.trim().charAt(0).toUpperCase() || '?');
</script>

<span
	class="inline-flex flex-none items-center justify-center overflow-hidden border-[1.5px] border-ink bg-surface-2 {cls}"
	style="width:{size}px;height:{size}px;border-radius:{r}px"
>
	{#if image}
		<img src={image} alt={name} class="size-full object-cover" />
	{:else if mascot}
		<img
			src="/sudoku-maniac.webp"
			alt={name}
			style="width:{Math.round(size * 0.76)}px;height:{Math.round(size * 0.76)}px;image-rendering:pixelated"
		/>
	{:else}
		<span class="font-hand font-bold" style="font-size:{Math.round(size * 0.46)}px;color:{letterColor}"
			>{initial}</span
		>
	{/if}
</span>

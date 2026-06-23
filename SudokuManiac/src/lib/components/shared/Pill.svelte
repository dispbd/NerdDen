<!--
  Kraft pill — status / difficulty / level badge. `soft` = tinted; `solid` = filled
  accent with ink border. Accent color via the `accent` prop (any CSS color).
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		variant = 'soft',
		accent = 'var(--color-terracotta)',
		class: cls = '',
		children
	}: {
		variant?: 'soft' | 'solid';
		accent?: string;
		class?: string;
		children: Snippet;
	} = $props();
</script>

<span class="pill {variant === 'solid' ? 'pill-solid' : 'pill-soft'} {cls}" style="--pill-accent:{accent}">
	{@render children()}
</span>

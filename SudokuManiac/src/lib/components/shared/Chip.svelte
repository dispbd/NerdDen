<!--
  Selection chip — one-of-many toggle (difficulty / size / period / board size).
  Active = accent fill + offset shadow; inactive = transparent with ink border.
  Caveat label. Accent color via the `accent` prop.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		active = false,
		accent = 'var(--color-terracotta)',
		disabled = false,
		onclick,
		class: cls = '',
		children
	}: {
		active?: boolean;
		accent?: string;
		disabled?: boolean;
		onclick?: () => void;
		class?: string;
		children: Snippet;
	} = $props();
</script>

<button
	class="chip {active ? 'chip-active' : ''} {cls}"
	style="--chip-accent:{accent}"
	{disabled}
	{onclick}
>
	{@render children()}
</button>

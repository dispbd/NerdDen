<!--
  Progress / XP bar — ink-bordered track with an accent fill. Used on the profile
  XP bar and the online-duel race bars.
-->
<script lang="ts">
	let {
		ratio = 0,
		color = 'var(--color-terracotta)',
		height = 12,
		class: cls = ''
	}: {
		ratio?: number;
		color?: string;
		height?: number;
		class?: string;
	} = $props();

	const pct = $derived(Math.round(Math.min(1, Math.max(0, ratio)) * 100));
</script>

<div
	class="overflow-hidden rounded-full border-[1.5px] border-ink bg-track {cls}"
	style="height:{height}px"
>
	<div class="h-full transition-[width]" style="width:{pct}%;background:{color}"></div>
</div>

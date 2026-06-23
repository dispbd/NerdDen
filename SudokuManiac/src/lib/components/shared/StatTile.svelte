<!--
  Stat tile — Kraft card with a big Caveat value and a muted caption.
  Used on the profile and the lobby mini-stats.
-->
<script lang="ts">
	let {
		value,
		label,
		color = 'var(--color-ink)',
		radius = '14px 11px 13px 12px',
		valueSize = 34
	}: {
		value: string | number;
		label: string;
		color?: string;
		radius?: string;
		valueSize?: number;
	} = $props();
</script>

<div class="card-kraft p-4" style="border-radius:{radius}">
	<div class="font-hand font-bold leading-[.85]" style="font-size:{valueSize}px;color:{color}">{value}</div>
	<div class="mt-1.5 text-[11px] font-medium text-muted">{label}</div>
</div>

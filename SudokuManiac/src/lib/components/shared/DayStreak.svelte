<!--
  Day-streak card — dark ink panel with 7 weekday cells. Closed days = terracotta
  with a check; future/open days = dashed outline. Lobby right rail.
-->
<script lang="ts">
	let {
		days = [],
		labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
		count = 0,
		title = 'Day streak',
		class: cls = ''
	}: {
		days?: boolean[];
		labels?: string[];
		count?: number;
		title?: string;
		class?: string;
	} = $props();
</script>

<div class="rounded-[16px] bg-ink p-4 {cls}">
	<div class="mb-3 flex items-center justify-between">
		<span class="text-[11px] font-semibold tracking-[.12em] text-[#b3a890] uppercase">{title}</span>
		<span class="font-hand text-2xl leading-none font-bold text-terracotta">{count}</span>
	</div>
	<div class="flex justify-between gap-1">
		{#each labels as lb, i (i)}
			<div class="flex flex-col items-center gap-1">
				<span
					class="flex size-7 items-center justify-center rounded-[8px] text-xs font-semibold
						{days[i]
						? 'bg-terracotta text-surface-2'
						: 'border border-dashed border-[#5a5042] text-[#7a7060]'}"
				>
					{days[i] ? '✓' : ''}
				</span>
				<span class="text-[9px] text-[#8a8170]">{lb}</span>
			</div>
		{/each}
	</div>
</div>

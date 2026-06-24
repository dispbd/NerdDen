<!--
  Kraft toggle — pill switch. On = forest + knob right; off = track + knob left.
-->
<script lang="ts">
	let {
		on = false,
		onclick,
		label = ''
	}: {
		on?: boolean;
		onclick?: () => void;
		label?: string;
	} = $props();
</script>

<button
	{onclick}
	class="relative flex-none rounded-full border-[1.5px] border-ink transition-colors"
	style="width:46px;height:26px;background:{on ? 'var(--color-forest)' : 'var(--color-track)'}"
	role="switch"
	aria-checked={on}
	aria-label={label}
>
	<span
		class="absolute top-px size-[21px] rounded-full border-[1.5px] border-ink bg-surface-2 transition-[left,right]"
		style={on ? 'right:2px' : 'left:2px'}
	></span>
</button>

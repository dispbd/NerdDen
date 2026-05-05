<!--
  GameTimer: counts elapsed seconds, exposes start/stop/reset.
-->
<script lang="ts">
	interface Props {
		running?: boolean;
	}

	let { running = true }: Props = $props();

	let seconds = $state(0);
	let interval: ReturnType<typeof setInterval> | null = null;

	$effect(() => {
		if (running) {
			interval = setInterval(() => seconds++, 1000);
		} else {
			if (interval) clearInterval(interval);
		}
		return () => {
			if (interval) clearInterval(interval);
		};
	});

	export function reset() {
		seconds = 0;
	}

	function pad(n: number) {
		return String(n).padStart(2, '0');
	}

	const display = $derived(
		`${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`
	);
</script>

<time
	class="tabular-nums text-2xl font-bold tracking-wide"
	aria-label="Elapsed time"
	datetime={display}
>{display}</time>

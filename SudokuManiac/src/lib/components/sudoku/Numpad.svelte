<!--
  Numpad component: digits 1-9 + Erase button.
-->
<script lang="ts">
	interface Props {
		onDigit: (n: number) => void;
	}

	let { onDigit }: Props = $props();
</script>

<div class="numpad">
	{#each [1, 2, 3, 4, 5, 6, 7, 8, 9] as n (n)}
		<button class="num-btn" onclick={() => onDigit(n)}>{n}</button>
	{/each}
	<button class="num-btn erase-btn" onclick={() => onDigit(0)}>✕</button>
</div>

<style>
	.numpad {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 0.4rem;
	}

	.num-btn {
		aspect-ratio: 1;
		font-size: 1.25rem;
		font-weight: 600;
		border-radius: 0.5rem;
		background: var(--color-bg-2, #f0f4ff);
		border: 1.5px solid var(--color-border, #b0b8cc);
		cursor: pointer;
		transition: background 0.1s;
	}

	.num-btn:hover {
		background: var(--color-accent-light, #bbd6fb);
	}

	.erase-btn {
		grid-column: span 1;
		color: #dc2626;
		border-color: #fca5a5;
		background: #fff5f5;
	}

	.erase-btn:hover {
		background: #fee2e2;
	}
</style>

<!--
  Numpad component: digits 1-9 + Erase button.
-->
<script lang="ts">
	interface Props {
		onDigit: (n: number) => void;
	}

	let { onDigit }: Props = $props();
</script>

<num-pad class="grid grid-cols-5 gap-1.5">
	{#each [1, 2, 3, 4, 5, 6, 7, 8, 9] as n (n)}
		<button
			class="aspect-square text-xl font-semibold rounded-lg bg-blue-50 border border-gray-300 cursor-pointer transition-colors hover:bg-blue-200"
			onclick={() => onDigit(n)}
		>{n}</button>
	{/each}
	<button
		class="aspect-square text-xl font-semibold rounded-lg bg-red-50 border border-red-300 text-red-600 cursor-pointer transition-colors hover:bg-red-100"
		onclick={() => onDigit(0)}
	>✕</button>
</num-pad>

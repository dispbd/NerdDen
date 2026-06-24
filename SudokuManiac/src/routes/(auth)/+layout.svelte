<!--
  Minimal layout for auth pages: centered card, no header nav.
-->
<script lang="ts">
	let { children } = $props();
</script>

<auth-shell class="flex min-h-screen items-center justify-center bg-paper p-4">
	<auth-card class="card-kraft kraft-radius flex w-full max-w-sm flex-col gap-6 p-8 shadow-float">
		<a href="/" class="flex items-center gap-2 self-center no-underline">
			<img src="/sudoku-maniac.webp" alt="" class="size-8" style="image-rendering:pixelated" />
			<span class="font-display text-2xl font-bold text-ink">NerdDen</span>
		</a>
		{@render children()}
	</auth-card>
</auth-shell>

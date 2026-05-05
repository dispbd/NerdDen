<!--
  Minimal layout for auth pages: centered card, no header nav.
-->
<script lang="ts">
	let { children } = $props();
</script>

<auth-shell class="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-blue-50 p-4">
	<auth-card class="flex flex-col gap-6 w-full max-w-sm bg-white rounded-2xl shadow-xl p-8">
		<a href="/" class="flex items-center gap-2 self-center no-underline">
			<span class="text-2xl font-extrabold tracking-tight text-blue-700">NerdDen</span>
		</a>
		{@render children()}
	</auth-card>
</auth-shell>

## Project Configuration

- **Language**: TypeScript
- **Package Manager**: bun
- **Add-ons**: prettier, eslint, vitest, playwright, tailwindcss, drizzle, better-auth, paraglide, storybook, mcp

---

## Coding Conventions

### 1. Custom HTML Tags Instead of Generic Elements

**Never** use `<div>`, `<span>`, or `<p>` as structural containers with a class name when a more meaningful tag can be used.

**Rules:**
- Use semantic HTML elements where they fit: `<header>`, `<main>`, `<section>`, `<footer>`, `<article>`, `<nav>`, `<aside>`, `<time>`, `<figure>`, `<fieldset>`, etc.
- For all other structural containers, use **custom elements with hyphenated names** that describe the role, e.g. `<game-header>`, `<board-wrap>`, `<difficulty-grid>`, `<lobby-actions>`.
- Custom elements default to `display: inline` — always add a Tailwind display utility (`block`, `flex`, `grid`, `inline-flex`, etc.) to them.
- For reusable UI primitives (button variants, input wrappers), create **Svelte component wrappers** with a meaningful name and place them in `src/lib/components/shared/` (e.g. `Button.svelte`, `IconButton.svelte`).

```svelte
<!-- ❌ Bad -->
<div class="game-header">...</div>

<!-- ✅ Good — semantic element -->
<header class="flex justify-between ...">...</header>

<!-- ✅ Good — custom element when no semantic tag fits -->
<game-header class="flex justify-between ...">...</game-header>
```

### 2. TailwindCSS for Styling

- Use **TailwindCSS utility classes** for all component styling. Avoid `<style>` blocks inside Svelte components where Tailwind can replace them.
- Only use internal `<style>` blocks when Tailwind cannot express the style (e.g. complex CSS variables, PixiJS rendering, `::before`/`::after` pseudo-elements with dynamic content, or third-party library overrides).
- Dynamic classes should use string interpolation or ternary expressions directly in the `class` attribute — do **not** create separate CSS rules for interactive states that Tailwind already covers (`hover:`, `focus:`, `active:`, `aria-*:`, `data-*:`).
- TailwindCSS v4 is configured via `@import 'tailwindcss'` in `src/routes/layout.css` — no `tailwind.config.*` file is needed.

```svelte
<!-- ❌ Bad — internal style block for basic styling -->
<button class="diff-btn" class:selected>Easy</button>
<style>
  .diff-btn { padding: 0.5rem; border-radius: 0.5rem; ... }
  .diff-btn.selected { border-color: blue; ... }
</style>

<!-- ✅ Good — Tailwind inline -->
<button class="px-2 py-2 rounded-lg border-2 font-semibold
  {selected ? 'border-blue-600 bg-blue-100 text-blue-700' : 'border-transparent bg-blue-50 hover:bg-blue-100'}">
  Easy
</button>
```

### 3. Git Branching Strategy

- `main` — stable releases only
- `dev` — integration branch; all feature and fix branches merge here
- `phase-N-*` — one branch per development phase (e.g. `phase-1-sudoku-mvp`)
- `fix/*` — bug fixes and non-phase improvements

**Commit after every completed checklist item.** Commit messages follow Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `chore:`, `docs:`).

---

---

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available Svelte MCP Tools:

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

### 4. playground-link

Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.

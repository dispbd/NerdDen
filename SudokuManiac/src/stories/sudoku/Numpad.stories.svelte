<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import Numpad from '$lib/components/sudoku/Numpad.svelte';
  import { fn } from 'storybook/test';

  const { Story } = defineMeta({
    title: 'Sudoku/Numpad',
    component: Numpad,
    tags: ['autodocs'],
    args: {
      onDigit: fn(),
    },
  });
</script>

<Story name="Default" />

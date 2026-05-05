<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import GameTimer from '$lib/components/sudoku/GameTimer.svelte';

  const { Story } = defineMeta({
    title: 'Sudoku/GameTimer',
    component: GameTimer,
    tags: ['autodocs'],
    argTypes: {
      running: { control: 'boolean' },
    },
  });
</script>

<Story name="Running" args={{ running: true }} />

<Story name="Paused" args={{ running: false }} />

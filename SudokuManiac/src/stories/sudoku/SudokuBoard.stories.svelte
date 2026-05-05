<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import SudokuBoardComponent from '$lib/components/sudoku/SudokuBoard.svelte';
  import { generatePuzzle } from '$lib/server/games/sudoku/generator.js';

  const beginner = generatePuzzle('beginner');
  const medium = generatePuzzle('medium');
  const hard = generatePuzzle('hard');

  const { Story } = defineMeta({
    title: 'Sudoku/SudokuBoard',
    component: SudokuBoardComponent,
    tags: ['autodocs'],
    argTypes: {
      theme: {
        control: { type: 'radio' },
        options: ['light', 'dark'],
      },
      size: { control: { type: 'range', min: 300, max: 600, step: 10 } },
    },
    args: {
      puzzle: beginner.puzzle,
      solution: beginner.solution,
      theme: 'light',
      size: 450,
    },
  });
</script>

<!-- Beginner puzzle — many filled cells -->
<Story
  name="Beginner / Light"
  args={{ puzzle: beginner.puzzle, solution: beginner.solution, theme: 'light' }}
/>

<!-- Medium puzzle -->
<Story
  name="Medium / Light"
  args={{ puzzle: medium.puzzle, solution: medium.solution, theme: 'light' }}
/>

<!-- Hard puzzle — dark theme -->
<Story
  name="Hard / Dark"
  args={{ puzzle: hard.puzzle, solution: hard.solution, theme: 'dark' }}
/>

<!-- Compact size -->
<Story
  name="Compact (300px)"
  args={{ puzzle: beginner.puzzle, solution: beginner.solution, theme: 'light', size: 300 }}
/>

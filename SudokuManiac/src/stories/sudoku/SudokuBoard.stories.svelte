<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import SudokuBoardComponent from '$lib/components/sudoku/SudokuBoard.svelte';

  // Static 9×9 puzzle fixtures (no server imports needed in browser)
  const beginner = {
    puzzle: [
      [5,3,0, 0,7,0, 0,0,0],
      [6,0,0, 1,9,5, 0,0,0],
      [0,9,8, 0,0,0, 0,6,0],
      [8,0,0, 0,6,0, 0,0,3],
      [4,0,0, 8,0,3, 0,0,1],
      [7,0,0, 0,2,0, 0,0,6],
      [0,6,0, 0,0,0, 2,8,0],
      [0,0,0, 4,1,9, 0,0,5],
      [0,0,0, 0,8,0, 0,7,9],
    ],
    solution: [
      [5,3,4, 6,7,8, 9,1,2],
      [6,7,2, 1,9,5, 3,4,8],
      [1,9,8, 3,4,2, 5,6,7],
      [8,5,9, 7,6,1, 4,2,3],
      [4,2,6, 8,5,3, 7,9,1],
      [7,1,3, 9,2,4, 8,5,6],
      [9,6,1, 5,3,7, 2,8,4],
      [2,8,7, 4,1,9, 6,3,5],
      [3,4,5, 2,8,6, 1,7,9],
    ],
  };

  const medium = {
    puzzle: [
      [0,0,0, 2,6,0, 7,0,1],
      [6,8,0, 0,7,0, 0,9,0],
      [1,9,0, 0,0,4, 5,0,0],
      [8,2,0, 1,0,0, 0,4,0],
      [0,0,4, 6,0,2, 9,0,0],
      [0,5,0, 0,0,3, 0,2,8],
      [0,0,9, 3,0,0, 0,7,4],
      [0,4,0, 0,5,0, 0,3,6],
      [7,0,3, 0,1,8, 0,0,0],
    ],
    solution: [
      [4,3,5, 2,6,9, 7,8,1],
      [6,8,2, 5,7,1, 4,9,3],
      [1,9,7, 8,3,4, 5,6,2],
      [8,2,6, 1,9,5, 3,4,7],
      [3,7,4, 6,8,2, 9,1,5],
      [9,5,1, 7,4,3, 6,2,8],
      [5,1,9, 3,2,6, 8,7,4],
      [2,4,8, 9,5,7, 1,3,6],
      [7,6,3, 4,1,8, 2,5,9],
    ],
  };

  const hard = {
    puzzle: [
      [0,0,0, 0,0,0, 0,0,0],
      [0,0,0, 0,0,3, 0,8,5],
      [0,0,1, 0,2,0, 0,0,0],
      [0,0,0, 5,0,7, 0,0,0],
      [0,0,4, 0,0,0, 1,0,0],
      [0,9,0, 0,0,0, 0,0,0],
      [5,0,0, 0,0,0, 0,7,3],
      [0,0,2, 0,1,0, 0,0,0],
      [0,0,0, 0,4,0, 0,0,9],
    ],
    solution: [
      [9,8,7, 6,5,4, 3,2,1],
      [2,4,6, 1,7,3, 9,8,5],
      [3,5,1, 9,2,8, 7,4,6],
      [1,2,8, 5,3,7, 6,9,4],
      [6,3,4, 8,9,2, 1,5,7],
      [7,9,5, 4,6,1, 8,3,2],
      [5,1,9, 2,8,6, 4,7,3],
      [4,7,2, 3,1,9, 5,6,8],
      [8,6,3, 7,4,5, 2,1,9],
    ],
  };

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

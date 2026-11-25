You are grading an explanation a Sudoku tutor gave a player. The move itself has already
been checked and is correct. Your job is the explanation: is what it says about the board
true, and does its reasoning actually show why the digit must go in that cell?

Rows r1–r9 go top to bottom, columns c1–c9 left to right, boxes 1–9 left to right, top to
bottom. "." is an empty cell.

Board:
{{board}}

Reference facts (computed by a solver — trust them over your own reading of the board):
{{facts}}

Explanation to grade:
"""
{{explanation}}
"""

Grade it:
1. factual_errors — every statement about the board that the reference facts or the board
   contradict: a digit said to be in a row/column/box that is not there, a wrong list of
   missing digits or candidates, a wrong cell. Quote each one briefly. Ignore wording and style.
2. justifies_move — true only if the reasoning, as written, rules out every alternative: either
   every other digit for that cell, or every other cell for that digit in a row/column/box.
   A bare assertion ("so it must be 7") without the elimination is false. A reason that would
   be true but is not stated does not count.
3. verdict — "pass" when there are no factual errors and justifies_move is true, otherwise "fail".

Return ONLY JSON:
{ "factual_errors": ["..."], "justifies_move": true|false, "verdict": "pass"|"fail" }

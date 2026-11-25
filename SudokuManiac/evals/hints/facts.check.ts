// Sanity check for facts.ts on board h01 (run: npx tsx evals/hints/facts.check.ts)
import { readFileSync } from 'node:fs';
import { referenceFacts, verifyClaim, claimsEstablishMove, type Claim } from './facts.ts';
import type { HintCase } from './types.ts';
const c = (JSON.parse(readFileSync('evals/datasets/hints.json', 'utf8')).cases as HintCase[])[0];
const g = c.playerGrid;
const claims: Claim[] = [
	{ type: 'present', unit: 'col', index: 6, digits: [2, 4, 1, 8, 3, 9, 5] },
	{ type: 'missing', unit: 'row', index: 3, digits: [1, 2, 7], exhaustive: true },
	{ type: 'candidates', row: 3, col: 6, digits: [7], exhaustive: true },
	{ type: 'only_place', unit: 'box', index: 1, digit: 1, row: 3, col: 1 }
];
const checks = claims.map((cl) => verifyClaim(g, cl));
for (const x of checks) console.log(x.ok, x.claim.type, x.why ?? '');
console.log('establishes r3c6=7:', claimsEstablishMove(g, { row: 3, col: 6, digit: 7 }, checks));
console.log('solution r3c6 =', c.solution[2][5]);
console.log(referenceFacts(g, { row: 3, col: 6, digit: 7 }).split('\n').slice(-5).join('\n'));

// Combination: row 1 lacks {7, 9} and 9 is excluded from r1c1 → 7 (the qwen hint on h01)
const combo = [
	{ type: 'missing', unit: 'row', index: 1, digits: [7, 9], exhaustive: true },
	{ type: 'excluded', row: 1, col: 1, digit: 9 }
] as Claim[];
console.log('establishes r1c1=7 by elimination:', claimsEstablishMove(g, { row: 1, col: 1, digit: 7 }, combo.map((cl) => verifyClaim(g, cl))));
console.log('does not establish r1c4=7:', !claimsEstablishMove(g, { row: 1, col: 4, digit: 7 }, combo.map((cl) => verifyClaim(g, cl))));

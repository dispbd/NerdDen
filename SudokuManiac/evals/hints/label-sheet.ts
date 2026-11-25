/**
 * Builds a blind labelling page for calibrating the explanation graders.
 *
 *   npx tsx evals/hints/label-sheet.ts <results.jsonl> [--dataset …] [--per-group 6] [--seed 1]
 *
 * Samples graded answers per model × prompt, half the judge passed and half it failed
 * where possible, and writes evals/calibration/hints-label.html. The page shows the board,
 * reference facts, the hint and the extracted move — never the graders' verdicts — and
 * exports the labels as JSON for calibrate.ts.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { referenceFacts } from './facts.ts';
import { V2Answer } from './score.ts';
import type { HintCase } from './types.ts';
import { parseJsonFromText } from '../../src/lib/server/ai/json.ts';

const { values: args, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		dataset: { type: 'string', default: 'evals/datasets/hints.json' },
		'per-group': { type: 'string', default: '6' },
		seed: { type: 'string', default: '1' },
		out: { type: 'string', default: 'evals/calibration/hints-label.html' }
	}
});
const files = positionals;
if (!files.length) throw new Error('usage: label-sheet.ts <results.jsonl> [more results…]');
const perGroup = Number(args['per-group']);

let s = Number(args.seed) >>> 0;
const rand = () => {
	s = (s + 0x6d2b79f5) >>> 0;
	let t = Math.imul(s ^ (s >>> 15), s | 1);
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const shuffle = <T>(a: T[]) => a.map((x) => [rand(), x] as const).sort((p, q) => p[0] - q[0]).map((p) => p[1]);

interface Item {
	id: string;
	caseId: string;
	prompt: string;
	model: string;
	board: number[][];
	move: { row: number; col: number; digit: number };
	explanation: string;
	facts: string;
}

const items: Item[] = [];
for (const file of files) {
	const datasetPath = file.includes('hard') ? 'evals/datasets/hints-hard.json' : args.dataset!;
	const cases = new Map((JSON.parse(readFileSync(datasetPath, 'utf8')).cases as HintCase[]).map((c) => [c.id, c]));
	const answers = new Map<string, any>();
	for (const l of readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
		const r = JSON.parse(l);
		answers.set(`${r.caseId}|${r.prompt}|${r.model}`, r);
	}
	const verdicts = new Map<string, string>();
	for (const l of readFileSync(file.replace(/\.jsonl$/, '.judge.jsonl'), 'utf8').split('\n').filter(Boolean)) {
		const j = JSON.parse(l);
		if (j.kind === 'judge' && j.verdict) verdicts.set(`${j.caseId}|${j.prompt}|${j.model}`, j.verdict.verdict);
	}
	const groups = new Map<string, { pass: string[]; fail: string[] }>();
	for (const [key, v] of verdicts) {
		const [, prompt, model] = key.split('|');
		const g = groups.get(`${model}|${prompt}`) ?? { pass: [], fail: [] };
		(v === 'pass' ? g.pass : g.fail).push(key);
		groups.set(`${model}|${prompt}`, g);
	}
	for (const g of groups.values()) {
		const pass = shuffle(g.pass);
		const fail = shuffle(g.fail);
		const half = Math.ceil(perGroup / 2);
		const pick = [...fail.slice(0, half), ...pass.slice(0, perGroup - Math.min(half, fail.length))].slice(0, perGroup);
		for (const key of pick) {
			const r = answers.get(key);
			const c = cases.get(r.caseId)!;
			const move = r.moves.find((m: Item['move']) => c.playerGrid[m.row - 1][m.col - 1] === 0);
			let explanation = r.text;
			if (r.prompt === 'v2') {
				const p = V2Answer.safeParse(parseJsonFromText(r.text));
				if (p.success) explanation = p.data.explanation;
			}
			items.push({
				id: key,
				caseId: r.caseId,
				prompt: r.prompt,
				model: r.model,
				board: c.playerGrid,
				move,
				explanation,
				facts: referenceFacts(c.playerGrid, move)
			});
		}
	}
}
// Shuffle, then give items opaque ids: the page must not reveal model or prompt, even in its
// source. The mapping goes to a separate key file that calibrate.ts reads.
const keyMap: Record<string, string> = {};
const sample = shuffle(items).map((it, i) => {
	const id = `L${String(i + 1).padStart(2, '0')}`;
	keyMap[id] = it.id;
	return { id, board: it.board, move: it.move, explanation: it.explanation, facts: it.facts };
});

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hint labels</title>
<style>
:root{--bg:#fbfaf7;--fg:#1d1d1b;--muted:#6b6a64;--line:#d9d6cc;--card:#fff;--hi:#ffe9a8;--ok:#2f7d4f;--bad:#b3412f}
@media (prefers-color-scheme:dark){:root{--bg:#161614;--fg:#ecebe6;--muted:#9a988f;--line:#3a3934;--card:#1f1f1c;--hi:#5b4a12;--ok:#5fbf86;--bad:#e07a66}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}
main{max-width:980px;margin:0 auto;padding:20px 16px 80px}
h1{font-size:20px;margin:0 0 4px}.muted{color:var(--muted)}
.bar{position:sticky;top:0;background:var(--bg);padding:10px 0;border-bottom:1px solid var(--line);display:flex;gap:12px;align-items:center;flex-wrap:wrap;z-index:1}
button{font:inherit;padding:6px 12px;border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:6px;cursor:pointer}
button.on.yes{background:var(--ok);color:#fff;border-color:var(--ok)}button.on.no{background:var(--bad);color:#fff;border-color:var(--bad)}
.item{display:grid;grid-template-columns:auto 1fr;gap:20px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin-top:16px}
@media (max-width:720px){.item{grid-template-columns:1fr}}
table.b{border-collapse:collapse;font:14px ui-monospace,monospace}table.b td{width:26px;height:26px;text-align:center;border:1px solid var(--line)}
table.b td.r3{border-bottom:2px solid var(--fg)}table.b td.c3{border-right:2px solid var(--fg)}table.b td.mv{background:var(--hi);font-weight:700}
table.b th{font-weight:400;color:var(--muted);font-size:11px}
blockquote{margin:8px 0;padding:8px 12px;border-left:3px solid var(--line);white-space:pre-wrap}
details pre{white-space:pre-wrap;font-size:12px;color:var(--muted)}
.q{display:flex;gap:8px;align-items:center;margin:6px 0;flex-wrap:wrap}.q span{flex:1 1 260px}
</style></head><body><main>
<h1>Hint explanation labels</h1>
<p class="muted">For each hint: the highlighted cell is the move read out of the hint (already checked correct, except Q1 asks whether it was read right). Use the reference facts — they are computed by a solver. Model and prompt are hidden on purpose.</p>
<div class="bar"><span id="progress"></span><button id="export">Export labels (JSON)</button><span class="muted">Save the file as evals/calibration/hints-labels.json</span></div>
<div id="list"></div>
</main>
<script>
const ITEMS = ${JSON.stringify(sample)};
const KEY = 'hint-labels-v2';
let labels = {};
try { labels = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(labels)); } catch {} render(); };
const QS = [
  ['moveRead', 'Q1. The highlighted move is the one the hint tells the player.'],
  ['factsTrue', 'Q2. Every statement the hint makes about the board is true.'],
  ['proves', 'Q3. The reasoning, as written, rules out the alternatives (not just asserts the digit).']
];
function board(it) {
  let h = '<table class="b"><tr><th></th>' + [1,2,3,4,5,6,7,8,9].map(c => '<th>c'+c+'</th>').join('') + '</tr>';
  it.board.forEach((row, r) => {
    h += '<tr><th>r'+(r+1)+'</th>' + row.map((v, c) => {
      const cls = [(r===2||r===5)?'r3':'', (c===2||c===5)?'c3':'', (r+1===it.move.row&&c+1===it.move.col)?'mv':''].join(' ');
      const txt = (r+1===it.move.row&&c+1===it.move.col) ? it.move.digit : (v || '');
      return '<td class="'+cls+'">'+txt+'</td>';
    }).join('') + '</tr>';
  });
  return h + '</table>';
}
function esc(s){return String(s).replace(/[&<>]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]));}
function render() {
  const list = document.getElementById('list');
  list.innerHTML = ITEMS.map((it, i) => {
    const l = labels[it.id] || {};
    const qs = QS.map(([k, q]) => '<div class="q"><span>'+q+'</span>' +
      ['yes','no'].map(v => '<button class="'+v+(l[k]===v?' on':'')+'" data-i="'+i+'" data-k="'+k+'" data-v="'+v+'">'+v+'</button>').join('') + '</div>').join('');
    return '<section class="item"><div>'+board(it)+'<div class="muted">#'+(i+1)+' · move r'+it.move.row+'c'+it.move.col+' = '+it.move.digit+'</div></div>' +
      '<div><blockquote>'+esc(it.explanation)+'</blockquote>'+qs+
      '<details><summary class="muted">Reference facts</summary><pre>'+esc(it.facts)+'</pre></details></div></section>';
  }).join('');
  const done = ITEMS.filter(it => QS.every(([k]) => (labels[it.id]||{})[k])).length;
  document.getElementById('progress').textContent = done + ' / ' + ITEMS.length + ' labelled';
}
document.addEventListener('click', e => {
  const b = e.target.closest('button[data-k]'); if (!b) return;
  const it = ITEMS[+b.dataset.i]; labels[it.id] = { ...(labels[it.id]||{}), [b.dataset.k]: b.dataset.v }; save();
});
document.getElementById('export').onclick = () => {
  const blob = new Blob([JSON.stringify(labels, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'hints-labels.json'; a.click();
};
render();
</script></body></html>`;

mkdirSync('evals/calibration', { recursive: true });
writeFileSync(args.out!, html);
writeFileSync(args.out!.replace(/\.html$/, '.key.json'), JSON.stringify(keyMap, null, 2) + '\n');
console.log(`${sample.length} items → ${args.out}`);

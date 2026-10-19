import { predict, randomInt, Tracer } from '../tools';
import type { Program } from '../types';
import { graphView, NAMES, type Edge } from './graphs';

// D27 "Topological sort" (Kahn's method): repeatedly do a task nothing is waiting on.

export interface DagInput {
  n: number;
  /** from must happen before to */
  edges: Edge[];
}

const code = [
  'def topo(nodes, edges):',
  '    indeg = count_incoming(edges)',
  '    q = deque(v for v in nodes',
  '              if indeg[v] == 0)',
  '    order = []',
  '    while q:',
  '        v = q.popleft()',
  '        order.append(v)',
  '        for w in after[v]:',
  '            indeg[w] -= 1',
  '            if indeg[w] == 0:',
  '                q.append(w)',
  '    return order',
];

export function kahn(n: number, edges: Edge[]): string[] {
  const names = NAMES.slice(0, n);
  const indeg = new Map(names.map((x) => [x, 0]));
  for (const e of edges) indeg.set(e.to, indeg.get(e.to)! + 1);
  const q = names.filter((x) => indeg.get(x) === 0);
  const order: string[] = [];
  while (q.length) {
    const v = q.shift()!;
    order.push(v);
    for (const e of edges.filter((e) => e.from === v).sort((a, b) => a.to.localeCompare(b.to))) {
      indeg.set(e.to, indeg.get(e.to)! - 1);
      if (indeg.get(e.to) === 0) q.push(e.to);
    }
  }
  return order;
}

/** A random DAG: edges only go from an earlier letter to a later one, so there is no cycle. */
export function randomDag(random: () => number, n: number): Edge[] {
  const names = NAMES.slice(0, n);
  const edges: Edge[] = [];
  for (let j = 1; j < n; j++) {
    // Each later task depends on one or two earlier ones nearby, so the picture stays readable.
    const from = Math.max(0, j - 1 - Math.floor(random() * 2));
    edges.push({ from: names[from]!, to: names[j]! });
    if (j >= 2 && random() < 0.35) edges.push({ from: names[j - 2]!, to: names[j]! });
  }
  return edges.filter((e, i) => edges.findIndex((x) => x.from === e.from && x.to === e.to) === i);
}

export const topoSort: Program<DagInput> = {
  id: 'topo-sort',
  code,
  defaultInput: {
    n: 6,
    edges: [
      { from: 'A', to: 'B' },
      { from: 'A', to: 'C' },
      { from: 'B', to: 'D' },
      { from: 'C', to: 'D' },
      { from: 'D', to: 'E' },
      { from: 'C', to: 'F' },
    ],
  },
  randomInput: (r) => {
    const n = randomInt(r, 5, 7);
    return { n, edges: randomDag(r, n) };
  },
  describe: ({ edges }) => `tasks with "must come first" arrows: ${edges.map((e) => `${e.from}→${e.to}`).join(', ')}`,
  reference: ({ n, edges }) => kahn(n, edges),
  run({ n, edges }) {
    const t = new Tracer();
    const names = NAMES.slice(0, n);
    const indeg = new Map(names.map((x) => [x, 0]));
    for (const e of edges) indeg.set(e.to, indeg.get(e.to)! + 1);
    const order: string[] = [];
    const notes = () => Object.fromEntries(names.filter((x) => !order.includes(x)).map((x) => [x, `waits ${indeg.get(x)}`]));
    const q = names.filter((x) => indeg.get(x) === 0);
    const views = (hl: string[]) => [
      graphView(names, edges, { directed: true, highlight: hl, done: [...order], notes: notes(), label: 'tasks (arrow: must come before)' }),
      { type: 'queue' as const, label: 'ready to do', items: [...q], highlightFront: true },
      { type: 'array' as const, label: 'order', values: [...order] },
    ];
    t.step(null, 'Find an order to do the tasks so every arrow points forward. "waits" counts the unfinished tasks each one still needs.', {}, views([]));
    t.step(4, `Tasks waiting on nothing can start: ${q.join(', ')}.`, { ready: [...q] }, views([...q]));
    let asked = 0;
    while (q.length) {
      const v = q.shift()!;
      order.push(v);
      t.step(8, `Do ${v}.`, { v, order }, views([v]));
      for (const e of edges.filter((e) => e.from === v).sort((a, b) => a.to.localeCompare(b.to))) {
        const w = e.to;
        const left = indeg.get(w)! - 1;
        const ask =
          asked < 2
            ? (asked++,
              predict(
                `${v} is done, and ${w} was waiting on ${indeg.get(w)} task${indeg.get(w) === 1 ? '' : 's'}. Can ${w} start now?`,
                left === 0 ? 'yes' : `not yet: still waiting on ${left}`,
                left === 0 ? `${v} was the last task ${w} needed.` : `${w} still needs ${left} more unfinished task${left === 1 ? '' : 's'}.`,
                [{ value: left === 0 ? `not yet: still waiting on ${left + 1}` : 'yes', why: left === 0 ? `Finishing ${v} drops ${w}'s count to 0.` : `${w} has other arrows coming in that aren't done.` }],
                asked,
              ))
            : undefined;
        indeg.set(w, left);
        if (left === 0) {
          q.push(w);
          t.step(12, `${w} has nothing left to wait on: it is ready.`, { v, w }, views([v, w]), ask);
        } else {
          t.step(10, `${w} now waits on ${left} more.`, { v, w }, views([v, w]), ask);
        }
      }
    }
    t.step(13, `A valid order: ${order.join(' → ')}. Every arrow points forward in it.`, { result: order }, views([]));
    return t.frames;
  },
};

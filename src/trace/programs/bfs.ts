import { predict, randomInt, Tracer } from '../tools';
import type { Program } from '../types';
import { graphView, NAMES, neighbours, randomGraph, type Edge } from './graphs';

// D25 "Graph basics and BFS": visit nodes in rings of distance from the start, using a queue.
// When every edge costs the same, that gives shortest paths.

export interface GraphInput {
  n: number;
  edges: Edge[];
}

const code = [
  'def bfs(start):',
  '    dist = {start: 0}',
  '    q = deque([start])',
  '    while q:',
  '        u = q.popleft()',
  '        for v in adj[u]:',
  '            if v in dist: continue',
  '            dist[v] = dist[u] + 1',
  '            q.append(v)',
  '    return dist',
];

/** Shortest hop counts by repeated relaxation (a different method from BFS). */
export function hopDistances(n: number, edges: Edge[]): number[] {
  const names = NAMES.slice(0, n);
  const d = names.map((x) => (x === 'A' ? 0 : Infinity));
  for (let round = 0; round < n; round++) {
    for (const e of edges) {
      const a = names.indexOf(e.from);
      const b = names.indexOf(e.to);
      d[b] = Math.min(d[b]!, d[a]! + 1);
      d[a] = Math.min(d[a]!, d[b]! + 1);
    }
  }
  return d;
}

export const bfs: Program<GraphInput> = {
  id: 'bfs',
  code,
  defaultInput: {
    n: 7,
    edges: [
      { from: 'A', to: 'B' },
      { from: 'A', to: 'C' },
      { from: 'B', to: 'D' },
      { from: 'C', to: 'F' },
      { from: 'D', to: 'E' },
      { from: 'E', to: 'G' },
      { from: 'F', to: 'G' },
    ],
  },
  randomInput: (r) => {
    const n = randomInt(r, 5, 7);
    return { n, edges: randomGraph(r, n, randomInt(r, 1, 2)) };
  },
  describe: ({ n, edges }) => `${n} places; links ${edges.map((e) => `${e.from}–${e.to}`).join(', ')}; start at A`,
  reference: ({ n, edges }) => hopDistances(n, edges),
  run({ n, edges }) {
    const t = new Tracer();
    const names = NAMES.slice(0, n);
    const adj = neighbours(edges);
    const dist = new Map<string, number>([['A', 0]]);
    const q = ['A'];
    const done: string[] = [];
    const notes = () => Object.fromEntries([...dist].map(([k, v]) => [k, `d=${v}`]));
    const views = (hl: string[], active: [string, string][] = []) => [
      graphView(names, edges, { highlight: hl, done: [...done], notes: notes(), active, label: 'graph (d = steps from A)' }),
      { type: 'queue' as const, label: 'queue', items: [...q], highlightFront: true },
    ];
    t.step(null, 'How many steps from A to every other place? BFS explores in rings: everything 1 step away, then 2 steps, and so on.', {}, views([]));
    t.step(3, 'Start with A in the queue, at distance 0.', { start: 'A' }, views(['A']));
    let asked = 0;
    while (q.length) {
      const u = q.shift()!;
      t.step(5, `Take ${u} from the front of the queue (distance ${dist.get(u)}).`, { u, 'dist[u]': dist.get(u)! }, views([u]));
      for (const { to: v } of adj.get(u) ?? []) {
        if (dist.has(v)) {
          t.step(7, `${v} already has a distance (${dist.get(v)}): skip it.`, { u, v }, views([u, v], [[u, v]]));
          continue;
        }
        const d = dist.get(u)! + 1;
        const ask =
          asked < 2 && d >= 2
            ? (asked++,
              predict(
                `${u} is ${dist.get(u)} step${dist.get(u) === 1 ? '' : 's'} from A, and ${v} hasn't been reached. What is ${v}'s distance?`,
                d,
                `One more step than ${u}: ${dist.get(u)} + 1 = ${d}. BFS reaches ${v} first by a shortest route.`,
                [
                  { value: dist.get(u)!, why: `${v} is one link further than ${u}.` },
                  { value: d + 1, why: `${v} is right next to ${u}: just one more step.` },
                ],
                asked,
              ))
            : undefined;
        dist.set(v, d);
        q.push(v);
        t.step(9, `Reach ${v} for the first time: distance ${d}. Add it to the back of the queue.`, { u, v, 'dist[v]': d }, views([u, v], [[u, v]]), ask);
      }
      done.push(u);
    }
    const result = names.map((x) => dist.get(x) ?? Infinity);
    t.step(10, `Every place has its fewest-steps distance: ${names.map((x) => `${x}=${dist.get(x)}`).join(', ')}.`, { result }, views([]));
    return t.frames;
  },
};

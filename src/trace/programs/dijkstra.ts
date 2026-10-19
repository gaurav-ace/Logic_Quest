import { predict, randomInt, Tracer } from '../tools';
import type { Program } from '../types';
import { graphView, NAMES, neighbours, randomGraph, type Edge } from './graphs';

// D28 "Dijkstra": with weighted roads, settle the closest unsettled place each time, and update
// its neighbours if going through it is shorter.

export interface WeightedInput {
  n: number;
  edges: Edge[];
}

const code = [
  'def dijkstra(src):',
  '    dist = {v: INF for v in G}',
  '    dist[src] = 0',
  '    done = set()',
  '    while len(done) < len(G):',
  '        u = closest_not_done()',
  '        done.add(u)',
  '        for v, w in G[u]:',
  '            nd = dist[u] + w',
  '            if nd < dist[v]:',
  '                dist[v] = nd',
  '    return dist',
];

/** Shortest distances by Bellman-Ford: a different method, used as the reference. */
export function bellmanFord(n: number, edges: Edge[]): number[] {
  const names = NAMES.slice(0, n);
  const d = names.map((x) => (x === 'A' ? 0 : Infinity));
  for (let round = 0; round < n - 1; round++) {
    for (const e of edges) {
      const a = names.indexOf(e.from);
      const b = names.indexOf(e.to);
      const w = e.weight!;
      if (d[a]! + w < d[b]!) d[b] = d[a]! + w;
      if (d[b]! + w < d[a]!) d[a] = d[b]! + w;
    }
  }
  return d;
}

export const dijkstra: Program<WeightedInput> = {
  id: 'dijkstra',
  code,
  defaultInput: {
    n: 6,
    edges: [
      { from: 'A', to: 'B', weight: 4 },
      { from: 'A', to: 'C', weight: 1 },
      { from: 'B', to: 'C', weight: 2 },
      { from: 'B', to: 'D', weight: 5 },
      { from: 'C', to: 'D', weight: 8 },
      { from: 'B', to: 'E', weight: 3 },
      { from: 'D', to: 'E', weight: 1 },
      { from: 'C', to: 'F', weight: 9 },
      { from: 'D', to: 'F', weight: 2 },
    ],
  },
  randomInput: (r) => {
    const n = randomInt(r, 5, 6);
    return { n, edges: randomGraph(r, n, randomInt(r, 2, 3), [1, 9]) };
  },
  describe: ({ edges }) => `roads ${edges.map((e) => `${e.from}–${e.to} (${e.weight})`).join(', ')}; from A`,
  reference: ({ n, edges }) => bellmanFord(n, edges),
  run({ n, edges }) {
    const t = new Tracer();
    const names = NAMES.slice(0, n);
    const adj = neighbours(edges);
    const dist = new Map(names.map((x) => [x, x === 'A' ? 0 : Infinity]));
    const done: string[] = [];
    const notes = () => Object.fromEntries(names.map((x) => [x, dist.get(x) === Infinity ? '∞' : `${dist.get(x)}`]));
    const views = (hl: string[], active: [string, string][] = []) => [graphView(names, edges, { highlight: hl, done: [...done], notes: notes(), active, label: 'roads (numbers under places: best distance so far)' })];
    t.step(null, 'Shortest distance from A to every place, when roads have different lengths. Counting hops is not enough here.', {}, views([]));
    t.step(3, 'A is 0 from itself; everything else starts at ∞ (not reached yet).', { src: 'A' }, views(['A']));
    let asked = 0;
    while (done.length < names.length) {
      const u = names.filter((x) => !done.includes(x)).reduce((best, x) => (dist.get(x)! < dist.get(best)! ? x : best));
      const settleAsk =
        asked < 1 && done.length === 1
          ? (asked++,
            predict(
              `Not yet settled: ${names.filter((x) => !done.includes(x)).map((x) => `${x}=${notes()[x]}`).join(', ')}. Which place is settled next?`,
              u,
              `${u} has the smallest distance (${dist.get(u)}). No other route can make it shorter, because every road adds a positive length.`,
              names.filter((x) => !done.includes(x) && x !== u).map((x) => ({ value: x, why: `${x} is at ${notes()[x]}, which is not the smallest.` })),
              7,
            ))
          : undefined;
      done.push(u);
      t.step(7, `Settle ${u}: its distance ${dist.get(u)} is final.`, { u, 'dist[u]': dist.get(u)! }, views([u]), settleAsk);
      for (const { to: v, weight: w } of adj.get(u) ?? []) {
        if (done.includes(v)) continue;
        const nd = dist.get(u)! + w;
        const better = nd < dist.get(v)!;
        const ask =
          asked < 3 && dist.get(v) !== Infinity
            ? (asked++,
              predict(
                `Via ${u}, ${v} would be ${dist.get(u)} + ${w} = ${nd}. Its best so far is ${dist.get(v)}. What is dist[${v}] now?`,
                Math.min(nd, dist.get(v)!),
                better ? `${nd} < ${dist.get(v)}: the route through ${u} is shorter, so update it.` : `${nd} isn't shorter than ${dist.get(v)}, so keep the old route.`,
                [{ value: better ? dist.get(v)! : nd, why: better ? `Always keep the smaller one: ${nd}.` : `Only a shorter route replaces the old one.` }],
                asked * 10,
              ))
            : undefined;
        if (better) {
          dist.set(v, nd);
          t.step(11, `${dist.get(u)} + ${w} = ${nd} is shorter: dist[${v}] = ${nd}.`, { u, v, nd }, views([u, v], [[u, v]]), ask);
        } else {
          t.step(10, `${dist.get(u)} + ${w} = ${nd} is not shorter than ${dist.get(v)}: keep it.`, { u, v, nd }, views([u, v], [[u, v]]), ask);
        }
      }
    }
    const result = names.map((x) => dist.get(x)!);
    t.step(12, `All settled: ${names.map((x) => `${x}=${dist.get(x)}`).join(', ')}.`, { result }, views([]));
    return t.frames;
  },
};

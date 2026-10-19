import { randomInt } from '../tools';
import type { View } from '../types';

// Shared graph inputs for the graph lessons: fixed node positions that fit a phone, with edges
// chosen per example. A random spanning tree keeps every example connected.

// Fits the 304 px content width of a 360 px phone (the view adds 10 px and a 17 px radius).
export const POSITIONS: Record<string, [number, number]> = {
  A: [8, 100],
  B: [85, 30],
  C: [85, 170],
  D: [160, 100],
  E: [235, 30],
  F: [235, 170],
  G: [276, 100],
};

export const NAMES = Object.keys(POSITIONS);

export interface Edge {
  from: string;
  to: string;
  weight?: number;
}

/** Edges that don't cross much on screen: only between nearby positions. */
const NEARBY: [string, string][] = [
  ['A', 'B'], ['A', 'C'], ['B', 'C'], ['B', 'D'], ['C', 'D'], ['B', 'E'], ['C', 'F'], ['D', 'E'], ['D', 'F'], ['E', 'G'], ['F', 'G'], ['D', 'G'], ['E', 'F'],
];

/** A connected graph on `n` nodes (A, B, ...): a random spanning tree plus a few extra edges. */
export function randomGraph(random: () => number, n: number, extra: number, weights?: [number, number]): Edge[] {
  const names = NAMES.slice(0, n);
  const allowed = NEARBY.filter(([a, b]) => names.includes(a) && names.includes(b));
  const chosen: [string, string][] = [];
  const joined = new Set([names[0]!]);
  // Grow a tree: keep adding an allowed edge from the joined part to a new node.
  while (joined.size < names.length) {
    const options = allowed.filter(([a, b]) => joined.has(a) !== joined.has(b));
    const [a, b] = options[Math.floor(random() * options.length)]!;
    chosen.push([a, b]);
    joined.add(a);
    joined.add(b);
  }
  const rest = allowed.filter(([a, b]) => !chosen.some(([x, y]) => x === a && y === b)).sort(() => random() - 0.5);
  chosen.push(...rest.slice(0, extra));
  return chosen.map(([from, to]) => ({ from, to, ...(weights ? { weight: randomInt(random, weights[0], weights[1]) } : {}) }));
}

export function neighbours(edges: Edge[], directed = false): Map<string, { to: string; weight: number }[]> {
  const adj = new Map<string, { to: string; weight: number }[]>();
  const add = (a: string, b: string, w: number) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a)!.push({ to: b, weight: w });
  };
  for (const e of edges) {
    add(e.from, e.to, e.weight ?? 1);
    if (!directed) add(e.to, e.from, e.weight ?? 1);
  }
  for (const list of adj.values()) list.sort((x, y) => x.to.localeCompare(y.to));
  return adj;
}

export function graphView(nodes: string[], edges: Edge[], opts: { directed?: boolean; highlight?: string[]; done?: string[]; active?: [string, string][]; notes?: Record<string, string>; label?: string } = {}): View {
  return {
    type: 'graph',
    label: opts.label ?? 'graph',
    nodes: nodes.map((id) => ({ id, label: id, x: POSITIONS[id]![0], y: POSITIONS[id]![1] })),
    edges: edges.map((e) => ({ from: e.from, to: e.to, ...(e.weight === undefined ? {} : { weight: e.weight }) })),
    ...(opts.directed ? { directed: true } : {}),
    ...(opts.highlight ? { highlight: opts.highlight } : {}),
    ...(opts.done ? { done: opts.done } : {}),
    ...(opts.active ? { activeEdges: opts.active } : {}),
    ...(opts.notes ? { notes: opts.notes } : {}),
  };
}

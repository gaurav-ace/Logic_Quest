import { predict, randomInt, Tracer } from '../tools';
import type { Program, Value } from '../types';

// D29 "Union-find": keep groups as trees. Each item points to a parent; the root names the group.
// Joining two groups points one root at the other.

export type Op = ['union' | 'same', number, number];

const code = [
  'def find(x):',
  '    while parent[x] != x:',
  '        x = parent[x]',
  '    return x',
  'def union(a, b):',
  '    ra, rb = find(a), find(b)',
  '    if ra != rb:',
  '        parent[rb] = ra',
  'def same(a, b):',
  '    return find(a) == find(b)',
];

const N = 7;

/** Answers to the "same" queries using plain graph search over the union edges. */
export function connectedAnswers(ops: Op[]): boolean[] {
  const edges: [number, number][] = [];
  const out: boolean[] = [];
  for (const [kind, a, b] of ops) {
    if (kind === 'union') {
      edges.push([a, b]);
      continue;
    }
    const seen = new Set([a]);
    const stack = [a];
    while (stack.length) {
      const x = stack.pop()!;
      for (const [p, q] of edges) {
        for (const [from, to] of [[p, q], [q, p]] as [number, number][]) {
          if (from === x && !seen.has(to)) {
            seen.add(to);
            stack.push(to);
          }
        }
      }
    }
    out.push(seen.has(b));
  }
  return out;
}

export const unionFind: Program<Op[]> = {
  id: 'union-find',
  code,
  defaultInput: [
    ['union', 0, 1],
    ['union', 2, 3],
    ['same', 1, 3],
    ['union', 1, 3],
    ['same', 0, 2],
    ['union', 4, 5],
    ['same', 5, 6],
  ],
  randomInput: (r) => {
    const ops: Op[] = [];
    for (let k = 0; k < 7; k++) {
      const a = randomInt(r, 0, N - 1);
      let b = randomInt(r, 0, N - 2);
      if (b >= a) b++;
      ops.push([k % 3 === 2 ? 'same' : 'union', a, b]);
    }
    return ops;
  },
  describe: (ops) => ops.map(([k, a, b]) => `${k}(${a}, ${b})`).join(', '),
  reference: (ops) => connectedAnswers(ops),
  run(ops) {
    const t = new Tracer();
    const parent = Array.from({ length: N }, (_, i) => i);
    const find = (x: number) => {
      while (parent[x] !== x) x = parent[x]!;
      return x;
    };
    const groups = (): Value[][] => {
      const by = new Map<number, number[]>();
      for (let i = 0; i < N; i++) {
        const r = find(i);
        if (!by.has(r)) by.set(r, []);
        by.get(r)!.push(i);
      }
      return [...by].map(([root, items]) => [root, items]);
    };
    const views = (hl: number[]) => [
      { type: 'array' as const, label: 'parent (index → parent; a root is its own parent)', values: [...parent], highlight: hl },
      { type: 'table' as const, label: 'groups', columns: ['root', 'items'], rows: groups() },
    ];
    const answers: boolean[] = [];
    t.step(null, `${N} items, each alone in its own group. Join groups and ask "are these in the same group?" quickly.`, {}, views([]));
    let asked = 0;
    for (const [kind, a, b] of ops) {
      const ra = find(a);
      const rb = find(b);
      if (kind === 'same') {
        const same = ra === rb;
        const ask =
          asked < 2
            ? (asked++,
              predict(
                `same(${a}, ${b}): find(${a}) is ${ra} and find(${b}) is ${rb}. Same group?`,
                same ? 'yes' : 'no',
                same ? `Both lead to the root ${ra}.` : `Different roots (${ra} and ${rb}) mean different groups.`,
                [{ value: same ? 'no' : 'yes', why: same ? 'Two items with the same root are in one group.' : `They would need the same root; ${ra} ≠ ${rb}.` }],
                asked,
              ))
            : undefined;
        answers.push(same);
        t.step(10, `same(${a}, ${b}): roots ${ra} and ${rb}, so ${same ? 'yes' : 'no'}.`, { a, b, 'find(a)': ra, 'find(b)': rb }, views([a, b]), ask);
        continue;
      }
      if (ra === rb) {
        t.step(7, `union(${a}, ${b}): already in the same group (root ${ra}). Nothing to do.`, { a, b }, views([a, b]));
        continue;
      }
      parent[rb] = ra;
      t.step(8, `union(${a}, ${b}): roots ${ra} and ${rb} differ. Point ${rb} at ${ra}: the two groups become one.`, { a, b, ra, rb }, views([rb, ra]));
    }
    t.step(null, `Answers: ${answers.map((x) => (x ? 'yes' : 'no')).join(', ')}. (Real versions also flatten the trees as they go, which keeps find() almost instant.)`, { result: answers }, views([]));
    return t.frames;
  },
};

import { predict, randomInt, randomList, Tracer } from '../tools';
import type { Program, TreeNode, View } from '../types';

// D19 "Heaps": a min-heap keeps the smallest item at the top. Stored in a plain list; the
// children of index i are at 2i + 1 and 2i + 2. A new item swaps upward until its parent is smaller.

const code = [
  'def push(h, x):',
  '    h.append(x)',
  '    i = len(h) - 1',
  '    while i > 0:',
  '        p = (i - 1) // 2',
  '        if h[p] <= h[i]: break',
  '        h[i], h[p] = h[p], h[i]',
  '        i = p',
];

export function heapPushAll(xs: number[]): number[] {
  const h: number[] = [];
  for (const x of xs) {
    h.push(x);
    let i = h.length - 1;
    while (i > 0) {
      const p = Math.floor((i - 1) / 2);
      if (h[p]! <= h[i]!) break;
      [h[i], h[p]] = [h[p]!, h[i]!];
      i = p;
    }
  }
  return h;
}

/** Every parent is no bigger than its children. */
export const isMinHeap = (h: number[]) => h.every((v, i) => i === 0 || h[Math.floor((i - 1) / 2)]! <= v);

function heapViews(h: number[], hl: number[]): View[] {
  const nodes: TreeNode[] = h.map((value, i) => ({
    id: String(i),
    value,
    children: [2 * i + 1 < h.length ? String(2 * i + 1) : null, 2 * i + 2 < h.length ? String(2 * i + 2) : null],
  }));
  return [
    { type: 'tree', label: 'the heap as a tree', shape: 'binary', nodes, root: h.length ? '0' : null, highlight: hl.map(String) },
    { type: 'array', label: 'the same heap as a list', values: [...h], highlight: hl },
  ];
}

export const heapPush: Program<number[]> = {
  id: 'heap-push',
  code,
  defaultInput: [8, 5, 9, 3, 7, 1],
  randomInput: (r) => randomList(r, randomInt(r, 5, 7), 1, 30),
  describe: (xs) => `push ${xs.join(', ')} in that order`,
  reference: (xs) => heapPushAll(xs),
  run(xs) {
    const t = new Tracer();
    const h: number[] = [];
    let asked = 0;
    t.step(null, `Push ${xs.join(', ')} into a min-heap. The smallest item must always be at the top, but the rest only needs parents ≤ children, not full sorting.`, {}, heapViews(h, []));
    for (const x of xs) {
      h.push(x);
      let i = h.length - 1;
      t.step(2, `Add ${x} at the end (index ${i}).`, { x, i }, heapViews(h, [i]));
      while (i > 0) {
        const p = Math.floor((i - 1) / 2);
        const up = h[p]! > h[i]!;
        const ask =
          asked < 3 && i === h.length - 1
            ? (asked++,
              predict(
                `${h[i]} sits at index ${i}; its parent at index ${p} is ${h[p]}. What happens?`,
                up ? `swap: ${h[i]} moves up` : 'stop: it stays',
                up ? `${h[p]} > ${h[i]}, so the parent is bigger: swap them to keep parents ≤ children.` : `${h[p]} ≤ ${h[i]}, so the heap rule already holds: stop.`,
                [{ value: up ? 'stop: it stays' : `swap: ${h[i]} moves up`, why: up ? `A parent (${h[p]}) bigger than its child breaks the heap rule.` : `Swapping would put the bigger ${h[i]} above ${h[p]}.` }],
                asked * 10 + i,
              ))
            : undefined;
        if (!up) {
          t.step(6, `Parent ${h[p]} ≤ ${h[i]}: the heap rule holds. Stop.`, { x, i, p }, heapViews(h, [i, p]), ask);
          break;
        }
        [h[i], h[p]] = [h[p]!, h[i]!];
        t.step(7, `Parent ${h[i]} > ${h[p]}: swap, so ${h[p]} moves up to index ${p}.`, { x, i, p }, heapViews(h, [p]), ask);
        i = p;
      }
    }
    t.step(null, `Done. The smallest, ${h[0]}, is at the top. Each push climbed at most the height of the tree, about log₂ n swaps.`, { result: [...h] }, heapViews(h, [0]));
    return t.frames;
  },
};


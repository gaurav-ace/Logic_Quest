import { predict, randomInt, randomList, show, Tracer } from '../tools';
import type { Program } from '../types';

// D18 "Quick sort": pick a pivot, move smaller items to its left, then sort each side the same
// way. This is the Lomuto partition, with the last item as the pivot.

const code = [
  'def quick_sort(a, lo, hi):',
  '    if lo >= hi: return',
  '    p = partition(a, lo, hi)',
  '    quick_sort(a, lo, p - 1)',
  '    quick_sort(a, p + 1, hi)',
  'def partition(a, lo, hi):',
  '    pivot, i = a[hi], lo',
  '    for j in range(lo, hi):',
  '        if a[j] < pivot:',
  '            swap(a, i, j)',
  '            i += 1',
  '    swap(a, i, hi)',
  '    return i',
];

/** Lomuto partition, counting comparisons. Shared by the trace's reference and the tests. */
export function quickSortCount(input: number[]): { sorted: number[]; comparisons: number } {
  const a = [...input];
  let comparisons = 0;
  const sort = (lo: number, hi: number): void => {
    if (lo >= hi) return;
    const pivot = a[hi]!;
    let i = lo;
    for (let j = lo; j < hi; j++) {
      comparisons++;
      if (a[j]! < pivot) {
        [a[i], a[j]] = [a[j]!, a[i]!];
        i++;
      }
    }
    [a[i], a[hi]] = [a[hi]!, a[i]!];
    sort(lo, i - 1);
    sort(i + 1, hi);
  };
  sort(0, a.length - 1);
  return { sorted: a, comparisons };
}

const SWAP = 'swap it into the left part';
const SKIP = 'leave it where it is';

export const quickSort: Program<number[]> = {
  id: 'quick-sort',
  code,
  defaultInput: [7, 2, 9, 4, 1, 6, 5],
  randomInput: (r) => randomList(r, randomInt(r, 5, 7), 1, 20),
  describe: (a) => `a = ${show(a)}`,
  reference: (a) => [...a].sort((x, y) => x - y),
  run(input) {
    const t = new Tracer();
    const a = [...input];
    const placed: number[] = [];
    let asked = 0;
    const view = (lo: number, hi: number, ptrs: Record<string, number>, hl: number[] = []) => [
      {
        type: 'array' as const,
        label: 'a (dim: outside this call; muted: pivot in its final place)',
        values: [...a],
        range: [lo, hi] as [number, number],
        done: [...placed],
        highlight: hl,
        pointers: Object.entries(ptrs).map(([name, index]) => ({ name, index })),
      },
    ];
    t.step(null, `Sort ${show(input)}. Pick a pivot and split the rest into "smaller" and "not smaller"; then do the same to each side.`, {}, view(0, a.length - 1, {}));
    const sort = (lo: number, hi: number): void => {
      if (lo >= hi) {
        if (lo === hi) placed.push(lo);
        return;
      }
      const pivot = a[hi]!;
      let i = lo;
      t.step(7, `Partition a[${lo}..${hi}]: the pivot is the last item, ${pivot}. i marks where the next smaller item goes.`, { lo, hi, pivot, i }, view(lo, hi, { i, pivot: hi }, [hi]));
      for (let j = lo; j < hi; j++) {
        const smaller = a[j]! < pivot;
        const ask =
          asked < 2 && j > lo
            ? (asked++,
              predict(
                `a[j] is ${a[j]} and the pivot is ${pivot}. What happens to ${a[j]}?`,
                smaller ? SWAP : SKIP,
                smaller ? `${a[j]} < ${pivot}, so it belongs left of the pivot: swap it to index i, then move i on.` : `${a[j]} is not smaller than ${pivot}, so it stays on the right side for now.`,
                [{ value: smaller ? SKIP : SWAP, why: smaller ? `Items smaller than the pivot must end up on its left.` : `Only items smaller than the pivot move left.` }],
                asked,
              ))
            : undefined;
        if (smaller) {
          [a[i], a[j]] = [a[j]!, a[i]!];
          t.step(10, `${a[i]} < ${pivot}: swap it to index ${i}.`, { j, i, pivot }, view(lo, hi, { i, j, pivot: hi }, [i, j]), ask);
          i++;
        } else {
          t.step(9, `${a[j]} ≥ ${pivot}: leave it.`, { j, i, pivot }, view(lo, hi, { i, j, pivot: hi }, [j]), ask);
        }
      }
      [a[i], a[hi]] = [a[hi]!, a[i]!];
      placed.push(i);
      t.step(12, `Swap the pivot ${pivot} into index ${i}. Everything left of it is smaller, everything right is not: ${pivot} is in its final place.`, { pivot, p: i }, view(lo, hi, { p: i }, [i]));
      sort(lo, i - 1);
      sort(i + 1, hi);
    };
    sort(0, a.length - 1);
    t.step(null, `Sorted: ${show(a)}. With good pivots each split halves the work: O(n log n) on average. An already-sorted list is the worst case here, O(n²).`, { result: [...a] }, view(0, a.length - 1, {}));
    return t.frames;
  },
};

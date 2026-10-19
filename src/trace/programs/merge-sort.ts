import { predict, randomInt, randomList, show, Tracer } from '../tools';
import type { Program } from '../types';

// D17 "Merge sort": split in half, sort each half the same way, then merge two sorted lists by
// repeatedly taking the smaller front item.

const code = [
  'def merge_sort(a):',
  '    if len(a) <= 1: return a',
  '    mid = len(a) // 2',
  '    L = merge_sort(a[:mid])',
  '    R = merge_sort(a[mid:])',
  '    out, i, j = [], 0, 0',
  '    while i < len(L) and \\',
  '          j < len(R):',
  '        if L[i] <= R[j]:',
  '            out += [L[i]]; i += 1',
  '        else:',
  '            out += [R[j]]; j += 1',
  '    return out + L[i:] + R[j:]',
];

/** Merge sort on (key, tag) pairs, comparing keys only. Used to test stability. */
export function mergeSortBy<T>(a: T[], key: (x: T) => number, counter = { comparisons: 0 }): T[] {
  if (a.length <= 1) return a;
  const mid = Math.floor(a.length / 2);
  const L = mergeSortBy(a.slice(0, mid), key, counter);
  const R = mergeSortBy(a.slice(mid), key, counter);
  const out: T[] = [];
  let i = 0;
  let j = 0;
  while (i < L.length && j < R.length) {
    counter.comparisons++;
    // <= takes from the left on ties: that keeps equal keys in their original order (stable).
    if (key(L[i]!) <= key(R[j]!)) out.push(L[i++]!);
    else out.push(R[j++]!);
  }
  return [...out, ...L.slice(i), ...R.slice(j)];
}

export const mergeSort: Program<number[]> = {
  id: 'merge-sort',
  code,
  defaultInput: [38, 27, 43, 3, 9, 82],
  randomInput: (r) => randomList(r, randomInt(r, 5, 7), 1, 50),
  describe: (a) => `a = ${show(a)}`,
  reference: (a) => [...a].sort((x, y) => x - y),
  run(input) {
    const t = new Tracer();
    let asked = 0;
    t.step(null, `Sort ${show(input)}. Sorting a short list is easy, so split until the lists are tiny, then merge them back in order.`, {}, [{ type: 'array', label: 'a', values: input }]);
    const sort = (a: number[], depth: number): number[] => {
      if (a.length <= 1) return a;
      const mid = Math.floor(a.length / 2);
      const indent = '·'.repeat(depth);
      t.step(3, `${indent}Split ${show(a)} into ${show(a.slice(0, mid))} and ${show(a.slice(mid))}.`, { a, mid }, [{ type: 'array', label: `splitting (depth ${depth})`, values: a, highlight: [mid] }]);
      const L = sort(a.slice(0, mid), depth + 1);
      const R = sort(a.slice(mid), depth + 1);
      const out: number[] = [];
      let i = 0;
      let j = 0;
      const views = (hlL?: number, hlR?: number) => [
        { type: 'array' as const, label: 'L (sorted)', values: L, ...(hlL === undefined ? {} : { highlight: [hlL], pointers: [{ name: 'i', index: hlL }] }), done: Array.from({ length: i }, (_, k) => k) },
        { type: 'array' as const, label: 'R (sorted)', values: R, ...(hlR === undefined ? {} : { highlight: [hlR], pointers: [{ name: 'j', index: hlR }] }), done: Array.from({ length: j }, (_, k) => k) },
        { type: 'array' as const, label: 'out', values: [...out] },
      ];
      t.step(6, `${indent}Merge ${show(L)} and ${show(R)}: both are already sorted.`, { L, R }, views(0, 0));
      while (i < L.length && j < R.length) {
        const takeLeft = L[i]! <= R[j]!;
        const pick = takeLeft ? L[i]! : R[j]!;
        const ask =
          asked < 2 && L.length + R.length >= 4
            ? (asked++,
              predict(
                `L[i] is ${L[i]} and R[j] is ${R[j]}. Which goes into out next?`,
                pick,
                `${Math.min(L[i]!, R[j]!)} is the smaller front item. Both lists are sorted, so nothing behind it can be smaller.`,
                [{ value: takeLeft ? R[j]! : L[i]!, why: 'Always take the smaller of the two front items, so out stays sorted.' }],
                asked,
              ))
            : undefined;
        // Say what was compared before the indexes move on.
        const why = takeLeft ? `${L[i]} ≤ ${R[j]}: take ${pick} from L.` : `${R[j]} < ${L[i]}: take ${pick} from R.`;
        if (takeLeft) i++;
        else j++;
        out.push(pick);
        t.step(takeLeft ? 10 : 12, `${indent}${why}`, { L, R, out }, views(i < L.length ? i : undefined, j < R.length ? j : undefined), ask);
      }
      const merged = [...out, ...L.slice(i), ...R.slice(j)];
      const rest = [...L.slice(i), ...R.slice(j)];
      out.push(...rest);
      t.step(13, `${indent}${rest.length ? `One side ran out: copy the rest (${show(rest)}).` : 'Both sides used up.'} Merged: ${show(merged)}.`, { out: merged }, views());
      return merged;
    };
    const result = sort(input, 0);
    t.step(null, `Sorted: ${show(result)}. Each level of splitting does about n work to merge, and there are about log₂ n levels: O(n log n).`, { result }, [{ type: 'array', label: 'a, sorted', values: result }]);
    return t.frames;
  },
};

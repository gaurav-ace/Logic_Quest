import { predict, randomInt, randomList, show, Tracer } from '../tools';
import type { Program } from '../types';

// D16 "Simple sorts": insertion sort, like sorting cards in your hand. Each new card slides left
// past the bigger ones.

const code = [
  'def insertion_sort(a):',
  '    for i in range(1, len(a)):',
  '        x, j = a[i], i - 1',
  '        while j >= 0 and a[j] > x:',
  '            a[j + 1] = a[j]',
  '            j -= 1',
  '        a[j + 1] = x',
  '    return a',
];

/** Pairs that are out of order: exactly the number of shifts insertion sort makes. */
export function inversions(a: number[]): number {
  let n = 0;
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) if (a[i]! > a[j]!) n++;
  return n;
}

export const insertionSort: Program<number[]> = {
  id: 'insertion-sort',
  code,
  defaultInput: [5, 2, 4, 6, 1, 3],
  randomInput: (r) => randomList(r, randomInt(r, 5, 7), 1, 9),
  describe: (a) => `a = ${show(a)}`,
  reference: (a) => [...a].sort((x, y) => x - y),
  run(input) {
    const t = new Tracer();
    const a = [...input];
    const view = (sortedUpTo: number, hl: number[], ptrs: Record<string, number> = {}) => [
      {
        type: 'array' as const,
        label: 'a (left part is sorted)',
        values: [...a],
        highlight: hl,
        range: [0, sortedUpTo] as [number, number],
        pointers: Object.entries(ptrs).filter(([, i]) => i >= 0).map(([name, index]) => ({ name, index })),
      },
    ];
    t.step(null, `Sort ${show(input)} the way you would sort cards: take the next card, slide it left past every bigger one.`, {}, view(0, []));
    let shifts = 0;
    for (let i = 1; i < a.length; i++) {
      const x = a[i]!;
      let j = i - 1;
      t.step(3, `Take x = ${x}. Everything left of it is already sorted.`, { i, x, j }, view(i - 1, [i], { i, j }));
      const willMove = a.slice(0, i).filter((v) => v > x).length;
      const ask =
        i === 2 || i === a.length - 1
          ? predict(
              `x is ${x} and the sorted part is ${show(a.slice(0, i))}. How many numbers slide right to make room?`,
              willMove,
              `Every number bigger than ${x} in the sorted part moves one place right: ${willMove}.`,
              [
                { value: i, why: `Only numbers bigger than ${x} move; smaller ones stay.` },
                { value: willMove === 0 ? 1 : willMove - 1, why: `Count the numbers bigger than ${x}: ${a.slice(0, i).filter((v) => v > x).join(', ') || 'none'}.` },
                { value: 0, why: `Some numbers in the sorted part are bigger than ${x}, so they must slide right.` },
              ],
              i,
            )
          : undefined;
      let first = true;
      while (j >= 0 && a[j]! > x) {
        a[j + 1] = a[j]!;
        shifts++;
        t.step(5, `${a[j]} > ${x}: slide ${a[j]} one place right.`, { i, x, j, shifts }, view(i, [j, j + 1], { j }), first ? ask : undefined);
        first = false;
        j--;
      }
      a[j + 1] = x;
      t.step(7, `${j >= 0 ? `${a[j]} ≤ ${x}, so stop.` : 'Reached the start.'} Drop ${x} into index ${j + 1}.`, { i, x, j, shifts }, view(i, [j + 1]), first ? ask : undefined);
    }
    t.step(8, `Sorted, with ${shifts} slides: one for every pair that started out of order.`, { result: [...a] }, view(a.length - 1, []));
    return t.frames;
  },
};

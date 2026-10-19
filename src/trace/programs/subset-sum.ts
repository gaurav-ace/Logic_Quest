import { predict, randomInt, show, Tracer } from '../tools';
import type { Program, Value } from '../types';

// D21 "Backtracking": try a choice, explore, undo it, try the other choice. Prune paths that
// can no longer work (here: the total already went over).

export interface SubsetInput {
  nums: number[];
  target: number;
}

const code = [
  'def go(i, total):',
  '    if total == target:',
  '        found.append(pick[:])',
  '        return',
  '    if total > target or i == n:',
  '        return',
  '    pick.append(nums[i])  # choose',
  '    go(i + 1, total + nums[i])',
  '    pick.pop()  # undo',
  '    go(i + 1, total)  # skip',
];

/** Every subset (by position) that sums to target, each sorted, the list sorted: brute force. */
export function subsetsSumming(nums: number[], target: number): number[][] {
  const out: number[][] = [];
  for (let mask = 1; mask < 1 << nums.length; mask++) {
    const sub = nums.filter((_, i) => mask & (1 << i));
    if (sub.reduce((a, b) => a + b, 0) === target) out.push(sub);
  }
  return normalise(out);
}

const normalise = (sets: number[][]) => sets.map((s) => [...s].sort((a, b) => a - b)).sort((a, b) => show(a).localeCompare(show(b)));

export const subsetSum: Program<SubsetInput> = {
  id: 'subset-sum',
  code,
  defaultInput: { nums: [2, 3, 5, 6], target: 8 },
  randomInput: (r) => {
    const nums = [...new Set(Array.from({ length: 6 }, () => randomInt(r, 1, 9)))].slice(0, 4);
    const target = nums.slice(0, 2).reduce((a, b) => a + b, 0) + (r() < 0.5 ? nums[3] ?? 0 : 0);
    return { nums, target };
  },
  describe: ({ nums, target }) => `nums = ${show(nums)}, target = ${target}`,
  reference: ({ nums, target }) => subsetsSumming(nums, target),
  run({ nums, target }) {
    const t = new Tracer();
    const pick: number[] = [];
    const found: number[][] = [];
    const stack: string[] = [];
    const view = (i: number | null) => [
      { type: 'array' as const, label: 'nums', values: nums, ...(i === null || i >= nums.length ? {} : { pointers: [{ name: 'i', index: i }], highlight: [i] }), done: i === null ? [] : Array.from({ length: Math.min(i, nums.length) }, (_, k) => k) },
      { type: 'array' as const, label: 'pick (current choices)', values: [...pick] },
      { type: 'table' as const, label: 'found', columns: ['subset'], rows: found.map((f): Value[] => [f]) },
      { type: 'stack' as const, label: 'calls', items: [...stack], highlightTop: true },
    ];
    t.step(null, `Which groups of ${show(nums)} add up to ${target}? For each number: choose it or skip it, and back out of any path that goes over.`, { target }, view(null));
    let asked = 0;
    const go = (i: number, total: number): void => {
      stack.push(`go(${i}, ${total})`);
      t.step(1, `go(i=${i}, total=${total}) with pick = ${show(pick)}.`, { i, total, pick }, view(i));
      if (total === target) {
        found.push([...pick]);
        t.step(3, `total is ${target}: record ${show(pick)}.`, { i, total, pick }, view(i));
        stack.pop();
        return;
      }
      if (total > target || i === nums.length) {
        t.step(6, total > target ? `total ${total} is over ${target}: stop here and go back (prune).` : 'No numbers left to try: go back.', { i, total }, view(i));
        stack.pop();
        return;
      }
      const next = total + nums[i]!;
      const ask =
        asked < 2 && next > target
          ? (asked++,
            predict(
              `pick is ${show(pick)} (total ${total}). Choosing ${nums[i]} makes ${next}, over the target ${target}. What happens on that path?`,
              'it stops at once and backs out',
              `${next} > ${target}, and every number is positive, so adding more can only make it worse: the path is pruned.`,
              [
                { value: 'it keeps adding numbers', why: 'All numbers are positive, so the total can only grow. There is no point going on.' },
                { value: 'it records the pick', why: `Only a total of exactly ${target} is recorded.` },
              ],
              asked + i * 10,
            ))
          : undefined;
      pick.push(nums[i]!);
      t.step(7, `Choose ${nums[i]}: pick = ${show(pick)}.`, { i, total: next, pick }, view(i), ask);
      go(i + 1, next);
      pick.pop();
      t.step(9, `Undo: take ${nums[i]} back out. pick = ${show(pick)}. Now try without it.`, { i, total, pick }, view(i));
      go(i + 1, total);
      stack.pop();
    };
    go(0, 0);
    const result = normalise(found);
    t.step(null, `Done: ${found.length ? found.map((f) => show(f)).join(' and ') : 'no group'} add${found.length === 1 ? 's' : ''} up to ${target}. Pruning skipped every path that went over.`, { result }, view(null));
    return t.frames;
  },
};

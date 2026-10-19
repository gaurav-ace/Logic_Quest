import { predict, randomInt, randomList, show, Tracer } from '../tools';
import type { Program } from '../types';

// D5 "Sliding window": the best sum of k neighbours, updating the sum instead of re-adding.

export interface WindowInput {
  nums: number[];
  k: number;
}

const code = [
  'def best_window(nums, k):',
  '    s = sum(nums[:k])',
  '    best = s',
  '    for r in range(k, len(nums)):',
  '        s += nums[r] - nums[r - k]',
  '        best = max(best, s)',
  '    return best',
];

export const slidingWindow: Program<WindowInput> = {
  id: 'sliding-window',
  code,
  defaultInput: { nums: [2, 1, 5, 1, 3, 2], k: 3 },
  randomInput: (r) => {
    const nums = randomList(r, randomInt(r, 6, 8), 1, 9);
    return { nums, k: randomInt(r, 2, 3) };
  },
  describe: ({ nums, k }) => `nums = ${show(nums)}, k = ${k}`,
  // Brute force: add up every window from scratch.
  reference: ({ nums, k }) => Math.max(...Array.from({ length: nums.length - k + 1 }, (_, i) => nums.slice(i, i + k).reduce((a, b) => a + b, 0))),
  run({ nums, k }) {
    const t = new Tracer();
    const view = (lo: number, hi: number, hl: number[] = []) => [
      { type: 'array' as const, label: `nums (window of ${k})`, values: nums, range: [lo, hi] as [number, number], highlight: hl, pointers: [{ name: 'L', index: lo }, { name: 'R', index: hi }] },
    ];
    t.step(null, `Best sum of ${k} neighbours in ${show(nums)}. Adding each window from scratch repeats work; slide instead.`, { k }, view(0, k - 1));
    let s = nums.slice(0, k).reduce((a, b) => a + b, 0);
    t.step(2, `The first window: ${nums.slice(0, k).join(' + ')} = ${s}.`, { s }, view(0, k - 1, Array.from({ length: k }, (_, i) => i)));
    let best = s;
    t.step(3, `best = ${best} so far.`, { s, best }, view(0, k - 1));
    for (let r = k; r < nums.length; r++) {
      const add = nums[r]!;
      const drop = nums[r - k]!;
      const next = s + add - drop;
      const ask =
        r === k || r === nums.length - 1
          ? predict(
              `The window slides right: ${add} comes in and ${drop} goes out. s was ${s}. What is s now?`,
              next,
              `${s} + ${add} − ${drop} = ${next}. Two operations per slide, however big k is.`,
              [
                { value: s + add, why: `The window keeps ${k} numbers, so ${drop} must leave as ${add} arrives.` },
                { value: s - drop, why: `${add} joins the window too.` },
                { value: s + drop - add, why: 'Backwards: add the new number, subtract the one leaving.' },
              ],
              r,
            )
          : undefined;
      s = next;
      t.step(5, `Slide: + ${add} − ${drop}, so s = ${s}.`, { r, s, best }, view(r - k + 1, r, [r, r - k]), ask);
      const before = best;
      best = Math.max(best, s);
      t.step(6, best > before ? `${s} beats ${before}: best = ${best}.` : `${s} doesn't beat ${best}.`, { r, s, best }, view(r - k + 1, r));
    }
    t.step(7, `Done: the best window sums to ${best}, found with one pass.`, { result: best }, view(nums.length - k, nums.length - 1));
    return t.frames;
  },
};

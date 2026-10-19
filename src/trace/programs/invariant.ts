import { predict, randomInt, randomList, show, Tracer } from '../tools';
import type { Program } from '../types';

// L6 "Invariants": a statement that is true every time the loop reaches the same point.
// Checking it at the start, after each pass, and at the end proves the loop correct.

const code = [
  'def total_of(nums):',
  '    total = 0',
  '    for i in range(len(nums)):',
  '        # total == sum(nums[:i])',
  '        total = total + nums[i]',
  '    return total',
];

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** The invariant itself, used by the trace and checked by tests at every loop pass. */
export const invariantHolds = (nums: number[], i: number, total: number) => total === sum(nums.slice(0, i));

export const invariant: Program<number[]> = {
  id: 'invariant',
  code,
  defaultInput: [3, 4, 2, 6],
  randomInput: (r) => randomList(r, randomInt(r, 3, 6), 1, 9),
  describe: (nums) => `nums = ${show(nums)}`,
  reference: (nums) => sum(nums),
  run(nums) {
    const t = new Tracer();
    const view = (i: number | null, added: number) => [
      {
        type: 'array' as const,
        label: 'nums (added so far is muted)',
        values: nums,
        ...(i === null || i >= nums.length ? {} : { pointers: [{ name: 'i', index: i }], highlight: [i] }),
        done: Array.from({ length: added }, (_, k) => k),
      },
    ];
    t.step(null, 'The invariant on line 4 claims: whenever we reach it, total equals the sum of the items before index i.', { nums }, view(null, 0));
    let total = 0;
    t.step(2, 'total = 0. At the start nothing has been added, and the sum of no items is 0, so the invariant starts true.', { total }, view(null, 0));
    for (let i = 0; i < nums.length; i++) {
      const before = sum(nums.slice(0, i));
      const ask =
        i === 1 || i === nums.length - 1
          ? predict(
              `i is ${i}. What does the invariant say total must be at line 4?`,
              before,
              `sum(nums[:${i}]) adds the ${i} item${i === 1 ? '' : 's'} before index ${i}: ${nums.slice(0, i).join(' + ')} = ${before}.`,
              [
                { value: sum(nums.slice(0, i + 1)), why: `That includes nums[${i}], which line 5 hasn't added yet. nums[:${i}] stops before index ${i}.` },
                { value: nums[i - 1]!, why: 'total holds the sum of every item so far, not just the last one.' },
                { value: nums[i]!, why: `nums[${i}] is the next item to add; it isn't in total yet.` },
              ],
              i,
            )
          : undefined;
      t.step(4, `i = ${i}. Check: total is ${total}, sum(nums[:${i}]) is ${before}. ${invariantHolds(nums, i, total) ? 'True.' : 'False!'}`, { i, total, 'sum(nums[:i])': before }, view(i, i), ask);
      total += nums[i]!;
      t.step(5, `Add nums[${i}] = ${nums[i]}: total = ${total}. Next time we reach line 4, i will be ${i + 1}, and total covers nums[:${i + 1}], so it stays true.`, { i, total }, view(i, i + 1));
    }
    t.step(6, `The loop ends with i past the last item, so the invariant says total == sum(nums): ${total}. That is a proof the function is right for any list, not just this one.`, { result: total }, view(null, nums.length));
    return t.frames;
  },
};

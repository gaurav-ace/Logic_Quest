import { predict, randomInt, randomList, show, Tracer } from '../tools';
import type { Program } from '../types';

// L3 "Dry-run code": track `best` line by line, the way you would on paper.

const code = [
  'def largest(nums):',
  '    best = nums[0]',
  '    for i in range(1, len(nums)):',
  '        if nums[i] > best:',
  '            best = nums[i]',
  '    return best',
];

export const findMax: Program<number[]> = {
  id: 'find-max',
  code,
  defaultInput: [3, 8, 2, 9, 4],
  randomInput: (r) => randomList(r, randomInt(r, 4, 7), 1, 20),
  describe: (nums) => `nums = ${show(nums)}`,
  reference: (nums) => Math.max(...nums),
  run(nums) {
    const t = new Tracer();
    const view = (i: number | null, best: number, bestAt: number) => [
      {
        type: 'array' as const,
        label: 'nums',
        values: nums,
        pointers: [...(i === null ? [] : [{ name: 'i', index: i }]), { name: 'best', index: bestAt }],
        highlight: i === null ? [] : [i],
        done: i === null ? [] : Array.from({ length: i }, (_, k) => k),
      },
    ];
    t.step(null, `We call largest(nums) with ${nums.length} numbers. Track best on paper as each line runs.`, { nums }, view(null, nums[0]!, 0));
    let best = nums[0]!;
    let bestAt = 0;
    t.step(2, `best starts as the first number, ${best}. Nothing else has been looked at yet.`, { best }, view(null, best, bestAt));
    // Ask on the first, middle and last comparison: enough to practise, not so many it drags.
    const askAt = new Set([1, Math.floor(nums.length / 2), nums.length - 1]);
    for (let i = 1; i < nums.length; i++) {
      const x = nums[i]!;
      t.step(3, `The loop moves on: i = ${i}, so nums[i] is ${x}.`, { i, 'nums[i]': x, best }, view(i, best, bestAt));
      const bigger = x > best;
      const after = bigger ? x : best;
      const ask = askAt.has(i)
        ? predict(
            `nums[i] is ${x} and best is ${best}. What is best after lines 4–5 run?`,
            after,
            bigger ? `${x} > ${best}, so line 5 replaces best.` : `${x} is not greater than ${best}, so line 5 is skipped and best stays.`,
            [
              { value: bigger ? best : x, why: bigger ? `${x} > ${best}, so line 5 does run and replaces best.` : `best only changes when nums[i] is greater; ${x} is not greater than ${best}.` },
              { value: Math.max(...nums), why: 'That is the final answer, but the loop has not seen those later numbers yet.' },
              { value: x + best, why: 'best holds one number from the list; nothing is added up.' },
            ],
            i,
          )
        : undefined;
      if (bigger) {
        const old = best;
        best = x;
        bestAt = i;
        t.step(5, `Is ${x} > ${old}? Yes, so line 5 runs: best becomes ${x}.`, { i, 'nums[i]': x, best }, view(i, best, bestAt), ask);
      } else {
        t.step(4, `Is ${x} > ${best}? No, so line 5 is skipped. best stays ${best}.`, { i, 'nums[i]': x, best }, view(i, best, bestAt), ask);
      }
    }
    t.step(6, `The loop has seen every number. The function returns ${best}.`, { result: best }, view(null, best, bestAt));
    return t.frames;
  },
};

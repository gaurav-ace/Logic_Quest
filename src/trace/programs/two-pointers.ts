import { predict, randomInt, randomList, show, Tracer } from '../tools';
import type { Program } from '../types';

// D4 "Two pointers": in a sorted array, find two numbers that add up to a target in one pass.

export interface PairInput {
  nums: number[];
  target: number;
}

const code = [
  'def pair_sum(nums, target):',
  '    lo, hi = 0, len(nums) - 1',
  '    while lo < hi:',
  '        s = nums[lo] + nums[hi]',
  '        if s == target:',
  '            return [lo, hi]',
  '        elif s < target:',
  '            lo += 1',
  '        else:',
  '            hi -= 1',
  '    return None',
];

export function pairSum(nums: number[], target: number): [number, number] | null {
  let lo = 0;
  let hi = nums.length - 1;
  while (lo < hi) {
    const s = nums[lo]! + nums[hi]!;
    if (s === target) return [lo, hi];
    if (s < target) lo++;
    else hi--;
  }
  return null;
}

const MOVE_LO = 'move lo right';
const MOVE_HI = 'move hi left';

export const twoPointers: Program<PairInput> = {
  id: 'two-pointers',
  code,
  defaultInput: { nums: [1, 3, 4, 6, 8, 11], target: 10 },
  randomInput: (r) => {
    const nums = [...new Set(randomList(r, 8, 1, 20))].sort((a, b) => a - b).slice(0, randomInt(r, 5, 7));
    // Usually a reachable target, sometimes not, so both endings get practised.
    const target = r() < 0.75 ? nums[randomInt(r, 0, 1)]! + nums[randomInt(r, 2, nums.length - 1)]! : 2 * nums.at(-1)! + 1;
    return { nums, target };
  },
  describe: ({ nums, target }) => `nums = ${show(nums)}, target = ${target}`,
  reference: ({ nums, target }) => pairSum(nums, target),
  run({ nums, target }) {
    const t = new Tracer();
    const view = (lo: number, hi: number) => [
      { type: 'array' as const, label: 'nums (sorted)', values: nums, pointers: [{ name: 'lo', index: lo }, { name: 'hi', index: hi }], highlight: [lo, hi], range: [lo, hi] as [number, number] },
    ];
    let lo = 0;
    let hi = nums.length - 1;
    t.step(null, `Find two numbers in ${show(nums)} that add up to ${target}. The array is sorted, which is what makes two pointers work.`, { target }, view(lo, hi));
    t.step(2, 'Start one pointer at each end.', { lo, hi, target }, view(lo, hi));
    let pass = 0;
    while (lo < hi) {
      pass++;
      const s = nums[lo]! + nums[hi]!;
      t.step(4, `s = ${nums[lo]} + ${nums[hi]} = ${s}.`, { lo, hi, s, target }, view(lo, hi));
      if (s === target) {
        t.step(6, `${s} is the target: return [${lo}, ${hi}].`, { result: [lo, hi] }, view(lo, hi));
        return t.frames;
      }
      const tooSmall = s < target;
      const ask =
        pass <= 2
          ? predict(
              `s = ${s} and the target is ${target}. Which pointer moves?`,
              tooSmall ? MOVE_LO : MOVE_HI,
              tooSmall ? `${s} is too small. Moving lo right picks a bigger number (the array is sorted), so the sum grows.` : `${s} is too big. Moving hi left picks a smaller number, so the sum shrinks.`,
              [
                { value: tooSmall ? MOVE_HI : MOVE_LO, why: tooSmall ? 'Moving hi left makes the sum even smaller, but it is already too small.' : 'Moving lo right makes the sum bigger, but it is already too big.' },
                { value: 'move both', why: 'Moving both could skip the pair we need. One pointer at a time is enough.' },
              ],
              pass,
            )
          : undefined;
      if (tooSmall) {
        lo++;
        t.step(8, `${s} < ${target}: move lo right to a bigger number.`, { lo, hi, s, target }, view(lo, hi), ask);
      } else {
        hi--;
        t.step(10, `${s} > ${target}: move hi left to a smaller number.`, { lo, hi, s, target }, view(lo, hi), ask);
      }
    }
    t.step(11, `The pointers met: no pair adds up to ${target}. Return None.`, { result: null }, view(lo, hi));
    return t.frames;
  },
};

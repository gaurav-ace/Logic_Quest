import { predict, randomInt, randomList, show, Tracer } from '../tools';
import type { Program } from '../types';

// D14 "Binary search": in a sorted array, check the middle and throw away the half that can't
// hold the target. Each check halves what is left.

export interface SearchInput {
  nums: number[];
  target: number;
}

const code = [
  'def search(nums, target):',
  '    lo, hi = 0, len(nums) - 1',
  '    while lo <= hi:',
  '        mid = (lo + hi) // 2',
  '        if nums[mid] == target:',
  '            return mid',
  '        elif nums[mid] < target:',
  '            lo = mid + 1',
  '        else:',
  '            hi = mid - 1',
  '    return -1',
];

const RIGHT = 'search the right half';
const LEFT = 'search the left half';

export function binarySearchChecks(nums: number[], target: number): { index: number; checks: number } {
  let lo = 0;
  let hi = nums.length - 1;
  let checks = 0;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    checks++;
    if (nums[mid] === target) return { index: mid, checks };
    if (nums[mid]! < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return { index: -1, checks };
}

export const binarySearch: Program<SearchInput> = {
  id: 'binary-search',
  code,
  defaultInput: { nums: [2, 5, 8, 12, 16, 23, 38, 56, 72], target: 23 },
  randomInput: (r) => {
    const nums = [...new Set(randomList(r, 12, 1, 60))].sort((a, b) => a - b).slice(0, randomInt(r, 7, 10));
    return { nums, target: r() < 0.8 ? nums[randomInt(r, 0, nums.length - 1)]! : 61 };
  },
  describe: ({ nums, target }) => `nums = ${show(nums)}, target = ${target}`,
  reference: ({ nums, target }) => nums.indexOf(target),
  run({ nums, target }) {
    const t = new Tracer();
    const view = (lo: number, hi: number, mid?: number) => [
      {
        type: 'array' as const,
        label: 'nums (sorted; the dim part is ruled out)',
        values: nums,
        range: [lo, hi] as [number, number],
        pointers: [{ name: 'lo', index: lo }, { name: 'hi', index: hi }, ...(mid === undefined ? [] : [{ name: 'mid', index: mid }])].filter((p) => p.index >= 0 && p.index < nums.length),
        ...(mid === undefined ? {} : { highlight: [mid] }),
      },
    ];
    let lo = 0;
    let hi = nums.length - 1;
    t.step(null, `Find ${target} in ${nums.length} sorted numbers. Checking each in turn could take ${nums.length} checks; halving takes far fewer.`, { target }, view(lo, hi));
    t.step(2, 'The whole array is still in play.', { lo, hi, target }, view(lo, hi));
    let checks = 0;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      checks++;
      t.step(4, `mid = (${lo} + ${hi}) // 2 = ${mid}, and nums[${mid}] is ${nums[mid]}.`, { lo, hi, mid, 'nums[mid]': nums[mid]!, checks }, view(lo, hi, mid));
      if (nums[mid] === target) {
        t.step(6, `nums[${mid}] is ${target}: found it, at index ${mid}, after ${checks} check${checks === 1 ? '' : 's'}.`, { result: mid }, view(lo, hi, mid));
        return t.frames;
      }
      const goRight = nums[mid]! < target;
      const ask =
        checks <= 2
          ? predict(
              `nums[mid] is ${nums[mid]} and the target is ${target}. Where does the search go next?`,
              goRight ? RIGHT : LEFT,
              goRight ? `${nums[mid]} < ${target}, and everything left of mid is even smaller, so the target can only be to the right.` : `${nums[mid]} > ${target}, and everything right of mid is even bigger, so the target can only be to the left.`,
              [
                { value: goRight ? LEFT : RIGHT, why: goRight ? `Everything left of mid is smaller than ${nums[mid]}, so smaller than ${target} too.` : `Everything right of mid is bigger than ${nums[mid]}, so bigger than ${target} too.` },
                { value: 'check the next number along', why: 'Stepping one at a time throws away the advantage of sorting. Halving rules out half at once.' },
              ],
              checks,
            )
          : undefined;
      if (goRight) {
        lo = mid + 1;
        t.step(8, `${nums[mid]} < ${target}: rule out mid and everything left of it. lo = ${lo}.`, { lo, hi, checks }, view(lo, hi), ask);
      } else {
        hi = mid - 1;
        t.step(10, `${nums[mid]} > ${target}: rule out mid and everything right of it. hi = ${hi}.`, { lo, hi, checks }, view(lo, hi), ask);
      }
    }
    t.step(11, `lo passed hi: nothing is left, so ${target} isn't there. Return -1 after ${checks} checks.`, { result: -1 }, view(Math.min(lo, nums.length - 1), Math.max(hi, 0)));
    return t.frames;
  },
};

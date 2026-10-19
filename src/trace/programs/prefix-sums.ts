import { predict, randomInt, randomList, show, Tracer } from '../tools';
import type { Program } from '../types';

// D6 "Prefix sums": one pass builds P, then any range sum is a single subtraction.

export interface RangeInput {
  nums: number[];
  queries: [number, number][];
}

const code = [
  'P = [0]',
  'for x in nums:',
  '    P.append(P[-1] + x)',
  'def range_sum(l, r):',
  '    return P[r + 1] - P[l]',
];

export const prefixSums: Program<RangeInput> = {
  id: 'prefix-sums',
  code,
  defaultInput: { nums: [3, 1, 4, 1, 5, 9], queries: [[1, 3], [2, 5]] },
  randomInput: (r) => {
    const nums = randomList(r, randomInt(r, 5, 7), 1, 9);
    const q = (): [number, number] => {
      const l = randomInt(r, 0, nums.length - 2);
      return [l, randomInt(r, l + 1, nums.length - 1)];
    };
    return { nums, queries: [q(), q()] };
  },
  describe: ({ nums, queries }) => `nums = ${show(nums)}; sums of ${queries.map(([l, r]) => `nums[${l}..${r}]`).join(' and ')}`,
  reference: ({ nums, queries }) => queries.map(([l, r]) => nums.slice(l, r + 1).reduce((a, b) => a + b, 0)),
  run({ nums, queries }) {
    const t = new Tracer();
    const P = [0];
    const view = (hlNums: number[], hlP: number[]) => [
      { type: 'array' as const, label: 'nums', values: nums, highlight: hlNums },
      { type: 'array' as const, label: 'P (P[i] = sum of the first i items)', values: [...P], highlight: hlP },
    ];
    t.step(null, `Many range sums of ${show(nums)}. Build a running total once, then answer each one with a subtraction.`, {}, view([], []));
    t.step(1, 'P starts with 0: the sum of no items.', { P }, view([], [0]));
    for (const [i, x] of nums.entries()) {
      const next = P.at(-1)! + x;
      const ask =
        i === 2
          ? predict(
              `P is ${show(P)} and the next item is ${x}. What gets appended?`,
              next,
              `${P.at(-1)} + ${x} = ${next}: the running total so far.`,
              [
                { value: x, why: 'P holds running totals, not the items themselves.' },
                { value: P.at(-1)! + x + (P.at(-2) ?? 0), why: 'Only the last total and the new item are added.' },
              ],
              i,
            )
          : undefined;
      P.push(next);
      t.step(3, `P[${i + 1}] = P[${i}] + ${x} = ${next}.`, { x, P }, view([i], [i, i + 1]), ask);
    }
    const answers: number[] = [];
    queries.forEach(([l, r], qi) => {
      const ans = P[r + 1]! - P[l]!;
      const ask = predict(
        `Sum of nums[${l}..${r}]: P[${r + 1}] is ${P[r + 1]} and P[${l}] is ${P[l]}. What is the sum?`,
        ans,
        `${P[r + 1]} − ${P[l]} = ${ans}: everything up to index ${r}, minus everything before index ${l}.`,
        [
          { value: P[r]! - P[l]!, why: `P[${r}] stops before index ${r}. Use P[${r + 1}] to include nums[${r}].` },
          { value: P[r + 1]! - P[l + 1]!, why: `P[${l + 1}] already includes nums[${l}], so this subtracts it away.` },
          { value: P[r + 1]!, why: `That is the sum from the very start. Subtract P[${l}] to drop the items before index ${l}.` },
        ],
        10 + qi,
      );
      answers.push(ans);
      const span = Array.from({ length: r - l + 1 }, (_, k) => l + k);
      t.step(5, `range_sum(${l}, ${r}) = P[${r + 1}] − P[${l}] = ${P[r + 1]} − ${P[l]} = ${ans}. One step, however long the range.`, { l, r, answer: ans }, view(span, [l, r + 1]), ask);
    });
    t.step(null, `Answers: ${answers.join(', ')}. Building P took one pass; each query after that is instant.`, { result: answers }, view([], []));
    return t.frames;
  },
};

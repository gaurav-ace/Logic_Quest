import { predict, randomInt, randomList, show, Tracer } from '../tools';
import type { Program } from '../types';

// D10 "Monotonic stack": the next greater number for every item in one pass. The stack holds
// indexes still waiting for an answer, and their values only go down from bottom to top.

const code = [
  'def next_greater(nums):',
  '    ans = [-1] * len(nums)',
  '    stack = []  # waiting indexes',
  '    for i, x in enumerate(nums):',
  '        while stack and \\',
  '              nums[stack[-1]] < x:',
  '            ans[stack.pop()] = x',
  '        stack.append(i)',
  '    return ans',
];

export const nextGreater: Program<number[]> = {
  id: 'next-greater',
  code,
  defaultInput: [2, 7, 3, 5, 4, 6, 1],
  randomInput: (r) => randomList(r, randomInt(r, 5, 7), 1, 9),
  describe: (nums) => `nums = ${show(nums)}`,
  // Brute force: look right from every item.
  reference: (nums) => nums.map((x, i) => nums.slice(i + 1).find((y) => y > x) ?? -1),
  run(nums) {
    const t = new Tracer();
    const ans = nums.map(() => -1);
    const stack: number[] = [];
    const view = (i: number | null, hl: number[] = []) => [
      { type: 'array' as const, label: 'nums', values: nums, highlight: hl, ...(i === null ? {} : { pointers: [{ name: 'i', index: i }] }) },
      { type: 'stack' as const, label: 'stack (indexes waiting; their values)', items: stack.map((k) => `${k}: ${nums[k]}`), highlightTop: hl.length > 0 },
      { type: 'array' as const, label: 'ans', values: [...ans] },
    ];
    t.step(null, 'For each number, find the next number to its right that is bigger. Checking every pair is slow; a stack does it in one pass.', {}, view(null));
    t.step(3, 'ans starts as -1 everywhere (no greater number found yet), and the stack is empty.', { ans }, view(null));
    let asked = 0;
    for (const [i, x] of nums.entries()) {
      const resolved: number[] = [];
      while (stack.length && nums[stack.at(-1)!]! < x) {
        const k = stack.at(-1)!;
        const ask =
          asked < 2
            ? (asked++,
              predict(
                `x is ${x}. The top of the stack waits at index ${k} with value ${nums[k]}. What happens to it?`,
                `ans[${k}] = ${x}`,
                `${nums[k]} < ${x}, so ${x} is the first bigger number to its right: pop it and record ${x}.`,
                [
                  { value: 'it stays on the stack', why: `It stays only while the new number isn't bigger; ${x} is bigger than ${nums[k]}.` },
                  { value: `ans[${k}] = ${nums[k]}`, why: 'The answer is the bigger number that arrived, not its own value.' },
                ],
                i * 10 + k,
              ))
            : undefined;
        stack.pop();
        ans[k] = x;
        resolved.push(k);
        t.step(7, `${nums[k]} at index ${k} was waiting, and ${x} is bigger: ans[${k}] = ${x}. Pop it.`, { i, x, ans }, view(i, [k, i]), ask);
      }
      stack.push(i);
      t.step(8, resolved.length ? `Nothing left on the stack is smaller than ${x}; ${x} waits too.` : `${x} isn't bigger than the top, so it waits on the stack.`, { i, x, stack }, view(i, [i]));
    }
    t.step(9, `Done. Whatever is still waiting has no bigger number to its right, so it keeps -1. Each index was pushed and popped at most once.`, { result: ans }, view(null));
    return t.frames;
  },
};

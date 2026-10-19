import { predict, randomInt, randomList, show, Tracer } from '../tools';
import type { Program } from '../types';

// D11 "Queues and deques": the maximum of every window of k items. A deque (double-ended queue)
// keeps candidate indexes, biggest value at the front.

export interface WindowMaxInput {
  nums: number[];
  k: number;
}

const code = [
  'from collections import deque',
  'def window_max(nums, k):',
  '    q, out = deque(), []',
  '    for i, x in enumerate(nums):',
  '        while q and \\',
  '              nums[q[-1]] <= x:',
  '            q.pop()   # back',
  '        q.append(i)',
  '        if q[0] <= i - k:',
  '            q.popleft()  # front',
  '        if i >= k - 1:',
  '            out.append(nums[q[0]])',
  '    return out',
];

export const windowMax: Program<WindowMaxInput> = {
  id: 'window-max',
  code,
  defaultInput: { nums: [1, 3, 2, 5, 4, 1, 2], k: 3 },
  randomInput: (r) => ({ nums: randomList(r, randomInt(r, 6, 8), 1, 9), k: randomInt(r, 2, 3) }),
  describe: ({ nums, k }) => `nums = ${show(nums)}, k = ${k}`,
  reference: ({ nums, k }) => Array.from({ length: nums.length - k + 1 }, (_, i) => Math.max(...nums.slice(i, i + k))),
  run({ nums, k }) {
    const t = new Tracer();
    const q: number[] = [];
    const out: number[] = [];
    const view = (i: number | null, front = false, back = false) => [
      { type: 'array' as const, label: `nums (window of ${k})`, values: nums, ...(i === null ? {} : { range: [Math.max(0, i - k + 1), i] as [number, number], pointers: [{ name: 'i', index: i }] }) },
      { type: 'queue' as const, label: 'deque (index: value)', items: q.map((j) => `${j}: ${nums[j]}`), highlightFront: front, highlightBack: back },
      { type: 'array' as const, label: 'out (max of each window)', values: [...out] },
    ];
    t.step(null, `The biggest of every ${k} neighbours in ${show(nums)}. A deque can drop from both ends, which is exactly what's needed.`, {}, view(null));
    let asked = 0;
    for (const [i, x] of nums.entries()) {
      while (q.length && nums[q.at(-1)!]! <= x) {
        const j = q.at(-1)!;
        q.pop();
        t.step(7, `${nums[j]} (index ${j}) is not bigger than ${x}, and ${x} will stay in the window longer: ${nums[j]} can never be a maximum again. Drop it from the back.`, { i, x }, view(i, false, true));
      }
      q.push(i);
      t.step(8, `Add index ${i} (${x}) at the back.`, { i, x }, view(i, false, true));
      if (q[0]! <= i - k) {
        const j = q[0]!;
        q.shift();
        t.step(10, `Index ${j} has slid out of the window: drop it from the front.`, { i }, view(i, true));
      }
      if (i >= k - 1) {
        const m = nums[q[0]!]!;
        const ask =
          asked < 2 && i >= k
            ? (asked++,
              predict(
                `The window is ${show(nums.slice(i - k + 1, i + 1))}. What does out get?`,
                m,
                `The front of the deque is always the window's biggest: ${m}.`,
                [
                  { value: x, why: `${x} is the newest number, not necessarily the biggest.` },
                  { value: nums[i - k + 1]!, why: 'The oldest number in the window may have been beaten by a newer one.' },
                  { value: Math.max(...nums.slice(0, i + 1)), why: 'That looks at everything so far. Only the last k numbers count.' },
                ],
                i,
              ))
            : undefined;
        out.push(m);
        t.step(12, `The window ${show(nums.slice(i - k + 1, i + 1))} is full: its max is at the front, ${m}.`, { i, out }, view(i, true), ask);
      }
    }
    t.step(13, `Done: ${show(out)}. Each index entered and left the deque at most once.`, { result: out }, view(null));
    return t.frames;
  },
};

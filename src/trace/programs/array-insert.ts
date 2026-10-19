import { predict, randomInt, randomList, show, Tracer } from '../tools';
import type { Program } from '../types';

// D3 "Arrays": reading by index is instant, but inserting in the middle shifts everything after it.

export interface InsertInput {
  nums: number[];
  at: number;
  value: number;
}

const code = [
  'def insert(nums, at, value):',
  '    nums.append(None)',
  '    i = len(nums) - 1',
  '    while i > at:',
  '        nums[i] = nums[i - 1]',
  '        i -= 1',
  '    nums[at] = value',
];

export const arrayInsert: Program<InsertInput> = {
  id: 'array-insert',
  code,
  defaultInput: { nums: [10, 20, 30, 40, 50], at: 1, value: 15 },
  randomInput: (r) => {
    const nums = randomList(r, randomInt(r, 4, 6), 1, 9).map((x) => x * 10);
    return { nums, at: randomInt(r, 0, nums.length - 1), value: randomInt(r, 1, 9) * 10 + 5 };
  },
  describe: ({ nums, at, value }) => `insert ${value} at index ${at} of ${show(nums)}`,
  reference: ({ nums, at, value }) => [...nums.slice(0, at), value, ...nums.slice(at)],
  run({ nums: input, at, value }) {
    const t = new Tracer();
    const nums: (number | null)[] = [...input];
    const view = (hl: number[], i?: number) => [{ type: 'array' as const, label: 'nums', values: [...nums], highlight: hl, ...(i === undefined ? {} : { pointers: [{ name: 'i', index: i }] }) }];
    const shifts = input.length - at;
    t.step(null, `Reading nums[${at}] is one step, wherever it is. But putting ${value} at index ${at} means making room first.`, { at, value }, view([at]));
    const ask = predict(
      `How many items must move one place right to make room at index ${at}?`,
      shifts,
      `Every item from index ${at} to the end moves: ${input.length} − ${at} = ${shifts}. Inserting near the front of a long array is slow.`,
      [
        { value: 1, why: 'Only one item would move if we overwrote; inserting keeps them all, so each one after it shifts.' },
        { value: at, why: 'Items before the insert point stay put; it is the ones after it that move.' },
        { value: input.length, why: `Items before index ${at} don't move.` },
      ],
      1,
    );
    nums.push(null);
    t.step(2, 'Grow the array by one empty slot at the end.', { at, value }, view([nums.length - 1]), ask);
    let i = nums.length - 1;
    t.step(3, `i starts at the new last slot, ${i}.`, { i, at }, view([i], i));
    let moved = 0;
    while (i > at) {
      nums[i] = nums[i - 1]!;
      moved++;
      t.step(5, `Copy nums[${i - 1}] = ${nums[i]} one place right, into index ${i}.`, { i, at, moved }, view([i - 1, i], i));
      i--;
    }
    nums[at] = value;
    t.step(7, `i reached ${at}: write ${value} there. ${moved} item${moved === 1 ? '' : 's'} moved.`, { result: nums as number[] }, view([at]));
    return t.frames;
  },
};

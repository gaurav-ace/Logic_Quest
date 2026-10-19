import { predict, randomInt, randomList, show, Tracer } from '../tools';
import type { Program, Value } from '../types';

// L5 "Edge cases": run one small function on the inputs that usually break code.

const code = [
  'def average(nums):',
  '    total = 0',
  '    for x in nums:',
  '        total = total + x',
  '    return total / len(nums)',
];

/** Python prints a float like 5.0, not 5. JavaScript and Python agree on everything else here. */
export function pyFloat(v: number): string {
  return Number.isInteger(v) ? `${v}.0` : String(v);
}

export const DIVISION_ERROR = 'ZeroDivisionError';

/** What average() returns (or raises) in Python, as text. */
export function averageOf(nums: number[]): string {
  if (nums.length === 0) return DIVISION_ERROR;
  return pyFloat(nums.reduce((a, b) => a + b, 0) / nums.length);
}

const EDGE_CASES: number[][] = [[], [5], [-2, 2]];

export const edgeCases: Program<number[][]> = {
  id: 'edge-cases',
  code,
  defaultInput: [[2, 4, 9], ...EDGE_CASES],
  randomInput: (r) => [randomList(r, randomInt(r, 2, 4), 1, 9), ...EDGE_CASES].sort(() => r() - 0.5),
  describe: (cases) => `inputs: ${cases.map((c) => show(c)).join(', ')}`,
  reference: (cases) => cases.map(averageOf),
  run(cases) {
    const t = new Tracer();
    const results: Value[][] = [];
    const table = (hl?: number) => [
      { type: 'table' as const, label: 'Test results', columns: ['nums', 'average(nums)'], rows: results, ...(hl === undefined ? {} : { highlightRow: hl }) },
    ];
    t.step(null, 'The code looks fine for normal lists. Test the edge cases too: empty, one item, values that cancel out.', {}, table());
    cases.forEach((nums, n) => {
      let total = 0;
      t.step(2, `Test ${n + 1}: average(${show(nums)}). total starts at 0.`, { nums, total }, table());
      for (const x of nums) total += x;
      if (nums.length) t.step(4, `The loop adds every item: total = ${total}.`, { nums, total }, table());
      else t.step(3, 'The list is empty, so the loop body never runs. total is still 0.', { nums, total }, table());
      const result = averageOf(nums);
      results.push([nums, result]);
      const ask = predict(
        `What does average(${show(nums)}) give?`,
        result,
        nums.length === 0 ? 'len([]) is 0, and dividing by zero raises ZeroDivisionError. The fix is to decide what an empty list should mean before dividing.' : `${total} / ${nums.length} = ${result}.`,
        nums.length === 0
          ? [
              { value: '0.0', why: 'It never gets to return a value: total / 0 raises an error first.' },
              { value: 'None', why: 'Nothing returns None here; the division fails before return completes.' },
            ]
          : [
              { value: DIVISION_ERROR, why: `Only an empty list divides by zero. Here len(nums) is ${nums.length}.` },
              { value: pyFloat(total), why: `That is the total. The average divides it by len(nums) = ${nums.length}.` },
              { value: pyFloat(nums.reduce((a, b) => a + Math.abs(b), 0) / nums.length), why: 'Negative numbers count as negative; they are not turned positive.' },
            ],
        n,
      );
      t.step(5, nums.length === 0 ? 'Line 5 divides by len(nums), which is 0: ZeroDivisionError. This edge case crashes.' : `Line 5: ${total} / ${nums.length} = ${result}.`, { nums, total, 'len(nums)': nums.length }, table(results.length - 1), ask);
    });
    const crashes = results.filter((r) => r[1] === DIVISION_ERROR).length;
    t.step(null, `${crashes} of ${cases.length} tests ${crashes === 1 ? 'crashes' : 'crash'}: the empty list. Edge cases are where bugs hide; test them on purpose.`, { result: results.map((r) => r[1]!) }, table());
    return t.frames;
  },
};

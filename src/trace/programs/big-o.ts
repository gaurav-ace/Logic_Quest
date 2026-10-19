import { predict, Tracer } from '../tools';
import type { Program, Value } from '../types';

// D1 "Big-O by counting": count the steps three loops take as n grows, instead of timing them.

const code = [
  'def linear(n):',
  '    for i in range(n): step()',
  'def pairs(n):',
  '    for i in range(n):',
  '        for j in range(n): step()',
  'def halving(n):',
  '    while n > 1:',
  '        n = n // 2; step()',
];

export const countLinear = (n: number) => n;
export const countPairs = (n: number) => n * n;
export function countHalving(n: number): number {
  let steps = 0;
  while (n > 1) {
    n = Math.floor(n / 2);
    steps++;
  }
  return steps;
}

export const bigO: Program<number[]> = {
  id: 'big-o',
  code,
  defaultInput: [4, 8, 16],
  randomInput: (r) => {
    const start = [2, 3, 4, 5][Math.floor(r() * 4)]!;
    return [start, start * 2, start * 4];
  },
  describe: (sizes) => `n = ${sizes.join(', then ')}`,
  reference: (sizes) => sizes.map((n) => [countLinear(n), countPairs(n), countHalving(n)]),
  run(sizes) {
    const t = new Tracer();
    const rows: Value[][] = [];
    const table = (hl?: number) => [{ type: 'table' as const, label: 'Steps counted', columns: ['n', 'linear', 'pairs', 'halving'], rows, ...(hl === undefined ? {} : { highlightRow: hl }) }];
    t.step(null, 'Time depends on the computer, but the number of steps does not. Count steps for each function as n grows.', { sizes }, table());
    sizes.forEach((n, k) => {
      const prev = rows.at(-1);
      const lin = countLinear(n);
      const sq = countPairs(n);
      const half = countHalving(n);
      t.step(2, `linear(${n}) runs its loop once per item: ${lin} steps.`, { n, linear: lin }, table());
      const pairAsk =
        prev && k > 0
          ? predict(
              `n went from ${prev[0]} to ${n} (doubled). pairs(${prev[0]}) took ${prev[2]} steps. How many does pairs(${n}) take?`,
              sq,
              `pairs runs n × n steps: ${n} × ${n} = ${sq}. Doubling n makes it 4 times as many: that is O(n²).`,
              [
                { value: (prev[2] as number) * 2, why: 'Doubling only works for the linear loop. Here both loops get longer, so it grows 4 times.' },
                { value: (prev[2] as number) + 1, why: 'Adding one step is how halving grows. pairs grows with n × n.' },
                { value: n * 2, why: `That's 2n. The inner loop runs n times for each of n outer passes: n × n.` },
              ],
              k,
            )
          : undefined;
      t.step(5, `pairs(${n}): for each of ${n} values of i, the inner loop runs ${n} times. ${n} × ${n} = ${sq} steps.`, { n, linear: lin, pairs: sq }, table(), pairAsk);
      const halfAsk =
        prev && k > 0
          ? predict(
              `halving(${prev[0]}) took ${prev[3]} steps. How many does halving(${n}) take?`,
              half,
              `${n} halves to ${n >> 1}, and from there it's the same as before: one more step. That is O(log n).`,
              [
                { value: (prev[3] as number) * 2, why: 'Doubling n adds just one halving: the first halving brings it back to the old n.' },
                { value: n / 2, why: `halving does not take n / 2 steps; it halves n each step, so it takes about log₂ n steps.` },
              ],
              k + 10,
            )
          : undefined;
      rows.push([n, lin, sq, half]);
      t.step(8, `halving(${n}) halves n until it reaches 1: ${half} steps.`, { n, linear: lin, pairs: sq, halving: half }, table(rows.length - 1), halfAsk);
    });
    t.step(null, 'Pattern: doubling n doubles linear (O(n)), quadruples pairs (O(n²)), and adds one step to halving (O(log n)). That growth is what Big-O describes.', { result: rows.map((r) => r.slice(1)) }, table());
    return t.frames;
  },
};

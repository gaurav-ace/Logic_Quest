import { predict, randomInt, Tracer } from '../tools';
import type { Program, Value } from '../types';

// L2 "Spot the pattern": add up odd numbers and notice the totals are square numbers.

const code = [
  'def sum_odds(n):',
  '    total = 0',
  '    for k in range(1, n + 1):',
  '        odd = 2 * k - 1',
  '        total = total + odd',
  '    return total',
];

export const sumOdds: Program<number> = {
  id: 'sum-odds',
  code,
  defaultInput: 6,
  randomInput: (r) => randomInt(r, 4, 8),
  describe: (n) => `n = ${n}`,
  reference(n) {
    let total = 0;
    for (let k = 1; k <= n; k++) total += 2 * k - 1;
    return total;
  },
  run(n) {
    const t = new Tracer();
    const rows: Value[][] = [];
    const table = (highlightRow?: number, squares = false) => [
      {
        type: 'table' as const,
        label: 'What happened so far',
        columns: squares ? ['k', 'odd', 'total', 'k × k'] : ['k', 'odd', 'total'],
        rows: squares ? rows.map((r) => [...r, (r[0] as number) ** 2]) : rows,
        ...(highlightRow === undefined ? {} : { highlightRow }),
      },
    ];
    t.step(null, `sum_odds(${n}) adds the first ${n} odd numbers: 1 + 3 + 5 + … Watch the totals for a pattern.`, { n }, table());
    let total = 0;
    t.step(2, 'total starts at 0.', { total }, table());
    for (let k = 1; k <= n; k++) {
      const odd = 2 * k - 1;
      t.step(4, `k = ${k}, so the next odd number is 2 × ${k} − 1 = ${odd}.`, { k, odd, total }, table());
      const before = total;
      total += odd;
      rows.push([k, odd, total]);
      // Ask once the learner has seen a few totals (1, 4, 9 ...), so there is a pattern to spot.
      const ask =
        k === 4 || k === n
          ? predict(
              `total is ${before} and odd is ${odd}. What is total after line 5?`,
              total,
              `${before} + ${odd} = ${total}. Notice: that is ${k} × ${k}.`,
              [
                { value: before + odd - 2, why: `odd is ${odd} this time (2 × ${k} − 1), not ${odd - 2}.` },
                { value: before + 2 * k, why: `The odd number is 2 × ${k} − 1 = ${odd}, not 2 × ${k}.` },
                { value: k * (k + 1), why: `That is ${k} × ${k + 1}. Add it up: ${before} + ${odd} = ${total}.` },
              ],
              k,
            )
          : undefined;
      t.step(5, `total = ${before} + ${odd} = ${total}.`, { k, odd, total }, table(rows.length - 1), ask);
    }
    const tenth = predict(
      `The totals were ${rows.map((r) => r[2]).join(', ')}. Without running it, what would sum_odds(10) return?`,
      100,
      'Every total is k × k (a square number), so 10 odd numbers add up to 10 × 10.',
      [
        { value: 90, why: 'That is 9 × 10. The pattern is k × k: 10 × 10.' },
        { value: 55, why: 'That is 1 + 2 + … + 10, which adds every number. Only odd numbers are added here.' },
        { value: 110, why: 'That is 10 × 11. The pattern is k × k: 10 × 10.' },
      ],
      99,
    );
    t.step(null, `Spot the pattern: each total is k × k, a square number. So sum_odds(10) would be 100, without running it.`, { total }, table(undefined, true), tenth);
    t.step(6, `The function returns ${total}, which is ${n} × ${n}.`, { result: total }, table(undefined, true));
    return t.frames;
  },
};

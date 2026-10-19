import { predict, randomInt, show, Tracer } from '../tools';
import type { Program, Value } from '../types';

// D30 "Dynamic programming": fewest coins to make an amount. Each answer is built from smaller
// answers already in the table, so nothing is worked out twice.

export interface CoinInput {
  coins: number[];
  amount: number;
}

const code = [
  'def min_coins(coins, amt):',
  '    d = [0] + [INF] * amt',
  '    for a in range(1, amt + 1):',
  '        for c in coins:',
  '            if c > a: continue',
  '            use = d[a - c] + 1',
  '            d[a] = min(d[a], use)',
  '    return d[amt]',
];

/** Fewest coins by breadth-first search over amounts (a different method from the table). */
export function fewestCoinsBfs(coins: number[], amount: number): number {
  const seen = new Map([[0, 0]]);
  const q = [0];
  while (q.length) {
    const x = q.shift()!;
    if (x === amount) return seen.get(x)!;
    for (const c of coins) {
      const y = x + c;
      if (y <= amount && !seen.has(y)) {
        seen.set(y, seen.get(x)! + 1);
        q.push(y);
      }
    }
  }
  return -1;
}

/** Always take the biggest coin that fits: fast, but not always fewest. */
export function greedyCoins(coins: number[], amount: number): number {
  let n = 0;
  for (const c of [...coins].sort((a, b) => b - a)) {
    n += Math.floor(amount / c);
    amount %= c;
  }
  return amount === 0 ? n : -1;
}

export const coinChange: Program<CoinInput> = {
  id: 'coin-change',
  code,
  defaultInput: { coins: [1, 3, 4], amount: 6 },
  randomInput: (r) => ({ coins: [1, ...[...new Set([randomInt(r, 2, 4), randomInt(r, 5, 7)])]], amount: randomInt(r, 6, 10) }),
  describe: ({ coins, amount }) => `coins ${show(coins)}, amount ${amount}`,
  reference: ({ coins, amount }) => fewestCoinsBfs(coins, amount),
  run({ coins, amount }) {
    const t = new Tracer();
    const d: (number | string)[] = [0, ...Array.from({ length: amount }, () => '∞')];
    const num = (v: number | string) => (typeof v === 'number' ? v : Infinity);
    const table = (cell?: number) => [
      {
        type: 'table' as const,
        label: 'd[a] = fewest coins that make a',
        columns: ['a', ...Array.from({ length: amount + 1 }, (_, a) => String(a))],
        rows: [['d', ...d] as Value[]],
        ...(cell === undefined ? {} : { highlightCell: [0, cell + 1] as [number, number] }),
      },
    ];
    const greedy = greedyCoins(coins, amount);
    t.step(null, `Fewest coins from ${show(coins)} that make ${amount}. Taking the biggest coin each time would use ${greedy}; is that the best? Build the answer up from smaller amounts.`, {}, table());
    t.step(2, 'd[0] = 0 (no coins for nothing); everything else starts at ∞.', {}, table(0));
    let asked = 0;
    for (let a = 1; a <= amount; a++) {
      for (const c of coins) {
        if (c > a) continue;
        const use = num(d[a - c]!) + 1;
        const before = num(d[a]!);
        const after = Math.min(before, use);
        const ask =
          asked < 2 && a >= 3 && before !== Infinity
            ? (asked++,
              predict(
                `For a = ${a}: d[${a}] is ${before} so far. Using a ${c} coin gives d[${a - c}] + 1 = ${use}. What is d[${a}] now?`,
                after,
                use < before ? `${use} < ${before}: using a ${c} coin is better.` : `${use} isn't fewer than ${before}, so keep ${before}.`,
                [
                  { value: use < before ? before : use, why: 'Keep whichever is smaller.' },
                  { value: before + use, why: 'This is a choice between two ways, not a total of both.' },
                ],
                asked * 10 + a,
              ))
            : undefined;
        d[a] = after;
        t.step(7, `a = ${a}, coin ${c}: d[${a - c}] + 1 = ${use}${use <= before ? '' : ` (not better than ${before})`}. d[${a}] = ${after}.`, { a, c, use, [`d[${a}]`]: after }, table(a), ask);
      }
    }
    const result = num(d[amount]!);
    const verdict = greedy === result ? 'Here the biggest-coin-first answer happens to be just as good.' : `Biggest-coin-first would use ${greedy}: greedy is not always best, but the table is.`;
    t.step(8, `d[${amount}] = ${result}. ${verdict}`, { result }, table(amount));
    return t.frames;
  },
};

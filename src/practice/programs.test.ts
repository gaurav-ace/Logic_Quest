import { describe, expect, it } from 'vitest';
import { seeded } from '../trace/tools';
import { NEVER_ENDS, PROGRAMS, floorDiv } from './programs';

const RUNS = 200;
const each = (id: string, fn: (input: unknown) => void) => {
  const r = seeded(7);
  for (let k = 0; k < RUNS; k++) fn(PROGRAMS[id]!.random(r));
};

// Independent references: written differently from the fixed versions on purpose.
describe('fixed versions match an independent reference on random inputs', () => {
  it('fence-posts', () =>
    each('fence-posts', (i) => {
      const [len, gap] = i as [number, number];
      const posts = Array.from({ length: len + 1 }, (_, m) => m).filter((m) => m % gap === 0).length;
      expect(PROGRAMS['fence-posts']!.fixed(i)).toBe(String(posts));
    }));

  it('contains-last', () =>
    each('contains-last', (i) => {
      const [xs, t] = i as [number[], number];
      expect(PROGRAMS['contains-last']!.fixed(i)).toBe(xs.includes(t) ? 'True' : 'False');
    }));

  it('remove-while-looping', () =>
    each('remove-while-looping', (i) => {
      const odd = (i as number[]).filter((x) => x % 2 === 1);
      expect(PROGRAMS['remove-while-looping']!.fixed(i)).toBe(`[${odd.join(', ')}]`);
    }));

  it('binary-search-stuck', () =>
    each('binary-search-stuck', (i) => {
      const [xs, t] = i as [number[], number];
      expect(PROGRAMS['binary-search-stuck']!.fixed(i)).toBe(String(xs.indexOf(t)));
    }));

  it('factorial-base-case', () =>
    each('factorial-base-case', (i) => {
      let f = 1;
      for (let k = 2; k <= (i as number); k++) f *= k;
      expect(PROGRAMS['factorial-base-case']!.fixed(i)).toBe(String(f));
    }));

  it('greedy-coins (fixed = fewest coins, by trying every combination)', () =>
    each('greedy-coins', (i) => {
      const [coins, amount] = i as [number[], number];
      // Breadth-first over amounts: the first time we reach `amount` uses the fewest coins.
      let level = new Set([0]);
      let answer = amount === 0 ? 0 : -1;
      for (let n = 1; answer < 0 && n <= amount; n++) {
        level = new Set([...level].flatMap((a) => coins.map((c) => a + c)).filter((a) => a <= amount));
        if (level.has(amount)) answer = n;
      }
      expect(PROGRAMS['greedy-coins']!.fixed(i)).toBe(String(answer));
    }));

  it('lru-get-no-touch (fixed = evict whichever key was used longest ago)', () =>
    each('lru-get-no-touch', (i) => {
      const { capacity, ops } = i as { capacity: number; ops: ['put' | 'get', string][] };
      const lastUse = new Map<string, number>();
      ops.forEach(([op, k], t) => {
        if (op === 'get' && !lastUse.has(k)) return;
        lastUse.set(k, t);
        if (lastUse.size > capacity) lastUse.delete([...lastUse].sort((a, b) => a[1] - b[1])[0]![0]);
      });
      const keys = [...lastUse].sort((a, b) => a[1] - b[1]).map(([k]) => `'${k}'`);
      expect(PROGRAMS['lru-get-no-touch']!.fixed(i)).toBe(`[${keys.join(', ')}]`);
    }));

  it('oversell-race (fixed never sells more than the stock)', () =>
    each('oversell-race', (i) => {
      const { stock, buyers } = i as { stock: number; buyers: number };
      const sold = Math.min(stock, buyers);
      expect(PROGRAMS['oversell-race']!.fixed(i)).toBe(`sold ${sold}, stock ${stock - sold}`);
    }));

  it('agent-no-step-limit (fixed always stops within 8 steps)', () =>
    each('agent-no-step-limit', (i) => {
      const out = PROGRAMS['agent-no-step-limit']!.fixed(i);
      const f = (i as { failures: number | 'always' }).failures;
      expect(out).toBe(f !== 'always' && f + 1 <= 8 ? `done in ${f + 1} step${f === 0 ? '' : 's'}` : 'stopped at the step limit (8 steps)');
    }));
});

describe('the bugs really are bugs', () => {
  it('each buggy version differs from its fix on some random input', () => {
    for (const id of Object.keys(PROGRAMS)) {
      if (id === 'mutable-default' || id === 'shared-class-list') continue; // covered below
      const r = seeded(11);
      let differs = false;
      for (let k = 0; k < RUNS && !differs; k++) {
        const input = PROGRAMS[id]!.random(r);
        differs = PROGRAMS[id]!.buggy(input) !== PROGRAMS[id]!.fixed(input);
      }
      expect(differs, id).toBe(true);
    }
  });

  it('Python facts the copies rely on', () => {
    expect(floorDiv(-7, 2)).toBe(-4); // Python: -7 // 2 == -4
    expect(PROGRAMS['remove-while-looping']!.buggy([2, 4, 5, 6])).toBe('[4, 5]');
    expect(PROGRAMS['binary-search-stuck']!.buggy([[1, 3, 5, 7], 7])).toBe(NEVER_ENDS);
    expect(PROGRAMS['factorial-base-case']!.buggy(0)).toBe('RecursionError');
    expect(PROGRAMS['greedy-coins']!.buggy([[1, 3, 4], 6])).toBe('3');
    expect(PROGRAMS['greedy-coins']!.fixed([[1, 3, 4], 6])).toBe('2');
    expect(PROGRAMS['mutable-default']!.buggy(['tea', 'milk'])).toBe("['tea', 'milk']");
    expect(PROGRAMS['mutable-default']!.fixed(['tea', 'milk'])).toBe("['milk']");
    expect(PROGRAMS['shared-class-list']!.buggy([['pen'], ['cup']])).toBe("['pen', 'cup']");
    expect(PROGRAMS['lru-get-no-touch']!.buggy({ capacity: 2, ops: [['put', 'a'], ['put', 'b'], ['get', 'a'], ['put', 'c']] })).toBe("['b', 'c']");
    expect(PROGRAMS['lru-get-no-touch']!.fixed({ capacity: 2, ops: [['put', 'a'], ['put', 'b'], ['get', 'a'], ['put', 'c']] })).toBe("['a', 'c']");
    expect(PROGRAMS['oversell-race']!.buggy({ stock: 1, buyers: 2 })).toBe('sold 2, stock -1');
    expect(PROGRAMS['agent-no-step-limit']!.buggy({ failures: 'always' })).toBe(NEVER_ENDS);
  });

  it('every program shows its input and runs on its own random inputs without throwing', () => {
    for (const [id, p] of Object.entries(PROGRAMS)) {
      const r = seeded(3);
      for (let k = 0; k < 50; k++) {
        const input = p.random(r);
        expect(typeof p.show(input), id).toBe('string');
        expect(() => p.buggy(input), id).not.toThrow();
      }
    }
  });
});

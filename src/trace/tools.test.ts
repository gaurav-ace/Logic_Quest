import { describe, expect, it } from 'vitest';
import { predict, randomInt, seeded, show } from './tools';

describe('seeded', () => {
  it('repeats the same numbers for the same seed, in [0, 1)', () => {
    const a = seeded(42);
    const b = seeded(42);
    const xs = Array.from({ length: 100 }, a);
    expect(xs).toEqual(Array.from({ length: 100 }, b));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(new Set(xs).size).toBeGreaterThan(90);
  });

  it('randomInt stays inside its bounds and reaches both ends', () => {
    const r = seeded(7);
    const seen = new Set(Array.from({ length: 500 }, () => randomInt(r, 3, 6)));
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });
});

describe('show', () => {
  it('prints values the way the Python-like code would', () => {
    expect(show([1, [2, 3]])).toBe('[1, [2, 3]]');
    expect(show(null)).toBe('None');
    expect(show(true)).toBe('True');
    expect(show('a')).toBe('a');
  });
});

describe('predict', () => {
  it('always includes the right answer, once, with every option explained', () => {
    for (let seed = 0; seed < 50; seed++) {
      const q = predict('best?', 8, 'It is the largest so far.', [{ value: 3, why: 'old' }, { value: 9, why: 'off by one' }], seed)!;
      expect(q.options[q.answer]!.text).toBe('8');
      expect(q.options.filter((o) => o.text === '8')).toHaveLength(1);
      expect(q.options.every((o) => o.explanation.length > 4)).toBe(true);
    }
  });

  it('drops distractors equal to the answer or to each other', () => {
    const q = predict('x?', 5, 'r', [{ value: 5, why: 'same' }, { value: 4, why: 'a' }, { value: 4, why: 'b' }], 1)!;
    expect(q.options.map((o) => o.text).sort()).toEqual(['4', '5']);
  });

  it('gives no question when every distractor coincides with the answer', () => {
    expect(predict('x?', 5, 'r', [{ value: 5, why: 'same' }], 1)).toBeUndefined();
  });

  it('keeps at most 4 options', () => {
    const q = predict('x?', 0, 'r', [1, 2, 3, 4, 5].map((v) => ({ value: v, why: 'w' })), 3)!;
    expect(q.options).toHaveLength(4);
  });

  it('moves the right answer around across seeds', () => {
    const positions = new Set(Array.from({ length: 30 }, (_, s) => predict('x?', 0, 'r', [{ value: 1, why: 'w' }, { value: 2, why: 'w' }], s)!.answer));
    expect(positions.size).toBeGreaterThan(1);
  });
});

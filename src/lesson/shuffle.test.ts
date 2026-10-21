import { describe, expect, it } from 'vitest';
import { loadCatalog } from './catalog';
import { inSeededOrder, seededOrder } from './shuffle';

describe('seeded option order', () => {
  it('is a permutation of every index, for any size', () => {
    for (let n = 0; n <= 8; n++) {
      for (const seed of ['a', 'What is a cache?', '']) expect([...seededOrder(n, seed)].sort((x, y) => x - y)).toEqual([...Array(n).keys()]);
    }
  });

  it('is the same every time for the same seed, so a redraw never moves the options', () => {
    expect(seededOrder(4, 'Why least connections?')).toEqual(seededOrder(4, 'Why least connections?'));
    expect(inSeededOrder(['a', 'b', 'c', 'd'], 'q')).toEqual(inSeededOrder(['a', 'b', 'c', 'd'], 'q'));
  });

  it('spreads the right answer over the positions across the real course', () => {
    // Before this change the right answer was first in most older questions (149 of 168).
    const questions = loadCatalog().flatMap((l) => l.quiz);
    const firstShown = questions.filter((q) => seededOrder(q.options.length, q.prompt)[0] === q.answer).length;
    expect(questions.length).toBeGreaterThan(150);
    // A fair shuffle of 3–4 options puts it first about a quarter to a third of the time.
    expect(firstShown / questions.length).toBeLessThan(0.45);
    const positions = new Set(questions.map((q) => seededOrder(q.options.length, q.prompt).indexOf(q.answer)));
    expect(positions.size).toBeGreaterThanOrEqual(3);
  });
});

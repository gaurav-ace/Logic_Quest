import { describe, expect, it } from 'vitest';
import { seeded } from '../tools';
import { averageOf, DIVISION_ERROR, edgeCases } from './edge-cases';
import { estimate } from './estimate';
import { fencePosts } from './fence-posts';
import { invariant, invariantHolds } from './invariant';
import { sumOdds } from './sum-odds';
import { backwards, workBackwards } from './work-backwards';

// The facts each lesson teaches, checked on far more cases than the lesson shows
// (CLAUDE.md section 5: lesson facts must hold, not just look right).

const resultOf = <I>(p: { run(i: I): { vars: [string, unknown][] }[] }, input: I) => p.run(input).at(-1)!.vars.find(([n]) => n === 'result')![1];

describe('lesson claims', () => {
  it('sum of the first n odd numbers is n × n, for n = 1 to 1000', () => {
    for (let n = 1; n <= 1000; n++) expect(sumOdds.reference(n)).toBe(n * n);
    for (let n = 1; n <= 30; n++) expect(resultOf(sumOdds, n)).toBe(n * n);
  });

  it('a fence of length L with posts at every metre, both ends included, has L + 1 posts', () => {
    for (let L = 0; L <= 200; L++) expect(fencePosts.reference(L)).toBe(L + 1);
    for (let L = 1; L <= 20; L++) expect(resultOf(fencePosts, L)).toBe(L + 1);
  });

  it('average() matches Python: float output, and only the empty list raises', () => {
    expect(averageOf([])).toBe(DIVISION_ERROR);
    expect(averageOf([5])).toBe('5.0');
    expect(averageOf([-2, 2])).toBe('0.0');
    expect(averageOf([2, 4, 9])).toBe('5.0');
    expect(averageOf([1, 2])).toBe('1.5');
    expect(averageOf([1, 1, 2])).toBe('1.3333333333333333'); // Python: 4/3 prints 1.3333333333333333
    expect(resultOf(edgeCases, edgeCases.defaultInput)).toEqual(['5.0', DIVISION_ERROR, '5.0', '0.0']);
  });

  it('the running-total invariant holds at every check, for many lists', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const nums = invariant.randomInput(seeded(seed));
      let total = 0;
      for (let i = 0; i < nums.length; i++) {
        expect(invariantHolds(nums, i, total)).toBe(true);
        total += nums[i]!;
      }
      expect(invariantHolds(nums, nums.length, total)).toBe(true);
      // and the trace says "True." at every check
      for (const f of invariant.run(nums).filter((f) => f.line === 4)) expect(f.caption.endsWith('True.')).toBe(true);
    }
  });

  it('working backwards gives the fewest presses (checked by breadth-first search) and really reaches n', () => {
    const N = 600;
    // Shortest number of presses from 1 to every n <= N, by breadth-first search over +1 and ×2.
    const dist = new Array<number>(N + 1).fill(Infinity);
    dist[1] = 0;
    const queue = [1];
    for (let q = 0; q < queue.length; q++) {
      const x = queue[q]!;
      for (const y of [x + 1, x * 2]) {
        if (y <= N && dist[y] === Infinity) {
          dist[y] = dist[x]! + 1;
          queue.push(y);
        }
      }
    }
    for (let n = 1; n <= N; n++) {
      const steps = backwards(n);
      expect(steps.length, `n = ${n}`).toBe(dist[n]);
      let x = 1;
      for (const s of steps) x = s === '×2' ? x * 2 : x + 1;
      expect(x, `n = ${n}`).toBe(n);
    }
    expect(resultOf(workBackwards, 22)).toEqual(backwards(22));
  });

  it('the estimate multiplies and converts units exactly', () => {
    expect(estimate.reference(estimate.defaultInput)).toBe(600);
    expect(resultOf(estimate, { users: 10_000, photosEach: 1, kbEach: 100 })).toBe(1);
    expect(resultOf(estimate, { users: 10_000_000, photosEach: 5, kbEach: 500 })).toBe(25_000);
  });
});

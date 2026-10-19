import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../lesson/catalog';
import type { Challenge, SimLesson } from '../lesson/schema';
import { getModel } from './registry';
import { goalMet, runSim } from './runner';
import { defaults, type Params } from './types';

// Every challenge must be winnable (its hidden solution reaches the goal) and must actually be a
// challenge (the starting setup alone does not). The app runs challenge k with seed 1 + k, so that
// exact run is checked, plus other seeds for the solution.

const RUN_MS = 40_000;
const sims = loadCatalog().filter((l): l is SimLesson => l.kind === 'sim');

function attempt(lesson: SimLesson, index: number, extra: Params, seed: number): boolean {
  const model = getModel(lesson.model)!;
  const c: Challenge = lesson.challenges[index]!;
  const params = { ...defaults(model.controls), ...lesson.params, ...c.setup?.params, ...extra };
  const actions = c.setup?.actions ?? [];
  const countFrom = Math.max(0, ...actions.map((a) => a.at)) / 1000;
  const samples = runSim(model, params, seed, RUN_MS, actions).filter((s) => s.t > countFrom);
  // Same rule as the app: counting starts after the last setup action.
  return goalMet(samples, c.goal);
}

describe.each(sims.flatMap((l) => l.challenges.map((c, i) => [l.id, c.id, l, i] as const)))('%s / %s', (_l, _c, lesson, index) => {
  it('the solution reaches the goal (the app\'s run, and two other seeds)', () => {
    const solution = lesson.challenges[index]!.solution;
    for (const seed of [1 + index, 101, 202]) expect(attempt(lesson, index, solution, seed), `seed ${seed}`).toBe(true);
  });

  it('the starting setup alone does not reach the goal', () => {
    expect(attempt(lesson, index, {}, 1 + index)).toBe(false);
  });

  it('the solution only changes controls the learner is allowed to change', () => {
    const c = lesson.challenges[index]!;
    for (const k of Object.keys(c.solution)) expect(c.setup?.lock ?? [], k).not.toContain(k);
  });
});

import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../lesson/catalog';
import type { AgentLesson } from '../lesson/schema';
import { challengePasses } from './challenge';
import { getScenario } from './registry';

// Every agent challenge must be winnable (its hidden solution meets every goal) and must really
// be a challenge (the setup alone doesn't). Runs are deterministic, so one run decides each.

const lessons = loadCatalog().filter((l): l is AgentLesson => l.kind === 'agent');

describe.each(lessons.flatMap((l) => l.challenges.map((c) => [l.id, c.id, l, c] as const)))('%s / %s', (_l, _c, lesson, c) => {
  const scenario = getScenario(lesson.scenario)!;

  it('the solution meets every goal', () => {
    expect(challengePasses(scenario, lesson.params, c, c.solution)).toBe(true);
  });

  it('the setup alone does not', () => {
    expect(challengePasses(scenario, lesson.params, c, {})).toBe(false);
  });

  it('the solution only changes settings the learner may change', () => {
    for (const k of Object.keys(c.solution)) expect(c.setup?.lock ?? [], k).not.toContain(k);
  });
});

it('there is at least one agent lesson', () => {
  expect(lessons.length).toBeGreaterThan(0);
});

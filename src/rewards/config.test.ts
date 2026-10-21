import { describe, expect, it } from 'vitest';
import raw from './rewards.config.json';
import { validateConfig } from './config';

const cfg = (): Record<string, unknown> => structuredClone(raw) as Record<string, unknown>;
const problems = (c: unknown): string => {
  try {
    validateConfig(c);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('expected an invalid config');
};

describe('rewards config', () => {
  it('the shipped config is valid', () => {
    expect(() => validateConfig(cfg())).not.toThrow();
  });

  it('first try must earn at least as much as a retry', () => {
    expect(problems({ ...cfg(), xp: { firstTry: 5, afterRetry: 10, lessonComplete: 10 } })).toContain('first try earns the most');
  });

  it('rejects negative or fractional amounts', () => {
    expect(problems({ ...cfg(), coins: { perGoalDay: -1, bufferCost: 15, breakCost: 25 } })).toContain('coins.perGoalDay');
    expect(problems({ ...cfg(), xp: { firstTry: 10, afterRetry: 2.5, lessonComplete: 10 } })).toContain('xp.afterRetry');
  });

  it('levels must start at 0 and increase', () => {
    expect(problems({ ...cfg(), levels: [10, 20] })).toContain('levels');
    expect(problems({ ...cfg(), levels: [0, 50, 40] })).toContain('increasing');
  });

  it('daily goal default must sit between min and max', () => {
    expect(problems({ ...cfg(), dailyGoal: { default: 5, min: 1, max: 3 } })).toContain('dailyGoal');
    expect(problems({ ...cfg(), dailyGoal: { default: 0, min: 0, max: 3 } })).toContain('dailyGoal');
  });

  it('review intervals must be whole days that grow; session sizes at least 1', () => {
    const review = (r: object) => ({ ...cfg(), review: { intervals: [1, 3, 7], sessionMax: 10, goalReviews: 5, ...r } });
    expect(() => validateConfig(review({}))).not.toThrow();
    expect(problems(review({ intervals: [] }))).toContain('review.intervals');
    expect(problems(review({ intervals: [1, 3, 3] }))).toContain('increasing');
    expect(problems(review({ intervals: [0, 2] }))).toContain('review.intervals');
    expect(problems(review({ intervals: [1, 2.5] }))).toContain('review.intervals');
    expect(problems(review({ sessionMax: 0 }))).toContain('review.sessionMax');
    expect(problems(review({ goalReviews: 1.5 }))).toContain('review.goalReviews');
    expect(problems({ ...cfg(), review: undefined })).toContain('review.intervals');
  });

  it('rejects duplicate badge ids, unknown rules and unknown tracks', () => {
    const c = cfg();
    const badges = c.badges as Record<string, unknown>[];
    expect(problems({ ...c, badges: [...badges, badges[0]] })).toContain('duplicate badge id "first-lesson"');
    expect(problems({ ...c, badges: [{ ...badges[0], rule: { type: 'speedrun' } }] })).toContain('unknown badge rule');
    expect(problems({ ...c, badges: [{ ...badges[0], rule: { type: 'track', track: 'cooking' } }] })).toContain('rule.track');
    expect(problems({ ...c, badges: [{ ...badges[0], rule: { type: 'lessons', count: 0 } }] })).toContain('rule.count');
  });
});

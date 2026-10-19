import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, isDay, localDay } from './days';
import { eventProblem, mergeEvents, newId, sortEvents, type ProgressEvent } from './events';

const ev = (id: string, at: string): ProgressEvent => ({ id, type: 'complete', at, day: at.slice(0, 10), lesson: 'a' });

describe('days', () => {
  it('validates calendar days, including leap years', () => {
    expect(isDay('2028-02-29')).toBe(true);
    expect(isDay('2027-02-29')).toBe(false);
    expect(isDay('2026-13-01')).toBe(false);
    expect(isDay('2026-1-01')).toBe(false);
    expect(isDay(20260101)).toBe(false);
  });

  it('adds and counts days across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
    expect(daysBetween('2026-01-05', '2026-01-01')).toBe(-4);
  });

  it('uses the local calendar date of a moment', () => {
    expect(localDay(new Date(2026, 9, 19, 23, 59))).toBe('2026-10-19');
    expect(localDay(new Date(2026, 9, 20, 0, 0))).toBe('2026-10-20');
  });
});

describe('events', () => {
  it('accepts well-formed events and names what is wrong with bad ones', () => {
    expect(eventProblem({ id: 'x', type: 'answer', at: '2026-10-19T10:00:00Z', day: '2026-10-19', lesson: 'a', question: 0, option: 1, correct: true })).toBeNull();
    expect(eventProblem({ id: 'x', type: 'goal', at: '2026-10-19T10:00:00Z', day: '2026-10-19', goal: 2 })).toBeNull();
    expect(eventProblem(null)).toBe('not an object');
    expect(eventProblem({ type: 'complete' })).toBe('missing id');
    expect(eventProblem({ id: 'x', type: 'complete', at: 'yesterday', day: '2026-10-19', lesson: 'a' })).toBe('bad timestamp');
    expect(eventProblem({ id: 'x', type: 'complete', at: '2026-10-19T10:00:00Z', day: '19/10/2026', lesson: 'a' })).toBe('bad day');
    expect(eventProblem({ id: 'x', type: 'answer', at: '2026-10-19T10:00:00Z', day: '2026-10-19', lesson: 'a', question: -1, option: 0, correct: true })).toBe('bad answer');
    expect(eventProblem({ id: 'x', type: 'goal', at: '2026-10-19T10:00:00Z', day: '2026-10-19', goal: 0 })).toBe('bad goal');
    expect(eventProblem({ id: 'x', type: 'cheat', at: '2026-10-19T10:00:00Z', day: '2026-10-19' })).toBe('unknown event type');
  });

  it('sorts by time with the id as tie-break', () => {
    const sorted = sortEvents([ev('b', '2026-01-01T10:00:00Z'), ev('c', '2026-01-01T09:00:00Z'), ev('a', '2026-01-01T10:00:00Z')]);
    expect(sorted.map((e) => e.id)).toEqual(['c', 'a', 'b']);
  });

  it('merges by id: merging the same log twice, or in either order, gives one copy', () => {
    const x = [ev('1', '2026-01-01T10:00:00Z'), ev('2', '2026-01-02T10:00:00Z')];
    const y = [ev('2', '2026-01-02T10:00:00Z'), ev('3', '2026-01-03T10:00:00Z')];
    expect(mergeEvents(x, x)).toHaveLength(2);
    expect(mergeEvents(x, y).map((e) => e.id)).toEqual(['1', '2', '3']);
    expect(mergeEvents(y, x)).toEqual(mergeEvents(x, y));
  });

  it('makes distinct ids', () => {
    const ids = new Set(Array.from({ length: 1000 }, newId));
    expect(ids.size).toBe(1000);
  });
});

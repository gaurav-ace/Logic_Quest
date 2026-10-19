import { describe, expect, it } from 'vitest';
import { loadCatalog } from './catalog';
import type { Lesson } from './schema';
import { groupByTrack, missingRequirements, trackToOpen } from './unlock';

const lessons = loadCatalog();
const byId = new Map(lessons.map((l) => [l.id, l]));
const get = (id: string) => byId.get(id)!;

describe('missingRequirements', () => {
  it('a lesson with no requirements is always open', () => {
    expect(missingRequirements(get('dry-run'), new Set(), byId)).toEqual([]);
  });

  it('lists what is still to do, and opens once it is done', () => {
    const estimate = get('estimate');
    expect(missingRequirements(estimate, new Set(), byId).map((l) => l.id)).toEqual(['spot-pattern', 'dry-run']);
    expect(missingRequirements(estimate, new Set(['dry-run']), byId).map((l) => l.id)).toEqual(['spot-pattern']);
    expect(missingRequirements(estimate, new Set(['dry-run', 'spot-pattern']), byId)).toEqual([]);
  });
});

describe('groupByTrack', () => {
  it('groups in curriculum order and skips empty tracks', () => {
    const groups = groupByTrack(lessons, new Set());
    expect(groups.map((g) => g.track)).toEqual(['web', 'logic', 'dsa', 'hld', 'lld', 'real-world', 'agentic']);
    expect(groups.find((g) => g.track === 'logic')!.lessons).toHaveLength(8);
  });

  it('counts finished lessons per track, ignoring unknown ids', () => {
    const g = groupByTrack(lessons, new Set(['dry-run', 'invariants', 'not-a-lesson']));
    expect(g.find((x) => x.track === 'logic')!.done).toBe(2);
  });

  it('keeps every lesson exactly once', () => {
    const all: Lesson[] = groupByTrack(lessons, new Set()).flatMap((g) => g.lessons);
    expect(all.map((l) => l.id).sort()).toEqual(lessons.map((l) => l.id).sort());
  });
});

describe('trackToOpen', () => {
  it('opens the first unfinished track, or none when all are done', () => {
    expect(trackToOpen(groupByTrack(lessons, new Set()))).toBe('web');
    expect(trackToOpen(groupByTrack(lessons, new Set(['hello-request-response'])))).toBe('logic');
    expect(trackToOpen(groupByTrack(lessons, new Set(lessons.map((l) => l.id))))).toBeUndefined();
  });
});

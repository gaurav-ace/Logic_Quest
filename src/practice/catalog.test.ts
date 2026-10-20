import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../lesson/catalog';
import { TRACKS, type Track } from '../lesson/schema';
import { practiceTracks } from './catalog';
import { PROGRAMS } from './programs';
import type { PracticeItem } from './schema';
import { validatePracticeFile } from './validate';

const files = import.meta.glob<{ default: unknown }>('../../practice/*.json', { eager: true });
const lessonIds = new Set(loadCatalog().map((l) => l.id));
const all: PracticeItem[] = Object.entries(files).flatMap(([path, mod]) => {
  const track = path.replace(/^.*\/([a-z-]+)\.json$/, '$1') as Track;
  return validatePracticeFile(path, track, mod.default, lessonIds);
});

describe('practice files', () => {
  it('every file is named after a track and passes validation', () => {
    expect(Object.keys(files).length).toBeGreaterThan(0);
    for (const path of Object.keys(files)) expect(TRACKS).toContain(path.replace(/^.*\/([a-z-]+)\.json$/, '$1'));
    expect(practiceTracks(TRACKS).length).toBe(Object.keys(files).length);
  });

  it('ids are unique across all tracks (they key the answer events)', () => {
    const ids = all.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(lessonIds.has(id), `${id} clashes with a lesson id`).toBe(false);
  });

  it('every track with practice has medium and hard items', () => {
    for (const track of practiceTracks(TRACKS)) {
      const levels = new Set(all.filter((i) => i.track === track).map((i) => i.level));
      expect([...levels].sort(), track).toEqual(['hard', 'medium']);
    }
  });
});

describe('debug items match their programs (computed, never hand-written)', () => {
  const debug = all.filter((i) => i.kind === 'debug');
  it.each(debug.filter((i) => i.program).map((i) => [i.id, i] as const))('%s', (_id, item) => {
    const program = PROGRAMS[item.program!];
    expect(program, `no program "${item.program}"`).toBeDefined();
    const buggy = program!.buggy(item.input);
    // The predict answer is exactly what the buggy code gives, and the fix really changes it.
    expect(item.predict.options[item.predict.answer]!.text).toBe(buggy);
    expect(program!.fixed(item.input)).not.toBe(buggy);
    // Distractors are different outputs, so only one option can be right.
    const texts = item.predict.options.map((o) => o.text);
    expect(new Set(texts).size).toBe(texts.length);
  });
});

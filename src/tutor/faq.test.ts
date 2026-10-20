import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../lesson/catalog';
import { TRACKS, type Track } from '../lesson/schema';
import { ANSWER_MAX, FaqValidationError, faqPassages, validateFaqFile } from './faq';

const lessons = loadCatalog();
const tracks = new Map(lessons.map((l) => [l.id, l.track] as const));
const titles = new Map(lessons.map((l) => [l.id, l.title] as const));
const good = { q: 'Why update the database first?', a: 'Because…', sources: [{ title: 'Azure', url: 'https://learn.microsoft.com/' }] };
const problems = (data: unknown, track: Track = 'hld') => {
  try {
    validateFaqFile('t.json', track, data, tracks);
    return [];
  } catch (e) {
    return (e as FaqValidationError).problems;
  }
};

describe('tutor files', () => {
  it('accepts a good file and rejects each kind of bad entry loudly', () => {
    expect(problems({ cache: [good] })).toEqual([]);
    expect(problems([])).toEqual(['(file): must be an object of lesson id → questions']);
    expect(problems({ nope: [good] })).toEqual(['nope: is not a lesson id']);
    expect(problems({ 'binary-search': [good] })).toEqual(['binary-search: belongs to the "dsa" track, not "hld"']);
    expect(problems({ cache: [] })[0]).toMatch(/1 to 6 questions/);
    expect(problems({ cache: [{ ...good, q: 'No question mark' }] })).toEqual(['cache[0].q: must be a question ending in "?"']);
    expect(problems({ cache: [good, good] })).toEqual(['cache[1].q: is asked twice']);
    expect(problems({ cache: [{ ...good, a: 'x'.repeat(ANSWER_MAX + 1) }] })[0]).toMatch(/keep answers to 700/);
    expect(problems({ cache: [{ ...good, sources: [] }] })[0]).toMatch(/non-empty list/);
    expect(problems({ cache: [{ ...good, sources: [{ title: 'x', url: 'http://a' }] }] })[0]).toMatch(/https/);
    expect(problems({ cache: [{ ...good, extra: 1 }] })).toEqual(['cache[0].extra: unknown field']);
  });

  it('answers become searchable passages under their lesson, with their own sources', () => {
    const p = faqPassages({ cache: [good] }, titles);
    expect(p).toEqual([{ lessonId: 'cache', lessonTitle: titles.get('cache'), where: 'Tutor answer', text: `${good.q} ${good.a}`, sources: good.sources }]);
  });
});

describe('the files in tutor/', () => {
  const files = import.meta.glob<{ default: unknown }>('../../tutor/*.json', { eager: true });
  it('are named after a track and pass validation', () => {
    for (const [path, mod] of Object.entries(files)) {
      const track = path.replace(/^.*\/([a-z-]+)\.json$/, '$1') as Track;
      expect(TRACKS).toContain(track);
      expect(() => validateFaqFile(path, track, mod.default, tracks)).not.toThrow();
    }
  });
});

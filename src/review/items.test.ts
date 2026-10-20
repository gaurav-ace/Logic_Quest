import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../lesson/catalog';
import type { Track } from '../lesson/schema';
import { practiceKey, type PracticeItem } from '../practice/schema';
import { validatePracticeFile } from '../practice/validate';
import { reviewTarget, type ReviewLookup } from './items';
import type { ReviewState } from './schedule';

const lessons = loadCatalog();
const byId = new Map(lessons.map((l) => [l.id, l]));
const files = import.meta.glob<{ default: unknown }>('../../practice/*.json', { eager: true });
const practice = new Map<string, PracticeItem>(
  Object.entries(files).flatMap(([path, mod]) => validatePracticeFile(path, path.replace(/^.*\/([a-z-]+)\.json$/, '$1') as Track, mod.default, new Set(byId.keys())).map((i) => [i.id, i] as const)),
);
const look: ReviewLookup = {
  lesson: (id) => byId.get(id),
  practice: (id) => practice.get(id),
  lessonHref: (id) => `#/lesson/${id}`,
  practiceHref: (item) => `#/practice/${item.track}/${item.id}`,
};
const st = (lesson: string, question: number): ReviewState => ({ lesson, question, box: 1, due: '2026-10-02', misses: 1, lastMiss: '2026-10-01' });

describe('what a scheduled question becomes', () => {
  it('a lesson quiz question is asked again, with the lesson and its sources', () => {
    const t = reviewTarget(st('cache', 0), look)!;
    expect(t.kind).toBe('ask');
    if (t.kind !== 'ask') return;
    expect(t.question).toBe(byId.get('cache')!.quiz[0]);
    expect(t.from).toBe('Cache');
    expect(t.href).toBe('#/lesson/cache');
    expect(t.sources).toBe(byId.get('cache')!.sources);
  });

  it('design and critique exercises are sent back to their lesson', () => {
    expect(reviewTarget(st('composition-inheritance', 301), look)).toMatchObject({ kind: 'redo', what: 'Improve the design: pick the fix', href: '#/lesson/composition-inheritance' });
    expect(reviewTarget(st('capstone-design-review', 310), look)).toMatchObject({ kind: 'redo', what: 'Critique the design: spot the flaw' });
  });

  it('practice quiz questions are asked with their setup; debug and guided checks are redone', () => {
    const quiz = reviewTarget(st(practiceKey('python-structure-corners'), 1), look)!;
    expect(quiz).toMatchObject({ kind: 'ask', from: 'Practice: ' + practice.get('python-structure-corners')!.title, href: '#/practice/dsa/python-structure-corners' });
    if (quiz.kind === 'ask') expect(quiz.intro).toBe((practice.get('python-structure-corners') as { intro: string }).intro);
    expect(reviewTarget(st(practiceKey('binary-search-stuck'), 2), look)).toMatchObject({ kind: 'redo', what: 'Pick the fix' });
    const guided = practice.get('pair-with-target-sum')!;
    const checked = guided.kind === 'guided' ? guided.steps.findIndex((s) => s.check) : -1;
    expect(reviewTarget(st(practiceKey('pair-with-target-sum'), checked), look)).toMatchObject({ kind: 'redo', what: expect.stringMatching(/^Step \d: /) });
  });

  it('anything that no longer exists is dropped, not crashed on', () => {
    expect(reviewTarget(st('no-such-lesson', 0), look)).toBeNull();
    expect(reviewTarget(st('cache', 99), look)).toBeNull();
    expect(reviewTarget(st('cache', 200), look)).toBeNull();
    expect(reviewTarget(st(practiceKey('gone'), 0), look)).toBeNull();
    expect(reviewTarget(st(practiceKey('binary-search-stuck'), 7), look)).toBeNull();
    expect(reviewTarget(st(practiceKey('python-structure-corners'), 99), look)).toBeNull();
  });

  it('practice reviews wait until the practice files are loaded', () => {
    const notLoaded: ReviewLookup = { lesson: look.lesson, lessonHref: look.lessonHref, practiceHref: look.practiceHref };
    expect(reviewTarget(st(practiceKey('python-structure-corners'), 0), notLoaded)).toBeNull();
  });

  it('every quiz question in the course can be reviewed', () => {
    for (const l of lessons) l.quiz.forEach((q, i) => expect(reviewTarget(st(l.id, i), look)).toMatchObject({ kind: 'ask', question: q }));
  });
});

import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../lesson/catalog';
import type { DiagramLesson } from '../lesson/schema';
import { MAX_HITS, buildIndex, lessonPassages, search, stem, terms } from './search';

const lessons = loadCatalog();
const index = buildIndex(lessons.flatMap(lessonPassages));
const lb = lessons.find((l) => l.id === 'load-balancer') as DiagramLesson;

describe('words', () => {
  it('drops common words and strips simple endings, so forms of one word match', () => {
    expect(terms('What is the cache for?')).toEqual(['cach']);
    for (const w of ['cache', 'caches', 'cached', 'caching']) expect(stem(w)).toBe('cach');
    expect(stem('retries')).toBe('retry');
    expect(stem('class')).toBe('class');
    expect(stem('boxes')).toBe('box');
  });
});

describe('passages', () => {
  it('cover the goal, each step, every quiz option and the predictions inside steps', () => {
    const p = lessonPassages(lb);
    expect(p.filter((x) => x.where === 'Goal')).toHaveLength(1);
    expect(p.filter((x) => x.where.startsWith('Step '))).toHaveLength(lb.steps.length);
    const options = [...lb.quiz, lb.steps[4]!.predict!].reduce((n, q) => n + q.options.length, 0);
    expect(p.filter((x) => x.where === 'Quiz')).toHaveLength(options);
    expect(p.every((x) => x.lessonId === 'load-balancer' && x.sources === lb.sources)).toBe(true);
  });

  it('every lesson gives passages, and each always says which lesson it is from', () => {
    for (const l of lessons) {
      const p = lessonPassages(l);
      expect(p.length, l.id).toBeGreaterThan(3);
      expect(p.every((x) => x.text.trim() !== '' && x.lessonTitle === l.title)).toBe(true);
    }
  });
});

describe('search', () => {
  it('finds nothing for an empty question or only common words', () => {
    expect(search(index, '')).toEqual([]);
    expect(search(index, 'what is it?')).toEqual([]);
  });

  it('a passage must share at least half the question words', () => {
    expect(search(index, 'round robin').some((h) => h.lessonId === 'load-balancer')).toBe(true);
    expect(search(index, 'round robin zebra quokka kiwi')).toEqual([]);
  });

  it('every lesson is the top hit for its own goal, when it is the current lesson', () => {
    for (const l of lessons) expect(search(index, l.objective, l.id)[0]?.lessonId, l.id).toBe(l.id);
  });

  it('returns at most 5 hits, at most 2 from any other lesson and 3 from the current one', () => {
    for (const q of ['cache database', 'agent tool loop', 'binary search sorted', 'retry idempotency key']) {
      const hits = search(index, q, 'cache');
      expect(hits.length).toBeLessThanOrEqual(MAX_HITS);
      const per = new Map<string, number>();
      for (const h of hits) per.set(h.lessonId, (per.get(h.lessonId) ?? 0) + 1);
      for (const [id, n] of per) expect(n, `${q}: ${id}`).toBeLessThanOrEqual(id === 'cache' ? 3 : 2);
      expect([...hits].sort((a, b) => b.score - a.score)).toEqual(hits);
    }
  });

  it('the current lesson ranks higher than the same text elsewhere', () => {
    const plain = search(index, 'cache miss database');
    const here = search(index, 'cache miss database', 'caching-sim');
    expect(here[0]!.lessonId).toBe('caching-sim');
    expect(plain.length).toBeGreaterThan(0);
  });
});

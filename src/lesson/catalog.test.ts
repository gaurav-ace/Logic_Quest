import { describe, expect, it } from 'vitest';
import { LESSON_DATA, loadCatalog } from './catalog';

const files = import.meta.glob<{ default: unknown }>('../../lessons/*.json', { eager: true });

describe('lesson catalog', () => {
  it('every lesson file is valid', () => {
    for (const [path, mod] of Object.entries(files)) {
      expect(() => loadCatalog([mod.default]), path).not.toThrow();
    }
  });

  it('every lesson file is listed in the catalog', () => {
    const listed = new Set(LESSON_DATA);
    const missing = Object.entries(files).filter(([, mod]) => !listed.has(mod.default)).map(([path]) => path);
    expect(missing).toEqual([]);
  });

  it('loads all lessons in order', () => {
    expect(loadCatalog().map((l) => l.id)).toEqual(['hello-request-response', 'load-balancer', 'cache', 'agent-loop']);
  });

  it('every lesson has an objective, sources, a quiz and a simplifies note', () => {
    for (const l of loadCatalog()) {
      expect(l.objective.length, l.id).toBeGreaterThan(0);
      expect(l.sources.length, l.id).toBeGreaterThan(0);
      expect(l.quiz.length, l.id).toBeGreaterThan(0);
      expect(l.simplifies, l.id).toBeTruthy();
    }
  });

  it('rejects two lessons with the same id', () => {
    const [hello] = LESSON_DATA;
    expect(() => loadCatalog([hello, structuredClone(hello)])).toThrow('Two lessons share the id "hello-request-response"');
  });
});

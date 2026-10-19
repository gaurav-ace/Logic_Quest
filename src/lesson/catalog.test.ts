import { describe, expect, it } from 'vitest';
import { LESSON_DATA, loadCatalog } from './catalog';
import { validateLesson } from './validate';

const files = import.meta.glob<{ default: unknown }>('../../lessons/*.json', { eager: true });

describe('lesson catalog', () => {
  it('every lesson file is valid on its own', () => {
    for (const [path, mod] of Object.entries(files)) {
      expect(() => validateLesson(mod.default), path).not.toThrow();
    }
  });

  it('the whole catalog loads: programs exist, requirements resolve', () => {
    expect(() => loadCatalog()).not.toThrow();
  });

  it('every lesson file is listed in the catalog', () => {
    const listed = new Set(LESSON_DATA);
    const missing = Object.entries(files).filter(([, mod]) => !listed.has(mod.default)).map(([path]) => path);
    expect(missing).toEqual([]);
  });

  it('loads all lessons in order', () => {
    expect(loadCatalog().map((l) => l.id)).toEqual([
      'hello-request-response',
      'break-it-down',
      'spot-pattern',
      'dry-run',
      'loops-limits',
      'edge-cases',
      'invariants',
      'work-backwards',
      'estimate',
      'big-o-counting',
      'time-vs-space',
      'arrays',
      'two-pointers',
      'sliding-window',
      'prefix-sums',
      'linked-lists',
      'fast-slow-pointers',
      'stacks',
      'monotonic-stack',
      'queues-deques',
      'hash-maps',
      'counting-grouping',
      'binary-search',
      'search-the-answer',
      'simple-sorts',
      'merge-sort',
      'quick-sort',
      'heaps',
      'recursion',
      'backtracking',
      'tree-traversals',
      'binary-search-trees',
      'tries',
      'bfs',
      'dfs-islands',
      'topological-sort',
      'dijkstra',
      'union-find',
      'dynamic-programming',
      'request-journey',
      'load-balancer',
      'scaling',
      'load-balancing-sim',
      'cache',
      'caching-sim',
      'cdn',
      'sql-vs-nosql',
      'indexes',
      'replication',
      'sharding',
      'consistent-hashing',
      'message-queues',
      'rate-limiting',
      'cap-consistency',
      'idempotency',
      'design-url-shortener',
      'design-ai-chat',
      'objects-and-responsibilities',
      'encapsulation',
      'interfaces-polymorphism',
      'composition-inheritance',
      'solid-1',
      'solid-2',
      'agent-loop',
    ]);
  });

  it('every lesson has an objective, sources, a quiz and a simplifies note', () => {
    for (const l of loadCatalog()) {
      expect(l.objective.length, l.id).toBeGreaterThan(0);
      expect(l.sources.length, l.id).toBeGreaterThan(0);
      expect(l.quiz.length, l.id).toBeGreaterThan(0);
      expect(l.simplifies, l.id).toBeTruthy();
    }
  });

  it('rejects a trace lesson whose program does not exist', () => {
    const trace: Record<string, unknown> = { ...(structuredClone(LESSON_DATA[0]) as Record<string, unknown>), id: 'some-trace', kind: 'trace', program: 'no-such-program' };
    for (const k of ['nodes', 'edges', 'steps']) delete trace[k];
    expect(() => loadCatalog([trace])).toThrow('names unknown program "no-such-program"');
  });

  it('rejects unknown and circular requirements', () => {
    const base = structuredClone(LESSON_DATA[0]) as Record<string, unknown>;
    expect(() => loadCatalog([{ ...base, requires: ['nope'] }])).toThrow('requires unknown lesson "nope"');
    const a = { ...base, id: 'a', requires: ['b'] };
    const b = { ...base, id: 'b', requires: ['a'] };
    expect(() => loadCatalog([a, b])).toThrow('Lessons require each other in a loop: a -> b -> a');
    expect(() => loadCatalog([{ ...base, id: 'a' }, { ...base, id: 'b', requires: ['a'] }])).not.toThrow();
  });

  it('rejects two lessons with the same id', () => {
    const [hello] = LESSON_DATA;
    expect(() => loadCatalog([hello, structuredClone(hello)])).toThrow('Two lessons share the id "hello-request-response"');
  });
});

import { describe, expect, it } from 'vitest';
import hello from '../../lessons/hello.json';
import { LessonValidationError, validateLesson } from './validate';

// Fresh deep copy per test, so one test's edits never leak into another.
const lesson = (): Record<string, unknown> => structuredClone(hello) as Record<string, unknown>;

function problemsOf(data: unknown): string[] {
  try {
    validateLesson(data);
  } catch (e) {
    if (e instanceof LessonValidationError) return e.problems;
    throw e;
  }
  throw new Error('expected validation to fail');
}

describe('validateLesson', () => {
  it('accepts the hello lesson', () => {
    expect(validateLesson(lesson()).id).toBe('hello-request-response');
  });

  it('accepts a lesson without the optional simplifies note', () => {
    const l = lesson();
    delete l.simplifies;
    expect(() => validateLesson(l)).not.toThrow();
  });

  it('rejects a missing objective', () => {
    const l = lesson();
    delete l.objective;
    expect(problemsOf(l)).toContain('objective: must be non-empty text');
  });

  it('rejects a blank objective', () => {
    expect(problemsOf({ ...lesson(), objective: '   ' })).toContain('objective: must be non-empty text');
  });

  it('rejects missing or empty sources', () => {
    const l = lesson();
    delete l.sources;
    expect(problemsOf(l)).toContain('sources: must be a non-empty list');
    expect(problemsOf({ ...lesson(), sources: [] })).toContain('sources: must be a non-empty list');
  });

  it('rejects a non-https source url', () => {
    const l = lesson();
    l.sources = [{ title: 'Some page', url: 'http://example.com' }];
    expect(problemsOf(l)).toContain('sources[0].url: must start with https://');
  });

  it('rejects an edge to an unknown node', () => {
    const l = lesson();
    l.edges = [['browser', 'database']];
    expect(problemsOf(l)).toContain('edges[0]: unknown node "database"');
  });

  it('rejects a step hop that does not follow an edge', () => {
    const l = lesson();
    (l.nodes as unknown[]).push({ id: 'cache', label: 'Cache', x: 200, y: 40 });
    (l.steps as { path: unknown }[])[0]!.path = [['browser', 'cache']];
    expect(problemsOf(l)).toContain('steps[0].path[0]: no edge between "browser" and "cache"');
  });

  it('allows a hop in the reverse direction of an edge', () => {
    // hello.json already sends the response server -> browser along a browser -> server edge.
    expect(() => validateLesson(lesson())).not.toThrow();
  });

  it('rejects a highlight of an unknown node', () => {
    const l = lesson();
    (l.steps as { highlight: unknown }[])[1]!.highlight = ['servr'];
    expect(problemsOf(l)).toContain('steps[1].highlight[0]: unknown node "servr"');
  });

  it('rejects a quiz answer index out of range', () => {
    const l = lesson();
    (l.quiz as { answer: unknown }[])[0]!.answer = 3;
    expect(problemsOf(l)).toContain('quiz[0].answer: must be an option index from 0 to 2');
  });

  it('rejects a non-integer quiz answer', () => {
    const l = lesson();
    (l.quiz as { answer: unknown }[])[0]!.answer = 0.5;
    expect(problemsOf(l)).toContain('quiz[0].answer: must be an option index from 0 to 2');
  });

  it('rejects an option without an explanation', () => {
    const l = lesson();
    const q = (l.quiz as { options: { explanation?: string }[] }[])[0]!;
    delete q.options[1]!.explanation;
    expect(problemsOf(l)).toContain('quiz[0].options[1].explanation: must explain why this option is right or wrong');
  });

  it('rejects an empty steps list', () => {
    expect(problemsOf({ ...lesson(), steps: [] })).toContain('steps: must be a non-empty list');
  });

  it('rejects duplicate node ids', () => {
    const l = lesson();
    (l.nodes as unknown[]).push({ id: 'server', label: 'Server 2', x: 340, y: 160 });
    expect(problemsOf(l)).toContain('nodes[2].id: duplicate node id "server"');
  });

  it('accepts an optional node width and rejects a silly one', () => {
    const l = lesson();
    (l.nodes as { width?: unknown }[])[0]!.width = 120;
    expect(() => validateLesson(l)).not.toThrow();
    (l.nodes as { width?: unknown }[])[0]!.width = 5;
    expect(problemsOf(l)).toContain('nodes[0].width: must be a number from 40 to 200');
  });

  it('rejects a node box that sticks out of the diagram', () => {
    const l = lesson();
    (l.nodes as { x: number }[])[1]!.x = 400; // 400 + 104/2 > 420
    expect(problemsOf(l)).toContain('nodes[1]: box does not fit inside the 420x200 diagram');
  });

  it('rejects a misspelt node field', () => {
    const l = lesson();
    (l.nodes as Record<string, unknown>[])[0]!.widht = 120;
    expect(problemsOf(l)).toContain('nodes[0].widht: unknown field');
  });

  it('rejects a misspelt field instead of ignoring it', () => {
    expect(problemsOf({ ...lesson(), simplify: 'typo' })).toContain('simplify: unknown field');
  });

  it('rejects an unknown track or level', () => {
    expect(problemsOf({ ...lesson(), track: 'cooking' })).toContain('track: must be one of web, logic, dsa, hld, lld, real-world, agentic');
    expect(problemsOf({ ...lesson(), level: 'expert' })).toContain('level: must be one of easy, medium, hard');
  });

  it('requires a known kind', () => {
    const l = lesson();
    delete l.kind;
    expect(problemsOf(l)).toContain('kind: must be one of diagram, trace');
  });

  it('checks a step prediction like a quiz question', () => {
    const l = lesson();
    const predict = { prompt: 'What next?', options: [{ text: 'A', explanation: 'Yes.' }, { text: 'B', explanation: 'No.' }], answer: 0 };
    (l.steps as Record<string, unknown>[])[1]!.predict = predict;
    expect(() => validateLesson(l)).not.toThrow();
    (l.steps as Record<string, unknown>[])[1]!.predict = { ...predict, answer: 5 };
    expect(problemsOf(l)).toContain('steps[1].predict.answer: must be an option index from 0 to 1');
  });

  it('accepts a trace lesson naming a program, without diagram fields', () => {
    const { nodes, edges, steps, ...rest } = lesson();
    void nodes; void edges; void steps;
    expect(() => validateLesson({ ...rest, kind: 'trace', program: 'find-max' })).not.toThrow();
    expect(problemsOf({ ...rest, kind: 'trace', program: 'Find Max' })).toContain('program: must be a program id (lowercase words joined by hyphens)');
    expect(problemsOf({ ...rest, kind: 'trace', program: 'find-max', nodes: [] })).toContain('nodes: unknown field');
  });

  it('checks requires is a list of lesson ids', () => {
    expect(() => validateLesson({ ...lesson(), requires: ['cache'] })).not.toThrow();
    expect(problemsOf({ ...lesson(), requires: 'cache' })).toContain('requires: must be a list of lesson ids');
  });

  it('rejects a wrong schema version', () => {
    expect(problemsOf({ ...lesson(), schemaVersion: 2 })).toContain('schemaVersion: must be 1');
  });

  it('reports every problem at once, with the lesson id in the message', () => {
    const l = { ...lesson(), objective: '', steps: [] };
    let err: unknown;
    try {
      validateLesson(l);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(LessonValidationError);
    const v = err as LessonValidationError;
    expect(v.problems).toHaveLength(2);
    expect(v.message).toContain('Lesson "hello-request-response" is invalid');
  });

  it('rejects input that is not an object', () => {
    expect(problemsOf(null)).toEqual(['lesson: must be an object']);
    expect(problemsOf([])).toEqual(['lesson: must be an object']);
  });
});

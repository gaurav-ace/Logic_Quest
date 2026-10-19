import { describe, expect, it } from 'vitest';
import hello from '../../lessons/hello.json';
import objects from '../../lessons/objects-and-responsibilities.json';
import food from '../../lessons/case-food-delivery.json';
import payment from '../../lessons/case-payment-gateway.json';
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
    expect(problemsOf(l)).toContain('nodes[0].width: must be a number from 40 to 400');
  });

  it('rejects a node box that sticks out of the diagram', () => {
    const l = lesson();
    (l.nodes as { x: number }[])[1]!.x = 400; // 400 + 104/2 > 420
    expect(problemsOf(l)).toContain('nodes[1]: box must sit at least 4 units inside the 420x200 diagram');
  });

  it('rejects a box touching the frame, and boxes touching each other', () => {
    const l = lesson();
    const nodes = l.nodes as { id: string; x: number; y: number; width?: number }[];
    nodes[0]!.x = 52; // 52 - 104/2 = 0: inside, but touching the frame
    expect(problemsOf(l)).toContain('nodes[0]: box must sit at least 4 units inside the 420x200 diagram');
    nodes[0]!.x = 56;
    nodes[1]!.x = nodes[0]!.x + 104 + 5;
    nodes[1]!.y = nodes[0]!.y;
    expect(problemsOf(l)).toContain(`nodes: boxes "${nodes[0]!.id}" and "${nodes[1]!.id}" must be at least 6 units apart`);
    nodes[1]!.x = nodes[0]!.x + 104 + 6;
    expect(() => validateLesson(l)).not.toThrow();
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
    expect(problemsOf(l)).toContain('kind: must be one of diagram, trace, sim, design');
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

describe('design lessons', () => {
  const design = (): Record<string, any> => structuredClone(objects) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  it('accepts the objects-and-responsibilities lesson', () => {
    expect(validateLesson(design()).kind).toBe('design');
  });

  it('rejects steps that name a missing diagram, a class that is not there, or a call out of range', () => {
    const l = design();
    l.steps[0].diagram = 'nope';
    l.steps[1].highlight = ['ghost'];
    l.steps[5].call = 9;
    l.steps[6].highlight = ['order'];
    const p = problemsOf(l);
    expect(p).toContain("steps[0].diagram: must name one of the lesson's diagrams");
    expect(p).toContain('steps[1].highlight: unknown class "ghost"');
    expect(p).toContain('steps[5].call: must be a call index from 0 to 3');
    expect(p).toContain('steps[6].highlight: only class diagrams have classes to highlight');
  });

  it('rejects code lines too long for a phone', () => {
    const l = design();
    l.steps[4].code = ['x = "' + 'a'.repeat(40) + '"'];
    expect(problemsOf(l).some((x) => x.startsWith('steps[4].code[0]: is 46 characters'))).toBe(true);
  });

  it('rejects an exercise whose fix does not make the change smaller', () => {
    const l = design();
    l.exercise.edits.fixed = ['order', 'refund', 'notifier'];
    expect(problemsOf(l)).toContain('exercise.edits: the fixed design needs 3 edits and the flawed one 3; the fix must need fewer');
  });

  it('accepts a fixed design that needs no edits, since the change is only a new class', () => {
    const l = design();
    l.exercise.edits.fixed = [];
    expect(validateLesson(l).id).toBe('objects-and-responsibilities');
    l.exercise.edits.flawed = [];
    expect(problemsOf(l)).toContain('exercise.edits.flawed: must list at least one class to edit');
  });

  it('rejects edits naming classes that are not in that design, and a sequence diagram as the flawed one', () => {
    const l = design();
    l.exercise.edits.flawed = ['order', 'notifier'];
    expect(problemsOf(l)).toContain('exercise.edits.flawed: unknown class "notifier" in the flawed design');
    const m = design();
    m.exercise.flawed = 'flow';
    expect(problemsOf(m)).toContain('exercise.flawed: must name a class diagram');
  });

  it('rejects relations to unknown classes, duplicates, and layouts that will not fit', () => {
    const l = design();
    l.diagrams.split.relations.push({ from: 'order', to: 'ghost', type: 'uses' }, { from: 'order', to: 'repo', type: 'has' });
    const p = problemsOf(l);
    expect(p).toContain('diagrams.split.relations[2]: unknown class "ghost"');
    expect(p).toContain('diagrams.split.relations[3]: two relations between the same classes would draw on top of each other');
    const m = design();
    m.diagrams.split.classes[1].col = 1;
    expect(problemsOf(m)).toContain('diagrams.split: "mailer" and "repo" share row 1');
  });

  it('rejects unknown fields in diagrams, classes, steps and the exercise', () => {
    const l = design();
    l.diagrams.god.colour = 'red';
    l.diagrams.god.classes[0].colour = 'red';
    l.steps[0].colour = 'red';
    l.exercise.colour = 'red';
    const p = problemsOf(l);
    for (const path of ['diagrams.god.colour', 'diagrams.god.classes[0].colour', 'steps[0].colour', 'exercise.colour']) expect(p).toContain(`${path}: unknown field`);
  });
});

describe('real-world lessons: the accuracy rule, critiques and timelines', () => {
  const copy = (l: unknown): Record<string, any> => structuredClone(l) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  it('accepts a "plausible" lesson about a company, which shows the plausible-design label', () => {
    expect(validateLesson(copy(food)).basis).toBe('plausible');
  });

  it('rejects a "published" lesson that does not cite the company’s own site', () => {
    const l = copy(food);
    l.basis = 'published';
    expect(problemsOf(l)).toContain('sources: a "published" lesson must cite Swiggy\'s own site (swiggy.com)');
    // A subdomain of the company's site counts as its own.
    l.sources.push({ title: 'Swiggy Bytes', url: 'https://bytes.swiggy.com/some-article' });
    expect(validateLesson(l).basis).toBe('published');
    // A look-alike domain does not.
    l.sources.pop();
    l.sources.push({ title: 'Not Swiggy', url: 'https://notswiggy.com/x' });
    expect(problemsOf(l)).toContain('sources: a "published" lesson must cite Swiggy\'s own site (swiggy.com)');
  });

  it('needs a basis for a company, and a company for a basis', () => {
    const a = copy(food);
    delete a.basis;
    expect(problemsOf(a)).toContain('basis: must be "published" or "plausible" for a lesson about a company');
    const b = copy(payment);
    b.basis = 'plausible';
    expect(problemsOf(b)).toContain('basis: needs a company');
  });

  it('accepts a critique, and rejects one with too few candidates, no decoy, or unknown nodes', () => {
    expect(validateLesson(copy(payment)).critique?.risks.length).toBe(5);
    const few = copy(payment);
    few.critique.risks = few.critique.risks.slice(0, 2);
    expect(problemsOf(few)).toContain('critique.risks: needs at least 3 candidates, with at least one real risk and one decoy');
    const noDecoy = copy(payment);
    noDecoy.critique.risks = noDecoy.critique.risks.filter((r: { real: boolean }) => r.real);
    expect(problemsOf(noDecoy)).toContain('critique.risks: needs at least 3 candidates, with at least one real risk and one decoy');
    const ghost = copy(payment);
    ghost.critique.risks[0].nodes = ['ghost'];
    expect(problemsOf(ghost)).toContain('critique.risks[0].nodes: unknown node "ghost"');
  });

  it('rejects a critique on a design lesson, which has its own exercise', () => {
    const l = copy(objects);
    l.critique = copy(payment).critique;
    expect(problemsOf(l)).toContain('critique: design lessons have an exercise instead');
  });

  it('accepts a short time on a step and rejects a long one', () => {
    const l = copy(payment);
    l.steps[0].time = '15:39 UTC';
    expect(() => validateLesson(l)).not.toThrow();
    l.steps[0].time = 'x'.repeat(30);
    expect(problemsOf(l)).toContain('steps[0].time: must be short text, e.g. "15:39 UTC"');
  });
});

import { describe, expect, it } from 'vitest';
import { checkIndices, type PracticeItem } from './schema';
import { PracticeValidationError, validatePracticeFile } from './validate';

const q = (answer = 0) => ({
  prompt: 'Which?',
  options: [
    { text: 'A', explanation: 'Because A.' },
    { text: 'B', explanation: 'Not B.' },
  ],
  answer,
});
const base = { track: 'logic', level: 'medium', title: 'T', objective: 'O', sources: [{ title: 'Pólya, How to Solve It' }] };
const quiz = () => ({ ...base, id: 'q1', kind: 'quiz', intro: 'Corner cases.', questions: [q(), q(1)] });
const debug = () => ({ ...base, id: 'd1', kind: 'debug', language: 'python', code: ['def f(x):', '    return x // 2'], symptom: 'Odd.', bugLine: 1, lineWhy: 'Floor.', program: 'fence-posts', input: [10, 2], predict: q(), fix: q() });
const step = (stage: string, check?: object) => ({ stage, prompt: 'P?', hints: ['h'], model: 'M.', ...(check ? { check } : {}) });
const guided = () => ({
  ...base,
  id: 'g1',
  kind: 'guided',
  problem: 'Find the second largest.',
  steps: [
    step('understand', { type: 'choice', ...q() }),
    step('shrink', { type: 'choice', ...q(1) }),
    step('breakdown', { type: 'order', parts: ['a', 'b', 'c'], explain: 'E.' }),
    step('logic', { type: 'choice', ...q() }),
    step('edges', { type: 'select', prompt: 'Which break it?', cases: [{ text: '[]', pick: true, why: 'w' }, { text: '[1, 2]', pick: false, why: 'w' }, { text: '[5, 5]', pick: true, why: 'w' }] }),
    step('combine'),
  ],
});
const LESSONS = new Set(['edge-cases']);
const problems = (data: unknown) => {
  try {
    validatePracticeFile('logic.json', 'logic', data, LESSONS);
    return [];
  } catch (e) {
    if (!(e instanceof PracticeValidationError)) throw e;
    return e.problems;
  }
};

describe('validatePracticeFile', () => {
  it('accepts a valid quiz, debug and guided item', () => {
    expect(problems([quiz(), debug(), guided()])).toEqual([]);
  });

  it('rejects an empty file and items from another track', () => {
    expect(problems([])).toEqual(['(file): must be a non-empty list of practice items']);
    expect(problems([{ ...quiz(), track: 'dsa' }])).toEqual(['[0] q1.track: must be "logic", the file\'s track']);
  });

  it('rejects duplicate ids, unknown fields and an easy level', () => {
    expect(problems([quiz(), quiz()])).toContain('[1] q1.id: duplicate id');
    expect(problems([{ ...quiz(), simplify: 'typo' }])).toContain('[0] q1.simplify: unknown field');
    expect(problems([{ ...quiz(), level: 'easy' }])).toContain('[0] q1.level: must be one of medium, hard');
  });

  it('requires sources and an explanation for every option', () => {
    expect(problems([{ ...quiz(), sources: [] }])).toContain('[0] q1.sources: must be a non-empty list (CLAUDE.md section 5.3)');
    const noWhy = quiz();
    noWhy.questions[0]!.options[1] = { text: 'B' } as never;
    expect(problems([noWhy])).toContain('[0] q1.questions[0].options[1].explanation: must explain why this option is right or wrong');
  });

  it('checks related lessons exist', () => {
    expect(problems([{ ...quiz(), related: 'edge-cases' }])).toEqual([]);
    expect(problems([{ ...quiz(), related: 'nope' }])).toContain('[0] q1.related: must be the id of an existing lesson');
  });

  it('debug: the bug line must exist, be a real line, and code must fit a phone', () => {
    expect(problems([{ ...debug(), bugLine: 2 }])).toContain('[0] d1.bugLine: must be a line index from 0 to 1');
    expect(problems([{ ...debug(), code: ['', 'x'], bugLine: 0 }])).toContain('[0] d1.bugLine: points at an empty line');
    expect(problems([{ ...debug(), code: ['x'.repeat(61), 'y'] }])[0]).toMatch(/61 characters/);
    const noInput: Record<string, unknown> = debug();
    delete noInput.input;
    expect(problems([noInput])).toContain('[0] d1.input: is needed when a program is set');
  });

  it('guided: all six stages, in order, each with a check except combine', () => {
    const swapped = guided();
    [swapped.steps[0], swapped.steps[1]] = [swapped.steps[1]!, swapped.steps[0]!];
    expect(problems([swapped])[0]).toMatch(/exactly these stages, in order/);
    const missing = guided();
    delete (missing.steps[3] as { check?: unknown }).check;
    expect(problems([missing])).toContain('[0] g1.steps[3].check: every step except "combine" needs a check');
  });

  it('guided: a select check needs cases to pick and to leave, and an order check distinct parts', () => {
    const all = guided();
    (all.steps[4]!.check as { cases: { pick: boolean }[] }).cases.forEach((c) => (c.pick = true));
    expect(problems([all])).toContain('[0] g1.steps[4].check.cases: needs at least one case to pick and one to leave');
    const dup = guided();
    (dup.steps[2]!.check as { parts: string[] }).parts = ['a', 'a', 'b'];
    expect(problems([dup])).toContain('[0] g1.steps[2].check.parts: parts must all be different');
    const hints = guided();
    hints.steps[0]!.hints = ['1', '2', '3', '4'];
    expect(problems([hints])).toContain('[0] g1.steps[0].hints: must be 1 to 3 hints');
  });
});

describe('checkIndices', () => {
  it('numbers each graded check', () => {
    const items = validatePracticeFile('logic.json', 'logic', [quiz(), debug(), guided()], LESSONS) as PracticeItem[];
    expect(items.map(checkIndices)).toEqual([[0, 1], [0, 1, 2], [0, 1, 2, 3, 4]]);
  });
});

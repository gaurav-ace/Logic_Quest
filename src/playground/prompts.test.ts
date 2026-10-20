import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../lesson/catalog';
import { CHECKLIST_MAX, PROMPT_DATA, PromptValidationError, validatePrompts } from './prompts';

const ids = new Set(loadCatalog().map((l) => l.id));
const good = { id: 'chat', title: 'Chat', requirements: ['a', 'b'], checklist: ['x?', 'y?', 'z?'], compare: ['case-chat'] };
const problems = (raw: unknown) => {
  try {
    validatePrompts(raw, ids);
    return [];
  } catch (e) {
    return (e as PromptValidationError).problems;
  }
};

describe('playground prompts', () => {
  it('the shipped prompts pass, and each links to real lessons', () => {
    const prompts = validatePrompts(PROMPT_DATA, ids);
    expect(prompts.length).toBeGreaterThanOrEqual(5);
    for (const p of prompts) expect(p.checklist.length).toBeLessThanOrEqual(CHECKLIST_MAX);
  });

  it('bad prompts fail loudly with a reason', () => {
    expect(problems([good])).toEqual([]);
    expect(problems([])).toEqual(['(file): must be a non-empty list']);
    expect(problems([good, good])).toEqual(['[1] chat.id: duplicate id']);
    expect(problems([{ ...good, compare: ['webhook-delivered-twice'] }])).toEqual(['[0] chat.compare: "webhook-delivered-twice" is not a lesson id']);
    expect(problems([{ ...good, checklist: ['x?', 'y?', 'not a question'] }])[0]).toMatch(/ending in "\?"/);
    expect(problems([{ ...good, requirements: ['only one'] }])[0]).toMatch(/2 to 6 lines/);
    expect(problems([{ ...good, extra: true }])).toEqual(['[0] chat.extra: unknown field']);
  });
});

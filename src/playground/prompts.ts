import data from '../../playground/prompts.json';

// Practice prompts for the playground: a system to design, its requirements, and a self-review
// checklist, with case-study lessons to compare against. There is no automatic grading: a design
// can't be scored honestly by rules, so the learner checks their own diagram against the questions.

export interface Prompt {
  id: string;
  title: string;
  requirements: string[];
  checklist: string[];
  /** Lessons that design the same thing (or a key part), offered as "Compare with". */
  compare: string[];
}

/** Checked indices are stored on the board as numbers below this. */
export const CHECKLIST_MAX = 10;

export class PromptValidationError extends Error {
  constructor(readonly problems: string[]) {
    super(`playground/prompts.json is invalid:\n- ${problems.join('\n- ')}`);
    this.name = 'PromptValidationError';
  }
}

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const texts = (v: unknown, lo: number, hi: number) => Array.isArray(v) && v.length >= lo && v.length <= hi && v.every(isText);

export function validatePrompts(raw: unknown, lessonIds: ReadonlySet<string>): Prompt[] {
  const problems: string[] = [];
  if (!Array.isArray(raw) || raw.length === 0) throw new PromptValidationError(['(file): must be a non-empty list']);
  const ids = new Set<string>();
  raw.forEach((p: Record<string, unknown>, i) => {
    const at = `[${i}]${isText(p?.id) ? ` ${p.id}` : ''}`;
    if (!isText(p?.id) || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id)) problems.push(`${at}.id: must be lowercase words joined by hyphens`);
    else if (ids.has(p.id)) problems.push(`${at}.id: duplicate id`);
    else ids.add(p.id);
    for (const key of Object.keys(p ?? {})) if (!['id', 'title', 'requirements', 'checklist', 'compare'].includes(key)) problems.push(`${at}.${key}: unknown field`);
    if (!isText(p?.title)) problems.push(`${at}.title: must be non-empty text`);
    if (!texts(p?.requirements, 2, 6)) problems.push(`${at}.requirements: must be 2 to 6 lines`);
    if (!texts(p?.checklist, 3, CHECKLIST_MAX)) problems.push(`${at}.checklist: must be 3 to ${CHECKLIST_MAX} questions`);
    else if (!(p.checklist as string[]).every((q) => q.trim().endsWith('?'))) problems.push(`${at}.checklist: every item must be a question ending in "?"`);
    if (!texts(p?.compare, 1, 4)) problems.push(`${at}.compare: must name 1 to 4 lessons`);
    else for (const id of p.compare as string[]) if (!lessonIds.has(id)) problems.push(`${at}.compare: "${id}" is not a lesson id`);
  });
  if (problems.length) throw new PromptValidationError(problems);
  return raw as Prompt[];
}

export const PROMPT_DATA: unknown = data;

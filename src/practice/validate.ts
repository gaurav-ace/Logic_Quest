import { TRACKS, type Track } from '../lesson/schema';
import { checkQuestion, type Bad } from '../lesson/validate';
import { PRACTICE_KINDS, PRACTICE_LEVELS, STAGES, type PracticeItem } from './schema';

// Practice data fails loudly at load time, like lessons (CLAUDE.md section 10). Whether a debug
// item's program exists, and whether its predict answer matches the buggy run, is checked by the
// tests in programs.test.ts, which know the registered programs.

export class PracticeValidationError extends Error {
  constructor(
    readonly file: string,
    readonly problems: string[],
  ) {
    super(`Practice file "${file}" is invalid:\n- ${problems.join('\n- ')}`);
    this.name = 'PracticeValidationError';
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** Code lines must fit a 360 px phone without wrapping mid-token too often; longer lines scroll. */
export const CODE_LINE_MAX = 60;

const COMMON = ['id', 'title', 'track', 'level', 'kind', 'objective', 'sources', 'simplifies', 'related'];
const OWN: Record<string, string[]> = {
  quiz: ['intro', 'questions'],
  debug: ['language', 'code', 'symptom', 'bugLine', 'lineWhy', 'program', 'input', 'predict', 'fix'],
  guided: ['problem', 'example', 'steps'],
};

/** Checks one track's file: a list of items, all in that track. */
export function validatePracticeFile(file: string, track: Track, data: unknown, lessonIds: ReadonlySet<string>): PracticeItem[] {
  const problems: string[] = [];
  const bad: Bad = (path, msg) => problems.push(`${path}: ${msg}`);
  if (!TRACKS.includes(track)) bad('(file)', `"${track}" is not a track`);
  if (!Array.isArray(data) || data.length === 0) throw new PracticeValidationError(file, ['(file): must be a non-empty list of practice items']);
  const ids = new Set<string>();
  data.forEach((item, i) => checkItem(item, `[${i}]`));
  if (problems.length) throw new PracticeValidationError(file, problems);
  return data as PracticeItem[];

  function checkItem(v: unknown, at: string): void {
    if (!isObj(v)) return void bad(at, 'must be an object');
    const p = isText(v.id) ? `${at} ${v.id}` : at;
    if (!isText(v.id) || !ID.test(v.id)) bad(`${p}.id`, 'must be lowercase words joined by hyphens');
    else if (ids.has(v.id)) bad(`${p}.id`, 'duplicate id');
    else ids.add(v.id);
    if (!PRACTICE_KINDS.includes(v.kind as never)) return void bad(`${p}.kind`, `must be one of ${PRACTICE_KINDS.join(', ')}`);
    for (const key of Object.keys(v)) if (![...COMMON, ...OWN[v.kind as string]!].includes(key)) bad(`${p}.${key}`, 'unknown field');
    if (v.track !== track) bad(`${p}.track`, `must be "${track}", the file's track`);
    if (!PRACTICE_LEVELS.includes(v.level as never)) bad(`${p}.level`, `must be one of ${PRACTICE_LEVELS.join(', ')}`);
    for (const key of ['title', 'objective']) if (!isText(v[key])) bad(`${p}.${key}`, 'must be non-empty text');
    if (v.simplifies !== undefined && !isText(v.simplifies)) bad(`${p}.simplifies`, 'must be non-empty text when present');
    if (v.related !== undefined && !(isText(v.related) && lessonIds.has(v.related))) bad(`${p}.related`, 'must be the id of an existing lesson');
    if (!Array.isArray(v.sources) || v.sources.length === 0) bad(`${p}.sources`, 'must be a non-empty list (CLAUDE.md section 5.3)');
    else
      v.sources.forEach((s: unknown, i) => {
        if (!isObj(s) || !isText(s.title)) bad(`${p}.sources[${i}].title`, 'must be non-empty text');
        else if (s.url !== undefined && !(isText(s.url) && s.url.startsWith('https://'))) bad(`${p}.sources[${i}].url`, 'must start with https://');
      });
    if (v.kind === 'quiz') checkQuiz(v, p);
    else if (v.kind === 'debug') checkDebug(v, p);
    else checkGuided(v, p);
  }

  function checkQuiz(v: Obj, p: string): void {
    if (!isText(v.intro)) bad(`${p}.intro`, 'must be non-empty text');
    if (!Array.isArray(v.questions) || v.questions.length === 0) return void bad(`${p}.questions`, 'must be a non-empty list');
    v.questions.forEach((q: unknown, i) => checkQuestion(q, `${p}.questions[${i}]`, bad));
  }

  function checkDebug(v: Obj, p: string): void {
    if (v.language !== 'python' && v.language !== 'text') bad(`${p}.language`, 'must be "python" or "text"');
    if (!Array.isArray(v.code) || v.code.length < 2 || !v.code.every((l) => typeof l === 'string')) bad(`${p}.code`, 'must be a list of at least 2 lines');
    else {
      v.code.forEach((l: string, i) => {
        if (l.length > CODE_LINE_MAX) bad(`${p}.code[${i}]`, `is ${l.length} characters; keep lines to ${CODE_LINE_MAX} so they fit a phone`);
      });
      const n = v.code.length;
      if (typeof v.bugLine !== 'number' || !Number.isInteger(v.bugLine) || v.bugLine < 0 || v.bugLine >= n) bad(`${p}.bugLine`, `must be a line index from 0 to ${n - 1}`);
      else if (!isText(v.code[v.bugLine])) bad(`${p}.bugLine`, 'points at an empty line');
    }
    for (const key of ['symptom', 'lineWhy']) if (!isText(v[key])) bad(`${p}.${key}`, 'must be non-empty text');
    if (v.program !== undefined && !(isText(v.program) && ID.test(v.program))) bad(`${p}.program`, 'must be a program id');
    if (v.program !== undefined && v.input === undefined) bad(`${p}.input`, 'is needed when a program is set');
    checkQuestion(v.predict, `${p}.predict`, bad);
    checkQuestion(v.fix, `${p}.fix`, bad);
  }

  function checkGuided(v: Obj, p: string): void {
    if (!isText(v.problem)) bad(`${p}.problem`, 'must be non-empty text');
    if (v.example !== undefined && !(isObj(v.example) && isText(v.example.input) && isText(v.example.output))) bad(`${p}.example`, 'needs input and output text');
    if (!Array.isArray(v.steps)) return void bad(`${p}.steps`, 'must be a list');
    const stages = v.steps.map((s: unknown) => (isObj(s) ? s.stage : undefined));
    if (JSON.stringify(stages) !== JSON.stringify(STAGES)) bad(`${p}.steps`, `must be exactly these stages, in order: ${STAGES.join(', ')}`);
    v.steps.forEach((s: unknown, i) => {
      const sp = `${p}.steps[${i}]`;
      if (!isObj(s)) return void bad(sp, 'must be an object');
      for (const key of Object.keys(s)) if (!['stage', 'prompt', 'hints', 'check', 'model'].includes(key)) bad(`${sp}.${key}`, 'unknown field');
      for (const key of ['prompt', 'model']) if (!isText(s[key])) bad(`${sp}.${key}`, 'must be non-empty text');
      if (!Array.isArray(s.hints) || s.hints.length === 0 || s.hints.length > 3 || !s.hints.every(isText)) bad(`${sp}.hints`, 'must be 1 to 3 hints');
      if (s.check === undefined) {
        if (s.stage !== 'combine') bad(`${sp}.check`, 'every step except "combine" needs a check');
        return;
      }
      checkGuidedCheck(s.check, `${sp}.check`);
    });
  }

  function checkGuidedCheck(c: unknown, p: string): void {
    if (!isObj(c)) return void bad(p, 'must be an object');
    if (c.type === 'choice') {
      checkQuestion(Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'type')), p, bad);
    } else if (c.type === 'order') {
      if (!Array.isArray(c.parts) || c.parts.length < 3 || c.parts.length > 6 || !c.parts.every(isText)) bad(`${p}.parts`, 'must be 3 to 6 parts');
      else if (new Set(c.parts).size !== c.parts.length) bad(`${p}.parts`, 'parts must all be different');
      if (!isText(c.explain)) bad(`${p}.explain`, 'must be non-empty text');
    } else if (c.type === 'select') {
      if (!isText(c.prompt)) bad(`${p}.prompt`, 'must be non-empty text');
      if (!Array.isArray(c.cases) || c.cases.length < 3) return void bad(`${p}.cases`, 'must have at least 3 cases');
      c.cases.forEach((k: unknown, i) => {
        if (!isObj(k) || !isText(k.text) || typeof k.pick !== 'boolean' || !isText(k.why)) bad(`${p}.cases[${i}]`, 'needs text, pick (true/false) and why');
      });
      const picks = c.cases.filter((k: unknown) => isObj(k) && k.pick === true).length;
      // Both kinds must be present, or "tap them all" (or none) would always pass.
      if (picks === 0 || picks === c.cases.length) bad(`${p}.cases`, 'needs at least one case to pick and one to leave');
    } else bad(`${p}.type`, 'must be "choice", "order" or "select"');
  }
}

import type { Lesson, QuizQuestion, Source } from '../lesson/schema';

// The offline tutor's search (Phase 6b, plan section 3.6, tier 1). It only ever shows text that
// is already in the course, reviewed and sourced, with the lesson it came from; it never writes
// an answer of its own. Matching is plain word overlap weighted by rarity, which is predictable
// and easy to test, and needs no library or network.

export interface Passage {
  lessonId: string;
  lessonTitle: string;
  /** Where in the lesson the text is, for example "Step 3" or "Quiz". */
  where: string;
  text: string;
  sources: Source[];
}

export interface Hit extends Passage {
  score: number;
}

const STOP = new Set(
  'a an and are as at be but by can do does for from how i if in into is it its me my of on or so than that the then there these this to was we what when where which who why will with you your not no yes vs versus'.split(' '),
);

/** Lowercase words, minus very common ones, with simple English endings removed so "caches" finds "cache". */
export function terms(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => !STOP.has(w)).map(stem);
}

export function stem(w: string): string {
  let s = w;
  if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith('ies')) s = `${s.slice(0, -3)}y`;
  else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2);
  else if (s.length > 4 && /(xes|sses|shes)$/.test(s)) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1);
  // A final e goes too, so cache, caches, cached and caching all become "cach".
  if (s.length > 3 && s.endsWith('e')) s = s.slice(0, -1);
  return s;
}

const NOTE_KEYS: Record<string, string> = { hint: 'Hint', explain: 'Explanation', why: 'Explanation', change: 'Explanation' };

const isQuestion = (v: Record<string, unknown>): v is Record<string, unknown> & QuizQuestion =>
  typeof v.prompt === 'string' && Array.isArray(v.options) && typeof v.answer === 'number';

/** Every piece of teaching text in a lesson, each tagged with where it is. */
export function lessonPassages(lesson: Lesson): Passage[] {
  const out: Passage[] = [];
  const add = (where: string, text: string) => {
    if (text.trim()) out.push({ lessonId: lesson.id, lessonTitle: lesson.title, where, text: text.trim(), sources: lesson.sources });
  };
  add('Goal', lesson.objective);
  if (lesson.simplifies) add('What this simplifies', lesson.simplifies);
  if ('steps' in lesson && Array.isArray(lesson.steps)) lesson.steps.forEach((s, i) => add(`Step ${i + 1}`, (s as { caption?: string }).caption ?? ''));
  // Questions and notes can sit anywhere (quiz, predictions, challenges, critiques), so walk it all.
  const walk = (v: unknown, key: string): void => {
    if (Array.isArray(v)) return v.forEach((x) => walk(x, key));
    if (typeof v === 'string') {
      if (NOTE_KEYS[key]) add(NOTE_KEYS[key], v);
      return;
    }
    if (typeof v !== 'object' || v === null) return;
    const o = v as Record<string, unknown>;
    if (isQuestion(o)) {
      const right = o.options[o.answer];
      if (right) add('Quiz', `${o.prompt} Answer: ${right.text}. ${right.explanation}`);
      o.options.forEach((opt, i) => {
        if (i !== o.answer) add('Quiz', `${o.prompt} Why not “${opt.text}”? ${opt.explanation}`);
      });
      return;
    }
    // Step captions were added above; the walk still enters steps for their predictions.
    for (const [k, x] of Object.entries(o)) walk(x, k);
  };
  walk(lesson, 'root');
  return out;
}

export interface Index {
  passages: Passage[];
  terms: Set<string>[];
  /** How many passages contain each term, for weighting rare words higher. */
  df: Map<string, number>;
}

export function buildIndex(passages: Passage[]): Index {
  const sets = passages.map((p) => new Set(terms(p.text)));
  const df = new Map<string, number>();
  for (const s of sets) for (const t of s) df.set(t, (df.get(t) ?? 0) + 1);
  return { passages, terms: sets, df };
}

export const MAX_HITS = 5;

/**
 * The best passages for a question. A passage must share at least half of the question's
 * (distinct) words, so one common word can't drag in unrelated text. Passages from the current
 * lesson rank higher, and at most two come from any one other lesson, so results stay varied.
 */
export function search(index: Index, query: string, currentLesson?: string): Hit[] {
  const q = [...new Set(terms(query))];
  if (q.length === 0) return [];
  const n = index.passages.length;
  const hits: Hit[] = [];
  index.terms.forEach((set, i) => {
    const matched = q.filter((t) => set.has(t));
    if (matched.length === 0 || matched.length * 2 < q.length) return;
    let score = matched.reduce((sum, t) => sum + Math.log(1 + n / (index.df.get(t) ?? 1)), 0);
    const p = index.passages[i]!;
    if (p.lessonId === currentLesson) score *= 1.5;
    hits.push({ ...p, score });
  });
  hits.sort((a, b) => b.score - a.score || a.text.length - b.text.length);
  const perLesson = new Map<string, number>();
  const out: Hit[] = [];
  for (const h of hits) {
    const seen = perLesson.get(h.lessonId) ?? 0;
    if (seen >= (h.lessonId === currentLesson ? 3 : 2)) continue;
    perLesson.set(h.lessonId, seen + 1);
    out.push(h);
    if (out.length === MAX_HITS) break;
  }
  return out;
}

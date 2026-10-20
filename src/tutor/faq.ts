import type { Source, Track } from '../lesson/schema';
import type { Passage } from './search';

// Suggested questions for the tutor panel: written from the lesson's sources and reviewed, each
// with its own sources (CLAUDE.md section 5.3). One file per track in tutor/, keyed by lesson id,
// loaded only when a lesson's tutor panel opens.

export interface Faq {
  q: string;
  a: string;
  sources: Source[];
}

export type FaqFile = Record<string, Faq[]>;

export class FaqValidationError extends Error {
  constructor(
    readonly file: string,
    readonly problems: string[],
  ) {
    super(`Tutor file "${file}" is invalid:\n- ${problems.join('\n- ')}`);
    this.name = 'FaqValidationError';
  }
}

export const ANSWER_MAX = 700;
export const PER_LESSON_MAX = 6;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/** Checks a track's file; `lessonTracks` maps every lesson id to its track. */
export function validateFaqFile(file: string, track: Track, data: unknown, lessonTracks: ReadonlyMap<string, Track>): FaqFile {
  const problems: string[] = [];
  const bad = (path: string, msg: string) => problems.push(`${path}: ${msg}`);
  if (!isObj(data)) throw new FaqValidationError(file, ['(file): must be an object of lesson id → questions']);
  for (const [id, list] of Object.entries(data)) {
    if (!lessonTracks.has(id)) bad(id, 'is not a lesson id');
    else if (lessonTracks.get(id) !== track) bad(id, `belongs to the "${lessonTracks.get(id)}" track, not "${track}"`);
    if (!Array.isArray(list) || list.length === 0 || list.length > PER_LESSON_MAX) {
      bad(id, `must be a list of 1 to ${PER_LESSON_MAX} questions`);
      continue;
    }
    const seen = new Set<string>();
    list.forEach((f: unknown, i) => {
      const p = `${id}[${i}]`;
      if (!isObj(f)) return void bad(p, 'must be an object');
      for (const key of Object.keys(f)) if (!['q', 'a', 'sources'].includes(key)) bad(`${p}.${key}`, 'unknown field');
      if (!isText(f.q) || !f.q.trim().endsWith('?')) bad(`${p}.q`, 'must be a question ending in "?"');
      else if (seen.has(f.q)) bad(`${p}.q`, 'is asked twice');
      else seen.add(f.q);
      if (!isText(f.a)) bad(`${p}.a`, 'must be non-empty text');
      else if (f.a.length > ANSWER_MAX) bad(`${p}.a`, `is ${f.a.length} characters; keep answers to ${ANSWER_MAX}`);
      if (!Array.isArray(f.sources) || f.sources.length === 0) bad(`${p}.sources`, 'must be a non-empty list (CLAUDE.md section 5.3)');
      else
        f.sources.forEach((s: unknown, k) => {
          if (!isObj(s) || !isText(s.title)) bad(`${p}.sources[${k}].title`, 'must be non-empty text');
          else if (s.url !== undefined && !(isText(s.url) && s.url.startsWith('https://'))) bad(`${p}.sources[${k}].url`, 'must start with https://');
          else for (const key of Object.keys(s)) if (key !== 'title' && key !== 'url') bad(`${p}.sources[${k}].${key}`, 'unknown field');
        });
    });
  }
  if (problems.length) throw new FaqValidationError(file, problems);
  return data as FaqFile;
}

/** FAQ answers join the search, under the lesson they belong to, with their own sources. */
export function faqPassages(faqs: FaqFile, titles: ReadonlyMap<string, string>): Passage[] {
  return Object.entries(faqs).flatMap(([lessonId, list]) =>
    list.map((f) => ({ lessonId, lessonTitle: titles.get(lessonId) ?? lessonId, where: 'Tutor answer', text: `${f.q} ${f.a}`, sources: f.sources })),
  );
}

const files = import.meta.glob<unknown>('../../tutor/*.json', { import: 'default' });
const cache = new Map<Track, Promise<FaqFile>>();

/** The track's suggested questions, validated; an empty set when the track has none yet. */
export function loadFaqs(track: Track, lessonTracks: ReadonlyMap<string, Track>): Promise<FaqFile> {
  let p = cache.get(track);
  if (!p) {
    const load = files[`../../tutor/${track}.json`];
    p = load ? load().then((data) => validateFaqFile(`tutor/${track}.json`, track, data, lessonTracks)) : Promise.resolve({});
    // A failed load (offline before the file was cached) can be retried later.
    p.catch(() => cache.delete(track));
    cache.set(track, p);
  }
  return p;
}

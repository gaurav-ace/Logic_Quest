import { isDay, type Day } from './days';

// Progress is a log of these events. Every score is computed from the log, so nothing can be
// double-counted, and merging two logs (an import, another tab) is a union by id.

interface Base {
  /** Unique id; merging logs keys on it. */
  id: string;
  /** ISO timestamp, for ordering. */
  at: string;
  /** Local calendar day when it happened. Stored, so travelling across time zones never rewrites history. */
  day: Day;
}

export interface AnswerEvent extends Base {
  type: 'answer';
  lesson: string;
  question: number;
  option: number;
  correct: boolean;
}

/** Every quiz question of a lesson answered correctly in one run (first time or a replay). */
export interface CompleteEvent extends Base {
  type: 'complete';
  lesson: string;
}

/** The daily goal changed. Days are judged by the goal in force on that day. */
export interface GoalEvent extends Base {
  type: 'goal';
  goal: number;
}

/** A badge was earned. Recorded so a badge is never lost, even if new lessons are added to its track later. */
export interface BadgeEvent extends Base {
  type: 'badge';
  badge: string;
}

/**
 * A review session finished (Phase 7): `count` missed questions answered again. It counts as one
 * lesson towards that day's goal. It earns no XP itself; the answers inside it are ordinary
 * answer events, scored by the usual rules.
 */
export interface ReviewEvent extends Base {
  type: 'review';
  count: number;
}

export type ProgressEvent = AnswerEvent | CompleteEvent | GoalEvent | BadgeEvent | ReviewEvent;

const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200;
const isIndex = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 1000;

/** Checks one event read from storage or an imported file. Returns a reason when it is bad. */
export function eventProblem(v: unknown): string | null {
  if (typeof v !== 'object' || v === null) return 'not an object';
  const e = v as Record<string, unknown>;
  if (!isText(e.id)) return 'missing id';
  if (!isText(e.at) || Number.isNaN(Date.parse(e.at))) return 'bad timestamp';
  if (!isDay(e.day)) return 'bad day';
  switch (e.type) {
    case 'answer':
      if (!isText(e.lesson) || !isIndex(e.question) || !isIndex(e.option) || typeof e.correct !== 'boolean') return 'bad answer';
      return null;
    case 'complete':
      return isText(e.lesson) ? null : 'bad completion';
    case 'goal':
      return isIndex(e.goal) && e.goal >= 1 ? null : 'bad goal';
    case 'badge':
      return isText(e.badge) ? null : 'bad badge';
    case 'review':
      return isIndex(e.count) && e.count >= 1 ? null : 'bad review';
    default:
      return 'unknown event type';
  }
}

/** Chronological order, with the id as a tie-break so the order is always the same. */
export function sortEvents(events: ProgressEvent[]): ProgressEvent[] {
  return [...events].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Union of logs by id. Merging the same log twice adds nothing. */
export function mergeEvents(a: ProgressEvent[], b: ProgressEvent[]): ProgressEvent[] {
  const byId = new Map<string, ProgressEvent>();
  for (const e of [...a, ...b]) if (!byId.has(e.id)) byId.set(e.id, e);
  return sortEvents([...byId.values()]);
}

/** Random id. crypto.randomUUID only exists in secure contexts, and a phone testing the dev
 *  server over http on the local network is not one, so fall back. */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

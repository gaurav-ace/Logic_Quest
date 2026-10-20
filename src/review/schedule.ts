import { addDays, type Day } from '../rewards/days';
import { sortEvents, type ProgressEvent } from '../rewards/events';

// Spaced review of missed questions (Phase 7, docs/PHASE7_PLAN.md 7.1). Leitner boxes: a miss
// puts a question in box 1; a right answer once it is due moves it up a box, to wait longer; a
// miss in any box sends it back to box 1; a right answer in the last box masters it.
//
// Like every score, the queue is computed from the answer log and never stored, so it can't
// drift from what happened, and importing or merging two devices' logs just works. A review
// answer is an ordinary answer event, so XP and the "fixed a mistake" badges need no new rules.

export interface ReviewState {
  lesson: string;
  question: number;
  /** 1 = just missed. Never 0 for a question that is still being reviewed. */
  box: number;
  /** The first day it may be asked again. */
  due: Day;
  /** Wrong answers ever given to it. */
  misses: number;
  lastMiss: Day;
}

export interface ReviewSummary {
  /** Questions being reviewed (in a box), keyed `lesson#question`. */
  active: Map<string, ReviewState>;
  /** Questions once missed and since answered right after every interval. */
  mastered: Set<string>;
}

export const reviewKey = (lesson: string, question: number) => `${lesson}#${question}`;

export function reviewSummary(events: ProgressEvent[], intervals: number[]): ReviewSummary {
  const active = new Map<string, ReviewState>();
  const mastered = new Set<string>();
  const misses = new Map<string, number>();
  for (const e of sortEvents(events)) {
    if (e.type !== 'answer') continue;
    const k = reviewKey(e.lesson, e.question);
    if (!e.correct) {
      const n = (misses.get(k) ?? 0) + 1;
      misses.set(k, n);
      mastered.delete(k);
      active.set(k, { lesson: e.lesson, question: e.question, box: 1, due: addDays(e.day, intervals[0]!), misses: n, lastMiss: e.day });
      continue;
    }
    const s = active.get(k);
    // Right before it's due (a retry straight after the miss, or an early replay) moves nothing:
    // only remembering it after the gap counts.
    if (!s || e.day < s.due) continue;
    if (s.box >= intervals.length) {
      active.delete(k);
      mastered.add(k);
    } else {
      active.set(k, { ...s, box: s.box + 1, due: addDays(e.day, intervals[s.box]!) });
    }
  }
  return { active, mastered };
}

/** Questions due on `today`, the longest-waiting first. */
export function dueReviews(summary: ReviewSummary, today: Day): ReviewState[] {
  return [...summary.active.values()]
    .filter((s) => s.due <= today)
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : reviewKey(a.lesson, a.question) < reviewKey(b.lesson, b.question) ? -1 : 1));
}

import type { Lesson, Track } from '../lesson/schema';
import { TRACK_NAMES, groupByTrack, missingRequirements } from '../lesson/unlock';
import { daysBetween, type Day } from '../rewards/days';
import { sortEvents, type ProgressEvent } from '../rewards/events';
import { dueReviews, type ReviewSummary } from './schedule';

// Phase 7 (docs/PHASE7_PLAN.md 7.3 and 7.4): what to do next, and how each track is going. Both
// are pure functions of the lessons, the answer log and today, so they're tested on sample
// histories, and every recommendation carries the plain reason shown to the learner.

/** A track's first-try accuracy only counts once this many questions have been tried. */
export const MIN_ASKED = 5;
/** Below this first-try share, a track's due reviews come before its next lesson. */
export const SHAKY = 0.6;
/** A started track untouched this many days is nudged up. */
export const IDLE_DAYS = 7;

export interface TrackStats {
  track: Track;
  name: string;
  done: number;
  total: number;
  /** Lesson questions answered at least once, and how many of those were right on the first try. */
  asked: number;
  firstTry: number;
  /** Questions from this track in review now, due today, and mastered. */
  inReview: number;
  due: number;
  mastered: number;
  /** Lessons with the most wrong answers, most first (at most 3). */
  mostMissed: { lesson: Lesson; misses: number }[];
  /** Last day with an answer or completion in this track, if any. */
  lastActive: Day | null;
  /** Its exact time, so the track worked on most recently is clear even within one day. */
  lastAt: string | null;
}

export const FIRST_REASON = 'Start here: the first lesson.';

/** Practice keys ("practice:<id>") aren't lessons; their track is unknown here, so they are left out. */
export function trackStats(lessons: Lesson[], completed: ReadonlySet<string>, events: ProgressEvent[], reviews: ReviewSummary, today: Day): TrackStats[] {
  const byId = new Map(lessons.map((l) => [l.id, l]));
  const firstAnswer = new Map<string, boolean>();
  const misses = new Map<string, number>();
  const last = new Map<Track, { day: Day; at: string }>();
  for (const e of sortEvents(events)) {
    if (e.type !== 'answer' && e.type !== 'complete') continue;
    const lesson = byId.get(e.lesson);
    if (!lesson) continue;
    // The log is in time order, so the last event seen is the latest.
    last.set(lesson.track, { day: e.day, at: e.at });
    if (e.type !== 'answer') continue;
    // Quiz questions only: exercises and challenges are scored differently.
    if (e.question >= lesson.quiz.length) continue;
    const k = `${e.lesson}#${e.question}`;
    if (!firstAnswer.has(k)) firstAnswer.set(k, e.correct);
    if (!e.correct) misses.set(e.lesson, (misses.get(e.lesson) ?? 0) + 1);
  }
  const due = new Set(dueReviews(reviews, today).map((s) => s.lesson + '#' + s.question));
  return groupByTrack(lessons, completed).map((g) => {
    const ids = new Set(g.lessons.map((l) => l.id));
    const inTrack = (k: string) => ids.has(k.slice(0, k.lastIndexOf('#')));
    const answered = [...firstAnswer].filter(([k]) => inTrack(k));
    return {
      track: g.track,
      name: g.name,
      done: g.done,
      total: g.lessons.length,
      asked: answered.length,
      firstTry: answered.filter(([, right]) => right).length,
      inReview: [...reviews.active.keys()].filter(inTrack).length,
      due: [...due].filter(inTrack).length,
      mastered: [...reviews.mastered].filter(inTrack).length,
      mostMissed: g.lessons
        .filter((l) => misses.has(l.id))
        .map((l) => ({ lesson: l, misses: misses.get(l.id)! }))
        .sort((a, b) => b.misses - a.misses)
        .slice(0, 3),
      lastActive: last.get(g.track)?.day ?? null,
      lastAt: last.get(g.track)?.at ?? null,
    };
  });
}

export type Recommendation =
  | { kind: 'lesson'; lesson: Lesson; reason: string }
  | { kind: 'review'; track: Track; count: number; reason: string }
  | { kind: 'done'; reason: string };

/**
 * The one thing to do next, with why:
 * 1. Nothing done yet: the first lesson.
 * 2. A started track idle for IDLE_DAYS or more, with a lesson left: its next lesson.
 * 3. The track worked on most recently: its due reviews first if its first-try accuracy is shaky,
 *    otherwise its next lesson.
 * 4. That track finished: the next unlocked lesson in curriculum order.
 * 5. Everything finished: say so.
 */
export function recommend(lessons: Lesson[], completed: ReadonlySet<string>, stats: TrackStats[], today: Day): Recommendation {
  const byId = new Map(lessons.map((l) => [l.id, l]));
  const groups = groupByTrack(lessons, completed);
  const nextIn = (track: Track) => groups.find((g) => g.track === track)?.lessons.find((l) => !completed.has(l.id) && missingRequirements(l, completed, byId).length === 0);
  const anyNext = () => groups.flatMap((g) => g.lessons).find((l) => !completed.has(l.id) && missingRequirements(l, completed, byId).length === 0);

  const started = stats.filter((s) => s.lastActive !== null);
  if (started.length === 0) {
    const first = anyNext();
    return first ? { kind: 'lesson', lesson: first, reason: FIRST_REASON } : { kind: 'done', reason: 'There are no lessons yet.' };
  }

  const current = [...started].sort((a, b) => (a.lastAt! < b.lastAt! ? 1 : a.lastAt! > b.lastAt! ? -1 : 0))[0]!;
  const idle = started
    .filter((s) => s !== current && daysBetween(s.lastActive!, today) >= IDLE_DAYS && nextIn(s.track))
    .sort((a, b) => (a.lastActive! < b.lastActive! ? -1 : 1))[0];
  if (idle) {
    const days = daysBetween(idle.lastActive!, today);
    return { kind: 'lesson', lesson: nextIn(idle.track)!, reason: `You haven't been back to ${idle.name} for ${days} days. Here's where you left off.` };
  }

  const shaky = current.asked >= MIN_ASKED && current.firstTry / current.asked < SHAKY;
  if (shaky && current.due > 0) {
    const pct = Math.round((100 * current.firstTry) / current.asked);
    return { kind: 'review', track: current.track, count: current.due, reason: `${pct}% of your first answers in ${current.name} were right. Review the ${current.due} you missed before going on.` };
  }
  const next = nextIn(current.track);
  if (next) return { kind: 'lesson', lesson: next, reason: `Next in ${current.name}, where you left off.` };
  const other = anyNext();
  if (other) return { kind: 'lesson', lesson: other, reason: `You finished what's open in ${current.name}. Next up: ${TRACK_NAMES[other.track]}.` };
  return { kind: 'done', reason: 'Every lesson is done. Keep your streak with reviews, practice sets or replays.' };
}

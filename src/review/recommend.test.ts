import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../lesson/catalog';
import type { Track } from '../lesson/schema';
import { groupByTrack, missingRequirements } from '../lesson/unlock';
import { REWARDS } from '../rewards/config';
import { addDays, type Day } from '../rewards/days';
import { computeProgress, type LessonInfo } from '../rewards/engine';
import type { ProgressEvent } from '../rewards/events';
import { IDLE_DAYS, MIN_ASKED, recommend, trackStats } from './recommend';
import { reviewSummary } from './schedule';

const lessons = loadCatalog();
const byId = new Map(lessons.map((l) => [l.id, l]));
const info: LessonInfo[] = lessons.map((l) => ({ id: l.id, track: l.track, level: l.level }));
const D0: Day = '2026-10-01';
const inTrack = (t: Track) => groupByTrack(lessons, new Set()).find((g) => g.track === t)!.lessons;

let seq = 0;
const stamp = (day: Day) => ({ id: `e${++seq}`, at: `${day}T10:${String(Math.floor(seq / 60) % 60).padStart(2, '0')}:${String(seq % 60).padStart(2, '0')}.000Z`, day });
const answer = (day: Day, lesson: string, question: number, correct: boolean): ProgressEvent => ({ ...stamp(day), type: 'answer', lesson, question, option: 0, correct });
/** Finishing a lesson: every quiz question right first time, then the completion. */
const finish = (day: Day, id: string): ProgressEvent[] => [...byId.get(id)!.quiz.map((_, i) => answer(day, id, i, true)), { ...stamp(day), type: 'complete', lesson: id }];

function advise(events: ProgressEvent[], today: Day) {
  const completed = computeProgress(events, info, REWARDS, today).completed;
  const stats = trackStats(lessons, completed, events, reviewSummary(events, REWARDS.review.intervals), today);
  return { rec: recommend(lessons, completed, stats, today), stats, completed };
}

describe('recommended next step, on sample histories', () => {
  it('a new learner starts with the first lesson', () => {
    const { rec } = advise([], D0);
    expect(rec).toMatchObject({ kind: 'lesson', lesson: lessons[0], reason: 'Start here: the first lesson.' });
  });

  it('the track worked on last wins, even within one day', () => {
    const [dsa, lld] = [inTrack('dsa')[0]!, inTrack('lld')[0]!];
    const morning = answer(D0, lld.id, 0, true);
    const later = answer(D0, dsa.id, 0, true);
    const r1 = advise([morning, later], D0).rec;
    const r2 = advise([later, { ...morning, id: 'z', at: `${D0}T23:00:00.000Z` }], D0).rec;
    expect(r1.kind === 'lesson' && r1.lesson.track).toBe('dsa');
    expect(r2.kind === 'lesson' && r2.lesson.track).toBe('lld');
  });

  it('mid-track: the next lesson in the track worked on last', () => {
    const hld = inTrack('hld');
    const events = [...finish(D0, hld[0]!.id), ...finish(D0, hld[1]!.id)];
    const { rec, completed } = advise(events, D0);
    expect(rec.kind).toBe('lesson');
    if (rec.kind !== 'lesson') return;
    expect(rec.lesson.track).toBe('hld');
    expect(completed.has(rec.lesson.id)).toBe(false);
    expect(missingRequirements(rec.lesson, completed, byId)).toEqual([]);
    expect(rec.reason).toBe('Next in System design (HLD), where you left off.');
  });

  it('shaky first answers with reviews due: reviews before the next lesson', () => {
    const hld = inTrack('hld').filter((l) => l.quiz.length >= 2).slice(0, 3);
    // 6 first answers, 3 right (50%), on day 0; the 3 misses are due a day later.
    const events: ProgressEvent[] = hld.flatMap((l) => [answer(D0, l.id, 0, true), answer(D0, l.id, 1, false), answer(D0, l.id, 1, true)]);
    const { rec, stats } = advise(events, addDays(D0, 1));
    const s = stats.find((x) => x.track === 'hld')!;
    expect(s.asked).toBe(6);
    expect(s.firstTry).toBe(3);
    expect(rec).toMatchObject({ kind: 'review', track: 'hld', count: 3 });
    expect(rec.reason).toBe('50% of your first answers in System design (HLD) were right. Review the 3 you missed before going on.');
  });

  it('shaky but nothing due yet (same day): carry on with the next lesson', () => {
    const hld = inTrack('hld').filter((l) => l.quiz.length >= 2).slice(0, 3);
    const events: ProgressEvent[] = hld.flatMap((l) => [answer(D0, l.id, 0, false), answer(D0, l.id, 1, false)]);
    expect(advise(events, D0).rec.kind).toBe('lesson');
  });

  it('too few answers to judge: never called shaky', () => {
    const l = inTrack('hld')[0]!;
    const events = [answer(D0, l.id, 0, false)];
    expect(MIN_ASKED).toBeGreaterThan(1);
    expect(advise(events, addDays(D0, 1)).rec.kind).toBe('lesson');
  });

  it('a started track left idle for a week is nudged up', () => {
    const dsa = inTrack('dsa');
    const hld = inTrack('hld');
    const events = [...finish(D0, dsa[0]!.id), ...finish(addDays(D0, 1), hld[0]!.id), ...finish(addDays(D0, IDLE_DAYS), hld[1]!.id)];
    const { rec } = advise(events, addDays(D0, IDLE_DAYS));
    expect(rec).toMatchObject({ kind: 'lesson', reason: `You haven't been back to Data structures and algorithms for ${IDLE_DAYS} days. Here's where you left off.` });
    if (rec.kind === 'lesson') expect(rec.lesson.track).toBe('dsa');
    // One day less, and it stays with the current track.
    const sooner = [...finish(D0, dsa[0]!.id), ...finish(addDays(D0, IDLE_DAYS - 1), hld[1]!.id)];
    const r2 = advise(sooner, addDays(D0, IDLE_DAYS - 1)).rec;
    if (r2.kind === 'lesson') expect(r2.lesson.track).toBe('hld');
  });

  it('a finished track moves on to the next open lesson', () => {
    const web = inTrack('web');
    const events = web.flatMap((l) => finish(D0, l.id));
    const { rec } = advise(events, D0);
    expect(rec.kind).toBe('lesson');
    if (rec.kind === 'lesson') {
      expect(rec.lesson.track).not.toBe('web');
      expect(rec.reason).toMatch(/^You finished what's open in /);
    }
  });

  it('everything done: says so', () => {
    const events = lessons.flatMap((l) => finish(D0, l.id));
    expect(advise(events, D0).rec).toEqual({ kind: 'done', reason: 'Every lesson is done. Keep your streak with reviews, practice sets or replays.' });
  });
});

describe('track stats', () => {
  it('count first tries, misses, reviews and mastered per track; practice and exercises are left out', () => {
    const [a, b] = inTrack('hld').filter((l) => l.quiz.length >= 2);
    const events: ProgressEvent[] = [
      answer(D0, a!.id, 0, false),
      answer(D0, a!.id, 0, true),
      answer(D0, a!.id, 1, true),
      answer(D0, b!.id, 0, false),
      answer(D0, b!.id, 0, false),
      answer(D0, b!.id, 300, false),
      answer(D0, 'practice:x', 0, false),
    ];
    const { stats } = advise(events, addDays(D0, 1));
    const s = stats.find((x) => x.track === 'hld')!;
    expect(s).toMatchObject({ asked: 3, firstTry: 1, inReview: 3, due: 3, mastered: 0, lastActive: D0 });
    expect(s.mostMissed.map((m) => [m.lesson.id, m.misses])).toEqual([
      [b!.id, 2],
      [a!.id, 1],
    ]);
    // Every other track is untouched.
    for (const t of stats.filter((x) => x.track !== 'hld')) expect(t).toMatchObject({ asked: 0, inReview: 0, lastActive: null });
    expect(stats.reduce((n, t) => n + t.total, 0)).toBe(lessons.length);
  });
});

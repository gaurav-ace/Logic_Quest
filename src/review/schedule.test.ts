import { describe, expect, it } from 'vitest';
import { addDays, type Day } from '../rewards/days';
import { mergeEvents, type AnswerEvent, type ProgressEvent } from '../rewards/events';
import { REWARDS } from '../rewards/config';
import { dueReviews, reviewKey, reviewSummary } from './schedule';

const IV = [1, 3, 7, 14, 30];
const D0: Day = '2026-10-01';
let seq = 0;
function ans(day: Day, lesson: string, question: number, correct: boolean, hour = 12): AnswerEvent {
  seq++;
  return { id: `e${String(seq).padStart(5, '0')}`, type: 'answer', at: `${day}T${String(hour).padStart(2, '0')}:00:${String(seq % 60).padStart(2, '0')}.000Z`, day, lesson, question, option: correct ? 0 : 1, correct };
}
const state = (events: ProgressEvent[], k = 'cache#0') => reviewSummary(events, IV).active.get(k);

describe('review schedule, on hand-made histories', () => {
  it('the shipped config uses these intervals', () => {
    expect(REWARDS.review.intervals).toEqual(IV);
  });

  it('a question never missed is never reviewed', () => {
    const s = reviewSummary([ans(D0, 'cache', 0, true)], IV);
    expect(s.active.size).toBe(0);
    expect(s.mastered.size).toBe(0);
  });

  it('a miss is due the next day, even if put right straight away', () => {
    const log = [ans(D0, 'cache', 0, false), ans(D0, 'cache', 0, true)];
    expect(state(log)).toMatchObject({ box: 1, due: addDays(D0, 1), misses: 1, lastMiss: D0 });
    expect(dueReviews(reviewSummary(log, IV), D0)).toHaveLength(0);
    expect(dueReviews(reviewSummary(log, IV), addDays(D0, 1))).toHaveLength(1);
  });

  it('right answers once due walk up the boxes, and the last one masters it', () => {
    const log: ProgressEvent[] = [ans(D0, 'cache', 0, false)];
    let day = D0;
    for (let box = 1; box <= IV.length; box++) {
      day = addDays(day, IV[box - 1]!);
      expect(state(log)).toMatchObject({ box, due: day });
      log.push(ans(day, 'cache', 0, true));
    }
    const s = reviewSummary(log, IV);
    expect(s.active.has('cache#0')).toBe(false);
    expect(s.mastered.has('cache#0')).toBe(true);
    // 1 + 3 + 7 + 14 + 30 days after the miss.
    expect(day).toBe(addDays(D0, 55));
  });

  it('a right answer before it is due moves nothing', () => {
    const log = [ans(D0, 'cache', 0, false), ans(addDays(D0, 1), 'cache', 0, true), ans(addDays(D0, 2), 'cache', 0, true)];
    // Box 2 is due 3 days after day 1; the early answer on day 2 doesn't count.
    expect(state(log)).toMatchObject({ box: 2, due: addDays(D0, 4) });
  });

  it('a late answer counts, and the next wait starts from when it was answered', () => {
    const log = [ans(D0, 'cache', 0, false), ans(addDays(D0, 10), 'cache', 0, true)];
    expect(state(log)).toMatchObject({ box: 2, due: addDays(D0, 13) });
  });

  it('a miss in a high box drops it back to box 1', () => {
    const log = [ans(D0, 'cache', 0, false), ans(addDays(D0, 1), 'cache', 0, true), ans(addDays(D0, 4), 'cache', 0, true), ans(addDays(D0, 11), 'cache', 0, false)];
    expect(state(log)).toMatchObject({ box: 1, due: addDays(D0, 12), misses: 2, lastMiss: addDays(D0, 11) });
  });

  it('a mastered question missed again comes back', () => {
    const log: ProgressEvent[] = [ans(D0, 'cache', 0, false)];
    let day = D0;
    for (const gap of IV) log.push(ans((day = addDays(day, gap)), 'cache', 0, true));
    log.push(ans(addDays(day, 5), 'cache', 0, false));
    const s = reviewSummary(log, IV);
    expect(s.mastered.has('cache#0')).toBe(false);
    expect(s.active.get('cache#0')).toMatchObject({ box: 1, misses: 2 });
  });

  it('several wrong taps on one question are one review, counted as several misses', () => {
    const log = [ans(D0, 'cache', 0, false), ans(D0, 'cache', 0, false), ans(D0, 'cache', 0, true)];
    const s = reviewSummary(log, IV);
    expect(s.active.size).toBe(1);
    expect(s.active.get('cache#0')!.misses).toBe(2);
  });

  it('due reviews come oldest first, and only those that are due', () => {
    const log = [ans(D0, 'b', 0, false), ans(addDays(D0, 2), 'a', 1, false), ans(D0, 'a', 0, false), ans(addDays(D0, 9), 'c', 0, false)];
    const due = dueReviews(reviewSummary(log, IV), addDays(D0, 5)).map((s) => reviewKey(s.lesson, s.question));
    expect(due).toEqual(['a#0', 'b#0', 'a#1']);
  });

  it('events in any order, or the same log merged twice, give the same queue', () => {
    const log = [ans(D0, 'cache', 0, false), ans(addDays(D0, 1), 'cache', 0, true), ans(addDays(D0, 2), 'lb', 1, false)];
    const want = reviewSummary(log, IV);
    expect(reviewSummary([...log].reverse(), IV)).toEqual(want);
    expect(reviewSummary(mergeEvents(log, log), IV)).toEqual(want);
  });

  it('two devices merged: their answers interleave by time', () => {
    // Phone misses on day 0; laptop answers right on day 1. Merged, it's in box 2.
    const phone = [ans(D0, 'cache', 0, false)];
    const laptop = [ans(addDays(D0, 1), 'cache', 0, true)];
    expect(state(mergeEvents(phone, laptop))).toMatchObject({ box: 2 });
  });

  it('other events are ignored', () => {
    const log: ProgressEvent[] = [ans(D0, 'cache', 0, false), { id: 'c1', type: 'complete', at: `${D0}T13:00:00.000Z`, day: D0, lesson: 'cache' }, { id: 'g1', type: 'goal', at: `${D0}T13:00:00.000Z`, day: D0, goal: 2 }];
    expect(reviewSummary(log, IV).active.size).toBe(1);
  });
});

describe('review schedule, on random histories', () => {
  // A small seeded generator, so a failure can be replayed.
  function rng(seed: number) {
    let s = seed >>> 0;
    return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  }

  it('300 histories: nothing is due early, nothing never missed is queued, no question twice', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed);
      const log: AnswerEvent[] = [];
      let day = D0;
      for (let i = 0; i < 60; i++) {
        if (r() < 0.4) day = addDays(day, 1 + Math.floor(r() * 6));
        log.push(ans(day, `l${Math.floor(r() * 4)}`, Math.floor(r() * 3), r() < 0.6, 8 + (i % 12)));
      }
      const s = reviewSummary(log, IV);
      const missed = new Set(log.filter((e) => !e.correct).map((e) => reviewKey(e.lesson, e.question)));
      for (const [k, st] of s.active) {
        expect(missed.has(k)).toBe(true);
        expect(st.box).toBeGreaterThanOrEqual(1);
        expect(st.box).toBeLessThanOrEqual(IV.length);
        expect(s.mastered.has(k)).toBe(false);
        // The wait is at least the box's interval from the last answer to it.
        const last = log.filter((e) => reviewKey(e.lesson, e.question) === k).at(-1)!;
        expect(st.due >= addDays(last.day, 0)).toBe(true);
        expect(st.due >= addDays(st.lastMiss, IV[0]!)).toBe(true);
      }
      for (const k of s.mastered) expect(missed.has(k)).toBe(true);
      const today = addDays(day, 3);
      const due = dueReviews(s, today);
      expect(new Set(due.map((x) => reviewKey(x.lesson, x.question))).size).toBe(due.length);
      for (const x of due) expect(x.due <= today).toBe(true);
    }
  });
});

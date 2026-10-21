import { describe, expect, it } from 'vitest';
import { REWARDS, type RewardsConfig } from './config';
import { addDays, type Day } from './days';
import { answerOutcome, computeProgress, whatsNew, type LessonInfo } from './engine';
import { mergeEvents, type AnswerEvent, type ProgressEvent } from './events';

// Pinned numbers, so these tests don't change meaning when rewards.config.json is tuned.
const config: RewardsConfig = {
  ...REWARDS,
  xp: { firstTry: 10, afterRetry: 5, lessonComplete: 10 },
  levels: [0, 30, 80],
  dailyGoal: { default: 1, min: 1, max: 3 },
  coins: { perGoalDay: 5, bufferCost: 15, breakCost: 25 },
};

const lessons: LessonInfo[] = [
  { id: 'a', track: 'hld', level: 'easy' },
  { id: 'b', track: 'hld', level: 'hard' },
  { id: 'c', track: 'dsa', level: 'easy' },
];

let seq = 0;
const pad = (n: number) => String(n).padStart(2, '0');
// Later events get later times within the day, so array order and time order agree.
const at = (day: Day) => `${day}T${pad(Math.floor(seq / 3600) % 24)}:${pad(Math.floor(seq / 60) % 60)}:${pad(seq % 60)}.000Z`;
function answer(day: Day, lesson: string, question: number, correct: boolean): AnswerEvent {
  seq++;
  return { id: `e${seq}`, type: 'answer', at: at(day), day, lesson, question, option: correct ? 0 : 1, correct };
}
function complete(day: Day, lesson: string): ProgressEvent {
  seq++;
  return { id: `e${seq}`, type: 'complete', at: at(day), day, lesson };
}
function goal(day: Day, g: number): ProgressEvent {
  seq++;
  return { id: `e${seq}`, type: 'goal', at: at(day), day, goal: g };
}
/** A finished lesson on `day`: one first-try correct answer plus the completion. */
const finish = (day: Day, lesson = 'a') => [answer(day, lesson, 0, true), complete(day, lesson)];

const D0: Day = '2026-03-02'; // a Monday
const day = (n: number) => addDays(D0, n);
const progress = (events: ProgressEvent[], today: Day, cfg = config) => computeProgress(events, lessons, cfg, today);

describe('XP', () => {
  it('starts at zero for a new learner', () => {
    const p = progress([], D0);
    expect(p).toMatchObject({ xp: 0, level: 1, coins: 0, streak: 0, bestStreak: 0, doneToday: 0, goalToday: 1 });
    expect(p.badges.size).toBe(0);
  });

  it('gives full XP for a first-try answer and less after a retry', () => {
    const p = progress([answer(D0, 'a', 0, true), answer(D0, 'a', 1, false), answer(D0, 'a', 1, true)], D0);
    expect(p.xp).toBe(15);
  });

  it('never subtracts XP for wrong answers', () => {
    const p = progress([answer(D0, 'a', 0, false), answer(D0, 'a', 0, false), answer(D0, 'a', 0, false)], D0);
    expect(p.xp).toBe(0);
  });

  it('scores each question once: replays and re-answers add nothing (anti-farming)', () => {
    const first = [...finish(D0), answer(D0, 'a', 1, true)];
    const replays = [answer(day(1), 'a', 0, true), answer(day(1), 'a', 1, true), complete(day(1), 'a'), answer(day(2), 'a', 0, true), complete(day(2), 'a')];
    expect(progress(first, D0).xp).toBe(30); // 10 + 10 + lesson bonus 10
    expect(progress([...first, ...replays], day(2)).xp).toBe(30);
  });

  it('a wrong answer after a correct one does not turn it into a retry', () => {
    expect(progress([answer(D0, 'a', 0, true), answer(D0, 'a', 0, false)], D0).xp).toBe(10);
  });

  it('counts the lesson bonus once per lesson', () => {
    const p = progress([complete(D0, 'a'), complete(D0, 'a'), complete(day(1), 'a'), complete(day(1), 'c')], day(1));
    expect(p.xp).toBe(20);
    expect([...p.completed].sort()).toEqual(['a', 'c']);
  });

  it('a duplicated event (same id, e.g. imported twice) is counted once', () => {
    const events = finish(D0);
    expect(progress(mergeEvents(events, events), D0).xp).toBe(progress(events, D0).xp);
  });

  it('keeps XP from lessons that no longer exist in the catalog', () => {
    expect(progress([answer(D0, 'removed-lesson', 0, true)], D0).xp).toBe(10);
  });

  it('orders by time, not by array order', () => {
    const late = { ...answer(D0, 'a', 0, true), at: `${D0}T18:00:00.000Z` };
    const early = { ...answer(D0, 'a', 0, false), at: `${D0}T09:00:00.000Z` };
    expect(progress([late, early], D0).xp).toBe(5); // wrong at 09:00, right at 18:00 = retry
  });
});

describe('levels', () => {
  it('changes level exactly at each threshold', () => {
    const xpOf = (n: number) => Array.from({ length: n }, (_, i) => answer(D0, 'x', i, true)); // 10 XP each
    expect(progress(xpOf(2), D0)).toMatchObject({ xp: 20, level: 1, levelFrom: 0, levelTo: 30 });
    expect(progress(xpOf(3), D0)).toMatchObject({ xp: 30, level: 2, levelFrom: 30, levelTo: 80 });
    expect(progress(xpOf(8), D0)).toMatchObject({ xp: 80, level: 3, levelFrom: 80, levelTo: null });
    expect(progress(xpOf(50), D0)).toMatchObject({ level: 3, levelTo: null });
  });
});

describe('streak and coins', () => {
  it('a goal day grows the streak and earns coins', () => {
    const p = progress([...finish(D0), ...finish(day(1)), ...finish(day(2))], day(2));
    expect(p).toMatchObject({ streak: 3, bestStreak: 3, coins: 15, doneToday: 1 });
  });

  it('two lessons on one day still count as one day', () => {
    const p = progress([...finish(D0, 'a'), ...finish(D0, 'c')], D0);
    expect(p).toMatchObject({ streak: 1, coins: 5, doneToday: 2 });
  });

  it('today not finished yet is pending, never a miss', () => {
    const p = progress([...finish(D0), ...finish(day(1))], day(2));
    expect(p).toMatchObject({ streak: 2, coins: 10, doneToday: 0 });
    expect(p.days.get(day(2))).toBe('pending');
  });

  it('one missed day uses the buffer: streak kept, coins taken', () => {
    const events = [0, 1, 2, 3, 4].flatMap((n) => finish(day(n)));
    const p = progress([...events, ...finish(day(6))], day(6));
    expect(p.days.get(day(5))).toBe('buffer');
    expect(p).toMatchObject({ streak: 6, coins: 25 - 15 + 5 });
  });

  it('the buffer day itself does not add to the streak', () => {
    const p = progress([...finish(D0), ...finish(day(2))], day(2));
    expect(p.streak).toBe(2);
  });

  it('warns when yesterday used the buffer', () => {
    const p = progress([...finish(D0), ...finish(day(1))], day(3));
    expect(p.bufferUsedYesterday).toBe(true);
    expect(p.streak).toBe(2);
  });

  it('a second missed day in a row breaks the streak and takes more coins', () => {
    const events = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((n) => finish(day(n))); // 50 coins
    const p = progress(events, day(12));
    expect(p.days.get(day(10))).toBe('buffer');
    expect(p.days.get(day(11))).toBe('broken');
    expect(p).toMatchObject({ streak: 0, bestStreak: 10, coins: 50 - 15 - 25 });
  });

  it('further missed days take nothing more', () => {
    const events = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((n) => finish(day(n)));
    expect(progress(events, day(40)).coins).toBe(10);
    expect(progress(events, day(40)).days.get(day(20))).toBe('missed');
  });

  it('buffer, goal day, then another miss uses the buffer again', () => {
    const events = [0, 1, 2, 3, 5, 6].flatMap((n) => finish(day(n))); // miss day 4, miss day 7
    const p = progress([...events, ...finish(day(8))], day(8));
    expect(p.days.get(day(4))).toBe('buffer');
    expect(p.days.get(day(7))).toBe('buffer');
    expect(p.streak).toBe(7);
  });

  it('misses with no streak to lose cost nothing', () => {
    const p = progress([answer(D0, 'a', 0, false)], day(5));
    expect(p).toMatchObject({ coins: 0, streak: 0 });
    expect(p.days.get(day(1))).toBe('missed');
  });

  it('coins never go below zero', () => {
    const p = progress(finish(D0), day(3)); // 5 coins, then buffer (-15) and break (-25)
    expect(p.coins).toBe(0);
    expect(p.days.get(day(1))).toBe('buffer');
    expect(p.days.get(day(2))).toBe('broken');
  });

  it('a buffer that costs more than the balance stops at zero, so the next goal day starts from 0', () => {
    // 5 coins, buffer takes 15 -> 0 (not -10), goal day +5 -> 5.
    const p = progress([...finish(D0), ...finish(day(2))], day(2));
    expect(p.days.get(day(1))).toBe('buffer');
    expect(p.coins).toBe(5);
  });

  it('a new streak after a break starts from 1', () => {
    const p = progress([...finish(D0), ...finish(day(1)), ...finish(day(5))], day(5));
    expect(p).toMatchObject({ streak: 1, bestStreak: 2 });
  });

  it('answering without finishing a lesson does not meet the goal', () => {
    const p = progress([answer(D0, 'a', 0, true), answer(day(1), 'a', 1, true)], day(2));
    expect(p.streak).toBe(0);
  });

  it('crosses month, year and leap-day boundaries', () => {
    const start: Day = '2027-12-30';
    const events = [0, 1, 2, 3].flatMap((n) => finish(addDays(start, n))); // Dec 30 .. Jan 2
    expect(progress(events, '2028-01-02').streak).toBe(4);
    const leap = ['2028-02-28', '2028-02-29', '2028-03-01'].flatMap((d) => finish(d));
    expect(progress(leap, '2028-03-01').streak).toBe(3);
  });

  it('daylight-saving changes do not create or skip days', () => {
    // Europe moves its clocks on 2026-03-29 and 2026-10-25, the US on 2026-03-08 and 2026-11-01.
    for (const change of ['2026-03-29', '2026-10-25', '2026-03-08', '2026-11-01']) {
      const events = [-1, 0, 1].flatMap((n) => finish(addDays(change, n)));
      expect(progress(events, addDays(change, 1)).streak, change).toBe(3);
    }
  });

  it('a clock that moved backwards does not crash or count negative days', () => {
    const events = [...finish(day(5)), ...finish(day(6))];
    const p = progress(events, day(2)); // device clock now says an earlier date
    expect(p).toMatchObject({ streak: 2, coins: 10 });
  });

  it('judges each day by the goal in force that day', () => {
    // Goal raised to 2 on day 2: day 0 and 1 (one lesson each) still count.
    const events = [...finish(D0), ...finish(day(1)), goal(day(2), 2), ...finish(day(2), 'a'), ...finish(day(2), 'c')];
    const p = progress(events, day(2));
    expect(p).toMatchObject({ streak: 3, goalToday: 2, doneToday: 2 });
  });

  it('a day under a raised goal is not met with one lesson', () => {
    const p = progress([...finish(D0), goal(day(1), 2), ...finish(day(1))], day(2));
    expect(p.days.get(day(1))).toBe('buffer');
  });

  it('a long absence is handled quickly', () => {
    const t = performance.now();
    progress(finish('2020-01-01'), '2030-01-01');
    expect(performance.now() - t).toBeLessThan(500);
  });
});

describe('review sessions and the daily goal (Phase 7)', () => {
  function review(d: Day, count = 5): ProgressEvent {
    seq++;
    return { id: `e${seq}`, type: 'review', at: at(d), day: d, count };
  }

  it('a finished review session counts as one lesson towards the goal', () => {
    const p = progress([answer(D0, 'a', 0, false), review(D0)], D0);
    expect(p.doneToday).toBe(1);
    expect(p.days.get(D0)).toBe('met');
    expect(p.streak).toBe(1);
  });

  it('earns no XP of its own', () => {
    expect(progress([review(D0)], D0).xp).toBe(0);
  });

  it('two sessions count as two, and add to lessons finished that day', () => {
    const p = progress([goal(D0, 3), ...finish(D0), review(D0), review(D0)], D0);
    expect(p.doneToday).toBe(3);
    expect(p.days.get(D0)).toBe('met');
  });

  it('keeps a streak going on days with reviews only', () => {
    const p = progress([...finish(D0), review(day(1)), review(day(2))], day(2));
    expect(p.streak).toBe(3);
    expect(p.coins).toBe(15);
  });

  it('merging the same session twice counts it once', () => {
    const r = review(D0);
    expect(progress(mergeEvents([r], [r]), D0).doneToday).toBe(1);
  });
});

describe('badges', () => {
  it('awards lesson-count badges on the day the count is reached', () => {
    const p = progress(finish(D0), D0);
    expect(p.badges.get('first-lesson')).toBe(D0);
    expect(p.badges.has('five-lessons')).toBe(false);
  });

  it('counts distinct lessons, not replays', () => {
    const p = progress([0, 1, 2, 3, 4].flatMap((n) => finish(day(n), 'a')), day(4));
    expect(p.badges.has('five-lessons')).toBe(false);
  });

  it('a mistake counts as fixed only on a later day', () => {
    const sameDay = progress([answer(D0, 'a', 0, false), answer(D0, 'a', 0, true)], D0);
    expect(sameDay.badges.has('fix-mistake')).toBe(false);
    const later = progress([answer(D0, 'a', 0, false), answer(day(3), 'a', 0, true)], day(3));
    expect(later.badges.get('fix-mistake')).toBe(day(3));
  });

  it('awards the hard-lesson badge only for a hard lesson', () => {
    expect(progress(finish(D0, 'a'), D0).badges.has('hard-lesson')).toBe(false);
    expect(progress(finish(D0, 'b'), D0).badges.has('hard-lesson')).toBe(true);
  });

  it('awards a streak badge when the streak is reached, and keeps it after a break', () => {
    const p = progress([0, 1, 2].flatMap((n) => finish(day(n))), day(10));
    expect(p.streak).toBe(0);
    expect(p.badges.get('streak-3')).toBe(day(2));
  });

  it('awards a track badge once every lesson in that track is finished', () => {
    expect(progress(finish(D0, 'a'), D0).badges.has('track-hld')).toBe(false);
    const p = progress([...finish(D0, 'a'), ...finish(day(1), 'b')], day(1));
    expect(p.badges.get('track-hld')).toBe(day(1));
  });

  it('never awards a badge for a track that has no lessons yet', () => {
    expect(progress(finish(D0, 'a'), D0).badges.has('track-lld')).toBe(false);
  });

  it('keeps a recorded badge even if its rule no longer holds', () => {
    const badge: ProgressEvent = { id: 'b1', type: 'badge', at: at(D0), day: D0, badge: 'track-hld' };
    expect(progress([badge], day(1)).badges.get('track-hld')).toBe(D0);
  });
});

describe('answerOutcome and whatsNew', () => {
  it('classifies each answer from the history before it', () => {
    const wrong = answer(D0, 'a', 0, false);
    const right = answer(D0, 'a', 0, true);
    expect(answerOutcome([], answer(D0, 'a', 0, true))).toBe('first-try');
    expect(answerOutcome([], wrong)).toBe('wrong');
    expect(answerOutcome([wrong], right)).toBe('retry');
    expect(answerOutcome([wrong, right], answer(D0, 'a', 0, true))).toBe('already-scored');
    expect(answerOutcome([right], answer(D0, 'a', 1, true))).toBe('first-try');
  });

  it('agrees with computeProgress on the XP an answer adds', () => {
    const before = [answer(D0, 'a', 0, false)];
    const next = answer(D0, 'a', 0, true);
    const delta = progress([...before, next], D0).xp - progress(before, D0).xp;
    expect(answerOutcome(before, next)).toBe('retry');
    expect(delta).toBe(config.xp.afterRetry);
  });

  it('reports new XP, level-ups and badges', () => {
    const before = progress([answer(D0, 'x', 0, true), answer(D0, 'x', 1, true)], D0);
    const after = progress([answer(D0, 'x', 0, true), answer(D0, 'x', 1, true), ...finish(D0, 'a')], D0);
    expect(whatsNew(before, after)).toEqual({ xp: 20, levelUp: true, badges: ['first-lesson'] });
  });
});

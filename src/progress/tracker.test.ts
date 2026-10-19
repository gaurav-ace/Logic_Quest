import { describe, expect, it } from 'vitest';
import { REWARDS } from '../rewards/config';
import type { LessonInfo } from '../rewards/engine';
import { ProgressStore, type KeyValue } from './store';
import { Tracker } from './tracker';

class MemoryKV implements KeyValue {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
}

const lessons: LessonInfo[] = [
  { id: 'a', track: 'web', level: 'easy' },
  { id: 'b', track: 'hld', level: 'easy' },
];

function setup(start = new Date(2026, 9, 19, 9, 0)) {
  let clock = start.getTime();
  const now = () => new Date((clock += 1000));
  const kv = new MemoryKV();
  const store = new ProgressStore(kv, now);
  const advanceDays = (n: number) => (clock += n * 86_400_000);
  return { kv, store, tracker: new Tracker(store, lessons, REWARDS, now), now, advanceDays };
}

describe('Tracker', () => {
  it('reports a first-try answer', () => {
    const { tracker } = setup();
    expect(tracker.answer('a', 0, 0, true)).toMatchObject({ outcome: 'first-try', xp: REWARDS.xp.firstTry, text: `+${REWARDS.xp.firstTry} XP, first try` });
  });

  it('reports a retry, and a wrong answer with no XP and no text', () => {
    const { tracker } = setup();
    expect(tracker.answer('a', 0, 1, false)).toMatchObject({ outcome: 'wrong', xp: 0, text: '' });
    expect(tracker.answer('a', 0, 0, true)).toMatchObject({ outcome: 'retry', xp: REWARDS.xp.afterRetry });
  });

  it('a replayed answer says it was already scored and earns nothing', () => {
    const { tracker } = setup();
    tracker.answer('a', 0, 0, true);
    const again = tracker.answer('a', 0, 0, true);
    expect(again).toMatchObject({ outcome: 'already-scored', xp: 0 });
    expect(again.text).toContain('Already scored');
  });

  it('completing a lesson gives the bonus once, mentions the goal, and awards the first badge', () => {
    const { tracker } = setup();
    tracker.answer('a', 0, 0, true);
    const first = tracker.complete('a');
    expect(first.xp).toBe(REWARDS.xp.lessonComplete);
    expect(first.text).toContain('Today’s goal is done.');
    expect(first.badges.map((b) => b.id)).toContain('first-lesson');
    const replay = tracker.complete('a');
    expect(replay).toMatchObject({ xp: 0, text: 'Lesson complete. Today’s goal is done.', badges: [] });
  });

  it('records earned badges so they survive later rule changes', () => {
    const { tracker, store } = setup();
    tracker.complete('a'); // finishes the whole "web" track (one lesson)
    expect(store.events.filter((e) => e.type === 'badge').map((e) => e.type === 'badge' && e.badge).sort()).toEqual(['first-lesson', 'track-web']);
    // A new web lesson appears: the track is no longer complete, but the badge stays.
    const grown = new Tracker(store, [...lessons, { id: 'c', track: 'web', level: 'easy' }], REWARDS);
    expect(grown.progress().badges.has('track-web')).toBe(true);
  });

  it('progress survives a reload through storage', () => {
    const { kv, tracker, now } = setup();
    tracker.answer('a', 0, 0, true);
    tracker.complete('a');
    const reloaded = new Tracker(new ProgressStore(kv, now), lessons, REWARDS, now);
    expect(reloaded.progress()).toMatchObject({ xp: tracker.progress().xp, streak: 1 });
  });

  it('builds a streak across real days', () => {
    const { tracker, advanceDays } = setup();
    tracker.complete('a');
    advanceDays(1);
    tracker.complete('b');
    expect(tracker.progress().streak).toBe(2);
  });

  it('sets the daily goal within the config range only', () => {
    const { tracker } = setup();
    tracker.setDailyGoal(2);
    expect(tracker.progress().goalToday).toBe(2);
    expect(() => tracker.setDailyGoal(REWARDS.dailyGoal.max + 1)).toThrow('Daily goal must be');
    expect(() => tracker.setDailyGoal(1.5)).toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import type { Progress } from '../rewards/engine';
import { streakMessage } from './hud';

const p = (over: Partial<Progress>): Progress => ({
  xp: 0, level: 1, levelFrom: 0, levelTo: 30, coins: 0, streak: 0, bestStreak: 0, goalToday: 1, doneToday: 0,
  bufferUsedYesterday: false, days: new Map(), completed: new Set(), badges: new Map(), ...over,
});

describe('streakMessage', () => {
  it('says the goal is done once it is', () => {
    expect(streakMessage(p({ doneToday: 1, streak: 4 }), 15)).toBe('Today’s goal is done.');
  });

  it('invites a start when there is no streak', () => {
    expect(streakMessage(p({}), 15)).toBe('Finish 1 lesson today to start a streak.');
  });

  it('states the buffer cost while on a streak', () => {
    expect(streakMessage(p({ streak: 3 }), 15)).toBe('Finish 1 lesson today to grow your streak. Missing today uses your buffer (−15 coins).');
  });

  it('is plain about the risk after a buffer day, without guilt', () => {
    const msg = streakMessage(p({ streak: 10, bufferUsedYesterday: true }), 15);
    expect(msg).toBe('Yesterday used your buffer. Finish 1 lesson today to keep your 10-day streak.');
  });

  it('counts the lessons still needed for a bigger goal', () => {
    expect(streakMessage(p({ goalToday: 3, doneToday: 1, streak: 2 }), 15)).toContain('Finish 2 lessons today');
  });
});

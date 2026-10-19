import { describe, expect, it } from 'vitest';
import { atEnd, initialState, readingTime, reduce, type PlayerAction, type PlayerConfig, type PlayerState } from './player';

const config = (over: Partial<PlayerConfig> = {}): PlayerConfig => ({
  steps: [
    { hops: 1, readMs: 1000 },
    { hops: 2, readMs: 1000 },
    { hops: 0, readMs: 1000 },
  ],
  hopMs: 500,
  reducedMotion: false,
  ...over,
});

function run(c: PlayerConfig, ...actions: PlayerAction[]): PlayerState {
  return actions.reduce((s, a) => reduce(c, s, a), initialState(c));
}

const tick = (ms: number): PlayerAction => ({ type: 'tick', ms });

describe('player navigation', () => {
  it('starts paused at step 0 with the packet at the start', () => {
    expect(initialState(config())).toEqual({ step: 0, progress: 0, read: 0, playing: false, speed: 1, finished: false });
  });

  it('refuses a lesson with no steps', () => {
    expect(() => initialState(config({ steps: [] }))).toThrow('at least one step');
  });

  it('next and back move one step and reset the packet', () => {
    const c = config();
    const s = run(c, tick(500), { type: 'next' });
    expect(s).toMatchObject({ step: 1, progress: 0, read: 0 });
    expect(reduce(c, s, { type: 'back' })).toMatchObject({ step: 0, progress: 0 });
  });

  it('back on the first step stays on it and replays its packet', () => {
    expect(run(config(), tick(250), { type: 'back' })).toMatchObject({ step: 0, progress: 0 });
  });

  it('next on the last step finishes the lesson and stops playing', () => {
    const s = run(config(), { type: 'goTo', step: 2 }, { type: 'play' }, { type: 'next' });
    expect(s).toMatchObject({ step: 2, finished: true, playing: false });
  });

  it('going back after finishing clears finished', () => {
    const s = run(config(), { type: 'goTo', step: 2 }, { type: 'next' }, { type: 'back' });
    expect(s).toMatchObject({ step: 1, finished: false });
  });

  it('goTo clamps out-of-range and fractional steps', () => {
    const c = config();
    expect(run(c, { type: 'goTo', step: 99 }).step).toBe(2);
    expect(run(c, { type: 'goTo', step: -3 }).step).toBe(0);
    expect(run(c, { type: 'goTo', step: 1.7 }).step).toBe(1);
  });

  it('restart returns to step 0 and pauses', () => {
    expect(run(config(), { type: 'goTo', step: 2 }, { type: 'play' }, { type: 'restart' })).toMatchObject({ step: 0, playing: false });
  });

  it('a 1-step lesson finishes on next', () => {
    const c = config({ steps: [{ hops: 1, readMs: 100 }] });
    expect(run(c, { type: 'next' })).toMatchObject({ step: 0, finished: true });
  });
});

describe('player timing', () => {
  it('moves the packet even while paused', () => {
    expect(run(config(), tick(250)).progress).toBeCloseTo(0.5);
  });

  it('does not count reading time while paused', () => {
    const s = run(config(), tick(5000));
    expect(s).toMatchObject({ step: 0, progress: 1, read: 0 });
  });

  it('auto-play waits for the packet, then the reading time, then advances', () => {
    const c = config();
    let s = run(c, { type: 'play' }, tick(500));
    expect(s).toMatchObject({ step: 0, progress: 1, read: 0 });
    s = reduce(c, s, tick(999));
    expect(s.step).toBe(0);
    s = reduce(c, s, tick(1));
    expect(s).toMatchObject({ step: 1, progress: 0, read: 0, playing: true });
  });

  it('a step with no packet goes straight to reading time', () => {
    const s = run(config(), { type: 'goTo', step: 2 }, { type: 'play' }, tick(400));
    expect(s).toMatchObject({ step: 2, progress: 1, read: 400 });
  });

  it('a huge tick never skips a step', () => {
    const s = run(config(), { type: 'play' }, tick(1_000_000));
    expect(s).toMatchObject({ step: 1, progress: 0 });
  });

  it('auto-play stops on the last step instead of finishing for the learner', () => {
    const c = config();
    const s = run(c, { type: 'goTo', step: 2 }, { type: 'play' }, tick(1000));
    expect(s).toMatchObject({ step: 2, playing: false, finished: false });
  });

  it('play at the very end starts over from step 0', () => {
    const c = config();
    const ended = run(c, { type: 'goTo', step: 2 }, { type: 'play' }, tick(1000));
    expect(reduce(c, ended, { type: 'play' })).toMatchObject({ step: 0, playing: true });
    const finished = run(c, { type: 'goTo', step: 2 }, { type: 'next' });
    expect(reduce(c, finished, { type: 'play' })).toMatchObject({ step: 0, playing: true, finished: false });
  });

  it('atEnd is true only once the last step has fully played, or after finishing', () => {
    const c = config();
    expect(atEnd(c, run(c, { type: 'goTo', step: 2 }))).toBe(false);
    expect(atEnd(c, run(c, { type: 'goTo', step: 2 }, { type: 'play' }, tick(999)))).toBe(false);
    expect(atEnd(c, run(c, { type: 'goTo', step: 2 }, { type: 'play' }, tick(1000)))).toBe(true);
    expect(atEnd(c, run(c, { type: 'goTo', step: 2 }, { type: 'next' }))).toBe(true);
  });

  it('play mid-lesson continues from where it is', () => {
    expect(run(config(), { type: 'goTo', step: 1 }, tick(300), { type: 'play' })).toMatchObject({ step: 1, playing: true });
  });

  it('speed scales both packet and reading time', () => {
    const c = config();
    expect(run(c, { type: 'setSpeed', speed: 2 }, tick(125)).progress).toBeCloseTo(0.5);
    expect(run(c, { type: 'setSpeed', speed: 0.5 }, tick(500)).progress).toBeCloseTo(0.5);
    // 2x: 250 ms of packet + 500 ms of reading = 750 ms to move on.
    const s = run(c, { type: 'setSpeed', speed: 2 }, { type: 'play' }, tick(749));
    expect(s.step).toBe(0);
    expect(reduce(c, s, tick(1)).step).toBe(1);
  });

  it('cycleSpeed goes 1x → 2x → 0.5x → 1x', () => {
    const c = config();
    const speeds = [1, 2, 3].map((n) => run(c, ...Array<PlayerAction>(n).fill({ type: 'cycleSpeed' })).speed);
    expect(speeds).toEqual([2, 0.5, 1]);
  });

  it('pause stops reading time but keeps the step', () => {
    const c = config();
    const s = run(c, { type: 'play' }, tick(500), tick(300), { type: 'pause' }, tick(5000));
    expect(s).toMatchObject({ step: 0, read: 300, playing: false });
  });

  it('toggle switches between playing and paused', () => {
    const c = config();
    expect(run(c, { type: 'toggle' }).playing).toBe(true);
    expect(run(c, { type: 'toggle' }, { type: 'toggle' }).playing).toBe(false);
  });

  it('ignores zero, negative and NaN ticks', () => {
    const c = config();
    const start = run(c, { type: 'play' });
    for (const ms of [0, -10, Number.NaN]) expect(reduce(c, start, tick(ms))).toBe(start);
  });

  it('a 2-hop step needs two hop times to arrive', () => {
    const s = run(config(), { type: 'goTo', step: 1 }, tick(500));
    expect(s.progress).toBeCloseTo(0.5);
  });
});

describe('reduced motion', () => {
  it('shows the packet at its destination on every step', () => {
    const c = config({ reducedMotion: true });
    expect(initialState(c).progress).toBe(1);
    expect(run(c, { type: 'next' }).progress).toBe(1);
    expect(run(c, { type: 'next' }, { type: 'back' }).progress).toBe(1);
  });

  it('still gives full reading time before auto-play moves on', () => {
    const c = config({ reducedMotion: true });
    expect(run(c, { type: 'play' }, tick(999)).step).toBe(0);
    expect(run(c, { type: 'play' }, tick(1000)).step).toBe(1);
  });
});

describe('readingTime', () => {
  it('allows about 250 ms a word with a 1.5 s minimum', () => {
    expect(readingTime('Hi')).toBe(1500);
    expect(readingTime('one two three four five six seven eight nine ten')).toBe(2500);
    expect(readingTime('   ')).toBe(1500);
  });
});

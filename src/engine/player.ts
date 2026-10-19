// Step player: the timing and navigation rules for a lesson, with no DOM, so they can be
// unit-tested. The renderer feeds it actions and draws whatever state comes back.

export const SPEEDS = [0.5, 1, 2] as const;
export type Speed = (typeof SPEEDS)[number];

export interface StepTiming {
  /** Number of packet hops in the step (0 means no packet). */
  hops: number;
  /** Reading time after the packet arrives, at 1x, before auto-play moves on. */
  readMs: number;
}

export interface PlayerConfig {
  steps: StepTiming[];
  /** Time for one hop at 1x. */
  hopMs: number;
  /** Reduced motion: the packet is shown at its destination at once. Reading time still applies. */
  reducedMotion: boolean;
}

export interface PlayerState {
  step: number;
  /** Packet progress through the current step's path, 0 to 1. */
  progress: number;
  /** Reading time spent on this step after the packet arrived (ms, already speed-scaled). */
  read: number;
  playing: boolean;
  speed: Speed;
  /** Set when the learner moves past the last step: time for the quiz. */
  finished: boolean;
}

export type PlayerAction =
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'goTo'; step: number }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'toggle' }
  | { type: 'setSpeed'; speed: Speed }
  | { type: 'cycleSpeed' }
  | { type: 'tick'; ms: number }
  | { type: 'restart' };

/** Reading time from caption length: about 4 words a second, never under 1.5 s. */
export function readingTime(caption: string): number {
  const words = caption.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1500, words * 250);
}

export function initialState(config: PlayerConfig): PlayerState {
  if (config.steps.length === 0) throw new Error('A lesson needs at least one step');
  return enter(config, { step: 0, progress: 0, read: 0, playing: false, speed: 1, finished: false }, 0);
}

/** Put the player at the start of `step`, keeping playing and speed. */
function enter(config: PlayerConfig, s: PlayerState, step: number): PlayerState {
  const clamped = Math.min(Math.max(Math.trunc(step), 0), config.steps.length - 1);
  return { ...s, step: clamped, progress: config.reducedMotion ? 1 : 0, read: 0, finished: false };
}

const last = (config: PlayerConfig) => config.steps.length - 1;

export function reduce(config: PlayerConfig, s: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case 'next':
      if (s.step < last(config)) return enter(config, s, s.step + 1);
      return { ...s, playing: false, finished: true };
    case 'back':
      return enter(config, s, s.step - 1);
    case 'goTo':
      return enter(config, s, action.step);
    case 'play':
      // Playing from the very end starts the lesson over instead of doing nothing.
      if (s.finished || (s.step === last(config) && arrived(config, s) && s.read >= readMs(config, s))) {
        return { ...enter(config, s, 0), playing: true };
      }
      return { ...s, playing: true };
    case 'pause':
      return { ...s, playing: false };
    case 'toggle':
      return reduce(config, s, { type: s.playing ? 'pause' : 'play' });
    case 'setSpeed':
      return { ...s, speed: action.speed };
    case 'cycleSpeed': {
      const i = SPEEDS.indexOf(s.speed);
      return { ...s, speed: SPEEDS[(i + 1) % SPEEDS.length]! };
    }
    case 'restart':
      return { ...enter(config, s, 0), playing: false };
    case 'tick':
      return tick(config, s, action.ms);
  }
}

function hopsMs(config: PlayerConfig, s: PlayerState): number {
  return config.steps[s.step]!.hops * config.hopMs;
}

function readMs(config: PlayerConfig, s: PlayerState): number {
  return config.steps[s.step]!.readMs;
}

function arrived(config: PlayerConfig, s: PlayerState): boolean {
  return s.progress >= 1 || hopsMs(config, s) === 0;
}

function tick(config: PlayerConfig, s: PlayerState, ms: number): PlayerState {
  if (!(ms > 0) || s.finished) return s;
  let time = ms * s.speed;
  let next = s;

  // The packet moves whether or not auto-play is on, so a tap on Next still animates.
  if (!arrived(config, next)) {
    const total = hopsMs(config, next);
    const remaining = (1 - next.progress) * total;
    const used = Math.min(time, remaining);
    next = { ...next, progress: used === remaining ? 1 : next.progress + used / total };
    time -= used;
  } else if (next.progress < 1) {
    next = { ...next, progress: 1 };
  }

  if (!next.playing || time <= 0) return next;
  next = { ...next, read: Math.min(next.read + time, readMs(config, next)) };
  if (next.read < readMs(config, next)) return next;

  // Reading time is up. Move on one step only: leftover time is dropped, so a long frame
  // (or a tab coming back from the background) can never skip a step the learner hasn't seen.
  if (next.step < last(config)) return enter(config, next, next.step + 1);
  return { ...next, playing: false };
}

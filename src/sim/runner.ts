import { seeded } from '../trace/tools';
import type { Model, Params } from './types';

// Runs a model without a screen, for tests and for checking challenge goals.

export interface Sample {
  /** Simulated seconds since the start. */
  t: number;
  values: Record<string, number>;
}

export interface Scheduled {
  /** Simulated ms at which to apply the action. */
  at: number;
  action: string;
}

export function runSim<S>(model: Model<S>, params: Params, seed: number, ms: number, schedule: Scheduled[] = [], sampleEveryMs = 500): Sample[] {
  const random = seeded(seed);
  let state = model.init(params, random);
  const pending = [...schedule].sort((a, b) => a.at - b.at);
  const samples: Sample[] = [];
  for (let now = 0; now < ms; ) {
    while (pending.length && pending[0]!.at <= now) state = model.act(state, pending.shift()!.action, params);
    state = model.step(state, params, random);
    now += model.tickMs;
    if (now % sampleEveryMs === 0) samples.push({ t: now / 1000, values: model.read(state) });
  }
  return samples;
}

export interface Goal {
  metric: string;
  op: '<=' | '>=';
  value: number;
  /** The condition must hold continuously for this long. */
  forSeconds: number;
  /** It must hold from the very first sample, with no time to settle. */
  fromStart?: boolean;
}

export const holds = (goal: Goal, values: Record<string, number>) => {
  const v = values[goal.metric] ?? NaN;
  return goal.op === '<=' ? v <= goal.value : v >= goal.value;
};

/** True once the goal has held for `forSeconds` in a row (samples every `stepSeconds`). */
export function goalMet(samples: Sample[], goal: Goal, stepSeconds = 0.5): boolean {
  let run = 0;
  for (const s of samples) {
    const ok = holds(goal, s.values);
    if (!ok && goal.fromStart) return false;
    run = ok ? run + stepSeconds : 0;
    if (run >= goal.forSeconds) return true;
  }
  return false;
}

/** Average of a metric over samples from `fromSeconds` on: handy for comparing two settings. */
export function averageFrom(samples: Sample[], metric: string, fromSeconds: number): number {
  const xs = samples.filter((s) => s.t >= fromSeconds).map((s) => s.values[metric] ?? 0);
  return xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
}

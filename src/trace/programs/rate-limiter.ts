import { predict, randomInt, Tracer } from '../tools';
import type { Program, Value } from '../types';

// S12 "Rate limiting": allow at most about N requests a second. A fixed window counts per
// clock second and resets on the second, so a burst straddling the boundary gets 2N through.
// A token bucket refills smoothly, so bursts are capped at its size.

export interface LimitInput {
  /** Request times in seconds, increasing. */
  times: number[];
  /** Allowed per second (fixed window limit, and the bucket's refill rate and size). */
  limit: number;
}

const code = [
  'def allow(t):  # token bucket',
  '    refill = (t - last) * rate',
  '    left = min(cap, left + refill)',
  '    last = t',
  '    if left >= 1:',
  '        left -= 1',
  '        return True',
  '    return False',
];

export function fixedWindow(times: number[], limit: number): boolean[] {
  const counts = new Map<number, number>();
  return times.map((t) => {
    const w = Math.floor(t);
    const n = counts.get(w) ?? 0;
    if (n >= limit) return false;
    counts.set(w, n + 1);
    return true;
  });
}

export function tokenBucket(times: number[], limit: number): boolean[] {
  let left = limit;
  let last = 0;
  return times.map((t) => {
    left = Math.min(limit, left + (t - last) * limit);
    last = t;
    if (left >= 1 - 1e-9) {
      left -= 1;
      return true;
    }
    return false;
  });
}

const round2 = (x: number) => Math.round(x * 100) / 100;

export const rateLimiter: Program<LimitInput> = {
  id: 'rate-limiter',
  code,
  // Quiet, then a burst just before and just after the 1-second boundary.
  defaultInput: { times: [0.2, 0.6, 0.9, 0.92, 0.94, 0.96, 1.01, 1.03, 1.05, 1.07, 1.6], limit: 4 },
  randomInput: (r) => {
    const limit = randomInt(r, 3, 5);
    const edge = randomInt(r, 1, 2);
    const before = Array.from({ length: limit }, (_, i) => round2(edge - 0.1 + i * 0.02));
    const after = Array.from({ length: limit }, (_, i) => round2(edge + 0.01 + i * 0.02));
    const quiet = [round2(edge - 0.7), round2(edge + 0.6)];
    return { times: [quiet[0]!, ...before, ...after, quiet[1]!].sort((a, b) => a - b), limit };
  },
  describe: ({ times, limit }) => `limit ${limit}/s; requests at ${times.join(', ')} s`,
  reference: ({ times, limit }) => [fixedWindow(times, limit), tokenBucket(times, limit)],
  run({ times, limit }) {
    const t = new Tracer();
    const fixed = fixedWindow(times, limit);
    const bucket: boolean[] = [];
    const rows: Value[][] = [];
    const table = (hl?: number) => [{ type: 'table' as const, label: 'Decisions', columns: ['time (s)', 'fixed window', 'token bucket', 'tokens left'], rows, ...(hl === undefined ? {} : { highlightRow: hl }) }];
    t.step(null, `Allow about ${limit} requests a second. Two ways: count per clock second (fixed window), or a bucket of ${limit} tokens that refills at ${limit} a second.`, { limit }, table());
    let left = limit;
    let last = 0;
    let asked = 0;
    times.forEach((time, i) => {
      const refill = (time - last) * limit;
      left = Math.min(limit, left + refill);
      last = time;
      const ok = left >= 1 - 1e-9;
      const tokensBefore = round2(left);
      if (ok) left -= 1;
      bucket.push(ok);
      rows.push([time, fixed[i]! ? 'allow' : 'block', ok ? 'allow' : 'block', round2(left)]);
      const boundary = i > 0 && Math.floor(times[i - 1]!) !== Math.floor(time);
      const ask =
        asked < 2 && (boundary || (i > 0 && !ok && bucket[i - 1]))
          ? (asked++,
            predict(
              `A request at ${time} s. The bucket had ${tokensBefore} token${tokensBefore === 1 ? '' : 's'} after refilling. Allowed?`,
              ok ? 'yes' : 'no',
              ok ? `At least one token is left, so it is allowed and uses one.` : `Less than one token: blocked. The bucket only refills at ${limit} a second.`,
              [{ value: ok ? 'no' : 'yes', why: ok ? 'There is still a whole token to spend.' : `The burst used the tokens up; time since the last request (${round2(refill / limit)} s) refilled only ${round2(refill)}.` }],
              asked + i,
            ))
          : undefined;
      t.step(ok ? 7 : 8, `${time} s: fixed window ${fixed[i] ? 'allows' : 'blocks'} it (${Math.floor(time)}–${Math.floor(time) + 1} s window); the bucket ${ok ? 'allows' : 'blocks'} it, ${round2(left)} tokens left.`, { t: time, left: round2(left) }, table(rows.length - 1), ask);
    });
    // The worst one-second stretch each method let through.
    const worst = (allowed: boolean[]) => Math.max(...times.map((s) => times.filter((x, j) => allowed[j] && x >= s && x < s + 1).length));
    const wf = worst(fixed);
    const wb = worst(bucket);
    const sumAsk = predict(
      `In the busiest one-second stretch, how many requests did the fixed window let through?`,
      wf,
      `The window resets on each whole second, so ${limit} just before and ${limit} just after the boundary all pass: up to ${2 * limit} within one second.`,
      [
        { value: limit, why: `Each window allows ${limit}, but a one-second stretch can overlap two windows.` },
        { value: wb, why: `That is the token bucket. Its total is capped because tokens refill gradually.` },
      ],
      99,
    );
    t.step(null, `Busiest one-second stretch: fixed window ${wf}, token bucket ${wb}. The bucket allows short bursts up to its size, but never ${2 * limit} in a second.`, { result: [fixed, bucket] }, table(), sumAsk);
    return t.frames;
  },
};

import type { ClassDiagram } from '../../engine/uml';
import { predict, randomInt, Tracer } from '../tools';
import type { Program, Value, View } from '../types';
import { tokenBucket } from './rate-limiter';

// O13 "Design: rate limiter class": the S12 token bucket as a class, one bucket per user, and a
// clock passed in, so a test can drive time instead of waiting for it.

export interface LimiterInput {
  /** Requests a second per user (also each bucket's size). */
  rate: number;
  /** [time in seconds, user], times increasing. */
  reqs: [number, string][];
}

const code = [
  'class Bucket:',
  '    def __init__(self, r, now):',
  '        self.r, self.left = r, r',
  '        self.last = now',
  '',
  '    def allow(self, now):',
  '        dt = now - self.last',
  '        self.left += dt * self.r',
  '        if self.left > self.r:',
  '            self.left = self.r',
  '        self.last = now',
  '        if self.left < 1:',
  '            return False',
  '        self.left -= 1',
  '        return True',
  '',
  'class Limiter:',
  '    def __init__(self, r, clock):',
  '        self.r = r',
  '        self.clock = clock',
  '        self.users = {}  # Buckets',
  '',
  '    def allow(self, user):',
  '        r = self.r',
  '        now = self.clock()',
  '        if user not in self.users:',
  '            self.users[user] = (',
  '                Bucket(r, now))',
  '        b = self.users[user]',
  '        return b.allow(now)',
];

/** Reference: S12's tested token bucket, run on each user's requests on their own. */
export function perUser({ rate, reqs }: LimiterInput): boolean[] {
  const out: boolean[] = new Array<boolean>(reqs.length);
  for (const user of new Set(reqs.map(([, u]) => u))) {
    const idx = reqs.flatMap(([, u], i) => (u === user ? [i] : []));
    tokenBucket(idx.map((i) => reqs[i]![0]), rate).forEach((ok, j) => (out[idx[j]!] = ok));
  }
  return out;
}

const classes: ClassDiagram = {
  type: 'class',
  classes: [
    { id: 'limiter', name: 'Limiter', col: 'both', row: 0, fields: ['users: user → Bucket'], methods: ['allow(user)'] },
    { id: 'bucket', name: 'Bucket', col: 0, row: 1, fields: ['left, last'], methods: ['allow(now)'] },
    { id: 'clock', name: 'Clock', col: 1, row: 1, kind: 'interface', methods: ['() → now'] },
  ],
  relations: [
    { from: 'limiter', to: 'bucket', type: 'has' },
    { from: 'limiter', to: 'clock', type: 'uses' },
  ],
};

const round2 = (x: number) => Math.round(x * 100) / 100;

export const limiterClass: Program<LimiterInput> = {
  id: 'limiter-class',
  code,
  // Asha uses up her bucket; Ravi's first requests still pass, then Asha's refill lets one more through.
  defaultInput: { rate: 3, reqs: [[0, 'asha'], [0.1, 'asha'], [0.2, 'asha'], [0.25, 'asha'], [0.3, 'ravi'], [0.35, 'ravi'], [0.6, 'asha'], [0.65, 'asha']] },
  randomInput: (r) => {
    const rate = randomInt(r, 2, 4);
    const users = ['asha', 'ravi', 'meera'].slice(0, randomInt(r, 2, 3));
    const reqs: [number, string][] = [];
    let time = 0;
    for (let n = randomInt(r, 8, 10); n > 0; n--) {
      time = round2(time + (r() < 0.7 ? 0.05 : 0.4));
      reqs.push([time, users[randomInt(r, 0, users.length - 1)]!]);
    }
    return { rate, reqs };
  },
  describe: ({ rate, reqs }) => `rate = ${rate}/s each; ${reqs.map(([t, u]) => `${u} at ${t}`).join(', ')}`,
  reference: (input) => perUser(input),
  run({ rate, reqs }) {
    const t = new Tracer();
    const buckets = new Map<string, { left: number; last: number }>();
    const log: Value[][] = [];
    const decisions: boolean[] = [];
    const views = (user: string | null, withClasses = false): View[] => {
      const users = [...buckets.keys()];
      return [
        ...(withClasses ? [{ type: 'uml' as const, label: 'The classes', diagram: classes }] : []),
        { type: 'table', label: 'Buckets (tokens left)', columns: ['user', 'tokens'], rows: users.map((u) => [u, round2(buckets.get(u)!.left)]), ...(user ? { highlightRow: users.indexOf(user) } : {}) },
        { type: 'table', label: 'Requests', columns: ['time (s)', 'user', 'result'], rows: log, ...(log.length ? { highlightRow: log.length - 1 } : {}) },
      ];
    };
    let asked = 0;
    t.step(null, `Each user may make about ${rate} requests a second. The Limiter keeps one Bucket per user and reads the time from a clock it was given.`, { rate }, views(null, true));
    reqs.forEach(([time, user], i) => {
      const fresh = !buckets.has(user);
      const b = buckets.get(user) ?? { left: rate, last: time };
      buckets.set(user, b);
      b.left = Math.min(rate, b.left + (time - b.last) * rate);
      b.last = time;
      const tokens = round2(b.left);
      const ok = b.left >= 1 - 1e-9;
      if (ok) b.left -= 1;
      decisions.push(ok);
      // Worth asking: a new user while someone else is out of tokens, or any blocked request.
      const othersEmpty = [...buckets.entries()].some(([u, x]) => u !== user && x.left < 1);
      const ask =
        asked < 3 && ((fresh && othersEmpty) || !ok)
          ? (asked++,
            predict(
              `${user} sends a request at ${time} s${fresh ? ' (their first)' : ''}. Allowed?`,
              ok ? 'yes' : 'no',
              ok ? (fresh ? `${user} gets a new, full bucket: other users' requests don't touch it.` : `${user}'s bucket had ${tokens} tokens after refilling.`) : `${user}'s bucket had only ${tokens} tokens after refilling: less than one.`,
              [{ value: ok ? 'no' : 'yes', why: ok ? (fresh ? 'Each user has their own bucket, so someone else running out changes nothing for this user.' : 'There is at least one whole token to spend.') : `Refilling at ${rate} a second hasn't made a whole token yet.` }],
              i + 1,
            ))
          : undefined;
      log.push([time, user, ok ? 'allow' : 'block']);
      t.step(ok ? 15 : 13, `${time} s, ${user}: ${fresh ? 'a new bucket, ' : ''}${tokens} token${tokens === 1 ? '' : 's'} after refilling, so ${ok ? 'allowed' : 'blocked'}.`, { user, now: time, left: round2(b.left) }, views(user), ask);
    });
    t.step(null, `Each user was limited on their own. In a test, a fake clock can step through these times instantly, with no waiting.`, { result: decisions }, views(null, true));
    return t.frames;
  },
};

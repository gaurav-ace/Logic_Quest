import { arrivals } from '../requests';
import type { Model } from '../types';

// R7 "News feed": deliver each post to followers' feeds. Fan-out on write copies a post into
// every follower's feed when it's posted (cheap reads, costly writes); fan-out on read merges
// the accounts you follow when you open the app (cheap writes, costly reads). A celebrity with
// a million followers breaks fan-out on write; the hybrid pulls celebrity posts at read time.

const TICK_MS = 50;
/** Feed inserts the fan-out workers handle a second (illustrative). */
const INSERTS_PER_S = 40_000;
const CELEBRITY_FOLLOWERS = 1_000_000;
/** Illustrative costs: one feed lookup, and each extra timeline merged at read time. */
const LOOKUP_MS = 10;
const MERGE_MS = 1;

export interface FanoutState {
  now: number;
  /** Feed inserts waiting for the workers. */
  backlog: number;
  /** Timeline lookups a second, smoothed over the last second or so. */
  lookups: number;
  /** Recent read latencies (ms), for the slowest-5% number. */
  latencies: number[];
}

export const fanout: Model<FanoutState> = {
  id: 'fanout',
  tickMs: TICK_MS,
  controls: [
    { kind: 'slider', id: 'posts', label: 'Posts', min: 5, max: 50, step: 5, value: 20, unit: 'per s' },
    { kind: 'slider', id: 'followers', label: 'Followers per account', min: 100, max: 1000, step: 100, value: 300 },
    { kind: 'slider', id: 'following', label: 'Accounts each reader follows', min: 50, max: 500, step: 50, value: 200 },
    { kind: 'slider', id: 'readers', label: 'Feed reads', min: 50, max: 500, step: 50, value: 200, unit: 'per s' },
    { kind: 'toggle', id: 'write', label: 'Fan out on write (copy posts into feeds)', value: true },
    { kind: 'toggle', id: 'hybrid', label: 'Pull celebrity posts at read time (hybrid)', value: false },
    { kind: 'action', id: 'celebrity', label: `A celebrity posts (${CELEBRITY_FOLLOWERS.toLocaleString('en-IN')} followers)` },
  ],
  metrics: [
    { id: 'lag', label: 'Time for a new post to reach every feed', format: 'ms', better: 'low' },
    { id: 'readMs', label: 'Feed load time, slowest 5%', format: 'ms', better: 'low' },
    { id: 'lookups', label: 'Timeline lookups', format: 'per-second', better: 'low' },
    { id: 'backlog', label: 'Feed inserts waiting', format: 'count', better: 'low' },
  ],
  init() {
    return { now: 0, backlog: 0, lookups: 0, latencies: [] };
  },
  step(input, params, random) {
    const st: FanoutState = { ...input, latencies: [...input.latencies] };
    st.now += TICK_MS;
    if (params.write) {
      st.backlog += arrivals(Number(params.posts), TICK_MS, random) * Number(params.followers);
    } else {
      // Fan-out on read: writing a post is one insert into the author's own timeline.
      arrivals(Number(params.posts), TICK_MS, random);
    }
    st.backlog = Math.max(0, st.backlog - (INSERTS_PER_S * TICK_MS) / 1000);

    // Fan-out on write: the feed is ready, one lookup. On read: merge every followed timeline.
    // The hybrid adds a merge of the few celebrities a reader follows (2 here, illustrative).
    const merges = params.write ? (params.hybrid ? 2 : 0) : Number(params.following);
    const n = arrivals(Number(params.readers), TICK_MS, random);
    for (let k = 0; k < n; k++) st.latencies.push((LOOKUP_MS + MERGE_MS * merges) * (0.8 + random() * 0.4));
    const now = (n * (1 + merges) * 1000) / TICK_MS;
    st.lookups = st.lookups ? 0.9 * st.lookups + 0.1 * now : now;
    if (st.latencies.length > 400) st.latencies.splice(0, st.latencies.length - 400);
    return st;
  },
  act(st, action, params) {
    if (action !== 'celebrity') return st;
    // The hybrid doesn't copy celebrity posts at all; readers pull them when they load the feed.
    return params?.write && !params.hybrid ? { ...st, backlog: st.backlog + CELEBRITY_FOLLOWERS } : st;
  },
  read(st) {
    const sorted = [...st.latencies].sort((a, b) => a - b);
    return {
      lag: (st.backlog / INSERTS_PER_S) * 1000,
      readMs: sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(0.95 * sorted.length))]! : 0,
      lookups: st.lookups,
      backlog: Math.round(st.backlog),
    };
  },
  view(st, params) {
    const lag = st.backlog / INSERTS_PER_S;
    return {
      nodes: [
        { id: 'posters', label: 'Posters', x: 44, y: 44, width: 80 },
        { id: 'workers', label: 'Fan-out', x: 150, y: 44, width: 84, status: params.write ? (lag > 5 ? 'busy' : 'ok') : 'down', note: params.write ? `${Math.round(lag)} s behind` : 'off' },
        { id: 'feeds', label: 'Feeds', x: 260, y: 44, width: 76, note: params.write ? 'ready' : 'unused' },
        { id: 'readers', label: 'Readers', x: 44, y: 160, width: 80 },
        { id: 'timelines', label: 'Timelines', x: 254, y: 160, width: 92, status: params.write ? 'ok' : 'busy', note: params.write ? (params.hybrid ? 'celebs only' : 'unused') : `merge ${params.following}` },
      ],
      edges: [
        { from: 'posters', to: 'workers', active: !!params.write },
        { from: 'workers', to: 'feeds', active: !!params.write && st.backlog > 0 },
        { from: 'readers', to: params.write ? 'feeds' : 'timelines', active: true },
        ...(params.write && params.hybrid ? [{ from: 'readers', to: 'timelines', active: true }] : []),
      ],
    };
  },
};

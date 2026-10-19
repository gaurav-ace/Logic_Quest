import { arrivals } from '../requests';
import type { Model } from '../types';

// S4 "Caching" sim (cache-aside): reads check the cache first; a miss reads the database and
// stores a copy. Writes change the database. Shows hit rate, stale reads, and a stampede when a
// cold cache sends every request to the database at once.

const TICK_MS = 50;
const KEYS = 200;
const WINDOW_MS = 5000;
/** Illustrative timings. */
const CACHE_MS = 5;
const DB_MS = 150;
const DB_SLOTS = 4;
const DB_QUEUE = 40;
const TIMEOUT_MS = 1500;

/** Popularity: key k is about 1/(k+1) as likely as key 0 (a few hot keys, many cold ones). */
const CDF = (() => {
  const w = Array.from({ length: KEYS }, (_, k) => 1 / (k + 1));
  const total = w.reduce((a, b) => a + b, 0);
  let acc = 0;
  return w.map((x) => (acc += x / total));
})();

export function pickKey(random: () => number): number {
  const u = random();
  let lo = 0;
  let hi = KEYS - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (CDF[mid]! < u) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

interface Entry {
  version: number;
  expiresAt: number;
}

interface Fetch {
  key: number;
  /** Requests waiting for this database read (one, unless coalescing joined others). */
  waiters: number[];
  doneAt: number | null;
}

interface Event {
  at: number;
  kind: 'hit' | 'stale' | 'miss' | 'error';
  latency: number;
}

export interface CacheState {
  now: number;
  /** key -> entry; Map order is least recently used first. */
  cache: [number, Entry][];
  versions: number[];
  dbQueue: Fetch[];
  dbActive: Fetch[];
  dbReads: number[];
  events: Event[];
  totals: { reads: number; answered: number; errors: number };
}

const recentOnly = <T extends { at: number }>(xs: T[], now: number): T[] => xs.filter((e) => now - e.at <= WINDOW_MS);

export const caching: Model<CacheState> = {
  id: 'caching',
  tickMs: TICK_MS,
  controls: [
    { kind: 'slider', id: 'rate', label: 'Reads', min: 10, max: 120, step: 10, value: 40, unit: 'req/s' },
    { kind: 'slider', id: 'cacheSize', label: 'Cache size', min: 0, max: 100, step: 10, value: 50, unit: 'items' },
    { kind: 'slider', id: 'ttl', label: 'Expiry (TTL)', min: 1, max: 60, step: 1, value: 30, unit: 's' },
    { kind: 'slider', id: 'writes', label: 'Writes', min: 0, max: 10, step: 1, value: 0, unit: 'per s' },
    { kind: 'toggle', id: 'invalidate', label: 'Delete cached copy on write', value: false },
    { kind: 'toggle', id: 'coalesce', label: 'Coalesce misses (one DB read per key)', value: false },
    { kind: 'action', id: 'flush', label: 'Flush the cache (cold restart)' },
  ],
  metrics: [
    { id: 'hitRate', label: 'Cache hits', format: 'percent', better: 'high' },
    { id: 'staleRate', label: 'Stale reads', format: 'percent', better: 'low' },
    { id: 'dbLoad', label: 'Database reads', format: 'per-second', better: 'low' },
    { id: 'errorRate', label: 'Errors', format: 'percent', better: 'low' },
  ],
  init() {
    return { now: 0, cache: [], versions: Array.from({ length: KEYS }, () => 0), dbQueue: [], dbActive: [], dbReads: [], events: [], totals: { reads: 0, answered: 0, errors: 0 } };
  },
  step(input, params, random) {
    // Copy only what this tick changes (cache entries and recent events are never changed in place).
    const st: CacheState = {
      ...input,
      versions: [...input.versions],
      dbQueue: input.dbQueue.map((f) => ({ ...f, waiters: [...f.waiters] })),
      dbActive: input.dbActive.map((f) => ({ ...f, waiters: [...f.waiters] })),
      dbReads: [...input.dbReads],
      events: [...input.events],
      totals: { ...input.totals },
    };
    const start = st.now;
    st.now += TICK_MS;
    const cache = new Map(st.cache);
    const capacity = Number(params.cacheSize);
    const ttlMs = Number(params.ttl) * 1000;
    const answer = (arrivedAt: number, kind: Event['kind'], at = st.now) => {
      st.events.push({ at, kind, latency: at - arrivedAt });
      if (kind === 'error') st.totals.errors++;
      else st.totals.answered++;
    };

    // Writes change the database; with invalidation, the cached copy is deleted too.
    for (let k = arrivals(Number(params.writes), TICK_MS, random); k > 0; k--) {
      const key = pickKey(random);
      st.versions[key]!++;
      if (params.invalidate) cache.delete(key);
    }

    for (let k = arrivals(Number(params.rate), TICK_MS, random); k > 0; k--) {
      st.totals.reads++;
      const key = pickKey(random);
      const entry = cache.get(key);
      if (entry && entry.expiresAt > start) {
        cache.delete(key);
        cache.set(key, entry); // most recently used
        answer(start, entry.version < st.versions[key]! ? 'stale' : 'hit', start + CACHE_MS);
        continue;
      }
      if (entry) cache.delete(key); // expired
      const joining = params.coalesce ? [...st.dbActive, ...st.dbQueue].find((f) => f.key === key) : undefined;
      if (joining) joining.waiters.push(start);
      else if (st.dbQueue.length < DB_QUEUE) st.dbQueue.push({ key, waiters: [start], doneAt: null });
      else answer(start, 'error');
    }

    // The database finishes reads and starts queued ones.
    for (const f of st.dbActive.filter((f) => f.doneAt! <= st.now)) {
      if (capacity > 0) {
        cache.set(f.key, { version: st.versions[f.key]!, expiresAt: f.doneAt! + ttlMs });
        while (cache.size > capacity) cache.delete(cache.keys().next().value!);
      }
      for (const w of f.waiters) answer(w, 'miss', f.doneAt!);
    }
    st.dbActive = st.dbActive.filter((f) => f.doneAt! > st.now);
    // Callers give up on reads that waited too long in the database queue.
    for (const f of st.dbQueue.filter((f) => st.now - Math.min(...f.waiters) > TIMEOUT_MS)) for (const w of f.waiters) answer(w, 'error');
    st.dbQueue = st.dbQueue.filter((f) => st.now - Math.min(...f.waiters) <= TIMEOUT_MS);
    while (st.dbActive.length < DB_SLOTS && st.dbQueue.length) {
      const f = st.dbQueue.shift()!;
      f.doneAt = st.now + DB_MS;
      st.dbReads.push(st.now);
      st.dbActive.push(f);
    }

    st.cache = [...cache];
    st.events = recentOnly(st.events, st.now);
    st.dbReads = st.dbReads.filter((t) => st.now - t <= WINDOW_MS);
    return st;
  },
  act(st, action) {
    return action === 'flush' ? { ...st, cache: [] } : st;
  },
  read(st) {
    const ev = st.events;
    const reads = ev.length || 1;
    const span = Math.min(WINDOW_MS, st.now) / 1000 || 1;
    return {
      hitRate: ev.filter((e) => e.kind === 'hit' || e.kind === 'stale').length / reads,
      staleRate: ev.filter((e) => e.kind === 'stale').length / reads,
      dbLoad: st.dbReads.length / span,
      errorRate: ev.filter((e) => e.kind === 'error').length / reads,
    };
  },
  view(st, params) {
    const waiting = st.dbQueue.length;
    const dbLoad = (st.dbActive.length + waiting) / (DB_SLOTS + DB_QUEUE);
    const hot = st.events.filter((e) => e.kind !== 'error').slice(-20);
    const hits = hot.filter((e) => e.kind !== 'miss').length;
    return {
      nodes: [
        { id: 'app', label: 'App', x: 40, y: 100 },
        { id: 'cache', label: 'Cache', x: 160, y: 40, load: st.cache.length / Math.max(1, Number(params.cacheSize)), note: `${st.cache.length}/${params.cacheSize} items` },
        { id: 'db', label: 'Database', x: 240, y: 160, width: 96, status: dbLoad >= 0.5 ? 'busy' : 'ok', load: dbLoad, note: `${st.dbActive.length + waiting} reads in` },
      ],
      edges: [
        { from: 'app', to: 'cache', active: hits > 0 },
        { from: 'app', to: 'db', active: st.dbActive.length > 0 },
      ],
    };
  },
};

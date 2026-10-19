import { describe, expect, it } from 'vitest';
import { seeded } from '../../trace/tools';
import { averageFrom, runSim } from '../runner';
import { defaults, type Model, type Params } from '../types';
import { caching, pickKey, type CacheState } from './caching';
import { cdn } from './cdn';
import { scaling } from './scaling';

// What the Phase 5 traffic sims teach, checked on fixed seeds (the models are deterministic).

const avg = (m: Model<unknown>, p: Params, metric: string, actions: { at: number; action: string }[] = [], from = 8, seeds = [1, 2, 3, 4, 5]) =>
  seeds.reduce((a, seed) => a + averageFrom(runSim(m, { ...defaults(m.controls), ...p }, seed, 30_000, actions), metric, from), 0) / seeds.length;

const S = scaling as unknown as Model<unknown>;
const C = caching as unknown as Model<unknown>;
const D = cdn as unknown as Model<unknown>;

describe('scaling', () => {
  it('a bigger server serves more, until it can carry the traffic', () => {
    const errs = [1, 2, 3, 4].map((size) => avg(S, { rate: 50, servers: 1, size }, 'errorRate'));
    for (let i = 1; i < errs.length; i++) expect(errs[i]!).toBeLessThanOrEqual(errs[i - 1]! + 0.005);
    expect(errs[3]!).toBeLessThan(0.01);
  });

  it('one big server is a single point of failure; three smaller ones keep going when one dies', () => {
    const kill = [{ at: 3000, action: 'kill:s1' }];
    expect(avg(S, { rate: 50, servers: 1, size: 4 }, 'errorRate', kill, 10)).toBeGreaterThan(0.95);
    expect(avg(S, { rate: 50, servers: 3, size: 2 }, 'errorRate', kill, 10)).toBeLessThan(0.02);
  });

  it('cost is servers times size', () => {
    const s = runSim(S, { ...defaults(S.controls), servers: 3, size: 2 }, 1, 1000);
    expect(s.at(-1)!.values.cost).toBe(6);
  });
});

describe('caching', () => {
  it('popular keys really are popular: key 0 is drawn far more often than key 100', () => {
    const r = seeded(1);
    const counts = new Map<number, number>();
    for (let i = 0; i < 50_000; i++) {
      const k = pickKey(r);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    expect(counts.get(0)!).toBeGreaterThan(20 * (counts.get(100) ?? 1));
  });

  it('a bigger cache never lowers the hit rate in this workload', () => {
    const hits = [0, 10, 20, 50, 100].map((cacheSize) => avg(C, { rate: 40, cacheSize }, 'hitRate'));
    expect(hits[0]).toBe(0);
    for (let i = 1; i < hits.length; i++) expect(hits[i]!).toBeGreaterThanOrEqual(hits[i - 1]! - 0.01);
  });

  it('caching takes load off the database', () => {
    expect(avg(C, { rate: 60, cacheSize: 50 }, 'dbLoad')).toBeLessThan(avg(C, { rate: 60, cacheSize: 0 }, 'dbLoad'));
    expect(avg(C, { rate: 60, cacheSize: 0 }, 'errorRate')).toBeGreaterThan(0.3);
  });

  it('writes without invalidation leave stale copies; deleting on write removes them', () => {
    expect(avg(C, { writes: 5, ttl: 30 }, 'staleRate')).toBeGreaterThan(0.1);
    expect(avg(C, { writes: 5, ttl: 30, invalidate: true }, 'staleRate')).toBe(0);
    expect(avg(C, { writes: 0 }, 'staleRate')).toBe(0);
  });

  it('after a cold restart, coalescing misses prevents the error spike', () => {
    const peak = (coalesce: boolean) =>
      Math.max(...[1, 2, 3, 4, 5].map((seed) => Math.max(...runSim(C, { ...defaults(C.controls), rate: 100, cacheSize: 100, ttl: 60, coalesce }, seed, 16_000, [{ at: 8000, action: 'flush' }]).filter((x) => x.t > 8).map((x) => x.values.errorRate!))));
    expect(peak(false)).toBeGreaterThan(0.03);
    expect(peak(true)).toBe(0);
  });

  it('never loses a read: every read is answered, failed, or still waiting on the database', () => {
    const r = seeded(9);
    let st = caching.init({}, r);
    const p = { ...defaults(caching.controls), rate: 100, cacheSize: 20, coalesce: true };
    for (let t = 0; t < 400; t++) {
      if (t === 200) st = caching.act(st, 'flush', p);
      st = caching.step(st, p, r);
      const waiting = [...st.dbQueue, ...st.dbActive].reduce((a, f) => a + f.waiters.length, 0);
      expect((st as CacheState).totals.reads).toBe(st.totals.answered + st.totals.errors + waiting);
    }
  });
});

describe('CDN', () => {
  it('edges cut the wait for far users and the load on the origin', () => {
    const off = { rate: 60, cacheable: 90, cdn: false };
    const on = { ...off, cdn: true };
    expect(avg(D, on, 'farP50')).toBeLessThan(avg(D, off, 'farP50') / 5);
    expect(avg(D, on, 'originLoad')).toBeLessThan(avg(D, off, 'originLoad') / 5);
  });

  it('the origin only sees the share that cannot be cached', () => {
    const load = avg(D, { rate: 100, cacheable: 70, cdn: true }, 'originLoad');
    expect(load).toBeGreaterThan(22);
    expect(load).toBeLessThan(38); // about 30% of 100 req/s
  });

  it('far users wait longer than near users without a CDN (distance costs time)', () => {
    expect(avg(D, { cdn: false }, 'farP50')).toBeGreaterThan(avg(D, { cdn: false }, 'nearP50') + 200);
  });
});

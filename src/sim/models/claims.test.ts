import { describe, expect, it } from 'vitest';
import { seeded } from '../../trace/tools';
import { averageFrom, runSim } from '../runner';
import { defaults, type Model, type Params } from '../types';
import { caching, pickKey, type CacheState } from './caching';
import { cdn } from './cdn';
import { partition } from './partition';
import { payments } from './payments';
import { queues } from './queues';
import { replication } from './replication';
import { scaling } from './scaling';
import { sharding, shardOf } from './sharding';

// What the Phase 5 traffic sims teach, checked on fixed seeds (the models are deterministic).

const avg = (m: Model<unknown>, p: Params, metric: string, actions: { at: number; action: string }[] = [], from = 8, seeds = [1, 2, 3, 4, 5]) =>
  seeds.reduce((a, seed) => a + averageFrom(runSim(m, { ...defaults(m.controls), ...p }, seed, 30_000, actions), metric, from), 0) / seeds.length;

const S = scaling as unknown as Model<unknown>;
const C = caching as unknown as Model<unknown>;
const D = cdn as unknown as Model<unknown>;
const R = replication as unknown as Model<unknown>;
const H = sharding as unknown as Model<unknown>;
const Q = queues as unknown as Model<unknown>;
const P = partition as unknown as Model<unknown>;
const Y = payments as unknown as Model<unknown>;

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

describe('replication', () => {
  const kill = [{ at: 3000, action: 'kill-leader' }];

  it('reads from lagging followers can be stale; reads from the leader never are', () => {
    expect(avg(R, { followerReads: true }, 'staleRate')).toBeGreaterThan(0.1);
    expect(avg(R, { followerReads: false }, 'staleRate')).toBe(0);
  });

  it('without failover, writes fail once the leader dies; with it, they resume after detection', () => {
    expect(avg(R, { failover: false }, 'writeErrors', kill, 6)).toBeGreaterThan(0.95);
    expect(avg(R, { failover: true }, 'writeErrors', kill, 10)).toBeLessThan(0.01);
  });

  it('asynchronous copying can lose confirmed writes on failover; synchronous copying never does, but writes wait for the lag', () => {
    const lossy = { writes: 20, lag: 500, failover: true };
    const lost = (p: Params) => [1, 2, 3, 4, 5].map((seed) => runSim(R, { ...defaults(R.controls), ...p }, seed, 12_000, kill).at(-1)!.values.lost!);
    expect(lost({ ...lossy, sync: false }).every((n) => n > 0)).toBe(true);
    expect(lost({ ...lossy, sync: true }).every((n) => n === 0)).toBe(true);
    expect(avg(R, { ...lossy, sync: true }, 'writeP50')).toBeGreaterThan(avg(R, { ...lossy, sync: false }, 'writeP50') + 200);
  });

  it('the new leader is the follower with the most data', () => {
    let st = replication.init({}, seeded(1));
    const p = { ...defaults(replication.controls), writes: 20, lag: 500, failover: true };
    const r = seeded(2);
    for (let t = 0; t < 60; t++) st = replication.step(st, p, r);
    const best = Math.max(...st.replicas.filter((x) => x.id !== st.leader).map((x) => x.applied));
    st = replication.act(st, 'kill-leader', p);
    for (let t = 0; t < 30; t++) st = replication.step(st, p, r);
    expect(st.leader).not.toBeNull();
    expect(st.replicas.find((x) => x.id === st.leader)!.applied).toBeGreaterThanOrEqual(best);
  });
});

describe('sharding', () => {
  it('the hash spreads ordinary keys evenly', () => {
    for (const n of [2, 3, 4]) {
      const counts = new Array(n).fill(0);
      for (let k = 1; k < 1000; k++) counts[shardOf(k, n)]++;
      for (const c of counts) expect(Math.abs(c - 999 / n)).toBeLessThan(999 / n / 5);
    }
  });

  it('more shards carry more traffic', () => {
    const errs = [1, 2, 3, 4].map((shards) => avg(H, { rate: 120, shards }, 'errorRate'));
    for (let i = 1; i < errs.length; i++) expect(errs[i]!).toBeLessThan(errs[i - 1]!);
    expect(errs[3]!).toBeLessThan(0.01);
  });

  it('a hot key overloads its shard however many shards there are; spreading it fixes that', () => {
    const hot = { rate: 120, hotShare: 40 };
    expect(avg(H, { ...hot, shards: 4 }, 'errorRate')).toBeGreaterThan(0.1);
    expect(avg(H, { ...hot, shards: 4 }, 'busiest')).toBeGreaterThan(0.45);
    expect(avg(H, { ...hot, shards: 4, spreadHot: true }, 'errorRate')).toBeLessThan(0.01);
  });

  it('changing the shard count never loses a request silently', () => {
    const r = seeded(3);
    let st = sharding.init({ shards: 2 }, r);
    for (let t = 0; t < 200; t++) {
      st = sharding.step(st, { ...defaults(sharding.controls), rate: 100, shards: t < 100 ? 2 : 3 }, r);
      const f = st.flow;
      const held = f.servers.reduce((a, s) => a + s.active.length + s.queue.length, 0);
      expect(f.totals.arrived).toBe(f.totals.done + f.totals.errors + f.totals.handled + held);
    }
  });
});

describe('message queues', () => {
  it('a bigger queue absorbs a burst instead of rejecting, at the price of longer waits', () => {
    const burst = [{ at: 3000, action: 'burst' }];
    expect(avg(Q, { rate: 15, workers: 2, capacity: 200 }, 'rejectRate', burst, 3)).toBeLessThan(avg(Q, { rate: 15, workers: 2, capacity: 20 }, 'rejectRate', burst, 3));
    expect(avg(Q, { rate: 15, workers: 2, capacity: 200 }, 'waitP95', burst, 3)).toBeGreaterThan(avg(Q, { rate: 15, workers: 2, capacity: 20 }, 'waitP95', burst, 3));
  });

  it('too few workers for the traffic: the queue grows without end', () => {
    expect(avg(Q, { rate: 30, workers: 2, capacity: 300 }, 'queued', [], 20)).toBeGreaterThan(100);
    expect(avg(Q, { rate: 30, workers: 4, capacity: 300 }, 'queued', [], 20)).toBeLessThan(5);
  });

  it('poison messages: retrying forever clogs the workers; a dead-letter queue sets them aside', () => {
    const p = { rate: 15, workers: 3, capacity: 300, poison: 8, retries: true };
    expect(avg(Q, { ...p, dlq: false }, 'waitP95', [], 15)).toBeGreaterThan(2000);
    expect(avg(Q, { ...p, dlq: true }, 'waitP95', [], 15)).toBeLessThan(500);
  });

  it('without retries, failed messages are lost', () => {
    expect(avg(Q, { poison: 8, retries: false }, 'lostRate')).toBeGreaterThan(0.04);
  });
});

describe('CAP: during a partition, choose', () => {
  const cut = [{ at: 3000, action: 'cut' }];
  it('available mode keeps answering but the copies drift apart', () => {
    expect(avg(P, { consistent: false }, 'refusedRate', cut, 9)).toBe(0);
    expect(avg(P, { consistent: false }, 'diverged', cut, 9)).toBeGreaterThan(50);
  });

  it('consistent mode keeps the copies identical but refuses writes', () => {
    expect(avg(P, { consistent: true }, 'diverged', cut, 4)).toBe(0);
    expect(avg(P, { consistent: true }, 'refusedRate', cut, 9)).toBeGreaterThan(0.95);
  });

  it('no setting gets both during the partition; without one, both are fine', () => {
    for (const consistent of [true, false]) {
      const refused = avg(P, { consistent }, 'refusedRate', cut, 9);
      const diverged = avg(P, { consistent }, 'diverged', cut, 9);
      expect(refused > 0.5 || diverged > 0).toBe(true);
    }
    expect(avg(P, { consistent: true }, 'refusedRate')).toBe(0);
    expect(avg(P, { consistent: false }, 'diverged')).toBe(0);
  });

  it('healing brings the copies back together', () => {
    const s = runSim(P, defaults(P.controls), 1, 15_000, [{ at: 3000, action: 'cut' }, { at: 8000, action: 'heal' }]);
    expect(s.find((x) => x.t === 8.5)!.values.diverged).toBe(0);
  });
});

describe('idempotency', () => {
  it('without retries, lost replies become failed payments', () => {
    expect(avg(Y, { lost: 20, retry: false }, 'failRate')).toBeGreaterThan(0.15);
  });

  it('retries fix the failures but charge some payments twice, unless an idempotency key is sent', () => {
    const doubles = (p: Params) => [1, 2, 3].map((seed) => runSim(Y, { ...defaults(Y.controls), ...p }, seed, 15_000).at(-1)!.values.doubles!);
    expect(avg(Y, { lost: 20, retry: true }, 'failRate')).toBeLessThan(0.01);
    expect(doubles({ lost: 20, retry: true }).every((n) => n > 0)).toBe(true);
    expect(doubles({ lost: 20, retry: true, idempotency: true }).every((n) => n === 0)).toBe(true);
  });

  it('with no lost replies, nothing is retried or doubled', () => {
    const s = runSim(Y, { ...defaults(Y.controls), lost: 0, retry: true }, 1, 10_000);
    expect(s.at(-1)!.values.doubles).toBe(0);
    expect(averageFrom(s, 'failRate', 2)).toBe(0);
  });
});

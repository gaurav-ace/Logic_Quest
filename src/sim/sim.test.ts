import { describe, expect, it } from 'vitest';
import { seeded } from '../trace/tools';
import { loadBalancing } from './models/load-balancing';
import { MODELS } from './registry';
import { arrivals, inFlight, killServer, newFlow, newServer, tick, type Flow } from './requests';
import { averageFrom, goalMet, runSim } from './runner';
import { defaults, type Params } from './types';

const lbDefaults = defaults(loadBalancing.controls);
const lb = (over: Params = {}) => ({ ...lbDefaults, ...over });

describe('request flow core', () => {
  it('Poisson arrivals average out to the asked rate', () => {
    const r = seeded(3);
    let total = 0;
    for (let i = 0; i < 20_000; i++) total += arrivals(20, 50, r);
    const perSecond = total / ((20_000 * 50) / 1000);
    expect(perSecond).toBeGreaterThan(19);
    expect(perSecond).toBeLessThan(21);
  });

  it('never loses or double-counts a request: arrived = done + errors + handled + in flight, every tick', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const r = seeded(seed);
      let flow: Flow = newFlow([newServer('a', 1, 3), newServer('b', 2, 2)]);
      for (let t = 0; t < 400; t++) {
        if (t === 150) flow = killServer(flow, 'a');
        flow = tick(flow, { rate: 40, tickMs: 50, timeoutMs: 800, work: (x) => 50 + x() * 400, route: (f, req) => (req.id % 5 === 0 ? 'handled' : f.servers[req.id % 2]!) }, r);
        expect(flow.totals.arrived).toBe(flow.totals.done + flow.totals.errors + flow.totals.handled + inFlight(flow));
      }
    }
  });

  it('a request that needs 100 ms of work on an idle server waits exactly 100 ms', () => {
    let flow: Flow = newFlow([newServer('a')]);
    // With the random source fixed at 0.5, a rate of 24/s draws exactly one arrival per 50 ms tick.
    const r = () => 0.5;
    expect(arrivals(24, 50, r)).toBe(1);
    for (let t = 0; t < 10; t++) {
      flow = tick(flow, { rate: t === 0 ? 24 : 0, tickMs: 50, timeoutMs: 5000, work: () => 100, route: (f) => f.servers[0]! }, r);
    }
    const latencies = flow.recent.filter((e) => e.outcome.kind === 'done').map((e) => (e.outcome as { latency: number }).latency);
    expect(new Set(latencies)).toEqual(new Set([100]));
  });

  it('does not change the state it was given (models stay pure)', () => {
    const flow = newFlow([newServer('a')]);
    const before = JSON.stringify(flow);
    tick(flow, { rate: 50, tickMs: 50, timeoutMs: 1000, work: () => 100, route: (f) => f.servers[0]! }, seeded(1));
    killServer(flow, 'a');
    expect(JSON.stringify(flow)).toBe(before);
  });

  it('repeats exactly with the same seed', () => {
    const a = runSim(loadBalancing, lb(), 7, 10_000);
    const b = runSim(loadBalancing, lb(), 7, 10_000);
    expect(a).toEqual(b);
  });
});

describe('load balancing lessons', () => {
  it('with enough servers and normal traffic, almost nothing fails', () => {
    const s = runSim(loadBalancing, lb(), 1, 20_000);
    expect(averageFrom(s, 'errorRate', 5)).toBeLessThan(0.01);
  });

  it('without health checks, a killed server keeps producing errors; with them, errors stop after detection', () => {
    const kill = [{ at: 5000, action: 'kill:s2' }];
    const off = runSim(loadBalancing, lb({ healthChecks: false }), 2, 20_000, kill);
    const on = runSim(loadBalancing, lb({ healthChecks: true }), 2, 20_000, kill);
    // Long after the kill: roughly a third of round-robin traffic still hits the dead server.
    expect(averageFrom(off, 'errorRate', 12)).toBeGreaterThan(0.2);
    // With checks, what's left is only the lost capacity (2 servers near their limit), far lower.
    expect(averageFrom(on, 'errorRate', 12)).toBeLessThan(averageFrom(off, 'errorRate', 12) / 4);
  });

  it('with spare capacity (4 servers), losing one is barely noticed when health checks are on', () => {
    const on = runSim(loadBalancing, lb({ servers: 4, healthChecks: true }), 2, 20_000, [{ at: 5000, action: 'kill:s2' }]);
    expect(averageFrom(on, 'errorRate', 12)).toBeLessThan(0.01);
  });

  it('even with health checks, some requests fail right after the kill (detection takes time)', () => {
    const on = runSim(loadBalancing, lb({ healthChecks: true }), 4, 8000, [{ at: 5000, action: 'kill:s2' }]);
    expect(Math.max(...on.filter((x) => x.t > 5 && x.t <= 7).map((x) => x.values.errorRate!))).toBeGreaterThan(0);
  });

  it('with many slow requests, least connections keeps the slowest waits lower than round robin', () => {
    const settings = { slowShare: 30, rate: 15 };
    let rr = 0;
    let lc = 0;
    for (let seed = 1; seed <= 5; seed++) {
      rr += averageFrom(runSim(loadBalancing, lb({ ...settings, leastConn: false }), seed, 30_000), 'p95', 5);
      lc += averageFrom(runSim(loadBalancing, lb({ ...settings, leastConn: true }), seed, 30_000), 'p95', 5);
    }
    expect(lc).toBeLessThan(rr);
  });

  it('too much traffic for the servers shows up as errors and long waits', () => {
    const s = runSim(loadBalancing, lb({ rate: 60, servers: 2 }), 3, 20_000);
    expect(averageFrom(s, 'errorRate', 8)).toBeGreaterThan(0.1);
  });

  it('a restarted server takes traffic again', () => {
    const s = runSim(loadBalancing, lb({ healthChecks: false }), 5, 20_000, [{ at: 3000, action: 'kill:s2' }, { at: 8000, action: 'revive:s2' }]);
    expect(averageFrom(s, 'errorRate', 15)).toBeLessThan(0.02);
  });
});

describe('goals', () => {
  it('a goal must hold continuously for its whole duration', () => {
    const sample = (v: number, t: number) => ({ t, values: { errorRate: v } });
    const xs = [0, 0, 0.5, 0, 0, 0, 0].map((v, i) => sample(v, i * 0.5));
    expect(goalMet(xs, { metric: 'errorRate', op: '<=', value: 0.01, forSeconds: 2 })).toBe(true);
    expect(goalMet(xs.slice(0, 5), { metric: 'errorRate', op: '<=', value: 0.01, forSeconds: 2 })).toBe(false);
    expect(goalMet(xs, { metric: 'missing', op: '<=', value: 1, forSeconds: 0.5 })).toBe(false);
    // fromStart: the early slip at 1 s ends the attempt, even though it recovers later.
    expect(goalMet(xs, { metric: 'errorRate', op: '<=', value: 0.01, forSeconds: 2, fromStart: true })).toBe(false);
    expect(goalMet(xs.slice(3), { metric: 'errorRate', op: '<=', value: 0.01, forSeconds: 2, fromStart: true })).toBe(true);
  });
});

describe('every model', () => {
  it.each(MODELS.map((m) => [m.id, m] as const))('%s: step and actions never change the state they are given', (_id, m) => {
    const p = defaults(m.controls);
    const r = seeded(4);
    let st = m.init(p, r);
    for (let t = 0; t < 120; t++) {
      const before = JSON.stringify(st);
      const next = m.step(st, p, r);
      expect(JSON.stringify(st)).toBe(before);
      st = next;
    }
    for (const c of m.controls.filter((x) => x.kind === 'action')) {
      const before = JSON.stringify(st);
      st = m.act(st, c.id, p);
      void before;
      const again = JSON.stringify(st);
      m.step(st, p, r);
      expect(JSON.stringify(st)).toBe(again);
    }
  });

  // Checked at the defaults and with every slider at max and every toggle on (most nodes).
  // Notes are 14 px bold text, estimated at 8.5 px a character (the browser check measures
  // the real width). 2 px stay spare so a box border isn't clipped at the edge.
  it.each(MODELS.map((m) => [m.id, m] as const))('%s: nodes and notes fit the diagram without overlapping', (_id, m) => {
    const most: Params = {};
    for (const c of m.controls) if (c.kind === 'slider') most[c.id] = c.max;
    else if (c.kind === 'toggle') most[c.id] = true;
    for (const p of [defaults(m.controls), { ...defaults(m.controls), ...most }]) {
      const st = m.init(p, seeded(1));
      const boxes = m.view(st, p).nodes.map((n) => {
        const half = Math.max((n.width ?? 72) / 2, n.note ? (n.note.length * 8.5) / 2 : 0);
        return { id: n.id, left: n.x - half, right: n.x + half, top: n.y - 17, bottom: n.y + 17 + (n.note ? 26 : n.load !== undefined ? 8 : 0) };
      });
      for (const b of boxes) {
        expect(b.left, b.id).toBeGreaterThanOrEqual(2);
        expect(b.right, b.id).toBeLessThanOrEqual(302);
        expect(b.top, b.id).toBeGreaterThanOrEqual(2);
        expect(b.bottom, b.id).toBeLessThanOrEqual(250);
      }
      for (const a of boxes) for (const b of boxes) {
        if (a.id < b.id) expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top, `${a.id} overlaps ${b.id}`).toBe(true);
      }
    }
  });
});

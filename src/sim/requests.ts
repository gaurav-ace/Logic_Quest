// A shared request-flow core for the traffic sims: requests arrive, a router picks a server,
// each server works on a few at once and queues the rest, and requests finish, time out or are
// refused. All times are simulated milliseconds and every number is illustrative.

export interface Request {
  id: number;
  arrivedAt: number;
  /** Milliseconds of work at normal speed. */
  work: number;
  /** Work still to do. */
  left: number;
}

export interface Server {
  id: string;
  up: boolean;
  /** 1 is normal; 3 means everything takes three times as long (a "slow" failure). */
  slowness: number;
  /** Requests worked on at the same time. */
  slots: number;
  /** Waiting requests beyond this are refused. */
  queueLimit: number;
  active: Request[];
  queue: Request[];
}

/** `id` is the request's, so a model can attach its own details (e.g. which region it came from). */
export type Outcome = { kind: 'done'; id: number; latency: number; server: string } | { kind: 'error'; id: number; reason: 'refused' | 'down' | 'timeout'; server: string | null };

export interface Flow {
  now: number;
  nextId: number;
  servers: Server[];
  /** Outcomes in the recent window, newest last, for metrics. */
  recent: { at: number; outcome: Outcome }[];
  /** Running totals, for the bookkeeping tests. */
  /** handled: answered without reaching a server here (e.g. by a CDN edge). */
  totals: { arrived: number; done: number; errors: number; handled: number };
}

export const WINDOW_MS = 5000;

export function newServer(id: string, slots = 2, queueLimit = 8): Server {
  return { id, up: true, slowness: 1, slots, queueLimit, active: [], queue: [] };
}

export function newFlow(servers: Server[]): Flow {
  return { now: 0, nextId: 1, servers, recent: [], totals: { arrived: 0, done: 0, errors: 0, handled: 0 } };
}

/** Number of arrivals in one tick for an average rate (per second): a Poisson draw. */
export function arrivals(ratePerSecond: number, tickMs: number, random: () => number): number {
  const mean = (ratePerSecond * tickMs) / 1000;
  // Knuth's method; fine for the small means used here.
  const limit = Math.exp(-mean);
  let k = 0;
  let p = random();
  while (p > limit) {
    k++;
    p *= random();
  }
  return k;
}

export interface TickOptions {
  /** Average requests per second. */
  rate: number;
  /** Draws the work for one new request, in ms. */
  work: (random: () => number) => number;
  /** Picks a server for a request, null when none is usable, or 'handled' when answered elsewhere. */
  route: (flow: Flow, req: Request, random: () => number) => Server | null | 'handled';
  /** Give up on a request that has waited longer than this (ms). */
  timeoutMs: number;
  tickMs: number;
}

const record = (flow: Flow, outcome: Outcome): void => {
  flow.recent.push({ at: flow.now, outcome });
  if (outcome.kind === 'done') flow.totals.done++;
  else flow.totals.errors++;
};

/**
 * A copy that can be changed without touching `input`. Only what a tick changes is copied:
 * active requests (their work left goes down), the lists, and the totals. Recent outcomes and
 * queued requests are never changed in place, so they are shared. Cheap enough for a phone.
 */
export function copyFlow(input: Flow): Flow {
  return {
    ...input,
    servers: input.servers.map((s) => ({ ...s, active: s.active.map((r) => ({ ...r })), queue: [...s.queue] })),
    recent: [...input.recent],
    totals: { ...input.totals },
  };
}

/** One tick: new arrivals are routed, servers do work, finished and timed-out requests leave. */
export function tick(input: Flow, opts: TickOptions, random: () => number): Flow {
  // Copy, so models stay pure: the old state is never changed.
  const flow: Flow = copyFlow(input);
  // Requests arrive during this tick: stamp them with its start, so a 100 ms job waits 100 ms.
  const tickStart = flow.now;
  flow.now += opts.tickMs;

  const n = arrivals(opts.rate, opts.tickMs, random);
  for (let k = 0; k < n; k++) {
    const work = opts.work(random);
    const req: Request = { id: flow.nextId++, arrivedAt: tickStart, work, left: work };
    flow.totals.arrived++;
    const server = opts.route(flow, req, random);
    if (server === 'handled') {
      flow.totals.handled++;
    } else if (!server) {
      record(flow, { kind: 'error', id: req.id, reason: 'refused', server: null });
    } else if (!server.up) {
      // Sent to a dead server (no health check): the connection fails.
      record(flow, { kind: 'error', id: req.id, reason: 'down', server: server.id });
    } else if (server.active.length < server.slots) {
      server.active.push(req);
    } else if (server.queue.length < server.queueLimit) {
      server.queue.push(req);
    } else {
      record(flow, { kind: 'error', id: req.id, reason: 'refused', server: server.id });
    }
  }

  for (const s of flow.servers) {
    if (!s.up) continue;
    for (const r of s.active) r.left -= opts.tickMs / s.slowness;
    for (const r of s.active.filter((r) => r.left <= 0)) record(flow, { kind: 'done', id: r.id, latency: flow.now - r.arrivedAt, server: s.id });
    s.active = s.active.filter((r) => r.left > 0);
    // Requests waiting too long give up (the user gave up, or the caller's timeout fired).
    for (const r of [...s.active, ...s.queue].filter((x) => flow.now - x.arrivedAt > opts.timeoutMs)) record(flow, { kind: 'error', id: r.id, reason: 'timeout', server: s.id });
    s.active = s.active.filter((r) => flow.now - r.arrivedAt <= opts.timeoutMs);
    s.queue = s.queue.filter((r) => flow.now - r.arrivedAt <= opts.timeoutMs);
    // A queued request starts work: copy it, because work in progress is changed in place.
    while (s.active.length < s.slots && s.queue.length) s.active.push({ ...s.queue.shift()! });
  }

  flow.recent = flow.recent.filter((e) => flow.now - e.at <= WINDOW_MS);
  return flow;
}

/** Requests a dead server was holding are lost: the callers see errors. */
export function killServer(input: Flow, id: string): Flow {
  const flow: Flow = copyFlow(input);
  const s = flow.servers.find((x) => x.id === id);
  if (!s || !s.up) return flow;
  for (const r of [...s.active, ...s.queue]) record(flow, { kind: 'error', id: r.id, reason: 'down', server: id });
  s.active = [];
  s.queue = [];
  s.up = false;
  return flow;
}

export function reviveServer(input: Flow, id: string): Flow {
  const flow: Flow = copyFlow(input);
  const s = flow.servers.find((x) => x.id === id);
  if (s) s.up = true;
  return flow;
}

export const inFlight = (flow: Flow) => flow.servers.reduce((a, s) => a + s.active.length + s.queue.length, 0);

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
}

/** Standard traffic metrics over the recent window. */
export function trafficMetrics(flow: Flow): Record<string, number> {
  const span = Math.min(WINDOW_MS, flow.now) / 1000 || 1;
  const done = flow.recent.filter((e) => e.outcome.kind === 'done');
  const latencies = done.map((e) => (e.outcome as { latency: number }).latency).sort((a, b) => a - b);
  const total = flow.recent.length;
  return {
    served: done.length / span,
    errorRate: total ? (total - done.length) / total : 0,
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
  };
}

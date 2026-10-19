import { newFlow, newServer, tick, WINDOW_MS, type Flow } from '../requests';
import type { Model } from '../types';

// S5 "CDNs": copies of files kept close to users. Requests the nearby edge can answer skip the
// long trip to the origin, which also takes load off the origin. Distances are illustrative.

const TICK_MS = 50;
const REGIONS = ['near', 'mid', 'far'] as const;
type Region = (typeof REGIONS)[number];
/** Illustrative round-trip times to the origin, and to a nearby edge. */
const RTT: Record<Region, number> = { near: 20, mid: 80, far: 200 };
const EDGE_RTT = 10;
const EDGE_MS = 5;

interface Done {
  at: number;
  region: Region;
  latency: number;
  ok: boolean;
  fromEdge: boolean;
}

export interface CdnState {
  flow: Flow;
  /** Origin requests in progress: request id -> region. */
  pendingRegion: Record<number, Region>;
  done: Done[];
  originHits: number[];
}

export const cdn: Model<CdnState> = {
  id: 'cdn',
  tickMs: TICK_MS,
  controls: [
    { kind: 'slider', id: 'rate', label: 'Traffic', min: 20, max: 200, step: 10, value: 60, unit: 'req/s' },
    { kind: 'slider', id: 'cacheable', label: 'Cacheable (static files)', min: 0, max: 100, step: 10, value: 70, unit: '%' },
    { kind: 'toggle', id: 'cdn', label: 'CDN edges', value: false },
  ],
  metrics: [
    { id: 'farP50', label: 'Far users: typical', format: 'ms', better: 'low' },
    { id: 'nearP50', label: 'Near users: typical', format: 'ms', better: 'low' },
    { id: 'originLoad', label: 'Origin load', format: 'per-second', better: 'low' },
    { id: 'errorRate', label: 'Errors', format: 'percent', better: 'low' },
  ],
  init() {
    return { flow: newFlow([newServer('origin', 4, 40)]), pendingRegion: {}, done: [], originHits: [] };
  },
  step(input, params, random) {
    const st: CdnState = { ...input, pendingRegion: { ...input.pendingRegion }, done: [...input.done], originHits: [...input.originHits] };
    const now = st.flow.now + TICK_MS;
    const edgeServed: Done[] = [];
    // Each arrival picks a region; cacheable requests are answered by its edge when the CDN is on.
    const regionOf = new Map<number, Region>();
    st.flow = tick(
      st.flow,
      {
        rate: Number(params.rate),
        tickMs: TICK_MS,
        timeoutMs: 2000,
        work: () => 40,
        route: (f, req) => {
          const region = REGIONS[Math.floor(random() * REGIONS.length)]!;
          if (params.cdn && random() * 100 < Number(params.cacheable)) {
            edgeServed.push({ at: now, region, latency: 2 * EDGE_RTT + EDGE_MS, ok: true, fromEdge: true });
            return 'handled'; // answered at the edge: it never reaches the origin
          }
          regionOf.set(req.id, region);
          st.originHits.push(now);
          return f.servers[0]!;
        },
      },
      random,
    );
    for (const [id, region] of regionOf) st.pendingRegion[id] = region;
    // Origin outcomes this tick, with the network round trip added.
    for (const e of st.flow.recent.filter((x) => x.at === st.flow.now)) {
      const region = st.pendingRegion[e.outcome.id];
      if (!region) continue;
      delete st.pendingRegion[e.outcome.id];
      if (e.outcome.kind === 'done') st.done.push({ at: now, region, latency: e.outcome.latency + 2 * RTT[region], ok: true, fromEdge: false });
      else st.done.push({ at: now, region, latency: 0, ok: false, fromEdge: false });
    }
    st.done.push(...edgeServed);
    st.done = st.done.filter((d) => now - d.at <= WINDOW_MS);
    st.originHits = st.originHits.filter((t) => now - t <= WINDOW_MS);
    return st;
  },
  act: (st) => st,
  read(st) {
    const span = Math.min(WINDOW_MS, st.flow.now) / 1000 || 1;
    const p50 = (region: Region) => {
      const xs = st.done.filter((d) => d.ok && d.region === region).map((d) => d.latency).sort((a, b) => a - b);
      return xs.length ? xs[Math.floor(xs.length / 2)]! : 0;
    };
    return {
      farP50: p50('far'),
      nearP50: p50('near'),
      originLoad: st.originHits.length / span,
      errorRate: st.done.length ? st.done.filter((d) => !d.ok).length / st.done.length : 0,
    };
  },
  view(st, params) {
    const origin = st.flow.servers[0]!;
    const held = origin.active.length + origin.queue.length;
    const load = held / (origin.slots + origin.queueLimit);
    const on = Boolean(params.cdn);
    const recent = st.done.filter((d) => st.flow.now - d.at <= 500);
    const used = (region: Region, edge: boolean) => recent.some((d) => d.region === region && d.fromEdge === edge);
    return {
      nodes: [
        { id: 'near', label: 'Near', x: 40, y: 30, note: 'users' },
        { id: 'mid', label: 'Mid', x: 40, y: 100, note: 'users' },
        { id: 'far', label: 'Far', x: 40, y: 170, note: 'users' },
        ...(on ? REGIONS.map((r, i) => ({ id: `edge-${r}`, label: 'Edge', x: 150, y: 30 + i * 70, note: 'copy' })) : []),
        { id: 'origin', label: 'Origin', x: 262, y: 100, status: load >= 0.5 ? ('busy' as const) : ('ok' as const), load, note: `${held} in` },
      ],
      edges: [
        ...REGIONS.map((r) => ({ from: r, to: 'origin', active: used(r, false) })),
        ...(on ? REGIONS.map((r) => ({ from: r, to: `edge-${r}`, active: used(r, true) })) : []),
      ],
    };
  },
};

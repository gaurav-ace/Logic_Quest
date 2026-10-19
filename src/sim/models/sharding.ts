import { copyFlow, killServer, newFlow, newServer, tick, trafficMetrics, type Flow } from '../requests';
import { columnYs, type Model, type SimNode } from '../types';

// S9 "Sharding": data is split across shards by a hash of the key, so each shard holds and
// serves a slice. One very popular key (a "hot key") still lands on a single shard, and adding
// shards doesn't help that one; spreading the hot key's reads does.

const TICK_MS = 50;
const KEYS = 1000;

/** A fixed, simple hash: good enough to spread ordinary keys evenly. */
export const shardOf = (key: number, shards: number) => ((key * 2654435761) >>> 0) % shards;

interface State {
  flow: Flow;
  shards: number;
  routedTo: string[];
}

function build(n: number): Flow {
  return newFlow(Array.from({ length: n }, (_, i) => newServer(`sh${i + 1}`, 2, 10)));
}

export const sharding: Model<State> = {
  id: 'sharding',
  tickMs: TICK_MS,
  controls: [
    { kind: 'slider', id: 'rate', label: 'Traffic', min: 20, max: 160, step: 10, value: 60, unit: 'req/s' },
    { kind: 'slider', id: 'shards', label: 'Shards', min: 1, max: 4, step: 1, value: 2 },
    { kind: 'slider', id: 'hotShare', label: 'Share for one hot key', min: 0, max: 60, step: 5, value: 0, unit: '%' },
    { kind: 'toggle', id: 'spreadHot', label: 'Spread the hot key across shards', value: false },
  ],
  metrics: [
    { id: 'served', label: 'Served', format: 'per-second', better: 'high' },
    { id: 'errorRate', label: 'Errors', format: 'percent', better: 'low' },
    { id: 'p95', label: 'Slowest 5%', format: 'ms', better: 'low' },
    { id: 'busiest', label: 'Busiest shard share', format: 'percent', better: 'low' },
  ],
  init(params) {
    const n = Number(params.shards);
    return { flow: build(n), shards: n, routedTo: [] };
  },
  step(input, params, random) {
    const n = Number(params.shards);
    // Re-sharding moves data; here it starts fresh shards, and requests in flight fail (honestly
    // counted as errors) rather than vanishing.
    let st = input;
    if (input.shards !== n) {
      let f = input.flow;
      for (const s of f.servers) f = killServer(f, s.id);
      f = copyFlow(f);
      f.servers = build(n).servers;
      st = { ...input, flow: f, shards: n };
    }
    const routedTo: string[] = [];
    const flow = tick(
      st.flow,
      {
        rate: Number(params.rate),
        tickMs: TICK_MS,
        timeoutMs: 2000,
        work: () => 40,
        route: (f) => {
          const hot = random() * 100 < Number(params.hotShare);
          // The hot key's shard is fixed; spreading it (e.g. read copies on every shard) picks any.
          const shard = hot ? (params.spreadHot ? Math.floor(random() * n) : shardOf(0, n)) : shardOf(1 + Math.floor(random() * (KEYS - 1)), n);
          const s = f.servers[shard]!;
          routedTo.push(s.id);
          return s;
        },
      },
      random,
    );
    return { ...st, flow, routedTo: [...input.routedTo.slice(-400), ...routedTo] };
  },
  act: (st) => st,
  read(st) {
    const counts = new Map<string, number>();
    for (const id of st.routedTo) counts.set(id, (counts.get(id) ?? 0) + 1);
    const busiest = st.routedTo.length ? Math.max(...counts.values()) / st.routedTo.length : 0;
    return { ...trafficMetrics(st.flow), busiest };
  },
  view(st) {
    const servers = st.flow.servers;
    const ys = columnYs(servers.length);
    const counts = new Map<string, number>();
    for (const id of st.routedTo) counts.set(id, (counts.get(id) ?? 0) + 1);
    const total = st.routedTo.length || 1;
    const nodes: SimNode[] = [
      { id: 'app', label: 'App', x: 40, y: 100 },
      { id: 'router', label: 'Router', x: 148, y: 100, note: 'hash(key)' },
      ...servers.map((s, i): SimNode => {
        const held = s.active.length + s.queue.length;
        const load = held / (s.slots + s.queueLimit);
        return { id: s.id, label: `Shard ${i + 1}`, x: 262, y: ys[i]!, status: load >= 0.6 ? 'busy' : 'ok', load, note: `${Math.round(((counts.get(s.id) ?? 0) / total) * 100)}%` };
      }),
    ];
    return {
      nodes,
      edges: [{ from: 'app', to: 'router', active: true }, ...servers.map((s) => ({ from: 'router', to: s.id, active: st.routedTo.slice(-20).includes(s.id) }))],
    };
  },
};

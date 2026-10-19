import { copyFlow, killServer, newFlow, newServer, reviveServer, tick, trafficMetrics, type Flow, type Server } from '../requests';
import type { Model, SimNode } from '../types';

// S3 "Load balancing" sim: round robin versus least connections, with requests of uneven cost,
// and a server that can be killed. With health checks on, the balancer notices a dead server
// after a short delay (like NGINX's passive checks, which mark a server failed after errors).

interface State {
  flow: Flow;
  turn: number;
  /** When each server was killed, for the detection delay. */
  killedAt: Record<string, number>;
  routedTo: string[];
}

const TICK_MS = 50;
const DETECT_MS = 1000;
const NORMAL_MS = 100;
const SLOW_MS = 1000;

const usable = (st: State, s: Server, healthChecks: boolean, now: number) => s.up || !healthChecks || now - (st.killedAt[s.id] ?? Infinity) < DETECT_MS;

export const loadBalancing: Model<State> = {
  id: 'load-balancing',
  tickMs: TICK_MS,
  controls: [
    { kind: 'slider', id: 'rate', label: 'Traffic', min: 5, max: 60, step: 5, value: 20, unit: 'req/s' },
    { kind: 'slider', id: 'slowShare', label: 'Slow requests', min: 0, max: 40, step: 5, value: 10, unit: '%' },
    { kind: 'slider', id: 'servers', label: 'Servers', min: 2, max: 4, step: 1, value: 3 },
    { kind: 'toggle', id: 'leastConn', label: 'Least connections', value: false },
    { kind: 'toggle', id: 'healthChecks', label: 'Health checks', value: true },
    { kind: 'action', id: 'kill:s2', label: 'Kill server 2' },
    { kind: 'action', id: 'revive:s2', label: 'Restart server 2' },
  ],
  metrics: [
    { id: 'served', label: 'Served', format: 'per-second', better: 'high' },
    { id: 'errorRate', label: 'Errors', format: 'percent', better: 'low' },
    { id: 'p50', label: 'Typical wait', format: 'ms', better: 'low' },
    { id: 'p95', label: 'Slowest 5%', format: 'ms', better: 'low' },
  ],
  init(params) {
    const n = Number(params.servers);
    return { flow: newFlow(Array.from({ length: n }, (_, i) => newServer(`s${i + 1}`))), turn: 0, killedAt: {}, routedTo: [] };
  },
  step(st, params, random) {
    const healthChecks = Boolean(params.healthChecks);
    const leastConn = Boolean(params.leastConn);
    const routedTo: string[] = [];
    let turn = st.turn;
    const flow = tick(
      syncServers(st.flow, Number(params.servers)),
      {
        rate: Number(params.rate),
        tickMs: TICK_MS,
        timeoutMs: 3000,
        work: (r) => (r() * 100 < Number(params.slowShare) ? SLOW_MS : NORMAL_MS),
        route: (f) => {
          const pool = f.servers.filter((s) => usable(st, s, healthChecks, f.now));
          if (!pool.length) return null;
          let pick: Server;
          if (leastConn) {
            pick = pool.reduce((best, s) => (s.active.length + s.queue.length < best.active.length + best.queue.length ? s : best));
          } else {
            pick = pool[turn % pool.length]!;
            turn++;
          }
          routedTo.push(pick.id);
          return pick;
        },
      },
      random,
    );
    return { ...st, flow, turn, routedTo };
  },
  act(st, action) {
    const [verb, id] = action.split(':');
    if (verb === 'kill') return { ...st, flow: killServer(st.flow, id!), killedAt: { ...st.killedAt, [id!]: st.flow.now } };
    if (verb === 'revive') {
      const { [id!]: _gone, ...killedAt } = st.killedAt;
      void _gone;
      return { ...st, flow: reviveServer(st.flow, id!), killedAt };
    }
    return st;
  },
  read: (st) => trafficMetrics(st.flow),
  view(st, params) {
    const servers = st.flow.servers;
    const ys = servers.length === 2 ? [60, 140] : servers.length === 3 ? [30, 100, 170] : [22, 72, 122, 172];
    const nodes: SimNode[] = [
      { id: 'users', label: 'Users', x: 40, y: 100 },
      { id: 'lb', label: 'Balancer', x: 148, y: 100, width: 88, note: params.leastConn ? 'least conn.' : 'round robin' },
      ...servers.map((s, i): SimNode => {
        const held = s.active.length + s.queue.length;
        const load = held / (s.slots + s.queueLimit);
        return { id: s.id, label: `Server ${i + 1}`, x: 264, y: ys[i]!, status: s.up ? (load >= 0.6 ? 'busy' : 'ok') : 'down', load, note: s.up ? `${held} in` : 'down' };
      }),
    ];
    return {
      nodes,
      edges: [
        { from: 'users', to: 'lb', active: st.routedTo.length > 0 },
        ...servers.map((s) => ({ from: 'lb', to: s.id, active: st.routedTo.includes(s.id), broken: !s.up })),
      ],
    };
  },
};

/** The servers slider can change mid-run: add fresh servers, or drop (and fail) the extra ones. */
function syncServers(flow: Flow, n: number): Flow {
  if (flow.servers.length === n) return flow;
  let f = flow;
  if (n > f.servers.length) {
    f = copyFlow(f);
    for (let i = f.servers.length; i < n; i++) f.servers.push(newServer(`s${i + 1}`));
    return f;
  }
  for (const s of f.servers.slice(n)) f = killServer(f, s.id);
  f = copyFlow(f);
  f.servers = f.servers.slice(0, n);
  return f;
}


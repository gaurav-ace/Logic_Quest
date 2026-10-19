import { copyFlow, killServer, newFlow, newServer, tick, trafficMetrics, type Flow, type Server } from '../requests';
import { columnYs, type Model, type SimNode } from '../types';

// S2 "Scaling up versus out": one bigger server, or more servers behind a balancer. A bigger
// server handles more at once but is still one machine; more servers keep going when one dies.

interface State {
  flow: Flow;
  killedAt: Record<string, number>;
  /** Shape the fleet was built for, so changes mid-run rebuild it. */
  shape: string;
  routedTo: string[];
}

const TICK_MS = 50;
const DETECT_MS = 1000;
/** Each unit of size adds two request slots. */
const SLOTS_PER_SIZE = 2;

function build(servers: number, size: number): Flow {
  return newFlow(Array.from({ length: servers }, (_, i) => newServer(`s${i + 1}`, SLOTS_PER_SIZE * size, 6 * size)));
}

/** A changed fleet keeps the servers that still exist (with their work), resized. */
function reshape(st: State, servers: number, size: number): State {
  const shape = `${servers}x${size}`;
  if (st.shape === shape) return st;
  let flow = st.flow;
  for (const s of flow.servers.slice(servers)) flow = killServer(flow, s.id);
  flow = copyFlow(flow);
  flow.servers = flow.servers.slice(0, servers).map((s) => ({ ...s, slots: SLOTS_PER_SIZE * size, queueLimit: 6 * size }));
  for (let i = flow.servers.length; i < servers; i++) flow.servers.push(newServer(`s${i + 1}`, SLOTS_PER_SIZE * size, 6 * size));
  return { ...st, flow, shape };
}

export const scaling: Model<State> = {
  id: 'scaling',
  tickMs: TICK_MS,
  controls: [
    { kind: 'slider', id: 'rate', label: 'Traffic', min: 10, max: 80, step: 5, value: 30, unit: 'req/s' },
    { kind: 'slider', id: 'servers', label: 'Servers (scale out)', min: 1, max: 4, step: 1, value: 1 },
    { kind: 'slider', id: 'size', label: 'Server size (scale up)', min: 1, max: 4, step: 1, value: 2, unit: '×' },
    { kind: 'action', id: 'kill:s1', label: 'Kill server 1' },
  ],
  metrics: [
    { id: 'served', label: 'Served', format: 'per-second', better: 'high' },
    { id: 'errorRate', label: 'Errors', format: 'percent', better: 'low' },
    { id: 'p95', label: 'Slowest 5%', format: 'ms', better: 'low' },
    { id: 'cost', label: 'Cost (size units)', format: 'count', better: 'low' },
  ],
  init(params) {
    const servers = Number(params.servers);
    const size = Number(params.size);
    return { flow: build(servers, size), killedAt: {}, shape: `${servers}x${size}`, routedTo: [] };
  },
  step(input, params, random) {
    const st = reshape(input, Number(params.servers), Number(params.size));
    const routedTo: string[] = [];
    const usable = (s: Server, now: number) => s.up || now - (st.killedAt[s.id] ?? Infinity) < DETECT_MS;
    const flow = tick(
      st.flow,
      {
        rate: Number(params.rate),
        tickMs: TICK_MS,
        timeoutMs: 2000,
        work: (r) => 80 + r() * 40,
        // Least connections across the fleet (with one server, there is nothing to choose).
        route: (f) => {
          const pool = f.servers.filter((s) => usable(s, f.now));
          if (!pool.length) return null;
          const pick = pool.reduce((best, s) => ((s.active.length + s.queue.length) / s.slots < (best.active.length + best.queue.length) / best.slots ? s : best));
          routedTo.push(pick.id);
          return pick;
        },
      },
      random,
    );
    return { ...st, flow, routedTo };
  },
  act(st, action) {
    const [verb, id] = action.split(':');
    if (verb !== 'kill') return st;
    return { ...st, flow: killServer(st.flow, id!), killedAt: { ...st.killedAt, [id!]: st.flow.now } };
  },
  read: (st) => ({ ...trafficMetrics(st.flow), cost: st.flow.servers.length * st.flow.servers[0]!.slots / SLOTS_PER_SIZE }),
  view(st) {
    const servers = st.flow.servers;
    const ys = columnYs(servers.length);
    const nodes: SimNode[] = [
      { id: 'users', label: 'Users', x: 40, y: 100 },
      { id: 'lb', label: 'Balancer', x: 148, y: 100, width: 88 },
      ...servers.map((s, i): SimNode => {
        const held = s.active.length + s.queue.length;
        const load = held / (s.slots + s.queueLimit);
        return { id: s.id, label: `S${i + 1} (${s.slots / SLOTS_PER_SIZE}×)`, x: 264, y: ys[i]!, status: s.up ? (load >= 0.6 ? 'busy' : 'ok') : 'down', load, note: s.up ? `${held} in` : 'down' };
      }),
    ];
    return {
      nodes,
      edges: [{ from: 'users', to: 'lb', active: st.routedTo.length > 0 }, ...servers.map((s) => ({ from: 'lb', to: s.id, active: st.routedTo.includes(s.id), broken: !s.up }))],
    };
  },
};

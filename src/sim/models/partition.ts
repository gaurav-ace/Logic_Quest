import { arrivals } from '../requests';
import type { Model } from '../types';

// S13 "CAP and consistency": two replicas of one account balance, one in each data centre,
// each serving local users. Cut the link between them (a network partition) and choose:
// keep answering (available, but the two copies drift apart) or refuse writes you can't
// confirm with the other side (consistent, but some requests fail). You can't have both.

const TICK_MS = 50;
const WINDOW_MS = 5000;

interface Ev {
  at: number;
  kind: 'ok' | 'refused';
}

export interface PartitionState {
  now: number;
  /** Writes each side has applied (by id), to measure how far apart they are. */
  sides: [number[], number[]];
  nextId: number;
  partitioned: boolean;
  events: Ev[];
  /** Writes accepted on one side that the other side doesn't have. */
  diverged: number;
}

export const partition: Model<PartitionState> = {
  id: 'partition',
  tickMs: TICK_MS,
  controls: [
    { kind: 'slider', id: 'rate', label: 'Writes (each side)', min: 2, max: 30, step: 2, value: 10, unit: 'per s' },
    { kind: 'toggle', id: 'consistent', label: 'Consistent mode (refuse writes the other side can’t confirm)', value: false },
    { kind: 'action', id: 'cut', label: 'Cut the network between the two sides' },
    { kind: 'action', id: 'heal', label: 'Heal the network' },
  ],
  metrics: [
    { id: 'refusedRate', label: 'Refused requests', format: 'percent', better: 'low' },
    { id: 'diverged', label: 'Writes only one side has', format: 'count', better: 'low' },
    { id: 'served', label: 'Writes accepted', format: 'per-second', better: 'high' },
  ],
  init() {
    return { now: 0, sides: [[], []], nextId: 1, partitioned: false, events: [], diverged: 0 };
  },
  step(input, params, random) {
    const st: PartitionState = { ...input, sides: [[...input.sides[0]], [...input.sides[1]]], events: [...input.events] };
    st.now += TICK_MS;
    for (const side of [0, 1] as const) {
      for (let k = arrivals(Number(params.rate), TICK_MS, random); k > 0; k--) {
        if (st.partitioned && params.consistent) {
          // Can't confirm with the other side: refuse rather than risk two different answers.
          st.events.push({ at: st.now, kind: 'refused' });
          continue;
        }
        const id = st.nextId++;
        st.sides[side].push(id);
        if (!st.partitioned) st.sides[1 - side]!.push(id); // copied to the other side straight away
        st.events.push({ at: st.now, kind: 'ok' });
      }
    }
    const a = new Set(st.sides[0]);
    const b = new Set(st.sides[1]);
    st.diverged = st.sides[0].filter((x) => !b.has(x)).length + st.sides[1].filter((x) => !a.has(x)).length;
    st.events = st.events.filter((e) => st.now - e.at <= WINDOW_MS);
    // Keep memory bounded: once both sides agree, old history isn't needed.
    if (st.diverged === 0 && st.sides[0].length > 500) st.sides = [[], []];
    return st;
  },
  act(st, action) {
    if (action === 'cut') return { ...st, partitioned: true };
    if (action !== 'heal') return st;
    // Healing: each side receives what it missed. With plain merging both keep their writes,
    // which for a balance can mean spending money twice; that conflict is the cost of availability.
    const all = [...new Set([...st.sides[0], ...st.sides[1]])];
    return { ...st, partitioned: false, sides: [all, [...all]], diverged: 0 };
  },
  read(st) {
    const span = Math.min(WINDOW_MS, st.now) / 1000 || 1;
    const n = st.events.length || 1;
    return {
      refusedRate: st.events.filter((e) => e.kind === 'refused').length / n,
      diverged: st.diverged,
      served: st.events.filter((e) => e.kind === 'ok').length / span,
    };
  },
  view(st, params) {
    return {
      nodes: [
        { id: 'u1', label: 'Users', x: 40, y: 40, note: 'side 1' },
        { id: 'u2', label: 'Users', x: 264, y: 40, note: 'side 2' },
        { id: 'r1', label: 'Copy 1', x: 70, y: 150, status: st.partitioned && params.consistent ? 'busy' : 'ok', note: st.diverged ? 'differs' : 'in sync' },
        { id: 'r2', label: 'Copy 2', x: 234, y: 150, status: st.partitioned && params.consistent ? 'busy' : 'ok', note: st.partitioned ? 'link cut' : 'in sync' },
      ],
      edges: [
        { from: 'u1', to: 'r1', active: true },
        { from: 'u2', to: 'r2', active: true },
        { from: 'r1', to: 'r2', active: !st.partitioned, broken: st.partitioned },
      ],
    };
  },
};


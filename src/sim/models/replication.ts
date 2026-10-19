import { arrivals } from '../requests';
import type { Model, SimNode } from '../types';

// S8 "Replication": one leader takes writes and copies them to two followers after a delay (lag).
// Reading from a follower can return old data; losing the leader needs a failover, and with
// asynchronous copying, writes the old leader had confirmed but not yet copied are lost.

const TICK_MS = 50;
const WINDOW_MS = 5000;
const DETECT_MS = 1000;
const LOCAL_MS = 5;
/** A synchronous write that no follower has confirmed by now fails (the caller gives up). */
const SYNC_TIMEOUT_MS = 2000;

interface Replica {
  id: string;
  up: boolean;
  /** Highest write number this replica has applied. */
  applied: number;
}

interface Pending {
  seq: number;
  /** When each follower receives it. */
  arrives: Record<string, number>;
  /** For synchronous writes: when the caller gets its answer (null: still waiting). */
  ackAt: number | null;
  startedAt: number;
}

interface Ev {
  at: number;
  kind: 'read-fresh' | 'read-stale' | 'write-ok' | 'write-error';
  latency: number;
}

export interface ReplState {
  now: number;
  replicas: Replica[];
  leader: string | null;
  leaderDiedAt: number | null;
  /** Highest write number confirmed to a caller (acknowledged). */
  acked: number;
  seq: number;
  pending: Pending[];
  events: Ev[];
  /** Acknowledged writes missing from the new leader after a failover. */
  lost: number;
}

const leaderOf = (st: ReplState) => st.replicas.find((r) => r.id === st.leader && r.up);

export const replication: Model<ReplState> = {
  id: 'replication',
  tickMs: TICK_MS,
  controls: [
    { kind: 'slider', id: 'writes', label: 'Writes', min: 1, max: 30, step: 1, value: 10, unit: 'per s' },
    { kind: 'slider', id: 'reads', label: 'Reads', min: 5, max: 60, step: 5, value: 30, unit: 'per s' },
    { kind: 'slider', id: 'lag', label: 'Replication lag', min: 50, max: 1000, step: 50, value: 300, unit: 'ms' },
    { kind: 'toggle', id: 'followerReads', label: 'Read from followers', value: true },
    { kind: 'toggle', id: 'sync', label: 'Synchronous copy (wait for a follower)', value: false },
    { kind: 'toggle', id: 'failover', label: 'Automatic failover', value: false },
    { kind: 'action', id: 'kill-leader', label: 'Kill the leader' },
  ],
  metrics: [
    { id: 'staleRate', label: 'Stale reads', format: 'percent', better: 'low' },
    { id: 'writeErrors', label: 'Failed writes', format: 'percent', better: 'low' },
    { id: 'writeP50', label: 'Write wait', format: 'ms', better: 'low' },
    { id: 'lost', label: 'Lost writes', format: 'count', better: 'low' },
  ],
  init() {
    return {
      now: 0,
      replicas: ['A', 'B', 'C'].map((id) => ({ id, up: true, applied: 0 })),
      leader: 'A',
      leaderDiedAt: null,
      acked: 0,
      seq: 0,
      pending: [],
      events: [],
      lost: 0,
    };
  },
  step(input, params, random) {
    const st: ReplState = {
      ...input,
      replicas: input.replicas.map((r) => ({ ...r })),
      pending: input.pending.map((p) => ({ ...p })),
      events: [...input.events],
    };
    const start = st.now;
    st.now += TICK_MS;
    const lag = Number(params.lag);
    const ev = (kind: Ev['kind'], latency: number, at = st.now) => st.events.push({ at, kind, latency });

    // Failover: after the failure is noticed, promote the follower that has the most data.
    if (!leaderOf(st) && params.failover && st.leaderDiedAt !== null && st.now - st.leaderDiedAt >= DETECT_MS) {
      const best = st.replicas.filter((r) => r.up).sort((a, b) => b.applied - a.applied)[0];
      if (best) {
        st.lost += Math.max(0, st.acked - best.applied);
        st.acked = Math.min(st.acked, best.applied);
        st.seq = best.applied;
        st.leader = best.id;
        st.leaderDiedAt = null;
        // Writes still in flight from the old leader are gone with it.
        st.pending = [];
      }
    }

    const leader = leaderOf(st);
    for (let k = arrivals(Number(params.writes), TICK_MS, random); k > 0; k--) {
      if (!leader) {
        ev('write-error', 0, start);
        continue;
      }
      const seq = ++st.seq;
      leader.applied = seq;
      const arrives: Record<string, number> = {};
      for (const r of st.replicas) if (r.id !== leader.id) arrives[r.id] = start + lag * (0.7 + 0.6 * random());
      if (params.sync) {
        st.pending.push({ seq, arrives, ackAt: null, startedAt: start });
      } else {
        st.pending.push({ seq, arrives, ackAt: start + LOCAL_MS, startedAt: start });
        st.acked = seq;
        ev('write-ok', LOCAL_MS, start + LOCAL_MS);
      }
    }

    // Copies arrive at followers; a synchronous write is confirmed once the first one has it.
    for (const p of st.pending) {
      for (const [id, at] of Object.entries(p.arrives)) {
        const r = st.replicas.find((x) => x.id === id)!;
        if (at <= st.now && r.up) r.applied = Math.max(r.applied, p.seq);
      }
      if (p.ackAt === null) {
        const first = Math.min(...Object.entries(p.arrives).filter(([id]) => st.replicas.find((x) => x.id === id)!.up).map(([, at]) => at));
        if (first <= st.now) {
          p.ackAt = first;
          st.acked = Math.max(st.acked, p.seq);
          ev('write-ok', first - p.startedAt, first);
        }
      }
    }
    const timedOut = st.pending.filter((p) => p.ackAt === null && st.now - p.startedAt > SYNC_TIMEOUT_MS).length;
    for (let k = 0; k < timedOut; k++) ev('write-error', 0, st.now);
    st.pending = st.pending.filter((p) => (p.ackAt === null ? st.now - p.startedAt <= SYNC_TIMEOUT_MS : Object.values(p.arrives).some((at) => at > st.now)));

    for (let k = arrivals(Number(params.reads), TICK_MS, random); k > 0; k--) {
      const pool = st.replicas.filter((r) => r.up && (params.followerReads || r.id === st.leader));
      if (!pool.length) continue;
      const r = pool[Math.floor(random() * pool.length)]!;
      // Stale: this copy hasn't seen a write that was already confirmed to someone.
      ev(r.applied < st.acked ? 'read-stale' : 'read-fresh', LOCAL_MS, start);
    }

    st.events = st.events.filter((e) => st.now - e.at <= WINDOW_MS);
    return st;
  },
  act(st, action) {
    if (action !== 'kill-leader' || !st.leader) return st;
    // Copies the leader had not sent yet die with it: only those already delivered survive.
    const pending = st.pending.map((p) => ({ ...p, arrives: Object.fromEntries(Object.entries(p.arrives).filter(([, at]) => at <= st.now)) }));
    return { ...st, pending, replicas: st.replicas.map((r) => (r.id === st.leader ? { ...r, up: false } : r)), leaderDiedAt: st.now, leader: null };
  },
  read(st) {
    const reads = st.events.filter((e) => e.kind.startsWith('read'));
    const writes = st.events.filter((e) => e.kind.startsWith('write'));
    const ok = writes.filter((e) => e.kind === 'write-ok').map((e) => e.latency).sort((a, b) => a - b);
    return {
      staleRate: reads.length ? reads.filter((e) => e.kind === 'read-stale').length / reads.length : 0,
      writeErrors: writes.length ? writes.filter((e) => e.kind === 'write-error').length / writes.length : 0,
      writeP50: ok.length ? ok[Math.floor(ok.length / 2)]! : 0,
      lost: st.lost,
    };
  },
  view(st) {
    const pos: Record<string, [number, number]> = { A: [230, 40], B: [150, 165], C: [256, 165] };
    const nodes: SimNode[] = [
      { id: 'app', label: 'App', x: 40, y: 100 },
      ...st.replicas.map((r): SimNode => ({
        id: r.id,
        label: `${r.id === st.leader ? 'Leader' : 'Copy'} ${r.id}`,
        x: pos[r.id]![0],
        y: pos[r.id]![1],
        width: 84,
        status: r.up ? 'ok' : 'down',
        note: r.up ? `has #${r.applied}` : 'down',
      })),
    ];
    const leader = st.leader;
    return {
      nodes,
      edges: [
        ...st.replicas.map((r) => ({ from: 'app', to: r.id, active: r.up && r.id === leader, broken: !r.up })),
        ...(leader ? st.replicas.filter((r) => r.id !== leader).map((r) => ({ from: leader, to: r.id, active: st.pending.length > 0 && r.up, broken: !r.up })) : []),
      ],
    };
  },
};

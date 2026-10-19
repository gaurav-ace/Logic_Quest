import { arrivals } from '../requests';
import { columnYs, type Model, type SimNode } from '../types';

// S11 "Message queues": producers drop messages in a queue and move on; workers take them out
// at their own pace. The queue absorbs bursts, a full queue pushes back, and a message that
// always fails ("poison") needs a dead-letter queue, or retries spin on it forever.

const TICK_MS = 50;
const WINDOW_MS = 5000;
const WORK_MS = 100;
const MAX_TRIES = 3;
const BURST_MS = 4000;

interface Msg {
  id: number;
  sentAt: number;
  poison: boolean;
  tries: number;
}

interface Worker {
  msg: Msg | null;
  doneAt: number;
}

interface Ev {
  at: number;
  kind: 'sent' | 'rejected' | 'done' | 'lost' | 'dead';
  wait: number;
}

export interface QueueState {
  now: number;
  nextId: number;
  queue: Msg[];
  workers: Worker[];
  dlq: number;
  burstUntil: number;
  events: Ev[];
  totals: { sent: number; rejected: number; done: number; lost: number; dead: number };
}

export const queues: Model<QueueState> = {
  id: 'queues',
  tickMs: TICK_MS,
  controls: [
    { kind: 'slider', id: 'rate', label: 'Messages in', min: 5, max: 60, step: 5, value: 15, unit: 'per s' },
    { kind: 'slider', id: 'workers', label: 'Workers', min: 1, max: 4, step: 1, value: 2 },
    { kind: 'slider', id: 'capacity', label: 'Queue size', min: 10, max: 300, step: 10, value: 50, unit: 'msgs' },
    { kind: 'slider', id: 'poison', label: 'Poison messages', min: 0, max: 10, step: 1, value: 0, unit: '%' },
    { kind: 'toggle', id: 'retries', label: 'Retry failed messages', value: true },
    { kind: 'toggle', id: 'dlq', label: `Dead-letter queue (after ${MAX_TRIES} tries)`, value: false },
    { kind: 'action', id: 'burst', label: 'Burst: 3× traffic for 4 s' },
  ],
  metrics: [
    { id: 'queued', label: 'In the queue', format: 'count', better: 'low' },
    { id: 'rejectRate', label: 'Rejected (queue full)', format: 'percent', better: 'low' },
    { id: 'waitP95', label: 'Wait, slowest 5%', format: 'ms', better: 'low' },
    { id: 'lostRate', label: 'Lost messages', format: 'percent', better: 'low' },
  ],
  init(params) {
    return {
      now: 0,
      nextId: 1,
      queue: [],
      workers: Array.from({ length: Number(params.workers) }, () => ({ msg: null, doneAt: 0 })),
      dlq: 0,
      burstUntil: -1,
      events: [],
      totals: { sent: 0, rejected: 0, done: 0, lost: 0, dead: 0 },
    };
  },
  step(input, params, random) {
    // Messages are never changed in place (a retry makes a new object), so they can be shared.
    const st: QueueState = { ...input, queue: [...input.queue], workers: input.workers.map((w) => ({ ...w })), events: [...input.events], totals: { ...input.totals } };
    const start = st.now;
    st.now += TICK_MS;
    const ev = (kind: Ev['kind'], wait = 0) => st.events.push({ at: st.now, kind, wait });

    // Adding workers takes effect at once; removing one lets its message go back to the front.
    const n = Number(params.workers);
    while (st.workers.length < n) st.workers.push({ msg: null, doneAt: 0 });
    for (const w of st.workers.splice(n)) if (w.msg) st.queue.unshift(w.msg);

    const rate = Number(params.rate) * (st.now <= st.burstUntil ? 3 : 1);
    for (let k = arrivals(rate, TICK_MS, random); k > 0; k--) {
      if (st.queue.length >= Number(params.capacity)) {
        st.totals.rejected++;
        ev('rejected');
        continue;
      }
      st.totals.sent++;
      st.queue.push({ id: st.nextId++, sentAt: start, poison: random() * 100 < Number(params.poison), tries: 0 });
      ev('sent');
    }

    for (const w of st.workers) {
      if (w.msg && w.doneAt <= st.now) {
        const m = w.msg;
        w.msg = null;
        if (!m.poison) {
          st.totals.done++;
          ev('done', w.doneAt - m.sentAt);
        } else if (params.dlq && m.tries >= MAX_TRIES) {
          // Set aside for a person to inspect, instead of blocking the line.
          st.dlq++;
          st.totals.dead++;
          ev('dead');
        } else if (params.retries) {
          st.queue.push({ ...m }); // back of the line, to be tried again
        } else {
          st.totals.lost++;
          ev('lost');
        }
      }
      if (!w.msg && st.queue.length) {
        const m = st.queue.shift()!;
        w.msg = { ...m, tries: m.tries + 1 };
        w.doneAt = st.now + WORK_MS;
      }
    }

    st.events = st.events.filter((e) => st.now - e.at <= WINDOW_MS);
    return st;
  },
  act(st, action) {
    return action === 'burst' ? { ...st, burstUntil: st.now + BURST_MS } : st;
  },
  read(st) {
    const offered = st.events.filter((e) => e.kind === 'sent' || e.kind === 'rejected').length;
    const finished = st.events.filter((e) => e.kind === 'done' || e.kind === 'lost' || e.kind === 'dead').length;
    // A message stuck in the queue counts too: its wait so far is a lower bound.
    const waits = [...st.events.filter((e) => e.kind === 'done').map((e) => e.wait), ...st.queue.map((m) => st.now - m.sentAt)].sort((a, b) => a - b);
    return {
      queued: st.queue.length,
      rejectRate: offered ? st.events.filter((e) => e.kind === 'rejected').length / offered : 0,
      waitP95: waits.length ? waits[Math.min(waits.length - 1, Math.floor(0.95 * waits.length))]! : 0,
      lostRate: finished ? st.events.filter((e) => e.kind === 'lost').length / finished : 0,
    };
  },
  view(st, params) {
    const fill = st.queue.length / Number(params.capacity);
    const ys = columnYs(st.workers.length);
    const nodes: SimNode[] = [
      { id: 'producers', label: 'Producers', x: 46, y: 100, width: 88, note: st.now <= st.burstUntil ? 'burst!' : '' },
      { id: 'queue', label: 'Queue', x: 150, y: 100, status: fill >= 0.8 ? 'busy' : 'ok', load: fill, note: `${st.queue.length} waiting` },
      ...st.workers.map((w, i): SimNode => ({ id: `w${i}`, label: `Worker ${i + 1}`, x: 256, y: ys[i]!, width: 84, status: w.msg?.poison ? 'slow' : w.msg ? 'busy' : 'ok' })),
      ...(params.dlq ? [{ id: 'dlq', label: 'Dead letters', x: 150, y: 182, width: 100, note: `${st.dlq}` }] : []),
    ];
    return {
      nodes,
      edges: [
        { from: 'producers', to: 'queue', active: true },
        ...st.workers.map((w, i) => ({ from: 'queue', to: `w${i}`, active: w.msg !== null })),
        ...(params.dlq ? [{ from: 'queue', to: 'dlq', active: false }] : []),
      ],
    };
  },
};

import { arrivals } from '../requests';
import type { Model } from '../types';

// R4/R8 "Train booking" and "Flash sale": many buyers, a fixed number of seats. Three things
// to get right: taking a seat must be one atomic step (or two buyers get the same seat), held
// seats must expire when people leave without paying, and an opening spike needs a waiting
// room so the database isn't flooded.

const TICK_MS = 50;
const WINDOW_MS = 5000;
/** Bookings the database can handle a second (illustrative). */
const DB_CAP = 200;
/** Non-atomic booking: time between reading the seat count and writing it back. */
const READ_GAP_MS = 200;
const SPIKE_MS = 5000;
const SPIKE_X = 10;

interface Take {
  /** When the stale write lands. */
  at: number;
  /** The seat count this buyer read. */
  read: number;
}

interface Hold {
  expires: number;
  /** When the buyer pays, or null if they left. */
  paysAt: number | null;
}

interface Ev {
  at: number;
  kind: 'booked' | 'failed' | 'soldout' | 'admitted';
  wait: number;
}

export interface InventoryState {
  now: number;
  /** The real number of seats, which never changes. */
  seats: number;
  /** What the database says is free. */
  available: number;
  holds: Hold[];
  confirmed: number;
  /** Buyers mid-booking in non-atomic mode (read done, write pending). */
  takes: Take[];
  /** Arrival times of buyers in the waiting room. */
  queue: number[];
  admitCredit: number;
  spikeUntil: number;
  events: Ev[];
}

export const inventory: Model<InventoryState> = {
  id: 'inventory',
  tickMs: TICK_MS,
  controls: [
    { kind: 'slider', id: 'rate', label: 'Buyers', min: 10, max: 100, step: 10, value: 40, unit: 'per s' },
    { kind: 'slider', id: 'seats', label: 'Seats', min: 500, max: 5000, step: 500, value: 3000 },
    { kind: 'toggle', id: 'atomic', label: 'Take a seat in one atomic step', value: true },
    { kind: 'slider', id: 'hold', label: 'Seat hold while paying', min: 5, max: 60, step: 5, value: 10, unit: 's' },
    { kind: 'slider', id: 'abandon', label: 'Buyers who leave without paying', min: 0, max: 80, step: 10, value: 10, unit: '%' },
    { kind: 'toggle', id: 'room', label: 'Waiting room (admit at a safe rate)', value: false },
    { kind: 'slider', id: 'admit', label: 'Admit from the waiting room', min: 50, max: 300, step: 25, value: 150, unit: 'per s' },
    { kind: 'action', id: 'open', label: `Booking opens: ${SPIKE_X}× buyers for 5 s` },
  ],
  metrics: [
    { id: 'doubleSold', label: 'Seats sold twice', format: 'count', better: 'low' },
    { id: 'errorRate', label: 'Bookings failed (database overloaded)', format: 'percent', better: 'low' },
    { id: 'stuck', label: 'Seats held by people who left', format: 'count', better: 'low' },
    { id: 'waitP95', label: 'Waiting room, slowest 5%', format: 'ms', better: 'low' },
  ],
  init(params) {
    return { now: 0, seats: Number(params.seats), available: Number(params.seats), holds: [], confirmed: 0, takes: [], queue: [], admitCredit: 0, spikeUntil: -1, events: [] };
  },
  step(input, params, random) {
    const st: InventoryState = { ...input, holds: [...input.holds], takes: [...input.takes], queue: [...input.queue], events: [...input.events] };
    st.now += TICK_MS;
    const ev = (kind: Ev['kind'], wait = 0) => st.events.push({ at: st.now, kind, wait });
    const holdMs = Number(params.hold) * 1000;

    // Holds end: paid seats are sold; unpaid ones go back on sale when they expire.
    st.holds = st.holds.filter((h) => {
      if (h.paysAt !== null && h.paysAt <= st.now && h.paysAt <= h.expires) {
        st.confirmed++;
        return false;
      }
      if (h.expires <= st.now) {
        st.available++;
        return false;
      }
      return true;
    });

    // Non-atomic writes land: each writes back the count it read, minus one. Two buyers who read
    // the same count both write the same value, so one seat is sold twice (a lost update).
    st.takes = st.takes.filter((t) => {
      if (t.at > st.now) return true;
      st.available = t.read - 1;
      st.holds.push(newHold(st.now, holdMs, params, random));
      ev('booked');
      return false;
    });

    const rate = Number(params.rate) * (st.now <= st.spikeUntil ? SPIKE_X : 1);
    const arrived = arrivals(rate, TICK_MS, random);
    const admitted: number[] = [];
    if (params.room) {
      for (let k = 0; k < arrived; k++) st.queue.push(st.now);
      st.admitCredit += (Number(params.admit) * TICK_MS) / 1000;
      while (st.admitCredit >= 1 && st.queue.length) {
        st.admitCredit--;
        const since = st.queue.shift()!;
        admitted.push(since);
        ev('admitted', st.now - since);
      }
      if (!st.queue.length) st.admitCredit = Math.min(st.admitCredit, 1);
    } else {
      for (let k = 0; k < arrived; k++) admitted.push(st.now);
      // Leaving the waiting room on lets everyone already queued straight in.
      for (const since of st.queue.splice(0)) admitted.push(since);
    }

    // The database serves up to its capacity this tick; the rest time out.
    let capacity = Math.floor((DB_CAP * TICK_MS) / 1000 + random());
    for (let k = 0; k < admitted.length; k++) {
      if (capacity-- <= 0) {
        ev('failed');
        continue;
      }
      if (st.available <= 0) {
        ev('soldout');
        continue;
      }
      if (params.atomic) {
        // UPDATE seats SET free = free - 1 WHERE free > 0: check and take in one step.
        st.available--;
        st.holds.push(newHold(st.now, holdMs, params, random));
        ev('booked');
      } else {
        st.takes.push({ at: st.now + READ_GAP_MS, read: st.available });
      }
    }

    st.events = st.events.filter((e) => st.now - e.at <= WINDOW_MS);
    return st;
  },
  act(st, action) {
    return action === 'open' ? { ...st, spikeUntil: st.now + SPIKE_MS } : st;
  },
  read(st) {
    // Pending non-atomic bookings haven't written yet, so they aren't counted until they land.
    const handedOut = st.confirmed + st.holds.length;
    const tried = st.events.filter((e) => e.kind !== 'admitted').length;
    const waits = st.events.filter((e) => e.kind === 'admitted').map((e) => e.wait);
    // Buyers still in the queue count with their wait so far.
    for (const since of st.queue) waits.push(st.now - since);
    waits.sort((a, b) => a - b);
    return {
      // Seats handed out plus seats still free, beyond the real number: seats sold twice.
      doubleSold: Math.max(0, handedOut + st.available - st.seats),
      errorRate: tried ? st.events.filter((e) => e.kind === 'failed').length / tried : 0,
      stuck: st.holds.filter((h) => h.paysAt === null).length,
      waitP95: waits.length ? waits[Math.min(waits.length - 1, Math.floor(0.95 * waits.length))]! : 0,
    };
  },
  view(st, params) {
    const busy = (inventory.read(st).errorRate ?? 0) > 0.05;
    return {
      nodes: [
        { id: 'buyers', label: 'Buyers', x: 40, y: 100, note: st.now <= st.spikeUntil ? 'rush!' : '' },
        ...(params.room ? [{ id: 'room', label: 'Queue', x: 130, y: 40, width: 80, status: st.queue.length > 100 ? ('busy' as const) : ('ok' as const), note: `${st.queue.length} waiting` }] : []),
        { id: 'app', label: 'Booking', x: 130, y: 160, width: 80, status: busy ? 'busy' : 'ok', note: params.atomic ? 'atomic' : 'read, then write' },
        { id: 'db', label: 'Seats DB', x: 258, y: 100, width: 84, status: busy ? 'busy' : 'ok', note: `${Math.max(0, st.available)} free` },
      ],
      edges: [
        ...(params.room ? [{ from: 'buyers', to: 'room', active: true }, { from: 'room', to: 'app', active: true }] : [{ from: 'buyers', to: 'app', active: true }]),
        { from: 'app', to: 'db', active: true },
      ],
    };
  },
};

function newHold(now: number, holdMs: number, params: Record<string, number | boolean>, random: () => number): Hold {
  const leaves = random() * 100 < Number(params.abandon);
  // Paying takes 1 to 4 s (illustrative).
  return { expires: now + holdMs, paysAt: leaves ? null : now + 1000 + random() * 3000 };
}

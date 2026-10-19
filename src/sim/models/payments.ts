import { arrivals } from '../requests';
import type { Model } from '../types';

// S14 "Idempotency and retries": a client pays; the network sometimes loses the server's reply.
// The client can't tell "it failed" from "the reply got lost", so it retries. Without an
// idempotency key the server charges again; with one, it returns the first result.

const TICK_MS = 50;
const WINDOW_MS = 5000;
const SERVER_MS = 100;
const TIMEOUT_MS = 400;
const MAX_TRIES = 4;

interface Attempt {
  payment: number;
  /** When the client gives up waiting for this attempt's reply. */
  timeoutAt: number;
  /** When the reply arrives (null: the reply was lost). */
  replyAt: number | null;
  tries: number;
}

interface Ev {
  at: number;
  kind: 'paid' | 'failed' | 'double';
}

export interface PayState {
  now: number;
  nextPayment: number;
  inFlight: Attempt[];
  /** Times each payment was actually charged on the server. */
  charges: Record<number, number>;
  /** Server-side store of idempotency keys already processed. */
  seenKeys: Record<number, true>;
  events: Ev[];
  doubles: number;
}

export const payments: Model<PayState> = {
  id: 'payments',
  tickMs: TICK_MS,
  controls: [
    { kind: 'slider', id: 'rate', label: 'Payments', min: 2, max: 30, step: 2, value: 10, unit: 'per s' },
    { kind: 'slider', id: 'lost', label: 'Replies lost on the network', min: 0, max: 40, step: 5, value: 20, unit: '%' },
    { kind: 'toggle', id: 'retry', label: `Retry on timeout (up to ${MAX_TRIES} tries)`, value: false },
    { kind: 'toggle', id: 'idempotency', label: 'Send an idempotency key', value: false },
  ],
  metrics: [
    { id: 'failRate', label: 'Payments the user saw fail', format: 'percent', better: 'low' },
    { id: 'doubles', label: 'Double charges', format: 'count', better: 'low' },
    { id: 'paid', label: 'Payments completed', format: 'per-second', better: 'high' },
    { id: 'retries', label: 'Retries in flight', format: 'count', better: 'low' },
  ],
  init() {
    return { now: 0, nextPayment: 1, inFlight: [], charges: {}, seenKeys: {}, events: [], doubles: 0 };
  },
  step(input, params, random) {
    const st: PayState = { ...input, inFlight: [...input.inFlight], charges: { ...input.charges }, seenKeys: { ...input.seenKeys }, events: [...input.events] };
    const start = st.now;
    st.now += TICK_MS;
    const lostPct = Number(params.lost);

    // The server receives a try: charge, unless this key was already processed.
    const send = (payment: number, tries: number): Attempt => {
      if (!(params.idempotency && st.seenKeys[payment])) {
        st.charges[payment] = (st.charges[payment] ?? 0) + 1;
        if (st.charges[payment] === 2) {
          st.doubles++;
          st.events.push({ at: st.now, kind: 'double' });
        }
        if (params.idempotency) st.seenKeys[payment] = true;
      }
      const replyLost = random() * 100 < lostPct;
      return { payment, tries, timeoutAt: start + TIMEOUT_MS, replyAt: replyLost ? null : start + SERVER_MS };
    };

    for (let k = arrivals(Number(params.rate), TICK_MS, random); k > 0; k--) st.inFlight.push(send(st.nextPayment++, 1));

    const still: Attempt[] = [];
    for (const a of st.inFlight) {
      if (a.replyAt !== null && a.replyAt <= st.now) {
        st.events.push({ at: st.now, kind: 'paid' });
      } else if (a.timeoutAt <= st.now) {
        // No reply in time: the client doesn't know whether it was charged.
        if (params.retry && a.tries < MAX_TRIES) still.push(send(a.payment, a.tries + 1));
        else st.events.push({ at: st.now, kind: 'failed' });
      } else {
        still.push(a);
      }
    }
    st.inFlight = still;
    st.events = st.events.filter((e) => st.now - e.at <= WINDOW_MS);
    return st;
  },
  act: (st) => st,
  read(st) {
    const span = Math.min(WINDOW_MS, st.now) / 1000 || 1;
    const ended = st.events.filter((e) => e.kind !== 'double');
    return {
      failRate: ended.length ? ended.filter((e) => e.kind === 'failed').length / ended.length : 0,
      doubles: st.doubles,
      paid: st.events.filter((e) => e.kind === 'paid').length / span,
      retries: st.inFlight.filter((a) => a.tries > 1).length,
    };
  },
  view(st, params) {
    const retrying = st.inFlight.filter((a) => a.tries > 1).length;
    return {
      nodes: [
        { id: 'client', label: 'App', x: 40, y: 100, note: retrying ? `${retrying} retrying` : '' },
        { id: 'net', label: 'Network', x: 150, y: 100, width: 84, status: Number(params.lost) > 0 ? 'slow' : 'ok', note: `${params.lost}% lost` },
        { id: 'server', label: 'Payments', x: 250, y: 100, width: 84, note: params.idempotency ? 'checks keys' : 'no key check' },
      ],
      edges: [
        { from: 'client', to: 'net', active: st.inFlight.length > 0 },
        { from: 'net', to: 'server', active: st.inFlight.length > 0 },
      ],
    };
  },
};

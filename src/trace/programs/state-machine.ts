import type { ClassDiagram } from '../../engine/uml';
import { predict, randomInt, Tracer } from '../tools';
import type { Program, Value, View } from '../types';

// O10 "State machines": an order's state changes only through a table of allowed moves.
// Any (state, event) pair not in the table is rejected and the state stays as it was.

export interface MachineInput {
  events: string[];
}

export const MOVES: [state: string, event: string, next: string][] = [
  ['new', 'pay', 'paid'],
  ['paid', 'ship', 'shipped'],
  ['shipped', 'arrive', 'arrived'],
  ['new', 'cancel', 'cancelled'],
  ['paid', 'cancel', 'cancelled'],
];

export const EVENTS = ['pay', 'ship', 'arrive', 'cancel'];

/** Where each event would take the order if every move were allowed: the tempting wrong answer. */
const NAIVE: Record<string, string> = { pay: 'paid', ship: 'shipped', arrive: 'arrived', cancel: 'cancelled' };

const code = [
  'MOVES = {',
  " ('new', 'pay'): 'paid',",
  " ('paid', 'ship'): 'shipped',",
  " ('shipped', 'arrive'): 'arrived',",
  " ('new', 'cancel'): 'cancelled',",
  " ('paid', 'cancel'): 'cancelled',",
  '}',
  '',
  'def handle(state, event):',
  '    key = (state, event)',
  '    if key not in MOVES:',
  '        return state  # rejected',
  '    return MOVES[key]',
  '',
  "state = 'new'",
  'for event in events:',
  '    state = handle(state, event)',
];

const move = (state: string, event: string) => MOVES.findIndex(([s, e]) => s === state && e === event);

/** Plain version: final state and how many events were rejected. */
export function runMachine(events: string[]): [string, number] {
  let state = 'new';
  let rejected = 0;
  for (const e of events) {
    const i = move(state, e);
    if (i === -1) rejected++;
    else state = MOVES[i]![2];
  }
  return [state, rejected];
}

const orderBox = (state: string): ClassDiagram => ({
  type: 'class',
  classes: [{ id: 'order', name: 'Order', col: 'both', row: 0, fields: [`state = '${state}'`], methods: ['handle(event)'] }],
  relations: [],
});

export const stateMachine: Program<MachineInput> = {
  id: 'state-machine',
  code,
  // Starts with an event that is too early, and includes a cancel that comes too late.
  defaultInput: { events: ['ship', 'pay', 'ship', 'cancel', 'arrive', 'pay'] },
  randomInput: (r) => ({ events: Array.from({ length: randomInt(r, 5, 7) }, () => EVENTS[randomInt(r, 0, EVENTS.length - 1)]!) }),
  describe: ({ events }) => `events = [${events.map((e) => `'${e}'`).join(', ')}]`,
  reference: ({ events }) => runMachine(events),
  run({ events }) {
    const t = new Tracer();
    const log: Value[][] = [];
    const views = (state: string, used: number | null, changed: boolean): View[] => [
      { type: 'uml', label: 'The order object', diagram: orderBox(state), ...(changed ? { highlight: ['order'] } : {}) },
      { type: 'table', label: 'Allowed moves', columns: ['state', 'event', 'next'], rows: MOVES, ...(used === null ? {} : { highlightRow: used }) },
      { type: 'table', label: 'Events so far', columns: ['event', 'result'], rows: log, ...(log.length ? { highlightRow: log.length - 1 } : {}) },
    ];
    let state = 'new';
    let rejected = 0;
    let asked = 0;
    let askedAccepted = false;
    t.step(15, "The order starts as 'new'. MOVES lists every allowed (state, event) pair; any other pair is rejected.", { state }, views(state, null, false));
    events.forEach((event, i) => {
      const used = move(state, event);
      const next = used === -1 ? state : MOVES[used]![2];
      // Ask about rejected events (the surprising ones) and the first accepted one.
      const worth = used === -1 ? NAIVE[event] !== state : !askedAccepted;
      const ask =
        asked < 3 && worth
          ? (asked++,
            predict(
              `state is '${state}' and the event is '${event}'. What is the state after handle()?`,
              next,
              used === -1 ? `('${state}', '${event}') isn't in MOVES, so the event is rejected and the state stays '${state}'.` : `('${state}', '${event}') is in MOVES, so the order moves to '${next}'.`,
              used === -1
                ? [{ value: NAIVE[event]!, why: `That's where '${event}' leads from the right state, but ('${state}', '${event}') isn't in MOVES.` }]
                : [{ value: state, why: `('${state}', '${event}') is an allowed move, so the state changes.` }],
              i + 1,
            ))
          : undefined;
      if (ask && used !== -1) askedAccepted = true;
      if (used === -1) rejected++;
      log.push([event, used === -1 ? 'rejected' : `→ ${next}`]);
      const caption = used === -1 ? `'${event}' while '${state}': not an allowed move, so it is rejected. The state stays '${state}'.` : `'${event}' while '${state}': allowed, so the order moves to '${next}'.`;
      state = next;
      t.step(used === -1 ? 12 : 13, caption, { event, state }, views(state, used === -1 ? null : used, used !== -1), ask);
    });
    const sumAsk = predict(
      'How many events were rejected?',
      rejected,
      `Each event whose (state, event) pair isn't in MOVES was turned away: ${rejected} of ${events.length}.`,
      [
        { value: 0, why: 'Some events came in a state where they aren’t allowed.' },
        { value: events.length, why: 'Several events were allowed and moved the order on.' },
      ],
      99,
    );
    t.step(null, `Final state '${state}', with ${rejected} event${rejected === 1 ? '' : 's'} rejected. Every change went through one table, so no event could skip a step.`, { result: [state, rejected] }, views(state, null, false), sumAsk);
    return t.frames;
  },
};

import { describe, expect, it } from 'vitest';
import { randomInt, seeded } from '../tools';
import { EVENTS, MOVES, runMachine, stateMachine } from './state-machine';

// What the LLD trace lessons teach, checked beyond their examples.

describe('state machine (O10)', () => {
  const allowed = new Set(MOVES.map(([s, e, n]) => `${s}|${e}|${n}`));
  const randomEvents = (r: () => number) => Array.from({ length: randomInt(r, 1, 12) }, () => EVENTS[randomInt(r, 0, EVENTS.length - 1)]!);

  it('only ever changes state by an allowed move, on 500 random event lists', () => {
    const r = seeded(17);
    for (let run = 0; run < 500; run++) {
      const events = randomEvents(r);
      let state = 'new';
      for (const [i, e] of events.entries()) {
        const [next] = runMachine(events.slice(0, i + 1));
        if (next !== state) expect(allowed.has(`${state}|${e}|${next}`), `${state} --${e}--> ${next}`).toBe(true);
        state = next;
      }
    }
  });

  it('treats arrived and cancelled as final: no event moves the order on', () => {
    for (const end of [['pay', 'ship', 'arrive'], ['cancel']]) {
      for (const e of EVENTS) expect(runMachine([...end, e])).toEqual([runMachine(end)[0], 1]);
    }
  });

  it('counts every event as either a move or a rejection', () => {
    const r = seeded(3);
    for (let run = 0; run < 200; run++) {
      const events = randomEvents(r);
      const frames = stateMachine.run({ events });
      const moved = frames.filter((f) => f.line === 13).length;
      const rejected = frames.filter((f) => f.line === 12).length;
      expect(moved + rejected).toBe(events.length);
      expect(runMachine(events)[1]).toBe(rejected);
    }
  });

  it('shows the order object in every frame, with its current state', () => {
    for (const f of stateMachine.run(stateMachine.defaultInput)) {
      const uml = f.views.find((v) => v.type === 'uml');
      const state = f.vars.find(([n]) => n === 'state')?.[1] ?? (f.vars.find(([n]) => n === 'result')?.[1] as string[] | undefined)?.[0];
      expect(uml && uml.diagram.type === 'class' && uml.diagram.classes[0]!.fields![0]).toBe(`state = '${String(state)}'`);
    }
  });
});

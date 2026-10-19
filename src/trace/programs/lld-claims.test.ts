import { describe, expect, it } from 'vitest';
import { randomInt, seeded } from '../tools';
import { limiterClass, perUser } from './limiter-class';
import { lruCache, lruReference } from './lru-cache';
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

describe('LRU cache (O12)', () => {
  it('never holds more than its capacity, and always evicts the least recently used key', () => {
    const r = seeded(29);
    for (let run = 0; run < 300; run++) {
      const input = lruCache.randomInput(r);
      // Independent bookkeeping: when each cached key was last used.
      const used = new Map<number, number>();
      input.ops.forEach((op, i) => {
        const before = new Map(used);
        if (op[0] === 'get') {
          if (used.has(op[1])) used.set(op[1], i);
          return;
        }
        if (!used.has(op[1]) && used.size === input.cap) {
          const lru = [...before.entries()].sort((a, b) => a[1] - b[1])[0]![0];
          used.delete(lru);
        }
        used.set(op[1], i);
        expect(used.size).toBeLessThanOrEqual(input.cap);
      });
      // The trace's final list holds exactly the keys this bookkeeping kept, newest first.
      const last = lruCache.run(input).at(-1)!;
      const keys = last.views.find((v) => v.type === 'list');
      const shown = keys && keys.type === 'list' ? keys.nodes.map((n) => Number(String(n.value).split(':')[0])) : [];
      expect(shown).toEqual([...used.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k));
      expect(lruReference(input)).toEqual(last.vars.find(([n]) => n === 'result')![1]);
    }
  });
});

describe('rate limiter class (O13)', () => {
  it("decides each user's requests on their own: other users' traffic changes nothing", () => {
    const r = seeded(41);
    for (let run = 0; run < 200; run++) {
      const input = limiterClass.randomInput(r);
      const all = perUser(input);
      for (const user of new Set(input.reqs.map(([, u]) => u))) {
        const mine = input.reqs.flatMap(([, u], i) => (u === user ? [i] : []));
        const alone = perUser({ rate: input.rate, reqs: mine.map((i) => input.reqs[i]!) });
        expect(mine.map((i) => all[i])).toEqual(alone);
      }
    }
  });

  it('lets at most 2 × rate requests through for one user in any one-second stretch', () => {
    const r = seeded(43);
    for (let run = 0; run < 300; run++) {
      const rate = randomInt(r, 2, 4);
      const reqs: [number, string][] = [];
      let time = 0;
      for (let n = 0; n < 30; n++) reqs.push([(time = Math.round((time + r() * 0.15) * 100) / 100), 'asha']);
      const ok = perUser({ rate, reqs });
      for (const [start] of reqs) {
        const inWindow = reqs.filter(([t], i) => ok[i] && t >= start && t < start + 1).length;
        expect(inWindow).toBeLessThanOrEqual(2 * rate);
      }
    }
  });
});

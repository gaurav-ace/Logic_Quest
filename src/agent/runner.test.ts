import { describe, expect, it } from 'vitest';
import { defaults, type Params } from '../sim/types';
import { seeded } from '../trace/tools';
import { SCENARIOS } from './registry';
import { RUN_CAP, runAgent } from './runner';
import { flight } from './scenarios/flight';
import { moveMeeting } from './scenarios/move-meeting';
import { orderStatus } from './scenarios/order-status';
import { PRICE, refund } from './scenarios/refund';
import { pick, teamDinner } from './scenarios/team-dinner';
import { weather } from './scenarios/weather';
import type { Scenario } from './types';

// What every agent run must get right, whatever the scripted model decides.

function randomParams(s: Scenario<unknown>, r: () => number): Params {
  const p = defaults(s.controls);
  for (const c of s.controls) {
    if (c.kind === 'toggle') p[c.id] = r() < 0.5;
    if (c.kind === 'slider') p[c.id] = c.min + c.step * Math.floor(r() * ((c.max - c.min) / c.step + 1));
  }
  return p;
}

const varOf = (vars: [string, unknown][], name: string) => vars.find(([n]) => n === name)?.[1];

describe.each(SCENARIOS.map((s) => [s.id, s] as const))('scenario %s', (_id, s) => {
  it('on 300 random settings: ends exactly once, respects the step limit, counts only go up, and repeats exactly', () => {
    const r = seeded(71);
    for (let run = 0; run < 300; run++) {
      const p = randomParams(s, r);
      const { frames, outcome } = runAgent(s, p);
      expect(outcome.answered + outcome.stopped).toBe(1);
      expect(outcome.steps).toBeLessThanOrEqual(RUN_CAP);
      if (s.controls.some((c) => c.id === 'maxSteps') && p.limitOn !== false) expect(outcome.steps).toBeLessThanOrEqual(Number(p.maxSteps));
      expect(outcome.toolCalls + outcome.blocked).toBeLessThanOrEqual(outcome.steps);
      let tokens = 0;
      for (const f of frames) {
        const t = Number(varOf(f.vars, 'tokens'));
        expect(t).toBeGreaterThanOrEqual(tokens);
        tokens = t;
        if (f.ask) {
          expect(f.ask.options.length).toBeGreaterThanOrEqual(2);
          expect(f.ask.options[f.ask.answer]).toBeDefined();
        }
      }
      expect(tokens).toBe(outcome.tokens);
      expect(varOf(frames.at(-1)!.vars, 'result')).toBeDefined();
      expect(runAgent(s, p)).toEqual({ frames, outcome });
    }
  });

  it('describes every tool and states its rules', () => {
    expect(Object.values(s.tools).every((t) => t.describe.length > 0)).toBe(true);
    expect(s.rules.length).toBeGreaterThan(0);
  });
});

// A test-only scenario: calls tools in turn, a guard blocks one and sends one for review,
// and a spy counts what really ran.
interface Spy {
  ran: string[];
}
const script = ['read', 'delete', 'refund', 'read', 'read', 'read'];
const guarded: Scenario<Spy> = {
  id: 'test-guarded',
  task: 'Test task.',
  rules: ['Call the scripted tools in order, then answer.'],
  controls: [
    { kind: 'slider', id: 'budget', label: 'Budget', min: 20, max: 200, step: 10, value: 40 },
    { kind: 'toggle', id: 'compact', label: 'Compact', value: false },
    { kind: 'toggle', id: 'approve', label: 'Reviewer approves', value: false },
  ],
  metrics: [],
  tools: Object.fromEntries(['read', 'delete', 'refund'].map((t) => [t, { describe: t, run: (_a: unknown, w: Spy) => (w.ran.push(t), { ok: true, text: `${t} done with a fairly long result text` }) }])),
  init: () => ({ ran: [] }),
  policy: ({ turn }) => (turn < script.length ? { kind: 'call', call: { tool: script[turn]!, args: { n: turn } }, why: 'Script.' } : { kind: 'answer', text: 'ok', why: 'Done.' }),
  guard: (call) => (call.tool === 'delete' ? { block: 'deleting is not allowed.' } : call.tool === 'refund' ? { review: 'refunds need a person.' } : null),
  review: (_c, s) => Boolean(s.params.approve),
  grade: () => true,
};

describe('guardrails and the context budget', () => {
  it('a blocked call, or one a reviewer rejects, never reaches its tool', () => {
    const rejected = runAgent(guarded, { budget: 200, compact: false, approve: false });
    expect(rejected.outcome.blocked).toBe(2);
    expect(rejected.outcome.reviews).toBe(1);
    expect(rejected.outcome.toolCalls).toBe(4);
    const approved = runAgent(guarded, { budget: 200, compact: false, approve: true });
    expect(approved.outcome.blocked).toBe(1);
    expect(approved.outcome.toolCalls).toBe(5);
  });

  it('the spy agrees: only unblocked calls ran', () => {
    const world = { ran: [] as string[] };
    const spyScenario = { ...guarded, init: () => world };
    runAgent(spyScenario, { budget: 200, compact: false, approve: false });
    expect(world.ran).toEqual(['read', 'read', 'read', 'read']);
  });

  it('keeps the context within its budget (the task plus the newest entry at least), with and without compaction', () => {
    for (const compact of [false, true]) {
      for (let budget = 20; budget <= 200; budget += 10) {
        const { frames } = runAgent(guarded, { budget, compact, approve: false });
        for (const f of frames) {
          const ctx = f.views.find((v) => v.type === 'table' && v.label?.startsWith('Context'));
          if (ctx?.type !== 'table') throw new Error('no context view');
          const used = Number(/\((\d+) of/.exec(ctx.label ?? '')![1]);
          // Over budget only when nothing is left to drop: the task and the newest entry.
          expect(used <= budget || ctx.rows.length <= 2, `${used} > ${budget}: ${ctx.rows.join(' | ')}`).toBe(true);
          expect(ctx.rows[0]).toEqual(['task', guarded.task]);
        }
      }
    }
  });
});

describe('weather (A3): what the lesson claims', () => {
  const run = (p: Params) => runAgent(weather as unknown as Scenario<unknown>, { ...defaults(weather.controls), ...p }).outcome;

  it('answers right in 2 turns when the tool works', () => {
    expect(run({})).toMatchObject({ correct: 1, steps: 2, toolCalls: 1, madeUp: 0 });
  });

  it('with the tool down and no step limit, retries until the demo cap: the loop never ends by itself', () => {
    expect(run({ down: true, limitOn: false })).toMatchObject({ answered: 0, stopped: 1, steps: RUN_CAP, toolCalls: RUN_CAP });
  });

  it('a step limit stops it at exactly that many turns, for every limit', () => {
    for (let n = 1; n <= 10; n++) expect(run({ down: true, maxSteps: n })).toMatchObject({ stopped: 1, steps: n, answered: 0 });
  });

  it('hiding tool errors turns a failure into a made-up answer', () => {
    expect(run({ down: true, errors: false })).toMatchObject({ answered: 1, correct: 0, madeUp: 1, steps: 2 });
  });

  it('a limit too tight stops even a working run', () => {
    expect(run({ maxSteps: 1 })).toMatchObject({ stopped: 1, correct: 0 });
  });
});

const outcomeOf = (s: Scenario<never>, p: Params) => runAgent(s as unknown as Scenario<unknown>, { ...defaults(s.controls), ...p }).outcome;

describe('order status (A2): what the lesson claims', () => {
  it('with the tool and your code running it: the right answer from one call', () => {
    expect(outcomeOf(orderStatus as never, {})).toMatchObject({ correct: 1, toolCalls: 1, steps: 2 });
  });

  it('without the tool, the model can only guess, at any step limit', () => {
    for (const maxSteps of [2, 5, 8]) expect(outcomeOf(orderStatus as never, { hasTool: false, maxSteps })).toMatchObject({ correct: 0, madeUp: 1, toolCalls: 0 });
  });

  it('if your code never runs the call, no answer ever comes: it stops at the limit', () => {
    for (const maxSteps of [2, 5, 8]) expect(outcomeOf(orderStatus as never, { runTool: false, maxSteps })).toMatchObject({ answered: 0, stopped: 1, correct: 0 });
  });
});

describe('team dinner (A4): what the lesson claims', () => {
  const at = (budget: number, notes: boolean, compact: boolean) => outcomeOf(teamDinner as never, { budget, notes, compact });

  it('keeping everything works while all five answers fit, and loops (re-asking) once they do not', () => {
    for (let b = 70; b <= 160; b += 10) expect(at(b, false, false)).toMatchObject({ correct: 1, asked: 5 });
    for (let b = 40; b <= 60; b += 10) expect(at(b, false, false)).toMatchObject({ correct: 0, stopped: 1 });
  });

  it('compaction rescues a budget of 60 but not 40 or 50: five facts no longer fit a short summary', () => {
    expect(at(60, false, true)).toMatchObject({ correct: 1, asked: 5 });
    expect(at(50, false, true)).toMatchObject({ correct: 0 });
    expect(at(40, false, true)).toMatchObject({ correct: 0 });
  });

  it('notes work at every budget, for extra turns and tokens', () => {
    for (let b = 40; b <= 160; b += 10) {
      const withNotes = at(b, true, false);
      expect(withNotes).toMatchObject({ correct: 1, asked: 5, steps: 11 });
      if (b >= 70) expect(withNotes.tokens).toBeGreaterThan(at(b, false, false).tokens);
    }
  });

  it('never picks a restaurant that leaves someone out: a wrong pick only comes from not answering', () => {
    for (let b = 40; b <= 160; b += 10) for (const notes of [false, true]) for (const compact of [false, true]) {
      const o = at(b, notes, compact);
      expect(o.answered === 1 ? o.correct : 0).toBe(o.answered);
    }
  });

  it('pick() takes the first restaurant serving every need', () => {
    expect(pick(['vegetarian', 'no nuts', 'gluten-free', 'vegan', 'mild food'])).toBe('Green Bowl');
    expect(pick(['vegetarian', 'mild food'])).toBe('Pasta Place');
    expect(pick(['vegan', 'mild food', 'halal'])).toBe('none of them');
  });
});

describe('move meeting (A5): what the lesson claims', () => {
  const at = (planFirst: boolean, replan: boolean, stale: boolean) => outcomeOf(moveMeeting as never, { planFirst, replan, stale });

  it('with nothing stale, every approach gets it right', () => {
    for (const planFirst of [false, true]) for (const replan of [false, true]) expect(at(planFirst, replan, false)).toMatchObject({ correct: 1, wrongEmails: 0 });
  });

  it('a stale plan followed blindly emails the team about a room nobody booked', () => {
    expect(at(true, false, true)).toMatchObject({ correct: 0, wrongEmails: 1 });
  });

  it('re-planning on failure fixes it in more turns; deciding step by step fixes it in fewer', () => {
    const replanned = at(true, true, true);
    const stepwise = at(false, false, true);
    expect(replanned).toMatchObject({ correct: 1, wrongEmails: 0 });
    expect(stepwise).toMatchObject({ correct: 1, wrongEmails: 0 });
    expect(stepwise.steps).toBeLessThan(replanned.steps);
  });
});

describe('refund (A7): what the lesson claims', () => {
  const at = (p: Params) => outcomeOf(refund as never, p);

  it('without an attack, it refunds the price and nothing else', () => {
    expect(at({})).toMatchObject({ correct: 1, unsafe: 0 });
  });

  it('an injected instruction, obeyed, pays ₹45,000 and leaks the customer list', () => {
    expect(at({ inject: true })).toMatchObject({ correct: 0, unsafe: 2 });
  });

  it('each guardrail stops only part of it; together, or marking tool text as data, stop all of it', () => {
    expect(at({ inject: true, approval: true })).toMatchObject({ unsafe: 1, reviews: 1 });
    expect(at({ inject: true, allowlist: true })).toMatchObject({ unsafe: 1 });
    expect(at({ inject: true, approval: true, allowlist: true })).toMatchObject({ unsafe: 0, correct: 1 });
    expect(at({ inject: true, scan: true })).toMatchObject({ unsafe: 0, correct: 1, reviews: 0 });
  });

  it('the reviewer is only asked when a refund is above the threshold', () => {
    for (let t = 0; t <= 2000; t += 250) expect(at({ approval: true, threshold: t }).reviews).toBe(t < PRICE ? 1 : 0);
  });
});

describe('flight (A8): each failure, and the guardrail that catches it', () => {
  const at = (p: Params) => outcomeOf(flight as never, p);
  const failures: [string, Params, Params][] = [
    ['flaky search', { flaky: true }, { retry: true }],
    ['invented argument', { invented: true }, { validate: true }],
    ['wrong tool', { wrongTool: true }, { onlyNeeded: true }],
  ];

  it('works when nothing is injected', () => {
    expect(at({})).toMatchObject({ correct: 1, unsafe: 0, blocked: 0 });
  });

  it.each(failures)('%s breaks the run, and its guardrail fixes it', (_name, inject, guard) => {
    const broken = at(inject);
    expect(broken.correct === 0 || (broken.unsafe ?? 0) > 0).toBe(true);
    expect(at({ ...inject, ...guard })).toMatchObject({ correct: 1, unsafe: 0 });
  });

  it('a stuck tool loops until the demo cap, and a step limit stops it at the limit', () => {
    expect(at({ stuck: true })).toMatchObject({ stopped: 1, steps: RUN_CAP });
    for (let n = 2; n <= 12; n++) expect(at({ stuck: true, limitOn: true, maxSteps: n })).toMatchObject({ stopped: 1, steps: n });
  });

  it('the wrong guardrail does not catch a failure: each guard is specific', () => {
    expect(at({ invented: true, onlyNeeded: true, retry: true })).toMatchObject({ correct: 0, unsafe: 1 });
    expect(at({ wrongTool: true, validate: true, retry: true }).unsafe).toBe(1);
  });
});

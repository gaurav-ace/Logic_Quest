import { describe, expect, it } from 'vitest';
import { defaults, type Params } from '../sim/types';
import { seeded } from '../trace/tools';
import { SCENARIOS } from './registry';
import { RUN_CAP, runAgent } from './runner';
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
          const ctx = f.views.find((v) => v.type === 'queue');
          if (ctx?.type !== 'queue') throw new Error('no context view');
          const used = Number(/\((\d+) of/.exec(ctx.label ?? '')![1]);
          // Over budget only when nothing is left to drop: the task and the newest entry.
          expect(used <= budget || ctx.items.length <= 2, `${used} > ${budget}: ${ctx.items.join(' | ')}`).toBe(true);
          expect(String(ctx.items[0])).toBe(`task: ${guarded.task}`);
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

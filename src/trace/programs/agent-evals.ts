import { runAgent } from '../../agent/runner';
import { flight } from '../../agent/scenarios/flight';
import type { Scenario } from '../../agent/types';
import { defaults, type Params } from '../../sim/types';
import { predict, randomInt, Tracer } from '../tools';
import type { Program, Value } from '../types';

// A10 "Evaluating agents": a regression eval. Run the flight agent from A8 on a small test set,
// once as it is now and once as a "new version" that has quietly dropped one guardrail, and grade
// each run's end state. The new version passes most tasks; the eval shows which one it broke.

/** The guardrails the current version has; the new version drops one (or none). */
export const GUARDS = ['retry', 'limitOn', 'validate', 'onlyNeeded'] as const;
type Guard = (typeof GUARDS)[number];

/** The test set: each task injects one failure the agent must survive. */
export const CASES: [name: string, inject: Params][] = [
  ['normal booking', {}],
  ['flaky search', { flaky: true }],
  ['stuck booking', { stuck: true }],
  ['typo in passenger', { invented: true }],
  ['cancel tool offered', { wrongTool: true }],
];

export interface EvalInput {
  /** Order to run the cases in (indexes into CASES). */
  order: number[];
  /** The guardrail the new version drops, or null for none. */
  dropped: Guard | null;
}

const GUARD_LABEL: Record<Guard, string> = { retry: 'automatic retries', limitOn: 'the step limit', validate: 'argument checks', onlyNeeded: 'the tool allow-list' };

/** The grader checks the end state: right booking with nothing harmful, or an honest stop when booking can't work. */
export function passes(inject: Params, guards: Guard[]): boolean {
  const s = flight as unknown as Scenario<unknown>;
  const p: Params = { ...defaults(s.controls), ...inject, maxSteps: 8 };
  for (const g of guards) p[g] = true;
  const o = runAgent(s, p).outcome;
  if ((o.unsafe ?? 0) > 0) return false;
  return inject.stuck ? o.stopped === 1 && o.steps <= 8 : o.correct === 1;
}

const code = [
  'def run_evals(agent, tasks):',
  '    passed = 0',
  '    for task in tasks:',
  '        end = agent.run(task)',
  '        if task.grade(end):',
  '            passed += 1',
  '    return passed',
];

export const agentEvals: Program<EvalInput> = {
  id: 'agent-evals',
  code,
  defaultInput: { order: [0, 1, 2, 3, 4], dropped: 'validate' },
  randomInput: (r) => {
    const order = [0, 1, 2, 3, 4];
    for (let i = order.length - 1; i > 0; i--) {
      const j = randomInt(r, 0, i);
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    const pickIndex = randomInt(r, 0, GUARDS.length);
    return { order, dropped: pickIndex === GUARDS.length ? null : GUARDS[pickIndex]! };
  },
  describe: ({ dropped }) => `new version: ${dropped ? `drops ${GUARD_LABEL[dropped]}` : 'same guardrails'}`,
  reference: ({ order, dropped }) => {
    const now = [...GUARDS];
    const next = GUARDS.filter((g) => g !== dropped);
    return [order.filter((i) => passes(CASES[i]![1], now)).length, order.filter((i) => passes(CASES[i]![1], next)).length];
  },
  run({ order, dropped }) {
    const t = new Tracer();
    const now = [...GUARDS];
    const next = GUARDS.filter((g) => g !== dropped);
    const rows: Value[][] = [];
    let passedNow = 0;
    let passedNext = 0;
    const view = () => [{ type: 'table' as const, label: 'Regression eval: each task graded on its end state', columns: ['task', 'current', 'new'], rows, ...(rows.length ? { highlightRow: rows.length - 1 } : {}) }];
    t.step(null, `A team wants to ship a new, faster version of the flight agent: ${dropped ? `it drops ${GUARD_LABEL[dropped]}` : 'its guardrails are the same'}. Before shipping, run both versions on the test set and grade each run's end state, not its path.`, {}, view());
    let asked = 0;
    order.forEach((i, k) => {
      const [name, inject] = CASES[i]!;
      const a = passes(inject, now);
      const b = passes(inject, next);
      if (a) passedNow++;
      if (b) passedNext++;
      // Ask about the task that the dropped guardrail was there for, and one other.
      const ask =
        asked < 2 && (a !== b || k === 0)
          ? (asked++,
            predict(
              `Task "${name}": will the new version pass?`,
              b ? 'yes' : 'no',
              b ? (dropped ? `This task doesn't depend on ${GUARD_LABEL[dropped]}.` : 'Nothing changed.') : `This task needs ${GUARD_LABEL[dropped!]}, which the new version dropped.`,
              [{ value: b ? 'no' : 'yes', why: b ? 'The guardrail this task needs is still there.' : `Without ${GUARD_LABEL[dropped!]}, this failure gets through.` }],
              53 + k,
            ))
          : undefined;
      rows.push([name, a ? 'pass' : 'FAIL', b ? 'pass' : 'FAIL']);
      t.step(a && !b ? 5 : 6, `"${name}": current ${a ? 'passes' : 'fails'}, new ${b ? 'passes' : 'fails'}${a && !b ? ': a regression' : ''}.`, { task: name, passed: passedNext }, view(), ask);
    });
    const verdict = passedNext < passedNow ? `The new version passes ${passedNext} of ${order.length}: it would break something that works today. Don't ship it until that's fixed.` : `Both pass ${passedNow} of ${order.length}: no regression on this test set.`;
    t.step(7, verdict, { result: [passedNow, passedNext] }, view());
    return t.frames;
  },
};

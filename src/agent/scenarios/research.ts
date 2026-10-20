import { predict } from '../../trace/tools';
import type { Scenario } from '../types';

// A9 "Multi-agent systems": find the cheapest phone plan with 5G among four. One agent checks the
// plans one by one; a lead agent can hand them to workers who check in parallel, each with its
// own context. Parallel is faster but costs more tokens; without a clear split, workers repeat
// each other; too many workers cost tokens for nothing.

export const PLANS: [string, number, boolean][] = [
  ['Plan A', 399, false],
  ['Plan B', 499, true],
  ['Plan C', 449, true],
  ['Plan D', 599, true],
];
/** Illustrative tokens a worker spends on its own instructions and context before any work. */
export const WORKER_BASE = 60;
const CHECK_TOKENS = 12;

interface World {
  rounds: number;
  workerTokens: number;
  searches: number;
  covered: Set<string>;
}

const fact = ([name, price, fiveG]: [string, number, boolean]) => `${name}: ₹${price}, ${fiveG ? '5G' : 'no 5G'}`;

/** Which plans each worker checks: a distinct share each, or (no split) everyone starts from the top. */
export function assign(workers: number, split: boolean): number[][] {
  const per = Math.ceil(PLANS.length / workers);
  return Array.from({ length: workers }, (_, w) => (split ? PLANS.map((_, i) => i).filter((i) => i % workers === w) : PLANS.map((_, i) => i).slice(0, per)));
}

export function cheapest5G(facts: string): string {
  const best = PLANS.filter(([name, , g]) => g && facts.includes(`${name}:`)).sort((a, b) => a[1] - b[1])[0];
  return best ? best[0] : 'none found';
}

export const research: Scenario<World> = {
  id: 'research',
  task: 'Which of Plan A, B, C and D is the cheapest phone plan with 5G?',
  rules: [
    'With 1 worker: the agent checks each plan itself, one per turn.',
    'With more workers: the lead hands out the plans in one turn; workers check in parallel, each with its own context, and report back.',
    'Then it answers with the cheapest 5G plan it has facts for.',
  ],
  controls: [
    { kind: 'slider', id: 'workers', label: 'Workers', min: 1, max: 6, step: 1, value: 1 },
    { kind: 'toggle', id: 'split', label: 'Lead gives each worker different plans', value: true },
  ],
  metrics: [
    { id: 'correct', label: 'Right plan', format: 'count', better: 'high' },
    { id: 'rounds', label: 'Rounds of waiting (time)', format: 'count', better: 'low' },
    { id: 'tokens', label: 'Tokens, all agents (illustrative)', format: 'count', better: 'low' },
    { id: 'duplicated', label: 'Checks done twice', format: 'count', better: 'low' },
  ],
  tools: {
    check_plan: {
      describe: 'check_plan(name): price and whether it has 5G',
      run: (args, world) => {
        const p = PLANS.find(([name]) => name === args.name)!;
        world.searches++;
        world.covered.add(p[0]);
        return { ok: true, text: fact(p) };
      },
    },
    delegate: {
      describe: 'delegate(workers): hand the plans to workers, who check them in parallel',
      run: (args, world, params) => {
        const shares = assign(Number(args.workers), Boolean(params.split));
        const reports: string[] = [];
        for (const share of shares) {
          // Each worker starts with its own instructions, then checks its plans one by one.
          world.workerTokens += WORKER_BASE + share.length * CHECK_TOKENS;
          for (const i of share) {
            world.searches++;
            world.covered.add(PLANS[i]![0]);
            reports.push(fact(PLANS[i]!));
          }
        }
        // Workers run side by side: the wait is the longest share, not the total.
        world.rounds += Math.max(...shares.map((s) => s.length));
        return { ok: true, text: [...new Set(reports)].join('; ') || 'no reports' };
      },
    },
  },
  init: () => ({ rounds: 0, workerTokens: 0, searches: 0, covered: new Set() }),
  policy({ context }, params) {
    const facts = context.filter((e) => e.kind === 'result').map((e) => e.text).join('; ');
    const workers = Number(params.workers);
    if (workers > 1) {
      if (!context.some((e) => e.tool === 'delegate')) return { kind: 'call', call: { tool: 'delegate', args: { workers } }, why: `Rule 2: hand the plans to ${workers} workers.` };
      return { kind: 'answer', text: `${cheapest5G(facts)}.`, why: 'Rule 3: the workers have reported.' };
    }
    const next = PLANS.find(([name]) => !facts.includes(`${name}:`));
    if (next) return { kind: 'call', call: { tool: 'check_plan', args: { name: next[0] } }, why: 'Rule 1: check the next plan.' };
    return { kind: 'answer', text: `${cheapest5G(facts)}.`, why: 'Rule 3: every plan is checked.' };
  },
  grade: (answer) => answer === 'Plan C.',
  finish(state) {
    const w = state.world;
    // Each lead turn is a round of waiting too; the delegate turn's wait is the workers' time.
    state.outcome.rounds = state.outcome.steps + w.rounds - (w.rounds ? 1 : 0);
    state.outcome.tokens += w.workerTokens;
    state.outcome.duplicated = w.searches - w.covered.size;
  },
  predict(event, state, asked) {
    if (asked === 0 && event.kind === 'decision' && event.decision.kind === 'call' && event.decision.call.tool === 'delegate' && !state.params.split) {
      return predict(
        `The lead tells all ${String(state.params.workers)} workers "check the plans", without saying which. What happens?`,
        'They all check the same first plans',
        "Each starts from the top of the list, so they repeat each other's work and leave later plans unchecked (Anthropic saw duplicated work like this in its own multi-agent system).",
        [
          { value: 'They split the plans between them', why: 'Nobody told them how to split.' },
          { value: 'Each checks every plan', why: 'Each worker takes the share it expects to do, starting from the top.' },
        ],
        47,
      );
    }
    return undefined;
  },
};

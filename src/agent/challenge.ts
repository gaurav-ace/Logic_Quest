import type { AgentChallenge, AgentGoal } from '../lesson/schema';
import { defaults, type Params } from '../sim/types';
import { runAgent } from './runner';
import type { Outcome, Scenario } from './types';

/** Does one run's outcome meet a challenge goal? The app and the tests share this rule. */
export const meets = (g: AgentGoal, o: Outcome) => (g.op === '<=' ? (o[g.metric] ?? 0) <= g.value : (o[g.metric] ?? 0) >= g.value);

/** Does a challenge pass with its setup plus `extra` settings (its solution, or nothing)? */
export function challengePasses(scenario: Scenario<unknown>, lessonParams: Params | undefined, c: AgentChallenge, extra: Params): boolean {
  const outcome = runAgent(scenario, { ...defaults(scenario.controls), ...lessonParams, ...c.setup?.params, ...extra }).outcome;
  return c.goals.every((g) => meets(g, outcome));
}

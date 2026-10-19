import { weather } from './scenarios/weather';
import type { Scenario } from './types';

/** Every scenario an agent lesson can name. Each one's tests check what its lesson claims. */
export const SCENARIOS = [weather].map((s) => s as unknown as Scenario<unknown>);

const byId = new Map(SCENARIOS.map((s) => [s.id, s]));

export function getScenario(id: string): Scenario<unknown> | undefined {
  return byId.get(id);
}

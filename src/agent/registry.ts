import { moveMeeting } from './scenarios/move-meeting';
import { orderStatus } from './scenarios/order-status';
import { teamDinner } from './scenarios/team-dinner';
import { weather } from './scenarios/weather';
import type { Scenario } from './types';

/** Every scenario an agent lesson can name. Each one's tests check what its lesson claims. */
export const SCENARIOS = [orderStatus, weather, teamDinner, moveMeeting].map((s) => s as unknown as Scenario<unknown>);

const byId = new Map(SCENARIOS.map((s) => [s.id, s]));

export function getScenario(id: string): Scenario<unknown> | undefined {
  return byId.get(id);
}

import { findMax } from './programs/find-max';
import type { Program } from './types';

/** Every program a trace lesson can name. programs.test.ts checks each one against its reference. */
export const PROGRAMS: Program<never>[] = [findMax].map((p) => p as unknown as Program<never>);

const byId = new Map(PROGRAMS.map((p) => [p.id, p]));

export function getProgram(id: string): Program<unknown> | undefined {
  return byId.get(id) as Program<unknown> | undefined;
}

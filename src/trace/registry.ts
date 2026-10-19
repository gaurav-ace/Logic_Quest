import { edgeCases } from './programs/edge-cases';
import { estimate } from './programs/estimate';
import { fencePosts } from './programs/fence-posts';
import { findMax } from './programs/find-max';
import { invariant } from './programs/invariant';
import { sumOdds } from './programs/sum-odds';
import { workBackwards } from './programs/work-backwards';
import type { Program } from './types';

/** Every program a trace lesson can name. programs.test.ts checks each one against its reference. */
// Each program knows its own input type; callers only pass a program its own inputs back.
export const PROGRAMS = [findMax, sumOdds, fencePosts, edgeCases, invariant, workBackwards, estimate].map((p) => p as unknown as Program<unknown>);

const byId = new Map(PROGRAMS.map((p) => [p.id, p]));

export function getProgram(id: string): Program<unknown> | undefined {
  return byId.get(id);
}

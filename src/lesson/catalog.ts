import agentLoop from '../../lessons/agent-loop.json';
import cache from '../../lessons/cache.json';
import dryRun from '../../lessons/dry-run.json';
import hello from '../../lessons/hello.json';
import loadBalancer from '../../lessons/load-balancer.json';
import breakItDown from '../../lessons/break-it-down.json';
import spotPattern from '../../lessons/spot-pattern.json';
import loopsLimits from '../../lessons/loops-limits.json';
import edgeCasesLesson from '../../lessons/edge-cases.json';
import invariants from '../../lessons/invariants.json';
import workBackwards from '../../lessons/work-backwards.json';
import estimate from '../../lessons/estimate.json';
import { getProgram } from '../trace/registry';
import type { Lesson } from './schema';
import { validateLesson } from './validate';

/** Lesson order on the home screen. Every file in lessons/ must be listed (catalog.test.ts checks). */
export const LESSON_DATA: unknown[] = [
  hello,
  // Logic foundations (Phase 3), in curriculum order
  breakItDown,
  spotPattern,
  dryRun,
  loopsLimits,
  edgeCasesLesson,
  invariants,
  workBackwards,
  estimate,
  // System design and agentic AI
  loadBalancer,
  cache,
  agentLoop,
];

/** Validates every lesson up front, so bad data fails at load time, not mid-lesson. */
export function loadCatalog(data: unknown[] = LESSON_DATA, hasProgram: (id: string) => boolean = (id) => !!getProgram(id)): Lesson[] {
  const lessons = data.map(validateLesson);
  const byId = new Map<string, Lesson>();
  for (const l of lessons) {
    if (byId.has(l.id)) throw new Error(`Two lessons share the id "${l.id}"`);
    byId.set(l.id, l);
  }
  for (const l of lessons) {
    if (l.kind === 'trace' && !hasProgram(l.program)) throw new Error(`Lesson "${l.id}" names unknown program "${l.program}"`);
    for (const r of l.requires ?? []) if (!byId.has(r)) throw new Error(`Lesson "${l.id}" requires unknown lesson "${r}"`);
  }
  // A cycle of requirements would lock every lesson in it forever.
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (id: string, path: string[]): void => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'visiting') throw new Error(`Lessons require each other in a loop: ${[...path, id].join(' -> ')}`);
    state.set(id, 'visiting');
    for (const r of byId.get(id)!.requires ?? []) visit(r, [...path, id]);
    state.set(id, 'done');
  };
  for (const l of lessons) visit(l.id, []);
  return lessons;
}

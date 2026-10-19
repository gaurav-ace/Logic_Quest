import agentLoop from '../../lessons/agent-loop.json';
import cache from '../../lessons/cache.json';
import hello from '../../lessons/hello.json';
import loadBalancer from '../../lessons/load-balancer.json';
import type { Lesson } from './schema';
import { validateLesson } from './validate';

/** Lesson order on the home screen. Every file in lessons/ must be listed (catalog.test.ts checks). */
export const LESSON_DATA: unknown[] = [hello, loadBalancer, cache, agentLoop];

/** Validates every lesson up front, so bad data fails at load time, not mid-lesson. */
export function loadCatalog(data: unknown[] = LESSON_DATA): Lesson[] {
  const lessons = data.map(validateLesson);
  const seen = new Set<string>();
  for (const l of lessons) {
    if (seen.has(l.id)) throw new Error(`Two lessons share the id "${l.id}"`);
    seen.add(l.id);
  }
  return lessons;
}

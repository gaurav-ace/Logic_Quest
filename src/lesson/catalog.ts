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
import bigOCountingLesson from '../../lessons/big-o-counting.json';
import timeVsSpaceLesson from '../../lessons/time-vs-space.json';
import arraysLesson from '../../lessons/arrays.json';
import twoPointersLesson from '../../lessons/two-pointers.json';
import slidingWindowLesson from '../../lessons/sliding-window.json';
import prefixSumsLesson from '../../lessons/prefix-sums.json';
import linkedListsLesson from '../../lessons/linked-lists.json';
import fastSlowPointersLesson from '../../lessons/fast-slow-pointers.json';
import stacksLesson from '../../lessons/stacks.json';
import monotonicStackLesson from '../../lessons/monotonic-stack.json';
import queuesDequesLesson from '../../lessons/queues-deques.json';
import hashMapsLesson from '../../lessons/hash-maps.json';
import countingGroupingLesson from '../../lessons/counting-grouping.json';
import binarySearchLesson from '../../lessons/binary-search.json';
import searchTheAnswerLesson from '../../lessons/search-the-answer.json';
import simpleSortsLesson from '../../lessons/simple-sorts.json';
import mergeSortLesson from '../../lessons/merge-sort.json';
import quickSortLesson from '../../lessons/quick-sort.json';
import heapsLesson from '../../lessons/heaps.json';
import recursionLesson from '../../lessons/recursion.json';
import backtrackingLesson from '../../lessons/backtracking.json';
import treeTraversalsLesson from '../../lessons/tree-traversals.json';
import binarySearchTreesLesson from '../../lessons/binary-search-trees.json';
import triesLesson from '../../lessons/tries.json';
import bfsLesson from '../../lessons/bfs.json';
import dfsIslandsLesson from '../../lessons/dfs-islands.json';
import topologicalSortLesson from '../../lessons/topological-sort.json';
import dijkstraLesson from '../../lessons/dijkstra.json';
import unionFindLesson from '../../lessons/union-find.json';
import dynamicProgrammingLesson from '../../lessons/dynamic-programming.json';
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
  // Data structures and algorithms (Phase 4), in curriculum order
  bigOCountingLesson,
  timeVsSpaceLesson,
  arraysLesson,
  twoPointersLesson,
  slidingWindowLesson,
  prefixSumsLesson,
  linkedListsLesson,
  fastSlowPointersLesson,
  stacksLesson,
  monotonicStackLesson,
  queuesDequesLesson,
  hashMapsLesson,
  countingGroupingLesson,
  binarySearchLesson,
  searchTheAnswerLesson,
  simpleSortsLesson,
  mergeSortLesson,
  quickSortLesson,
  heapsLesson,
  recursionLesson,
  backtrackingLesson,
  treeTraversalsLesson,
  binarySearchTreesLesson,
  triesLesson,
  bfsLesson,
  dfsIslandsLesson,
  topologicalSortLesson,
  dijkstraLesson,
  unionFindLesson,
  dynamicProgrammingLesson,
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

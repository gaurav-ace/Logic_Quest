import agentLoop from '../../lessons/agent-loop.json';
import agentLoopLimitsLesson from '../../lessons/agent-loop-limits.json';
import promptTextOutLesson from '../../lessons/prompt-text-out.json';
import toolUseLesson from '../../lessons/tool-use.json';
import agentMemoryLesson from '../../lessons/agent-memory.json';
import agentPlanningLesson from '../../lessons/agent-planning.json';
import cache from '../../lessons/cache.json';
import dryRun from '../../lessons/dry-run.json';
import hello from '../../lessons/hello.json';
import loadBalancer from '../../lessons/load-balancer.json';
import loadBalancingSim from '../../lessons/load-balancing-sim.json';
import requestJourney from '../../lessons/request-journey.json';
import scaling from '../../lessons/scaling.json';
import cachingSim from '../../lessons/caching-sim.json';
import cdnLesson from '../../lessons/cdn.json';
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
import sqlVsNosqlLesson from '../../lessons/sql-vs-nosql.json';
import indexesLesson from '../../lessons/indexes.json';
import replicationLesson from '../../lessons/replication.json';
import shardingLesson from '../../lessons/sharding.json';
import consistentHashingLesson from '../../lessons/consistent-hashing.json';
import messageQueuesLesson from '../../lessons/message-queues.json';
import rateLimitingLesson from '../../lessons/rate-limiting.json';
import capConsistencyLesson from '../../lessons/cap-consistency.json';
import idempotencyLesson from '../../lessons/idempotency.json';
import designUrlShortenerLesson from '../../lessons/design-url-shortener.json';
import designAiChatLesson from '../../lessons/design-ai-chat.json';
import objectsAndResponsibilitiesLesson from '../../lessons/objects-and-responsibilities.json';
import encapsulationLesson from '../../lessons/encapsulation.json';
import interfacesPolymorphismLesson from '../../lessons/interfaces-polymorphism.json';
import compositionInheritanceLesson from '../../lessons/composition-inheritance.json';
import solid1Lesson from '../../lessons/solid-1.json';
import solid2Lesson from '../../lessons/solid-2.json';
import strategyFactoryLesson from '../../lessons/strategy-factory.json';
import observerLesson from '../../lessons/observer.json';
import decoratorAdapterLesson from '../../lessons/decorator-adapter.json';
import stateMachinesLesson from '../../lessons/state-machines.json';
import designParkingLotLesson from '../../lessons/design-parking-lot.json';
import designLruCacheLesson from '../../lessons/design-lru-cache.json';
import designRateLimiterLesson from '../../lessons/design-rate-limiter.json';
import designAgentClassesLesson from '../../lessons/design-agent-classes.json';
import casePaymentGatewayLesson from '../../lessons/case-payment-gateway.json';
import caseFoodDeliveryLesson from '../../lessons/case-food-delivery.json';
import caseRideHailingLesson from '../../lessons/case-ride-hailing.json';
import caseTrainBookingLesson from '../../lessons/case-train-booking.json';
import caseChatLesson from '../../lessons/case-chat.json';
import caseVideoStreamingLesson from '../../lessons/case-video-streaming.json';
import caseNewsFeedLesson from '../../lessons/case-news-feed.json';
import caseFlashSaleLesson from '../../lessons/case-flash-sale.json';
import caseNotificationsLesson from '../../lessons/case-notifications.json';
import caseAutocompleteLesson from '../../lessons/case-autocomplete.json';
import caseUniqueIdsLesson from '../../lessons/case-unique-ids.json';
import caseCollabEditingLesson from '../../lessons/case-collab-editing.json';
import incidentMetaLesson from '../../lessons/incident-meta-2021.json';
import incidentCloudflareLesson from '../../lessons/incident-cloudflare-2019.json';
import incidentS3Lesson from '../../lessons/incident-s3-2017.json';
import incidentGithubLesson from '../../lessons/incident-github-2018.json';
import incidentSlackLesson from '../../lessons/incident-slack-2021.json';
import articleDiscordMessagesLesson from '../../lessons/article-discord-messages.json';
import articleStripeRetriesLesson from '../../lessons/article-stripe-retries.json';
import articleUberH3Lesson from '../../lessons/article-uber-h3.json';
import capstoneDesignReviewLesson from '../../lessons/capstone-design-review.json';
import { getScenario } from '../agent/registry';
import { getModel } from '../sim/registry';
import { getProgram } from '../trace/registry';
import type { AgentLesson, Lesson, SimLesson } from './schema';
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
  requestJourney,
  loadBalancer,
  scaling,
  loadBalancingSim,
  cache,
  cachingSim,
  cdnLesson,
  sqlVsNosqlLesson,
  indexesLesson,
  replicationLesson,
  shardingLesson,
  consistentHashingLesson,
  messageQueuesLesson,
  rateLimitingLesson,
  capConsistencyLesson,
  idempotencyLesson,
  designUrlShortenerLesson,
  designAiChatLesson,
  objectsAndResponsibilitiesLesson,
  encapsulationLesson,
  interfacesPolymorphismLesson,
  compositionInheritanceLesson,
  solid1Lesson,
  solid2Lesson,
  strategyFactoryLesson,
  observerLesson,
  decoratorAdapterLesson,
  stateMachinesLesson,
  designParkingLotLesson,
  designLruCacheLesson,
  designRateLimiterLesson,
  designAgentClassesLesson,
  casePaymentGatewayLesson,
  caseFoodDeliveryLesson,
  caseRideHailingLesson,
  caseTrainBookingLesson,
  caseChatLesson,
  caseVideoStreamingLesson,
  caseNewsFeedLesson,
  caseFlashSaleLesson,
  caseNotificationsLesson,
  caseAutocompleteLesson,
  caseUniqueIdsLesson,
  caseCollabEditingLesson,
  incidentMetaLesson,
  incidentCloudflareLesson,
  incidentS3Lesson,
  incidentGithubLesson,
  incidentSlackLesson,
  articleDiscordMessagesLesson,
  articleStripeRetriesLesson,
  articleUberH3Lesson,
  capstoneDesignReviewLesson,
  agentLoop,
  promptTextOutLesson,
  toolUseLesson,
  agentLoopLimitsLesson,
  agentMemoryLesson,
  agentPlanningLesson,
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
    if (l.kind === 'sim') checkSimAgainstModel(l);
    if (l.kind === 'agent') checkAgentAgainstScenario(l);
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

/** A sim lesson may only name controls, actions and metrics its model really has. */
function checkSimAgainstModel(l: SimLesson): void {
  const model = getModel(l.model);
  if (!model) throw new Error(`Lesson "${l.id}" names unknown model "${l.model}"`);
  const settings = new Set(model.controls.filter((c) => c.kind !== 'action').map((c) => c.id));
  const actions = new Set(model.controls.filter((c) => c.kind === 'action').map((c) => c.id));
  const metrics = new Set(model.metrics.map((m) => m.id));
  const fail = (msg: string) => {
    throw new Error(`Lesson "${l.id}": ${msg}`);
  };
  for (const k of Object.keys(l.params ?? {})) if (!settings.has(k)) fail(`params names unknown control "${k}"`);
  for (const c of l.challenges) {
    if (!metrics.has(c.goal.metric)) fail(`challenge "${c.id}" goal uses unknown metric "${c.goal.metric}"`);
    for (const k of [...Object.keys(c.setup?.params ?? {}), ...(c.setup?.lock ?? []), ...Object.keys(c.solution)]) {
      if (!settings.has(k)) fail(`challenge "${c.id}" names unknown control "${k}"`);
    }
    for (const a of c.setup?.actions ?? []) if (!actions.has(a.action)) fail(`challenge "${c.id}" names unknown action "${a.action}"`);
  }
}

/** An agent lesson may only name settings its scenario has, and goals on numbers a run reports. */
function checkAgentAgainstScenario(l: AgentLesson): void {
  const scenario = getScenario(l.scenario);
  if (!scenario) throw new Error(`Lesson "${l.id}" names unknown scenario "${l.scenario}"`);
  const settings = new Set(scenario.controls.filter((c) => c.kind !== 'action').map((c) => c.id));
  const metrics = new Set(scenario.metrics.map((m) => m.id));
  const fail = (msg: string) => {
    throw new Error(`Lesson "${l.id}": ${msg}`);
  };
  for (const k of Object.keys(l.params ?? {})) if (!settings.has(k)) fail(`params names unknown control "${k}"`);
  for (const c of l.challenges) {
    for (const g of c.goals) if (!metrics.has(g.metric)) fail(`challenge "${c.id}" goal uses unknown metric "${g.metric}"`);
    for (const k of [...Object.keys(c.setup?.params ?? {}), ...(c.setup?.lock ?? []), ...Object.keys(c.solution)]) {
      if (!settings.has(k)) fail(`challenge "${c.id}" names unknown control "${k}"`);
    }
  }
}

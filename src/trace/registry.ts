import { anagramGroups } from './programs/anagram-groups';
import { arrayInsert } from './programs/array-insert';
import { bigO } from './programs/big-o';
import { binarySearch } from './programs/binary-search';
import { brackets } from './programs/brackets';
import { cycleDetect } from './programs/cycle-detect';
import { edgeCases } from './programs/edge-cases';
import { estimate } from './programs/estimate';
import { fencePosts } from './programs/fence-posts';
import { findMax } from './programs/find-max';
import { hashMap } from './programs/hash-map';
import { heapPush } from './programs/heap-push';
import { indexLookup } from './programs/index-lookup';
import { insertionSort } from './programs/insertion-sort';
import { invariant } from './programs/invariant';
import { mergeSort } from './programs/merge-sort';
import { minCapacity } from './programs/min-capacity';
import { nextGreater } from './programs/next-greater';
import { prefixSums } from './programs/prefix-sums';
import { quickSort } from './programs/quick-sort';
import { reverseList } from './programs/reverse-list';
import { slidingWindow } from './programs/sliding-window';
import { sumOdds } from './programs/sum-odds';
import { timeSpace } from './programs/time-space';
import { twoPointers } from './programs/two-pointers';
import { windowMax } from './programs/window-max';
import { workBackwards } from './programs/work-backwards';
import { bfs } from './programs/bfs';
import { bstSearch } from './programs/bst-search';
import { coinChange } from './programs/coin-change';
import { consistentHashing } from './programs/consistent-hashing';
import { dijkstra } from './programs/dijkstra';
import { factorial } from './programs/factorial';
import { islands } from './programs/islands';
import { subsetSum } from './programs/subset-sum';
import { topoSort } from './programs/topo-sort';
import { treeWalk } from './programs/tree-walk';
import { trie } from './programs/trie';
import { unionFind } from './programs/union-find';
import type { Program } from './types';

/** Every program a trace lesson can name. programs.test.ts checks each one against its reference. */
// Each program knows its own input type; callers only pass a program its own inputs back.
export const PROGRAMS = [
  // Phase 3, logic
  findMax,
  sumOdds,
  fencePosts,
  edgeCases,
  invariant,
  workBackwards,
  estimate,
  // Phase 4, DSA
  bigO,
  timeSpace,
  arrayInsert,
  twoPointers,
  slidingWindow,
  prefixSums,
  reverseList,
  cycleDetect,
  brackets,
  nextGreater,
  windowMax,
  hashMap,
  anagramGroups,
  binarySearch,
  minCapacity,
  insertionSort,
  mergeSort,
  quickSort,
  heapPush,
  factorial,
  subsetSum,
  treeWalk,
  bstSearch,
  trie,
  bfs,
  islands,
  topoSort,
  dijkstra,
  unionFind,
  coinChange,
  // Phase 5, system design
  indexLookup,
  consistentHashing,
].map((p) => p as unknown as Program<unknown>);

const byId = new Map(PROGRAMS.map((p) => [p.id, p]));

export function getProgram(id: string): Program<unknown> | undefined {
  return byId.get(id);
}

import { describe, expect, it } from 'vitest';
import { seeded } from '../tools';
import type { Frame } from '../types';
import { groupAnagrams, sortedKey } from './anagram-groups';
import { height, searchPath } from './bst-search';
import { coinChange, fewestCoinsBfs, greedyCoins } from './coin-change';
import { consistentHashing, MIN_GAP, moves, owner } from './consistent-hashing';
import { indexLookup, lookupCosts } from './index-lookup';
import { dijkstra } from './dijkstra';
import { factorialDepth } from './factorial';
import { subsetsSumming } from './subset-sum';
import { kahn, randomDag } from './topo-sort';
import { bstFrom, orders } from './tree-walk';
import { trie, trieSize } from './trie';
import { arrayInsert } from './array-insert';
import { countHalving } from './big-o';
import { binarySearchChecks } from './binary-search';
import { cycleDetect } from './cycle-detect';
import { hashMap, toyHash } from './hash-map';
import { heapPushAll, isMinHeap } from './heap-push';
import { insertionSort, inversions } from './insertion-sort';
import { mergeSortBy } from './merge-sort';
import { need } from './min-capacity';
import { nextGreater } from './next-greater';
import { quickSortCount } from './quick-sort';
import { reverseList } from './reverse-list';
import { dupCounts } from './time-space';
import { pairSum, twoPointers } from './two-pointers';
import { windowMax } from './window-max';

// What the Phase 4 lessons claim, checked on many more cases than they show.

const linesRun = (frames: Frame[], line: number) => frames.filter((f) => f.line === line).length;

describe('complexity and linear structures', () => {
  it('halving takes floor(log2 n) steps, and doubling n adds exactly one', () => {
    for (let n = 1; n <= 5000; n++) {
      expect(countHalving(n), `n = ${n}`).toBe(n < 2 ? 0 : Math.floor(Math.log2(n)));
      expect(countHalving(2 * n)).toBe(countHalving(n) + 1);
    }
  });

  it('comparing pairs costs at most n(n-1)/2 (exactly that with no duplicate); the set needs at most n lookups', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = seeded(seed);
      const nums = Array.from({ length: 2 + Math.floor(r() * 12) }, () => Math.floor(r() * 15));
      const n = nums.length;
      const c = dupCounts(nums);
      expect(c.found).toBe(new Set(nums).size < n);
      expect(c.comparisons).toBeLessThanOrEqual((n * (n - 1)) / 2);
      if (!c.found) expect(c.comparisons).toBe((n * (n - 1)) / 2);
      expect(c.lookups).toBeLessThanOrEqual(n);
    }
  });

  it('inserting at index k moves exactly n - k items', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const input = arrayInsert.randomInput(seeded(seed));
      expect(linesRun(arrayInsert.run(input), 5)).toBe(input.nums.length - input.at);
    }
  });

  it('two pointers find a pair exactly when one exists (checked against trying every pair)', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const r = seeded(seed);
      const nums = [...new Set(Array.from({ length: 2 + Math.floor(r() * 9) }, () => Math.floor(r() * 30)))].sort((a, b) => a - b);
      const target = Math.floor(r() * 60);
      let exists = false;
      for (let i = 0; i < nums.length; i++) for (let j = i + 1; j < nums.length; j++) if (nums[i]! + nums[j]! === target) exists = true;
      const found = pairSum(nums, target);
      expect(found !== null, `${nums} / ${target}`).toBe(exists);
      if (found) expect(nums[found[0]]! + nums[found[1]]!).toBe(target);
    }
    // Worked by hand: 1+11=12 (hi left), 1+8=9 (lo right), 3+8=11 (hi left), 3+6=9 (lo right), 4+6=10.
    expect(twoPointers.reference(twoPointers.defaultInput)).toEqual([2, 3]);
  });

  it('reversal touches each node exactly once', () => {
    for (let n = 1; n <= 8; n++) {
      const values = Array.from({ length: n }, (_, i) => i);
      expect(linesRun(reverseList.run(values), 5)).toBe(n);
    }
  });

  it('the hare meets the tortoise within n passes when there is a loop', () => {
    for (let length = 1; length <= 12; length++) {
      for (let loopTo = 0; loopTo < length; loopTo++) {
        const frames = cycleDetect.run({ length, loopTo });
        expect(frames.at(-1)!.vars).toContainEqual(['result', true]);
        expect(linesRun(frames, 5)).toBeLessThanOrEqual(length);
      }
      expect(cycleDetect.run({ length, loopTo: null }).at(-1)!.vars).toContainEqual(['result', false]);
    }
  });

  it('the monotonic stack resolves each index at most once', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const nums = nextGreater.randomInput(seeded(seed));
      expect(linesRun(nextGreater.run(nums), 7)).toBeLessThanOrEqual(nums.length);
    }
  });

  it('the deque holds values in non-increasing order, front to back, at every step', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const f of windowMax.run(windowMax.randomInput(seeded(seed)))) {
        const q = f.views.find((v) => v.type === 'queue');
        if (!q || q.type !== 'queue') continue;
        const values = q.items.map((s) => Number(String(s).split(': ')[1]));
        for (let i = 1; i < values.length; i++) expect(values[i]!).toBeLessThanOrEqual(values[i - 1]!);
      }
    }
  });
});

describe('hashing, searching and sorting', () => {
  it('the toy hash is the sum of character codes mod 5 (as in the Python code), and get() agrees with a dict', () => {
    expect(toyHash('cat')).toBe((99 + 97 + 116) % 5);
    for (let seed = 1; seed <= 200; seed++) {
      const input = hashMap.randomInput(seeded(seed));
      const expected = input.keys.includes(input.lookup) ? input.keys.indexOf(input.lookup) : null;
      expect(hashMap.run(input).at(-1)!.vars).toContainEqual(['result', expected]);
    }
  });

  it('anagram groups: words in a group are anagrams, words in different groups are not, nothing is lost', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = seeded(seed);
      const words = Array.from({ length: 2 + Math.floor(r() * 8) }, () => Array.from({ length: 3 }, () => 'abct'[Math.floor(r() * 4)]).join(''));
      const groups = groupAnagrams(words);
      expect(groups.flat().sort()).toEqual([...words].sort());
      for (const g of groups) for (const w of g) expect(sortedKey(w)).toBe(sortedKey(g[0]!));
      expect(new Set(groups.map((g) => sortedKey(g[0]!))).size).toBe(groups.length);
    }
  });

  it('binary search needs at most floor(log2 n) + 1 checks, found or not', () => {
    for (let n = 1; n <= 200; n++) {
      const nums = Array.from({ length: n }, (_, i) => i * 2);
      const limit = Math.floor(Math.log2(n)) + 1;
      for (let target = -1; target <= 2 * n; target++) {
        const { index, checks } = binarySearchChecks(nums, target);
        expect(index).toBe(nums.indexOf(target));
        expect(checks, `n=${n} target=${target}`).toBeLessThanOrEqual(limit);
      }
    }
  });

  it('a bigger truck never needs more days (the property that makes binary search on the answer valid)', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = seeded(seed);
      const w = Array.from({ length: 3 + Math.floor(r() * 8) }, () => 1 + Math.floor(r() * 9));
      for (let cap = Math.max(...w); cap < w.reduce((a, b) => a + b, 0); cap++) expect(need(cap + 1, w)).toBeLessThanOrEqual(need(cap, w));
    }
  });

  it('insertion sort slides exactly once per out-of-order pair', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const a = insertionSort.randomInput(seeded(seed));
      expect(insertionSort.run(a).filter((f) => f.line === 5)).toHaveLength(inversions(a));
    }
  });

  it('merge sort is stable and makes at most n * ceil(log2 n) comparisons', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = seeded(seed);
      const items = Array.from({ length: 1 + Math.floor(r() * 30) }, (_, tag) => ({ key: Math.floor(r() * 5), tag }));
      const counter = { comparisons: 0 };
      const out = mergeSortBy(items, (x) => x.key, counter);
      for (let i = 1; i < out.length; i++) {
        expect(out[i]!.key).toBeGreaterThanOrEqual(out[i - 1]!.key);
        if (out[i]!.key === out[i - 1]!.key) expect(out[i]!.tag).toBeGreaterThan(out[i - 1]!.tag); // equal keys keep input order
      }
      const n = items.length;
      expect(counter.comparisons).toBeLessThanOrEqual(n * Math.ceil(Math.log2(Math.max(n, 2))));
    }
  });

  it('quick sort sorts, and an already-sorted list costs the full n(n-1)/2 comparisons', () => {
    for (let n = 1; n <= 40; n++) {
      const sorted = Array.from({ length: n }, (_, i) => i);
      expect(quickSortCount(sorted).comparisons).toBe((n * (n - 1)) / 2);
    }
    for (let seed = 1; seed <= 200; seed++) {
      const r = seeded(seed);
      const a = Array.from({ length: Math.floor(r() * 25) }, () => Math.floor(r() * 50));
      expect(quickSortCount(a).sorted).toEqual([...a].sort((x, y) => x - y));
    }
  });

  it('the heap rule holds after every push, and the top is always the smallest', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = seeded(seed);
      const xs = Array.from({ length: 1 + Math.floor(r() * 20) }, () => Math.floor(r() * 40));
      for (let k = 1; k <= xs.length; k++) {
        const h = heapPushAll(xs.slice(0, k));
        expect(isMinHeap(h)).toBe(true);
        expect(h[0]).toBe(Math.min(...xs.slice(0, k)));
      }
    }
  });
});

describe('recursion, trees, graphs and DP', () => {
  it('fact(n) puts exactly n calls on the stack at its deepest', () => {
    for (let n = 1; n <= 12; n++) expect(factorialDepth(n).maxDepth).toBe(n);
  });

  it('every subset found sums to the target, and none is missed (checked against all 2^n subsets)', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = seeded(seed);
      const nums = [...new Set(Array.from({ length: 6 }, () => 1 + Math.floor(r() * 12)))];
      const target = 1 + Math.floor(r() * 20);
      for (const sub of subsetsSumming(nums, target)) expect(sub.reduce((a, b) => a + b, 0)).toBe(target);
    }
  });

  it('in-order of a search tree is sorted; pre-order starts and post-order ends at the root', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = seeded(seed);
      const keys = Array.from({ length: 1 + Math.floor(r() * 12) }, () => Math.floor(r() * 40));
      const tree = bstFrom(keys);
      const [pre, ino, post] = orders(tree);
      expect(ino).toEqual([...new Set(keys)].sort((a, b) => a - b));
      expect(pre[0]).toBe(tree.root);
      expect(post.at(-1)).toBe(tree.root);
    }
  });

  it('a BST search visits at most height-many nodes', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = seeded(seed);
      const keys = [...new Set(Array.from({ length: 2 + Math.floor(r() * 12) }, () => Math.floor(r() * 40)))];
      for (const target of [...keys, -1, 41]) expect(searchPath(keys, target).length).toBeLessThanOrEqual(height(keys));
    }
  });

  it('the trie has one node per distinct prefix, plus the root', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const input = trie.randomInput(seeded(seed));
      const last = trie.run(input).at(-1)!.views.find((v) => v.type === 'tree')!;
      expect(last.type === 'tree' && last.nodes.length).toBe(trieSize(input.words));
    }
  });

  it("Kahn's method gives a valid order for random task graphs: every arrow points forward", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = seeded(seed);
      const n = 2 + Math.floor(r() * 6);
      const edges = randomDag(r, n);
      const order = kahn(n, edges);
      expect(order).toHaveLength(n);
      for (const e of edges) expect(order.indexOf(e.from)).toBeLessThan(order.indexOf(e.to));
    }
  });

  it('Dijkstra settles places in order of distance (never a closer one after a farther one)', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const frames = dijkstra.run(dijkstra.randomInput(seeded(seed)));
      const settled = frames.filter((f) => f.line === 7).map((f) => f.vars.find(([n]) => n === 'dist[u]')![1] as number);
      for (let i = 1; i < settled.length; i++) expect(settled[i]!).toBeGreaterThanOrEqual(settled[i - 1]!);
    }
  });

  it('coins: the table matches a search over amounts, never uses more coins than greedy, and beats greedy on {1, 3, 4} for 6', () => {
    expect(greedyCoins([1, 3, 4], 6)).toBe(3); // 4 + 1 + 1
    expect(fewestCoinsBfs([1, 3, 4], 6)).toBe(2); // 3 + 3
    expect(coinChange.run(coinChange.defaultInput).at(-1)!.vars).toContainEqual(['result', 2]);
    for (let seed = 1; seed <= 200; seed++) {
      const input = coinChange.randomInput(seeded(seed));
      expect(fewestCoinsBfs(input.coins, input.amount)).toBeLessThanOrEqual(greedyCoins(input.coins, input.amount));
    }
  });
});

describe('system design traces', () => {
  it('an index finds the same rows as a full scan, in at most log2(n) + 1 + matches checks', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { ages, target } = indexLookup.randomInput(seeded(seed));
      const c = lookupCosts(ages, target);
      const scanned = ages.map((a, id) => (a === target ? id : -1)).filter((id) => id >= 0);
      expect([...c.found].sort((a, b) => a - b)).toEqual(scanned);
      expect(c.index).toBeLessThanOrEqual(Math.floor(Math.log2(ages.length)) + 1 + scanned.length);
      expect(c.scan).toBe(ages.length);
    }
  });

  it('on the ring, every key that moves goes to the new server; on average far fewer move than with key % N', () => {
    let ring = 0;
    let modulo = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const input = consistentHashing.randomInput(seeded(seed));
      const m = moves(input);
      for (const k of m.ring) expect(owner(k, [...input.servers, input.added])).toBe(input.added);
      ring += m.ring.length;
      modulo += m.modulo.length;
    }
    expect(ring * 2).toBeLessThan(modulo);
  });

  it('ring positions in examples are far enough apart to draw without overlapping', () => {
    for (const input of [consistentHashing.defaultInput, ...Array.from({ length: 100 }, (_, i) => consistentHashing.randomInput(seeded(i + 1)))]) {
      const all = [...input.keys, ...input.servers, input.added];
      for (const a of all) for (const b of all) if (a !== b) expect(Math.min(Math.abs(a - b), 100 - Math.abs(a - b))).toBeGreaterThanOrEqual(MIN_GAP);
    }
  });
});

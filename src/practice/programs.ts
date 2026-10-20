import { randomInt, randomList, show } from '../trace/tools';

// "Debug it" items show Python, and the app runs a TypeScript copy of the buggy and the fixed
// version to compute what each one gives (CLAUDE.md section 5.6: computed, never hand-scripted).
// Each copy follows the Python line by line, including Python's own behaviour where it matters
// (floor division, list.remove, a for loop over a list that is changing). programs.test.ts checks
// every fixed version against an independent reference on random inputs, and that every item's
// predict answer is exactly what its buggy version gives.

export interface DebugProgram {
  /** What the buggy code gives for this input, as Python would print it (or the error it raises). */
  buggy(input: unknown): string;
  fixed(input: unknown): string;
  /** Another input to try ("Try another input"), from seeded random numbers. */
  random(rand: () => number): unknown;
  /** The input as the learner sees it, in Python syntax. */
  show(input: unknown): string;
}

/** A loop that would never end in Python is cut off here and reported as such. */
export const STEP_LIMIT = 10_000;
export const NEVER_ENDS = 'never finishes (the loop runs forever)';

const pyList = (xs: unknown[]) => show(xs as never);
const pyStr = (s: string) => `'${s}'`;

/** Python's `a // b` for integers: rounds down, not towards zero. */
export const floorDiv = (a: number, b: number) => Math.floor(a / b);

type Args = [number[], number];

export const PROGRAMS: Record<string, DebugProgram> = {
  // posts(length, gap): fence posts along a fence, one every `gap` metres, both ends included.
  'fence-posts': {
    buggy: (i) => {
      const [length, gap] = i as [number, number];
      return String(floorDiv(length, gap));
    },
    fixed: (i) => {
      const [length, gap] = i as [number, number];
      return String(floorDiv(length, gap) + 1);
    },
    random: (r) => {
      const gap = randomInt(r, 1, 5);
      return [gap * randomInt(r, 1, 8), gap];
    },
    show: (i) => `posts(${(i as number[]).join(', ')})`,
  },

  // contains(xs, target) with range(len(xs) - 1): the last item is never looked at.
  'contains-last': {
    buggy: (i) => {
      const [xs, target] = i as Args;
      for (let k = 0; k < xs.length - 1; k++) if (xs[k] === target) return 'True';
      return 'False';
    },
    fixed: (i) => {
      const [xs, target] = i as Args;
      for (let k = 0; k < xs.length; k++) if (xs[k] === target) return 'True';
      return 'False';
    },
    random: (r) => {
      const xs = randomList(r, randomInt(r, 0, 6), 1, 9);
      return [xs, randomInt(r, 1, 9)];
    },
    show: (i) => `contains(${pyList((i as Args)[0])}, ${(i as Args)[1]})`,
  },

  // remove_evens(xs): `for x in xs: if x % 2 == 0: xs.remove(x)`. Python's list iterator walks
  // an index over the live list, so removing an item makes the next one get skipped.
  'remove-while-looping': {
    buggy: (i) => {
      const xs = [...(i as number[])];
      for (let k = 0; k < xs.length; k++) {
        const x = xs[k]!;
        if (x % 2 === 0) xs.splice(xs.indexOf(x), 1); // list.remove: first equal item
      }
      return pyList(xs);
    },
    fixed: (i) => pyList((i as number[]).filter((x) => x % 2 !== 0)),
    random: (r) => randomList(r, randomInt(r, 0, 7), 1, 9),
    show: (i) => `remove_evens(${pyList(i as number[])})`,
  },

  // search(xs, target) with `lo = mid` instead of `lo = mid + 1`: stuck when lo and hi are next
  // to each other and the target is to the right.
  'binary-search-stuck': {
    buggy: (i) => binarySearch(i as Args, false),
    fixed: (i) => binarySearch(i as Args, true),
    random: (r) => {
      const xs = [...new Set(randomList(r, randomInt(r, 1, 8), 1, 30))].sort((a, b) => a - b);
      return [xs, r() < 0.7 ? xs[randomInt(r, 0, xs.length - 1)]! : randomInt(r, 1, 30)];
    },
    show: (i) => `search(${pyList((i as Args)[0])}, ${(i as Args)[1]})`,
  },

  // fact(n) whose base case is `n == 1`: fact(0) recurses past zero until Python gives up.
  'factorial-base-case': {
    buggy: (i) => factorial(i as number, 1),
    fixed: (i) => factorial(i as number, 0),
    random: (r) => randomInt(r, 0, 8),
    show: (i) => `fact(${i as number})`,
  },

  // min_coins(coins, amount), greedy: as many of the biggest coin as fit, then the next.
  'greedy-coins': {
    buggy: (i) => {
      const [coins, start] = i as Args;
      let amount = start;
      let count = 0;
      for (const c of [...coins].sort((a, b) => b - a)) {
        count += floorDiv(amount, c);
        amount %= c;
      }
      // The Python returns -1 when greedy can't make the amount exactly.
      return String(amount === 0 ? count : -1);
    },
    fixed: (i) => {
      const [coins, amount] = i as Args;
      const best = new Array<number>(amount + 1).fill(Infinity);
      best[0] = 0;
      for (let a = 1; a <= amount; a++) for (const c of coins) if (c <= a && best[a - c]! + 1 < best[a]!) best[a] = best[a - c]! + 1;
      return String(best[amount] === Infinity ? -1 : best[amount]);
    },
    random: (r) => {
      const coins = [...new Set([1, ...randomList(r, randomInt(r, 1, 3), 2, 9)])].sort((a, b) => a - b);
      return [coins, randomInt(r, 0, 30)];
    },
    show: (i) => `min_coins(${pyList((i as Args)[0])}, ${(i as Args)[1]})`,
  },

  // add_item(item, items=[]) called once per name: the default list is made once and shared.
  'mutable-default': {
    buggy: (i) => {
      const shared: string[] = [];
      return (i as string[]).map((name) => (shared.push(name), pyList(shared.map(pyStr)))).at(-1)!;
    },
    fixed: (i) => {
      const names = i as string[];
      return pyList([pyStr(names.at(-1)!)]);
    },
    random: (r) => ['tea', 'milk', 'eggs', 'rice', 'bread'].slice(0, randomInt(r, 1, 5)),
    show: (i) => (i as string[]).map((n) => `add_item(${pyStr(n)})`).join('; '),
  },

  // class Cart: items = [] (one list on the class, shared by every cart).
  'shared-class-list': {
    buggy: (i) => {
      const [a, b] = i as [string[], string[]];
      return pyList([...a, ...b].map(pyStr));
    },
    fixed: (i) => pyList((i as [string[], string[]])[1].map(pyStr)),
    random: (r) => {
      const pool = ['pen', 'book', 'cup', 'lamp', 'bag'];
      return [pool.slice(0, randomInt(r, 0, 2)), pool.slice(2, 2 + randomInt(r, 1, 3))];
    },
    show: (i) => {
      const [a, b] = i as [string[], string[]];
      return `a.add() × ${pyList(a.map(pyStr))}, then b.add() × ${pyList(b.map(pyStr))}; print(b.items)`;
    },
  },

  // An LRU cache whose get() forgets to mark the key as just used.
  'lru-get-no-touch': {
    buggy: (i) => lru(i as LruInput, false),
    fixed: (i) => lru(i as LruInput, true),
    random: (r) => {
      const keys = ['a', 'b', 'c', 'd'];
      const ops: LruOp[] = Array.from({ length: randomInt(r, 3, 8) }, () => (r() < 0.6 ? ['put', keys[randomInt(r, 0, 3)]!] : ['get', keys[randomInt(r, 0, 3)]!]));
      return { capacity: 2, ops };
    },
    show: (i) => {
      const { capacity, ops } = i as LruInput;
      // Values don't affect which keys stay, so puts just number them 1, 2, 3 …
      let n = 0;
      const calls = ops.map(([op, k]) => (op === 'put' ? `c.put(${pyStr(k)}, ${++n})` : `c.get(${pyStr(k)})`));
      return `c = LRU(${capacity}); ${calls.join('; ')}; list(c.data)`;
    },
  },

  // Two buyers run buy() at the same time on the last items: each checks stock, then both write.
  'oversell-race': {
    buggy: (i) => {
      const { stock, buyers } = i as { stock: number; buyers: number };
      // Every buyer reads before anyone writes (the interleaving the item describes).
      const reads = Array.from({ length: buyers }, () => stock);
      const sold = reads.filter((seen) => seen > 0).length;
      return `sold ${sold}, stock ${stock - sold}`;
    },
    fixed: (i) => {
      const { stock, buyers } = i as { stock: number; buyers: number };
      // One atomic "decrement if above zero" per buyer.
      let left = stock;
      let sold = 0;
      for (let b = 0; b < buyers; b++) {
        if (left > 0) {
          left--;
          sold++;
        }
      }
      return `sold ${sold}, stock ${left}`;
    },
    random: (r) => ({ stock: randomInt(r, 0, 3), buyers: randomInt(r, 1, 5) }),
    show: (i) => {
      const { stock, buyers } = i as { stock: number; buyers: number };
      return `stock = ${stock}; ${buyers} buyers tap Buy at the same moment`;
    },
  },

  // Cache-aside where update_price writes the database but never removes the cached copy.
  'cache-no-invalidation': {
    buggy: (i) => cachedReads(i as CacheInput, false),
    fixed: (i) => cachedReads(i as CacheInput, true),
    random: (r) => {
      const items = ['tea', 'milk'];
      const ops: CacheOp[] = Array.from({ length: randomInt(r, 2, 6) }, () => {
        const item = items[randomInt(r, 0, 1)]!;
        return r() < 0.6 ? ['get', item] : ['set', item, randomInt(r, 5, 20)];
      });
      return { db: { tea: 10, milk: 4 }, ops };
    },
    show: (i) => {
      const { db, ops } = i as CacheInput;
      const start = `db = {${Object.entries(db).map(([k, v]) => `${pyStr(k)}: ${v}`).join(', ')}}`;
      return [start, ...ops.map((op) => (op[0] === 'get' ? `get_price(${pyStr(op[1])})` : `update_price(${pyStr(op[1])}, ${op[2]})`))].join('; ');
    },
  },

  // show_profile reads from a replica that is `lag` seconds behind the primary.
  'replica-lag': {
    buggy: (i) => {
      const { lag, wait, old, name } = i as LagInput;
      // The replica has the write only once the lag has passed.
      return pyStr(wait >= lag ? name : old);
    },
    fixed: (i) => pyStr((i as LagInput).name), // the user's own profile is read from the primary
    random: (r) => ({ lag: [0.5, 1, 2, 5][randomInt(r, 0, 3)]!, wait: [0.1, 0.5, 1, 3][randomInt(r, 0, 3)]!, old: 'A. Rao', name: 'Asha Rao' }),
    show: (i) => {
      const { lag, wait, name } = i as LagInput;
      return `save_profile(7, ${pyStr(name)}); ${wait} s later: show_profile(7), with the replica ${lag} s behind`;
    },
  },

  // pay() retries a charge on timeout without an idempotency key. The server always charges;
  // only its replies get lost (`lost` of them, in a row).
  'retry-no-idempotency': {
    buggy: (i) => payment((i as { lost: number }).lost, false),
    fixed: (i) => payment((i as { lost: number }).lost, true),
    random: (r) => ({ lost: randomInt(r, 0, 4) }),
    show: (i) => {
      const lost = (i as { lost: number }).lost;
      return `pay('order-42', 2000), where the first ${lost} repl${lost === 1 ? 'y is' : 'ies are'} lost`;
    },
  },

  // A webhook handler that adds 100 credits per delivery, though events can arrive twice.
  'webhook-duplicates': {
    buggy: (i) => `credits added: ${100 * (i as string[]).length}`,
    fixed: (i) => {
      const seen = new Set<string>();
      let credits = 0;
      for (const id of i as string[]) {
        if (seen.has(id)) continue; // already processed: skip
        seen.add(id);
        credits += 100;
      }
      return `credits added: ${credits}`;
    },
    random: (r) => Array.from({ length: randomInt(r, 1, 5) }, () => `evt_${randomInt(r, 1, 3)}`),
    show: (i) => `deliveries, in order: ${(i as string[]).join(', ')}`,
  },

  // call(layer) where every layer retries the layer below TRIES times, and the database at the
  // bottom fails every query. Counts the queries one user request causes.
  'retry-layers': {
    buggy: (i) => queriesFor(i as LayersInput, false),
    fixed: (i) => queriesFor(i as LayersInput, true),
    random: (r) => ({ depth: randomInt(r, 1, 5), tries: randomInt(r, 2, 4) }),
    show: (i) => {
      const { depth, tries } = i as LayersInput;
      return `DEPTH = ${depth}, TRIES = ${tries}; call(0) while the database fails every query`;
    },
  },

  // run(agent) with no step limit, where the tool fails every time and the agent retries.
  'agent-no-step-limit': {
    buggy: (i) => runAgent(i as AgentInput, null),
    fixed: (i) => runAgent(i as AgentInput, 8),
    random: (r) => ({ failures: r() < 0.5 ? 'always' : randomInt(r, 0, 12) }),
    show: (i) => {
      const f = (i as AgentInput).failures;
      return f === 'always' ? 'run(agent) with a tool that always fails' : `run(agent) with a tool that fails ${f} time${f === 1 ? '' : 's'}, then works`;
    },
  },

  // A grader that passes any transcript whose last message contains "booked".
  'grader-substring': {
    buggy: (i) => {
      const runs = i as GraderRun[];
      return `${runs.filter((g) => g.final.toLowerCase().includes('booked')).length} of ${runs.length} pass`;
    },
    fixed: (i) => {
      const runs = i as GraderRun[];
      return `${runs.filter((g) => g.calendarHasMeeting).length} of ${runs.length} pass`;
    },
    random: (r) => {
      const lines = [
        { final: 'Done: your meeting is booked for 3 pm.', calendarHasMeeting: true },
        { final: 'Sorry, the room could not be booked.', calendarHasMeeting: false },
        { final: 'All set, see you at 3.', calendarHasMeeting: true },
        { final: 'Booked! (The calendar tool timed out, though.)', calendarHasMeeting: false },
      ];
      return Array.from({ length: randomInt(r, 2, 5) }, () => lines[randomInt(r, 0, 3)]!);
    },
    show: (i) => `${(i as GraderRun[]).length} transcripts: ${(i as GraderRun[]).map((g) => `“${g.final}”`).join(' ')}`,
  },
};

function binarySearch([xs, target]: Args, correct: boolean): string {
  if (xs.length === 0) return '-1';
  let lo = 0;
  let hi = xs.length - 1;
  for (let steps = 0; lo <= hi; steps++) {
    if (steps > STEP_LIMIT) return NEVER_ENDS;
    const mid = floorDiv(lo + hi, 2);
    if (xs[mid] === target) return String(mid);
    if (xs[mid]! < target) lo = correct ? mid + 1 : mid;
    else hi = mid - 1;
  }
  return '-1';
}

/** Deeper than CPython 3.12's default limit (sys.getrecursionlimit() gives 1000), so the copy gives up where Python would. */
const RECURSION_LIMIT = 1000;
function factorial(n: number, base: 0 | 1): string {
  let result = 1;
  for (let k = n, depth = 1; ; k--, depth++) {
    // Python's message after "RecursionError:" varies by version, so only the error's name is shown.
    if (depth > RECURSION_LIMIT) return 'RecursionError';
    if (k === base) return String(result);
    result *= k;
  }
}

type LruOp = ['put' | 'get', string];
type LruInput = { capacity: number; ops: LruOp[] };
/** Keys in the cache afterwards, least recently used first, like list(OrderedDict). */
function lru({ capacity, ops }: LruInput, touchOnGet: boolean): string {
  const order: string[] = [];
  for (const [op, key] of ops) {
    const at = order.indexOf(key);
    if (op === 'get') {
      if (at >= 0 && touchOnGet) order.push(...order.splice(at, 1)); // move_to_end
    } else {
      if (at >= 0) order.splice(at, 1);
      order.push(key);
      if (order.length > capacity) order.shift(); // popitem(last=False)
    }
  }
  return pyList(order.map(pyStr));
}

type CacheOp = ['get', string] | ['set', string, number];
type CacheInput = { db: Record<string, number>; ops: CacheOp[] };
/** What each get_price call returns, as a Python list. */
function cachedReads({ db: start, ops }: CacheInput, invalidate: boolean): string {
  const db = { ...start };
  const cache = new Map<string, number>();
  const seen: number[] = [];
  for (const op of ops) {
    if (op[0] === 'set') {
      db[op[1]] = op[2];
      if (invalidate) cache.delete(op[1]); // cache.pop(item, None)
    } else {
      if (!cache.has(op[1])) cache.set(op[1], db[op[1]]!);
      seen.push(cache.get(op[1])!);
    }
  }
  return pyList(seen);
}

type LagInput = { lag: number; wait: number; old: string; name: string };

/** Three attempts. Without a key every attempt that reaches the server charges again. */
const ATTEMPTS = 3;
function payment(lost: number, withKey: boolean): string {
  const attempts = Math.min(lost + 1, ATTEMPTS);
  // With the same key on every attempt, the server charges once and replays its first answer.
  const charges = withKey ? 1 : attempts;
  const times = `charged ${charges} time${charges === 1 ? '' : 's'}`;
  return lost >= ATTEMPTS ? `${times}, then PaymentFailed` : times;
}

type LayersInput = { depth: number; tries: number };
/** Walks the call tree: each retrying layer calls the one below up to `tries` times, all failing. */
function queriesFor({ depth, tries }: LayersInput, topOnly: boolean): string {
  const count = (layer: number): number => {
    if (layer === depth) return 1; // one database query, which fails
    const n = topOnly && layer > 0 ? 1 : tries;
    return n * count(layer + 1);
  };
  const q = count(0);
  return `the database gets ${q} quer${q === 1 ? 'y' : 'ies'}`;
}

type AgentInput = { failures: number | 'always' };
function runAgent({ failures }: AgentInput, maxSteps: number | null): string {
  let fails = 0;
  for (let step = 1; ; step++) {
    if (maxSteps !== null && step > maxSteps) return `stopped at the step limit (${maxSteps} steps)`;
    if (step > STEP_LIMIT) return NEVER_ENDS;
    const ok = failures !== 'always' && fails >= failures;
    if (ok) return `done in ${step} step${step === 1 ? '' : 's'}`;
    fails++;
  }
}

type GraderRun = { final: string; calendarHasMeeting: boolean };

import { predict, randomInt, randomList, show, Tracer } from '../tools';
import type { Program, Value } from '../types';

// D2 "Time versus space": find a duplicate by comparing every pair (no extra memory, many
// comparisons) or by remembering what you've seen (extra memory, one pass).

const code = [
  'def dup_pairs(nums):',
  '    n = len(nums)',
  '    for i in range(n):',
  '        for j in range(i + 1, n):',
  '            if nums[i] == nums[j]:',
  '                return True',
  '    return False',
  'def dup_seen(nums):',
  '    seen = set()',
  '    for x in nums:',
  '        if x in seen: return True',
  '        seen.add(x)',
  '    return False',
];

export interface DupCounts {
  found: boolean;
  comparisons: number;
  lookups: number;
  remembered: number;
}

export function dupCounts(nums: number[]): DupCounts {
  let comparisons = 0;
  let foundPairs = false;
  outer: for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      comparisons++;
      if (nums[i] === nums[j]) {
        foundPairs = true;
        break outer;
      }
    }
  }
  const seen = new Set<number>();
  let lookups = 0;
  let foundSeen = false;
  for (const x of nums) {
    lookups++;
    if (seen.has(x)) {
      foundSeen = true;
      break;
    }
    seen.add(x);
  }
  if (foundPairs !== foundSeen) throw new Error('the two methods disagree');
  return { found: foundPairs, comparisons, lookups, remembered: seen.size };
}

export const timeSpace: Program<number[]> = {
  id: 'time-space',
  code,
  defaultInput: [4, 9, 1, 7, 3, 8],
  randomInput: (r) => {
    // Half the time no duplicate (the worst case for both), half the time one duplicate.
    const nums = [...new Set(randomList(r, 9, 1, 30))].slice(0, randomInt(r, 5, 7));
    if (r() < 0.5 && nums.length > 2) nums.push(nums[randomInt(r, 0, nums.length - 2)]!);
    return nums;
  },
  describe: (nums) => `nums = ${show(nums)}`,
  reference: (nums) => {
    const c = dupCounts(nums);
    return [c.found, c.comparisons, c.lookups, c.remembered];
  },
  run(nums) {
    const t = new Tracer();
    const n = nums.length;
    const rows: Value[][] = [];
    const table = (hl?: number) => [{ type: 'table' as const, label: 'Cost', columns: ['method', 'work', 'extra memory'], rows, ...(hl === undefined ? {} : { highlightRow: hl }) }];
    const arr = (hl: number[], label = 'nums') => ({ type: 'array' as const, label, values: nums, highlight: hl });
    t.step(null, `Does ${show(nums)} contain a duplicate? Two ways: compare every pair, or remember what you've seen.`, { nums }, [arr([]), ...table()]);
    const c = dupCounts(nums);
    const pairAsk = predict(
      `With ${n} numbers${c.found ? '' : ' and no duplicate'}, how many comparisons does dup_pairs make?`,
      c.comparisons,
      c.found ? `It stops at the first matching pair, after ${c.comparisons} comparisons.` : `Every pair once: ${n} × ${n - 1} / 2 = ${c.comparisons}. That grows like n², but needs no extra memory.`,
      [
        { value: n * n, why: 'j starts after i, so each pair is compared once, not twice, and never with itself.' },
        { value: n, why: 'One pass would be n checks; comparing pairs needs a loop inside a loop.' },
        { value: n * (n - 1), why: 'That counts each pair twice (i, j and j, i). Here j always starts after i.' },
      ],
      1,
    );
    t.step(5, `dup_pairs compares each pair once. ${c.found ? 'It finds a match and stops' : 'No pair matches'} after ${c.comparisons} comparisons.`, { comparisons: c.comparisons }, [arr([]), ...table()], pairAsk);
    rows.push(['pairs', `${c.comparisons} comparisons`, 'none']);
    t.step(c.found ? 6 : 7, 'Cost of dup_pairs: lots of work, no extra memory.', { comparisons: c.comparisons }, [arr([]), ...table(0)]);
    const seen: number[] = [];
    for (const [i, x] of nums.entries()) {
      if (seen.includes(x)) {
        t.step(11, `${x} is already in seen: duplicate found after ${i + 1} lookups.`, { x, seen }, [arr([i]), { type: 'array', label: 'seen', values: seen }, ...table()]);
        break;
      }
      seen.push(x);
      t.step(12, `${x} is new: add it to seen.`, { x, seen }, [arr([i]), { type: 'array', label: 'seen', values: seen }, ...table()]);
    }
    const memAsk = predict(
      `How many numbers did dup_seen have to remember?`,
      c.remembered,
      `It stored each new number once: ${c.remembered}. That memory is the price of doing one pass instead of comparing every pair.`,
      [
        { value: 0, why: 'dup_seen keeps a set of everything it has seen so far; that is the extra memory.' },
        { value: c.comparisons, why: 'That is how many comparisons dup_pairs made. dup_seen stores each new number once.' },
      ],
      2,
    );
    rows.push(['seen set', `${c.lookups} lookups`, `${c.remembered} numbers`]);
    t.step(c.found ? 11 : 13, `Cost of dup_seen: ${c.lookups} lookups, but ${c.remembered} numbers of extra memory.`, { lookups: c.lookups, remembered: c.remembered }, [arr([]), ...table(1)], memAsk);
    t.step(null, c.found ? 'Both find the duplicate. The set is faster; comparing pairs saves memory.' : 'Both say no duplicate. The set did far less work, but used memory to do it: a time–space trade-off.', { result: [c.found, c.comparisons, c.lookups, c.remembered] }, [arr([]), ...table()]);
    return t.frames;
  },
};

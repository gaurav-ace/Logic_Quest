import { predict, randomInt, randomList, show, Tracer } from '../tools';
import type { Program, Value } from '../types';

// D15 "Binary search on the answer": the smallest truck capacity that ships every parcel, in
// order, within D days. Bigger capacity never needs more days, so the answers line up like a
// sorted array, and binary search works on them.

export interface ShipInput {
  weights: number[];
  days: number;
}

const code = [
  'def need(cap, w):',
  '    days, load = 1, 0',
  '    for x in w:',
  '        if load + x > cap:',
  '            days += 1; load = 0',
  '        load += x',
  '    return days',
  'def min_cap(w, D):',
  '    lo, hi = max(w), sum(w)',
  '    while lo < hi:',
  '        mid = (lo + hi) // 2',
  '        if need(mid, w) <= D:',
  '            hi = mid',
  '        else:',
  '            lo = mid + 1',
  '    return lo',
];

export function need(cap: number, w: number[]): number {
  let days = 1;
  let load = 0;
  for (const x of w) {
    if (load + x > cap) {
      days++;
      load = 0;
    }
    load += x;
  }
  return days;
}

const SMALLER = 'try smaller: hi = mid';
const BIGGER = 'too small: lo = mid + 1';

export const minCapacity: Program<ShipInput> = {
  id: 'min-capacity',
  code,
  defaultInput: { weights: [3, 2, 2, 4, 1, 4], days: 3 },
  randomInput: (r) => {
    const weights = randomList(r, randomInt(r, 5, 7), 1, 6);
    return { weights, days: randomInt(r, 2, 4) };
  },
  describe: ({ weights, days }) => `weights = ${show(weights)}, D = ${days} days`,
  // Brute force: try every capacity from the heaviest parcel upwards.
  reference: ({ weights, days }) => {
    for (let cap = Math.max(...weights); ; cap++) if (need(cap, weights) <= days) return cap;
  },
  run({ weights, days: D }) {
    const t = new Tracer();
    const rows: Value[][] = [];
    const table = (hl?: number) => [
      { type: 'array' as const, label: 'parcel weights, shipped in order', values: weights },
      { type: 'table' as const, label: 'capacities tried', columns: ['capacity', 'days needed', `≤ ${D}?`], rows, ...(hl === undefined ? {} : { highlightRow: hl }) },
    ];
    let lo = Math.max(...weights);
    let hi = weights.reduce((a, b) => a + b, 0);
    t.step(null, `Ship these parcels in order within ${D} days. What is the smallest truck capacity that works? Bigger trucks never need more days, so binary search the capacity.`, { D }, table());
    t.step(9, `The answer is between ${lo} (the heaviest parcel must fit) and ${hi} (everything in one day).`, { lo, hi, D }, table());
    let pass = 0;
    while (lo < hi) {
      pass++;
      const mid = Math.floor((lo + hi) / 2);
      const d = need(mid, weights);
      const fits = d <= D;
      t.step(11, `Try the middle capacity: mid = (${lo} + ${hi}) // 2 = ${mid}.`, { lo, hi, mid }, table());
      rows.push([mid, d, fits ? 'yes' : 'no']);
      const ask =
        pass <= 2
          ? predict(
              `Capacity ${mid} needs ${d} days, and the limit is ${D}. What next?`,
              fits ? SMALLER : BIGGER,
              fits ? `${mid} works, so the answer is ${mid} or smaller. Keep ${mid} in range: hi = mid.` : `${mid} needs too many days, and anything smaller needs at least as many. Rule it out: lo = mid + 1.`,
              [
                { value: fits ? BIGGER : SMALLER, why: fits ? `${mid} already works; a bigger truck can't be the smallest that works.` : `${mid} fails, and a smaller truck can only need more days.` },
                { value: `stop: the answer is ${mid}`, why: fits ? 'A smaller capacity might work too; keep searching until lo meets hi.' : `${mid} doesn't even work.` },
              ],
              pass,
            )
          : undefined;
      if (fits) {
        hi = mid;
        t.step(13, `need(${mid}) = ${d} ≤ ${D}: it works. Look for something smaller: hi = ${hi}.`, { lo, hi, mid, 'need(mid)': d }, table(rows.length - 1), ask);
      } else {
        lo = mid + 1;
        t.step(15, `need(${mid}) = ${d} > ${D}: too small. lo = ${lo}.`, { lo, hi, mid, 'need(mid)': d }, table(rows.length - 1), ask);
      }
    }
    t.step(16, `lo meets hi: the smallest capacity that works is ${lo}, found by trying only ${rows.length} capacities.`, { result: lo }, table());
    return t.frames;
  },
};

import { predict, randomInt, Tracer } from '../tools';
import type { Program, Value } from '../types';

// R11 "Unique ID generator": each machine builds IDs from the time, its own machine number and
// a per-millisecond sequence, so no central counter is needed and IDs sort by time. Twitter's
// Snowflake uses 41/10/12 bits; this lesson uses a tiny layout (2 machine bits, 2 sequence bits)
// so the numbers stay readable, and so a sequence can run out within one millisecond.

export interface FlakeInput {
  /** [millisecond, machine], in time order. */
  reqs: [number, number][];
}

const SEQ_BITS = 2;
const MACHINE_BITS = 2;
const SEQ_MAX = 1 << SEQ_BITS;

const code = [
  'def next_id(machine, now):',
  '    now = max(now, last[machine])',
  '    if now == last[machine]:',
  '        seq[machine] += 1',
  '        if seq[machine] == 4:',
  '            now += 1  # next ms',
  '            seq[machine] = 0',
  '    else:',
  '        seq[machine] = 0',
  '    last[machine] = now',
  '    return (now << 4 |',
  '            machine << 2 |',
  '            seq[machine])',
];

export const idOf = (ms: number, machine: number, seq: number) => (ms << (MACHINE_BITS + SEQ_BITS)) | (machine << SEQ_BITS) | seq;

/** Reference: each machine hands out (ms, seq) slots in order, never reusing one. */
export function slots({ reqs }: FlakeInput): number[] {
  const nextFree = new Map<number, [number, number]>();
  return reqs.map(([ms, m]) => {
    const [fms, fseq] = nextFree.get(m) ?? [ms, 0];
    const slot: [number, number] = ms > fms ? [ms, 0] : [fms, fseq];
    nextFree.set(m, slot[1] + 1 === SEQ_MAX ? [slot[0] + 1, 0] : [slot[0], slot[1] + 1]);
    return idOf(slot[0], m, slot[1]);
  });
}

export const snowflake: Program<FlakeInput> = {
  id: 'snowflake',
  code,
  // Machine 0 asks five times in one millisecond, so its sequence runs out on the fifth.
  defaultInput: { reqs: [[1000, 0], [1000, 0], [1000, 1], [1000, 0], [1000, 0], [1000, 0], [1001, 0], [1002, 1]] },
  randomInput: (r) => {
    const reqs: [number, number][] = [];
    let ms = 1000;
    for (let n = randomInt(r, 7, 10); n > 0; n--) {
      if (r() < 0.35) ms += randomInt(r, 1, 2);
      reqs.push([ms, randomInt(r, 0, 2)]);
    }
    return { reqs };
  },
  describe: ({ reqs }) => reqs.map(([ms, m]) => `m${m}@${ms}`).join(', '),
  reference: (input) => slots(input),
  run({ reqs }) {
    const t = new Tracer();
    const last = new Map<number, number>();
    const seq = new Map<number, number>();
    const rows: Value[][] = [];
    const ids: number[] = [];
    const view = () => [{ type: 'table' as const, label: 'IDs so far (time | machine | seq)', columns: ['asked at', 'machine', 'ms used', 'seq', 'id'], rows, ...(rows.length ? { highlightRow: rows.length - 1 } : {}) }];
    let asked = 0;
    t.step(null, 'Each ID packs three numbers: the millisecond, the machine, and a counter for IDs made in that millisecond. Machines never need to talk to each other.', {}, view());
    reqs.forEach(([asks, m], i) => {
      const prevLast = last.get(m) ?? -1;
      let now = Math.max(asks, prevLast);
      let s: number;
      let overflow = false;
      if (now === prevLast) {
        s = (seq.get(m) ?? 0) + 1;
        if (s === SEQ_MAX) {
          now += 1;
          s = 0;
          overflow = true;
        }
      } else {
        s = 0;
      }
      seq.set(m, s);
      last.set(m, now);
      const id = idOf(now, m, s);
      const ask =
        asked < 3 && (overflow || (now === prevLast && i > 0))
          ? (asked++,
            predict(
              overflow ? `Machine ${m} has used all ${SEQ_MAX} sequence numbers in ${asks} ms. Which millisecond does this ID use?` : `Machine ${m} asks again in ${now} ms. What is seq?`,
              overflow ? now : s,
              overflow ? `The counter only has ${SEQ_MAX} values per millisecond, so the machine moves on to ${now} ms and starts again at 0.` : `Same machine, same millisecond: the counter goes up by one.`,
              overflow
                ? [{ value: asks, why: `Every sequence number in ${asks} ms is taken; reusing one would repeat an ID.` }]
                : [{ value: 0, why: 'The counter resets only when the millisecond changes.' }, { value: s + 1, why: 'The counter goes up by exactly one for each ID.' }],
              i + 1,
            ))
          : undefined;
      ids.push(id);
      rows.push([asks, m, now, s, id]);
      t.step(overflow ? 6 : 13, overflow ? `Machine ${m}'s counter is full for ${asks} ms, so it waits for ${now} ms: id ${id}.` : `Machine ${m} at ${now} ms, seq ${s}: id ${id}.`, { machine: m, now, seq: s, id }, view(), ask);
    });
    const unique = new Set(ids).size === ids.length;
    t.step(null, `${ids.length} IDs, ${unique ? 'all different' : 'with a repeat'}, made without any machine asking another. Sorted by value, they come out in time order.`, { result: ids }, view());
    return t.frames;
  },
};

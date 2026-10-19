import { predict, randomInt, Tracer } from '../tools';
import type { Program, Value } from '../types';

// D12 "Hash maps": a hash turns a key into a bucket number, so a lookup only searches one
// small bucket instead of everything.

export interface HashInput {
  keys: string[];
  lookup: string;
}

const BUCKETS = 5;

const code = [
  'def h(key):',
  '    return sum(map(ord, key)) % 5',
  'table = [[] for _ in range(5)]',
  'def put(key, val):',
  '    bucket = table[h(key)]',
  '    bucket.append((key, val))',
  'def get(key):',
  '    for k, v in table[h(key)]:',
  '        if k == key: return v',
  '    return None',
];

/** The toy hash from the code: add up the character codes, keep the remainder. */
export const toyHash = (key: string) => [...key].reduce((a, c) => a + c.charCodeAt(0), 0) % BUCKETS;

const WORDS = ['cat', 'dog', 'owl', 'ant', 'bee', 'cow', 'elk', 'fox', 'yak', 'emu', 'hen', 'pig', 'ram', 'bat'];

export const hashMap: Program<HashInput> = {
  id: 'hash-map',
  code,
  defaultInput: { keys: ['cat', 'dog', 'owl', 'ant', 'bee'], lookup: 'owl' },
  randomInput: (r) => {
    const pool = [...WORDS].sort(() => r() - 0.5);
    const keys = pool.slice(0, randomInt(r, 4, 6));
    return { keys, lookup: r() < 0.75 ? keys[randomInt(r, 0, keys.length - 1)]! : pool[keys.length]! };
  },
  describe: ({ keys, lookup }) => `put ${keys.map((k, i) => `${k}=${i}`).join(', ')}; then get("${lookup}")`,
  reference: ({ keys, lookup }) => {
    const i = keys.indexOf(lookup);
    return i === -1 ? null : i;
  },
  run({ keys, lookup }) {
    const t = new Tracer();
    const table: string[][] = Array.from({ length: BUCKETS }, () => []);
    const view = (hl?: number) => [{ type: 'buckets' as const, label: 'table (5 buckets)', buckets: table.map((b) => [...b]), ...(hl === undefined ? {} : { highlight: hl }) }];
    t.step(null, `Store ${keys.length} animals with a number each, then look one up. Searching every entry is slow; a hash says which bucket to look in.`, {}, view());
    t.step(3, 'Five empty buckets.', {}, view());
    keys.forEach((key, val) => {
      const b = toyHash(key);
      const codes = [...key].map((c) => c.charCodeAt(0));
      const total = codes.reduce((a, c) => a + c, 0);
      const ask =
        val === 1 || val === 3
          ? predict(
              `"${key}": its character codes add up to ${total}. Which bucket? (h = total % 5)`,
              b,
              `${total} % 5 = ${b}: the remainder after dividing by 5.`,
              [
                { value: (b + 1) % BUCKETS, why: `Work out the remainder: ${total} = 5 × ${Math.floor(total / 5)} + ${b}.` },
                { value: Math.floor(total / 5) % BUCKETS, why: 'That uses the quotient. The bucket is the remainder.' },
                { value: key.length % BUCKETS, why: 'h adds the character codes, not the number of letters.' },
              ],
              val,
            )
          : undefined;
      const collision = table[b]!.length > 0;
      table[b]!.push(`${key}: ${val}`);
      t.step(6, `put("${key}", ${val}): h("${key}") = ${total} % 5 = ${b}.${collision ? ` Bucket ${b} already has an entry: a collision, so it chains on the end.` : ''}`, { key, 'h(key)': b }, view(b), ask);
    });
    const b = toyHash(lookup);
    t.step(8, `get("${lookup}"): h("${lookup}") = ${b}, so only bucket ${b} is searched, not all ${keys.length} entries.`, { key: lookup, 'h(key)': b }, view(b));
    let result: Value = null;
    for (const entry of table[b]!) {
      const [k, v] = entry.split(': ');
      if (k === lookup) {
        result = Number(v);
        t.step(9, `Found "${lookup}" in bucket ${b}: its value is ${result}.`, { key: lookup, result }, view(b));
        return t.frames;
      }
      t.step(9, `"${k}" is in bucket ${b} too, but it isn't "${lookup}". Keep looking in this bucket.`, { key: lookup, k: k! }, view(b));
    }
    t.step(10, `Bucket ${b} has no "${lookup}": return None. Still only one bucket was searched.`, { key: lookup, result }, view(b));
    return t.frames;
  },
};

import { predict, randomInt, Tracer } from '../tools';
import type { Program, Value } from '../types';

// S7 "Indexes": find rows WHERE age = target. Without an index, check every row. With an index
// (the ages kept sorted, each pointing at its row), binary search jumps to the matches.

export interface IndexInput {
  ages: number[];
  target: number;
}

const code = [
  '# no index: check every row',
  'for row in rows:',
  '    if row.age == target:',
  '        found.append(row.id)',
  '# index on age: sorted (age, id)',
  'i = lower_bound(index, target)',
  'while i < len(index) and \\',
  '      index[i].age == target:',
  '    found.append(index[i].id)',
  '    i += 1',
];

/** Checks each way takes, and the rows found (ids in index order). */
export function lookupCosts(ages: number[], target: number): { scan: number; index: number; found: number[] } {
  const index = ages.map((age, id) => ({ age, id })).sort((a, b) => a.age - b.age || a.id - b.id);
  let lo = 0;
  let hi = index.length;
  let probes = 0;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    probes++;
    if (index[mid]!.age < target) lo = mid + 1;
    else hi = mid;
  }
  const found: number[] = [];
  for (let i = lo; i < index.length && index[i]!.age === target; i++) {
    probes++;
    found.push(index[i]!.id);
  }
  return { scan: ages.length, index: probes, found };
}

export const indexLookup: Program<IndexInput> = {
  id: 'index-lookup',
  code,
  defaultInput: { ages: [34, 27, 45, 31, 52, 31, 29, 40, 31, 38, 25, 47], target: 31 },
  randomInput: (r) => {
    const ages = Array.from({ length: randomInt(r, 10, 14) }, () => randomInt(r, 20, 60));
    return { ages, target: r() < 0.8 ? ages[randomInt(r, 0, ages.length - 1)]! : 61 };
  },
  describe: ({ ages, target }) => `${ages.length} rows; WHERE age = ${target}`,
  reference: ({ ages, target }) => {
    const c = lookupCosts(ages, target);
    return [c.scan, c.index, c.found];
  },
  run({ ages, target }) {
    const t = new Tracer();
    const costs = lookupCosts(ages, target);
    const rows = { type: 'array' as const, label: 'rows (age; position = row id)', values: ages };
    t.step(null, `Find every row with age ${target}. First without an index, then with one.`, { target }, [rows]);
    const found: number[] = [];
    let checks = 0;
    ages.forEach((age, id) => {
      checks++;
      const hit = age === target;
      if (hit) found.push(id);
      // Only show a few rows in detail; the rest are summarised.
      if (id < 3 || hit) t.step(hit ? 4 : 3, `Row ${id}: age ${age}${hit ? ` matches: add row ${id}.` : ` isn't ${target}.`}`, { checks, found: [...found] }, [{ ...rows, pointers: [{ name: 'row', index: id }], highlight: [id], done: Array.from({ length: id }, (_, k) => k) }]);
    });
    const scanAsk = predict(
      `Without an index, how many rows must be checked to be sure every age-${target} row is found?`,
      ages.length,
      `All ${ages.length}. A match could be anywhere, so every row must be read: that is a full table scan.`,
      [
        { value: costs.found.length, why: 'You only know how many match after reading every row.' },
        { value: Math.ceil(ages.length / 2), why: 'Stopping halfway could miss matches in the other half.' },
      ],
      1,
    );
    t.step(null, `Full scan done: ${checks} checks for ${found.length} match${found.length === 1 ? '' : 'es'}. On a million rows, that is a million checks.`, { checks, found: [...found] }, [rows], scanAsk);
    const index = ages.map((age, id) => ({ age, id })).sort((a, b) => a.age - b.age || a.id - b.id);
    const indexView = (hl: number[], lo?: number, hi?: number): { type: 'table'; label: string; columns: string[]; rows: Value[][]; highlightRow?: number } => ({
      type: 'table',
      label: `index on age (sorted)${lo === undefined ? '' : `: searching ${lo}..${(hi ?? index.length) - 1}`}`,
      columns: ['age', 'row id'],
      rows: index.map((e) => [e.age, e.id]),
      ...(hl.length ? { highlightRow: hl[0]! } : {}),
    });
    t.step(5, 'The index keeps every age in sorted order, each pointing at its row. Like the index at the back of a book.', {}, [indexView([])]);
    let lo = 0;
    let hi = index.length;
    let probes = 0;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      probes++;
      const goRight = index[mid]!.age < target;
      t.step(6, `Binary search: look at position ${mid} (age ${index[mid]!.age}). ${goRight ? `Smaller than ${target}: the matches are further down.` : `Not smaller than ${target}: the first match is here or above.`}`, { probes }, [indexView([mid], lo, hi)]);
      if (goRight) lo = mid + 1;
      else hi = mid;
    }
    const got: number[] = [];
    for (let i = lo; i < index.length && index[i]!.age === target; i++) {
      probes++;
      got.push(index[i]!.id);
      t.step(9, `Position ${i}: age ${target}, row ${index[i]!.id}. Matches sit next to each other in the index.`, { probes, found: [...got] }, [indexView([i])]);
    }
    const idxAsk = predict(
      'How many index entries did that take, compared with the full scan?',
      `${probes}, against ${ages.length}`,
      `Binary search halves the range each time, then reads only the matches: ${probes} entries instead of ${ages.length} rows.`,
      [
        { value: `${ages.length}, against ${ages.length}`, why: 'The index is sorted, so most entries are never looked at.' },
        { value: `1, against ${ages.length}`, why: `It still has to narrow down the position and read each match.` },
      ],
      2,
    );
    t.step(null, `${probes} index checks instead of ${ages.length}. The price: every insert or update must also update the index, so writes do a bit more work.`, { result: [costs.scan, costs.index, costs.found] }, [indexView([])], idxAsk);
    return t.frames;
  },
};


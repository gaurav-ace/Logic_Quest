import { predict, randomInt, show, Tracer } from '../tools';
import type { Program, Value } from '../types';

// D13 "Counting and grouping": anagrams share the same sorted letters, so that makes a key.

const code = [
  'def group(words):',
  '    groups = {}',
  '    for w in words:',
  "        key = ''.join(sorted(w))",
  '        groups.setdefault(key, [])',
  '        groups[key].append(w)',
  '    return list(groups.values())',
];

export const sortedKey = (w: string) => [...w].sort().join('');

export function groupAnagrams(words: string[]): string[][] {
  const groups = new Map<string, string[]>();
  for (const w of words) {
    const key = sortedKey(w);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(w);
  }
  return [...groups.values()];
}

const FAMILIES = [
  ['tea', 'eat', 'ate'],
  ['tan', 'nat', 'ant'],
  ['bat', 'tab'],
  ['dog', 'god'],
  ['art', 'rat', 'tar'],
  ['ten', 'net'],
];

export const anagramGroups: Program<string[]> = {
  id: 'anagram-groups',
  code,
  defaultInput: ['eat', 'tea', 'tan', 'ate', 'nat', 'bat'],
  randomInput: (r) => {
    const fams = [...FAMILIES].sort(() => r() - 0.5).slice(0, 3);
    return fams.flatMap((f) => f.slice(0, randomInt(r, 1, f.length))).sort(() => r() - 0.5);
  },
  describe: (words) => `words = ${show(words)}`,
  reference: (words) => groupAnagrams(words),
  run(words) {
    const t = new Tracer();
    const groups = new Map<string, string[]>();
    const view = (hlKey?: string, hlWord?: number) => {
      const rows: Value[][] = [...groups].map(([k, ws]) => [k, ws]);
      const hlRow = hlKey === undefined ? -1 : [...groups.keys()].indexOf(hlKey);
      return [
        { type: 'array' as const, label: 'words', values: words, ...(hlWord === undefined ? {} : { highlight: [hlWord], pointers: [{ name: 'w', index: hlWord }] }) },
        { type: 'table' as const, label: 'groups (a dict)', columns: ['key', 'words'], rows, ...(hlRow >= 0 ? { highlightRow: hlRow } : {}) },
      ];
    };
    t.step(null, 'Group words that are anagrams (same letters, any order). Comparing every pair is slow; give each word a key that anagrams share.', {}, view());
    t.step(2, 'groups starts as an empty dict: key → list of words.', {}, view());
    words.forEach((w, i) => {
      const key = sortedKey(w);
      const ask =
        i === 1 || i === 3
          ? predict(
              `What is the key for "${w}"?`,
              key,
              `Sort its letters: ${[...w].join(', ')} → ${key}. Every anagram of "${w}" sorts to the same key.`,
              [
                { value: [...w].reverse().join(''), why: 'That is the word reversed. The key is the letters in alphabetical order.' },
                { value: w, why: 'The word itself only matches identical words, not anagrams.' },
                { value: String(w.length), why: 'Many non-anagrams share a length; the letters must match too.' },
              ],
              i,
            )
          : undefined;
      t.step(4, `"${w}" sorted is "${key}".`, { w, key }, view(groups.has(key) ? key : undefined, i), ask);
      const isNew = !groups.has(key);
      if (isNew) groups.set(key, []);
      groups.get(key)!.push(w);
      t.step(6, isNew ? `"${key}" is a new key: start a group with "${w}".` : `"${key}" is already a key: add "${w}" to that group.`, { w, key }, view(key, i));
    });
    const result = [...groups.values()];
    t.step(7, `${result.length} groups, from one pass and one dict lookup per word.`, { result }, view());
    return t.frames;
  },
};

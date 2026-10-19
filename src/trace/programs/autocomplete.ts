import { predict, randomInt, Tracer } from '../tools';
import type { Program, TreeNode, Value, View } from '../types';

// R10 "Search autocomplete": a trie where every node keeps its top results, updated as searches
// are added. Suggesting then walks the prefix and reads one short list: no search of the
// subtree below, however many words share the prefix.

export interface AutoInput {
  /** [word, how often it was searched]. */
  searches: [string, number][];
  prefix: string;
}

/** Suggestions per node. */
export const K = 2;

const code = [
  'def add(w, n):  # word, searches',
  '    node = root',
  '    for ch in w:',
  '        node = node.child(ch)',
  '        node.top.append((n, w))',
  '        node.top.sort(key=rank)',
  '        del node.top[2:]  # keep 2',
  'def suggest(prefix):',
  '    node = root',
  '    for ch in prefix:',
  '        if ch not in node.kids:',
  '            return []',
  '        node = node.kids[ch]',
  '    return node.top',
];

type Entry = [count: number, word: string];

// Most searched first; equal counts in alphabetical order, so the result never depends on luck.
const byRank = (a: Entry, b: Entry) => b[0] - a[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0);

/** Reference: filter every word by the prefix, sort, take the top K. */
export function bruteTop({ searches, prefix }: AutoInput): string[] {
  return searches
    .filter(([w]) => w.startsWith(prefix))
    .map(([w, c]): Entry => [c, w])
    .sort(byRank)
    .slice(0, K)
    .map(([, w]) => w);
}

const WORD_SETS = [
  ['car', 'cat', 'cart', 'cab'],
  ['tea', 'ten', 'to', 'tan'],
  ['sun', 'sum', 'so', 'sat'],
  ['bad', 'ban', 'bat', 'be'],
];

const label = ([c, w]: Entry) => `${w} ${c}`;

export const autocomplete: Program<AutoInput> = {
  id: 'autocomplete',
  code,
  defaultInput: { searches: [['car', 9], ['cat', 5], ['cart', 7], ['cab', 6]], prefix: 'ca' },
  randomInput: (r) => {
    const words = WORD_SETS[randomInt(r, 0, WORD_SETS.length - 1)]!;
    const searches = words.map((w): [string, number] => [w, randomInt(r, 1, 9)]);
    const w = words[randomInt(r, 0, words.length - 1)]!;
    const roll = r();
    const prefix = roll < 0.6 ? w.slice(0, 2) : roll < 0.85 ? w.slice(0, 1) : `${w[0]}q`;
    return { searches, prefix };
  },
  describe: ({ searches, prefix }) => `searches: ${searches.map(([w, c]) => `${w} ×${c}`).join(', ')}; suggest("${prefix}")`,
  reference: (input) => bruteTop(input),
  run({ searches, prefix }) {
    const t = new Tracer();
    // prefix -> child prefixes in insertion order; '' is the root.
    const kids = new Map<string, string[]>([['', []]]);
    const top = new Map<string, Entry[]>();
    const view = (focus: string): View[] => {
      const nodes: TreeNode[] = [...kids].map(([p, ks]) => ({ id: p || 'root', value: p ? p.at(-1)! : '•', children: ks }));
      const rows: Value[][] = [...top].map(([p, list]) => [p, list.map(label).join(', ')]);
      const row = [...top.keys()].indexOf(focus);
      return [
        { type: 'tree', label: 'trie (• is the root)', shape: 'nary', nodes, root: 'root', highlight: [focus || 'root'] },
        { type: 'table', label: `each node's top ${K}`, columns: ['prefix', `top ${K} (word count)`], rows, ...(row >= 0 ? { highlightRow: row } : {}) },
      ];
    };
    t.step(null, `Add each search with how often it was searched. Every node keeps only the ${K} most searched words below it, so suggesting never has to look further down.`, {}, view(''));
    let asked = 0;
    for (const [word, count] of searches) {
      let node = '';
      t.step(2, `add("${word}", ${count}): start at the root.`, { word, count }, view(''));
      for (const ch of word) {
        const child = node + ch;
        if (!kids.has(child)) {
          kids.set(child, []);
          kids.get(node)!.push(child);
          top.set(child, []);
        }
        const before = top.get(child)!;
        const after = [...before, [count, word] as Entry].sort(byRank).slice(0, K);
        // Ask only when the list is already full, so "does it get in?" is a real question.
        const ask =
          asked < 2 && before.length === K
            ? (asked++,
              predict(
                `"${word}" (${count}) passes through "${child}", whose top ${K} is ${before.map(label).join(', ')}. What is its top ${K} afterwards?`,
                after.map(([, w]) => w),
                after.some(([, w]) => w === word) ? `${word} has ${count} searches, ${count === before.at(-1)![0] ? `as many as ${before.at(-1)![1]} and first in alphabetical order` : `more than ${before.at(-1)![1]}'s ${before.at(-1)![0]}`}, so it gets in and ${before.at(-1)![1]} drops out.` : `${word}'s ${count} searches don't beat either word already there (equal counts go in alphabetical order), so the list is unchanged.`,
                [
                  { value: before.map(([, w]) => w), why: after.some(([, w]) => w === word) ? `${word} beats ${before.at(-1)![1]}, so the list does change.` : 'That is the answer.' },
                  { value: [word, ...before.map(([, w]) => w)].slice(0, K), why: 'The newest word doesn\'t go first: the list is ordered by search count.' },
                  { value: [...before.map(([, w]) => w), word], why: `Each node keeps only ${K} words.` },
                ],
                asked + 7,
              ))
            : undefined;
        top.set(child, after);
        t.step(7, after.some(([, w]) => w === word) ? `${word} goes into the top ${K} at "${child}": ${after.map(label).join(', ')}.` : `${word} doesn't make the top ${K} at "${child}", which stays ${after.map(label).join(', ')}.`, { word, ch }, view(child), ask);
        node = child;
      }
    }
    let node = '';
    t.step(9, `suggest("${prefix}"): walk the prefix one letter at a time.`, { prefix }, view(''));
    for (const ch of prefix) {
      const child = node + ch;
      if (!kids.has(child)) {
        t.step(12, `No "${ch}" under "${node || 'root'}": nothing was ever searched starting with "${prefix}".`, { result: [] }, view(node));
        return t.frames;
      }
      node = child;
      t.step(13, `Follow "${ch}".`, { prefix, node }, view(node));
    }
    const result = top.get(node)!.map(([, w]) => w);
    const ranked = searches.filter(([w]) => w.startsWith(prefix)).map(([w]) => w);
    const ask = predict(
      `What does suggest("${prefix}") return?`,
      result,
      `The node for "${prefix}" already holds its top ${K}; suggesting just reads it.`,
      [
        { value: [...ranked].sort().slice(0, K), why: 'Alphabetical order would ignore how often each word was searched.' },
        { value: ranked.slice(-K), why: 'The most recent searches aren\'t necessarily the most popular.' },
        { value: ranked, why: `Each node keeps only its top ${K}.` },
      ],
      11,
    );
    t.step(14, `Return the stored list: ${result.join(', ')}. That took ${prefix.length} steps, however many words start with "${prefix}". The price: every add updates a list at each letter.`, { result }, view(node), ask);
    return t.frames;
  },
};

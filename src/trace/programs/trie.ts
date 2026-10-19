import { predict, Tracer } from '../tools';
import type { Program, TreeNode, View } from '../types';

// D24 "Tries": words share their beginnings, one letter per node, so a prefix search walks one
// letter at a time however many words there are.

export interface TrieInput {
  words: string[];
  prefix: string;
}

const code = [
  'def insert(word):',
  '    node = root',
  '    for ch in word:',
  '        if ch not in node.kids:',
  '            node.kids[ch] = Node()',
  '        node = node.kids[ch]',
  '    node.end = True',
  'def starts_with(prefix):',
  '    node = root',
  '    for ch in prefix:',
  '        if ch not in node.kids:',
  '            return False',
  '        node = node.kids[ch]',
  '    return True',
];

interface Trie {
  /** prefix -> child prefixes in insertion order; '' is the root. */
  kids: Map<string, string[]>;
  ends: Set<string>;
}

const newTrie = (): Trie => ({ kids: new Map([['', []]]), ends: new Set() });

function trieView(trie: Trie, highlight: string[] = []): View {
  const nodes: TreeNode[] = [...trie.kids].map(([p, kids]) => ({ id: p || 'root', value: p ? p.at(-1)! : '•', children: kids }));
  const notes: Record<string, string> = {};
  for (const e of trie.ends) notes[e] = 'end';
  return { type: 'tree', label: 'trie (• is the root; "end" marks a whole word)', shape: 'nary', nodes, root: 'root', highlight: highlight.map((h) => h || 'root'), notes };
}

/** Number of nodes a trie needs: one per distinct prefix, plus the root. */
export const trieSize = (words: string[]) => new Set(words.flatMap((w) => Array.from({ length: w.length }, (_, i) => w.slice(0, i + 1)))).size + 1;

const WORD_SETS = [
  ['car', 'cat', 'cart', 'dog'],
  ['tea', 'ten', 'to', 'tan'],
  ['sun', 'sum', 'so', 'sat'],
  ['bad', 'ban', 'bat', 'be'],
];

export const trie: Program<TrieInput> = {
  id: 'trie',
  code,
  defaultInput: { words: ['car', 'cat', 'cart', 'dog'], prefix: 'ca' },
  randomInput: (r) => {
    const words = WORD_SETS[Math.floor(r() * WORD_SETS.length)]!;
    const w = words[Math.floor(r() * words.length)]!;
    const prefix = r() < 0.7 ? w.slice(0, 2) : `${w[0]}q`;
    return { words, prefix };
  },
  describe: ({ words, prefix }) => `insert ${words.join(', ')}; does any word start with "${prefix}"?`,
  reference: ({ words, prefix }) => words.some((w) => w.startsWith(prefix)),
  run({ words, prefix }) {
    const t = new Tracer();
    const tr = newTrie();
    t.step(null, `Store ${words.join(', ')} so that "does any word start with …?" is quick. Words that start the same share nodes.`, {}, [trieView(tr)]);
    let asked = 0;
    for (const word of words) {
      let node = '';
      t.step(2, `Insert "${word}", starting at the root.`, { word }, [trieView(tr, [''])]);
      for (const ch of word) {
        const child = node + ch;
        const exists = tr.kids.has(child);
        const ask =
          asked < 2 && word !== words[0] && child.length === 2
            ? (asked++,
              predict(
                `Inserting "${word}": is there already a node for "${child}"?`,
                exists ? 'yes, reuse it' : 'no, make a new one',
                exists ? `An earlier word already starts with "${child}", so the node is shared.` : `No earlier word starts with "${child}", so a new branch begins here.`,
                [{ value: exists ? 'no, make a new one' : 'yes, reuse it', why: exists ? `"${words.find((w) => w.startsWith(child))}" was inserted earlier and starts with "${child}".` : `No earlier word starts with "${child}".` }],
                asked,
              ))
            : undefined;
        if (!exists) {
          tr.kids.set(child, []);
          tr.kids.get(node)!.push(child);
          t.step(5, `No "${ch}" under "${node || 'root'}": add a node.`, { word, ch }, [trieView(tr, [child])], ask);
        } else {
          t.step(6, `"${child}" already exists (shared with an earlier word): follow it.`, { word, ch }, [trieView(tr, [child])], ask);
        }
        node = child;
      }
      tr.ends.add(node);
      t.step(7, `Mark "${word}" as the end of a whole word.`, { word }, [trieView(tr, [node])]);
    }
    let node = '';
    t.step(9, `starts_with("${prefix}"): walk one letter at a time from the root.`, { prefix }, [trieView(tr, [''])]);
    for (const ch of prefix) {
      const child = node + ch;
      if (!tr.kids.has(child)) {
        t.step(12, `No "${ch}" under "${node || 'root'}": no word starts with "${prefix}".`, { result: false }, [trieView(tr, [node])]);
        return t.frames;
      }
      node = child;
      t.step(13, `Follow "${ch}".`, { prefix, node }, [trieView(tr, [node])]);
    }
    t.step(14, `Every letter of "${prefix}" was found: some word starts with it. That took ${prefix.length} steps, whatever the number of words.`, { result: true }, [trieView(tr, [node])]);
    return t.frames;
  },
};

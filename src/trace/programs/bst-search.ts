import { predict, randomInt, show, Tracer } from '../tools';
import type { Program } from '../types';
import { bstFrom, treeView } from './tree-walk';

// D23 "Binary search trees": smaller keys go left, bigger go right, so a search only follows
// one path from the root down.

export interface BstInput {
  keys: number[];
  target: number;
}

const code = [
  'def search(node, key):',
  '    while node:',
  '        if key == node.key:',
  '            return True',
  '        elif key < node.key:',
  '            node = node.left',
  '        else:',
  '            node = node.right',
  '    return False',
];

/** Nodes a search visits, root first. */
export function searchPath(keys: number[], target: number): number[] {
  const tree = bstFrom(keys);
  const path: number[] = [];
  for (let at = tree.root; at !== null; ) {
    path.push(at);
    if (target === at) break;
    at = tree.nodes[String(at)]![target < at ? 0 : 1];
  }
  return path;
}

export function height(keys: number[]): number {
  const tree = bstFrom(keys);
  const h = (v: number | null): number => (v === null ? 0 : 1 + Math.max(h(tree.nodes[String(v)]![0]), h(tree.nodes[String(v)]![1])));
  return h(tree.root);
}

const LEFT = 'go left';
const RIGHT = 'go right';

export const bstSearch: Program<BstInput> = {
  id: 'bst-search',
  code,
  defaultInput: { keys: [10, 5, 15, 3, 7, 12, 18], target: 7 },
  randomInput: (r) => {
    const keys = [...new Set(Array.from({ length: 10 }, () => randomInt(r, 1, 30)))].slice(0, randomInt(r, 6, 8));
    return { keys, target: r() < 0.7 ? keys[randomInt(r, 0, keys.length - 1)]! : 31 };
  },
  describe: ({ keys, target }) => `insert ${keys.join(', ')}; search for ${target}`,
  reference: ({ keys, target }) => keys.includes(target),
  run({ keys, target }) {
    const t = new Tracer();
    const built: number[] = [];
    t.step(null, `Build a search tree from ${keys.join(', ')}: each key goes left if smaller, right if bigger. Then search it for ${target}.`, {}, [treeView(bstFrom([]))]);
    for (const k of keys) {
      built.push(k);
      t.step(null, `Insert ${k}.`, { key: k }, [treeView(bstFrom(built), [k])]);
    }
    const tree = bstFrom(keys);
    let node: number | null = tree.root;
    t.step(2, `Search for ${target}, starting at the root, ${node}.`, { key: target, node }, [treeView(tree, node === null ? [] : [node])]);
    let asked = 0;
    while (node !== null) {
      if (target === node) {
        t.step(4, `${target} == ${node}: found it, after ${searchPath(keys, target).length} nodes.`, { result: true }, [treeView(tree, [node])]);
        return t.frames;
      }
      const goLeft = target < node;
      const next: number | null = tree.nodes[String(node)]![goLeft ? 0 : 1];
      const ask =
        asked < 2
          ? (asked++,
            predict(
              `Looking for ${target}; this node is ${node}. Which way?`,
              goLeft ? LEFT : RIGHT,
              goLeft ? `${target} < ${node}, and everything smaller than ${node} is on its left.` : `${target} > ${node}, and everything bigger than ${node} is on its right.`,
              [
                { value: goLeft ? RIGHT : LEFT, why: goLeft ? `Everything on the right is bigger than ${node}, so bigger than ${target}.` : `Everything on the left is smaller than ${node}, so smaller than ${target}.` },
                { value: 'check both sides', why: 'The ordering rule means only one side can hold it. That is what makes the search fast.' },
              ],
              asked,
            ))
          : undefined;
      t.step(goLeft ? 6 : 8, `${target} ${goLeft ? '<' : '>'} ${node}: go ${goLeft ? 'left' : 'right'}${next === null ? ', but there is nothing there' : `, to ${next}`}.`, { key: target, node: next }, [treeView(tree, next === null ? [node] : [next])], ask);
      node = next;
    }
    t.step(9, `Fell off the tree: ${target} isn't in it. Only one path was checked, not every key in ${show(keys)}.`, { result: false }, [treeView(tree)]);
    return t.frames;
  },
};

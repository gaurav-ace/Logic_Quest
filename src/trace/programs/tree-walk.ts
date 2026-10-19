import { predict, randomInt, show, Tracer } from '../tools';
import type { Program, TreeNode, View } from '../types';

// D22 "Tree traversals": one recursive walk passes each node three times: before its left
// subtree (pre-order), between its subtrees (in-order), and after both (post-order).

export interface BinTree {
  /** key -> [left, right] */
  nodes: Record<string, [number | null, number | null]>;
  root: number | null;
}

const code = [
  'def walk(node):',
  '    if node is None: return',
  '    pre.append(node.val)',
  '    walk(node.left)',
  '    ino.append(node.val)',
  '    walk(node.right)',
  '    post.append(node.val)',
];

/** A binary search tree from keys inserted in order. */
export function bstFrom(keys: number[]): BinTree {
  const nodes: BinTree['nodes'] = {};
  let root: number | null = null;
  for (const k of keys) {
    if (String(k) in nodes) continue;
    nodes[String(k)] = [null, null];
    if (root === null) {
      root = k;
      continue;
    }
    let at = root;
    for (;;) {
      const side = k < at ? 0 : 1;
      const next = nodes[String(at)]![side];
      if (next === null) {
        nodes[String(at)]![side] = k;
        break;
      }
      at = next!;
    }
  }
  return { nodes, root };
}

export function orders(tree: BinTree): [number[], number[], number[]] {
  const pre: number[] = [];
  const ino: number[] = [];
  const post: number[] = [];
  const walk = (v: number | null): void => {
    if (v === null) return;
    const [l, r] = tree.nodes[String(v)]!;
    pre.push(v);
    walk(l);
    ino.push(v);
    walk(r);
    post.push(v);
  };
  walk(tree.root);
  return [pre, ino, post];
}

export function treeView(tree: BinTree, highlight: number[] = [], label = 'tree'): View {
  const nodes: TreeNode[] = Object.entries(tree.nodes).map(([k, [l, r]]) => ({ id: k, value: Number(k), children: [l === null ? null : String(l), r === null ? null : String(r)] }));
  return { type: 'tree', label, shape: 'binary', nodes, root: tree.root === null ? null : String(tree.root), highlight: highlight.map(String) };
}

export const treeWalk: Program<number[]> = {
  id: 'tree-walk',
  code,
  defaultInput: [8, 4, 10, 2, 6, 12],
  randomInput: (r) => {
    const keys = [...new Set(Array.from({ length: 9 }, () => randomInt(r, 1, 20)))].slice(0, randomInt(r, 5, 7));
    return keys;
  },
  describe: (keys) => `a tree built from ${keys.join(', ')}`,
  reference: (keys) => orders(bstFrom(keys)),
  run(keys) {
    const t = new Tracer();
    const tree = bstFrom(keys);
    const pre: number[] = [];
    const ino: number[] = [];
    const post: number[] = [];
    const lists = (): View[] => [
      { type: 'array', label: 'pre-order (on the way down)', values: [...pre] },
      { type: 'array', label: 'in-order (between the two sides)', values: [...ino] },
      { type: 'array', label: 'post-order (on the way back up)', values: [...post] },
    ];
    t.step(null, 'One walk, three orders: it records each node before its left side, between its two sides, and after both.', {}, [treeView(tree), ...lists()]);
    const [, inOrder] = orders(tree);
    let asked = 0;
    const walk = (v: number | null): void => {
      if (v === null) return;
      const [l, r] = tree.nodes[String(v)]!;
      pre.push(v);
      t.step(3, `Arrive at ${v}: add it to pre-order.`, { node: v }, [treeView(tree, [v]), ...lists()]);
      walk(l);
      const ask =
        asked < 2 && ino.length >= 1
          ? (asked++,
            predict(
              `In-order so far is ${show(ino)}. The walk is back at ${v} after its left side. What is added to in-order now?`,
              v,
              `In-order adds a node between its left and right sides: ${v}. For a search tree that gives the keys in sorted order.`,
              [
                { value: r ?? inOrder[ino.length + 1] ?? (v + 1), why: `That is on ${v}'s right side, which comes after ${v}.` },
                { value: l ?? pre[0]!, why: l === null ? 'That was added earlier.' : `${l} is in the left side, already done.` },
              ],
              asked + v,
            ))
          : undefined;
      ino.push(v);
      t.step(5, `Back at ${v} after its left side: add it to in-order.`, { node: v }, [treeView(tree, [v]), ...lists()], ask);
      walk(r);
      post.push(v);
      t.step(7, `Both sides of ${v} are done: add it to post-order.`, { node: v }, [treeView(tree, [v]), ...lists()]);
    };
    walk(tree.root);
    t.step(null, `In-order is ${show(ino)}: sorted, because this is a search tree. Pre-order starts at the root; post-order ends with it.`, { result: [pre, ino, post] }, [treeView(tree), ...lists()]);
    return t.frames;
  },
};

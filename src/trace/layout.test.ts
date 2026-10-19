import { describe, expect, it } from 'vitest';
import { layoutTree } from './layout';
import { seeded } from './tools';
import type { TreeNode } from './types';

/** A random binary search tree from random keys. */
function randomBst(seed: number): { nodes: TreeNode[]; root: string } {
  const r = seeded(seed);
  const keys = [...new Set(Array.from({ length: 4 + Math.floor(r() * 10) }, () => Math.floor(r() * 50)))];
  const nodes = new Map<string, TreeNode>();
  const root = String(keys[0]);
  for (const k of keys) {
    const id = String(k);
    nodes.set(id, { id, value: k, children: [null, null] });
    if (id === root) continue;
    let at = nodes.get(root)!;
    for (;;) {
      const side = k < (at.value as number) ? 0 : 1;
      const next = at.children[side];
      if (next === null || next === undefined) {
        at.children[side] = id;
        break;
      }
      at = nodes.get(next)!;
    }
  }
  return { nodes: [...nodes.values()], root };
}

describe('layoutTree, binary', () => {
  it('places every node once, children one row below, left < parent < right, no shared columns', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { nodes, root } = randomBst(seed);
      const placed = layoutTree(nodes, root, 'binary');
      const at = new Map(placed.map((p) => [p.id, p]));
      expect(placed).toHaveLength(nodes.length);
      expect(new Set(placed.map((p) => p.x)).size).toBe(nodes.length);
      for (const n of nodes) {
        const [left, right] = n.children;
        const me = at.get(n.id)!;
        if (left) expect(at.get(left)!.x).toBeLessThan(me.x);
        if (right) expect(at.get(right)!.x).toBeGreaterThan(me.x);
        for (const c of n.children) if (c) expect(at.get(c)!.y).toBe(me.y + 1);
      }
    }
  });

  it('an in-order walk of a BST layout reads the keys in sorted order', () => {
    const { nodes, root } = randomBst(7);
    const placed = layoutTree(nodes, root, 'binary').sort((a, b) => a.x - b.x);
    const keys = placed.map((p) => Number(p.id));
    expect(keys).toEqual([...keys].sort((a, b) => a - b));
  });

  it('handles an empty tree and a missing child id', () => {
    expect(layoutTree([], null, 'binary')).toEqual([]);
    expect(layoutTree([{ id: 'a', value: 1, children: ['ghost', null] }], 'a', 'binary')).toEqual([{ id: 'a', x: 0, y: 0 }]);
  });

  it('does not loop forever on a cycle in bad data', () => {
    const nodes: TreeNode[] = [{ id: 'a', value: 1, children: ['b', null] }, { id: 'b', value: 2, children: ['a', null] }];
    expect(layoutTree(nodes, 'a', 'binary')).toHaveLength(2);
  });
});

describe('layoutTree, n-ary', () => {
  it('puts leaves in order and parents over the middle of their children', () => {
    const nodes: TreeNode[] = [
      { id: 'r', value: '', children: ['c', 'd'] },
      { id: 'c', value: 'c', children: ['a', 'o'] },
      { id: 'a', value: 'a', children: [] },
      { id: 'o', value: 'o', children: [] },
      { id: 'd', value: 'd', children: [] },
    ];
    const at = new Map(layoutTree(nodes, 'r', 'nary').map((p) => [p.id, p]));
    expect([at.get('a')!.x, at.get('o')!.x, at.get('d')!.x]).toEqual([0, 1, 2]);
    expect(at.get('c')!.x).toBe(0.5);
    expect(at.get('r')!.x).toBe(1.25);
    expect(at.get('a')!.y).toBe(2);
  });
});

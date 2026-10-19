import type { TreeNode } from './types';

// Tree layout in "slots": x is a column, y is the depth. The renderer multiplies by pixel sizes.
// Kept pure so the rules (children below parents, left before right, no overlaps) are tested.

export interface Placed {
  id: string;
  x: number;
  y: number;
}

export function layoutTree(nodes: TreeNode[], root: string | null, shape: 'binary' | 'nary'): Placed[] {
  if (root === null) return [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: Placed[] = [];
  const seen = new Set<string>();

  if (shape === 'binary') {
    // In-order position as the column: left subtree, node, right subtree. This keeps every
    // left child left of its parent and every right child right of it, with no two nodes sharing a column.
    let column = 0;
    const visit = (id: string | null, depth: number): void => {
      if (id === null || seen.has(id)) return;
      seen.add(id);
      const n = byId.get(id);
      if (!n) return;
      visit(n.children[0] ?? null, depth + 1);
      out.push({ id, x: column++, y: depth });
      visit(n.children[1] ?? null, depth + 1);
    };
    visit(root, 0);
    return out;
  }

  // n-ary: leaves take consecutive columns; a parent sits over the middle of its children.
  let nextLeaf = 0;
  const visit = (id: string, depth: number): number => {
    seen.add(id);
    const n = byId.get(id)!;
    const kids = n.children.filter((c): c is string => c !== null && byId.has(c) && !seen.has(c));
    const xs = kids.map((c) => visit(c, depth + 1));
    const x = xs.length ? (xs[0]! + xs.at(-1)!) / 2 : nextLeaf++;
    out.push({ id, x, y: depth });
    return x;
  };
  visit(root, 0);
  return out;
}

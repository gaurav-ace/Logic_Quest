// A stable, seeded order for showing answer options (Phase 7). Many older questions list the right
// answer first, so tapping the first option scored well; showing options in a shuffled order makes
// the learner read them. The order depends only on the seed, so a question looks the same each
// time it's drawn (no jumping around on a redraw), and answers are still recorded by the option's
// original index, so saved progress keeps its meaning.

/** A permutation of 0..n-1 from the seed text (FNV-1a hash, then a Fisher–Yates shuffle). */
export function seededOrder(n: number, seed: string): number[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0;
    const j = h % (i + 1);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

/** The items in their display order for this seed. */
export function inSeededOrder<T>(items: T[], seed: string): T[] {
  return seededOrder(items.length, seed).map((i) => items[i]!);
}

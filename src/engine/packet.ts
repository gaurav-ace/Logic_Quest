import type { Edge } from '../lesson/schema';

export interface Point {
  x: number;
  y: number;
}

/**
 * Where the packet is after `progress` (0 to 1) of a step's path. Each hop takes an equal
 * share of the time, so a 2-hop path reaches the middle node at progress 0.5.
 * An empty path has no packet to show, so it returns null.
 */
export function packetPosition(path: Edge[], at: (id: string) => Point, progress: number): Point | null {
  if (path.length === 0) return null;
  const p = Math.min(Math.max(progress, 0), 1);
  const scaled = p * path.length;
  const index = Math.min(Math.floor(scaled), path.length - 1);
  const [fromId, toId] = path[index]!;
  const a = at(fromId);
  const b = at(toId);
  const u = scaled - index;
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}

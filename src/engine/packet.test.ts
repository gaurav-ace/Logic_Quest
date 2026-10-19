import { describe, expect, it } from 'vitest';
import type { Edge } from '../lesson/schema';
import { packetPosition, type Point } from './packet';

const nodes: Record<string, Point> = { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, c: { x: 100, y: 50 } };
const at = (id: string): Point => {
  const p = nodes[id];
  if (!p) throw new Error(`unknown node ${id}`);
  return p;
};

describe('packetPosition', () => {
  const two: Edge[] = [
    ['a', 'b'],
    ['b', 'c'],
  ];

  it('starts at the first node and ends at the last', () => {
    expect(packetPosition(two, at, 0)).toEqual({ x: 0, y: 0 });
    expect(packetPosition(two, at, 1)).toEqual({ x: 100, y: 50 });
  });

  it('splits time equally between hops', () => {
    expect(packetPosition(two, at, 0.25)).toEqual({ x: 50, y: 0 });
    expect(packetPosition(two, at, 0.5)).toEqual({ x: 100, y: 0 });
    expect(packetPosition(two, at, 0.75)).toEqual({ x: 100, y: 25 });
  });

  it('follows a hop backwards along an edge', () => {
    expect(packetPosition([['b', 'a']], at, 0.5)).toEqual({ x: 50, y: 0 });
  });

  it('clamps progress outside 0..1', () => {
    expect(packetPosition(two, at, -1)).toEqual({ x: 0, y: 0 });
    expect(packetPosition(two, at, 7)).toEqual({ x: 100, y: 50 });
  });

  it('returns null when the step has no path', () => {
    expect(packetPosition([], at, 0.5)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { classLayoutProblems, layoutClasses, layoutSequence, segmentHitsRect, sequenceLayoutProblems, UML_W, type ClassBox, type ClassDiagram, type Rect } from './uml';

const box = (id: string, col: ClassBox['col'], row: number, members = 1): ClassBox => ({ id, name: id, col, row, methods: Array.from({ length: members }, (_, i) => `m${i}()`) });
const diagram = (classes: ClassBox[], relations: ClassDiagram['relations'] = []): ClassDiagram => ({ type: 'class', classes, relations });
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const onEdge = (x: number, y: number, r: Rect) => {
  const inX = x >= r.x - 0.01 && x <= r.x + r.w + 0.01;
  const inY = y >= r.y - 0.01 && y <= r.y + r.h + 0.01;
  return inX && inY && (Math.abs(x - r.x) < 0.01 || Math.abs(x - r.x - r.w) < 0.01 || Math.abs(y - r.y) < 0.01 || Math.abs(y - r.y - r.h) < 0.01);
};

describe('class layout', () => {
  it('places boxes in their cells without overlapping, inside the phone width', () => {
    const d = diagram([box('a', 0, 0, 3), box('b', 1, 0, 1), box('c', 'both', 1, 5), box('d', 0, 2), box('e', 1, 2, 4)]);
    const l = layoutClasses(d);
    for (const c of l.classes) {
      expect(c.x).toBeGreaterThanOrEqual(2);
      expect(c.x + c.w).toBeLessThanOrEqual(UML_W - 2);
      expect(c.y + c.h).toBeLessThanOrEqual(l.height);
    }
    for (const a of l.classes) for (const b of l.classes) if (a !== b) expect(overlaps(a, b), `${a.box.id} ${b.box.id}`).toBe(false);
    // A row is as tall as its tallest box, so the next row starts below it.
    const [a, b, c] = l.classes;
    expect(a!.h).toBeGreaterThan(b!.h);
    expect(c!.y).toBeGreaterThan(a!.y + a!.h);
  });

  it('starts and ends every relation on the edges of its two boxes', () => {
    const d = diagram([box('p', 'both', 0), box('a', 0, 1), box('b', 1, 1), box('c', 1, 2)], [
      { from: 'a', to: 'p', type: 'inherits' },
      { from: 'b', to: 'p', type: 'implements' },
      { from: 'a', to: 'b', type: 'uses' },
      { from: 'b', to: 'c', type: 'has' },
      { from: 'a', to: 'c', type: 'uses' },
    ]);
    const l = layoutClasses(d);
    const at = new Map(l.classes.map((c) => [c.box.id, c]));
    for (const r of l.relations) {
      expect(onEdge(r.x1, r.y1, at.get(r.rel.from)!), `${r.rel.from} start`).toBe(true);
      expect(onEdge(r.x2, r.y2, at.get(r.rel.to)!), `${r.rel.to} end`).toBe(true);
    }
    // Boxes sharing columns get a straight vertical line; side by side, a horizontal one.
    const [toP, , across] = l.relations;
    expect(toP!.x1).toBe(toP!.x2);
    expect(across!.y1).toBe(across!.y2);
    expect(classLayoutProblems(d)).toEqual([]);
  });

  it('reports shared cells, wide text, too many members, crossing lines and boxes too close', () => {
    expect(classLayoutProblems(diagram([box('a', 0, 0), box('b', 0, 0)]))).toContain('"b" and "a" share row 0');
    expect(classLayoutProblems(diagram([box('a', 'both', 0), box('b', 1, 0)]))).toContain('"b" and "a" share row 0');
    expect(classLayoutProblems(diagram([{ ...box('a', 0, 0), name: 'AVeryLongClassName' }]))[0]).toMatch(/name .* too wide/);
    expect(classLayoutProblems(diagram([{ ...box('a', 'both', 0), name: 'AVeryLongClassName' }]))).toEqual([]);
    expect(classLayoutProblems(diagram([{ ...box('a', 0, 0), methods: ['calculate_total_fee()'] }]))[0]).toMatch(/too wide/);
    expect(classLayoutProblems(diagram([box('a', 0, 0, 6)]))).toContain('"a" has 6 members; at most 5 stay readable');
    const crossing = diagram([box('a', 0, 0), box('mid', 0, 1), box('c', 0, 2)], [{ from: 'a', to: 'c', type: 'uses' }]);
    expect(classLayoutProblems(crossing)).toContain('the line from "a" to "c" crosses "mid"');
  });
});

describe('segmentHitsRect', () => {
  const r = { x: 10, y: 10, w: 20, h: 20 };
  it('finds segments through the inside, and ignores ones that miss or only touch', () => {
    expect(segmentHitsRect({ x1: 0, y1: 20, x2: 40, y2: 20 }, r)).toBe(true);
    expect(segmentHitsRect({ x1: 0, y1: 0, x2: 40, y2: 40 }, r)).toBe(true);
    expect(segmentHitsRect({ x1: 0, y1: 0, x2: 5, y2: 40 }, r)).toBe(false);
    expect(segmentHitsRect({ x1: 0, y1: 10, x2: 40, y2: 10 }, r)).toBe(false);
    expect(segmentHitsRect({ x1: 20, y1: 0, x2: 20, y2: 10 }, r)).toBe(false);
  });
});

describe('sequence layout', () => {
  it('gives each actor a lane and keeps every label inside the diagram', () => {
    const l = layoutSequence({ type: 'sequence', actors: ['A', 'B', 'C', 'D'], calls: [
      { from: 'A', to: 'B', label: 'short' },
      { from: 'D', to: 'C', label: 'a much longer label here' },
      { from: 'A', to: 'D', label: 'x' },
    ] });
    expect(l.actors.map((a) => a.x)).toEqual([38, 114, 190, 266]);
    for (const c of l.calls) {
      const half = (`${l.calls.indexOf(c) + 1}. ${c.call.label}`.length * 8) / 2;
      expect(c.labelX - half).toBeGreaterThanOrEqual(4);
      expect(c.labelX + half).toBeLessThanOrEqual(UML_W - 4);
    }
    // Calls go down the page in order.
    expect(l.calls[1]!.y).toBeGreaterThan(l.calls[0]!.y);
    expect(l.height).toBeGreaterThan(l.calls[2]!.y);
  });

  it('reports too many actors, unknown actors, self calls and long labels', () => {
    const p = sequenceLayoutProblems({ type: 'sequence', actors: ['A', 'B', 'C', 'D', 'E'], calls: [
      { from: 'A', to: 'Z', label: 'x' },
      { from: 'B', to: 'B', label: 'x' },
      { from: 'A', to: 'B', label: 'x'.repeat(40) },
    ] });
    expect(p).toContain('needs 2 to 4 actors to fit a phone');
    expect(p).toContain('call 1 names an unknown actor');
    expect(p.some((x) => x.includes('call 2 goes from "B" to itself'))).toBe(true);
    expect(p).toContain("call 3's label is too long");
    expect(sequenceLayoutProblems({ type: 'sequence', actors: ['Checkout', 'B'], calls: [{ from: 'Checkout', to: 'B', label: 'x' }] })).toEqual([]);
    expect(sequenceLayoutProblems({ type: 'sequence', actors: ['Checkout', 'B', 'C', 'D'], calls: [{ from: 'Checkout', to: 'B', label: 'x' }] })).toContain('actor "Checkout" is too wide for its column');
  });
});

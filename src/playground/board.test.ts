import { describe, expect, it } from 'vitest';
import { seeded } from '../trace/tools';
import {
  BOX, GRID, HISTORY_MAX, KINDS, LIMITS, NOTE, WORLD, addShape, arrowEnds, commit, connect, connectProblem, edgePoint, emptyBoard, history, moveShape, nudge,
  parseBoard, redo, relabel, relabelArrow, remove, rename, resizeNote, reverseArrow, shapeAt, snap, undo, type Board, type Kind,
} from './board';

const two = () => {
  let b = emptyBoard();
  b = addShape(b, 'service', 200, 200).board;
  b = addShape(b, 'db', 600, 200).board;
  return b;
};

/** The rules every board must keep, whatever was done to it. */
function checkRules(b: Board): void {
  const ids = new Set(b.shapes.map((s) => s.id));
  expect(ids.size).toBe(b.shapes.length);
  expect(b.shapes.length).toBeLessThanOrEqual(LIMITS.shapes);
  expect(b.arrows.length).toBeLessThanOrEqual(LIMITS.arrows);
  for (const s of b.shapes) {
    expect(s.x % GRID === 0 && s.y % GRID === 0, s.id).toBe(true);
    expect(s.x >= 0 && s.y >= 0 && s.x + s.width <= WORLD.width && s.y + s.height <= WORLD.height, s.id).toBe(true);
    if (s.kind !== 'note') expect([s.width, s.height]).toEqual([BOX.width, BOX.height]);
    expect(s.label.length).toBeLessThanOrEqual(s.kind === 'note' ? LIMITS.note : LIMITS.label);
  }
  const pairs = new Set<string>();
  for (const a of b.arrows) {
    expect(ids.has(a.from) && ids.has(a.to) && a.from !== a.to, a.id).toBe(true);
    expect(pairs.has(`${a.from}>${a.to}`)).toBe(false);
    pairs.add(`${a.from}>${a.to}`);
  }
}

describe('shapes', () => {
  it('are added centred on the tap, snapped to the grid, with numbered ids', () => {
    const { board, id } = addShape(emptyBoard(), 'cache', 333, 247);
    expect(id).toBe('s1');
    expect(board.shapes[0]).toEqual({ id: 's1', kind: 'cache', x: snap(333 - 70), y: snap(247 - 30), width: BOX.width, height: BOX.height, label: 'Cache' });
    expect(addShape(board, 'db', 0, 0).id).toBe('s2');
  });

  it('stay on the board, even when placed or moved past an edge', () => {
    let b = addShape(emptyBoard(), 'db', -500, 5000).board;
    expect([b.shapes[0]!.x, b.shapes[0]!.y]).toEqual([0, WORLD.height - BOX.height]);
    b = moveShape(b, 's1', 99999, -3);
    expect([b.shapes[0]!.x, b.shapes[0]!.y]).toEqual([WORLD.width - BOX.width, 0]);
    b = nudge(b, 's1', 1, -1);
    expect([b.shapes[0]!.x, b.shapes[0]!.y]).toEqual([WORLD.width - BOX.width, 0]);
  });

  it('a full board adds nothing', () => {
    let b = emptyBoard();
    for (let i = 0; i < LIMITS.shapes; i++) b = addShape(b, 'box', 100, 100).board;
    expect(addShape(b, 'box', 100, 100)).toEqual({ board: b, id: null });
  });

  it('only notes resize, within their limits', () => {
    let b = addShape(emptyBoard(), 'note', 300, 300).board;
    b = addShape(b, 'db', 700, 300).board;
    b = resizeNote(b, 's1', 1000, 1000);
    expect([b.shapes[0]!.width, b.shapes[0]!.height]).toEqual([NOTE.max.width, NOTE.max.height]);
    b = resizeNote(b, 's1', -1000, -1000);
    expect([b.shapes[0]!.width, b.shapes[0]!.height]).toEqual([NOTE.min.width, NOTE.min.height]);
    expect(resizeNote(b, 's2', 100, 100)).toEqual(b);
  });

  it('labels are trimmed, single-spaced and capped', () => {
    const b = relabel(two(), 's1', `  Orders   API ${'x'.repeat(50)}`);
    expect(b.shapes[0]!.label).toBe(`Orders API ${'x'.repeat(50)}`.slice(0, LIMITS.label));
    expect(rename(b, '   ').name).toBe(b.name);
  });

  it('the topmost shape is found at a point', () => {
    let b = addShape(emptyBoard(), 'db', 200, 200).board;
    b = addShape(b, 'cache', 220, 210).board;
    expect(shapeAt(b, 200, 200)?.id).toBe('s2');
    expect(shapeAt(b, 5, 5)).toBeNull();
  });
});

describe('arrows', () => {
  it('connect two boxes, and refuse self-links, notes, missing ends and repeats', () => {
    let b = addShape(two(), 'note', 400, 600).board;
    const made = connect(b, 's1', 's2', 'SQL');
    expect(made.id).toBe('a1');
    b = made.board;
    expect(connectProblem(b, 's1', 's1')).toMatch(/two different/);
    expect(connectProblem(b, 's1', 's3')).toMatch(/Notes/);
    expect(connectProblem(b, 's1', 's9')).toMatch(/on the board/);
    expect(connectProblem(b, 's1', 's2')).toMatch(/already/);
    // The other direction is a different arrow (a reply, say).
    expect(connectProblem(b, 's2', 's1')).toBeNull();
  });

  it('reverse, unless an arrow already goes the other way', () => {
    let b = connect(two(), 's1', 's2').board;
    b = reverseArrow(b, 'a1');
    expect(b.arrows[0]).toMatchObject({ from: 's2', to: 's1' });
    b = connect(b, 's1', 's2').board;
    expect(reverseArrow(b, 'a1')).toEqual(b);
  });

  it('removing a box removes its arrows; removing an arrow leaves the boxes', () => {
    let b = addShape(two(), 'cache', 400, 500).board;
    b = connect(b, 's1', 's2').board;
    b = connect(b, 's1', 's3').board;
    expect(remove(b, 'a2')).toMatchObject({ shapes: b.shapes, arrows: [b.arrows[0]] });
    const without = remove(b, 's1');
    expect(without.shapes.map((s) => s.id)).toEqual(['s2', 's3']);
    expect(without.arrows).toEqual([]);
    expect(relabelArrow(b, 'a1', '  reads ').arrows[0]!.label).toBe('reads');
  });

  it('start and end on the box edges, along the line between centres', () => {
    const r = seeded(4);
    const s = { x: 100, y: 100, width: 140, height: 60 };
    for (let k = 0; k < 500; k++) {
      const tx = r() * 1200;
      const ty = r() * 800;
      const p = edgePoint(s, tx, ty);
      const onEdge = Math.abs(p.x - s.x) < 1e-9 || Math.abs(p.x - (s.x + s.width)) < 1e-9 || Math.abs(p.y - s.y) < 1e-9 || Math.abs(p.y - (s.y + s.height)) < 1e-9;
      const inside = p.x >= s.x - 1e-9 && p.x <= s.x + s.width + 1e-9 && p.y >= s.y - 1e-9 && p.y <= s.y + s.height + 1e-9;
      // Same direction from the centre as the target (cross product zero, dot product positive).
      const [cx, cy] = [170, 130];
      const cross = (p.x - cx) * (ty - cy) - (p.y - cy) * (tx - cx);
      const inBox = tx >= s.x && tx <= s.x + s.width && ty >= s.y && ty <= s.y + s.height;
      if (!inBox) expect(onEdge && inside && Math.abs(cross) < 1e-6 && (p.x - cx) * (tx - cx) + (p.y - cy) * (ty - cy) >= 0).toBe(true);
    }
    expect(edgePoint(s, 170, 130)).toEqual({ x: 170, y: 130 });
    const ends = arrowEnds(connect(two(), 's1', 's2').board, { id: 'a1', from: 's1', to: 's2', label: '' })!;
    expect(ends.x1).toBe(two().shapes[0]!.x + BOX.width);
    expect(ends.x2).toBe(two().shapes[1]!.x);
  });
});

describe('undo and redo', () => {
  it('step back and forward, and a new edit clears what could be redone', () => {
    let h = history(emptyBoard());
    h = commit(h, addShape(h.present, 'db', 100, 100).board);
    h = commit(h, addShape(h.present, 'cache', 400, 100).board);
    h = undo(h);
    expect(h.present.shapes).toHaveLength(1);
    h = redo(h);
    expect(h.present.shapes).toHaveLength(2);
    h = undo(undo(h));
    expect(h.present.shapes).toHaveLength(0);
    expect(undo(h)).toBe(h);
    h = commit(h, addShape(h.present, 'queue', 100, 100).board);
    expect(redo(h)).toBe(h);
  });

  it('an edit that changes nothing is not recorded, and the history is capped', () => {
    let h = history(two());
    expect(commit(h, moveShape(h.present, 's1', h.present.shapes[0]!.x, h.present.shapes[0]!.y))).toBe(h);
    for (let i = 0; i < HISTORY_MAX + 20; i++) h = commit(h, nudge(h.present, 's1', i % 2 ? 1 : -1, 0));
    expect(h.past).toHaveLength(HISTORY_MAX);
  });
});

describe('files', () => {
  it('reject bad boards with a reason', () => {
    const good = connect(two(), 's1', 's2', 'reads').board;
    const bad = (change: (b: Record<string, unknown>) => void) => {
      const b = JSON.parse(JSON.stringify(good)) as Record<string, unknown>;
      change(b);
      return parseBoard(b);
    };
    expect(parseBoard(good)).toEqual({ ok: true, board: good });
    expect(parseBoard('x')).toEqual({ ok: false, problem: 'it is not a Logic Quest board' });
    expect(bad((b) => (b.version = 2))).toMatchObject({ ok: false, problem: expect.stringMatching(/version 2/) });
    expect(bad((b) => ((b.shapes as { kind: string }[])[0]!.kind = 'rocket'))).toMatchObject({ ok: false, problem: 'shape s1 has an unknown kind' });
    expect(bad((b) => ((b.shapes as { id: string }[])[1]!.id = 's1'))).toMatchObject({ ok: false, problem: 'shape id s1 is used twice' });
    expect(bad((b) => ((b.arrows as { to: string }[])[0]!.to = 's9'))).toMatchObject({ ok: false, problem: expect.stringMatching(/doesn't join two shapes/) });
    expect(bad((b) => (b.arrows as unknown[]).push({ ...good.arrows[0]!, id: 'a2' }))).toMatchObject({ ok: false, problem: 'arrow a2 repeats another arrow' });
    expect(bad((b) => ((b.shapes as { x: unknown }[])[0]!.x = 'left'))).toMatchObject({ ok: false });
  });

  it('snap off-grid positions back onto the board', () => {
    const b = two();
    const odd = { ...b, shapes: [{ ...b.shapes[0]!, x: 1233, y: -7 }, b.shapes[1]!] };
    const read = parseBoard(odd);
    expect(read.ok && [read.board.shapes[0]!.x, read.board.shapes[0]!.y]).toEqual([WORLD.width - BOX.width, 0]);
  });
});

describe('random editing keeps every rule', () => {
  it('300 random sessions of 60 edits each, with a save-and-load round trip after each edit', () => {
    const r = seeded(9);
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
    for (let session = 0; session < 300; session++) {
      let h = history(emptyBoard());
      for (let step = 0; step < 60; step++) {
        const b = h.present;
        const anyShape = () => (b.shapes.length ? pick(b.shapes).id : 's1');
        const roll = r();
        let next: Board;
        if (roll < 0.3) next = addShape(b, pick(KINDS) as Kind, r() * 1400 - 100, r() * 1000 - 100).board;
        else if (roll < 0.45) next = connect(b, anyShape(), anyShape(), pick(['', 'reads', 'writes'])).board;
        else if (roll < 0.55) next = moveShape(b, anyShape(), r() * 1400 - 100, r() * 1000 - 100);
        else if (roll < 0.62) next = nudge(b, anyShape(), pick([-1, 0, 1]), pick([-1, 0, 1]));
        else if (roll < 0.67) next = resizeNote(b, anyShape(), pick([-40, 40]), pick([-20, 20]));
        else if (roll < 0.72) next = relabel(b, anyShape(), pick(['API', '  long   label '.repeat(5), '']));
        else if (roll < 0.8) next = remove(b, b.arrows.length && r() < 0.5 ? pick(b.arrows).id : anyShape());
        else if (roll < 0.85) next = b.arrows.length ? reverseArrow(b, pick(b.arrows).id) : b;
        else if (roll < 0.93) {
          h = undo(h);
          continue;
        } else {
          h = redo(h);
          continue;
        }
        h = commit(h, next);
        checkRules(h.present);
        expect(parseBoard(JSON.parse(JSON.stringify(h.present)))).toEqual({ ok: true, board: h.present });
      }
    }
    // About 2 s alone; several times that when every test file runs at once.
  }, 30_000);
});

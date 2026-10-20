import { describe, expect, it } from 'vitest';
import { BOX, LIMITS, NOTE, addShape, connect, emptyBoard, relabel, relabelArrow } from './board';
import { BoardStore, BOARDS_MAX } from './store';
import { boardSvg, escapeXml, wrapLabel } from './svg';

describe('labels', () => {
  it('a short label stays on one line', () => {
    expect(wrapLabel('Cache', BOX)).toEqual(['Cache']);
  });

  it('wraps at spaces, never past the box, and marks text that was cut', () => {
    for (const text of ['Orders API service', 'Payments worker for refunds', 'x'.repeat(LIMITS.label), 'a bb ccc dddd eeeee ffffff']) {
      const lines = wrapLabel(text, BOX);
      expect(lines.length).toBeLessThanOrEqual(2);
      for (const l of lines) expect(l.length, text).toBeLessThanOrEqual(16);
      if (!lines.at(-1)!.endsWith('…')) expect(lines.join(' ').replace(/ /g, '')).toBe(text.replace(/ /g, ''));
    }
    expect(wrapLabel('Payments worker for refunds and more', BOX).at(-1)).toMatch(/…$/);
  });

  it('a big note holds more lines than a box', () => {
    const lines = wrapLabel('word '.repeat(80).trim(), NOTE.max);
    expect(lines).toHaveLength(10);
  });
});

describe('SVG export', () => {
  it('draws every box and arrow, and labels can never become markup', () => {
    let b = addShape(emptyBoard('<Plan>'), 'service', 200, 200).board;
    b = addShape(b, 'db', 600, 200).board;
    b = relabel(b, 's1', '<script>x</script>');
    b = relabelArrow(connect(b, 's1', 's2').board, 'a1', 'a & b');
    const svg = boardSvg(b);
    expect(svg.match(/<rect /g)).toHaveLength(3); // background + 2 boxes
    expect(svg.match(/<line /g)).toHaveLength(1);
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;x&lt;/');
    expect(svg).toContain('a &amp; b');
    expect(svg).toContain('<title>&lt;Plan&gt;</title>');
    expect(escapeXml(`"'`)).toBe('&quot;&apos;');
  });
});

describe('saved boards', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { m, kv: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } };
  };

  it('first use makes one empty board; boards can be added, switched, saved and deleted', () => {
    const { kv } = mem();
    const s = new BoardStore(kv, 'b');
    const first = s.current();
    expect(first.id).toBe('b1');
    const second = s.create(emptyBoard('Chat'));
    expect(s.current().id).toBe(second.id);
    s.select('b1');
    expect(s.save('b1', addShape(first.board, 'db', 100, 100).board)).toBe(true);
    expect(new BoardStore(kv, 'b').current().board.shapes).toHaveLength(1);
    s.remove('b1');
    expect(s.list().map((b) => b.id)).toEqual(['b2']);
    expect(s.current().id).toBe('b2');
  });

  it('stops at the board limit, drops unreadable boards, and survives failing storage', () => {
    const { m, kv } = mem();
    const s = new BoardStore(kv, 'b');
    for (let i = 0; i < BOARDS_MAX + 3; i++) s.create();
    expect(s.list()).toHaveLength(BOARDS_MAX);
    m.set('b', JSON.stringify({ current: 'b1', boards: [{ id: 'b1', board: { version: 9 } }, { id: 'b2', board: emptyBoard() }] }));
    expect(s.list().map((b) => b.id)).toEqual(['b2']);
    m.set('b', '{not json');
    expect(s.list()).toEqual([]);
    const broken = new BoardStore({ getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } }, 'b');
    expect(broken.list()).toEqual([]);
    expect(broken.save('b1', emptyBoard())).toBe(false);
    expect(new BoardStore(null, 'b').save('b1', emptyBoard())).toBe(false);
  });
});

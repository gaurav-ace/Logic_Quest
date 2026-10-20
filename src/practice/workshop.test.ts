import { describe, expect, it } from 'vitest';
import {
  OUTLINE_MAX, WorkshopStore, addItem, indent, mergeBackup, mergeSave, move, normalise, orderIsRight, outdent, parseSave, parseWorkshopBackup, removeItem, selectionIsRight, shuffledOrder, type OutlineItem, type WorkshopSave,
} from './workshop';

const o = (...items: [string, number][]): OutlineItem[] => items.map(([text, depth]) => ({ text, depth }));
const valid = (outline: OutlineItem[]) => outline.every((x, i) => (i === 0 ? x.depth === 0 : x.depth <= outline[i - 1]!.depth + 1));

describe('outline', () => {
  it('adds items at the depth of the last one, trims, and ignores empty text', () => {
    let out = addItem([], '  Sort  ');
    out = indent(addItem(out, 'Loop'), 1);
    out = addItem(out, 'Compare');
    expect(out).toEqual(o(['Sort', 0], ['Loop', 1], ['Compare', 1]));
    expect(addItem(out, '   ')).toBe(out);
  });

  it('caps the outline length', () => {
    let out: OutlineItem[] = [];
    for (let i = 0; i < OUTLINE_MAX + 5; i++) out = addItem(out, `step ${i}`);
    expect(out).toHaveLength(OUTLINE_MAX);
  });

  it('never indents more than one level under the item above, or the first item at all', () => {
    const out = o(['a', 0], ['b', 0]);
    expect(indent(out, 0)).toEqual(out);
    expect(indent(indent(out, 1), 1)).toEqual(o(['a', 0], ['b', 1]));
  });

  it('outdenting brings nested items along', () => {
    const out = o(['a', 0], ['b', 1], ['c', 2], ['d', 1]);
    expect(outdent(out, 1)).toEqual(o(['a', 0], ['b', 0], ['c', 1], ['d', 1]));
    expect(outdent(out, 0)).toBe(out);
  });

  it('moving and removing keep the outline valid', () => {
    const out = o(['a', 0], ['b', 1], ['c', 0]);
    expect(move(out, 1, -1)).toEqual(o(['b', 0], ['a', 0], ['c', 0]));
    expect(move(out, 2, 1)).toBe(out);
    expect(removeItem(out, 0)).toEqual(o(['b', 0], ['c', 0]));
  });

  it('any sequence of operations leaves a valid outline (random walk)', () => {
    let out = o(['a', 0], ['b', 1], ['c', 2], ['d', 0], ['e', 1]);
    let seed = 1;
    const rand = (n: number) => (seed = (seed * 1103515245 + 12345) % 2 ** 31) % n;
    for (let k = 0; k < 2000; k++) {
      const i = rand(Math.max(out.length, 1));
      const op = rand(5);
      out = op === 0 ? indent(out, i) : op === 1 ? outdent(out, i) : op === 2 ? move(out, i, rand(2) ? 1 : -1) : op === 3 && out.length > 2 ? removeItem(out, i) : addItem(out, `x${k}`);
      expect(valid(out)).toBe(true);
    }
  });

  it('normalise repairs a bad outline', () => {
    expect(normalise(o(['a', 2], ['b', 5]))).toEqual(o(['a', 0], ['b', 1]));
  });
});

describe('checks', () => {
  it('the shuffle is stable, a real permutation, and never the answer', () => {
    for (let n = 3; n <= 6; n++) {
      for (let s = 0; s < 200; s++) {
        const parts = Array.from({ length: n }, (_, i) => `p${i}`);
        const order = shuffledOrder(parts, `item-${s}`);
        expect([...order].sort()).toEqual(parts.map((_, i) => i));
        expect(orderIsRight(order, n)).toBe(false);
        expect(shuffledOrder(parts, `item-${s}`)).toEqual(order);
      }
    }
  });

  it('order and selection are judged exactly', () => {
    expect(orderIsRight([0, 1, 2], 3)).toBe(true);
    expect(orderIsRight([0, 1], 3)).toBe(false);
    expect(orderIsRight([1, 0, 2], 3)).toBe(false);
    const cases = [{ pick: true }, { pick: false }, { pick: true }];
    expect(selectionIsRight(new Set([0, 2]), cases)).toBe(true);
    expect(selectionIsRight(new Set([0]), cases)).toBe(false);
    expect(selectionIsRight(new Set([0, 1, 2]), cases)).toBe(false);
  });
});

describe('saving', () => {
  class KV {
    map = new Map<string, string>();
    fail = false;
    getItem(k: string) {
      return this.map.get(k) ?? null;
    }
    setItem(k: string, v: string) {
      if (this.fail) throw new Error('full');
      this.map.set(k, v);
    }
  }

  it('saves per problem and reads back, without touching other problems', () => {
    const kv = new KV();
    const s = new WorkshopStore(kv, 'w');
    s.save('a', { step: 2, notes: { '0': 'in: list' }, outline: o(['sort', 0]) });
    s.save('b', { step: 1, notes: {}, outline: [] });
    expect(new WorkshopStore(kv, 'w').load('a', 6)).toEqual({ step: 2, notes: { '0': 'in: list' }, outline: o(['sort', 0]) });
    expect(s.load('b', 6).step).toBe(1);
    expect(s.load('missing', 6)).toEqual({ step: 0, notes: {}, outline: [] });
  });

  it('bad or hostile saved data falls back safely', () => {
    expect(parseSave('{not json', 6).step).toBe(0);
    expect(parseSave(JSON.stringify({ step: 99, notes: { x: 'no', '1': 5, '2': 'ok' }, outline: [{ text: 'a', depth: 4 }, 'junk'] }), 6)).toEqual({
      step: 5, notes: { '2': 'ok' }, outline: o(['a', 0]),
    });
  });

  it('a full or missing storage reports failure instead of throwing', () => {
    const kv = new KV();
    kv.fail = true;
    expect(new WorkshopStore(kv, 'w').save('a', { step: 0, notes: {}, outline: [] })).toBe(false);
    expect(new WorkshopStore(null, 'w').save('a', { step: 0, notes: {}, outline: [] })).toBe(false);
  });
});

describe('backups', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  const save = (step: number, notes: Record<string, string>, outline: OutlineItem[] = []): WorkshopSave => ({ step, notes, outline });

  it('local notes and outline always win; imported ones only fill gaps; the furthest step stays', () => {
    const local = save(1, { '0': 'mine', '1': '' }, o(['local plan', 0]));
    const incoming = save(4, { '0': 'theirs', '1': 'filled', '3': 'new' }, o(['their plan', 0]));
    expect(mergeSave(local, incoming)).toEqual(save(4, { '0': 'mine', '1': 'filled', '3': 'new' }, o(['local plan', 0])));
    expect(mergeSave(save(0, {}), incoming).outline).toEqual(o(['their plan', 0]));
  });

  it('counts only problems that change, and importing twice changes nothing', () => {
    const local = { a: save(2, { '0': 'x' }) };
    const incoming = { a: save(2, { '0': 'y' }), b: save(1, { '0': 'b notes' }), c: save(0, {}) };
    const first = mergeBackup(local, incoming);
    // a: local note wins and nothing else differs; b: new; c: blank, so ignored.
    expect(first.changed).toBe(1);
    expect(Object.keys(first.saves).sort()).toEqual(['a', 'b']);
    expect(mergeBackup(first.saves, incoming).changed).toBe(0);
  });

  it('never loses anything written locally, on random saves', () => {
    let seed = 5;
    const r = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const rand = (): WorkshopSave => save(Math.floor(r() * 6), Object.fromEntries([0, 1, 2, 3, 4].filter(() => r() < 0.5).map((k) => [String(k), r() < 0.3 ? '' : `n${k}-${Math.floor(r() * 9)}`])), r() < 0.5 ? o(['p', 0]) : []);
    for (let k = 0; k < 500; k++) {
      const local = rand();
      const merged = mergeSave(local, rand());
      for (const [key, v] of Object.entries(local.notes)) if (v.trim()) expect(merged.notes[key]).toBe(v);
      if (local.outline.length) expect(merged.outline).toEqual(local.outline);
      expect(merged.step).toBeGreaterThanOrEqual(local.step);
    }
  });

  it('the workshop part of a backup is read leniently: bad ids and junk are dropped, saves are cleaned', () => {
    expect(parseWorkshopBackup(null)).toEqual({});
    expect(parseWorkshopBackup([1, 2])).toEqual({});
    const read = parseWorkshopBackup({ 'Bad Id': save(1, {}), ok: { step: 99, notes: { '0': 'n', x: 'dropped' }, outline: 'junk' } });
    expect(read).toEqual({ ok: save(5, { '0': 'n' }) });
  });

  it('the store exports, previews and imports, and an old backup without notes changes nothing', () => {
    const kv = mem();
    const here = new WorkshopStore(kv, 'w');
    here.save('a', save(3, { '0': 'notes' }, o(['plan', 0])));
    const exported = JSON.parse(JSON.stringify(here.exportAll())) as unknown;
    const other = new WorkshopStore(mem(), 'w');
    expect(other.previewImport(exported)).toBe(1);
    expect(other.importAll(exported)).toBe(true);
    expect(other.load('a', 6)).toEqual(save(3, { '0': 'notes' }, o(['plan', 0])));
    expect(other.previewImport(exported)).toBe(0);
    expect(other.previewImport(undefined)).toBe(0);
  });
});

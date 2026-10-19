import { describe, expect, it } from 'vitest';
import type { ProgressEvent } from '../rewards/events';
import { BACKUP_PREFIX, ProgressStore, SAVE_KEY, parseSave, type KeyValue } from './store';

class MemoryKV implements KeyValue {
  map = new Map<string, string>();
  failWrites = false;
  failReads = false;
  getItem(k: string) {
    if (this.failReads) throw new Error('SecurityError');
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.failWrites) throw new Error('QuotaExceededError');
    this.map.set(k, v);
  }
}

const NOW = () => new Date('2026-10-19T10:00:00Z');
let n = 0;
const ev = (lesson = 'a'): ProgressEvent => {
  n++;
  return { id: `id${n}`, type: 'complete', at: `2026-10-19T10:00:${String(n % 60).padStart(2, '0')}Z`, day: '2026-10-19', lesson };
};

describe('ProgressStore', () => {
  it('starts empty with no notice', () => {
    const s = new ProgressStore(new MemoryKV(), NOW);
    expect(s.events).toEqual([]);
    expect(s.settings).toEqual({ calm: false });
    expect(s.notice).toBeNull();
  });

  it('survives a reload: what is added is read back by a new store', () => {
    const kv = new MemoryKV();
    const a = new ProgressStore(kv, NOW);
    const e = ev();
    a.add(e);
    a.setSettings({ calm: true });
    const b = new ProgressStore(kv, NOW);
    expect(b.events).toEqual([e]);
    expect(b.settings.calm).toBe(true);
  });

  it('adding the same event twice keeps one copy', () => {
    const s = new ProgressStore(new MemoryKV(), NOW);
    const e = ev();
    s.add(e);
    s.add(e);
    expect(s.events).toHaveLength(1);
  });

  it('merges progress from another tab instead of overwriting it', () => {
    const kv = new MemoryKV();
    const tab1 = new ProgressStore(kv, NOW);
    const tab2 = new ProgressStore(kv, NOW);
    const e1 = ev();
    const e2 = ev();
    tab1.add(e1);
    tab2.add(e2); // tab2 never saw e1, but must not drop it
    expect(new ProgressStore(kv, NOW).events.map((e) => e.id).sort()).toEqual([e1.id, e2.id].sort());
    tab1.reload();
    expect(tab1.events).toHaveLength(2);
  });

  it('keeps an unreadable save in a backup key and reports it', () => {
    const kv = new MemoryKV();
    kv.map.set(SAVE_KEY, '{not json');
    const s = new ProgressStore(kv, NOW);
    expect(s.events).toEqual([]);
    expect(s.notice).toContain('could not be read');
    const backups = [...kv.map.keys()].filter((k) => k.startsWith(BACKUP_PREFIX));
    expect(backups).toHaveLength(1);
    expect(kv.map.get(backups[0]!)).toBe('{not json');
  });

  it('does not overwrite an unreadable save when no backup could be made', () => {
    const kv = new MemoryKV();
    kv.map.set(SAVE_KEY, '{not json');
    kv.failWrites = true;
    const s = new ProgressStore(kv, NOW);
    kv.failWrites = false;
    s.add(ev());
    expect(kv.map.get(SAVE_KEY)).toBe('{not json');
  });

  it('treats a save from a newer version as unreadable, keeping a copy', () => {
    const kv = new MemoryKV();
    kv.map.set(SAVE_KEY, JSON.stringify({ version: 2, events: [] }));
    const s = new ProgressStore(kv, NOW);
    expect(s.notice).toContain('version 2');
    expect([...kv.map.keys()].some((k) => k.startsWith(BACKUP_PREFIX))).toBe(true);
  });

  it('skips individual bad events in a local save and loads the rest', () => {
    const kv = new MemoryKV();
    const good = ev();
    kv.map.set(SAVE_KEY, JSON.stringify({ version: 1, events: [good, { id: 'x', type: 'bogus' }], settings: {} }));
    const s = new ProgressStore(kv, NOW);
    expect(s.events).toEqual([good]);
    expect(s.notice).toContain('1 saved item(s) could not be read');
  });

  it('keeps working in memory when storage is full', () => {
    const kv = new MemoryKV();
    const s = new ProgressStore(kv, NOW);
    kv.failWrites = true;
    s.add(ev());
    expect(s.events).toHaveLength(1);
    expect(s.notice).toContain("can't be saved");
  });

  it('keeps working when storage is blocked entirely', () => {
    const s = new ProgressStore(null, NOW);
    s.add(ev());
    expect(s.events).toHaveLength(1);
    expect(s.notice).toContain("won't let the app save");
  });

  it('keeps working when reading storage throws', () => {
    const kv = new MemoryKV();
    kv.failReads = true;
    const s = new ProgressStore(kv, NOW);
    expect(s.events).toEqual([]);
    expect(s.notice).toContain("won't let the app read");
  });

  it('notifies listeners on change', () => {
    const s = new ProgressStore(new MemoryKV(), NOW);
    let calls = 0;
    const off = s.onChange(() => calls++);
    s.add(ev());
    off();
    s.add(ev());
    expect(calls).toBe(1);
  });
});

describe('export and import', () => {
  it('round-trips: export, then import into a fresh store', () => {
    const a = new ProgressStore(new MemoryKV(), NOW);
    a.add(ev(), ev('b'));
    const b = new ProgressStore(new MemoryKV(), NOW);
    const preview = b.previewImport(a.exportText());
    expect(preview).toMatchObject({ ok: true, newCount: 2 });
    if (preview.ok) b.applyImport(preview);
    expect(b.events).toEqual(a.events);
  });

  it('importing a backup of the same progress adds nothing (no double count)', () => {
    const s = new ProgressStore(new MemoryKV(), NOW);
    s.add(ev(), ev());
    const text = s.exportText();
    const preview = s.previewImport(text);
    expect(preview).toMatchObject({ ok: true, newCount: 0 });
    if (preview.ok) s.applyImport(preview);
    expect(s.events).toHaveLength(2);
  });

  it('merges an older backup with newer local progress', () => {
    const s = new ProgressStore(new MemoryKV(), NOW);
    s.add(ev());
    const backup = s.exportText();
    s.add(ev());
    const preview = s.previewImport(backup);
    if (preview.ok) s.applyImport(preview);
    expect(s.events).toHaveLength(2);
  });

  it('rejects bad files with a reason, and changes nothing', () => {
    const s = new ProgressStore(new MemoryKV(), NOW);
    s.add(ev());
    expect(s.previewImport('hello')).toEqual({ ok: false, problem: 'it is not valid JSON' });
    expect(s.previewImport('[]')).toMatchObject({ ok: false, problem: 'it has version undefined, and this app reads version 1' });
    expect(s.previewImport(JSON.stringify({ version: 1, events: [ev(), { id: 'x' }] }))).toEqual({ ok: false, problem: 'event 2 is invalid (bad timestamp)' });
    expect(s.events).toHaveLength(1);
  });

  it('export names the app and keeps settings', () => {
    const s = new ProgressStore(new MemoryKV(), NOW);
    s.setSettings({ calm: true });
    const out = JSON.parse(s.exportText());
    expect(out).toMatchObject({ app: 'logic-quest', version: 1, exportedAt: '2026-10-19T10:00:00.000Z', settings: { calm: true } });
  });
});

describe('parseSave', () => {
  it('drops duplicate ids inside one file', () => {
    const e = ev();
    const r = parseSave(JSON.stringify({ version: 1, events: [e, e] }), true);
    expect(r.ok && r.data.events).toHaveLength(1);
  });
});

import { describe, expect, it } from 'vitest';
import type { ProgressEvent } from '../rewards/events';
import { FIRST_ID, PROFILES_KEY, Profiles, nameProblem, profileKey, type ProfileStorage } from './profiles';
import { ProgressStore, SAVE_KEY } from './store';

class MemoryStorage implements ProfileStorage {
  map = new Map<string, string>();
  failWrites = false;
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.failWrites) throw new Error('QuotaExceededError');
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
}

const NOW = () => new Date('2026-10-20T10:00:00Z');
let n = 0;
const ev = (lesson = 'a'): ProgressEvent => {
  n++;
  return { id: `e${n}`, type: 'complete', at: `2026-10-20T10:00:${String(n % 60).padStart(2, '0')}Z`, day: '2026-10-20', lesson };
};
const storeFor = (kv: MemoryStorage, profiles: Profiles) => new ProgressStore(kv, NOW, profileKey(profiles.current.id, 'progress'));

describe('profileKey', () => {
  it('keeps the original save key for the first profile, so nothing is copied or lost', () => {
    expect(profileKey(FIRST_ID, 'progress')).toBe(SAVE_KEY);
    expect(profileKey('p2', 'progress')).toBe('logic-quest:p:p2:progress');
    expect(profileKey(FIRST_ID, 'boards')).toBe('logic-quest:p:p1:boards');
  });
});

describe('Profiles: moving an existing device to profiles', () => {
  it('a fresh device gets one learner and an empty save', () => {
    const kv = new MemoryStorage();
    const p = new Profiles(kv);
    expect(p.all).toEqual([{ id: 'p1', name: 'Learner 1' }]);
    expect(p.current.id).toBe('p1');
    expect(kv.getItem(PROFILES_KEY)).not.toBeNull();
  });

  it('an existing save becomes the first learner’s progress, untouched', () => {
    const kv = new MemoryStorage();
    const old = new ProgressStore(kv, NOW);
    const e = ev();
    old.add(e);
    const before = kv.getItem(SAVE_KEY);
    const p = new Profiles(kv);
    expect(kv.getItem(SAVE_KEY)).toBe(before);
    expect(storeFor(kv, p).events).toEqual([e]);
  });

  it('running the move twice creates no second learner', () => {
    const kv = new MemoryStorage();
    new Profiles(kv);
    const again = new Profiles(kv);
    expect(again.all).toHaveLength(1);
  });

  it('a damaged learner list is rebuilt from the data that exists, losing no one’s progress', () => {
    const kv = new MemoryStorage();
    const p = new Profiles(kv);
    const b = p.add('Asha');
    p.select(b.id);
    const e = ev();
    storeFor(kv, p).add(e);
    kv.setItem(PROFILES_KEY, '{not json');
    const rebuilt = new Profiles(kv);
    expect(rebuilt.all.map((x) => x.id)).toEqual(['p1', 'p2']);
    expect(new ProgressStore(kv, NOW, profileKey('p2', 'progress')).events).toEqual([e]);
  });

  it('works with no storage at all (blocked browser)', () => {
    const p = new Profiles(null);
    expect(p.current.name).toBe('Learner 1');
    expect(p.add('Ben').id).toBe('p2');
  });
});

describe('Profiles: separate progress', () => {
  it('events earned by one learner never show up for another, including after a reload', () => {
    const kv = new MemoryStorage();
    const p = new Profiles(kv);
    const a = ev('lesson-a');
    storeFor(kv, p).add(a);
    const ben = p.add('Ben');
    p.select(ben.id);
    const b = ev('lesson-b');
    storeFor(kv, p).add(b);

    const reloaded = new Profiles(kv);
    expect(reloaded.current.id).toBe(ben.id);
    expect(storeFor(kv, reloaded).events).toEqual([b]);
    reloaded.select(FIRST_ID);
    expect(storeFor(kv, reloaded).events).toEqual([a]);
  });

  it('settings such as calm mode belong to each learner', () => {
    const kv = new MemoryStorage();
    const p = new Profiles(kv);
    storeFor(kv, p).setSettings({ calm: true });
    p.select(p.add('Ben').id);
    expect(storeFor(kv, p).settings.calm).toBe(false);
  });
});

describe('Profiles: add, rename, remove', () => {
  it('rejects empty, too long and duplicate names (ignoring case and spaces)', () => {
    const p = new Profiles(new MemoryStorage());
    const list = p.snapshot();
    expect(nameProblem('  ', list)).toMatch(/Type a name/);
    expect(nameProblem('x'.repeat(25), list)).toMatch(/24/);
    expect(nameProblem(' learner 1 ', list)).toMatch(/already/);
    expect(nameProblem('Learner 1', list, 'p1')).toBeNull();
    expect(() => p.add('LEARNER 1')).toThrow(/already/);
  });

  it('renames and trims', () => {
    const kv = new MemoryStorage();
    const p = new Profiles(kv);
    p.rename('p1', '  Gaurav ');
    expect(new Profiles(kv).current.name).toBe('Gaurav');
  });

  it('removing a learner deletes only their keys', () => {
    const kv = new MemoryStorage();
    const p = new Profiles(kv);
    const a = ev();
    storeFor(kv, p).add(a);
    const ben = p.add('Ben');
    p.select(ben.id);
    storeFor(kv, p).add(ev());
    kv.setItem(profileKey(ben.id, 'boards'), '[]');
    kv.setItem('logic-quest:p:p22:progress', 'someone else');
    p.remove(ben.id);
    expect([...kv.map.keys()].filter((k) => k.startsWith('logic-quest:p:p2:'))).toEqual([]);
    expect(kv.getItem('logic-quest:p:p22:progress')).toBe('someone else');
    expect(p.current.id).toBe(FIRST_ID);
    expect(storeFor(kv, p).events).toEqual([a]);
  });

  it('removing the first learner removes the original save too', () => {
    const kv = new MemoryStorage();
    const p = new Profiles(kv);
    storeFor(kv, p).add(ev());
    p.add('Ben');
    p.remove(FIRST_ID);
    expect(kv.getItem(SAVE_KEY)).toBeNull();
    expect(p.all.map((x) => x.id)).toEqual(['p2']);
  });

  it('never removes the last learner', () => {
    const p = new Profiles(new MemoryStorage());
    expect(() => p.remove('p1')).toThrow(/at least one/);
  });

  it('never reuses the id of a learner whose data is still stored', () => {
    const kv = new MemoryStorage();
    kv.setItem('logic-quest:p:p2:progress', '{}');
    kv.setItem(PROFILES_KEY, JSON.stringify({ version: 1, profiles: [{ id: 'p1', name: 'A' }], current: 'p1' }));
    const p = new Profiles(kv);
    expect(p.add('New').id).toBe('p3');
  });

  it('a failed list write does not throw (storage full)', () => {
    const kv = new MemoryStorage();
    const p = new Profiles(kv);
    kv.failWrites = true;
    expect(() => p.add('Ben')).not.toThrow();
  });
});

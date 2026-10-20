import { SAVE_KEY, type KeyValue } from './store';

// Several learners can share one device, each with their own progress (CLAUDE.md section 3: local
// profiles, no login, no server). Nothing here is private: anyone using the device can read local
// storage, so profiles are for sharing a device, not for keeping secrets.
//
// The first profile keeps the save key the app always used, so moving to profiles copies nothing
// and cannot lose progress. Later profiles get their own prefixed keys.

export interface ProfileStorage extends KeyValue {
  removeItem(key: string): void;
  readonly length: number;
  key(index: number): string | null;
}

export interface Profile {
  id: string;
  name: string;
}

export interface ProfileList {
  version: 1;
  profiles: Profile[];
  current: string;
}

export const PROFILES_KEY = 'logic-quest:profiles';
/** The profile that owns the original save key. */
export const FIRST_ID = 'p1';
const PREFIX = 'logic-quest:p:';
export const NAME_MAX = 24;

/** Where one profile keeps one kind of data ("progress", "workshop", "boards", ...). */
export function profileKey(id: string, part: string): string {
  if (part === 'progress' && id === FIRST_ID) return SAVE_KEY;
  return `${PREFIX}${id}:${part}`;
}

/** Why a name can't be used, or null if it can. Names are compared ignoring case and spaces. */
export function nameProblem(name: string, list: ProfileList, ignoreId?: string): string | null {
  const n = name.trim();
  if (n.length === 0) return 'Type a name.';
  if (n.length > NAME_MAX) return `Keep it to ${NAME_MAX} characters.`;
  const clash = list.profiles.some((p) => p.id !== ignoreId && p.name.trim().toLowerCase() === n.toLowerCase());
  return clash ? 'Another learner already has that name.' : null;
}

const defaultList = (): ProfileList => ({ version: 1, profiles: [{ id: FIRST_ID, name: 'Learner 1' }], current: FIRST_ID });

function parseList(text: string | null): ProfileList | null {
  if (text === null) return null;
  try {
    const raw = JSON.parse(text) as Partial<ProfileList>;
    if (raw.version !== 1 || !Array.isArray(raw.profiles)) return null;
    const seen = new Set<string>();
    const profiles: Profile[] = [];
    for (const p of raw.profiles as unknown[]) {
      const r = p as Partial<Profile>;
      if (typeof r?.id !== 'string' || !/^p[0-9]+$/.test(r.id) || typeof r.name !== 'string' || seen.has(r.id)) continue;
      seen.add(r.id);
      profiles.push({ id: r.id, name: r.name.trim().slice(0, NAME_MAX) || r.id });
    }
    if (profiles.length === 0) return null;
    const current = profiles.some((p) => p.id === raw.current) ? (raw.current as string) : profiles[0]!.id;
    return { version: 1, profiles, current };
  } catch {
    return null;
  }
}

/** Profile ids that have data under their prefix, so a lost or damaged list can be rebuilt. */
function idsWithData(kv: ProfileStorage): string[] {
  const ids = new Set<string>();
  try {
    for (let i = 0; i < kv.length; i++) {
      const m = /^logic-quest:p:(p[0-9]+):/.exec(kv.key(i) ?? '');
      if (m) ids.add(m[1]!);
    }
  } catch {
    // Storage that can't be listed just means nothing to recover.
  }
  return [...ids];
}

export class Profiles {
  private list: ProfileList;

  constructor(private readonly kv: ProfileStorage | null) {
    this.list = this.read();
  }

  get all(): Profile[] {
    return this.list.profiles;
  }

  get current(): Profile {
    return this.list.profiles.find((p) => p.id === this.list.current)!;
  }

  snapshot(): ProfileList {
    return { ...this.list, profiles: this.list.profiles.map((p) => ({ ...p })) };
  }

  add(name: string): Profile {
    const problem = nameProblem(name, this.list);
    if (problem) throw new Error(problem);
    const used = new Set([...this.list.profiles.map((p) => p.id), ...(this.kv ? idsWithData(this.kv) : [])]);
    let n = 1;
    while (used.has(`p${n}`)) n++;
    const profile = { id: `p${n}`, name: name.trim() };
    this.list = { ...this.list, profiles: [...this.list.profiles, profile] };
    this.write();
    return profile;
  }

  rename(id: string, name: string): void {
    const problem = nameProblem(name, this.list, id);
    if (problem) throw new Error(problem);
    this.list = { ...this.list, profiles: this.list.profiles.map((p) => (p.id === id ? { ...p, name: name.trim() } : p)) };
    this.write();
  }

  select(id: string): void {
    if (!this.list.profiles.some((p) => p.id === id)) throw new Error(`No learner ${id}`);
    this.list = { ...this.list, current: id };
    this.write();
  }

  /** Removes the profile and every key it owns. The last profile can't be removed. */
  remove(id: string): void {
    if (this.list.profiles.length <= 1) throw new Error('There must be at least one learner.');
    if (!this.list.profiles.some((p) => p.id === id)) throw new Error(`No learner ${id}`);
    const profiles = this.list.profiles.filter((p) => p.id !== id);
    this.list = { version: 1, profiles, current: this.list.current === id ? profiles[0]!.id : this.list.current };
    this.write();
    if (!this.kv) return;
    const owned: string[] = [];
    for (let i = 0; i < this.kv.length; i++) {
      const k = this.kv.key(i);
      if (k?.startsWith(`${PREFIX}${id}:`)) owned.push(k);
    }
    if (id === FIRST_ID) owned.push(SAVE_KEY);
    for (const k of owned) this.kv.removeItem(k);
  }

  private read(): ProfileList {
    if (!this.kv) return defaultList();
    let text: string | null;
    try {
      text = this.kv.getItem(PROFILES_KEY);
    } catch {
      return defaultList();
    }
    const parsed = parseList(text);
    if (parsed) return parsed;
    // First launch with profiles, or a damaged list: the first profile always exists (it owns the
    // original save), and any other profile that has data comes back with a plain name.
    const list = defaultList();
    for (const id of idsWithData(this.kv).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))) {
      if (id !== FIRST_ID) list.profiles.push({ id, name: `Learner ${id.slice(1)}` });
    }
    this.list = list;
    this.write();
    return list;
  }

  private write(): void {
    try {
      this.kv?.setItem(PROFILES_KEY, JSON.stringify(this.list));
    } catch {
      // The progress store reports storage problems; the list is rebuilt from data next time.
    }
  }
}

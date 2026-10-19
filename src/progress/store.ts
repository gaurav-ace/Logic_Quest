import { eventProblem, mergeEvents, type ProgressEvent } from '../rewards/events';

// Saves the event log in localStorage. Rules: never lose data silently (a save we can't read is
// kept under a backup key and reported), and never double-count (every write merges by id, so
// another open tab's progress is folded in rather than overwritten).

export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface Settings {
  /** Calm mode: no pop-ups, rewards shown as plain text only. */
  calm: boolean;
}

export interface SaveData {
  version: 1;
  events: ProgressEvent[];
  settings: Settings;
}

export const SAVE_KEY = 'logic-quest:progress';
export const BACKUP_PREFIX = 'logic-quest:progress:unreadable:';
const DEFAULT_SETTINGS: Settings = { calm: false };

const empty = (): SaveData => ({ version: 1, events: [], settings: { ...DEFAULT_SETTINGS } });

type Parsed = { ok: true; data: SaveData; skipped: number } | { ok: false; problem: string };

/**
 * Reads a save or a backup file. `strict` (imports) rejects the whole file if any event is bad,
 * so the learner can check it; a local save keeps the good events and reports the rest.
 */
export function parseSave(text: string, strict: boolean): Parsed {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, problem: 'it is not valid JSON' };
  }
  if (typeof raw !== 'object' || raw === null) return { ok: false, problem: 'it is not a Logic Quest progress file' };
  const r = raw as Record<string, unknown>;
  if (r.version !== 1) return { ok: false, problem: `it has version ${JSON.stringify(r.version)}, and this app reads version 1` };
  if (!Array.isArray(r.events)) return { ok: false, problem: 'it has no list of events' };
  const events: ProgressEvent[] = [];
  let skipped = 0;
  for (const [i, e] of r.events.entries()) {
    const problem = eventProblem(e);
    if (problem === null) events.push(e as ProgressEvent);
    else if (strict) return { ok: false, problem: `event ${i + 1} is invalid (${problem})` };
    else skipped++;
  }
  const s = typeof r.settings === 'object' && r.settings !== null ? (r.settings as Record<string, unknown>) : {};
  return { ok: true, data: { version: 1, events: mergeEvents(events, []), settings: { calm: s.calm === true } }, skipped };
}

export interface ImportPreview {
  ok: true;
  events: ProgressEvent[];
  /** Events in the file that are not already saved here. */
  newCount: number;
}

export class ProgressStore {
  private data: SaveData = empty();
  /** A message for the learner when something went wrong with saving or loading. */
  notice: string | null = null;
  private listeners = new Set<() => void>();
  /** False when an unreadable save could not be backed up: then we must not overwrite it. */
  private writable = true;

  constructor(
    private readonly kv: KeyValue | null,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.data = this.readStored();
  }

  get events(): ProgressEvent[] {
    return this.data.events;
  }

  get settings(): Settings {
    return this.data.settings;
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  add(...events: ProgressEvent[]): void {
    this.update((d) => ({ ...d, events: mergeEvents(d.events, events) }));
  }

  setSettings(patch: Partial<Settings>): void {
    this.update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  }

  /** Another tab saved: fold its events into ours. */
  reload(): void {
    const stored = this.readStored();
    this.data = { ...stored, events: mergeEvents(stored.events, this.data.events) };
    this.emit();
  }

  exportText(): string {
    return JSON.stringify({ app: 'logic-quest', exportedAt: this.now().toISOString(), ...this.data }, null, 2);
  }

  previewImport(text: string): ImportPreview | { ok: false; problem: string } {
    const parsed = parseSave(text, true);
    if (!parsed.ok) return parsed;
    const have = new Set(this.data.events.map((e) => e.id));
    return { ok: true, events: parsed.data.events, newCount: parsed.data.events.filter((e) => !have.has(e.id)).length };
  }

  /** Merges, never replaces: importing the same file twice changes nothing. */
  applyImport(preview: ImportPreview): void {
    this.add(...preview.events);
  }

  private update(change: (d: SaveData) => SaveData): void {
    // Read first, so progress saved by another tab since we loaded is merged, not overwritten.
    const latest = this.readStored({ quiet: true });
    const base = { ...this.data, events: mergeEvents(latest.events, this.data.events) };
    this.data = change(base);
    this.write();
    this.emit();
  }

  private write(): void {
    if (!this.kv || !this.writable) return;
    try {
      this.kv.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      this.notice = "Progress can't be saved on this device right now (storage is full or blocked). It is kept until you close the app. Export a backup to keep it.";
    }
  }

  private readStored({ quiet = false } = {}): SaveData {
    if (!this.kv) {
      this.notice = "This browser won't let the app save progress. It is kept until you close the app. Export a backup to keep it.";
      return empty();
    }
    let text: string | null;
    try {
      text = this.kv.getItem(SAVE_KEY);
    } catch {
      this.notice = "This browser won't let the app read saved progress. It is kept until you close the app.";
      return this.data;
    }
    if (text === null) return quiet ? this.data : empty();
    const parsed = parseSave(text, false);
    if (parsed.ok) {
      if (parsed.skipped && !quiet) this.notice = `${parsed.skipped} saved item(s) could not be read and were skipped. Everything else loaded.`;
      return parsed.data;
    }
    // Keep the unreadable save so it can be recovered; never silently throw it away.
    const backupKey = `${BACKUP_PREFIX}${this.now().toISOString()}`;
    try {
      this.kv.setItem(backupKey, text);
      this.notice = `Saved progress could not be read (${parsed.problem}). A copy was kept in this browser (${backupKey}), and a fresh start was made.`;
    } catch {
      this.notice = `Saved progress could not be read (${parsed.problem}), and a backup copy could not be made.`;
      // Leave the original in place rather than overwrite our only copy.
      this.writable = false;
    }
    return empty();
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}

/** localStorage, or null where the browser blocks it (some private modes throw on access). */
export function browserStorage(): KeyValue | null {
  try {
    const s = window.localStorage;
    const probe = `${SAVE_KEY}:probe`;
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

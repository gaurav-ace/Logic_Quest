import { seededOrder } from '../lesson/shuffle';
import type { KeyValue } from '../progress/store';

// The workshop's pure parts: the learner's outline of sub-problems, the tap-to-order and
// tap-to-select checks, and what is saved per learner so a problem can be resumed later.

export interface OutlineItem {
  text: string;
  /** 0 = top level; each item is at most one level deeper than the one above it. */
  depth: number;
}

export const MAX_DEPTH = 2;
export const OUTLINE_MAX = 20;
export const NOTE_MAX = 2000;

/** Depths that always make a valid outline: first item at 0, never more than one deeper than the previous. */
export function normalise(outline: OutlineItem[]): OutlineItem[] {
  let prev = -1;
  return outline.map((item) => {
    const depth = Math.max(0, Math.min(item.depth, prev + 1, MAX_DEPTH));
    prev = depth;
    return { text: item.text, depth };
  });
}

export function addItem(outline: OutlineItem[], text: string): OutlineItem[] {
  const t = text.trim().slice(0, 200);
  if (!t || outline.length >= OUTLINE_MAX) return outline;
  return [...outline, { text: t, depth: outline.at(-1)?.depth ?? 0 }];
}

export function indent(outline: OutlineItem[], i: number): OutlineItem[] {
  return normalise(outline.map((item, k) => (k === i ? { ...item, depth: item.depth + 1 } : item)));
}

/** Outdenting an item brings the items under it along, so a group moves as one. */
export function outdent(outline: OutlineItem[], i: number): OutlineItem[] {
  const item = outline[i];
  if (!item || item.depth === 0) return outline;
  const end = groupEnd(outline, i);
  return normalise(outline.map((x, k) => (k >= i && k < end ? { ...x, depth: x.depth - 1 } : x)));
}

export function move(outline: OutlineItem[], i: number, by: -1 | 1): OutlineItem[] {
  const j = i + by;
  if (i < 0 || i >= outline.length || j < 0 || j >= outline.length) return outline;
  const next = [...outline];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return normalise(next);
}

export function removeItem(outline: OutlineItem[], i: number): OutlineItem[] {
  return normalise(outline.filter((_, k) => k !== i));
}

/** Index just past item i and everything nested under it. */
function groupEnd(outline: OutlineItem[], i: number): number {
  let end = i + 1;
  while (end < outline.length && outline[end]!.depth > outline[i]!.depth) end++;
  return end;
}

/** A stable shuffle for the order check: never the answer itself, so the check is never free. */
export function shuffledOrder(parts: string[], seedText: string): number[] {
  const order = seededOrder(parts.length, seedText);
  // A shuffle that lands back on the answer is rotated by one place.
  return order.every((v, i) => v === i) ? [...order.slice(1), order[0]!] : order;
}

export const orderIsRight = (picked: number[], count: number) => picked.length === count && picked.every((v, i) => v === i);

export function selectionIsRight(picked: ReadonlySet<number>, cases: { pick: boolean }[]): boolean {
  return cases.every((c, i) => c.pick === picked.has(i));
}

/** What is kept for one problem: notes per step, the outline, and how far the learner got. */
export interface WorkshopSave {
  step: number;
  notes: Record<string, string>;
  outline: OutlineItem[];
}

export const emptySave = (): WorkshopSave => ({ step: 0, notes: {}, outline: [] });

export function parseSave(text: string | null, steps: number): WorkshopSave {
  if (!text) return emptySave();
  try {
    const raw = JSON.parse(text) as Partial<WorkshopSave>;
    const step = Number.isInteger(raw.step) ? Math.max(0, Math.min(raw.step!, steps - 1)) : 0;
    const notes: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw.notes ?? {})) if (/^\d+$/.test(k) && typeof v === 'string') notes[k] = v.slice(0, NOTE_MAX);
    const outline = Array.isArray(raw.outline)
      ? normalise(raw.outline.filter((o): o is OutlineItem => typeof o?.text === 'string' && typeof o.depth === 'number').slice(0, OUTLINE_MAX))
      : [];
    return { step, notes, outline };
  } catch {
    return emptySave();
  }
}

/** One learner's workshop saves, under their profile's key. Failing storage never breaks the page. */
export class WorkshopStore {
  constructor(
    private readonly kv: KeyValue | null,
    private readonly key: string,
  ) {}

  private all(): Record<string, unknown> {
    try {
      const v = JSON.parse(this.kv?.getItem(this.key) ?? '{}') as unknown;
      return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  load(id: string, steps: number): WorkshopSave {
    const v = this.all()[id];
    return parseSave(v === undefined ? null : JSON.stringify(v), steps);
  }

  /** Every problem this learner has started, for a backup file. */
  exportAll(): Record<string, WorkshopSave> {
    return parseWorkshopBackup(this.all());
  }

  /** How many problems a backup would add to or fill in. */
  previewImport(raw: unknown): number {
    return mergeBackup(this.exportAll(), parseWorkshopBackup(raw)).changed;
  }

  /** Merges a backup's workshop saves in; false if storage refused the write. */
  importAll(raw: unknown): boolean {
    const { saves, changed } = mergeBackup(this.exportAll(), parseWorkshopBackup(raw));
    if (changed === 0) return true;
    try {
      this.kv?.setItem(this.key, JSON.stringify({ ...this.all(), ...saves }));
      return this.kv !== null;
    } catch {
      return false;
    }
  }

  save(id: string, data: WorkshopSave): boolean {
    try {
      this.kv?.setItem(this.key, JSON.stringify({ ...this.all(), [id]: data }));
      return this.kv !== null;
    } catch {
      return false;
    }
  }
}

/** Guided problems always have the six stages (the validator insists), so saved steps are 0–5. */
const STEP_COUNT = 6;
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * The workshop part of a backup file: problem id → save. Lenient, like reading a local save:
 * entries that aren't a problem id are dropped, and each save is cleaned by parseSave.
 */
export function parseWorkshopBackup(raw: unknown): Record<string, WorkshopSave> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, WorkshopSave> = {};
  for (const [id, v] of Object.entries(raw)) if (ID.test(id)) out[id] = parseSave(JSON.stringify(v), STEP_COUNT);
  return out;
}

const blank = (s: WorkshopSave) => s.step === 0 && s.outline.length === 0 && Object.values(s.notes).every((n) => !n.trim());

/**
 * Merges one problem's imported save into the local one without losing anything written here:
 * a local note or outline always wins, imported ones only fill gaps, and the furthest step stays.
 */
export function mergeSave(local: WorkshopSave, incoming: WorkshopSave): WorkshopSave {
  const notes = { ...local.notes };
  for (const [k, v] of Object.entries(incoming.notes)) if (!notes[k]?.trim() && v.trim()) notes[k] = v;
  return { step: Math.max(local.step, incoming.step), notes, outline: local.outline.length ? local.outline : incoming.outline };
}

const same = (a: WorkshopSave, b: WorkshopSave) => JSON.stringify(a) === JSON.stringify(b);

export interface WorkshopMerge {
  saves: Record<string, WorkshopSave>;
  /** Problems the import adds to or fills in. */
  changed: number;
}

export function mergeBackup(local: Record<string, WorkshopSave>, incoming: Record<string, WorkshopSave>): WorkshopMerge {
  const saves = { ...local };
  let changed = 0;
  for (const [id, save] of Object.entries(incoming)) {
    if (blank(save)) continue;
    const merged = local[id] ? mergeSave(local[id], save) : save;
    if (!local[id] || !same(merged, local[id])) {
      saves[id] = merged;
      changed++;
    }
  }
  return { saves, changed };
}

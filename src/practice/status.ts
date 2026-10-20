import type { ProgressEvent } from '../rewards/events';
import { checkIndices, practiceKey, type PracticeItem } from './schema';

export interface PracticeStatus {
  /** Checks answered correctly at least once, out of all its checks. */
  solved: number;
  total: number;
  done: boolean;
  /** Hard items open once every medium item in the same track is done (CLAUDE.md section 6). */
  locked: boolean;
}

/** Status of each item in one track, worked out from the event log like every other score. */
export function practiceStatus(items: PracticeItem[], events: ProgressEvent[]): Map<string, PracticeStatus> {
  const right = new Set<string>();
  for (const e of events) if (e.type === 'answer' && e.correct) right.add(`${e.lesson}#${e.question}`);
  const out = new Map<string, PracticeStatus>();
  for (const item of items) {
    const checks = checkIndices(item);
    const solved = checks.filter((i) => right.has(`${practiceKey(item.id)}#${i}`)).length;
    out.set(item.id, { solved, total: checks.length, done: solved === checks.length, locked: false });
  }
  const mediumDone = items.filter((i) => i.level === 'medium').every((i) => out.get(i.id)!.done);
  for (const item of items) if (item.level === 'hard') out.get(item.id)!.locked = !mediumDone;
  return out;
}

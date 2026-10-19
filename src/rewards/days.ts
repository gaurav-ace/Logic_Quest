// Calendar days as "YYYY-MM-DD" strings in the learner's local time. Day arithmetic is done in
// UTC on those strings, so daylight-saving changes can never make a day 23 or 25 hours long.

export type Day = string;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

export function isDay(v: unknown): v is Day {
  if (typeof v !== 'string' || !DAY_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
}

/** The local calendar day of a moment. */
export function localDay(at: Date): Day {
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, '0');
  const d = String(at.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(day: Day, n: number): Day {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Whole days from a to b (negative if b is earlier). */
export function daysBetween(a: Day, b: Day): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / MS_PER_DAY);
}

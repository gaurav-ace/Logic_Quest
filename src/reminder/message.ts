// The twice-daily Discord reminder (CLAUDE.md section 3, Phase 6b). Pure and dependency-free, so
// the Node script the scheduled workflow runs can import it directly.
//
// The workflow can't see anyone's progress (it lives only on the phone), so the message is a
// reminder, never a status: it states the goal and the way in, with no guilt (section 7).

export type Slot = 'morning' | 'evening';

export interface ReminderLesson {
  id: string;
  title: string;
  quiz: { prompt: string }[];
}

export const SITE_URL = 'https://gaurav-ace.github.io/Logic_Quest/';
/** Discord rejects message content longer than this (Execute Webhook docs). */
export const DISCORD_LIMIT = 2000;
const PROMPT_MAX = 300;

/**
 * The cron lines in .github/workflows/reminder.yml, in UTC. GitHub starts scheduled runs late
 * (4 to 5.5 hours late in October 2026), and by different amounts, so each slot has several
 * attempts and only the first one that starts inside the slot's window posts (see shouldSend).
 * Morning: 00:00 to 06:00 IST, so even a run with no delay lands after 04:00 IST at least once.
 * Evening: 17:00 to 19:00 IST, aimed at about 21:00 IST with the usual delay.
 */
export const CRON: Record<Slot, string[]> = {
  morning: ['30 18 * * *', '30 19 * * *', '30 20 * * *', '30 21 * * *', '30 22 * * *', '30 23 * * *', '30 0 * * *'],
  evening: ['30 11 * * *', '30 12 * * *', '30 13 * * *'],
};

/**
 * When each slot may post, in minutes after midnight IST, from start up to but not including end.
 * The owner's priority (2026-10-24): one morning message, ideally 04:00 to 07:00 IST; a late
 * evening one is better skipped, since "there's still time today" is wrong after 23:00.
 */
export const WINDOW: Record<Slot, { start: number; end: number }> = {
  morning: { start: 4 * 60, end: 12 * 60 },
  evening: { start: 17 * 60, end: 23 * 60 },
};

export function slotFor(schedule: string | undefined, requested: string | undefined): Slot {
  if (requested === 'morning' || requested === 'evening') return requested;
  return schedule !== undefined && CRON.evening.includes(schedule) ? 'evening' : 'morning';
}

/** Minutes after midnight IST (UTC+5:30, no daylight saving). */
export function istMinutes(now: Date): number {
  return Math.floor((now.getTime() + 330 * 60_000) / 60_000) % 1440;
}

/** An earlier run of the workflow: when it started and whether its send step succeeded. */
export interface PastRun {
  startedAt: Date;
  sent: boolean;
}

/**
 * Whether a scheduled run should post now: inside the slot's window, and no earlier run posted in
 * that window today. Manual runs always post (they are tests). If the earlier runs couldn't be
 * read (null), post anyway: a rare double message is better than none.
 */
export function shouldSend(slot: Slot, now: Date, manual: boolean, past: PastRun[] | null): { send: boolean; reason: string } {
  if (manual) return { send: true, reason: 'Manual run.' };
  const w = WINDOW[slot];
  const t = istMinutes(now);
  const hhmm = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')} IST`;
  if (t < w.start || t >= w.end) return { send: false, reason: `It is ${hhmm}, outside the ${slot} window.` };
  if (past === null) return { send: true, reason: `It is ${hhmm}; earlier runs couldn't be checked, so sending.` };
  const today = istDayNumber(now);
  const done = past.some((r) => r.sent && istDayNumber(r.startedAt) === today && istMinutes(r.startedAt) >= w.start && istMinutes(r.startedAt) < w.end);
  return done ? { send: false, reason: `The ${slot} reminder was already sent today.` } : { send: true, reason: `It is ${hhmm}, the first run in the ${slot} window.` };
}

/** Days since 1970-01-01 in India Standard Time (UTC+5:30, no daylight saving). */
export function istDayNumber(now: Date): number {
  return Math.floor((now.getTime() + 330 * 60_000) / 86_400_000);
}

/** The same question all day, a different one each day, cycling through every quiz question. */
export function questionOfTheDay(lessons: ReminderLesson[], now: Date): { lesson: ReminderLesson; prompt: string } | null {
  const all = lessons.flatMap((lesson) => lesson.quiz.map((q) => ({ lesson, prompt: q.prompt })));
  if (all.length === 0) return null;
  return all[istDayNumber(now) % all.length]!;
}

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

export function buildMessage(slot: Slot, lessons: ReminderLesson[], now: Date, site = SITE_URL): string {
  const lines: string[] = [];
  if (slot === 'morning') {
    lines.push('**Logic Quest, morning.** Today’s goal: 1 lesson, about 5–10 minutes.');
    const q = questionOfTheDay(lessons, now);
    if (q) lines.push(`Something to think about today: “${clip(q.prompt, PROMPT_MAX)}” (from *${clip(q.lesson.title, 80)}*).`);
    lines.push(`Open the app and tap **Up next**: ${site}`);
  } else {
    lines.push('**Logic Quest, evening.** If today’s lesson isn’t done yet, there’s still time: one lesson meets the goal and keeps your streak.');
    lines.push(`Already done? Nice work. A practice question or a replay never hurts: ${site}`);
  }
  // Each part is short and the prompt is clipped, so this stays far below Discord's limit.
  return lines.join('\n');
}

/** The JSON body for Discord's Execute Webhook. No pings, even if a lesson ever contains "@everyone". */
export function webhookBody(content: string): string {
  return JSON.stringify({ content, allowed_mentions: { parse: [] } });
}

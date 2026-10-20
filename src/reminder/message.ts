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

/** The two cron lines in .github/workflows/reminder.yml: 08:00 and 21:00 IST, in UTC. */
export const CRON: Record<Slot, string> = { morning: '30 2 * * *', evening: '30 15 * * *' };

export function slotFor(schedule: string | undefined, requested: string | undefined): Slot {
  if (requested === 'morning' || requested === 'evening') return requested;
  return schedule === CRON.evening ? 'evening' : 'morning';
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

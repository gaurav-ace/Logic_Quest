import { describe, expect, it } from 'vitest';
import { CRON, DISCORD_LIMIT, WINDOW, buildMessage, istDayNumber, istMinutes, questionOfTheDay, shouldSend, slotFor, webhookBody, type ReminderLesson } from './message';
import { loadCatalog } from '../lesson/catalog';
import workflow from '../../.github/workflows/reminder.yml?raw';

const lessons: ReminderLesson[] = [
  { id: 'a', title: 'Arrays', quiz: [{ prompt: 'Q1?' }, { prompt: 'Q2?' }] },
  { id: 'b', title: 'Binary search', quiz: [{ prompt: 'Q3?' }] },
];

/** A cron line's time in minutes after midnight IST. */
const cronIst = (cron: string) => {
  const [m, h] = cron.split(' ').map(Number) as [number, number];
  return (h * 60 + m + 330) % 1440;
};
/** A moment on 2026-10-24 (or a later day), given as IST hours and minutes. */
const ist = (h: number, m = 0, day = 0) => new Date(Date.UTC(2026, 9, 24 + day, h, m) - 330 * 60_000);

describe('slotFor', () => {
  it('maps each cron line to its slot, and a manual run to what was asked', () => {
    for (const c of CRON.morning) expect(slotFor(c, undefined)).toBe('morning');
    for (const c of CRON.evening) expect(slotFor(c, undefined)).toBe('evening');
    expect(slotFor(undefined, 'evening')).toBe('evening');
    expect(slotFor(CRON.evening[0], 'morning')).toBe('morning');
    expect(slotFor(undefined, 'nonsense')).toBe('morning');
  });

  it('the workflow schedules exactly these cron lines', () => {
    const lines = [...workflow.matchAll(/- cron: '([^']+)'/g)].map((m) => m[1]);
    expect(lines).toEqual([...CRON.morning, ...CRON.evening]);
  });

  it('morning attempts start before 04:00 IST and reach into the window even with no delay', () => {
    const times = CRON.morning.map(cronIst);
    expect(times.some((t) => t < WINDOW.morning.start)).toBe(true);
    expect(times.some((t) => t >= WINDOW.morning.start && t < 7 * 60)).toBe(true);
    // All before the window ends, so a late start still has a chance.
    expect(times.every((t) => t < WINDOW.morning.end)).toBe(true);
    expect(CRON.evening.map(cronIst).every((t) => t >= WINDOW.evening.start && t < WINDOW.evening.end)).toBe(true);
  });
});

describe('shouldSend', () => {
  it('istMinutes counts from midnight IST', () => {
    expect(istMinutes(new Date('2026-10-23T18:30:00Z'))).toBe(0);
    expect(istMinutes(new Date('2026-10-24T02:30:00Z'))).toBe(480);
  });

  it('posts inside the window, skips outside it (including just before and at the end)', () => {
    expect(shouldSend('morning', ist(3, 59), false, []).send).toBe(false);
    expect(shouldSend('morning', ist(4, 0), false, []).send).toBe(true);
    expect(shouldSend('morning', ist(11, 59), false, []).send).toBe(true);
    expect(shouldSend('morning', ist(12, 0), false, []).send).toBe(false);
    // The late evening runs seen in October 2026 (00:57 IST) are skipped.
    expect(shouldSend('evening', ist(0, 57, 1), false, []).send).toBe(false);
    expect(shouldSend('evening', ist(22, 59), false, []).send).toBe(true);
    expect(shouldSend('evening', ist(23, 0), false, [])).toEqual({ send: false, reason: 'It is 23:00 IST, outside the evening window.' });
  });

  it('only the first run in the window posts that day', () => {
    const first = { startedAt: ist(5, 10), sent: true };
    expect(shouldSend('morning', ist(6, 10), false, [first])).toEqual({ send: false, reason: 'The morning reminder was already sent today.' });
    // A run that skipped, yesterday's post, or the evening post don't count.
    const others = [
      { startedAt: ist(4, 30), sent: false },
      { startedAt: ist(5, 10, -1), sent: true },
      { startedAt: ist(21, 0, -1), sent: true },
    ];
    expect(shouldSend('morning', ist(6, 10), false, others).send).toBe(true);
    // A post before the window (a manual test at 02:00) doesn't stop the morning reminder.
    expect(shouldSend('morning', ist(6, 10), false, [{ startedAt: ist(2, 0), sent: true }]).send).toBe(true);
    // The morning post doesn't stop the evening one.
    expect(shouldSend('evening', ist(20, 0), false, [first]).send).toBe(true);
  });

  it('manual runs always post; unreadable history posts rather than miss the day', () => {
    expect(shouldSend('evening', ist(3, 0), true, null).send).toBe(true);
    expect(shouldSend('morning', ist(5, 0), false, null).send).toBe(true);
    expect(shouldSend('morning', ist(2, 0), false, null).send).toBe(false);
  });

  it('a day of runs with the delays seen in October 2026 posts once each slot, or skips the evening', () => {
    // Every attempt starts 4 to 5.5 hours late, in steps; replay the day in start order.
    for (const delay of [0, 60, 240, 300, 330]) {
      const starts = [...CRON.morning, ...CRON.evening]
        .map((c) => ({ c, at: new Date(ist(0).getTime() + ((cronIst(c) + delay) % 1440) * 60_000) }))
        .sort((a, b) => a.at.getTime() - b.at.getTime());
      const past: { startedAt: Date; sent: boolean }[] = [];
      for (const { c, at } of starts) past.push({ startedAt: at, sent: shouldSend(slotFor(c, undefined), at, false, past).send });
      const sent = past.filter((r) => r.sent);
      const morning = sent.filter((r) => istMinutes(r.startedAt) < 12 * 60);
      expect(morning, `delay ${delay}`).toHaveLength(1);
      expect(sent.length - morning.length).toBeLessThanOrEqual(1);
    }
  });
});

describe('question of the day', () => {
  it('changes at midnight IST, not midnight UTC', () => {
    // 18:29 UTC is 23:59 IST; 18:31 UTC is 00:01 IST the next day.
    expect(istDayNumber(new Date('2026-10-20T18:31:00Z'))).toBe(istDayNumber(new Date('2026-10-20T18:29:00Z')) + 1);
  });

  it('is the same all day and cycles through every question', () => {
    const day = (d: number) => new Date(Date.UTC(2026, 9, 20 + d, 3, 0));
    expect(questionOfTheDay(lessons, day(0))).toEqual(questionOfTheDay(lessons, new Date(Date.UTC(2026, 9, 20, 15, 30))));
    const seen = new Set([0, 1, 2].map((d) => questionOfTheDay(lessons, day(d))!.prompt));
    expect(seen).toEqual(new Set(['Q1?', 'Q2?', 'Q3?']));
  });

  it('copes with no questions at all', () => {
    expect(questionOfTheDay([], new Date())).toBeNull();
    expect(buildMessage('morning', [], new Date())).toContain('Up next');
  });
});

describe('buildMessage', () => {
  const now = new Date('2026-10-20T02:30:00Z');

  it('morning: the goal, a question and the link', () => {
    const m = buildMessage('morning', lessons, now, 'https://example.org/');
    expect(m).toMatch(/Today’s goal: 1 lesson/);
    expect(m).toMatch(/Something to think about today: “Q\d\?”/);
    expect(m).toContain('https://example.org/');
  });

  it('evening: states the way back, without guilt', () => {
    const m = buildMessage('evening', lessons, now);
    expect(m).toMatch(/still time/);
    expect(m).not.toMatch(/fail|lazy|lose|shame|disappoint/i);
  });

  it('stays within Discord’s limit even with a huge question', () => {
    const big = [{ id: 'x', title: 'T'.repeat(500), quiz: [{ prompt: 'word '.repeat(2000) }] }];
    const m = buildMessage('morning', big, now);
    expect(m.length).toBeLessThan(DISCORD_LIMIT);
    expect(m).toContain('…');
  });

  it('every day of a year, with the real lessons, fits and names a real lesson', () => {
    const real = loadCatalog();
    const titles = new Set(real.map((l) => l.title));
    for (let d = 0; d < 366; d++) {
      const m = buildMessage('morning', real, new Date(Date.UTC(2026, 0, 1 + d, 2, 30)));
      expect(m.length).toBeLessThan(DISCORD_LIMIT);
      const from = /\(from \*(.+)\*\)\.$/m.exec(m)?.[1];
      expect(from && (titles.has(from) || from.endsWith('…'))).toBe(true);
    }
  });
});

describe('webhookBody', () => {
  it('sends the content and turns off every ping', () => {
    expect(JSON.parse(webhookBody('hi @everyone'))).toEqual({ content: 'hi @everyone', allowed_mentions: { parse: [] } });
  });
});

import { describe, expect, it } from 'vitest';
import { CRON, DISCORD_LIMIT, buildMessage, istDayNumber, questionOfTheDay, slotFor, webhookBody, type ReminderLesson } from './message';
import { loadCatalog } from '../lesson/catalog';
import workflow from '../../.github/workflows/reminder.yml?raw';

const lessons: ReminderLesson[] = [
  { id: 'a', title: 'Arrays', quiz: [{ prompt: 'Q1?' }, { prompt: 'Q2?' }] },
  { id: 'b', title: 'Binary search', quiz: [{ prompt: 'Q3?' }] },
];

describe('slotFor', () => {
  it('maps each cron line to its slot, and a manual run to what was asked', () => {
    expect(slotFor(CRON.morning, undefined)).toBe('morning');
    expect(slotFor(CRON.evening, undefined)).toBe('evening');
    expect(slotFor(undefined, 'evening')).toBe('evening');
    expect(slotFor(CRON.evening, 'morning')).toBe('morning');
    expect(slotFor(undefined, 'nonsense')).toBe('morning');
  });

  it('the workflow schedules exactly these two cron lines', () => {
    const lines = [...workflow.matchAll(/- cron: '([^']+)'/g)].map((m) => m[1]);
    expect(lines).toEqual([CRON.morning, CRON.evening]);
  });

  it('the cron lines are 08:00 and 21:00 IST (UTC+5:30)', () => {
    const ist = (cron: string) => {
      const [m, h] = cron.split(' ').map(Number) as [number, number];
      const total = (h * 60 + m + 330) % 1440;
      return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
    };
    expect(ist(CRON.morning)).toBe('8:00');
    expect(ist(CRON.evening)).toBe('21:00');
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

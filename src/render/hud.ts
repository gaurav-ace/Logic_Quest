import type { Progress } from '../rewards/engine';
import { el } from './dom';

/** One line about the streak: the facts and the way forward, never guilt (CLAUDE.md section 7). */
export function streakMessage(p: Progress, bufferCost: number): string {
  const left = Math.max(p.goalToday - p.doneToday, 0);
  const lessons = left === 1 ? '1 lesson' : `${left} lessons`;
  if (left === 0) return 'Today’s goal is done.';
  if (p.streak === 0) return `Finish ${lessons} today to start a streak.`;
  if (p.bufferUsedYesterday) return `Yesterday used your buffer. Finish ${lessons} today to keep your ${p.streak}-day streak.`;
  return `Finish ${lessons} today to grow your streak. Missing today uses your buffer (−${bufferCost} coins).`;
}

export function renderHud(p: Progress, bufferCost: number): HTMLElement {
  const span = p.levelTo === null ? 1 : (p.xp - p.levelFrom) / (p.levelTo - p.levelFrom);
  const bar = el('div', {
    class: 'xp-bar',
    role: 'progressbar',
    'aria-label': `Level ${p.level} progress`,
    'aria-valuemin': 0,
    'aria-valuemax': 100,
    'aria-valuenow': Math.round(span * 100),
  });
  const fill = el('i');
  fill.style.width = `${Math.round(span * 100)}%`;
  bar.append(fill);

  const stats = el('div', { class: 'hud-stats' });
  stats.append(
    stat('Level', String(p.level)),
    stat('XP', p.levelTo === null ? String(p.xp) : `${p.xp} / ${p.levelTo}`),
    stat('Streak', `${p.streak} ${p.streak === 1 ? 'day' : 'days'}`),
    stat('Coins', String(p.coins)),
  );
  const hud = el('section', { class: 'card hud', 'aria-label': 'Your progress' });
  hud.append(stats, bar, el('p', { class: 'hud-today' }, `Today: ${p.doneToday} / ${p.goalToday}. ${streakMessage(p, bufferCost)}`));
  return hud;
}

function stat(label: string, value: string): HTMLElement {
  const d = el('div');
  d.append(el('small', {}, label), el('strong', {}, value));
  return d;
}

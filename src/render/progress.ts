import { persistMessage, type PersistState } from '../progress/persist';
import type { ProgressStore } from '../progress/store';
import type { Tracker } from '../progress/tracker';
import type { RewardsConfig } from '../rewards/config';
import { addDays, localDay, type Day } from '../rewards/days';
import type { DayStatus } from '../rewards/engine';
import { button, el } from './dom';
import { renderHud } from './hud';

const DAY_LABEL: Record<DayStatus | 'none', [mark: string, text: string]> = {
  met: ['✓', 'goal met'],
  buffer: ['◐', 'buffer used'],
  broken: ['✕', 'streak broke'],
  missed: ['–', 'no lesson'],
  pending: ['○', 'today, not done yet'],
  none: ['·', 'before you started'],
};

export function renderProgress(root: HTMLElement, tracker: Tracker, config: RewardsConfig): void {
  const p = tracker.progress();
  const today = localDay(new Date());

  // Last 7 days, oldest first.
  const week = el('ol', { class: 'week', 'aria-label': 'Last 7 days' });
  for (let i = 6; i >= 0; i--) {
    const day = addDays(today, -i);
    const status = p.days.get(day) ?? (day === today ? 'pending' : 'none');
    const [mark, label] = DAY_LABEL[status];
    const li = el('li', { class: `day ${status}`, 'aria-label': `${weekday(day)}: ${label}` });
    li.append(el('span', { class: 'mark', 'aria-hidden': 'true' }, mark), el('small', { 'aria-hidden': 'true' }, weekday(day)));
    week.append(li);
  }
  const streakCard = el('section', { class: 'card panel', 'aria-label': 'Streak' });
  streakCard.append(
    el('h3', {}, 'Streak'),
    el('p', {}, `Current: ${p.streak} ${p.streak === 1 ? 'day' : 'days'}. Best: ${p.bestStreak}.`),
    week,
    el('p', { class: 'small' }, `Each goal day earns ${config.coins.perGoalDay} coins. One missed day uses your buffer (−${config.coins.bufferCost} coins); a second missed day in a row ends the streak (−${config.coins.breakCost} coins). Coins never go below 0, and your XP and level are never affected.`),
  );

  const earned = config.badges.filter((b) => p.badges.has(b.id));
  const grid = el('ul', { class: 'badges' });
  for (const b of config.badges) {
    const on = p.badges.get(b.id);
    const li = el('li', { class: `badge${on ? ' earned' : ''}` });
    li.append(
      el('strong', {}, `${on ? '🏅' : '🔒'} ${b.title}`),
      el('span', {}, on ? `Earned ${shortDate(on)}` : b.description),
    );
    grid.append(li);
  }
  const badgeCard = el('section', { class: 'card panel', 'aria-label': 'Badges' });
  badgeCard.append(el('h3', {}, `Badges: ${earned.length} of ${config.badges.length}`), grid);

  const layout = el('div', { class: 'progress-grid' });
  layout.append(renderHud(p, config.coins.bufferCost), streakCard, badgeCard);
  root.replaceChildren(el('h2', {}, 'Your progress'), layout);
}

export function renderSettings(root: HTMLElement, tracker: Tracker, store: ProgressStore, config: RewardsConfig, persist: PersistState): void {
  const redraw = () => renderSettings(root, tracker, store, config, persist);
  const p = tracker.progress();
  const today = localDay(new Date());
  root.replaceChildren(el('h2', {}, 'Settings'), settings(), backup());

  function settings(): HTMLElement {
    const card = el('section', { class: 'card panel', 'aria-label': 'Settings' });
    const goals = el('div', { class: 'segmented', role: 'group', 'aria-label': 'Daily goal' });
    for (let g = config.dailyGoal.min; g <= config.dailyGoal.max; g++) {
      goals.append(
        button(String(g), () => {
          if (g !== p.goalToday) {
            tracker.setDailyGoal(g);
            redraw();
          }
        }, { 'aria-pressed': String(g === p.goalToday), 'aria-label': `${g} ${g === 1 ? 'lesson' : 'lessons'} a day` }),
      );
    }
    const calm = store.settings.calm;
    const calmBtn = button(`Calm mode: ${calm ? 'on' : 'off'}`, () => {
      store.setSettings({ calm: !calm });
      redraw();
    }, { 'aria-pressed': String(calm) });
    card.append(
            el('p', {}, 'Daily goal (lessons a day). A change applies from today; past days keep the goal they had.'),
      goals,
      el('p', {}, 'Calm mode turns off reward pop-ups. Rewards still show as text.'),
      calmBtn,
    );
    return card;
  }

  function backup(): HTMLElement {
    const card = el('section', { class: 'card panel', 'aria-label': 'Backup' });
    const status = el('div', { class: 'backup-status', 'aria-live': 'polite' });
    const file = el('input', { type: 'file', accept: '.json,application/json', hidden: '' });
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      file.value = '';
      if (!f) return;
      const preview = store.previewImport(await f.text());
      if (!preview.ok) {
        status.replaceChildren(el('p', { class: 'bad' }, `That file can't be imported: ${preview.problem}. Nothing was changed.`));
        return;
      }
      if (preview.newCount === 0) {
        status.replaceChildren(el('p', {}, 'Everything in that file is already here. Nothing to add.'));
        return;
      }
      const merge = button(`Merge ${preview.newCount} ${preview.newCount === 1 ? 'item' : 'items'}`, () => {
        store.applyImport(preview);
        redraw();
        root.querySelector('.backup-status')?.replaceChildren(el('p', {}, `Merged ${preview.newCount} ${preview.newCount === 1 ? 'item' : 'items'} into your progress.`));
      }, { class: 'primary' });
      const actions = el('div', { class: 'controls' });
      actions.append(button('Cancel', () => status.replaceChildren()), merge);
      status.replaceChildren(el('p', {}, `This file has ${preview.newCount} new ${preview.newCount === 1 ? 'item' : 'items'}. Merging adds them to your progress and never counts anything twice.`), actions);
    });
    const actions = el('div', { class: 'controls' });
    actions.append(button('Export backup', () => download(store.exportText(), `logic-quest-progress-${today}.json`)), button('Import backup', () => file.click()));
    card.append(
      el('h3', {}, 'Backup'),
      el('p', {}, 'Your progress is saved on this device after every answer, so it is still here when you come back tomorrow. It lives only in this browser: clearing site data, or uninstalling the app, deletes it.'),
      el('p', { class: 'persist-state' }, persistMessage(persist)),
      el('p', {}, 'Export a backup now and then, and import it on any device.'),
      actions,
      file,
      status,
    );
    return card;
  }
}

function download(text: string, name: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const weekday = (day: Day) => new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });
const shortDate = (day: Day) => new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

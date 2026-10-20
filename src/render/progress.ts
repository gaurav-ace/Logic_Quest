import { persistMessage, type PersistState } from '../progress/persist';
import type { WorkshopStore } from '../practice/workshop';
import type { ProgressStore } from '../progress/store';
import type { Tracker } from '../progress/tracker';
import { MIN_ASKED, type TrackStats } from '../review/recommend';
import type { RewardsConfig } from '../rewards/config';
import { keyProblem } from '../tutor/gemini';
import type { GeminiKeyStore } from '../tutor/key';
import { addDays, localDay, type Day } from '../rewards/days';
import type { DayStatus } from '../rewards/engine';
import { button, download, el } from './dom';
import { renderHud } from './hud';

const DAY_LABEL: Record<DayStatus | 'none', [mark: string, text: string]> = {
  met: ['✓', 'goal met'],
  buffer: ['◐', 'buffer used'],
  broken: ['✕', 'streak broke'],
  missed: ['–', 'no lesson'],
  pending: ['○', 'today, not done yet'],
  none: ['·', 'before you started'],
};

export function renderProgress(root: HTMLElement, tracker: Tracker, config: RewardsConfig, tracks?: TrackStats[], lessonHref: (id: string) => string = (id) => `#/lesson/${id}`): void {
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
  // By track comes before the badges: it's what says what to work on.
  layout.append(renderHud(p, config.coins.bufferCost), streakCard, ...(tracks ? [trackCards(tracks, lessonHref)] : []), badgeCard);
  root.replaceChildren(el('h2', {}, 'Your progress'), layout);
}

/** Phase 7 dashboard: how each track is going, in plain numbers. Bars are decoration; the text says it all. */
function trackCards(tracks: TrackStats[], lessonHref: (id: string) => string): HTMLElement {
  const section = el('section', { class: 'track-stats', 'aria-label': 'By track' });
  section.append(el('h3', {}, 'By track'));
  const list = el('ul', { class: 'track-stat-list' });
  for (const t of tracks) {
    const li = el('li', { class: 'card panel track-stat', 'data-track': t.track });
    const bar = el('div', { class: 'stat-bar', 'aria-hidden': 'true' });
    const fill = el('span');
    fill.style.width = `${t.total ? Math.round((100 * t.done) / t.total) : 0}%`;
    bar.append(fill);
    const firstTry = t.asked >= MIN_ASKED ? `First try right: ${Math.round((100 * t.firstTry) / t.asked)}% (${t.firstTry} of ${t.asked})` : t.asked ? `First try right: ${t.firstTry} of ${t.asked} (too few to judge yet)` : 'No questions answered yet';
    li.append(el('h4', {}, t.name), el('p', {}, `${t.done} of ${t.total} ${t.total === 1 ? 'lesson' : 'lessons'} done`), bar, el('p', {}, firstTry));
    if (t.inReview || t.mastered) li.append(el('p', {}, `In review: ${t.inReview}${t.due ? ` (${t.due} due today)` : ''} · Mastered: ${t.mastered}`));
    if (t.mostMissed.length) {
      const missed = el('ul', { class: 'most-missed' });
      for (const m of t.mostMissed) {
        const item = el('li');
        item.append(el('a', { href: lessonHref(m.lesson.id), class: 'tutor-open' }, `${m.lesson.title} (${m.misses} missed)`));
        missed.append(item);
      }
      li.append(el('p', { class: 'small' }, 'Missed most:'), missed);
    }
    list.append(li);
  }
  section.append(list);
  return section;
}

export function renderSettings(root: HTMLElement, tracker: Tracker, store: ProgressStore, config: RewardsConfig, persist: PersistState, learners?: () => HTMLElement, workshop?: WorkshopStore, aiKey?: GeminiKeyStore): void {
  const redraw = () => renderSettings(root, tracker, store, config, persist, learners, workshop, aiKey);
  const p = tracker.progress();
  const today = localDay(new Date());
  root.replaceChildren(el('h2', {}, 'Settings'), settings(), ...(learners ? [learners()] : []), ...(aiKey ? [aiTutor(aiKey)] : []), backup(), el('p', { class: 'muted app-version' }, `App version ${__APP_COMMIT__}, built ${__APP_BUILT__}`));

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

  /** The learner's own Gemini key (CLAUDE.md 4.7 exception (a)): optional, on this device only, never shown again once saved. */
  function aiTutor(keys: GeminiKeyStore): HTMLElement {
    const card = el('section', { class: 'card panel ai-tutor', 'aria-label': 'AI tutor' });
    const status = el('p', { class: 'ai-key-status', 'aria-live': 'polite' });
    card.append(
      el('h3', {}, 'AI tutor (optional)'),
      el('p', {}, 'Suggested answers and search work offline with no key, and “Ask Claude” needs none either. To also get AI answers inside lessons, add your own free Gemini API key.'),
    );
    if (keys.get()) {
      card.append(el('p', {}, 'A Gemini key is saved for this learner on this device. It isn’t shown again and isn’t in backups.'));
      const remove = button('Remove key', () => {
        keys.remove();
        redraw();
        root.querySelector('.ai-key-status')?.replaceChildren('Key removed. Gemini is off for this learner.');
      });
      const row = el('div', { class: 'controls' });
      row.append(remove);
      card.append(row);
    } else {
      const steps = el('ol', { class: 'ai-steps' });
      const studio = el('li');
      studio.append(el('a', { href: 'https://aistudio.google.com/apikey', target: '_blank', rel: 'noopener', class: 'tutor-open' }, 'Open Google AI Studio'), ' and sign in.');
      steps.append(studio, el('li', {}, 'Create an API key there and copy it.'), el('li', {}, 'Paste it here and tap Save key.'));
      const form = el('form', { class: 'outline-add ai-key-form' });
      const input = el('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Gemini API key', placeholder: 'Paste your key', class: 'learner-input' });
      form.append(input, el('button', { type: 'submit', class: 'primary' }, 'Save key'));
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const problem = keyProblem(input.value);
        if (problem) {
          status.className = 'ai-key-status bad';
          status.textContent = problem;
          return;
        }
        if (!keys.set(input.value)) {
          status.className = 'ai-key-status bad';
          status.textContent = "The key couldn't be saved on this device (storage is full or blocked).";
          return;
        }
        input.value = '';
        redraw();
        root.querySelector('.ai-key-status')?.replaceChildren('Key saved. Open a lesson, then “Ask about this lesson” → Ask Gemini.');
      });
      card.append(steps, form);
    }
    card.append(
      status,
      el('p', { class: 'small' }, 'Privacy: on the free tier, Google says the content you send is “used to improve our products”. Logic Quest sends Gemini only the lesson’s text and your question, never your progress, name or other data. The key stays in this learner’s storage on this device, so anyone using this device as this learner can use it. Remove it any time.'),
      el('p', { class: 'small' }, 'Answers are grounded in the lesson’s text only: on the free tier, Gemini’s Google Search can’t be used, so it can’t look things up. Check what it says against the lesson’s sources.'),
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
      const text = await f.text();
      const preview = store.previewImport(text);
      if (!preview.ok) {
        status.replaceChildren(el('p', { class: 'bad' }, `That file can't be imported: ${preview.problem}. Nothing was changed.`));
        return;
      }
      // The progress part has been checked, so the text is valid JSON. Older backups have no workshop part.
      const notes = (JSON.parse(text) as { workshop?: unknown }).workshop;
      const problems = workshop?.previewImport(notes) ?? 0;
      if (preview.newCount === 0 && problems === 0) {
        status.replaceChildren(el('p', {}, 'Everything in that file is already here. Nothing to add.'));
        return;
      }
      const what = [
        ...(preview.newCount ? [`${preview.newCount} new ${preview.newCount === 1 ? 'item' : 'items'} of progress`] : []),
        ...(problems ? [`workshop notes for ${problems} ${problems === 1 ? 'problem' : 'problems'}`] : []),
      ].join(' and ');
      const merge = button('Merge', () => {
        store.applyImport(preview);
        const saved = workshop?.importAll(notes) ?? true;
        redraw();
        root.querySelector('.backup-status')?.replaceChildren(
          el('p', {}, `Merged ${what}.`),
          ...(saved ? [] : [el('p', { class: 'bad' }, "The workshop notes couldn't be saved on this device (storage is full or blocked).")]),
        );
      }, { class: 'primary' });
      const actions = el('div', { class: 'controls' });
      actions.append(button('Cancel', () => status.replaceChildren()), merge);
      status.replaceChildren(el('p', {}, `This file has ${what}. Merging adds them and never counts anything twice; notes you wrote here are kept.`), actions);
    });
    const actions = el('div', { class: 'controls' });
    actions.append(button('Export backup', () => download(withWorkshop(store.exportText(), workshop), `logic-quest-progress-${today}.json`)), button('Import backup', () => file.click()));
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

const weekday = (day: Day) => new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });
const shortDate = (day: Day) => new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Adds the learner's workshop notes to a progress backup, when there are any. */
function withWorkshop(progress: string, workshop: WorkshopStore | undefined): string {
  const saves = workshop?.exportAll() ?? {};
  if (Object.keys(saves).length === 0) return progress;
  return JSON.stringify({ ...(JSON.parse(progress) as object), workshop: saves }, null, 2);
}

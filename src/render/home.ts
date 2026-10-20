import type { Lesson, Track } from '../lesson/schema';
import { groupByTrack, missingRequirements, trackToOpen } from '../lesson/unlock';
import { FIRST_REASON, type Recommendation } from '../review/recommend';
import type { Progress } from '../rewards/engine';
import { button, el } from './dom';
import { renderHud } from './hud';

/** Builds a track's practice drop-down, or null when the track has no practice. */
export type PracticeSlot = (track: Track) => HTMLDetailsElement | null;

export function renderHome(root: HTMLElement, lessons: Lesson[], progress: Progress, bufferCost: number, open: (id: string) => void, practice?: PracticeSlot, panels: HTMLElement[] = [], rec?: Recommendation, reviewHref = '#/review'): void {
  const byId = new Map(lessons.map((l) => [l.id, l]));
  const groups = groupByTrack(lessons, progress.completed);
  const openTrack = trackToOpen(groups);
  const sections = groups.map((g) => {
    // Tracks fold away, so a long curriculum stays easy to scan on a phone.
    const section = el('details', { class: 'track', 'data-track': g.track });
    if (g.track === openTrack) section.open = true;
    const summary = el('summary');
    summary.append(el('span', { class: 'track-name' }, g.name), el('span', { class: 'track-count' }, `${g.done} of ${g.lessons.length} done`));
    const list = el('ul', { class: 'lesson-list' });
    for (const lesson of g.lessons) list.append(card(lesson));
    section.append(summary, list);
    const drill = practice?.(g.track);
    if (drill) {
      section.append(drill);
      // Coming back from a practice item reopens its list, so the track must be open too.
      if (drill.open) section.open = true;
    }
    return section;
  });
  const main = el('div', { class: 'home-main' });
  main.append(el('h2', {}, 'Lessons'), el('p', { class: 'objective' }, 'Watch a system run, then prove you got it.'), ...sections);
  const next = rec ? null : nextLesson();
  const side = el('aside', { class: 'home-side', 'aria-label': 'Your progress' });
  side.append(renderHud(progress, bufferCost));
  const layout = el('div', { class: 'home' });
  if (rec) layout.append(recommendCard(rec));
  else if (next) layout.append(continueCard(next));
  layout.append(...panels, side, main);
  root.replaceChildren(layout);

  /** First unlocked, unfinished lesson in curriculum order: the one to do next. */
  function nextLesson(): Lesson | undefined {
    return groups.flatMap((g) => g.lessons).find((l) => !progress.completed.has(l.id) && missingRequirements(l, progress.completed, byId).length === 0);
  }

  function continueCard(lesson: Lesson, reason?: string): HTMLElement {
    const started = reason ? reason !== FIRST_REASON : progress.completed.size > 0;
    const c = el('section', { class: 'card continue', 'aria-label': 'Up next' });
    c.dataset.track = lesson.track;
    const go = el('button', { type: 'button', class: 'primary', 'data-id': lesson.id }, started ? 'Continue' : 'Start');
    go.addEventListener('click', () => open(lesson.id));
    c.append(el('small', {}, started ? 'Up next' : 'Start here'), el('h3', {}, lesson.title), el('p', {}, lesson.objective), ...(reason ? [el('p', { class: 'up-next-why' }, reason)] : []), go);
    return c;
  }

  /** Phase 7: the recommended next step, always with its reason. */
  function recommendCard(r: Recommendation): HTMLElement {
    if (r.kind === 'lesson') return continueCard(r.lesson, r.reason);
    const c = el('section', { class: 'card continue', 'aria-label': 'Up next' });
    if (r.kind === 'review') {
      c.dataset.track = r.track;
      c.append(el('small', {}, 'Up next'), el('h3', {}, `Review ${r.count} ${r.count === 1 ? 'question' : 'questions'}`), el('p', { class: 'up-next-why' }, r.reason), button('Start review', () => (location.hash = reviewHref), { class: 'primary' }));
    } else c.append(el('small', {}, 'Up next'), el('h3', {}, 'All lessons done'), el('p', { class: 'up-next-why' }, r.reason));
    return c;
  }

  function card(lesson: Lesson): HTMLElement {
    const done = progress.completed.has(lesson.id);
    const missing = missingRequirements(lesson, progress.completed, byId);
    const locked = missing.length > 0;
    const b = el('button', { type: 'button', class: `lesson-card${done ? ' done' : ''}${locked ? ' locked' : ''}`, 'data-id': lesson.id, 'data-level': lesson.level });
    const questions = lesson.quiz.length === 1 ? '1 question' : `${lesson.quiz.length} questions`;
    const kind = lesson.kind === 'trace' ? 'Trace' : lesson.kind === 'sim' ? `Simulation · ${lesson.challenges.length} challenge${lesson.challenges.length === 1 ? '' : 's'}` : lesson.kind === 'design' ? `${lesson.steps.length} steps · fix a design` : lesson.kind === 'agent' ? `Agent run · ${lesson.challenges.length} challenge${lesson.challenges.length === 1 ? '' : 's'}` : `${lesson.steps.length} steps`;
    const status = done ? '✓ Done · ' : locked ? '🔒 ' : '';
    const note = el('span', { class: 'lesson-lock', 'aria-live': 'polite' });
    b.append(
      el('span', { class: 'lesson-title' }, lesson.title),
      el('span', { class: 'lesson-goal' }, lesson.objective),
      el('span', { class: 'lesson-meta' }, `${status}${capitalise(lesson.level)} · ${kind} · ${questions}`),
      note,
    );
    b.addEventListener('click', () => {
      // A locked card explains itself instead of doing nothing.
      if (locked) note.textContent = `Finish ${missing.map((l) => `“${l.title}”`).join(' and ')} first.`;
      else open(lesson.id);
    });
    const li = el('li');
    li.append(b);
    return li;
  }
}

const capitalise = (s: string) => s[0]!.toUpperCase() + s.slice(1);

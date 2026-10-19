import type { Lesson } from '../lesson/schema';
import { groupByTrack, missingRequirements, trackToOpen } from '../lesson/unlock';
import type { Progress } from '../rewards/engine';
import { el } from './dom';
import { renderHud } from './hud';

export function renderHome(root: HTMLElement, lessons: Lesson[], progress: Progress, bufferCost: number, open: (id: string) => void): void {
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
    return section;
  });
  root.replaceChildren(renderHud(progress, bufferCost), el('h2', {}, 'Lessons'), el('p', { class: 'objective' }, 'Watch a system run, then prove you got it.'), ...sections);

  function card(lesson: Lesson): HTMLElement {
    const done = progress.completed.has(lesson.id);
    const missing = missingRequirements(lesson, progress.completed, byId);
    const locked = missing.length > 0;
    const b = el('button', { type: 'button', class: `lesson-card${done ? ' done' : ''}${locked ? ' locked' : ''}`, 'data-id': lesson.id });
    const questions = lesson.quiz.length === 1 ? '1 question' : `${lesson.quiz.length} questions`;
    const kind = lesson.kind === 'trace' ? 'Trace' : lesson.kind === 'sim' ? `Simulation · ${lesson.challenges.length} challenge${lesson.challenges.length === 1 ? '' : 's'}` : lesson.kind === 'design' ? `${lesson.steps.length} steps · fix a design` : `${lesson.steps.length} steps`;
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

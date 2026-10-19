import type { Lesson } from '../lesson/schema';
import { el } from './dom';

export function renderHome(root: HTMLElement, lessons: Lesson[], open: (id: string) => void): void {
  const intro = el('p', { class: 'objective' }, 'Watch a system run, then prove you got it.');
  const list = el('ul', { class: 'lesson-list' });
  for (const lesson of lessons) {
    const card = el('button', { type: 'button', class: 'lesson-card' });
    const questions = lesson.quiz.length === 1 ? '1 question' : `${lesson.quiz.length} questions`;
    card.append(
      el('span', { class: 'lesson-title' }, lesson.title),
      el('span', { class: 'lesson-goal' }, lesson.objective),
      el('span', { class: 'lesson-meta' }, `${lesson.steps.length} steps · ${questions}`),
    );
    card.addEventListener('click', () => open(lesson.id));
    const li = el('li');
    li.append(card);
    list.append(li);
  }
  root.replaceChildren(el('h2', {}, 'Lessons'), intro, list);
}

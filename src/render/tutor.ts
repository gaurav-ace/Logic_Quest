import type { Lesson, Source } from '../lesson/schema';
import type { Faq, FaqFile } from '../tutor/faq';
import { search, type Hit, type Index } from '../tutor/search';
import { button, el } from './dom';

// "Ask about this lesson": the offline tutor (tier 1). Suggested questions show answers written
// in advance from the sources (Claude drafts, the owner reviews); typed questions show the closest
// passages from the course itself. It never writes an answer, so everything shown is course text
// with its sources. All text goes in through textContent, never as HTML.

export interface TutorDeps {
  /** The lesson's track's suggested questions, and the search index that includes them. */
  load(): Promise<{ faqs: FaqFile; index: Index }>;
  /** Link to another lesson. */
  href(lessonId: string): string;
}

export const LOG_MAX = 10;

export function tutorPanel(lesson: Lesson, deps: TutorDeps): HTMLElement {
  const panel = el('details', { class: 'card tutor' });
  panel.append(el('summary', {}, 'Ask about this lesson'));
  let built = false;
  // Built on first open, so lessons that never use it don't load anything.
  panel.addEventListener('toggle', () => {
    if (!panel.open || built) return;
    built = true;
    build();
  });
  return panel;

  function build(): void {
    const intro = el('p', { class: 'muted' }, 'Answers come only from this course and its sources. Nothing here is generated, and it works offline.');
    const suggested = el('div', { class: 'tutor-suggested' });
    suggested.append(el('p', { class: 'muted' }, 'Loading questions…'));
    const form = el('form', { class: 'outline-add tutor-ask' });
    const input = el('input', { type: 'search', maxlength: 200, 'aria-label': 'Ask a question about this lesson', placeholder: 'Ask a question…', class: 'learner-input', enterkeyhint: 'search' });
    const go = el('button', { type: 'submit' }, 'Search');
    form.append(input, go);
    const log = el('ol', { class: 'tutor-log', 'aria-live': 'polite' });
    panel.replaceChildren(panel.querySelector('summary')!, intro, suggested, form, log);

    deps.load().then(
      ({ faqs, index }) => {
        const list = faqs[lesson.id] ?? [];
        suggested.replaceChildren(...(list.length ? [el('h3', {}, 'Suggested questions'), ...list.map((f) => button(f.q, () => ask(f.q, () => faqAnswer(f)), { class: 'tutor-q' }))] : []));
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const q = input.value.trim();
          if (!q) return;
          input.value = '';
          ask(q, () => searchAnswer(search(index, q, lesson.id)));
        });
      },
      () => {
        // Usually: offline before this track's questions were saved. Search still needs them loaded.
        suggested.replaceChildren(el('p', { class: 'bad' }, "The questions couldn't be loaded. Check your connection, then close and reopen this panel."));
        form.hidden = true;
        built = false;
      },
    );

    function ask(question: string, answer: () => HTMLElement): void {
      const item = el('li', { class: 'tutor-turn' });
      item.append(el('p', { class: 'tutor-you' }, question), answer());
      log.prepend(item);
      while (log.children.length > LOG_MAX) log.lastElementChild!.remove();
    }
  }

  function faqAnswer(f: Faq): HTMLElement {
    const box = el('div', { class: 'tutor-answer' });
    box.append(el('p', {}, f.a), sourceList(f.sources));
    return box;
  }

  function searchAnswer(hits: Hit[]): HTMLElement {
    const box = el('div', { class: 'tutor-answer' });
    if (hits.length === 0) {
      box.append(el('p', {}, 'Nothing in the course matches that question. Try other words, or check this lesson’s sources:'), sourceList(lesson.sources));
      return box;
    }
    box.append(el('p', { class: 'muted' }, `From the course (${hits.length} closest ${hits.length === 1 ? 'passage' : 'passages'}):`));
    for (const h of hits) {
      const hit = el('div', { class: 'tutor-hit' });
      const where = h.lessonId === lesson.id ? `This lesson · ${h.where}` : `${h.lessonTitle} · ${h.where}`;
      hit.append(el('p', { class: 'tutor-where' }, where), el('p', {}, h.text));
      if (h.lessonId !== lesson.id) hit.append(el('a', { href: deps.href(h.lessonId), class: 'tutor-open' }, `Open “${h.lessonTitle}”`));
      hit.append(sourceList(h.sources));
      box.append(hit);
    }
    return box;
  }
}

function sourceList(sources: Source[]): HTMLElement {
  const d = el('details', { class: 'tutor-sources' });
  d.append(el('summary', {}, `Sources (${sources.length})`));
  const ul = el('ul');
  for (const s of sources) {
    const li = el('li');
    if (s.url?.startsWith('https://')) li.append(el('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.title));
    else li.textContent = s.title;
    ul.append(li);
  }
  d.append(ul);
  return d;
}

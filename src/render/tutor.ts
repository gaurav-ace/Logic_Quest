import type { Lesson, Source } from '../lesson/schema';
import { CLAUDE_URL, claudePrompt, handOff, type HandoffEnv } from '../tutor/claude';
import type { Faq, FaqFile } from '../tutor/faq';
import { ERROR_TEXT, QUESTION_MAX, askGemini, type GeminiResult, type Turn } from '../tutor/gemini';
import { search, type Hit, type Index } from '../tutor/search';
import { button, el } from './dom';

// "Ask about this lesson": the offline tutor (tier 1). Suggested questions show answers written
// in advance from the sources (Claude drafts, the owner reviews); typed questions show the closest
// passages from the course itself. It never writes an answer, so everything shown is course text
// with its sources. All text goes in through textContent, never as HTML.
//
// Below it sit the AI tiers (M8, M9): "Ask Gemini" on the learner's own key, when they've added
// one, and "Ask Claude", which hands the question to the Claude app. Both are labelled as
// AI-generated, and Claude is offered wherever Gemini fails.

export interface TutorDeps {
  /** The lesson's track's suggested questions, and the search index that includes them. */
  load(): Promise<{ faqs: FaqFile; index: Index }>;
  /** Link to another lesson. */
  href(lessonId: string): string;
  /** The AI tiers. Left out, the panel is the offline tutor alone. */
  ai?: AiDeps;
}

export interface AiDeps extends HandoffEnv {
  /** The learner's Gemini key, read when asked so a key added in Settings counts at once. */
  geminiKey(): string;
  fetch: typeof fetch;
  online(): boolean;
  settingsHref: string;
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
    const intro = el('p', { class: 'muted' }, 'Suggested answers and Search come only from this course and its sources. Nothing there is generated, and it works offline.');
    const suggested = el('div', { class: 'tutor-suggested' });
    suggested.append(el('p', { class: 'muted' }, 'Loading questions…'));
    const form = el('form', { class: 'outline-add tutor-ask' });
    const input = el('input', { type: 'search', maxlength: deps.ai ? QUESTION_MAX : 200, 'aria-label': 'Ask a question about this lesson', placeholder: 'Ask a question…', class: 'learner-input', enterkeyhint: 'search' });
    const go = el('button', { type: 'submit' }, 'Search');
    form.append(input, go);
    const log = el('ol', { class: 'tutor-log', 'aria-live': 'polite' });
    panel.replaceChildren(panel.querySelector('summary')!, intro, suggested, form, ...(deps.ai ? [aiControls(deps.ai)] : []), log);

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

    function ask(question: string, answer: () => HTMLElement, who?: string): HTMLElement {
      const item = el('li', { class: 'tutor-turn' });
      item.append(el('p', { class: 'tutor-you' }, question), answer());
      if (who) item.firstElementChild!.prepend(el('span', { class: 'tutor-to' }, `To ${who}: `));
      log.prepend(item);
      while (log.children.length > LOG_MAX) log.lastElementChild!.remove();
      return item;
    }

    function aiControls(ai: AiDeps): HTMLElement {
      // Gemini's side of the conversation, for follow-up questions. Kept for this lesson visit only.
      const turns: Turn[] = [];
      const box = el('div', { class: 'tutor-ai' });
      const hint = el('p', { class: 'small tutor-ai-hint' });
      const setup = el('a', { href: ai.settingsHref, class: 'tutor-open' }, 'Add a Gemini key to get answers here');
      const row = el('div', { class: 'controls tutor-ai-row' });
      const question = (): string | null => {
        const q = input.value.trim();
        if (q) return q;
        hint.replaceChildren('Type a question in the box first.');
        input.focus();
        return null;
      };
      const gemini = button('Ask Gemini', () => {
        const q = question();
        if (!q) return;
        input.value = '';
        gemini.disabled = true;
        const item = ask(q, () => el('p', { class: 'muted' }, 'Asking Gemini…'), 'Gemini');
        void askGemini(ai.geminiKey(), lesson, turns, q, ai).then((r) => {
          if (r.ok) turns.push({ question: q, answer: r.text });
          item.lastElementChild!.replaceWith(geminiAnswer(r, q, ai));
          gemini.disabled = false;
        });
      });
      const claude = button('Ask Claude', () => {
        const q = question();
        if (!q) return;
        input.value = '';
        const item = ask(q, () => el('div', { class: 'tutor-answer' }), 'Claude');
        toClaude(q, item.lastElementChild as HTMLElement, ai);
      });
      const draw = () => {
        const hasKey = !!ai.geminiKey();
        row.replaceChildren(...(hasKey ? [gemini] : []), claude);
        hint.replaceChildren(
          hasKey
            ? 'Gemini and Claude answers are AI-generated and can be wrong: check them against the sources. Gemini sees only this lesson’s text and your question.'
            : 'Ask Claude opens the Claude app or claude.ai with your question and this lesson’s details. Its answers are AI-generated: check the cited sources.',
        );
        setup.hidden = hasKey;
      };
      draw();
      // A key added in another tab or in Settings shows up the next time the panel opens.
      panel.addEventListener('toggle', () => panel.open && draw());
      box.append(row, hint, setup);
      return box;
    }
  }

  function geminiAnswer(r: GeminiResult, question: string, ai: AiDeps): HTMLElement {
    const box = el('div', { class: 'tutor-answer tutor-ai-answer' });
    if (r.ok) {
      box.append(
        el('p', { class: 'tutor-where' }, 'AI-generated (Gemini), not checked. Compare it with this lesson’s sources.'),
        el('p', { class: 'tutor-ai-text' }, r.text),
        ...(r.truncated ? [el('p', { class: 'muted' }, 'The answer was cut short. Ask a narrower question for the rest.')] : []),
        sourceList(lesson.sources),
      );
      return box;
    }
    box.append(el('p', { class: 'bad' }, ERROR_TEXT[r.error]));
    if (r.error === 'no-key' || r.error === 'bad-key') box.append(el('a', { href: ai.settingsHref, class: 'tutor-open' }, 'Open Settings → AI tutor'));
    const status = el('div');
    box.append(button('Ask Claude instead', () => toClaude(question, status, ai)), status);
    return box;
  }

  /** Hands the question to Claude and says what happened in `where`. Runs inside the tap, so sharing is allowed. */
  function toClaude(question: string, where: HTMLElement, ai: AiDeps): void {
    if (!ai.online()) {
      where.replaceChildren(el('p', { class: 'bad' }, 'Ask Claude needs a connection. Try again when you’re online.'));
      return;
    }
    const prompt = claudePrompt(lesson, question);
    const open = () => el('a', { href: CLAUDE_URL, target: '_blank', rel: 'noopener', class: 'tutor-open' }, 'Open Claude');
    void handOff(prompt, ai).then((r) => {
      if (r === 'shared') where.replaceChildren(el('p', {}, 'Shared. The answer appears in the app you picked; it’s AI-generated, so check the cited sources.'));
      else if (r === 'cancelled') where.replaceChildren(el('p', { class: 'muted' }, 'Nothing was sent.'));
      else if (r === 'copied') where.replaceChildren(el('p', {}, 'Copied your question with this lesson’s details. Open Claude and paste it there.'), open());
      else {
        const text = el('textarea', { readonly: '', rows: 6, class: 'learner-input tutor-prompt', 'aria-label': 'Prompt for Claude' });
        text.value = prompt;
        where.replaceChildren(el('p', {}, 'Copying isn’t allowed here. Select this text, copy it, then open Claude and paste it.'), text, open());
      }
    });
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

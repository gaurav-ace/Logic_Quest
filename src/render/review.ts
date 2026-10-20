import { inSeededOrder } from '../lesson/shuffle';
import type { Feedback } from '../progress/tracker';
import type { ReviewTarget } from '../review/items';
import { button, el, scrollTo } from './dom';

// The review session (Phase 7, docs/PHASE7_PLAN.md 7.1): questions the learner missed before,
// asked again once their wait is over. Tap only. A wrong answer gets its explanation and another
// try, as in a lesson quiz; it also sends the question back to the start of its schedule. Exercises
// that need their lesson are listed with a link instead of being asked here.

export interface ReviewDeps {
  /** Today's due reviews, resolved (loading practice files if needed). */
  load(): Promise<ReviewTarget[]>;
  /** Questions per session. */
  sessionMax: number;
  /** Seeds the option order, so it differs from the lesson's and from yesterday's. */
  today: string;
  answer(lesson: string, question: number, option: number, correct: boolean): Feedback;
  /** Records the finished session (one lesson towards the goal). */
  finished(count: number): Feedback;
  celebrate(feedback: Feedback): void;
  homeHref: string;
  /** When the next review falls due, in words ("tomorrow", "in 3 days"), or null if none. */
  nextDue(): string | null;
}

export function renderReview(root: HTMLElement, deps: ReviewDeps): void {
  // Claim and source checked 2026-10-20 (Crossref record and abstract): on tests 2 days and 1 week
  // later, students who had practised recalling remembered substantially more than those who
  // had restudied. The gaps between reviews are this app's schedule, not a claim from the paper.
  const intro = el('p', { class: 'objective' }, 'Questions you missed before, asked again after a gap. Trying to recall an answer helps you remember it days later better than reading it again.');
  const source = el('p', { class: 'small review-source' }, 'Source: ');
  source.append(el('a', { href: 'https://doi.org/10.1111/j.1467-9280.2006.01693.x', target: '_blank', rel: 'noopener' }, 'Roediger and Karpicke (2006), “Test-Enhanced Learning”, Psychological Science 17(3)'));
  root.replaceChildren(el('h2', {}, 'Review'), intro, el('p', { class: 'muted' }, 'Loading…'));
  deps.load().then(start, () => {
    root.replaceChildren(el('h2', {}, 'Review'), el('p', { class: 'bad' }, "The review couldn't be loaded. Check your connection and try again."), homeLink());
  });

  function start(targets: ReviewTarget[]): void {
    const asks = targets.filter((t) => t.kind === 'ask').slice(0, deps.sessionMax);
    const redos = targets.filter((t) => t.kind === 'redo');
    const waiting = targets.filter((t) => t.kind === 'ask').length - asks.length;
    if (asks.length === 0) {
      const next = deps.nextDue();
      root.replaceChildren(
        el('h2', {}, 'Review'),
        intro,
        source,
        el('p', { class: 'card review-empty' }, next ? `Nothing to review today. The next review is due ${next}.` : 'Nothing to review. Questions you miss in lessons and practice come back here after a gap.'),
        ...(redos.length ? [redoList(redos)] : []),
        homeLink(),
      );
      return;
    }
    const box = el('section', { class: 'card quiz review-box', 'aria-live': 'polite' });
    root.replaceChildren(
      el('h2', {}, 'Review'),
      intro,
      source,
      el('p', { class: 'muted review-count' }, `${asks.length} ${asks.length === 1 ? 'question' : 'questions'} today${waiting ? `, ${waiting} more after this session` : ''}.`),
      box,
    );
    show(0);

    function show(i: number): void {
      const t = asks[i]!;
      if (t.kind !== 'ask') return;
      const q = t.question;
      const feedback = el('p', { class: 'feedback', 'aria-live': 'polite' });
      const reward = el('div', { class: 'reward', 'aria-live': 'polite' });
      const after = el('div', { class: 'quiz-after' });
      const options = q.options.map((option, n) => {
        const b = button(option.text, () => {
          const right = n === q.answer;
          b.classList.add(right ? 'right' : 'wrong');
          b.disabled = true;
          feedback.textContent = option.explanation;
          const result = deps.answer(t.state.lesson, t.state.question, n, right);
          if (!right) {
            reward.replaceChildren();
            after.replaceChildren(el('p', {}, 'Try another option. This question will come back tomorrow.'));
            return;
          }
          for (const o of options) o.disabled = true;
          reward.replaceChildren(...[result.text, ...(result.levelUp ? ['Level up!'] : []), ...result.badges.map((x) => `Badge earned: ${x.title}.`)].filter(Boolean).map((s) => el('span', {}, s)));
          if (result.xp > 0 || result.badges.length) deps.celebrate(result);
          const last = i === asks.length - 1;
          after.replaceChildren(button(last ? 'Finish the review' : 'Next question', () => (last ? finish() : show(i + 1)), { class: 'primary' }));
        }, { class: 'option' });
        return b;
      });
      box.replaceChildren(
        el('p', { class: 'quiz-count' }, `Question ${i + 1} of ${asks.length} · ${t.from}`),
        ...(t.intro ? [el('p', { class: 'review-intro' }, t.intro)] : []),
        el('h3', {}, q.prompt),
        ...inSeededOrder(options, `${deps.today}:${q.prompt}`),
        feedback,
        reward,
        after,
        el('a', { href: t.href, class: 'tutor-open review-open' }, 'Open where this came from'),
      );
      scrollTo(box, 'nearest');
    }

    function finish(): void {
      const result = deps.finished(asks.length);
      if (result.xp > 0 || result.badges.length) deps.celebrate(result);
      box.replaceChildren(
        el('h3', {}, 'Review done ✓'),
        el('p', {}, result.text),
        ...result.badges.map((b) => el('p', {}, `Badge earned: ${b.title}.`)),
        ...(waiting ? [el('p', {}, `${waiting} more ${waiting === 1 ? 'question is' : 'questions are'} due. Open Review again for the next session.`)] : []),
      );
      if (redos.length) box.after(redoList(redos));
      root.append(homeLink());
    }
  }

  function redoList(redos: ReviewTarget[]): HTMLElement {
    const card = el('section', { class: 'card review-redo' });
    const ul = el('ul');
    for (const t of redos) {
      if (t.kind !== 'redo') continue;
      const li = el('li');
      li.append(el('a', { href: t.href, class: 'tutor-open' }, `${t.from}: ${t.what}`));
      ul.append(li);
    }
    card.append(el('h3', {}, 'Also due: redo in its lesson'), el('p', { class: 'muted' }, 'These need their diagram or code, so redo them where they are. Getting them right there counts as the review.'), ul);
    return card;
  }

  function homeLink(): HTMLElement {
    return el('a', { href: deps.homeHref, class: 'tutor-open review-home' }, 'Back to lessons');
  }
}

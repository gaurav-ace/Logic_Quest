import { inSeededOrder } from '../lesson/shuffle';
import type { Feedback } from '../progress/tracker';
import type { QuizQuestion } from '../lesson/schema';
import { button, el, scrollTo } from './dom';

export interface QuizHooks {
  /** Records an answer and says what it earned. */
  answer(question: number, option: number, correct: boolean): Feedback;
  /** Called once per run, when the last question is answered correctly. */
  complete(): Feedback;
  /** Shows a reward (a toast, unless calm mode is on). */
  celebrate(feedback: Feedback): void;
  /** The lesson's tutor panel, shown under the goal. The same element is reused when a lesson redraws, so its conversation stays. */
  tutor?: HTMLElement;
}

/** Shows question `index` in `box`. `replay` restarts the animation for another look. */
export function showQuestion(box: HTMLElement, questions: QuizQuestion[], index: number, replay: () => void, hooks: QuizHooks): void {
  const q = questions[index]!;
  const heading = el('h3', {}, q.prompt);
  const counter = questions.length > 1 ? el('p', { class: 'quiz-count' }, `Question ${index + 1} of ${questions.length}`) : null;
  const feedback = el('p', { class: 'feedback', 'aria-live': 'polite' });
  const reward = el('div', { class: 'reward', 'aria-live': 'polite' });
  const after = el('div', { class: 'quiz-after' });

  const options = q.options.map((option, i) => {
    const b = button(
      option.text,
      () => {
        const right = i === q.answer;
        b.classList.add(right ? 'right' : 'wrong');
        b.disabled = true;
        // Explain this option whether it was right or wrong (CLAUDE.md section 6).
        feedback.textContent = option.explanation;
        const result = hooks.answer(index, i, right);
        if (!right) {
          reward.replaceChildren();
          // Never a penalty: a hint, a replay, and another try (CLAUDE.md section 2).
          after.replaceChildren(el('p', {}, 'Try another option, or watch the steps again first.'), button('Replay the steps', replay));
          return;
        }
        for (const other of options) other.disabled = true;
        const last = index === questions.length - 1;
        // Finished: leaving now loses nothing, so the "Leave the quiz?" check no longer applies.
        if (last) box.dataset.done = 'true';
        const done = last ? hooks.complete() : null;
        const lines = [result.text, done?.text, ...badgeLines(result), ...(done ? badgeLines(done) : [])].filter(Boolean);
        reward.replaceChildren(...lines.map((line) => el('span', {}, line ?? '')));
        // One pop-up per answer, with everything it earned.
        const total = done ? { ...done, xp: result.xp + done.xp, levelUp: result.levelUp || done.levelUp, badges: [...result.badges, ...done.badges] } : result;
        if (total.xp > 0 || total.badges.length) hooks.celebrate(total);
        after.replaceChildren(
          button(last ? 'Watch again' : 'Next question', () => (last ? replay() : showQuestion(box, questions, index + 1, replay, hooks)), {
            class: 'primary',
          }),
        );
      },
      { class: 'option' },
    );
    return b;
  });

  delete box.dataset.done;
  box.replaceChildren(...(counter ? [counter] : []), heading, ...inSeededOrder(options, q.prompt), feedback, reward, after);
  box.hidden = false;
  scrollTo(box, 'nearest');
}

const badgeLines = (f: Feedback) => [...(f.levelUp ? ['Level up!'] : []), ...f.badges.map((b) => `Badge earned: ${b.title}.`)];

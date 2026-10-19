import type { QuizQuestion } from '../lesson/schema';
import { button, el, scrollTo } from './dom';

/** Shows question `index` in `box`. `replay` restarts the animation for another look. */
export function showQuestion(box: HTMLElement, questions: QuizQuestion[], index: number, replay: () => void): void {
  const q = questions[index]!;
  const heading = el('h3', {}, q.prompt);
  const counter = questions.length > 1 ? el('p', { class: 'quiz-count' }, `Question ${index + 1} of ${questions.length}`) : null;
  const feedback = el('p', { class: 'feedback', 'aria-live': 'polite' });
  const after = el('div', { class: 'quiz-after' });

  const options = q.options.map((option, i) => {
    const b = button(option.text, () => {
      const right = i === q.answer;
      b.classList.add(right ? 'right' : 'wrong');
      b.disabled = true;
      // Explain this option whether it was right or wrong (CLAUDE.md section 6).
      feedback.textContent = option.explanation;
      if (right) {
        for (const other of options) other.disabled = true;
        const more = index < questions.length - 1;
        after.replaceChildren(
          button(more ? 'Next question' : 'Watch again', () => (more ? showQuestion(box, questions, index + 1, replay) : replay()), {
            class: 'primary',
          }),
        );
      } else {
        // Never a penalty: a hint, a replay, and another try (CLAUDE.md section 2).
        after.replaceChildren(el('p', {}, 'Try another option, or watch the steps again first.'), button('Replay the steps', replay));
      }
    }, { class: 'option' });
    return b;
  });

  box.replaceChildren(...(counter ? [counter] : []), heading, ...options, feedback, after);
  box.hidden = false;
  scrollTo(box, 'nearest');
}

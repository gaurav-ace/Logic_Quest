import type { ClassDiagram } from '../engine/uml';
import type { DesignLesson, DesignStep } from '../lesson/schema';
import type { Feedback } from '../progress/tracker';
import { button, el, scrollTo } from './dom';
import type { QuizHooks } from './quiz';
import { renderStepped, type LessonView, type Stage } from './stepped';
import { buildUml, type UmlView } from './uml';

// Design lessons (Phase 5b): steps over class and sequence diagrams, then "improve the design"
// before the quiz. Exercise answers are scored like quiz questions, under their own numbers.

/** Question numbers for the exercise's two scored parts (quiz questions use 0, 1, ...; sim challenges 200+). */
export const EXERCISE_SPOT = 300;
export const EXERCISE_FIX = 301;

export function renderDesign(root: HTMLElement, lesson: DesignLesson, hooks: QuizHooks): LessonView {
  const exercise = el('section', { class: 'card exercise', 'aria-label': 'Improve the design' });
  return renderStepped(root, lesson, designStage(lesson), hooks, {
    beforeQuiz: { element: exercise, start: (done) => runExercise(exercise, lesson, hooks, done) },
  });
}

function designStage(lesson: DesignLesson): Stage {
  const views = new Map<string, UmlView>();
  const view = (key: string) => {
    let v = views.get(key);
    if (!v) {
      v = buildUml(lesson.diagrams[key]!); // keys were checked by validateLesson
      views.set(key, v);
    }
    return v;
  };
  const holder = el('div', { class: 'uml-holder' });
  const code = el('pre', { class: 'code-snippet' });
  const element = el('div', { class: 'card stage design' });
  element.append(holder, code);
  let shown = '';

  const show = (step: DesignStep, progress: number, before: boolean) => {
    const v = view(step.diagram);
    if (shown !== step.diagram) {
      holder.replaceChildren(v.element);
      shown = step.diagram;
    }
    v.mark(before ? {} : Object.fromEntries((step.highlight ?? []).map((id) => [id, 'on'])));
    v.showCalls(before ? (step.call ?? 0) - 1 : (step.call ?? Infinity), progress);
    code.hidden = before || !step.code;
    code.textContent = before ? '' : (step.code ?? []).join('\n');
  };

  return {
    element,
    steps: lesson.steps.map((s) => ({ caption: s.caption, hops: s.call === undefined ? 0 : 1, ...(s.predict ? { predict: s.predict } : {}) })),
    draw(index, progress, revealed) {
      const step = lesson.steps[index]!;
      if (revealed) return show(step, progress, false);
      // Asking "what happens next?": show where the previous step ended, not the answer.
      const prev = lesson.steps[index - 1];
      if (prev) show(prev, 1, false);
      else show(step, 1, true);
    },
  };
}

function runExercise(box: HTMLElement, lesson: DesignLesson, hooks: QuizHooks, done: () => void): void {
  const ex = lesson.exercise;
  const before = lesson.diagrams[ex.flawed]!;
  const after_ = lesson.diagrams[ex.fixed]!;
  if (before.type !== 'class' || after_.type !== 'class') return done(); // ruled out by the validator
  const flawed: ClassDiagram = before;
  const fixed: ClassDiagram = after_;

  const need = new Set(ex.edits.flawed);
  const picked = new Set<string>();
  const view = buildUml(flawed);
  const feedback = el('p', { class: 'feedback', 'aria-live': 'polite' });
  const reward = el('div', { class: 'reward', 'aria-live': 'polite' });
  const after = el('div', { class: 'quiz-after' });
  const toggles = flawed.classes.map((c) => {
    const b = button(c.name, () => {
      if (picked.has(c.id)) picked.delete(c.id);
      else picked.add(c.id);
      b.setAttribute('aria-pressed', String(picked.has(c.id)));
      view.mark(Object.fromEntries([...picked].map((id) => [id, 'picked'])));
    }, { class: 'toggle-chip', 'aria-pressed': 'false' });
    return b;
  });
  const chips = el('div', { class: 'chips' });
  chips.append(...toggles);
  const check = button('Check', () => {
    const missed = [...need].filter((id) => !picked.has(id)).length;
    const extra = [...picked].filter((id) => !need.has(id)).length;
    const right = missed === 0 && extra === 0;
    const result = hooks.answer(EXERCISE_SPOT, right ? 0 : 1, right);
    if (!right) {
      reward.replaceChildren();
      const parts = [missed ? `${missed} more class${missed === 1 ? '' : 'es'} would have to change` : '', extra ? `${extra} of your picks wouldn't need to change` : ''].filter(Boolean);
      feedback.textContent = `Not quite: ${parts.join(', and ')}. ${ex.hint}`;
      after.replaceChildren(el('p', {}, 'Change your picks and check again.'), button('Show me', () => spotted(null), { class: 'link' }));
      return;
    }
    spotted(result);
  }, { class: 'primary' });

  // The flawed design's cost, made visible: every class this one change touches.
  function spotted(result: Feedback | null): void {
    for (const t of toggles) t.disabled = true;
    check.disabled = true;
    view.mark(Object.fromEntries(ex.edits.flawed.map((id) => [id, 'edit'])));
    const n = ex.edits.flawed.length;
    feedback.textContent = `${result ? 'Right. ' : ''}In this design, one change means editing ${n} classes: ${ex.edits.flawed.map((id) => flawed.classes.find((c) => c.id === id)?.name ?? id).join(', ')}.`;
    showReward(reward, result, hooks);
    after.replaceChildren(button('Next: fix the design', () => askFix(), { class: 'primary' }));
  }

  function askFix(): void {
    const q = ex.fix;
    const fb = el('p', { class: 'feedback', 'aria-live': 'polite' });
    const rw = el('div', { class: 'reward', 'aria-live': 'polite' });
    const next = el('div', { class: 'quiz-after' });
    const options = q.options.map((o, i) => {
      const b = button(o.text, () => {
        const right = i === q.answer;
        b.classList.add(right ? 'right' : 'wrong');
        b.disabled = true;
        fb.textContent = o.explanation;
        const result = hooks.answer(EXERCISE_FIX, i, right);
        if (!right) {
          rw.replaceChildren();
          next.replaceChildren(el('p', {}, 'Try another option.'));
          return;
        }
        for (const other of options) other.disabled = true;
        showReward(rw, result, hooks);
        next.replaceChildren(button('See the fixed design', () => showFixed(), { class: 'primary' }));
      }, { class: 'option' });
      return b;
    });
    box.replaceChildren(el('h3', {}, `Fix it: ${q.prompt}`), ...options, fb, rw, next);
    scrollTo(box, 'start');
  }

  // The same change on the fixed design: fewer classes to touch is the "why it's better".
  function showFixed(): void {
    const v = buildUml(fixed);
    v.mark(Object.fromEntries(ex.edits.fixed.map((id) => [id, 'edit'])));
    const a = ex.edits.flawed.length;
    const b = ex.edits.fixed.length;
    const names = ex.edits.fixed.map((id) => fixed.classes.find((c) => c.id === id)?.name ?? id).join(', ');
    box.replaceChildren(
      el('h3', {}, 'The fixed design'),
      v.element,
      el('p', { class: 'compare' }, `Same change: edit ${b} class${b === 1 ? '' : 'es'} (${names}) instead of ${a}.`),
      el('p', {}, ex.explain),
      button('On to the quiz', () => {
        box.dataset.done = 'true';
        done();
      }, { class: 'primary' }),
    );
    scrollTo(box, 'start');
  }

  delete box.dataset.done;
  box.replaceChildren(
    el('h3', {}, 'Improve the design'),
    el('p', { class: 'change' }, `Change request: ${ex.change}`),
    view.element,
    el('p', {}, 'Tap every class you would have to edit to make this change.'),
    chips,
    check,
    feedback,
    reward,
    after,
  );
  box.hidden = false;
  scrollTo(box, 'start');
}

function showReward(box: HTMLElement, result: Feedback | null, hooks: QuizHooks): void {
  if (!result) return void box.replaceChildren();
  const lines = [result.text, ...(result.levelUp ? ['Level up!'] : []), ...result.badges.map((b) => `Badge earned: ${b.title}.`)].filter(Boolean);
  box.replaceChildren(...lines.map((line) => el('span', {}, line)));
  if (result.xp > 0 || result.badges.length) hooks.celebrate(result);
}

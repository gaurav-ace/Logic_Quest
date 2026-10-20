import type { QuizQuestion } from '../lesson/schema';
import { PROGRAMS } from '../practice/programs';
import type { DebugPractice, PracticeItem, QuizPractice } from '../practice/schema';
import type { Feedback } from '../progress/tracker';
import { seeded } from '../trace/tools';
import { button, el, scrollTo } from './dom';
import { notes } from './stepped';

// One practice item on screen. Quiz and "Debug it" items live here; guided problems open the
// workshop (workshop.ts). Every check is tap-only, explains every option, and never takes
// anything away for a wrong answer (CLAUDE.md sections 2 and 6).

export interface PracticeHooks {
  /** Records check `check` (its question number) and says what it earned. */
  answer(check: number, option: number, correct: boolean): Feedback;
  celebrate(feedback: Feedback): void;
}

export interface PracticeContext {
  /** Title of the related lesson, if any, and how to open it. */
  related?: { title: string; open: () => void };
  /** Back to the practice list. */
  back: () => void;
}

export interface PracticeView {
  destroy(): void;
  /** Started but not finished: leaving asks first. */
  inQuiz(): boolean;
}

export const KIND_LABEL: Record<PracticeItem['kind'], string> = { quiz: 'Corner cases', debug: 'Debug it', guided: 'Guided problem' };

/** Title, goal, level and kind, and the link to the related lesson. Shared with the workshop. */
export function practiceHeader(item: PracticeItem, ctx: PracticeContext): HTMLElement[] {
  const objective = el('p', { class: 'objective' });
  objective.append(el('strong', {}, 'Goal: '), item.objective);
  const meta = el('p', { class: 'practice-meta' }, `${item.level === 'hard' ? 'Hard' : 'Medium'} · ${KIND_LABEL[item.kind]}`);
  const out: HTMLElement[] = [el('h2', {}, item.title), meta, objective];
  if (ctx.related) out.push(button(`Watch it in a lesson: ${ctx.related.title}`, ctx.related.open, { class: 'related' }));
  return out;
}

/** The end of an item: a plain summary and the way back. */
export function donePanel(ctx: PracticeContext, text: string): HTMLElement {
  const box = el('section', { class: 'card practice-done', role: 'status' });
  box.append(el('h3', {}, 'Done ✓'), el('p', {}, text), button('Back to practice', ctx.back, { class: 'primary' }));
  return box;
}

/**
 * One multiple-choice check. Calls onRight once, after the right option is tapped. Wrong taps
 * explain themselves and leave the other options open.
 */
export function choiceCheck(question: QuizQuestion, check: number, hooks: PracticeHooks, onRight: () => void, label?: string): HTMLElement {
  const box = el('section', { class: 'card quiz practice-check' });
  const feedback = el('p', { class: 'feedback', 'aria-live': 'polite' });
  const reward = el('div', { class: 'reward', 'aria-live': 'polite' });
  const options = question.options.map((option, i) => {
    const b = button(
      option.text,
      () => {
        const right = i === question.answer;
        b.classList.add(right ? 'right' : 'wrong');
        b.disabled = true;
        feedback.textContent = option.explanation;
        const result = hooks.answer(check, i, right);
        if (!right) {
          reward.replaceChildren(el('span', {}, 'Not quite. Try another option.'));
          return;
        }
        for (const other of options) other.disabled = true;
        reward.replaceChildren(...[result.text, ...(result.levelUp ? ['Level up!'] : []), ...result.badges.map((x) => `Badge earned: ${x.title}.`)].filter(Boolean).map((t) => el('span', {}, t)));
        if (result.xp > 0 || result.badges.length) hooks.celebrate(result);
        onRight();
      },
      { class: 'option' },
    );
    return b;
  });
  box.append(...(label ? [el('p', { class: 'quiz-count' }, label)] : []), el('h3', {}, question.prompt), ...options, feedback, reward);
  return box;
}

export function renderPractice(root: HTMLElement, item: QuizPractice | DebugPractice, hooks: PracticeHooks, ctx: PracticeContext): PracticeView {
  let started = false;
  let finished = false;
  const tracked: PracticeHooks = {
    answer: (c, o, r) => {
      started = true;
      return hooks.answer(c, o, r);
    },
    celebrate: hooks.celebrate,
  };
  const body = el('div', { class: 'practice-body' });
  root.replaceChildren(...practiceHeader(item, ctx), body, notes(item));
  const finish = (text: string) => {
    finished = true;
    const done = donePanel(ctx, text);
    body.append(done);
    scrollTo(done, 'nearest');
  };
  if (item.kind === 'quiz') runQuiz(body, item, tracked, finish);
  else runDebug(body, item, tracked, finish);
  return { destroy: () => {}, inQuiz: () => started && !finished };
}

function runQuiz(body: HTMLElement, item: QuizPractice, hooks: PracticeHooks, finish: (text: string) => void): void {
  body.append(el('p', { class: 'practice-intro' }, item.intro));
  const show = (i: number) => {
    const n = item.questions.length;
    const check = choiceCheck(item.questions[i]!, i, hooks, () => {
      if (i + 1 < n) {
        const next = button('Next question', () => {
          next.remove();
          show(i + 1);
        }, { class: 'primary' });
        check.append(next);
      } else finish(`All ${n} corner cases worked out. Each one is a rule worth remembering when you read or write code.`);
    }, n > 1 ? `Question ${i + 1} of ${n}` : undefined);
    body.append(check);
    if (i > 0) scrollTo(check, 'nearest');
  };
  show(0);
}

function runDebug(body: HTMLElement, item: DebugPractice, hooks: PracticeHooks, finish: (text: string) => void): void {
  const program = item.program ? PROGRAMS[item.program] : undefined;
  const symptom = el('p', { class: 'card symptom' });
  symptom.append(el('strong', {}, 'The problem: '), item.symptom);

  // Step 1: tap the line. Lines are real buttons, so they work by tap and keyboard.
  const step1 = el('section', { class: 'card debug-lines', 'aria-label': 'Find the bug' });
  const lineFeedback = el('p', { class: 'feedback', 'aria-live': 'polite' });
  const code = el('ol', { class: `code debug-code ${item.language}` });
  const lines = item.code.map((text, i) => {
    const b = button(text || ' ', () => tapLine(i, b), { class: 'code-line', 'aria-label': `Line ${i + 1}: ${text.trim() || 'blank'}` });
    if (!text.trim()) b.disabled = true;
    const li = el('li');
    li.append(b);
    code.append(li);
    return b;
  });
  step1.append(el('p', { class: 'quiz-count' }, 'Step 1 of 3'), el('h3', {}, 'Tap the line that causes it.'), el('div', { class: 'scroll-x' }), lineFeedback);
  step1.querySelector('.scroll-x')!.append(code);
  body.append(symptom, step1);

  function tapLine(i: number, b: HTMLButtonElement): void {
    const right = i === item.bugLine;
    const result = hooks.answer(0, i, right);
    if (!right) {
      b.classList.add('wrong');
      lineFeedback.textContent = 'Not this line. Pick a small input and trace it line by line: where does the value first go wrong?';
      return;
    }
    b.classList.add('right');
    for (const l of lines) l.disabled = true;
    lineFeedback.textContent = `${result.text ? `${result.text}. ` : ''}${item.lineWhy}`;
    if (result.xp > 0 || result.badges.length) hooks.celebrate(result);
    predict();
  }

  // Step 2: what does the buggy code give? Step 3: which fix is right?
  function predict(): void {
    const check = choiceCheck(item.predict, 1, hooks, () => {
      if (program) check.append(runPanel(false));
      fix();
    }, 'Step 2 of 3');
    body.append(check);
    scrollTo(check, 'nearest');
  }
  function fix(): void {
    const check = choiceCheck(item.fix, 2, hooks, () => {
      if (program) check.append(runPanel(true));
      finish('You found the line, predicted what it really does, and chose the fix. That order (reproduce, locate, explain, fix) works on any bug.');
    }, 'Step 3 of 3');
    body.append(check);
    scrollTo(check, 'nearest');
  }

  // The outputs here are computed by running the copies of the code, never typed in by hand.
  let seed = 1;
  function runPanel(withFix: boolean): HTMLElement {
    const p = program!;
    const box = el('div', { class: 'run-panel', 'aria-live': 'polite' });
    const show = (input: unknown) => {
      const rows = [`${p.show(input)}`, `Buggy code gives: ${p.buggy(input)}`];
      if (withFix) rows.push(`Fixed code gives: ${p.fixed(input)}`);
      const out = el('div', { class: 'run-rows' });
      out.append(...rows.map((r, k) => el(k === 0 ? 'code' : 'p', {}, r)));
      if (withFix) out.append(el('p', { class: 'muted' }, p.buggy(input) === p.fixed(input) ? 'Same answer here: this input doesn’t trigger the bug.' : 'Different: this input triggers the bug.'));
      return out;
    };
    let current = show(item.input);
    box.append(el('p', { class: 'run-title' }, withFix ? 'The app ran both versions:' : 'The app ran the buggy code:'), current);
    if (withFix) {
      box.append(
        button('Try another input', () => {
          const next = show(p.random(seeded(seed++)));
          current.replaceWith(next);
          current = next;
        }),
      );
    }
    return box;
  }
}

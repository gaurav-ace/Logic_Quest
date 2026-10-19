import { atEnd, initialState, readingTime, reduce, type PlayerAction, type PlayerConfig } from '../engine/player';
import type { Lesson, QuizQuestion } from '../lesson/schema';
import { buildControls } from './controls';
import { button, el, reducedMotion, scrollTo } from './dom';
import { showQuestion, type QuizHooks } from './quiz';

// The shell every stepped lesson shares: player, controls, captions, "predict, then reveal",
// the quiz and the notes. A Stage supplies only what is drawn (a diagram, a code trace, ...).

const HOP_MS = 900;
/** Longest frame fed to the player, so one slow frame doesn't make the packet jump. */
const MAX_FRAME_MS = 100;

export interface StageStep {
  caption: string;
  /** Packet hops (0 for stages without a packet); sets how long the step animates. */
  hops: number;
  predict?: QuizQuestion;
}

export interface Stage {
  element: HTMLElement;
  steps: StageStep[];
  /**
   * Draw step `index` at `progress` (0 to 1). While its prediction is being asked, `revealed`
   * is false and the stage must show the state *before* the step, so the answer isn't given away.
   */
  draw(index: number, progress: number, revealed: boolean): void;
}

export interface LessonView {
  /** True while an unfinished quiz is on screen (leaving then asks first). */
  inQuiz(): boolean;
  destroy(): void;
}

export interface SteppedOptions {
  /** Extra controls under the quiz, e.g. "New example" for trace lessons. */
  footer?: HTMLElement;
  /** A part between the last step and the quiz (the design exercise); it calls `done` to open the quiz. */
  beforeQuiz?: { element: HTMLElement; start(done: () => void): void };
}

export function renderStepped(root: HTMLElement, lesson: Lesson, stage: Stage, hooks: QuizHooks, options: SteppedOptions = {}): LessonView {
  const config: PlayerConfig = {
    steps: stage.steps.map((s) => ({ hops: s.hops, readMs: readingTime(s.caption) })),
    hopMs: HOP_MS,
    reducedMotion: reducedMotion(),
  };
  let state = initialState(config);

  const title = el('h2', {}, lesson.title);
  const objective = el('p', { class: 'objective' });
  objective.append(el('strong', {}, 'Goal: '), lesson.objective);
  const stepLabel = el('p', { class: 'step-label' });
  // The caption is the text alternative for each step, so screen readers hear it change.
  const caption = el('p', { class: 'caption', 'aria-live': 'polite' });
  const predictBox = el('section', { class: 'card predict', 'aria-label': 'Predict the next step' });
  predictBox.hidden = true;
  const controls = buildControls(stage.steps.length, dispatch);
  const tally = el('p', { class: 'tally' });
  tally.hidden = true;
  const quiz = el('section', { class: 'card quiz', 'aria-label': 'Quiz' });
  quiz.hidden = true;
  const middle = options.beforeQuiz?.element;
  if (middle) middle.hidden = true;

  // Caption and controls share one bar pinned to the bottom of the screen: what just happened
  // and what to tap next are always visible together, within thumb reach (CLAUDE.md section 8).
  const player = el('div', { class: 'player' });
  player.append(stepLabel, caption, controls.element);
  root.replaceChildren(title, objective, stage.element, predictBox, player, tally, ...(middle ? [middle] : []), quiz, ...(options.footer ? [options.footer] : []), notes(lesson));

  /** Predictions answered in this run: step index -> right on the first try. */
  const predicted = new Map<number, boolean>();
  let asking = -1;
  let resumeAfterPredict = false;
  let rafId = 0;
  let lastTime: number | undefined;
  let shownStep = -1;

  function dispatch(action: PlayerAction): void {
    const wasFinished = state.finished;
    if (action.type === 'restart') predicted.clear();
    state = reduce(config, state, action);
    if (state.finished && !wasFinished) {
      showTally();
      const openQuiz = () => showQuestion(quiz, lesson.quiz, 0, replay, hooks);
      if (options.beforeQuiz) options.beforeQuiz.start(openQuiz);
      else openQuiz();
    }
    if (!state.finished && action.type !== 'tick') {
      quiz.hidden = true;
      tally.hidden = true;
      if (middle) middle.hidden = true;
    }
    maybeAsk();
    draw();
    wake();
  }

  function maybeAsk(): void {
    const step = stage.steps[state.step]!;
    if (state.finished || !step.predict || predicted.has(state.step)) {
      if (asking !== -1 && asking !== state.step) closePrediction();
      return;
    }
    if (asking === state.step) return;
    asking = state.step;
    resumeAfterPredict = state.playing;
    if (state.playing) state = reduce(config, state, { type: 'pause' });
    showPrediction(step.predict, state.step);
  }

  function showPrediction(q: QuizQuestion, index: number): void {
    let firstTry: boolean | undefined;
    const feedback = el('p', { class: 'feedback', 'aria-live': 'polite' });
    const after = el('div', { class: 'quiz-after' });
    const reveal = button('See what happens', () => {
      predicted.set(index, firstTry === true);
      closePrediction();
      // Replay the step from its start now that it may be shown.
      dispatch({ type: 'goTo', step: index });
      if (resumeAfterPredict) dispatch({ type: 'play' });
    }, { class: 'primary' });
    const opts = q.options.map((option, i) => {
      const b = button(option.text, () => {
        const right = i === q.answer;
        firstTry ??= right;
        b.classList.add(right ? 'right' : 'wrong');
        b.disabled = true;
        feedback.textContent = option.explanation;
        if (right) {
          for (const other of opts) other.disabled = true;
          after.replaceChildren(reveal);
        } else {
          after.replaceChildren(el('p', {}, 'Not quite. Try another option.'));
        }
      }, { class: 'option' });
      return b;
    });
    const skip = button('Skip, just show me', () => {
      firstTry ??= false;
      reveal.click();
    }, { class: 'link' });
    predictBox.replaceChildren(el('h3', {}, `Predict: ${q.prompt}`), ...opts, feedback, after, skip);
    predictBox.hidden = false;
  }

  function closePrediction(): void {
    asking = -1;
    predictBox.hidden = true;
    predictBox.replaceChildren();
  }

  function showTally(): void {
    const total = stage.steps.filter((s) => s.predict).length;
    if (!total) return;
    const right = [...predicted.values()].filter(Boolean).length;
    tally.textContent = `You predicted ${right} of ${total} ${total === 1 ? 'step' : 'steps'} right on the first try.`;
    tally.hidden = false;
  }

  function draw(): void {
    const revealed = asking !== state.step;
    const step = stage.steps[state.step]!;
    const key = state.step * 2 + (revealed ? 1 : 0);
    if (key !== shownStep) {
      // Only on change, so the live region isn't re-announced every frame.
      shownStep = key;
      caption.textContent = revealed ? step.caption : 'Before this step plays: what do you think happens?';
      stepLabel.textContent = `Step ${state.step + 1} of ${stage.steps.length}`;
    }
    stage.draw(state.step, revealed ? state.progress : 0, revealed);
    controls.update(state, atEnd(config, state), !revealed);
  }

  // Frames run only while something moves, so an idle lesson uses no battery.
  const busy = () => !state.finished && asking === -1 && (state.playing || state.progress < 1);
  function loop(now: number): void {
    const dt = lastTime === undefined ? 0 : Math.min(now - lastTime, MAX_FRAME_MS);
    lastTime = now;
    if (dt > 0) {
      const before = state;
      state = reduce(config, state, { type: 'tick', ms: dt });
      if (state.step !== before.step) maybeAsk();
      if (state !== before) draw();
    }
    rafId = busy() && !document.hidden ? requestAnimationFrame(loop) : 0;
    if (!rafId) lastTime = undefined;
  }
  function wake(): void {
    if (!rafId && busy() && !document.hidden) rafId = requestAnimationFrame(loop);
  }

  // A hidden tab pauses auto-play; the learner resumes it, so nothing plays unseen.
  function onVisibility(): void {
    if (document.hidden) {
      cancelAnimationFrame(rafId);
      rafId = 0;
      lastTime = undefined;
      if (state.playing) dispatch({ type: 'pause' });
    } else {
      wake();
    }
  }
  document.addEventListener('visibilitychange', onVisibility);

  function replay(): void {
    dispatch({ type: 'restart' });
    dispatch({ type: 'play' });
    scrollTo(stage.element, 'start');
  }

  maybeAsk();
  draw();
  wake();

  return {
    // The exercise counts as part of the quiz: leaving it half done asks first.
    inQuiz: () => (!quiz.hidden && quiz.dataset.done !== 'true') || (!!middle && !middle.hidden && quiz.hidden === true),
    destroy() {
      cancelAnimationFrame(rafId);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}

export function notes(lesson: Lesson): HTMLElement {
  const details = el('details', { class: 'notes' });
  details.append(el('summary', {}, 'Sources and simplifications'));
  if (lesson.simplifies) {
    const p = el('p');
    p.append(el('strong', {}, 'What this simplifies: '), lesson.simplifies);
    details.append(p);
  }
  const list = el('ul');
  for (const s of lesson.sources) {
    const li = el('li');
    if (s.url) li.append(el('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.title));
    else li.textContent = s.title;
    list.append(li);
  }
  details.append(list);
  return details;
}

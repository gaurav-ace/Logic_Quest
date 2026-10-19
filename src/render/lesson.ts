import { packetPosition, type Point } from '../engine/packet';
import { atEnd, initialState, readingTime, reduce, type PlayerAction, type PlayerConfig } from '../engine/player';
import type { Lesson } from '../lesson/schema';
import { buildControls } from './controls';
import { buildDiagram } from './diagram';
import { el, reducedMotion, scrollTo } from './dom';
import { showQuestion } from './quiz';

const HOP_MS = 900;
/** Longest frame fed to the player, so one slow frame doesn't make the packet jump. */
const MAX_FRAME_MS = 100;

export interface LessonView {
  /** True while a quiz question is on screen (leaving then asks first). */
  inQuiz(): boolean;
  destroy(): void;
}

export function renderLesson(root: HTMLElement, lesson: Lesson): LessonView {
  const byId = new Map(lesson.nodes.map((n) => [n.id, n]));
  const at = (id: string): Point => byId.get(id)!; // ids were checked by validateLesson
  const config: PlayerConfig = {
    steps: lesson.steps.map((s) => ({ hops: s.path.length, readMs: readingTime(s.caption) })),
    hopMs: HOP_MS,
    reducedMotion: reducedMotion(),
  };
  let state = initialState(config);

  const title = el('h2', {}, lesson.title);
  const objective = el('p', { class: 'objective' });
  objective.append(el('strong', {}, 'Goal: '), lesson.objective);
  const diagram = buildDiagram(lesson);
  const stage = el('div', { class: 'card stage' });
  stage.append(diagram.element);
  const stepLabel = el('p', { class: 'step-label' });
  // The caption is the text alternative for each animation step, so screen readers hear it change.
  const caption = el('p', { class: 'caption', 'aria-live': 'polite' });
  const controls = buildControls(lesson.steps.length, dispatch);
  const quiz = el('section', { class: 'card quiz', 'aria-label': 'Quiz' });
  quiz.hidden = true;

  root.replaceChildren(title, objective, stage, stepLabel, caption, controls.element, quiz, notes(lesson));

  let frame = 0;
  let lastTime: number | undefined;
  let shownStep = -1;

  function dispatch(action: PlayerAction): void {
    const wasFinished = state.finished;
    state = reduce(config, state, action);
    if (state.finished && !wasFinished) showQuestion(quiz, lesson.quiz, 0, replay);
    if (!state.finished && action.type !== 'tick') quiz.hidden = true;
    draw();
    wake();
  }

  function draw(): void {
    const step = lesson.steps[state.step]!;
    if (state.step !== shownStep) {
      // Only on change, so the live region isn't re-announced every frame.
      shownStep = state.step;
      caption.textContent = step.caption;
      stepLabel.textContent = `Step ${state.step + 1} of ${lesson.steps.length}`;
      diagram.highlight(step.highlight);
    }
    diagram.placePacket(packetPosition(step.path, at, state.progress));
    controls.update(state, atEnd(config, state));
  }

  // Frames run only while something moves, so an idle lesson uses no battery.
  const busy = () => !state.finished && (state.playing || state.progress < 1);
  function loop(now: number): void {
    const dt = lastTime === undefined ? 0 : Math.min(now - lastTime, MAX_FRAME_MS);
    lastTime = now;
    dispatchTick(dt);
    frame = busy() && !document.hidden ? requestAnimationFrame(loop) : 0;
    if (!frame) lastTime = undefined;
  }
  function dispatchTick(ms: number): void {
    if (ms <= 0) return;
    const before = state;
    state = reduce(config, state, { type: 'tick', ms });
    if (state !== before) draw();
  }
  function wake(): void {
    if (!frame && busy() && !document.hidden) frame = requestAnimationFrame(loop);
  }

  // A hidden tab pauses auto-play; the learner resumes it, so nothing plays unseen.
  function onVisibility(): void {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
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
    scrollTo(stage, 'start');
  }

  draw();
  wake();

  return {
    inQuiz: () => !quiz.hidden,
    destroy() {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}

function notes(lesson: Lesson): HTMLElement {
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

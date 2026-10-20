import type { Challenge, QuizQuestion, SimLesson } from '../lesson/schema';
import { getModel } from '../sim/registry';
import { holds, type Sample } from '../sim/runner';
import { defaults, type Metric, type Params, type SimView } from '../sim/types';
import { seeded } from '../trace/tools';
import { button, el, scrollTo, svg } from './dom';
import { basisNote, critiquePart } from './critique';
import { showQuestion, type QuizHooks } from './quiz';
import { notes, type LessonView } from './stepped';

// A live simulation lesson. The model runs in simulated time (paused when the tab is hidden),
// the learner changes settings and injects failures, and challenges are checked as it runs.

const SAMPLE_MS = 500;
const HISTORY = 60; // samples kept for the small charts: 30 simulated seconds
const MAX_FRAME_MS = 100;
const SPEEDS = [1, 2, 4];
/** XP events for challenges use question numbers from here up, apart from the quiz's. */
export const CHALLENGE_QUESTION_BASE = 200;

export function renderSim(root: HTMLElement, lesson: SimLesson, hooks: QuizHooks): LessonView {
  const model = getModel(lesson.model);
  if (!model) throw new Error(`Lesson "${lesson.id}" names unknown model "${lesson.model}"`); // the catalog checks this at load
  const base: Params = { ...defaults(model.controls), ...lesson.params };

  let params: Params = { ...base };
  let seed = 1;
  let random = seeded(seed);
  let state = model.init(params, random);
  let simMs = 0;
  let acc = 0;
  let running = true;
  let speedIndex = 0;
  let history: Sample[] = [];
  let pending: { at: number; action: string }[] = [];
  let locked = new Set<string>();

  // Challenge in progress.
  let active: { index: number; startedAt: number; countFrom: number; okFor: number; failed: boolean } | null = null;
  const solved = new Set<number>();

  const title = el('h2', {}, lesson.title);
  const objective = el('p', { class: 'objective' });
  objective.append(el('strong', {}, 'Goal: '), lesson.objective);
  const diagram = el('div', { class: 'scroll-x' });
  const metricsBox = el('div', { class: 'sim-metrics' });
  const stage = el('section', { class: 'card stage sim', 'aria-label': 'Simulation' });
  stage.append(el('p', { class: 'sim-label' }, 'Illustrative model: shapes, not real measurements'), diagram, metricsBox);
  const controlsBox = el('section', { class: 'card panel sim-controls', 'aria-label': 'Controls' });
  const challengeBox = el('section', { class: 'card panel challenge', 'aria-label': 'Challenge' });
  const quizStart = el('section', { class: 'card panel' });
  const quiz = el('section', { class: 'card quiz', 'aria-label': 'Quiz' });
  quiz.hidden = true;
  // Case studies review a flawed design first; the quiz opens when that's done.
  const review = lesson.critique ? critiquePart({ title: lesson.title, critique: lesson.critique }, hooks) : null;
  if (review) review.element.hidden = true;
  const openQuiz = () => showQuestion(quiz, lesson.quiz, 0, () => scrollTo(stage, 'start'), hooks);
  quizStart.append(el('p', {}, 'When you have tried the challenges, check your understanding.'), button('Take the quiz', () => (review ? review.start(openQuiz) : openQuiz()), { class: 'primary' }));

  const status = el('p', { class: 'step-label', 'aria-live': 'polite' });
  const playBtn = button('Pause', () => {
    running = !running;
    drawBar();
    wake();
  }, { class: 'play' });
  const speedBtn = button('1x', () => {
    speedIndex = (speedIndex + 1) % SPEEDS.length;
    drawBar();
  }, { class: 'speed' });
  const resetBtn = button('Reset', () => restart(active ? active.index : null));
  const bar = el('div', { class: 'controls' });
  bar.append(resetBtn, playBtn, speedBtn);
  const player = el('div', { class: 'player' });
  player.append(status, bar);

  const basis = basisNote(lesson);
  // Stage beside the controls and challenges on wide screens (CSS only; DOM order is the phone order).
  const split = el('div', { class: 'sim-split' });
  const side = el('div', { class: 'sim-side' });
  side.append(controlsBox, challengeBox);
  split.append(stage, side);
  root.replaceChildren(title, objective, ...(basis ? [basis] : []), split, quizStart, ...(review ? [review.element] : []), quiz, player, notes(lesson));

  // ---- controls -------------------------------------------------------------------------
  function drawControls(): void {
    const items = model!.controls.map((c) => {
      const isLocked = locked.has(c.id);
      if (c.kind === 'slider') {
        const id = `sim-${c.id}`;
        const value = Number(params[c.id]);
        const label = el('label', { for: id }, `${c.label}: `);
        const out = el('strong', {}, `${value}${c.unit ? ` ${c.unit}` : ''}`);
        label.append(out);
        if (isLocked) label.append(' 🔒');
        const input = el('input', { id, type: 'range', min: c.min, max: c.max, step: c.step, value });
        input.disabled = isLocked;
        input.addEventListener('input', () => {
          params = { ...params, [c.id]: Number(input.value) };
          out.textContent = `${input.value}${c.unit ? ` ${c.unit}` : ''}`;
        });
        const row = el('div', { class: 'slider' });
        row.append(label, input);
        return row;
      }
      if (c.kind === 'toggle') {
        const on = Boolean(params[c.id]);
        const b = button(`${c.label}: ${on ? 'on' : 'off'}${isLocked ? ' 🔒' : ''}`, () => {
          params = { ...params, [c.id]: !on };
          drawControls();
        }, { 'aria-pressed': String(on), class: 'toggle' });
        b.disabled = isLocked;
        return b;
      }
      return button(c.label, () => {
        state = model!.act(state, c.id, params);
        draw();
      }, { class: 'action' });
    });
    controlsBox.replaceChildren(el('h3', {}, 'Controls'), ...items);
  }

  // ---- challenges -----------------------------------------------------------------------
  function drawChallenge(): void {
    const index = active?.index ?? lesson.challenges.findIndex((_, i) => !solved.has(i));
    if (index === -1) {
      challengeBox.replaceChildren(el('h3', {}, 'Challenges'), el('p', {}, `All ${lesson.challenges.length} done. Keep experimenting, or take the quiz.`));
      return;
    }
    const c = lesson.challenges[index]!;
    const head = el('h3', {}, `Challenge ${index + 1} of ${lesson.challenges.length}: ${c.title}`);
    if (active) {
      const progress = el('div', { class: 'xp-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': c.goal.forSeconds, 'aria-valuenow': active.okFor });
      const fill = el('i');
      fill.style.width = `${Math.min(100, (active.okFor / c.goal.forSeconds) * 100)}%`;
      progress.append(fill);
      const metric = model!.metrics.find((m) => m.id === c.goal.metric)!;
      const waiting = simMs < active.countFrom;
      challengeBox.replaceChildren(
        head,
        el('p', {}, c.prompt),
        el(
          'p',
          { class: 'small', 'aria-live': 'polite' },
          active.failed
            ? `${metric.label} went past ${format(metric, c.goal.value)}. Change a setting, then tap Reset to try again.`
            : waiting
              ? 'Starting… the timer begins once the setup has played out.'
              : `${metric.label} ${c.goal.op === '<=' ? '≤' : '≥'} ${format(metric, c.goal.value)}${c.goal.fromStart ? ' the whole time' : ''}: held ${active.okFor.toFixed(1)} of ${c.goal.forSeconds} s.`,
        ),
        progress,
        hintButton(c),
      );
      return;
    }
    const start = button('Start challenge', () => startChallenge(index), { class: 'primary' });
    challengeBox.replaceChildren(head, el('p', {}, c.prompt), ...(c.predict ? [predictBlock(c.predict, start)] : [start]));
  }

  function hintButton(c: Challenge): HTMLElement {
    const box = el('div');
    const hint = el('p', { class: 'small', 'aria-live': 'polite' });
    box.append(button('Hint', () => (hint.textContent = c.hint), { class: 'link' }), hint);
    return box;
  }

  function predictBlock(q: QuizQuestion, next: HTMLElement): HTMLElement {
    const box = el('div', { class: 'predict-inline' });
    const feedback = el('p', { class: 'feedback', 'aria-live': 'polite' });
    const after = el('div');
    const opts = q.options.map((o, i) => {
      const b = button(o.text, () => {
        const right = i === q.answer;
        b.classList.add(right ? 'right' : 'wrong');
        b.disabled = true;
        feedback.textContent = o.explanation;
        if (right) {
          for (const x of opts) x.disabled = true;
          after.replaceChildren(next);
        } else {
          after.replaceChildren(el('p', {}, 'Not quite. Try another option.'));
        }
      }, { class: 'option' });
      return b;
    });
    const ask = el('p');
    ask.append(el('strong', {}, `Predict first: ${q.prompt}`));
    box.append(ask, ...opts, feedback, after);
    return box;
  }

  function startChallenge(index: number): void {
    const c = lesson.challenges[index]!;
    params = { ...base, ...c.setup?.params };
    locked = new Set(c.setup?.lock ?? []);
    restart(index);
  }

  function restart(index: number | null): void {
    seed = 1 + (index ?? 0);
    random = seeded(seed);
    state = model!.init(params, random);
    simMs = 0;
    acc = 0;
    history = [];
    if (index === null) {
      active = null;
      pending = [];
    } else {
      const c = lesson.challenges[index]!;
      pending = [...(c.setup?.actions ?? [])].sort((a, b) => a.at - b.at);
      // Count only after the setup (e.g. a server being killed) has happened.
      active = { index, startedAt: 0, countFrom: Math.max(0, ...pending.map((a) => a.at)), okFor: 0, failed: false };
    }
    running = true;
    drawControls();
    drawChallenge();
    draw();
    wake();
  }

  function onSample(sample: Sample): void {
    history = [...history.slice(-(HISTORY - 1)), sample];
    if (!active) return;
    const c = lesson.challenges[active.index]!;
    if (simMs <= active.countFrom || active.failed) return;
    const ok = holds(c.goal, sample.values);
    // "From the start" goals allow no slip: one bad moment ends this attempt.
    if (!ok && c.goal.fromStart) {
      active.failed = true;
      drawChallenge();
      return;
    }
    active.okFor = ok ? active.okFor + SAMPLE_MS / 1000 : 0;
    if (active.okFor >= c.goal.forSeconds) succeed(active.index);
    else drawChallenge();
  }

  function succeed(index: number): void {
    const c = lesson.challenges[index]!;
    solved.add(index);
    active = null;
    locked = new Set();
    const result = hooks.answer(CHALLENGE_QUESTION_BASE + index, 0, true);
    if (result.xp > 0 || result.badges.length) hooks.celebrate(result);
    drawControls();
    const more = lesson.challenges.some((_, i) => !solved.has(i));
    challengeBox.replaceChildren(
      el('h3', {}, `Challenge ${index + 1} done: ${c.title}`),
      el('p', { class: 'reward' }, result.xp > 0 ? `+${result.xp} XP` : 'Already scored.'),
      el('p', {}, c.explain),
      button(more ? 'Next challenge' : 'Done', () => drawChallenge(), { class: 'primary' }),
    );
  }

  // ---- drawing --------------------------------------------------------------------------
  function draw(): void {
    diagram.replaceChildren(simDiagram(model!.view(state, params)));
    const values = model!.read(state);
    metricsBox.replaceChildren(...model!.metrics.map((m) => metricTile(m, values[m.id] ?? 0, history.map((h) => h.values[m.id] ?? 0))));
    drawBar();
  }

  function drawBar(): void {
    playBtn.textContent = running ? 'Pause' : 'Play';
    playBtn.setAttribute('aria-pressed', String(running));
    speedBtn.textContent = `${SPEEDS[speedIndex]}x`;
    speedBtn.setAttribute('aria-label', `Speed ${SPEEDS[speedIndex]}x. Tap to change.`);
    status.textContent = `${running ? 'Running' : 'Paused'} · ${(simMs / 1000).toFixed(1)} s simulated`;
  }

  // ---- the loop -------------------------------------------------------------------------
  let rafId = 0;
  let last: number | undefined;
  function loop(now: number): void {
    const dt = last === undefined ? 0 : Math.min(now - last, MAX_FRAME_MS);
    last = now;
    if (running) {
      acc += dt * SPEEDS[speedIndex]!;
      let stepped = false;
      while (acc >= model!.tickMs) {
        acc -= model!.tickMs;
        while (pending.length && pending[0]!.at <= simMs) state = model!.act(state, pending.shift()!.action, params);
        state = model!.step(state, params, random);
        simMs += model!.tickMs;
        stepped = true;
        if (simMs % SAMPLE_MS === 0) onSample({ t: simMs / 1000, values: model!.read(state) });
      }
      if (stepped) draw();
    }
    rafId = running && !document.hidden ? requestAnimationFrame(loop) : 0;
    if (!rafId) last = undefined;
  }
  function wake(): void {
    if (!rafId && running && !document.hidden) rafId = requestAnimationFrame(loop);
  }
  function onVisibility(): void {
    // Hidden: stop the loop (no battery drain). Simulated time just waits.
    if (document.hidden) {
      cancelAnimationFrame(rafId);
      rafId = 0;
      last = undefined;
    } else wake();
  }
  document.addEventListener('visibilitychange', onVisibility);

  drawControls();
  drawChallenge();
  draw();
  wake();

  return {
    inQuiz: () => (!quiz.hidden && quiz.dataset.done !== 'true') || (!!review && !review.element.hidden && review.element.dataset.done !== 'true'),
    destroy() {
      cancelAnimationFrame(rafId);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}

export function format(m: Metric, v: number): string {
  switch (m.format) {
    case 'percent':
      return `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;
    case 'ms':
      return `${Math.round(v)} ms`;
    case 'per-second':
      return `${v.toFixed(1)}/s`;
    case 'count':
      return String(Math.round(v));
    default:
      return String(Math.round(v * 10) / 10);
  }
}

function metricTile(m: Metric, value: number, series: number[]): HTMLElement {
  const tile = el('div', { class: 'metric' });
  tile.append(el('small', {}, m.label), el('strong', {}, format(m, value)), sparkline(series, m.format === 'percent' ? 0.05 : 1));
  return tile;
}

/** Recent history as a tiny line. The value above it carries the meaning; this is decoration. */
function sparkline(series: number[], floor: number): SVGElement {
  const w = 120;
  const h = 26;
  const root = svg('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}`, class: 'spark', 'aria-hidden': 'true' });
  if (series.length < 2) return root;
  const max = Math.max(floor, ...series);
  const pts = series.map((v, i) => `${((i / (HISTORY - 1)) * w).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`);
  root.append(svg('polyline', { points: pts.join(' '), class: 'spark-line' }));
  return root;
}

const NODE_W = 72;
const NODE_H = 34;

function simDiagram(view: SimView): HTMLElement {
  const W = 304;
  // Tall enough for the lowest box and its note (a column of 4 needs more than the usual 214).
  const H = Math.max(214, ...view.nodes.map((n) => n.y + NODE_H / 2 + (n.note ? 28 : n.load !== undefined ? 10 : 2)));
  const root = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'svg-view sim-diagram' });
  const at = new Map(view.nodes.map((n) => [n.id, n]));
  for (const e of view.edges) {
    const a = at.get(e.from);
    const b = at.get(e.to);
    if (!a || !b) continue;
    root.append(svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: `link${e.active ? ' on' : ''}${e.broken ? ' broken' : ''}` }));
  }
  for (const n of view.nodes) {
    const w = n.width ?? NODE_W;
    const g = svg('g', { class: `snode ${n.status ?? 'ok'}` });
    g.append(svg('rect', { x: n.x - w / 2, y: n.y - NODE_H / 2, width: w, height: NODE_H, rx: 8 }));
    const t = svg('text', { x: n.x, y: n.y });
    t.textContent = n.label;
    g.append(t);
    if (n.load !== undefined) {
      g.append(svg('rect', { x: n.x - w / 2, y: n.y + NODE_H / 2 + 3, width: w, height: 5, rx: 2, class: 'load-bg' }));
      g.append(svg('rect', { x: n.x - w / 2, y: n.y + NODE_H / 2 + 3, width: Math.max(0, Math.min(1, n.load)) * w, height: 5, rx: 2, class: 'load' }));
    }
    if (n.note) {
      const note = svg('text', { x: n.x, y: n.y + NODE_H / 2 + 18, class: 'note' });
      note.textContent = n.note;
      g.append(note);
    }
    root.append(g);
  }
  const spoken = view.nodes.map((n) => `${n.label}${n.status && n.status !== 'ok' ? ` (${n.status})` : ''}${n.note ? `: ${n.note}` : ''}`).join('; ');
  const fig = el('figure', { class: 'view' });
  root.setAttribute('aria-hidden', 'true');
  fig.append(root, el('p', { class: 'sr-only' }, spoken));
  return fig;
}

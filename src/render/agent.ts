import { getScenario } from '../agent/registry';
import { meets } from '../agent/challenge';
import { runAgent } from '../agent/runner';
import type { AgentRun, Outcome, Scenario } from '../agent/types';
import type { AgentLesson, QuizQuestion } from '../lesson/schema';
import { defaults, type Params } from '../sim/types';
import type { Frame } from '../trace/types';
import { button, el, scrollTo } from './dom';
import type { QuizHooks } from './quiz';
import { CHALLENGE_QUESTION_BASE, format } from './sim';
import { renderStepped, type LessonView, type Stage } from './stepped';
import { renderView, varsTable } from './views';

// An agent lesson: step through one run of a scripted agent, turn by turn, then change the
// settings (step limit, guardrails, failures to inject) and run it again. Challenges are checked
// on the outcome of a run.

export function renderAgent(root: HTMLElement, lesson: AgentLesson, hooks: QuizHooks): LessonView {
  const scenario = getScenario(lesson.scenario);
  if (!scenario) throw new Error(`Lesson "${lesson.id}" names unknown scenario "${lesson.scenario}"`); // the catalog checks this at load
  const base: Params = { ...defaults(scenario.controls), ...lesson.params };
  let params: Params = { ...base };
  let locked = new Set<string>();
  let active: number | null = null;
  const solved = new Set<number>();
  /** Shown in the challenge box after a run: how it went. */
  let message: HTMLElement | null = null;
  let inner: LessonView | undefined;

  const show = (focus: boolean) => {
    inner?.destroy();
    const run = runAgent(scenario, params);
    const panel = el('section', { class: 'card panel agent-panel', 'aria-label': 'Settings and challenges' });
    inner = renderStepped(root, lesson, agentStage(scenario, run, params), hooks, { footer: panel });
    drawPanel(panel, run);
    if (focus) scrollTo(root.querySelector<HTMLElement>('.stage') ?? root, 'start');
  };

  function drawPanel(panel: HTMLElement, run: AgentRun): void {
    const tiles = el('div', { class: 'sim-metrics' });
    for (const m of scenario!.metrics) {
      const tile = el('div', { class: 'metric' });
      tile.append(el('small', {}, m.label), el('strong', {}, format(m, run.outcome[m.id] ?? 0)));
      tiles.append(tile);
    }
    const challengeBox = el('div', { class: 'challenge' });
    drawChallenge(challengeBox);
    const settings = el('div', { class: 'sim-controls' });
    settings.append(el('h3', {}, 'Settings'), ...widgets(), button('Run with these settings', () => runAgain(), { class: 'primary' }));
    panel.replaceChildren(el('h3', {}, 'This run'), tiles, challengeBox, settings);
  }

  function widgets(): HTMLElement[] {
    return scenario!.controls.flatMap((c): HTMLElement[] => {
      const isLocked = locked.has(c.id);
      if (c.kind === 'slider') {
        const id = `agent-${c.id}`;
        const label = el('label', { for: id }, `${c.label}: `);
        const out = el('strong', {}, `${Number(params[c.id])}${c.unit ? ` ${c.unit}` : ''}`);
        label.append(out);
        if (isLocked) label.append(' 🔒');
        const input = el('input', { id, type: 'range', min: c.min, max: c.max, step: c.step, value: Number(params[c.id]) });
        input.disabled = isLocked;
        input.addEventListener('input', () => {
          params = { ...params, [c.id]: Number(input.value) };
          out.textContent = `${input.value}${c.unit ? ` ${c.unit}` : ''}`;
        });
        const row = el('div', { class: 'slider' });
        row.append(label, input);
        return [row];
      }
      if (c.kind === 'toggle') {
        const b = button(toggleText(c.label, Boolean(params[c.id]), isLocked), () => {
          params = { ...params, [c.id]: !params[c.id] };
          b.textContent = toggleText(c.label, Boolean(params[c.id]), isLocked);
          b.setAttribute('aria-pressed', String(Boolean(params[c.id])));
        }, { class: 'toggle', 'aria-pressed': String(Boolean(params[c.id])) });
        b.disabled = isLocked;
        return [b];
      }
      return [];
    });
  }

  function runAgain(): void {
    message = null;
    if (active !== null) {
      const c = lesson.challenges[active]!;
      const outcome = runAgent(scenario!, params).outcome;
      const missed = c.goals.filter((g) => !meets(g, outcome));
      if (!missed.length) {
        const index = active;
        solved.add(index);
        active = null;
        locked = new Set();
        const result = hooks.answer(CHALLENGE_QUESTION_BASE + index, 0, true);
        if (result.xp > 0 || result.badges.length) hooks.celebrate(result);
        message = el('div', { 'aria-live': 'polite' });
        message.append(el('p', { class: 'reward' }, `Challenge done: ${c.title}. ${result.xp > 0 ? `+${result.xp} XP` : 'Already scored.'}`), el('p', {}, c.explain));
      } else {
        message = el('p', { class: 'feedback', 'aria-live': 'polite' }, `Not yet: ${missed.map((g) => `${label(g.metric)} was ${value(g.metric, outcome)}, needs ${g.op === '<=' ? 'at most' : 'at least'} ${value(g.metric, { [g.metric]: g.value } as Outcome)}`).join('; ')}. Step through the run to see why, change a setting, and run again.`);
      }
    }
    show(true);
  }

  const label = (metric: string) => scenario!.metrics.find((m) => m.id === metric)?.label ?? metric;
  const value = (metric: string, o: Outcome) => {
    const m = scenario!.metrics.find((x) => x.id === metric);
    return m ? format(m, o[metric] ?? 0) : String(o[metric] ?? 0);
  };

  function drawChallenge(box: HTMLElement): void {
    const index = active ?? lesson.challenges.findIndex((_, i) => !solved.has(i));
    if (index === -1) {
      box.replaceChildren(el('h3', {}, 'Challenges'), ...(message ? [message] : []), el('p', {}, `All ${lesson.challenges.length} done. Keep experimenting, or take the quiz.`));
      return;
    }
    const c = lesson.challenges[index]!;
    const head = el('h3', {}, `Challenge ${index + 1} of ${lesson.challenges.length}: ${c.title}`);
    if (active !== null) {
      const hint = el('p', { class: 'small', 'aria-live': 'polite' });
      box.replaceChildren(head, el('p', {}, c.prompt), ...(message ? [message] : [el('p', { class: 'small' }, 'The run above uses the challenge’s settings. Change what you can below, then tap “Run with these settings”.')]), button('Hint', () => (hint.textContent = c.hint), { class: 'link' }), hint);
      return;
    }
    const start = button('Start challenge', () => {
      params = { ...base, ...c.setup?.params };
      locked = new Set(c.setup?.lock ?? []);
      active = index;
      message = null;
      show(true);
    }, { class: 'primary' });
    box.replaceChildren(...(message ? [message] : []), head, el('p', {}, c.prompt), ...(c.predict ? [predictBlock(c.predict, start)] : [start]));
  }

  show(false);
  return {
    inQuiz: () => inner?.inQuiz() ?? false,
    destroy: () => inner?.destroy(),
  };
}

const toggleText = (label: string, on: boolean, isLocked: boolean) => `${label}: ${on ? 'on' : 'off'}${isLocked ? ' 🔒' : ''}`;

function agentStage(scenario: Scenario<unknown>, run: AgentRun, params: Params): Stage {
  const { frames } = run;
  const element = el('div', { class: 'card stage trace agent' });
  const rules = el('ol', { class: 'rules' });
  for (const r of scenario.rules) rules.append(el('li', {}, r));
  const settingsLine = scenario.controls
    .filter((c) => c.kind !== 'action')
    .map((c) => (c.kind === 'toggle' ? `${c.label}: ${params[c.id] ? 'on' : 'off'}` : `${c.label}: ${String(params[c.id])}`))
    .join(' · ');
  const views = el('div', { class: 'views' });
  const vars = el('div', { class: 'vars-box' });
  element.append(el('h4', {}, 'The scripted model’s rules (no real AI: the same settings always give the same run)'), rules, el('p', { class: 'agent-settings' }, `This run: ${settingsLine}`), views, vars);

  let shown: Frame | undefined;
  return {
    element,
    steps: frames.map((f) => ({ caption: f.caption, hops: 0, ...(f.ask ? { predict: f.ask } : {}) })),
    draw(index, _progress, revealed) {
      // While a prediction is open, show the frame before it.
      const frame = revealed ? frames[index]! : (frames[index - 1] ?? frames[index]!);
      if (frame === shown) return;
      shown = frame;
      views.replaceChildren(...frame.views.map(renderView));
      vars.replaceChildren(el('h4', {}, 'Counts'), varsTable(frame.vars));
    },
  };
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

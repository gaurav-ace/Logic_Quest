import type { TraceLesson } from '../lesson/schema';
import { getProgram } from '../trace/registry';
import { codeFor, type Frame, type Program } from '../trace/types';
import { button, el } from './dom';
import type { QuizHooks } from './quiz';
import { renderStepped, type LessonView, type Stage } from './stepped';
import { renderView, varsTable } from './views';

/**
 * A trace lesson: run the program, then step through what really happened. "New example"
 * runs it again on a fresh input, so the learner can trace a case they haven't seen.
 */
export function renderTrace(root: HTMLElement, lesson: TraceLesson, hooks: QuizHooks): LessonView {
  const program = getProgram(lesson.program);
  if (!program) throw new Error(`Lesson "${lesson.id}" names unknown program "${lesson.program}"`); // the catalog checks this at load

  let inner: LessonView;
  let example = 0;
  const show = (input: unknown) => {
    inner?.destroy();
    const fresh = button('New example', () => {
      example++;
      show(program.randomInput(Math.random));
    });
    const footer = el('section', { class: 'card panel new-example' });
    footer.append(el('p', {}, 'Trace it again on numbers you haven’t seen. Predictions come from the real run.'), fresh);
    inner = renderStepped(root, lesson, traceStage(program, input, example), hooks, { footer });
  };
  show(program.defaultInput);
  return {
    inQuiz: () => inner.inQuiz(),
    destroy: () => inner.destroy(),
  };
}

function traceStage(program: Program<unknown>, input: unknown, example: number): Stage {
  const frames = program.run(input);
  const element = el('div', { class: 'card stage trace' });
  const inputLine = el('p', { class: 'trace-input' }, `${example ? `Example ${example + 1}: ` : ''}${program.describe(input)}`);
  const codeList = el('ol', { class: 'code', 'aria-label': 'Code' });
  const lines = codeFor(program, input).map((text) => {
    const li = el('li');
    li.append(el('code', {}, text));
    codeList.append(li);
    return li;
  });
  const codeBox = el('div', { class: 'scroll-x code-box' });
  codeBox.append(codeList);
  const views = el('div', { class: 'views' });
  const vars = el('div', { class: 'vars-box' });
  element.append(inputLine, codeBox, views, vars);

  let shown: Frame | undefined;
  return {
    element,
    steps: frames.map((f) => ({ caption: f.caption, hops: 0, ...(f.ask ? { predict: f.ask } : {}) })),
    draw(index, _progress, revealed) {
      // While a prediction is open, show the frame before it: the line hasn't run yet.
      const frame = revealed ? frames[index]! : (frames[index - 1] ?? frames[index]!);
      if (frame === shown) return;
      shown = frame;
      lines.forEach((li, i) => {
        const current = frame.line === i + 1;
        li.classList.toggle('current', current);
        if (current) li.setAttribute('aria-current', 'step');
        else li.removeAttribute('aria-current');
      });
      views.replaceChildren(...frame.views.map(renderView));
      vars.replaceChildren(el('h4', {}, 'Variables'), varsTable(frame.vars));
    },
  };
}

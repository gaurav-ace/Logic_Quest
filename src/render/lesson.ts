import { packetPosition, type Point } from '../engine/packet';
import type { Lesson, QuizQuestion } from '../lesson/schema';

// Phase 0 renderer: just enough to show one lesson end to end. Phase 1 replaces the
// stepping and animation here with the full engine (play/pause, speed control).

const SVG = 'http://www.w3.org/2000/svg';
const HOP_MS = 900;
const NODE_W = 104;
const NODE_H = 46;

type Attrs = Record<string, string | number>;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

function svg(tag: string, attrs: Attrs = {}): SVGElement {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function renderLesson(root: HTMLElement, lesson: Lesson): void {
  const byId = new Map(lesson.nodes.map((n) => [n.id, n]));
  const at = (id: string): Point => byId.get(id)!; // ids were checked by validateLesson

  const title = el('h2', {}, lesson.title);
  const objective = el('p', { class: 'objective' });
  objective.append(el('strong', {}, 'Goal: '), lesson.objective);

  // The caption is the text alternative for each animation step, so screen readers hear it change.
  const diagram = svg('svg', { viewBox: '0 0 420 200', role: 'img', 'aria-label': `Diagram: ${lesson.title}` });
  for (const [a, b] of lesson.edges) {
    const p = at(a);
    const q = at(b);
    diagram.append(svg('line', { class: 'edge', x1: p.x, y1: p.y, x2: q.x, y2: q.y }));
  }
  // Drawn under the nodes, so the packet slides behind a box when it arrives instead of covering its label.
  const packet = svg('circle', { class: 'packet', r: 8, cx: -20, cy: -20 });
  diagram.append(packet);
  const nodeEls = new Map<string, SVGElement>();
  for (const n of lesson.nodes) {
    const g = svg('g', { class: 'node' });
    g.append(svg('rect', { x: n.x - NODE_W / 2, y: n.y - NODE_H / 2, width: NODE_W, height: NODE_H, rx: 10 }));
    const label = svg('text', { x: n.x, y: n.y });
    label.textContent = n.label;
    g.append(label);
    diagram.append(g);
    nodeEls.set(n.id, g);
  }

  const stage = el('div', { class: 'card stage' });
  stage.append(diagram);
  const caption = el('p', { class: 'caption', 'aria-live': 'polite' });
  const back = el('button', { type: 'button' }, 'Back');
  const count = el('span', { class: 'count' });
  const next = el('button', { type: 'button', class: 'primary' });
  const controls = el('div', { class: 'controls' });
  controls.append(back, count, next);
  const quiz = el('section', { class: 'card quiz', 'aria-label': 'Quiz' });
  quiz.hidden = true;

  root.replaceChildren(title, objective, stage, caption, controls, quiz, notes(lesson));

  let stepIndex = 0;
  let frame = 0;

  function animate(): void {
    cancelAnimationFrame(frame);
    const path = lesson.steps[stepIndex]!.path;
    const place = (progress: number) => {
      const pos = packetPosition(path, at, progress);
      packet.setAttribute('visibility', pos ? 'visible' : 'hidden');
      if (pos) {
        packet.setAttribute('cx', String(pos.x));
        packet.setAttribute('cy', String(pos.y));
      }
    };
    if (reducedMotion()) return place(1);
    const total = HOP_MS * Math.max(path.length, 1);
    let start: number | undefined;
    const tick = (now: number) => {
      start ??= now;
      const progress = (now - start) / total;
      place(progress);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }

  function showStep(): void {
    const step = lesson.steps[stepIndex]!;
    const last = stepIndex === lesson.steps.length - 1;
    caption.textContent = step.caption;
    for (const [id, g] of nodeEls) g.classList.toggle('on', step.highlight.includes(id));
    count.textContent = `Step ${stepIndex + 1} of ${lesson.steps.length}`;
    back.disabled = stepIndex === 0;
    next.textContent = last ? 'Take the quiz' : 'Next step';
    animate();
  }

  function replay(): void {
    quiz.hidden = true;
    stepIndex = 0;
    showStep();
    stage.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }

  back.addEventListener('click', () => {
    if (stepIndex > 0) {
      stepIndex--;
      showStep();
    }
  });
  next.addEventListener('click', () => {
    if (stepIndex < lesson.steps.length - 1) {
      stepIndex++;
      showStep();
    } else {
      showQuestion(quiz, lesson.quiz, 0, replay);
    }
  });

  showStep();
}

function showQuestion(box: HTMLElement, questions: QuizQuestion[], index: number, replay: () => void): void {
  const q = questions[index]!;
  const heading = el('h3', {}, q.prompt);
  const feedback = el('p', { class: 'feedback', 'aria-live': 'polite' });
  const after = el('div');
  const options = q.options.map((option, i) => {
    const b = el('button', { type: 'button', class: 'option' }, option.text);
    b.addEventListener('click', () => {
      const right = i === q.answer;
      b.classList.add(right ? 'right' : 'wrong');
      b.disabled = true;
      // Explain this option whether it was right or wrong (CLAUDE.md section 6).
      feedback.textContent = option.explanation;
      after.replaceChildren();
      if (right) {
        for (const other of options) other.disabled = true;
        const more = index < questions.length - 1;
        const nextQ = el('button', { type: 'button', class: 'primary' }, more ? 'Next question' : 'Watch again');
        nextQ.addEventListener('click', () => (more ? showQuestion(box, questions, index + 1, replay) : replay()));
        after.append(nextQ);
      } else {
        // Never a penalty: a hint, a replay, and another try (CLAUDE.md section 2).
        const again = el('button', { type: 'button' }, 'Replay the steps');
        again.addEventListener('click', replay);
        after.append(el('p', {}, 'Try another option, or replay the steps first.'), again);
      }
    });
    return b;
  });
  box.replaceChildren(heading, ...options, feedback, after);
  box.hidden = false;
  box.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
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

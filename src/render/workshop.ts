import { STAGES, STAGE_TITLE, type GuidedPractice, type GuidedStep, type OrderCheck, type SelectCheck } from '../practice/schema';
import { addItem, indent, move, orderIsRight, outdent, removeItem, selectionIsRight, shuffledOrder, NOTE_MAX, type OutlineItem, type WorkshopSave, type WorkshopStore } from '../practice/workshop';
import { button, el, scrollTo } from './dom';
import { choiceCheck, donePanel, practiceHeader, type PracticeContext, type PracticeHooks, type PracticeView } from './practice';
import { notes } from './stepped';

// The break-it-down workshop (plan section 3.4). Every guided problem follows the same six steps,
// so the habit carries over to new problems: understand, shrink it, break it down, logic per piece,
// edge cases, put it together. The learner writes first, then a tap check (graded), then sees the
// expert's version. "My workspace" collects what they wrote, so the breakdown is always in view.


export interface WorkshopOptions {
  store: WorkshopStore;
  /** Extra buttons under "My workspace" (the AI hand-off, later). */
  workspaceExtras?: (item: GuidedPractice, save: WorkshopSave) => HTMLElement[];
}

export function renderWorkshop(root: HTMLElement, item: GuidedPractice, hooks: PracticeHooks, ctx: PracticeContext, opts: WorkshopOptions): PracticeView {
  const save = opts.store.load(item.id, item.steps.length);
  let started = false;
  let finished = false;
  const tracked: PracticeHooks = {
    answer: (c, o, r) => {
      started = true;
      return hooks.answer(c, o, r);
    },
    celebrate: hooks.celebrate,
  };
  const saveNotice = el('p', { class: 'muted save-state', 'aria-live': 'polite' });
  const persist = () => {
    saveNotice.textContent = opts.store.save(item.id, save) ? '' : 'Your notes can’t be saved on this device right now; they stay until you leave this page.';
  };

  const problem = el('section', { class: 'card problem', 'aria-label': 'The problem' });
  problem.append(el('h3', {}, 'The problem'), el('p', {}, item.problem));
  if (item.example) {
    const ex = el('p', { class: 'example' });
    ex.append(el('strong', {}, 'Example: '), el('code', {}, item.example.input), ' → ', el('code', {}, item.example.output));
    problem.append(ex);
  }
  const steps = el('div', { class: 'workshop-steps' });
  const workspace = el('aside', { class: 'card workspace', 'aria-label': 'My workspace' });
  const layout = el('div', { class: 'workshop' });
  layout.append(steps, workspace);
  root.replaceChildren(...practiceHeader(item, ctx), problem, layout, saveNotice, notes(item));

  // Finished steps are shown in their done state, so a learner who comes back resumes where they left off.
  for (let i = 0; i <= save.step; i++) steps.append(stepCard(i, i < save.step));
  drawWorkspace();

  return { destroy: () => {}, inQuiz: () => started && !finished };

  function stepCard(i: number, done: boolean): HTMLElement {
    const step = item.steps[i]!;
    const card = el('section', { class: `card workshop-step${done ? ' done' : ''}`, 'data-stage': step.stage });
    card.append(el('p', { class: 'quiz-count' }, `Step ${i + 1} of ${STAGES.length}`), el('h3', {}, STAGE_TITLE[step.stage]), el('p', { class: 'step-prompt' }, step.prompt));
    card.append(step.stage === 'breakdown' ? outlineEditor() : noteBox(i));
    if (done) {
      card.append(expert(step));
      return card;
    }
    card.append(hintButton(step));
    const reveal = () => {
      card.append(expert(step));
      if (i + 1 < item.steps.length) {
        const next = button('Next step', () => {
          next.remove();
          save.step = i + 1;
          persist();
          const c = stepCard(i + 1, false);
          steps.append(c);
          scrollTo(c, 'start');
        }, { class: 'primary' });
        card.append(next);
      } else {
        finished = true;
        card.append(donePanel(ctx, 'You took the problem apart, solved the small pieces, checked the edges and put it back together. Use the same six steps on the next new problem you meet.'));
      }
    };
    if (!step.check) {
      const show = button('Show the expert’s version', () => {
        show.remove();
        reveal();
      }, { class: 'primary' });
      card.append(show);
    } else if (step.check.type === 'choice') {
      card.append(choiceCheck(step.check, i, tracked, reveal, 'Check your thinking'));
    } else if (step.check.type === 'order') {
      card.append(orderCheck(step.check, i, reveal));
    } else {
      card.append(selectCheck(step.check, i, reveal));
    }
    return card;
  }

  function expert(step: GuidedStep): HTMLElement {
    const box = el('div', { class: 'expert' });
    box.append(el('strong', {}, 'An expert’s version: '), step.model);
    return box;
  }

  function hintButton(step: GuidedStep): HTMLElement {
    const wrap = el('div', { class: 'hints' });
    const list = el('ul', { class: 'hint-list', 'aria-live': 'polite' });
    let shown = 0;
    const b = button(`Show a hint (1 of ${step.hints.length})`, () => {
      list.append(el('li', {}, step.hints[shown]!));
      shown++;
      if (shown >= step.hints.length) b.remove();
      else b.textContent = `Another hint (${shown + 1} of ${step.hints.length})`;
    });
    wrap.append(list, b);
    return wrap;
  }

  function noteBox(i: number): HTMLElement {
    const label = el('label', { class: 'note' });
    const area = el('textarea', { rows: 3, maxlength: NOTE_MAX, placeholder: 'Your answer, in your own words (not graded, saved on this device)' });
    area.value = save.notes[i] ?? '';
    area.addEventListener('input', () => {
      save.notes[i] = area.value;
      persist();
      drawWorkspace();
    });
    label.append(el('span', {}, 'Your notes'), area);
    return label;
  }

  // The structured part: sub-problems as an outline. Every edit is a button, so it works by tap.
  function outlineEditor(): HTMLElement {
    const box = el('div', { class: 'outline-editor' });
    const draw = () => {
      const list = el('ol', { class: 'outline' });
      save.outline.forEach((o, k) => list.append(outlineRow(o, k, draw)));
      const form = el('form', { class: 'outline-add' });
      const input = el('input', { type: 'text', maxlength: 200, 'aria-label': 'A smaller problem', placeholder: 'A smaller problem…', class: 'learner-input' });
      form.append(input, el('button', { type: 'submit' }, 'Add'));
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        save.outline = addItem(save.outline, input.value);
        persist();
        draw();
        drawWorkspace();
        box.querySelector<HTMLInputElement>('.outline-add input')?.focus();
      });
      box.replaceChildren(el('span', { class: 'note-label' }, 'Your breakdown: one smaller problem per line. Indent a line to make it part of the one above.'), list, form);
    };
    draw();
    return box;
  }

  function outlineRow(o: OutlineItem, k: number, redraw: () => void): HTMLElement {
    const li = el('li', { class: 'outline-row', style: `--depth: ${o.depth}` });
    const change = (next: OutlineItem[]) => {
      save.outline = next;
      persist();
      redraw();
      drawWorkspace();
    };
    const tools = el('div', { class: 'outline-tools' });
    tools.append(
      button('↑', () => change(move(save.outline, k, -1)), { 'aria-label': `Move “${o.text}” up` }),
      button('↓', () => change(move(save.outline, k, 1)), { 'aria-label': `Move “${o.text}” down` }),
      button('→', () => change(indent(save.outline, k)), { 'aria-label': `Indent “${o.text}”` }),
      button('←', () => change(outdent(save.outline, k)), { 'aria-label': `Outdent “${o.text}”` }),
      button('✕', () => change(removeItem(save.outline, k)), { 'aria-label': `Remove “${o.text}”` }),
    );
    li.append(el('span', { class: 'outline-text' }, o.text), tools);
    return li;
  }

  function orderCheck(check: OrderCheck, i: number, onRight: () => void): HTMLElement {
    const box = el('section', { class: 'card quiz practice-check order-check' });
    const order = shuffledOrder(check.parts, item.id);
    const picked: number[] = [];
    const chosen = el('ol', { class: 'order-picked', 'aria-live': 'polite' });
    const pool = el('div', { class: 'order-pool' });
    const feedback = el('p', { class: 'feedback', 'aria-live': 'polite' });
    const reward = el('div', { class: 'reward', 'aria-live': 'polite' });
    const checkBtn = button('Check the order', submit, { class: 'primary' });
    const undo = button('Undo', () => {
      picked.pop();
      draw();
    });
    const draw = () => {
      chosen.replaceChildren(...picked.map((p) => el('li', {}, check.parts[p]!)));
      pool.replaceChildren(...order.filter((p) => !picked.includes(p)).map((p) => button(check.parts[p]!, () => {
        picked.push(p);
        draw();
      }, { class: 'option' })));
      checkBtn.disabled = picked.length !== check.parts.length;
      undo.disabled = picked.length === 0;
    };
    function submit(): void {
      const right = orderIsRight(picked, check.parts.length);
      const result = tracked.answer(i, 0, right);
      if (!right) {
        feedback.textContent = 'Not this order yet. Ask of each step: what must already exist before I can do it?';
        reward.replaceChildren(el('span', {}, 'Not quite. Tap Undo and try again.'));
        return;
      }
      feedback.textContent = check.explain;
      reward.replaceChildren(...[result.text, ...result.badges.map((b) => `Badge earned: ${b.title}.`)].filter(Boolean).map((t) => el('span', {}, t)));
      if (result.xp > 0 || result.badges.length) tracked.celebrate(result);
      for (const b of box.querySelectorAll('button')) b.disabled = true;
      onRight();
    }
    const actions = el('div', { class: 'controls' });
    actions.append(undo, checkBtn);
    box.append(el('p', { class: 'quiz-count' }, 'Check your thinking'), el('h3', {}, 'Tap the steps in the order you would do them.'), chosen, pool, actions, feedback, reward);
    draw();
    return box;
  }

  function selectCheck(check: SelectCheck, i: number, onRight: () => void): HTMLElement {
    const box = el('section', { class: 'card quiz practice-check select-check' });
    const picked = new Set<number>();
    const feedback = el('div', { class: 'feedback', 'aria-live': 'polite' });
    const reward = el('div', { class: 'reward', 'aria-live': 'polite' });
    const toggles = check.cases.map((c, k) => {
      const b = button(c.text, () => {
        if (picked.has(k)) picked.delete(k);
        else picked.add(k);
        b.setAttribute('aria-pressed', String(picked.has(k)));
      }, { class: 'option toggle', 'aria-pressed': 'false' });
      return b;
    });
    const submit = button('Check', () => {
      const right = selectionIsRight(picked, check.cases);
      const result = tracked.answer(i, 0, right);
      if (!right) {
        const missed = check.cases.filter((c, k) => c.pick && !picked.has(k)).length;
        const extra = check.cases.filter((c, k) => !c.pick && picked.has(k)).length;
        feedback.replaceChildren(el('p', {}, `Not quite: ${missed ? `${missed} to add` : ''}${missed && extra ? ', ' : ''}${extra ? `${extra} that work fine` : ''}. Try each one by hand.`));
        reward.replaceChildren(el('span', {}, 'Change your picks and check again.'));
        return;
      }
      // Explain every case, picked or not (CLAUDE.md section 6).
      feedback.replaceChildren(el('ul', { class: 'case-why' }));
      for (const [k, c] of check.cases.entries()) {
        toggles[k]!.classList.add(c.pick ? 'right' : 'left');
        feedback.firstElementChild!.append(el('li', {}, `${c.text}: ${c.why}`));
      }
      reward.replaceChildren(...[result.text, ...result.badges.map((b) => `Badge earned: ${b.title}.`)].filter(Boolean).map((t) => el('span', {}, t)));
      if (result.xp > 0 || result.badges.length) tracked.celebrate(result);
      for (const b of box.querySelectorAll('button')) b.disabled = true;
      onRight();
    }, { class: 'primary' });
    box.append(el('p', { class: 'quiz-count' }, 'Check your thinking'), el('h3', {}, check.prompt), ...toggles, submit, feedback, reward);
    return box;
  }

  function drawWorkspace(): void {
    const parts: HTMLElement[] = [el('h3', {}, 'My workspace')];
    const row = (title: string, body: HTMLElement | string) => {
      const d = el('div', { class: 'ws-row' });
      d.append(el('strong', {}, title), typeof body === 'string' ? el('p', {}, body) : body);
      parts.push(d);
    };
    item.steps.forEach((s, k) => {
      if (s.stage === 'breakdown') {
        const list = el('ol', { class: 'outline readonly' });
        for (const o of save.outline) list.append(el('li', { style: `--depth: ${o.depth}` }, o.text));
        row(STAGE_TITLE[s.stage], save.outline.length ? list : '(nothing yet)');
      } else if (save.notes[k]?.trim()) row(STAGE_TITLE[s.stage], save.notes[k]!.trim());
    });
    if (parts.length === 1 || (parts.length === 2 && !save.outline.length)) parts.push(el('p', { class: 'muted' }, 'What you write in each step collects here, so the whole breakdown stays in view.'));
    parts.push(...(opts.workspaceExtras?.(item, save) ?? []));
    workspace.replaceChildren(...parts);
  }
}

import type { Critique, Lesson } from '../lesson/schema';
import { buildDiagram } from './diagram';
import { button, el, scrollTo } from './dom';
import type { QuizHooks } from './quiz';

// "Critique the design" (Phase 5c): a flawed architecture and a list of candidate risks. The
// learner taps the real ones, then chooses what to fix first. Scored like quiz questions.

export const CRITIQUE_SPOT = 310;
export const CRITIQUE_FIRST = 311;

export function critiquePart(lesson: Pick<Lesson, 'title'> & { critique: Critique }, hooks: QuizHooks) {
  const element = el('section', { class: 'card exercise critique', 'aria-label': 'Critique the design' });
  return { element, start: (done: () => void) => run(element, lesson.title, lesson.critique, hooks, done) };
}

function run(box: HTMLElement, title: string, cr: Critique, hooks: QuizHooks, done: () => void): void {
  const diagram = buildDiagram({ title: `${title}: design under review`, nodes: cr.nodes, edges: cr.edges });
  diagram.placePacket(null);
  const stage = el('div', { class: 'stage critique-diagram' });
  stage.append(diagram.element);
  const picked = new Set<number>();
  const real = new Set(cr.risks.flatMap((r, i) => (r.real ? [i] : [])));
  const feedback = el('p', { class: 'feedback', 'aria-live': 'polite' });
  const reward = el('div', { class: 'reward', 'aria-live': 'polite' });
  const after = el('div', { class: 'quiz-after' });
  const toggles = cr.risks.map((r, i) => {
    const b = button(r.text, () => {
      if (picked.has(i)) picked.delete(i);
      else picked.add(i);
      b.setAttribute('aria-pressed', String(picked.has(i)));
    }, { class: 'option risk', 'aria-pressed': 'false' });
    return b;
  });
  const check = button('Check', () => {
    const missed = [...real].filter((i) => !picked.has(i)).length;
    const extra = [...picked].filter((i) => !real.has(i)).length;
    const right = missed === 0 && extra === 0;
    const result = hooks.answer(CRITIQUE_SPOT, right ? 0 : 1, right);
    if (!right) {
      reward.replaceChildren();
      const parts = [missed ? `${missed} real risk${missed === 1 ? ' is' : 's are'} not picked` : '', extra ? `${extra} of your picks ${extra === 1 ? "isn't a real problem" : "aren't real problems"} here` : ''].filter(Boolean);
      feedback.textContent = `Not quite: ${parts.join(', and ')}. ${cr.hint}`;
      after.replaceChildren(el('p', {}, 'Change your picks and check again.'), button('Show me', () => reveal(false), { class: 'link' }));
      return;
    }
    showReward(reward, result, hooks);
    reveal(true);
  }, { class: 'primary' });

  // Every candidate explained: why each real risk matters, and why each decoy doesn't.
  function reveal(firstTime: boolean): void {
    for (const t of toggles) t.disabled = true;
    check.disabled = true;
    diagram.highlight([...new Set(cr.risks.filter((r) => r.real).flatMap((r) => r.nodes ?? []))]);
    toggles.forEach((t, i) => {
      const r = cr.risks[i]!;
      t.classList.add(r.real ? 'right' : 'wrong');
      t.textContent = `${r.real ? '✓ Real risk' : '✗ Not a problem here'}: ${r.text}`;
      t.after(el('p', { class: 'why' }, r.why));
    });
    feedback.textContent = firstTime ? `Right: ${real.size} real risk${real.size === 1 ? '' : 's'}.` : `There ${real.size === 1 ? 'is 1 real risk' : `are ${real.size} real risks`}, marked below.`;
    after.replaceChildren(button('Next: what to fix first', () => askFirst(), { class: 'primary' }));
  }

  function askFirst(): void {
    const q = cr.first;
    const fb = el('p', { class: 'feedback', 'aria-live': 'polite' });
    const rw = el('div', { class: 'reward', 'aria-live': 'polite' });
    const next = el('div', { class: 'quiz-after' });
    const options = q.options.map((o, i) => {
      const b = button(o.text, () => {
        const right = i === q.answer;
        b.classList.add(right ? 'right' : 'wrong');
        b.disabled = true;
        fb.textContent = o.explanation;
        const result = hooks.answer(CRITIQUE_FIRST, i, right);
        if (!right) {
          rw.replaceChildren();
          next.replaceChildren(el('p', {}, 'Try another option.'));
          return;
        }
        for (const other of options) other.disabled = true;
        showReward(rw, result, hooks);
        next.replaceChildren(
          el('p', {}, cr.explain),
          button('On to the quiz', () => {
            box.dataset.done = 'true';
            done();
          }, { class: 'primary' }),
        );
      }, { class: 'option' });
      return b;
    });
    box.replaceChildren(el('h3', {}, `Fix first: ${q.prompt}`), stage, ...options, fb, rw, next);
    scrollTo(box, 'start');
  }

  delete box.dataset.done;
  box.replaceChildren(el('h3', {}, 'Critique the design'), el('p', { class: 'change' }, cr.prompt), stage, el('p', {}, 'Tap every real risk. Some of these sound worrying but are fine here.'), ...toggles, check, feedback, reward, after);
  box.hidden = false;
  scrollTo(box, 'start');
}

function showReward(box: HTMLElement, result: ReturnType<QuizHooks['answer']>, hooks: QuizHooks): void {
  const lines = [result.text, ...(result.levelUp ? ['Level up!'] : []), ...result.badges.map((b) => `Badge earned: ${b.title}.`)].filter(Boolean);
  box.replaceChildren(...lines.map((line) => el('span', {}, line)));
  if (result.xp > 0 || result.badges.length) hooks.celebrate(result);
}

/** "A plausible design, not X's actual architecture" (or the published basis), shown under the goal. */
export function basisNote(lesson: Lesson): HTMLElement | null {
  if (!lesson.company || !lesson.basis) return null;
  const text = lesson.basis === 'plausible' ? `A plausible design, not ${lesson.company.name}'s actual architecture.` : `Based on ${lesson.company.name}'s own published write-up (see Sources).`;
  return el('p', { class: `basis ${lesson.basis}` }, text);
}

import { NAME_MAX, nameProblem, type Profiles } from '../progress/profiles';
import { button, el } from './dom';

// Learner profiles on screen: the "Learners" card in Settings, and the "Who's learning?" picker
// shown at launch when more than one learner shares the device. Switching reloads the app, so every
// screen starts cleanly from the new learner's save.

export function renderLearners(profiles: Profiles, onSwitch: (id: string) => void): HTMLElement {
  const card = el('section', { class: 'card panel learners', 'aria-label': 'Learners' });
  const status = el('p', { class: 'learner-status', 'aria-live': 'polite' });
  draw();
  return card;

  function draw(): void {
    const list = el('ul', { class: 'learner-list' });
    for (const p of profiles.all) list.append(row(p.id, p.name));
    card.replaceChildren(
      el('h3', {}, 'Learners'),
      el('p', {}, 'Each learner on this device has their own progress, streak and settings. Profiles are for sharing a device, not for privacy: anyone using this browser can open any of them.'),
      list,
      addForm(),
      status,
    );
  }

  function row(id: string, name: string): HTMLElement {
    const li = el('li', { class: 'learner-row' });
    const isCurrent = id === profiles.current.id;
    const label = el('span', { class: 'learner-name' }, name);
    if (isCurrent) label.append(el('small', {}, ' (you, now)'));
    const actions = el('div', { class: 'controls' });
    if (!isCurrent) actions.append(button('Switch', () => onSwitch(id), { 'aria-label': `Switch to ${name}` }));
    actions.append(button('Rename', () => li.replaceWith(renameForm(id, name)), { 'aria-label': `Rename ${name}` }));
    if (profiles.all.length > 1) actions.append(button('Remove', () => li.replaceWith(confirmRemove(id, name)), { 'aria-label': `Remove ${name}` }));
    li.append(label, actions);
    return li;
  }

  function nameInput(value: string, label: string): HTMLInputElement {
    return el('input', { type: 'text', value, maxlength: NAME_MAX, 'aria-label': label, autocomplete: 'off', class: 'learner-input' });
  }

  function addForm(): HTMLElement {
    const form = el('form', { class: 'learner-add' });
    const input = nameInput('', 'New learner’s name');
    input.placeholder = 'New learner’s name';
    form.append(input, el('button', { type: 'submit' }, 'Add learner'));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const problem = nameProblem(input.value, profiles.snapshot());
      if (problem) {
        status.textContent = problem;
        input.focus();
        return;
      }
      const added = profiles.add(input.value);
      draw();
      status.textContent = `Added ${added.name}. Tap Switch to start learning as them.`;
    });
    return form;
  }

  function renameForm(id: string, name: string): HTMLElement {
    const form = el('form', { class: 'learner-row' });
    const input = nameInput(name, `New name for ${name}`);
    const actions = el('div', { class: 'controls' });
    actions.append(button('Cancel', draw), el('button', { type: 'submit', class: 'primary' }, 'Save'));
    form.append(input, actions);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const problem = nameProblem(input.value, profiles.snapshot(), id);
      if (problem) {
        status.textContent = problem;
        input.focus();
        return;
      }
      profiles.rename(id, input.value);
      draw();
      status.textContent = 'Name saved.';
    });
    queueMicrotask(() => input.focus());
    return form;
  }

  function confirmRemove(id: string, name: string): HTMLElement {
    const box = el('li', { class: 'learner-row confirm', role: 'group', 'aria-label': `Remove ${name}?` });
    // Keeping the learner is the safe choice, so it gets the prominent button.
    const keep = button('Keep', draw, { class: 'primary' });
    const remove = button(`Remove ${name}`, () => {
      const wasCurrent = id === profiles.current.id;
      profiles.remove(id);
      if (wasCurrent) onSwitch(profiles.current.id);
      else {
        draw();
        status.textContent = `Removed ${name}.`;
      }
    });
    const actions = el('div', { class: 'controls' });
    actions.append(remove, keep);
    box.append(el('p', {}, `Remove ${name}? Their progress on this device is deleted for good. To keep it, switch to them and export a backup first.`), actions);
    queueMicrotask(() => keep.focus());
    return box;
  }
}

export function renderPicker(root: HTMLElement, profiles: Profiles, onPick: (id: string) => void): void {
  const list = el('div', { class: 'picker-list', role: 'group', 'aria-label': 'Learners' });
  for (const p of profiles.all) {
    list.append(button(p.name, () => onPick(p.id), { class: p.id === profiles.current.id ? 'primary' : '' }));
  }
  const card = el('section', { class: 'card panel picker' });
  card.append(el('h2', {}, 'Who’s learning?'), list, el('p', { class: 'muted' }, 'Add or rename learners in Settings.'));
  root.replaceChildren(card);
}

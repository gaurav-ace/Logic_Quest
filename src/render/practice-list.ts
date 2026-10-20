import type { PracticeItem } from '../practice/schema';
import type { PracticeStatus } from '../practice/status';
import { el } from './dom';
import { KIND_LABEL } from './practice';

// The "Practice" drop-down under each track on the Learn page: medium and hard items, filtered by
// level and kind. The track's items load only when the drop-down is first opened.

export interface PracticeData {
  items: PracticeItem[];
  status: Map<string, PracticeStatus>;
}

export function practiceSection(load: () => Promise<PracticeData>, open: (item: PracticeItem) => void, startOpen = false): HTMLDetailsElement {
  const details = el('details', { class: 'practice' });
  const summary = el('summary');
  summary.append(el('span', { class: 'practice-title' }, 'Practice'), el('span', { class: 'track-count' }, 'Medium and hard problems'));
  const body = el('div', { class: 'practice-panel' });
  details.append(summary, body);
  let loaded = false;
  details.addEventListener('toggle', () => {
    if (!details.open || loaded) return;
    loaded = true;
    body.replaceChildren(el('p', { class: 'muted' }, 'Loading…'));
    load().then(
      (data) => fill(body, data, open),
      (e: unknown) => {
        loaded = false;
        body.replaceChildren(el('p', { class: 'bad' }, `Practice couldn't load: ${e instanceof Error ? e.message : String(e)}`));
      },
    );
  });
  // Set after the listener, so the toggle event that follows loads the list.
  details.open = startOpen;
  return details;
}

function select(label: string, options: [string, string][]): HTMLSelectElement {
  const s = el('select', { class: 'practice-filter', 'aria-label': label });
  for (const [value, text] of options) s.append(el('option', { value }, text));
  return s;
}

function fill(body: HTMLElement, { items, status }: PracticeData, open: (item: PracticeItem) => void): void {
  const level = select('Level', [['all', 'All levels'], ['medium', 'Medium'], ['hard', 'Hard']]);
  const kind = select('Type', [['all', 'All types'], ...(Object.entries(KIND_LABEL) as [string, string][])]);
  const filters = el('div', { class: 'practice-filters' });
  filters.append(level, kind);
  const list = el('ul', { class: 'lesson-list practice-list' });
  const count = el('p', { class: 'muted practice-count', 'aria-live': 'polite' });
  const done = items.filter((i) => status.get(i.id)!.done).length;
  const draw = () => {
    const shown = items.filter((i) => (level.value === 'all' || i.level === level.value) && (kind.value === 'all' || i.kind === kind.value));
    list.replaceChildren(...shown.map((i) => card(i, status.get(i.id)!, open)));
    count.textContent = `${done} of ${items.length} done${shown.length < items.length ? ` · showing ${shown.length}` : ''}`;
  };
  level.addEventListener('change', draw);
  kind.addEventListener('change', draw);
  draw();
  body.replaceChildren(el('p', {}, 'Think it through in small steps: no code editor, just you and the logic.'), filters, count, list);
}

function card(item: PracticeItem, s: PracticeStatus, open: (item: PracticeItem) => void): HTMLElement {
  const b = el('button', { type: 'button', class: `lesson-card practice-card${s.done ? ' done' : ''}${s.locked ? ' locked' : ''}`, 'data-id': item.id, 'data-level': item.level });
  const state = s.done ? '✓ Done · ' : s.locked ? '🔒 ' : s.solved ? `${s.solved} of ${s.total} checks · ` : '';
  const note = el('span', { class: 'lesson-lock', 'aria-live': 'polite' });
  b.append(
    el('span', { class: 'lesson-title' }, item.title),
    el('span', { class: 'lesson-goal' }, item.objective),
    el('span', { class: 'lesson-meta' }, `${state}${item.level === 'hard' ? 'Hard' : 'Medium'} · ${KIND_LABEL[item.kind]}`),
    note,
  );
  b.addEventListener('click', () => {
    // Hard items open after the medium ones (CLAUDE.md section 6); a locked card says so.
    if (s.locked) note.textContent = 'Finish the medium problems in this track first.';
    else open(item);
  });
  const li = el('li');
  li.append(b);
  return li;
}

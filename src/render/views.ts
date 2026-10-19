import { show } from '../trace/tools';
import type { Value, View } from '../trace/types';
import { el } from './dom';

// Data views for trace frames. Each returns plain HTML, sized to fit a 360 px screen;
// wide content scrolls inside its own box rather than the page (CLAUDE.md section 8).

export function renderView(view: View): HTMLElement {
  switch (view.type) {
    case 'array':
      return arrayView(view);
    case 'table':
      return tableView(view);
  }
}

function arrayView(v: Extract<View, { type: 'array' }>): HTMLElement {
  const box = el('figure', { class: 'view view-array' });
  if (v.label) box.append(el('figcaption', {}, v.label));
  const cells = el('div', { class: 'cells', style: `--n: ${Math.max(v.values.length, 1)}` });
  const described: string[] = [];
  v.values.forEach((value, i) => {
    const names = (v.pointers ?? []).filter((p) => p.index === i).map((p) => p.name);
    const inRange = !v.range || (i >= v.range[0] && i <= v.range[1]);
    const cls = ['cell', v.highlight?.includes(i) ? 'hl' : '', v.done?.includes(i) ? 'done' : '', inRange ? '' : 'out'].filter(Boolean).join(' ');
    const cell = el('div', { class: cls });
    cell.append(el('span', { class: 'ptr' }, names.join(' ')), el('span', { class: 'val' }, show(value)), el('span', { class: 'idx' }, String(i)));
    cells.append(cell);
    if (names.length) described.push(`${names.join(' and ')} at index ${i} (${show(value)})`);
  });
  if (!v.values.length) cells.append(el('div', { class: 'cell empty' }, 'empty'));
  // The visual is decorative for screen readers; this sentence carries the same facts.
  cells.setAttribute('aria-hidden', 'true');
  const scroller = el('div', { class: 'scroll-x' });
  scroller.append(cells);
  box.append(scroller, el('p', { class: 'sr-only' }, `${v.label ?? 'Array'}: ${show(v.values)}. ${described.join('; ')}`));
  return box;
}

function tableView(v: Extract<View, { type: 'table' }>): HTMLElement {
  const box = el('figure', { class: 'view view-table' });
  if (v.label) box.append(el('figcaption', {}, v.label));
  const table = el('table');
  const head = el('tr');
  for (const c of v.columns) head.append(el('th', { scope: 'col' }, c));
  table.append(el('thead'), el('tbody'));
  table.tHead!.append(head);
  v.rows.forEach((row, i) => {
    const tr = el('tr', i === v.highlightRow ? { class: 'hl' } : {});
    for (const cell of row) tr.append(el('td', {}, show(cell)));
    table.tBodies[0]!.append(tr);
  });
  const scroller = el('div', { class: 'scroll-x' });
  scroller.append(table);
  box.append(scroller);
  return box;
}

export function varsTable(vars: [string, Value][]): HTMLElement {
  const dl = el('dl', { class: 'vars' });
  for (const [name, value] of vars) {
    const row = el('div');
    row.append(el('dt', {}, name), el('dd', {}, show(value)));
    dl.append(row);
  }
  return dl;
}

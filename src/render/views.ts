import { layoutTree } from '../trace/layout';
import { show } from '../trace/tools';
import type { Value, View } from '../trace/types';
import { el, svg } from './dom';
import { buildUml } from './uml';

// Data views for trace frames. Each returns plain HTML, sized to fit a 360 px screen;
// wide content scrolls inside its own box rather than the page (CLAUDE.md section 8).

export function renderView(view: View): HTMLElement {
  switch (view.type) {
    case 'array':
      return arrayView(view);
    case 'table':
      return tableView(view);
    case 'stack':
      return stackView(view);
    case 'queue':
      return queueView(view);
    case 'list':
      return listView(view);
    case 'buckets':
      return bucketsView(view);
    case 'tree':
      return treeView(view);
    case 'graph':
      return graphView(view);
    case 'uml': {
      const u = buildUml(view.diagram);
      u.mark(Object.fromEntries((view.highlight ?? []).map((id) => [id, 'on'])));
      u.showCalls(view.call ?? Infinity, 1);
      if (view.label) u.element.prepend(el('figcaption', {}, view.label));
      return u.element;
    }
  }
}

/** Wraps a visual with its caption, a horizontal scroller, and a screen-reader sentence. */
function figure(kind: string, label: string | undefined, visual: Element, spoken: string): HTMLElement {
  const box = el('figure', { class: `view view-${kind}` });
  if (label) box.append(el('figcaption', {}, label));
  visual.setAttribute('aria-hidden', 'true');
  const scroller = el('div', { class: 'scroll-x' });
  scroller.append(visual);
  box.append(scroller, el('p', { class: 'sr-only' }, spoken));
  return box;
}

function stackView(v: Extract<View, { type: 'stack' }>): HTMLElement {
  const col = el('div', { class: 'stack' });
  // Top of the stack drawn at the top.
  [...v.items].reverse().forEach((item, i) => {
    const top = i === 0;
    const cell = el('div', { class: `slot${top && v.highlightTop ? ' hl' : ''}` });
    cell.append(el('span', { class: 'val' }, show(item)), el('span', { class: 'tag' }, top ? 'top' : ''));
    col.append(cell);
  });
  if (!v.items.length) col.append(el('div', { class: 'slot empty' }, 'empty'));
  return figure('stack', v.label, col, `${v.label ?? 'Stack'}, bottom to top: ${v.items.length ? v.items.map(show).join(', ') : 'empty'}.`);
}

function queueView(v: Extract<View, { type: 'queue' }>): HTMLElement {
  const row = el('div', { class: 'queue' });
  v.items.forEach((item, i) => {
    const front = i === 0;
    const back = i === v.items.length - 1;
    const cell = el('div', { class: `slot${(front && v.highlightFront) || (back && v.highlightBack) ? ' hl' : ''}` });
    cell.append(el('span', { class: 'tag' }, [front ? 'front' : '', back ? 'back' : ''].filter(Boolean).join('/')), el('span', { class: 'val' }, show(item)));
    row.append(cell);
  });
  if (!v.items.length) row.append(el('div', { class: 'slot empty' }, 'empty'));
  return figure('queue', v.label, row, `${v.label ?? 'Queue'}, front to back: ${v.items.length ? v.items.map(show).join(', ') : 'empty'}.`);
}

function bucketsView(v: Extract<View, { type: 'buckets' }>): HTMLElement {
  const list = el('ol', { class: 'buckets', start: 0 });
  v.buckets.forEach((items, i) => {
    const li = el('li', i === v.highlight ? { class: 'hl' } : {});
    li.append(el('span', { class: 'bucket-no' }, String(i)));
    if (!items.length) li.append(el('span', { class: 'chain empty' }, '—'));
    for (const item of items) li.append(el('span', { class: 'chain' }, show(item)));
    list.append(li);
  });
  const spoken = v.buckets.map((b, i) => `bucket ${i}: ${b.length ? b.map(show).join(', ') : 'empty'}`).join('; ');
  return figure('buckets', v.label, list, `${v.label ?? 'Hash table'}: ${spoken}.`);
}

// SVG views are drawn at real pixel size (not scaled down), so text stays at least 14 px on a
// phone; anything wider than the screen scrolls inside its box.
const R = 17;

function listView(v: Extract<View, { type: 'list' }>): HTMLElement {
  const W = 46;
  const GAP = 22;
  const top = 34;
  const width = Math.max(v.nodes.length * (W + GAP) + 20, 120);
  const height = 112;
  const root = svg('svg', { width, height, viewBox: `0 0 ${width} ${height}`, class: 'svg-view' });
  root.append(arrowMarker('list-arrow'));
  const xOf = (i: number) => 10 + i * (W + GAP);
  v.nodes.forEach((n, i) => {
    if (n.next === null) return;
    const x1 = xOf(i) + W;
    const x2 = xOf(n.next);
    // Arrows to the next box go straight; arrows anywhere else (backwards, loops) curve below.
    const d = n.next === i + 1 ? `M ${x1} ${top + 18} L ${x2 - 2} ${top + 18}` : `M ${xOf(i) + W / 2} ${top + 36} C ${xOf(i) + W / 2} ${top + 70}, ${x2 + W / 2} ${top + 70}, ${x2 + W / 2} ${top + 40}`;
    root.append(svg('path', { d, class: 'link', 'marker-end': 'url(#list-arrow)' }));
  });
  v.nodes.forEach((n, i) => {
    const g = svg('g', { class: `lnode${v.highlight?.includes(i) ? ' hl' : ''}` });
    g.append(svg('rect', { x: xOf(i), y: top, width: W, height: 36, rx: 8 }));
    const t = svg('text', { x: xOf(i) + W / 2, y: top + 18 });
    t.textContent = show(n.value);
    g.append(t);
    const names = [...(v.head === i ? ['head'] : []), ...(v.pointers ?? []).filter((p) => p.index === i).map((p) => p.name)];
    if (names.length) {
      const label = svg('text', { x: xOf(i) + W / 2, y: top - 12, class: 'ptr' });
      label.textContent = names.join(' ');
      g.append(label);
    }
    root.append(g);
  });
  const order: string[] = [];
  for (let i = v.head, guard = 0; i !== null && guard <= v.nodes.length; i = v.nodes[i]!.next, guard++) order.push(show(v.nodes[i]!.value));
  const loops = order.length > v.nodes.length;
  return figure('list', v.label, root, `${v.label ?? 'Linked list'}: ${order.length ? order.slice(0, v.nodes.length).join(' → ') : 'empty'}${loops ? ', then it loops back' : ''}.`);
}

function treeView(v: Extract<View, { type: 'tree' }>): HTMLElement {
  const placed = layoutTree(v.nodes, v.root, v.shape);
  const COL = v.shape === 'binary' ? 40 : 46;
  const ROW = 58;
  const maxX = Math.max(0, ...placed.map((p) => p.x));
  const maxY = Math.max(0, ...placed.map((p) => p.y));
  const width = Math.max((maxX + 1) * COL + 20, 120);
  const height = (maxY + 1) * ROW + 24;
  const root = svg('svg', { width, height, viewBox: `0 0 ${width} ${height}`, class: 'svg-view' });
  const at = new Map(placed.map((p) => [p.id, { x: 10 + COL / 2 + p.x * COL, y: 24 + p.y * ROW }]));
  for (const n of v.nodes) {
    const from = at.get(n.id);
    if (!from) continue;
    for (const c of n.children) {
      const to = c === null ? undefined : at.get(c);
      if (to) root.append(svg('line', { x1: from.x, y1: from.y, x2: to.x, y2: to.y, class: 'link' }));
    }
  }
  for (const n of v.nodes) {
    const p = at.get(n.id);
    if (!p) continue;
    const cls = ['tnode', v.highlight?.includes(n.id) ? 'hl' : '', v.done?.includes(n.id) ? 'done' : ''].filter(Boolean).join(' ');
    const g = svg('g', { class: cls });
    g.append(svg('circle', { cx: p.x, cy: p.y, r: R }));
    const t = svg('text', { x: p.x, y: p.y });
    t.textContent = show(n.value);
    g.append(t);
    const note = v.notes?.[n.id];
    if (note) {
      const nt = svg('text', { x: p.x, y: p.y + R + 12, class: 'note' });
      nt.textContent = note;
      g.append(nt);
    }
    root.append(g);
  }
  const byId = new Map(v.nodes.map((n) => [n.id, n]));
  const describe = (id: string | null, depth = 0): string => {
    const n = id === null ? undefined : byId.get(id);
    if (!n || depth > 12) return '';
    const kids = n.children.filter((c): c is string => c !== null && byId.has(c)).map((c) => describe(c, depth + 1));
    return `${show(n.value)}${kids.length ? ` (${kids.join(', ')})` : ''}`;
  };
  return figure('tree', v.label, root, `${v.label ?? 'Tree'}: ${v.root === null ? 'empty' : describe(v.root)}.`);
}

function graphView(v: Extract<View, { type: 'graph' }>): HTMLElement {
  const width = 304;
  const height = 230;
  const root = svg('svg', { width, height, viewBox: `0 0 ${width} ${height}`, class: 'svg-view' });
  if (v.directed) root.append(arrowMarker('graph-arrow'));
  const at = new Map(v.nodes.map((n) => [n.id, { x: n.x + 10, y: n.y + 15 }]));
  const active = new Set((v.activeEdges ?? []).flatMap(([a, b]) => [`${a}|${b}`, ...(v.directed ? [] : [`${b}|${a}`])]));
  for (const e of v.edges) {
    const a = at.get(e.from);
    const b = at.get(e.to);
    if (!a || !b) continue;
    // Stop the line at the circle's edge so a direction arrow stays visible.
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const line = svg('line', {
      x1: a.x + ux * R,
      y1: a.y + uy * R,
      x2: b.x - ux * (R + (v.directed ? 4 : 0)),
      y2: b.y - uy * (R + (v.directed ? 4 : 0)),
      class: `link${active.has(`${e.from}|${e.to}`) ? ' on' : ''}`,
      ...(v.directed ? { 'marker-end': 'url(#graph-arrow)' } : {}),
    });
    root.append(line);
    if (e.weight !== undefined) {
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      root.append(svg('rect', { x: mx - 11, y: my - 10, width: 22, height: 20, rx: 5, class: 'weight-bg' }));
      const w = svg('text', { x: mx, y: my, class: 'weight' });
      w.textContent = String(e.weight);
      root.append(w);
    }
  }
  for (const n of v.nodes) {
    const p = at.get(n.id)!;
    const cls = ['gnode', v.highlight?.includes(n.id) ? 'hl' : '', v.done?.includes(n.id) ? 'done' : ''].filter(Boolean).join(' ');
    const g = svg('g', { class: cls });
    g.append(svg('circle', { cx: p.x, cy: p.y, r: R }));
    const t = svg('text', { x: p.x, y: p.y });
    t.textContent = n.label;
    g.append(t);
    const note = v.notes?.[n.id];
    if (note) {
      const nt = svg('text', { x: p.x, y: p.y + R + 12, class: 'note' });
      nt.textContent = note;
      g.append(nt);
    }
    root.append(g);
  }
  const edgesSpoken = v.edges.map((e) => `${e.from}${v.directed ? '→' : '–'}${e.to}${e.weight === undefined ? '' : ` (${e.weight})`}`).join(', ');
  const notes = Object.entries(v.notes ?? {}).map(([id, note]) => `${id}: ${note}`).join('; ');
  return figure('graph', v.label, root, `${v.label ?? 'Graph'} with edges ${edgesSpoken}.${v.highlight?.length ? ` In focus: ${v.highlight.join(', ')}.` : ''}${notes ? ` ${notes}.` : ''}`);
}

function arrowMarker(id: string): SVGElement {
  const defs = svg('defs');
  const marker = svg('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
  marker.append(svg('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'arrow-head' }));
  defs.append(marker);
  return defs;
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
    row.forEach((cell, c) => {
      const on = v.highlightCell !== undefined && v.highlightCell[0] === i && v.highlightCell[1] === c;
      tr.append(el('td', on ? { class: 'hl-cell' } : {}, show(cell)));
    });
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

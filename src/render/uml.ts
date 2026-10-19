import { layoutClasses, layoutSequence, type ClassDiagram, type RelationType, type SequenceDiagram, type UmlDiagram } from '../engine/uml';
import { el, svg } from './dom';

// Draws class and sequence diagrams from the pure layouts in src/engine/uml.ts. Drawn at real
// pixel size (like the trace views), so text stays readable on a phone.

export interface UmlView {
  element: HTMLElement;
  /** Class diagrams: mark classes. `marks` maps a class id to a CSS class (on, picked, edit). */
  mark(marks: Record<string, string>): void;
  /** Sequence diagrams: show calls up to `index`, the last one drawn `progress` (0 to 1) of the way. */
  showCalls(index: number, progress: number): void;
}

const RELATION_WORDS: Record<RelationType, string> = { inherits: 'inherits from', implements: 'implements', has: 'has a', uses: 'uses' };
const LEGEND: Record<RelationType, string> = { inherits: '▷ inherits', implements: '▷ dashed: implements', has: '◆ has (owns)', uses: '⇢ uses' };

let uid = 0;

export function buildUml(d: UmlDiagram): UmlView {
  return d.type === 'class' ? classView(d) : sequenceView(d);
}

function markers(root: SVGElement, prefix: string): void {
  const defs = svg('defs');
  const marker = (id: string, path: string, cls: string, refX: number) => {
    const m = svg('marker', { id: `${prefix}-${id}`, viewBox: '0 0 12 12', refX, refY: 6, markerWidth: 12, markerHeight: 12, markerUnits: 'userSpaceOnUse', orient: 'auto' });
    m.append(svg('path', { d: path, class: cls }));
    defs.append(m);
  };
  marker('tri', 'M1,1 L11,6 L1,11 z', 'mk-hollow', 11);
  marker('diamond', 'M0,6 L6,1 L12,6 L6,11 z', 'mk-solid', 0);
  marker('open', 'M1,1 L11,6 L1,11', 'mk-line', 11);
  marker('solid', 'M1,1 L11,6 L1,11 z', 'mk-solid', 11);
  root.append(defs);
}

function classView(d: ClassDiagram): UmlView {
  const layout = layoutClasses(d);
  const root = svg('svg', { width: layout.width, height: layout.height, viewBox: `0 0 ${layout.width} ${layout.height}`, class: 'svg-view uml' });
  const prefix = `uml${++uid}`;
  markers(root, prefix);
  for (const r of layout.relations) {
    const t = r.rel.type;
    const attrs: Record<string, string | number> = { x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2, class: `rel rel-${t}` };
    if (t === 'inherits' || t === 'implements') attrs['marker-end'] = `url(#${prefix}-tri)`;
    if (t === 'has') attrs['marker-start'] = `url(#${prefix}-diamond)`;
    if (t === 'uses') attrs['marker-end'] = `url(#${prefix}-open)`;
    root.append(svg('line', attrs));
  }
  const groups = new Map<string, SVGElement>();
  for (const c of layout.classes) {
    const g = svg('g', { class: 'uclass' });
    g.append(svg('rect', { x: c.x, y: c.y, width: c.w, height: c.h, rx: 6 }));
    let y = c.y;
    if (c.box.kind) {
      const k = svg('text', { x: c.x + c.w / 2, y: y + 13, class: 'stereo' });
      k.textContent = `«${c.box.kind}»`;
      g.append(k);
      y += 18;
    }
    const name = svg('text', { x: c.x + c.w / 2, y: y + 15, class: c.box.kind ? 'uname abstract' : 'uname' });
    name.textContent = c.box.name;
    g.append(name);
    const members = [...(c.box.fields ?? []), ...(c.box.methods ?? [])];
    if (members.length) g.append(svg('line', { x1: c.x, y1: c.divider, x2: c.x + c.w, y2: c.divider, class: 'divider' }));
    members.forEach((m, i) => {
      const t = svg('text', { x: c.x + 8, y: c.divider + 14 + i * 20, class: 'member' });
      t.textContent = m;
      g.append(t);
    });
    groups.set(c.box.id, g);
    root.append(g);
  }

  const names = new Map(d.classes.map((c) => [c.id, c.name]));
  const describe = (c: ClassDiagram['classes'][number]) => {
    const members = [...(c.fields ?? []), ...(c.methods ?? [])];
    return `${c.kind ? `${c.kind} ` : ''}${c.name}${members.length ? ` (${members.join(', ')})` : ''}`;
  };
  const rels = d.relations.map((r) => `${names.get(r.from)} ${RELATION_WORDS[r.type]} ${names.get(r.to)}`);
  const spoken = `Class diagram: ${d.classes.map(describe).join('; ')}.${rels.length ? ` ${rels.join('; ')}.` : ''}`;
  const used = [...new Set(d.relations.map((r) => r.type))];
  const element = figure(root, spoken, used.length ? used.map((t) => LEGEND[t]).join('   ') : '');
  return {
    element,
    mark(marks) {
      for (const [id, g] of groups) g.setAttribute('class', `uclass ${marks[id] ?? ''}`.trim());
    },
    showCalls() {},
  };
}

function sequenceView(d: SequenceDiagram): UmlView {
  const layout = layoutSequence(d);
  const root = svg('svg', { width: layout.width, height: layout.height, viewBox: `0 0 ${layout.width} ${layout.height}`, class: 'svg-view uml' });
  const prefix = `uml${++uid}`;
  markers(root, prefix);
  for (const a of layout.actors) {
    root.append(svg('line', { x1: a.x, y1: layout.lifelineTop, x2: a.x, y2: layout.height - 4, class: 'lifeline' }));
    const g = svg('g', { class: 'uclass' });
    g.append(svg('rect', { x: a.boxX, y: 2, width: a.boxW, height: 32, rx: 6 }));
    const t = svg('text', { x: a.x, y: 18, class: 'uname' });
    t.textContent = a.name;
    g.append(t);
    root.append(g);
  }
  const rows = layout.calls.map((c, i) => {
    const g = svg('g', { class: 'call' });
    // Stop just short of the lifeline so the arrowhead touches it.
    const dir = Math.sign(c.x2 - c.x1);
    const line = svg('line', { x1: c.x1, y1: c.y, x2: c.x2 - dir * 2, y2: c.y, class: c.call.reply ? 'msg reply' : 'msg', 'marker-end': `url(#${prefix}-${c.call.reply ? 'open' : 'solid'})` });
    const label = svg('text', { x: c.labelX, y: c.y - 11, class: 'member call-label' });
    label.textContent = `${i + 1}. ${c.call.label}`;
    g.append(line, label);
    root.append(g);
    return { g, line, from: c.x1, to: c.x2 - dir * 2 };
  });
  const spoken = `Sequence diagram between ${d.actors.join(', ')}: ${d.calls.map((c, i) => `${i + 1}. ${c.from} ${c.reply ? 'returns to' : 'calls'} ${c.to}: ${c.label}`).join('; ')}.`;
  const element = figure(root, spoken, '→ call   ⇢ dashed: reply');
  return {
    element,
    mark() {},
    showCalls(index, progress) {
      rows.forEach((r, i) => {
        r.g.setAttribute('visibility', i <= index ? 'visible' : 'hidden');
        r.g.setAttribute('class', i === index ? 'call on' : 'call');
        const p = i === index ? progress : 1;
        r.line.setAttribute('x2', String(r.from + (r.to - r.from) * p));
      });
    },
  };
}

function figure(visual: SVGElement, spoken: string, legend: string): HTMLElement {
  const box = el('figure', { class: 'view view-uml' });
  visual.setAttribute('aria-hidden', 'true');
  box.append(visual);
  if (legend) box.append(el('p', { class: 'legend', 'aria-hidden': 'true' }, legend));
  box.append(el('p', { class: 'sr-only' }, spoken));
  return box;
}

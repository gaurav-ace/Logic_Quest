import {
  GRID, KINDS, KIND_NAMES, LIMITS, WORLD, addShape, arrowEnds, commit, connect, connectProblem, history, moveShape, nudge, redo, relabel, relabelArrow, remove,
  parseBoard, rename, resizeNote, reverseArrow, shapeAt, undo, type Board, type History, type Kind, type Shape,
} from '../playground/board';
import type { Prompt } from '../playground/prompts';
import { BOARDS_MAX, type BoardStore } from '../playground/store';
import { FONT, LINE, boardSvg, wrapLabel } from '../playground/svg';
import { button, download, el, svg } from './dom';

// The HLD playground (plan section 3.7). Everything works by tap: tap a palette item, then tap
// the board to place it; Connect, then tap two boxes; drag to move, or select and nudge; pinch or
// the +/− buttons to zoom. Keyboard: arrows nudge, Delete removes, Ctrl+Z / Ctrl+Y undo and redo.
// Nothing is graded: a design can't be scored honestly by rules, and the page says so.

export const ZOOM = { min: 0.3, max: 2, start: 1 };
const EMPTY_HINT = 'Start by tapping a box type above (say, Web client), then tap the board to place it.';
/** Finger movement (CSS px) below which a press counts as a tap, not a drag. */
const TAP_SLOP = 8;

type Mode = { name: 'select' } | { name: 'place'; kind: Kind } | { name: 'connect'; from: string | null };

export interface PlaygroundDeps {
  prompts: Prompt[];
  /** A lesson's title and link, for "Compare with". */
  lesson(id: string): { title: string; href: string } | null;
}

export function renderPlayground(root: HTMLElement, store: BoardStore, deps: PlaygroundDeps): void {
  let saved = store.current();
  let h: History = history(saved.board);
  let mode: Mode = { name: 'select' };
  let selected: string | null = null;
  let zoom = ZOOM.start;
  let view = { x: 0, y: 0 };
  /** A shape being dragged: shown moved, committed to history only when the finger lifts. */
  let draft: Board | null = null;

  const intro = el('p', { class: 'objective' }, 'Sketch a system design: boxes, arrows and notes. Nothing here is graded; check your design against the case-study lessons.');
  // Switching, naming, adding and deleting designs fold away, so the board sits higher on a phone.
  const designs = el('details', { class: 'card pg-designs' });
  const boardBar = el('div', { class: 'pg-bar' });
  const palette = el('div', { class: 'pg-palette', role: 'group', 'aria-label': 'Add a box' });
  for (const kind of KINDS) palette.append(button(KIND_NAMES[kind], () => setMode(mode.name === 'place' && mode.kind === kind ? { name: 'select' } : { name: 'place', kind }), { 'data-kind': kind }));
  const tools = el('div', { class: 'pg-tools' });
  const undoBtn = button('Undo', () => change(undo(h)));
  const redoBtn = button('Redo', () => change(redo(h)));
  const connectBtn = button('Connect', () => setMode(mode.name === 'connect' ? { name: 'select' } : { name: 'connect', from: null }));
  const zoomOut = button('−', () => zoomBy(1 / 1.25), { 'aria-label': 'Zoom out' });
  const zoomIn = button('+', () => zoomBy(1.25), { 'aria-label': 'Zoom in' });
  const fit = button('Fit', fitAll, { 'aria-label': 'Show the whole design' });
  tools.append(undoBtn, redoBtn, connectBtn, zoomOut, zoomIn, fit);
  const status = el('p', { class: 'pg-status', 'aria-live': 'polite' });
  const canvas = el('div', { class: 'pg-canvas', tabindex: 0, 'aria-label': 'Design board. Arrow keys move the selected box, Delete removes it.' });
  const surface = svg('svg', { class: 'pg-svg', role: 'img', 'aria-label': 'Design board' });
  const defs = svg('defs');
  const marker = svg('marker', { id: 'pg-head', viewBox: '0 0 10 10', refX: 10, refY: 5, markerWidth: 12, markerHeight: 12, markerUnits: 'userSpaceOnUse', orient: 'auto-start-reverse' });
  marker.append(svg('path', { d: 'M0 0L10 5L0 10z', class: 'pg-head' }));
  defs.append(marker);
  const layer = svg('g');
  surface.append(defs, layer);
  canvas.append(surface);
  const panel = el('section', { class: 'card pg-panel', 'aria-label': 'Selected item' });
  const asText = el('details', { class: 'card pg-text' });
  const practice = el('details', { class: 'card pg-practice' });
  const files = el('details', { class: 'card pg-files' });

  root.replaceChildren(el('h2', {}, 'Design playground'), intro, designs, practice, palette, tools, status, canvas, panel, asText, files);

  const board = () => draft ?? h.present;

  function change(next: History, keep?: string | null): void {
    h = next;
    if (keep !== undefined) selected = keep;
    if (selected && !h.present.shapes.some((s) => s.id === selected) && !h.present.arrows.some((a) => a.id === selected)) selected = null;
    if (!store.save(saved.id, h.present)) say("This design can't be saved on this device right now (storage is full or blocked).");
    draw();
  }

  const edit = (next: Board, keep?: string | null) => change(commit(h, next), keep);

  function say(text: string): void {
    status.textContent = text;
  }

  function setMode(m: Mode): void {
    mode = m;
    if (m.name === 'place') say(`Tap the board to place: ${KIND_NAMES[m.kind]}. Tap it in the list again to cancel.`);
    else if (m.name === 'connect') say(m.from ? 'Now tap the box the arrow goes to.' : 'Connect: tap the box the arrow starts from.');
    else say(h.present.shapes.length ? '' : EMPTY_HINT);
    draw();
  }

  // ----- Board picker, name, new and delete -----
  function drawBoardBar(): void {
    const list = store.list();
    const pick = el('select', { 'aria-label': 'Choose a design' });
    for (const b of list) {
      const o = el('option', { value: b.id }, b.board.name);
      if (b.id === saved.id) o.selected = true;
      pick.append(o);
    }
    pick.addEventListener('change', () => {
      store.select(pick.value);
      open(store.current());
    });
    const name = el('input', { type: 'text', class: 'learner-input', maxlength: LIMITS.name, 'aria-label': 'Design name', value: h.present.name });
    name.addEventListener('change', () => {
      edit(rename(h.present, name.value));
      drawBoardBar();
    });
    const make = button('New design', () => {
      if (list.length >= BOARDS_MAX) return say(`You have ${BOARDS_MAX} designs, the most this device keeps. Delete one first.`);
      open(store.create());
    });
    let armed = false;
    const del = button('Delete design', () => {
      if (!armed) {
        armed = true;
        del.textContent = 'Tap again to delete';
        say(`Delete “${h.present.name}”? This can't be undone. Tap again to delete.`);
        setTimeout(() => {
          armed = false;
          del.textContent = 'Delete design';
        }, 5000);
        return;
      }
      store.remove(saved.id);
      open(store.current());
      say('Design deleted.');
    });
    boardBar.replaceChildren(pick, name, make, del);
    designs.replaceChildren(el('summary', {}, `Design: ${h.present.name}`), boardBar);
  }

  function open(next: { id: string; board: Board }): void {
    saved = next;
    h = history(next.board);
    selected = null;
    draft = null;
    view = { x: 0, y: 0 };
    zoom = ZOOM.start;
    mode = { name: 'select' };
    say(next.board.shapes.length ? '' : EMPTY_HINT);
    drawBoardBar();
    draw();
  }

  // ----- Drawing -----
  function draw(): void {
    const b = board();
    layer.setAttribute('transform', `scale(${zoom}) translate(${-view.x} ${-view.y})`);
    const nodes: SVGElement[] = [svg('rect', { x: 0, y: 0, width: WORLD.width, height: WORLD.height, class: 'pg-world' })];
    for (const a of b.arrows) {
      const e = arrowEnds(b, a);
      if (!e) continue;
      const g = svg('g', { class: `pg-arrow${a.id === selected ? ' selected' : ''}` });
      g.append(svg('line', { x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, 'marker-end': 'url(#pg-head)' }));
      if (a.label) {
        const t = svg('text', { x: (e.x1 + e.x2) / 2, y: (e.y1 + e.y2) / 2 - 6, 'text-anchor': 'middle', 'font-size': FONT });
        t.textContent = a.label;
        g.append(t);
      }
      nodes.push(g);
    }
    for (const s of b.shapes) nodes.push(shapeNode(s));
    layer.replaceChildren(...nodes);
    undoBtn.disabled = h.past.length === 0;
    redoBtn.disabled = h.future.length === 0;
    connectBtn.setAttribute('aria-pressed', String(mode.name === 'connect'));
    for (const p of palette.querySelectorAll<HTMLButtonElement>('button')) p.setAttribute('aria-pressed', String(mode.name === 'place' && mode.kind === p.dataset.kind));
    canvas.classList.toggle('placing', mode.name !== 'select');
    drawPanel();
    drawText();
    drawPractice();
  }

  function shapeNode(s: Shape): SVGElement {
    const from = mode.name === 'connect' && mode.from === s.id;
    const g = svg('g', { class: `pg-shape kind-${s.kind}${s.id === selected ? ' selected' : ''}${from ? ' from' : ''}` });
    g.append(svg('rect', { x: s.x, y: s.y, width: s.width, height: s.height, rx: s.kind === 'note' ? 2 : ['db', 'cache', 'storage'].includes(s.kind) ? 18 : 8 }));
    const lines = wrapLabel(s.label || (s.kind === 'note' ? 'Empty note' : ''), s);
    const note = s.kind === 'note';
    const top = note ? s.y + 8 + FONT : s.y + s.height / 2 - ((lines.length - 1) * LINE) / 2 + FONT / 3;
    lines.forEach((line, i) => {
      const t = svg('text', { x: note ? s.x + 8 : s.x + s.width / 2, y: top + i * LINE, 'text-anchor': note ? 'start' : 'middle', 'font-size': FONT });
      t.textContent = line;
      g.append(t);
    });
    return g;
  }

  // ----- The panel for the selected item -----
  function drawPanel(): void {
    const b = h.present;
    const shape = b.shapes.find((s) => s.id === selected);
    const arrow = b.arrows.find((a) => a.id === selected);
    panel.hidden = !shape && !arrow;
    if (shape) {
      const label = el('input', { type: 'text', class: 'learner-input', maxlength: shape.kind === 'note' ? LIMITS.note : LIMITS.label, 'aria-label': shape.kind === 'note' ? 'Note text' : 'Box label', value: shape.label });
      label.addEventListener('change', () => edit(relabel(h.present, shape.id, label.value)));
      const moves = el('div', { class: 'pg-nudge', role: 'group', 'aria-label': 'Move' });
      for (const [text, dx, dy, name] of [['←', -1, 0, 'Move left'], ['↑', 0, -1, 'Move up'], ['↓', 0, 1, 'Move down'], ['→', 1, 0, 'Move right']] as const) moves.append(button(text, () => edit(nudge(h.present, shape.id, dx, dy)), { 'aria-label': name }));
      const actions = el('div', { class: 'controls' });
      if (shape.kind === 'note') {
        actions.append(
          button('Wider', () => edit(resizeNote(h.present, shape.id, GRID * 2, 0))),
          button('Narrower', () => edit(resizeNote(h.present, shape.id, -GRID * 2, 0))),
          button('Taller', () => edit(resizeNote(h.present, shape.id, 0, GRID))),
          button('Shorter', () => edit(resizeNote(h.present, shape.id, 0, -GRID))),
        );
      } else actions.append(button('Connect from here', () => setMode({ name: 'connect', from: shape.id })));
      actions.append(button('Delete', () => edit(remove(h.present, shape.id), null), { class: 'danger' }));
      panel.replaceChildren(el('h3', {}, `Selected: ${KIND_NAMES[shape.kind]}`), label, moves, actions);
    } else if (arrow) {
      const names = (id: string) => b.shapes.find((s) => s.id === id)?.label || KIND_NAMES[b.shapes.find((s) => s.id === id)!.kind];
      const label = el('input', { type: 'text', class: 'learner-input', maxlength: LIMITS.label, 'aria-label': 'Arrow label', placeholder: 'What flows here? (optional)', value: arrow.label });
      label.addEventListener('change', () => edit(relabelArrow(h.present, arrow.id, label.value)));
      const actions = el('div', { class: 'controls' });
      actions.append(button('Reverse', () => edit(reverseArrow(h.present, arrow.id))), button('Delete', () => edit(remove(h.present, arrow.id), null), { class: 'danger' }));
      panel.replaceChildren(el('h3', {}, `Selected: arrow from ${names(arrow.from)} to ${names(arrow.to)}`), label, actions);
    }
  }

  // ----- The board as text: a summary, and a way to select anything without the canvas -----
  function drawText(): void {
    const b = h.present;
    const wasOpen = asText.open;
    const label = (id: string) => {
      const s = b.shapes.find((x) => x.id === id)!;
      return s.label || KIND_NAMES[s.kind];
    };
    const list = el('ul');
    for (const s of b.shapes) {
      const li = el('li');
      // The kind is only repeated when the label says something else.
      const kind = s.kind === 'note' ? 'Note' : KIND_NAMES[s.kind];
      li.append(button(s.label === kind ? kind : `${kind}: ${s.label || '(empty)'}`, () => select(s.id)));
      list.append(li);
    }
    for (const a of b.arrows) {
      const li = el('li');
      li.append(button(`${label(a.from)} → ${label(a.to)}${a.label ? ` (${a.label})` : ''}`, () => select(a.id)));
      list.append(li);
    }
    const boxes = b.shapes.filter((s) => s.kind !== 'note').length;
    asText.replaceChildren(el('summary', {}, `The design as text: ${boxes} ${boxes === 1 ? 'box' : 'boxes'}, ${b.arrows.length} ${b.arrows.length === 1 ? 'arrow' : 'arrows'}`), list);
    asText.open = wasOpen;
  }

  function select(id: string | null): void {
    selected = id;
    draw();
    if (id) panel.scrollIntoView({ block: 'nearest' });
  }

  // ----- Pointer input: tap, drag, pan and pinch -----
  const pointers = new Map<number, { x: number; y: number }>();
  let press: { id: number; x: number; y: number; moved: boolean; grab: { id: string; dx: number; dy: number } | null; view: { x: number; y: number } } | null = null;
  let pinch: { dist: number; zoom: number } | null = null;

  const toWorld = (clientX: number, clientY: number) => {
    const r = surface.getBoundingClientRect();
    return { x: (clientX - r.left) / zoom + view.x, y: (clientY - r.top) / zoom + view.y };
  };

  surface.addEventListener('pointerdown', (e) => {
    surface.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [p, q] = [...pointers.values()];
      pinch = { dist: Math.hypot(p!.x - q!.x, p!.y - q!.y), zoom };
      press = null;
      draft = null;
      return;
    }
    const w = toWorld(e.clientX, e.clientY);
    const hit = mode.name === 'select' ? shapeAt(h.present, w.x, w.y) : null;
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, grab: hit ? { id: hit.id, dx: w.x - hit.x, dy: w.y - hit.y } : null, view: { ...view } };
  });

  surface.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [p, q] = [...pointers.values()];
      setZoom(pinch.zoom * (Math.hypot(p!.x - q!.x, p!.y - q!.y) / pinch.dist));
      return;
    }
    if (!press || press.id !== e.pointerId) return;
    if (!press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) < TAP_SLOP) return;
    press.moved = true;
    if (press.grab) {
      const w = toWorld(e.clientX, e.clientY);
      draft = moveShape(h.present, press.grab.id, w.x - press.grab.dx, w.y - press.grab.dy);
      selected = press.grab.id;
    } else view = clampView({ x: press.view.x - (e.clientX - press.x) / zoom, y: press.view.y - (e.clientY - press.y) / zoom });
    draw();
  });

  const release = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!press || press.id !== e.pointerId) return;
    const p = press;
    press = null;
    if (p.moved) {
      if (draft) {
        const moved = draft;
        draft = null;
        edit(moved);
      }
      return;
    }
    tapAt(toWorld(e.clientX, e.clientY));
  };
  surface.addEventListener('pointerup', release);
  surface.addEventListener('pointercancel', (e) => {
    pointers.delete(e.pointerId);
    pinch = null;
    press = null;
    draft = null;
    draw();
  });

  function tapAt(w: { x: number; y: number }): void {
    const b = h.present;
    if (mode.name === 'place') {
      const { board: next, id } = addShape(b, mode.kind, w.x, w.y);
      if (!id) return say(`The board holds at most ${LIMITS.shapes} shapes.`);
      mode = { name: 'select' };
      say(`Added: ${KIND_NAMES[next.shapes.at(-1)!.kind]}. Edit its label below, or drag it into place.`);
      return edit(next, id);
    }
    const hit = shapeAt(b, w.x, w.y);
    if (mode.name === 'connect') {
      if (!hit) return;
      if (!mode.from) {
        if (hit.kind === 'note') return say('Notes can’t be connected; tap a box.');
        return setMode({ name: 'connect', from: hit.id });
      }
      const problem = connectProblem(b, mode.from, hit.id);
      if (problem) return say(problem);
      const { board: next, id } = connect(b, mode.from, hit.id);
      mode = { name: 'select' };
      say('Arrow added. Give it a label below if it helps (for example “reads” or “HTTPS”).');
      return edit(next, id);
    }
    select(hit?.id ?? arrowNear(b, w.x, w.y));
  }

  /** The arrow within a finger's width of a point, if any. */
  function arrowNear(b: Board, x: number, y: number): string | null {
    const reach = 14 / zoom;
    let best: { id: string; d: number } | null = null;
    for (const a of b.arrows) {
      const e = arrowEnds(b, a);
      if (!e) continue;
      const len2 = (e.x2 - e.x1) ** 2 + (e.y2 - e.y1) ** 2;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - e.x1) * (e.x2 - e.x1) + (y - e.y1) * (e.y2 - e.y1)) / len2));
      const d = Math.hypot(x - (e.x1 + t * (e.x2 - e.x1)), y - (e.y1 + t * (e.y2 - e.y1)));
      if (d <= reach && (!best || d < best.d)) best = { id: a.id, d };
    }
    return best?.id ?? null;
  }

  // ----- Zoom and pan -----
  function clampView(v: { x: number; y: number }): { x: number; y: number } {
    const r = surface.getBoundingClientRect();
    const w = r.width / zoom;
    const hgt = r.height / zoom;
    // Keep at least half the screen over the board, so it can't be lost off to one side.
    return { x: Math.max(-w / 2, Math.min(WORLD.width - w / 2, v.x)), y: Math.max(-hgt / 2, Math.min(WORLD.height - hgt / 2, v.y)) };
  }

  function setZoom(next: number): void {
    const r = surface.getBoundingClientRect();
    const z = Math.max(ZOOM.min, Math.min(ZOOM.max, next));
    // Zoom around the middle of the screen.
    const cx = view.x + r.width / 2 / zoom;
    const cy = view.y + r.height / 2 / zoom;
    zoom = z;
    view = clampView({ x: cx - r.width / 2 / zoom, y: cy - r.height / 2 / zoom });
    draw();
  }

  function zoomBy(f: number): void {
    setZoom(zoom * f);
  }

  function fitAll(): void {
    const r = surface.getBoundingClientRect();
    zoom = Math.max(ZOOM.min, Math.min(ZOOM.max, r.width / WORLD.width, r.height / WORLD.height));
    view = clampView({ x: 0, y: 0 });
    draw();
  }

  // ----- Keyboard -----
  canvas.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      change(e.shiftKey ? redo(h) : undo(h));
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      change(redo(h));
    } else if (e.key === 'Escape') setMode({ name: 'select' });
    else if (selected && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      edit(remove(h.present, selected), null);
    } else if (selected && h.present.shapes.some((s) => s.id === selected)) {
      const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (step) {
        e.preventDefault();
        edit(nudge(h.present, selected, step[0]!, step[1]!));
      }
    }
  });

  // ----- Practice prompts: requirements, a self-review checklist, and lessons to compare with -----
  function drawPractice(): void {
    const b = h.present;
    const prompt = deps.prompts.find((p) => p.id === b.prompt);
    const pick = el('select', { 'aria-label': 'Practice prompt' });
    pick.append(el('option', { value: '' }, 'Free design (no prompt)'));
    for (const p of deps.prompts) {
      const o = el('option', { value: p.id }, p.title);
      if (p.id === b.prompt) o.selected = true;
      pick.append(o);
    }
    pick.addEventListener('change', () => {
      const { version, name, shapes, arrows } = h.present;
      const base: Board = { version, name, shapes, arrows };
      edit(pick.value ? { ...base, prompt: pick.value, checked: [] } : base);
    });
    const body: HTMLElement[] = [pick];
    if (prompt) {
      const reqs = el('ul');
      for (const r of prompt.requirements) reqs.append(el('li', {}, r));
      const checks = el('ul', { class: 'pg-checklist' });
      prompt.checklist.forEach((q, i) => {
        const id = `pg-check-${i}`;
        const box = el('input', { type: 'checkbox', id });
        box.checked = (b.checked ?? []).includes(i);
        box.addEventListener('change', () => {
          const now = new Set(h.present.checked ?? []);
          if (box.checked) now.add(i);
          else now.delete(i);
          edit({ ...h.present, checked: [...now].sort((x, y) => x - y) });
        });
        const label = el('label', { for: id });
        label.append(box, document.createTextNode(q));
        const li = el('li');
        li.append(label);
        checks.append(li);
      });
      const compare = el('ul');
      for (const id of prompt.compare) {
        const l = deps.lesson(id);
        if (!l) continue;
        const li = el('li');
        li.append(el('a', { href: l.href }, l.title));
        compare.append(li);
      }
      const done = (b.checked ?? []).length;
      body.push(
        el('h3', {}, 'Requirements'),
        reqs,
        el('h3', {}, `Check your design (${done} of ${prompt.checklist.length})`),
        el('p', { class: 'muted' }, 'Tick a question when your diagram answers it. Nothing is graded automatically: a design can’t be scored fairly by rules.'),
        checks,
        el('h3', {}, 'Then compare with'),
        compare,
      );
    }
    const wasOpen = practice.open;
    practice.replaceChildren(el('summary', {}, prompt ? `Practice: ${prompt.title}` : 'Practice prompts'), ...body);
    practice.open = wasOpen;
  }

  // ----- Files: download as JSON (to import later) or SVG (a picture), and import -----
  function drawFiles(): void {
    const slug = (h.present.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'design').slice(0, 40);
    const input = el('input', { type: 'file', accept: '.json,application/json', hidden: '' });
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      input.value = '';
      if (!f) return;
      let raw: unknown;
      try {
        raw = JSON.parse(await f.text());
      } catch {
        return say("That file can't be imported: it is not valid JSON. Nothing was changed.");
      }
      const parsed = parseBoard(raw);
      if (!parsed.ok) return say(`That file can't be imported: ${parsed.problem}. Nothing was changed.`);
      if (store.list().length >= BOARDS_MAX) return say(`You have ${BOARDS_MAX} designs, the most this device keeps. Delete one first.`);
      open(store.create(parsed.board));
      say(`Imported “${parsed.board.name}” as a new design.`);
    });
    const actions = el('div', { class: 'controls' });
    actions.append(
      button('Download as JSON', () => download(JSON.stringify(h.present, null, 2), `${slug}.json`)),
      button('Download as SVG', () => download(boardSvg(h.present), `${slug}.svg`, 'image/svg+xml')),
      button('Import a design', () => input.click()),
    );
    files.replaceChildren(el('summary', {}, 'Files'), el('p', { class: 'muted' }, 'JSON can be imported again on any device; SVG is a picture of the design. Designs are saved on this device as you work.'), actions, input);
  }

  // First draw last, once every helper above exists.
  if (!h.present.shapes.length) say(EMPTY_HINT);
  drawFiles();
  drawBoardBar();
  draw();
}

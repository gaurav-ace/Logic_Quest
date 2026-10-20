// The HLD playground's board (Phase 6b, plan section 3.7): boxes from a palette, arrows between
// them, and sticky notes. Everything here is pure: each edit returns a new board, so undo is a
// list of earlier boards and every rule can be tested without a screen. Coordinates are in
// "world" units on a fixed-size board; the screen decides how much of it to show.

export const KINDS = ['client', 'mobile', 'lb', 'service', 'worker', 'db', 'cache', 'queue', 'cdn', 'storage', 'external', 'llm', 'box', 'note'] as const;
export type Kind = (typeof KINDS)[number];

/** What each kind is called in the palette, and its starting label on the board. */
export const KIND_NAMES: Record<Kind, string> = {
  client: 'Web client',
  mobile: 'Mobile app',
  lb: 'Load balancer',
  service: 'API service',
  worker: 'Worker',
  db: 'Database',
  cache: 'Cache',
  queue: 'Queue',
  cdn: 'CDN',
  storage: 'Object storage',
  external: 'External API',
  llm: 'LLM / agent',
  box: 'Box',
  note: 'Note',
};

export const WORLD = { width: 1200, height: 800 };
export const GRID = 20;
export const BOX = { width: 140, height: 60 };
export const NOTE = { min: { width: 120, height: 60 }, max: { width: 320, height: 240 }, start: { width: 160, height: 80 } };
export const LIMITS = { shapes: 60, arrows: 120, label: 30, note: 200, name: 40 };

export interface Shape {
  id: string;
  kind: Kind;
  /** Top-left corner. */
  x: number;
  y: number;
  /** Notes can be resized; every other kind is BOX-sized. */
  width: number;
  height: number;
  label: string;
}

export interface Arrow {
  id: string;
  from: string;
  to: string;
  label: string;
}

export interface Board {
  version: 1;
  name: string;
  shapes: Shape[];
  arrows: Arrow[];
  /** The practice prompt this board answers, if any, and which checklist items are ticked. */
  prompt?: string;
  checked?: number[];
}

export const emptyBoard = (name = 'My design'): Board => ({ version: 1, name, shapes: [], arrows: [] });

export const snap = (v: number): number => Math.round(v / GRID) * GRID;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** A shape's corner kept on the grid and the whole shape inside the board. */
function place(s: Shape, x: number, y: number): Shape {
  return { ...s, x: clamp(snap(x), 0, WORLD.width - s.width), y: clamp(snap(y), 0, WORLD.height - s.height) };
}

function nextId(prefix: 's' | 'a', taken: { id: string }[]): string {
  let n = 1;
  for (const { id } of taken) if (id.startsWith(prefix)) n = Math.max(n, Number(id.slice(1)) + 1);
  return `${prefix}${n}`;
}

const cleanText = (text: string, max: number) => text.replace(/\s+/g, ' ').trim().slice(0, max);

export interface Added {
  board: Board;
  /** The new shape's id, or null when the board is full. */
  id: string | null;
}

/** Adds a shape centred on (cx, cy), snapped to the grid and kept on the board. */
export function addShape(board: Board, kind: Kind, cx: number, cy: number): Added {
  if (board.shapes.length >= LIMITS.shapes) return { board, id: null };
  const size = kind === 'note' ? NOTE.start : BOX;
  const id = nextId('s', board.shapes);
  const shape = place({ id, kind, x: 0, y: 0, ...size, label: kind === 'note' ? '' : KIND_NAMES[kind] }, cx - size.width / 2, cy - size.height / 2);
  return { board: { ...board, shapes: [...board.shapes, shape] }, id };
}

const update = (board: Board, id: string, change: (s: Shape) => Shape): Board => ({ ...board, shapes: board.shapes.map((s) => (s.id === id ? change(s) : s)) });

export const moveShape = (board: Board, id: string, x: number, y: number): Board => update(board, id, (s) => place(s, x, y));

export const nudge = (board: Board, id: string, dx: number, dy: number): Board => update(board, id, (s) => place(s, s.x + dx * GRID, s.y + dy * GRID));

/** Only notes resize; sizes stay on the grid, within the note limits and the board. */
export function resizeNote(board: Board, id: string, dw: number, dh: number): Board {
  return update(board, id, (s) => {
    if (s.kind !== 'note') return s;
    const width = clamp(snap(s.width + dw), NOTE.min.width, Math.min(NOTE.max.width, WORLD.width - s.x));
    const height = clamp(snap(s.height + dh), NOTE.min.height, Math.min(NOTE.max.height, WORLD.height - s.y));
    return { ...s, width, height };
  });
}

export const relabel = (board: Board, id: string, text: string): Board =>
  update(board, id, (s) => ({ ...s, label: cleanText(text, s.kind === 'note' ? LIMITS.note : LIMITS.label) }));

/** Why two shapes can't be connected, or null if they can. */
export function connectProblem(board: Board, from: string, to: string): string | null {
  const ids = new Set(board.shapes.map((s) => s.id));
  if (!ids.has(from) || !ids.has(to)) return 'Both ends must be on the board.';
  if (from === to) return 'An arrow needs two different boxes.';
  if (board.shapes.some((s) => (s.id === from || s.id === to) && s.kind === 'note')) return 'Notes can’t be connected; use a box.';
  if (board.arrows.some((a) => a.from === from && a.to === to)) return 'Those two are already connected that way.';
  if (board.arrows.length >= LIMITS.arrows) return 'The board has as many arrows as it can hold.';
  return null;
}

export function connect(board: Board, from: string, to: string, label = ''): Added {
  if (connectProblem(board, from, to)) return { board, id: null };
  const id = nextId('a', board.arrows);
  return { board: { ...board, arrows: [...board.arrows, { id, from, to, label: cleanText(label, LIMITS.label) }] }, id };
}

export const relabelArrow = (board: Board, id: string, text: string): Board => ({
  ...board,
  arrows: board.arrows.map((a) => (a.id === id ? { ...a, label: cleanText(text, LIMITS.label) } : a)),
});

/** Reverses an arrow, unless that would duplicate one going the other way already. */
export function reverseArrow(board: Board, id: string): Board {
  const a = board.arrows.find((x) => x.id === id);
  if (!a || board.arrows.some((x) => x.from === a.to && x.to === a.from)) return board;
  return { ...board, arrows: board.arrows.map((x) => (x.id === id ? { ...x, from: a.to, to: a.from } : x)) };
}

/** Removes a shape and every arrow touching it, or an arrow on its own. */
export function remove(board: Board, id: string): Board {
  if (board.arrows.some((a) => a.id === id)) return { ...board, arrows: board.arrows.filter((a) => a.id !== id) };
  return { ...board, shapes: board.shapes.filter((s) => s.id !== id), arrows: board.arrows.filter((a) => a.from !== id && a.to !== id) };
}

export const rename = (board: Board, name: string): Board => ({ ...board, name: cleanText(name, LIMITS.name) || board.name });

/** The topmost shape at a point (later shapes are drawn on top), or null. */
export function shapeAt(board: Board, x: number, y: number): Shape | null {
  for (let i = board.shapes.length - 1; i >= 0; i--) {
    const s = board.shapes[i]!;
    if (x >= s.x && x <= s.x + s.width && y >= s.y && y <= s.y + s.height) return s;
  }
  return null;
}

/**
 * Where the line from a shape's centre towards (tx, ty) leaves the shape's rectangle, so arrows
 * start and end at the box edges rather than inside the boxes.
 */
export function edgePoint(s: Pick<Shape, 'x' | 'y' | 'width' | 'height'>, tx: number, ty: number): { x: number; y: number } {
  const cx = s.x + s.width / 2;
  const cy = s.y + s.height / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const scale = Math.min(dx === 0 ? Infinity : s.width / 2 / Math.abs(dx), dy === 0 ? Infinity : s.height / 2 / Math.abs(dy));
  return { x: cx + dx * scale, y: cy + dy * scale };
}

/** The two ends of an arrow, on the edges of its boxes; null if a box is missing. */
export function arrowEnds(board: Board, a: Arrow): { x1: number; y1: number; x2: number; y2: number } | null {
  const from = board.shapes.find((s) => s.id === a.from);
  const to = board.shapes.find((s) => s.id === a.to);
  if (!from || !to) return null;
  const p = edgePoint(from, to.x + to.width / 2, to.y + to.height / 2);
  const q = edgePoint(to, from.x + from.width / 2, from.y + from.height / 2);
  return { x1: p.x, y1: p.y, x2: q.x, y2: q.y };
}

// Undo history: the boards before and after the current one. Edits that change nothing are not
// recorded, so Undo never seems to do nothing.
export interface History {
  past: Board[];
  present: Board;
  future: Board[];
}

export const HISTORY_MAX = 100;
export const history = (board: Board): History => ({ past: [], present: board, future: [] });

export function commit(h: History, next: Board): History {
  if (JSON.stringify(next) === JSON.stringify(h.present)) return h;
  return { past: [...h.past, h.present].slice(-HISTORY_MAX), present: next, future: [] };
}

export function undo(h: History): History {
  const prev = h.past.at(-1);
  return prev ? { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] } : h;
}

export function redo(h: History): History {
  const next = h.future[0];
  return next ? { past: [...h.past, h.present], present: next, future: h.future.slice(1) } : h;
}

export type Parsed = { ok: true; board: Board } | { ok: false; problem: string };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const ID = /^[sa][1-9][0-9]{0,3}$/;

/**
 * Reads a board from a file or from storage. Strict: anything wrong rejects the whole board with
 * a reason, so an import can't half-load. Positions are then snapped and kept on the board.
 */
export function parseBoard(raw: unknown): Parsed {
  const no = (problem: string): Parsed => ({ ok: false, problem });
  if (!isObj(raw)) return no('it is not a Logic Quest board');
  if (raw.version !== 1) return no(`it has version ${JSON.stringify(raw.version)}, and this app reads version 1`);
  if (typeof raw.name !== 'string') return no('it has no name');
  if (!Array.isArray(raw.shapes) || !Array.isArray(raw.arrows)) return no('it has no list of shapes and arrows');
  if (raw.shapes.length > LIMITS.shapes) return no(`it has more than ${LIMITS.shapes} shapes`);
  if (raw.arrows.length > LIMITS.arrows) return no(`it has more than ${LIMITS.arrows} arrows`);
  const shapes: Shape[] = [];
  const ids = new Set<string>();
  for (const [i, s] of raw.shapes.entries()) {
    if (!isObj(s) || typeof s.id !== 'string' || !ID.test(s.id) || !s.id.startsWith('s')) return no(`shape ${i + 1} has no valid id`);
    if (ids.has(s.id)) return no(`shape id ${s.id} is used twice`);
    ids.add(s.id);
    if (!KINDS.includes(s.kind as Kind)) return no(`shape ${s.id} has an unknown kind`);
    if (![s.x, s.y, s.width, s.height].every(isNum) || typeof s.label !== 'string') return no(`shape ${s.id} is missing its position, size or label`);
    const kind = s.kind as Kind;
    const width = kind === 'note' ? clamp(snap(s.width as number), NOTE.min.width, NOTE.max.width) : BOX.width;
    const height = kind === 'note' ? clamp(snap(s.height as number), NOTE.min.height, NOTE.max.height) : BOX.height;
    const shape = { id: s.id, kind, x: 0, y: 0, width, height, label: cleanText(s.label, kind === 'note' ? LIMITS.note : LIMITS.label) };
    shapes.push(place(shape, s.x as number, s.y as number));
  }
  const arrows: Arrow[] = [];
  const pairs = new Set<string>();
  for (const [i, a] of raw.arrows.entries()) {
    if (!isObj(a) || typeof a.id !== 'string' || !ID.test(a.id) || !a.id.startsWith('a') || ids.has(a.id)) return no(`arrow ${i + 1} has no valid id`);
    ids.add(a.id);
    if (typeof a.from !== 'string' || typeof a.to !== 'string' || typeof a.label !== 'string') return no(`arrow ${a.id} is missing its ends or label`);
    const ends = shapes.filter((s) => s.id === a.from || s.id === a.to);
    if (a.from === a.to || ends.length !== 2) return no(`arrow ${a.id} doesn't join two shapes on the board`);
    if (ends.some((s) => s.kind === 'note')) return no(`arrow ${a.id} is attached to a note`);
    if (pairs.has(`${a.from}>${a.to}`)) return no(`arrow ${a.id} repeats another arrow`);
    pairs.add(`${a.from}>${a.to}`);
    arrows.push({ id: a.id, from: a.from, to: a.to, label: cleanText(a.label, LIMITS.label) });
  }
  const board: Board = { version: 1, name: cleanText(raw.name, LIMITS.name) || 'My design', shapes, arrows };
  if (raw.prompt !== undefined) {
    if (typeof raw.prompt !== 'string' || !/^[a-z0-9-]+$/.test(raw.prompt)) return no('its practice prompt is not valid');
    board.prompt = raw.prompt;
    const checked = Array.isArray(raw.checked) ? raw.checked.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < 20) : [];
    board.checked = [...new Set(checked)].sort((x, y) => x - y);
  }
  return { ok: true, board };
}

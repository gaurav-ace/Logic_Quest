// Layout for class and sequence diagrams (Phase 5b). Pure functions, so the validator can
// reject a diagram that won't fit a phone before it is ever drawn, and tests can check that
// nothing overlaps. The renderer only draws what these return.

/** Content width of a 360 px phone; diagrams are drawn at real size, so text stays 14 px+. */
export const UML_W = 304;

const COL_W = 136;
const COLS: Record<string, [number, number]> = { '0': [2, 2 + COL_W], '1': [UML_W - 2 - COL_W, UML_W - 2], both: [2, UML_W - 2] };
const NAME_H = 30;
const KIND_H = 18;
const MEMBER_H = 20;
const PAD = 8;
const ROW_GAP = 36;

/** Rough rendered widths (system-ui), used to reject text that would overflow. The browser check measures the real ones. */
export const textWidth = (text: string, size: 'name' | 'member') => text.length * (size === 'name' ? 9 : 8);

export const MAX_MEMBERS = 5;

export interface ClassBox {
  id: string;
  name: string;
  /** Shown as «interface» or «abstract» above the name. */
  kind?: 'interface' | 'abstract';
  fields?: string[];
  methods?: string[];
  /** Column 0 (left), 1 (right) or both, and a row from the top. */
  col: 0 | 1 | 'both';
  row: number;
}

export type RelationType = 'inherits' | 'implements' | 'has' | 'uses';

export interface Relation {
  /** inherits/implements: child to parent. has: owner to part. uses: user to used. */
  from: string;
  to: string;
  type: RelationType;
}

export interface ClassDiagram {
  type: 'class';
  classes: ClassBox[];
  relations: Relation[];
}

export interface Call {
  from: string;
  to: string;
  label: string;
  /** A return value, drawn dashed. */
  reply?: boolean;
}

export interface SequenceDiagram {
  type: 'sequence';
  actors: string[];
  calls: Call[];
}

export type UmlDiagram = ClassDiagram | SequenceDiagram;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedClass extends Rect {
  box: ClassBox;
  /** y of the line between the name and the members. */
  divider: number;
}

export interface PlacedRelation {
  rel: Relation;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ClassLayout {
  width: number;
  height: number;
  classes: PlacedClass[];
  relations: PlacedRelation[];
}

const boxHeight = (b: ClassBox) => (b.kind ? KIND_H : 0) + NAME_H + ((b.fields?.length ?? 0) + (b.methods?.length ?? 0)) * MEMBER_H + PAD;

export function layoutClasses(d: ClassDiagram): ClassLayout {
  const rows = Math.max(0, ...d.classes.map((c) => c.row)) + 1;
  const rowH = Array.from({ length: rows }, (_, r) => Math.max(0, ...d.classes.filter((c) => c.row === r).map(boxHeight)));
  const rowY: number[] = [];
  let y = 2;
  for (let r = 0; r < rows; r++) {
    rowY.push(y);
    y += rowH[r]! + (rowH[r]! ? ROW_GAP : 0);
  }
  const classes = d.classes.map((box): PlacedClass => {
    const [x1, x2] = COLS[String(box.col)]!;
    const top = rowY[box.row]!;
    return { box, x: x1, y: top, w: x2 - x1, h: boxHeight(box), divider: top + (box.kind ? KIND_H : 0) + NAME_H };
  });
  const at = new Map(classes.map((c) => [c.box.id, c]));
  const relations = d.relations.flatMap((rel): PlacedRelation[] => {
    const a = at.get(rel.from);
    const b = at.get(rel.to);
    return a && b ? [{ rel, ...connect(a, b) }] : [];
  });
  return { width: UML_W, height: y - ROW_GAP + 2, classes, relations };
}

/** A straight line between facing edges: vertical when the boxes share columns, else edge to edge. */
function connect(a: Rect, b: Rect): { x1: number; y1: number; x2: number; y2: number } {
  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  if (a.y !== b.y) {
    const down = a.y < b.y;
    const y1 = down ? a.y + a.h : a.y;
    const y2 = down ? b.y : b.y + b.h;
    if (overlapX > 0) {
      const x = Math.max(a.x, b.x) + overlapX / 2;
      return { x1: x, y1, x2: x, y2 };
    }
    // Diagonal: aim a quarter of a box toward each other, so a line from the side never lands
    // on the same point as a straight one coming from above.
    const toward = Math.sign(b.x + b.w / 2 - (a.x + a.w / 2));
    return { x1: a.x + a.w / 2 + (toward * a.w) / 4, y1, x2: b.x + b.w / 2 - (toward * b.w) / 4, y2 };
  }
  const right = a.x < b.x;
  const y = Math.max(a.y, b.y) + (Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)) / 2;
  return { x1: right ? a.x + a.w : a.x, y1: y, x2: right ? b.x : b.x + b.w, y2: y };
}

/** Does the segment pass through the inside of the rectangle? (Liang–Barsky clipping.) */
export function segmentHitsRect(s: { x1: number; y1: number; x2: number; y2: number }, r: Rect): boolean {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, s.x1 - r.x],
    [dx, r.x + r.w - s.x1],
    [-dy, s.y1 - r.y],
    [dy, r.y + r.h - s.y1],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q <= 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 >= t1) return false;
  }
  return true;
}

/** Everything that would make a class diagram unreadable on a phone, as plain sentences. */
export function classLayoutProblems(d: ClassDiagram): string[] {
  const out: string[] = [];
  const cells = new Map<string, string>();
  for (const c of d.classes) {
    const taken = c.col === 'both' ? ['0', '1'] : [String(c.col)];
    for (const col of taken) {
      const key = `${c.row}:${col}`;
      if (cells.has(key)) out.push(`"${c.id}" and "${cells.get(key)}" share row ${c.row}`);
      cells.set(key, c.id);
    }
    const inner = (c.col === 'both' ? UML_W - 4 : COL_W) - 12;
    if (textWidth(c.name, 'name') > inner) out.push(`"${c.id}": name "${c.name}" is too wide for its box`);
    for (const m of [...(c.fields ?? []), ...(c.methods ?? [])]) if (textWidth(m, 'member') > inner) out.push(`"${c.id}": "${m}" is too wide for its box`);
    const members = (c.fields?.length ?? 0) + (c.methods?.length ?? 0);
    if (members > MAX_MEMBERS) out.push(`"${c.id}" has ${members} members; at most ${MAX_MEMBERS} stay readable`);
  }
  const layout = layoutClasses(d);
  for (const r of layout.relations) {
    for (const c of layout.classes) {
      if (c.box.id === r.rel.from || c.box.id === r.rel.to) continue;
      if (segmentHitsRect(r, c)) out.push(`the line from "${r.rel.from}" to "${r.rel.to}" crosses "${c.box.id}"`);
    }
    // Arrowheads need room: boxes in touching rows or columns leave at least the gap.
    if (Math.hypot(r.x2 - r.x1, r.y2 - r.y1) < 20) out.push(`"${r.rel.from}" and "${r.rel.to}" are too close for an arrow`);
  }
  return out;
}

// Sequence diagrams: actors across the top, calls as numbered rows going down.

const ACTOR_H = 34;
const CALL_H = 38;
const CALLS_TOP = ACTOR_H + 14;

export interface PlacedCall {
  call: Call;
  x1: number;
  x2: number;
  y: number;
  /** Centre of the label, kept inside the diagram. */
  labelX: number;
}

export interface SequenceLayout {
  width: number;
  height: number;
  actors: { name: string; x: number; boxX: number; boxW: number }[];
  calls: PlacedCall[];
  lifelineTop: number;
}

export function layoutSequence(d: SequenceDiagram): SequenceLayout {
  const lane = UML_W / d.actors.length;
  const actors = d.actors.map((name, i) => ({ name, x: lane * i + lane / 2, boxX: lane * i + 3, boxW: lane - 6 }));
  const xOf = new Map(actors.map((a) => [a.name, a.x]));
  const calls = d.calls.map((call, i): PlacedCall => {
    const x1 = xOf.get(call.from) ?? 0;
    const x2 = xOf.get(call.to) ?? 0;
    const half = textWidth(`${i + 1}. ${call.label}`, 'member') / 2;
    const labelX = Math.min(UML_W - 4 - half, Math.max(4 + half, (x1 + x2) / 2));
    return { call, x1, x2, y: CALLS_TOP + i * CALL_H + 24, labelX };
  });
  return { width: UML_W, height: CALLS_TOP + d.calls.length * CALL_H + 10, actors, calls, lifelineTop: ACTOR_H + 2 };
}

export function sequenceLayoutProblems(d: SequenceDiagram): string[] {
  const out: string[] = [];
  if (d.actors.length < 2 || d.actors.length > 4) out.push('needs 2 to 4 actors to fit a phone');
  if (new Set(d.actors).size !== d.actors.length) out.push('actor names must be different');
  const lane = UML_W / Math.max(1, d.actors.length);
  for (const a of d.actors) if (textWidth(a, 'name') > lane - 14) out.push(`actor "${a}" is too wide for its column`);
  d.calls.forEach((c, i) => {
    if (!d.actors.includes(c.from) || !d.actors.includes(c.to)) out.push(`call ${i + 1} names an unknown actor`);
    if (c.from === c.to) out.push(`call ${i + 1} goes from "${c.from}" to itself, which this view doesn't draw`);
    if (textWidth(`${i + 1}. ${c.label}`, 'member') > UML_W - 8) out.push(`call ${i + 1}'s label is too long`);
  });
  if (d.calls.length > 8) out.push('at most 8 calls stay readable');
  return out;
}

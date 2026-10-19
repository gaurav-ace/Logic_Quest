// Simulation lessons: a small live model of a system that the learner can push and break.
// Models are pure (state in, state out, with a seeded random source), so a run with the same
// seed always repeats exactly, and tests can check what each lesson claims.

export type Params = Record<string, number | boolean>;

export type Control =
  | { kind: 'slider'; id: string; label: string; min: number; max: number; step: number; value: number; unit?: string }
  | { kind: 'toggle'; id: string; label: string; value: boolean }
  /** A one-off event, e.g. "kill server 2" (failure injection). */
  | { kind: 'action'; id: string; label: string };

export interface Metric {
  id: string;
  label: string;
  format: 'count' | 'percent' | 'ms' | 'per-second' | 'number';
  /** Which direction is good, for colouring the live value. */
  better: 'low' | 'high';
}

export interface SimNode {
  id: string;
  label: string;
  /** Centre, in a 304 x 214 px area (fits a 360 px phone). */
  x: number;
  y: number;
  /** Box width in px (default 72); wider for longer labels. */
  width?: number;
  status?: 'ok' | 'busy' | 'down' | 'slow';
  /** 0 to 1, drawn as a small bar: how full the node is (queue or capacity). */
  load?: number;
  /** Short text under the node, e.g. "3 waiting". */
  note?: string;
}

export interface SimEdge {
  from: string;
  to: string;
  /** Traffic flowing on this link during the last tick. */
  active?: boolean;
  broken?: boolean;
}

export interface SimView {
  nodes: SimNode[];
  edges: SimEdge[];
}

export interface Model<S> {
  id: string;
  controls: Control[];
  metrics: Metric[];
  /** Simulated milliseconds per tick. */
  tickMs: number;
  init(params: Params, random: () => number): S;
  step(state: S, params: Params, random: () => number): S;
  /** Apply a one-off action (failure injection, restart, ...). */
  act(state: S, action: string, params: Params): S;
  /** Current values, measured over the model's recent window. */
  read(state: S): Record<string, number>;
  view(state: S, params: Params): SimView;
}

/** Y positions for a column of 1 to 4 boxes, spaced so each box's note fits under it. */
export const columnYs = (n: number): number[] => [[100], [60, 140], [30, 100, 170], [22, 82, 142, 202]][n - 1]!;

export function defaults(controls: Control[]): Params {
  const p: Params = {};
  for (const c of controls) if (c.kind !== 'action') p[c.id] = c.value;
  return p;
}

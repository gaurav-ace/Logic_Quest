// Lesson data shape. Lessons are plain JSON rendered by one shared engine (CLAUDE.md section 8),
// so every field here is something the engine or the quiz actually uses.

export const SCHEMA_VERSION = 1;

/** Diagram coordinate space and node box size, shared by the validator and the renderer. */
export const DIAGRAM_W = 420;
export const DIAGRAM_H = 200;
export const DEFAULT_NODE_W = 104;
export const NODE_H = 46;

export interface Source {
  title: string;
  /** https only. Omit for books; put edition and chapter in the title instead. */
  url?: string;
}

export interface LessonNode {
  id: string;
  label: string;
  /** Centre of the box in the diagram's 420x200 coordinate space. */
  x: number;
  y: number;
  /** Box width in diagram units (default 104). Wider boxes fit longer labels at a readable size. */
  width?: number;
}

/** Edges are undirected: a packet may travel either way along one. */
export type Edge = [from: string, to: string];

export interface Step {
  caption: string;
  /** Node ids to highlight during this step. */
  highlight: string[];
  /** Hops the packet travels, in order. Each hop must follow an existing edge. */
  path: Edge[];
}

export interface QuizOption {
  text: string;
  /** Why this option is right or wrong. Required for every option (CLAUDE.md section 6). */
  explanation: string;
}

export interface QuizQuestion {
  prompt: string;
  options: QuizOption[];
  /** Index into options. */
  answer: number;
}

export interface Lesson {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  title: string;
  /** One learning objective in plain words, shown at the top of the lesson. */
  objective: string;
  sources: Source[];
  /** "What this simplifies" note. Required whenever the animation leaves out real behaviour. */
  simplifies?: string;
  nodes: LessonNode[];
  edges: Edge[];
  steps: Step[];
  quiz: QuizQuestion[];
}

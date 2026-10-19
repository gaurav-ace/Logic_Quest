// Lesson data shape. Lessons are plain JSON rendered by one shared engine (CLAUDE.md section 8),
// so every field here is something the engine or the quiz actually uses.

export const SCHEMA_VERSION = 1;

/** Diagram coordinate space and node box size, shared by the validator and the renderer. */
export const DIAGRAM_W = 420;
export const DIAGRAM_H = 200;
export const DEFAULT_NODE_W = 104;
export const NODE_H = 46;

/** Curriculum tracks (docs/CURRICULUM.md). Badges can be tied to finishing a whole track. */
export const TRACKS = ['web', 'logic', 'dsa', 'hld', 'lld', 'real-world', 'agentic'] as const;
export type Track = (typeof TRACKS)[number];

export const LEVELS = ['easy', 'medium', 'hard'] as const;
export type Level = (typeof LEVELS)[number];

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
  /** "What happens next?", asked before this step plays (predict, then reveal). */
  predict?: QuizQuestion;
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

interface LessonBase {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  title: string;
  track: Track;
  level: Level;
  /** One learning objective in plain words, shown at the top of the lesson. */
  objective: string;
  sources: Source[];
  /** "What this simplifies" note. Required whenever the animation leaves out real behaviour. */
  simplifies?: string;
  /** Lessons to finish first; until then this one is shown locked. */
  requires?: string[];
  quiz: QuizQuestion[];
}

/** A hand-written concept diagram (allowed for system concepts, CLAUDE.md section 5.6). */
export interface DiagramLesson extends LessonBase {
  kind: 'diagram';
  nodes: LessonNode[];
  edges: Edge[];
  steps: Step[];
}

/** A computed trace: the steps come from running a real program (src/trace/programs). */
export interface TraceLesson extends LessonBase {
  kind: 'trace';
  /** Id of a registered program. */
  program: string;
}

/** One goal to reach in a sim, e.g. "keep errors under 1% for 10 s with a server killed". */
export interface Challenge {
  id: string;
  title: string;
  /** What to do, in plain words. */
  prompt: string;
  /** Asked before the challenge starts: what do you expect will happen? */
  predict?: QuizQuestion;
  setup?: {
    /** Settings applied when the challenge starts. */
    params?: Record<string, number | boolean>;
    /** Controls the learner can't change during this challenge. */
    lock?: string[];
    /** One-off actions, in simulated ms after the start (e.g. kill a server after 3 s). */
    actions?: { at: number; action: string }[];
  };
  /**
   * fromStart: the goal must hold for the whole first `forSeconds` after the setup (no waiting for
   * things to settle). Used where the point is surviving a sudden event, like a cold cache.
   */
  goal: { metric: string; op: '<=' | '>='; value: number; forSeconds: number; fromStart?: boolean };
  hint: string;
  /** Shown on success: why it worked. */
  explain: string;
  /** A known winning setting. Never shown; tests use it to prove the challenge can be done. */
  solution: Record<string, number | boolean>;
}

/** A live simulation the learner can push and break (src/sim/models). */
export interface SimLesson extends LessonBase {
  kind: 'sim';
  /** Id of a registered model. */
  model: string;
  /** Overrides for the model's starting settings. */
  params?: Record<string, number | boolean>;
  challenges: Challenge[];
}

export type Lesson = DiagramLesson | TraceLesson | SimLesson;

export const KINDS = ['diagram', 'trace', 'sim'] as const;

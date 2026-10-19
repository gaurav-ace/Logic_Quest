import type { QuizQuestion } from '../lesson/schema';
import type { Control, Metric, Params } from '../sim/types';
import type { Frame } from '../trace/types';

// Agent lessons (Phase 6): a scripted "model" works through a task in a loop (decide, act,
// observe) with tools over a small fake world. Nothing calls a real model: the policy is a set of
// plain rules, written out in each lesson, so every run can be repeated and tested.

export type Args = Record<string, string | number>;

export interface Call {
  tool: string;
  args: Args;
}

/** What the scripted model decides on one turn. `why` is the rule that fired, in plain words. */
export type Decision =
  | { kind: 'call'; call: Call; why: string }
  | { kind: 'answer'; text: string; why: string }
  /** Write a short note to memory that survives when old context is dropped (A4). */
  | { kind: 'note'; text: string; why: string };

/** One thing in the model's context window. The task stays pinned; others can be dropped. */
export interface Entry {
  kind: 'task' | 'call' | 'result' | 'error' | 'note' | 'summary' | 'blocked';
  text: string;
  /** Illustrative token count. */
  tokens: number;
  /** For results: which tool produced it, so policies can look for it. */
  tool?: string;
}

export interface ToolResult {
  ok: boolean;
  text: string;
}

export interface Tool<W> {
  /** The description the model sees, e.g. "forecast(city, day): tomorrow's weather". */
  describe: string;
  run(args: Args, world: W, params: Params): ToolResult;
}

/** A guardrail's verdict on a call, checked before the tool runs. */
export type Verdict = { block: string } | { review: string } | null;

/** What a run produced: the facts tests and challenges look at. */
export interface Outcome {
  /** The model gave a final answer (not stopped by the app). */
  answered: number;
  /** The app stopped the loop at the step limit. */
  stopped: number;
  /** The final answer is right for the world (scenario's grade). */
  correct: number;
  /** Model turns taken. */
  steps: number;
  toolCalls: number;
  /** Illustrative: every turn re-reads the whole context, plus the decision itself. */
  tokens: number;
  blocked: number;
  reviews: number;
  /** Scenario-specific extras, e.g. madeUp or unsafe. */
  [extra: string]: number;
}

export interface RunState<W> {
  world: W;
  params: Params;
  context: Entry[];
  notes: string[];
  turn: number;
  answer: string | null;
  calls: Call[];
  outcome: Outcome;
}

export interface Scenario<W> {
  id: string;
  /** One line for the lesson: what the agent is asked to do. */
  task: string;
  /** The scripted model's rules, shown to the learner so nothing is hidden. */
  rules: string[];
  controls: Control[];
  /** Outcome numbers shown after a run and used by challenges (ids from Outcome). */
  metrics: Metric[];
  tools: Record<string, Tool<W>>;
  init(params: Params): W;
  /** The scripted model: decides from what is in its context (and notes) only. */
  policy(view: { context: Entry[]; notes: string[]; turn: number }, params: Params): Decision;
  /** Guardrails run on every call before the tool does. */
  guard?(call: Call, state: RunState<W>): Verdict;
  /** A scripted human reviewer: approves or rejects a call sent for review. */
  review?(call: Call, state: RunState<W>): boolean;
  /** Is the final answer right for this world? */
  grade(answer: string, state: RunState<W>): boolean;
  /** Called after each tool runs, to count scenario extras (unsafe actions and so on). */
  afterCall?(call: Call, result: ToolResult, state: RunState<W>): void;
  /** Called once at the end, to count scenario extras that depend on the whole run. */
  finish?(state: RunState<W>): void;
  /** "What happens next?" before a frame, computed from the run (at most a few per run). */
  predict?(event: AgentEvent, state: RunState<W>, asked: number): QuizQuestion | undefined;
}

/** What is about to be shown, so a scenario can ask about it before it is revealed. */
export type AgentEvent =
  | { kind: 'decision'; decision: Decision }
  | { kind: 'result'; call: Call; result: ToolResult }
  | { kind: 'verdict'; call: Call; verdict: NonNullable<Verdict>; approved?: boolean }
  | { kind: 'limit' }
  | { kind: 'dropped'; entries: Entry[] };

export interface AgentRun {
  frames: Frame[];
  outcome: Outcome;
}

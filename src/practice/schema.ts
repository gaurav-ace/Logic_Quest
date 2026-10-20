import type { QuizQuestion, Source, Track } from '../lesson/schema';

// Practice items (Phase 6b, docs/AI_INTEGRATION_PLAN.md section 3.3): medium and hard problems
// under each track, solved by tapping, never in a code editor. Each graded check is recorded as an
// answer event under `practice:<id>`, question = the check's index, so XP, anti-farming and the
// "fixed a past mistake" badge work exactly as they do for lessons.

export const PRACTICE_LEVELS = ['medium', 'hard'] as const;
export type PracticeLevel = (typeof PRACTICE_LEVELS)[number];

export const PRACTICE_KINDS = ['quiz', 'debug', 'guided'] as const;
export type PracticeKind = (typeof PRACTICE_KINDS)[number];

interface PracticeBase {
  id: string;
  title: string;
  track: Track;
  level: PracticeLevel;
  /** One objective in plain words, shown at the top. */
  objective: string;
  sources: Source[];
  /** "What this simplifies", where the problem leaves out real behaviour. */
  simplifies?: string;
  /** A lesson that animates the idea, offered as "Watch it in a lesson". */
  related?: string;
}

/** Advanced corner cases: a short setup, then questions. */
export interface QuizPractice extends PracticeBase {
  kind: 'quiz';
  intro: string;
  questions: QuizQuestion[];
}

/**
 * Find the bug. Checks, in order: 0 tap the buggy line, 1 predict what the buggy code gives for
 * `input`, 2 pick the fix. When `program` is set, the outputs come from running a registered
 * buggy and fixed implementation (CLAUDE.md section 5.6), and a test proves the predict answer
 * matches the buggy run.
 */
export interface DebugPractice extends PracticeBase {
  kind: 'debug';
  /** "python", or "text" for logs, configs and designs. */
  language: 'python' | 'text';
  code: string[];
  symptom: string;
  bugLine: number;
  /** Why that line is the culprit, shown after the line is found. */
  lineWhy: string;
  program?: string;
  /** Input for the predict step, as JSON the program accepts. */
  input?: unknown;
  predict: QuizQuestion;
  fix: QuizQuestion;
}

/** The six steps every guided problem follows, in this order (plan section 3.4). */
export const STAGES = ['understand', 'shrink', 'breakdown', 'logic', 'edges', 'combine'] as const;
export type Stage = (typeof STAGES)[number];

/** Tap the parts in the order you'd do them. */
export interface OrderCheck {
  type: 'order';
  /** The expert order. Shown shuffled. */
  parts: string[];
  explain: string;
}

/** Tap every case that applies (for example, every input that breaks a naive solution). */
export interface SelectCheck {
  type: 'select';
  prompt: string;
  cases: { text: string; pick: boolean; why: string }[];
}

export type GuidedCheck = ({ type: 'choice' } & QuizQuestion) | OrderCheck | SelectCheck;

export interface GuidedStep {
  stage: Stage;
  /** The question the learner answers in their own words first. */
  prompt: string;
  /** Progressive hints, at most 3. */
  hints: string[];
  check?: GuidedCheck;
  /** The expert's version, shown after the check (or at once when there is no check). */
  model: string;
}

export interface GuidedPractice extends PracticeBase {
  kind: 'guided';
  problem: string;
  example?: { input: string; output: string };
  steps: GuidedStep[];
}

export type PracticeItem = QuizPractice | DebugPractice | GuidedPractice;

/** Key used for this item's answer events. */
export const practiceKey = (id: string) => `practice:${id}`;

/** The question numbers its graded checks are recorded under; it is done when each has a correct answer. */
export function checkIndices(item: PracticeItem): number[] {
  if (item.kind === 'quiz') return item.questions.map((_, i) => i);
  if (item.kind === 'debug') return [0, 1, 2];
  // A guided step's check is recorded under the step's own index.
  return item.steps.flatMap((s, i) => (s.check ? [i] : []));
}

import type { QuizQuestion } from '../lesson/schema';

// A trace is what really happened when a program ran: one frame per step, recorded by the
// program itself as it runs (CLAUDE.md section 5.6: computed, not hand-scripted).

export type Value = number | string | boolean | null | Value[];

/** A labelled position in an array view, drawn above the cell (e.g. "i", "lo", "best"). */
export interface Pointer {
  name: string;
  index: number;
}

export type View =
  | {
      type: 'array';
      label?: string;
      values: Value[];
      pointers?: Pointer[];
      /** Cells in focus this step. */
      highlight?: number[];
      /** Cells that are finished (sorted, ruled out, ...), drawn muted. */
      done?: number[];
      /** Inclusive range still in play, e.g. a binary search window. */
      range?: [number, number];
    }
  | {
      type: 'table';
      label?: string;
      columns: string[];
      rows: Value[][];
      highlightRow?: number;
    };

export interface Frame {
  /** 1-based line of `code` that just ran, or null for the setup or summary. */
  line: number | null;
  caption: string;
  vars: [name: string, value: Value][];
  views: View[];
  /** A prediction asked before this frame is shown: "what will this be after the line runs?" */
  ask?: QuizQuestion;
}

export interface Program<I = unknown> {
  id: string;
  /** Code shown to the learner, Python-like, one string per line. Keep lines short for phones. */
  code: string[];
  defaultInput: I;
  /** A fresh example for "New example", from a seeded random source. */
  randomInput(random: () => number): I;
  /** One line describing the input, e.g. "nums = [3, 8, 2]". */
  describe(input: I): string;
  /** Records the trace. The last frame must have a variable named "result". */
  run(input: I): Frame[];
  /** A plain implementation with no tracing. Tests check the trace's result matches it. */
  reference(input: I): Value;
}

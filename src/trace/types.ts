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
      /** [row, column] of one cell in focus, e.g. the DP entry being filled. */
      highlightCell?: [number, number];
    }
  | {
      /** Bottom of the stack first; the last item is the top. */
      type: 'stack';
      label?: string;
      items: Value[];
      highlightTop?: boolean;
    }
  | {
      /** Front of the queue first. */
      type: 'queue';
      label?: string;
      items: Value[];
      highlightFront?: boolean;
      highlightBack?: boolean;
    }
  | {
      /** Linked list: nodes drawn left to right in array order; `next` may point anywhere (or loop). */
      type: 'list';
      label?: string;
      nodes: { value: Value; next: number | null }[];
      head: number | null;
      pointers?: Pointer[];
      highlight?: number[];
    }
  | {
      type: 'buckets';
      label?: string;
      buckets: Value[][];
      highlight?: number;
    }
  | {
      type: 'tree';
      label?: string;
      /** binary: children are [left, right] (null for a missing side). nary: any number, in order. */
      shape: 'binary' | 'nary';
      nodes: TreeNode[];
      root: string | null;
      highlight?: string[];
      done?: string[];
      /** Small text under a node (e.g. "end" in a trie). */
      notes?: Record<string, string>;
    }
  | {
      /** Nodes are placed by the program, x 7 to 277 and y 13 to 187, so the view fits a 360 px phone. */
      type: 'graph';
      label?: string;
      nodes: { id: string; label: string; x: number; y: number }[];
      edges: { from: string; to: string; weight?: number }[];
      directed?: boolean;
      highlight?: string[];
      done?: string[];
      activeEdges?: [string, string][];
      /** Small text under a node (e.g. its distance). */
      notes?: Record<string, string>;
    };

export interface TreeNode {
  id: string;
  value: Value;
  children: (string | null)[];
}

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
  /**
   * Code shown to the learner, Python-like, one string per line. Keep lines short for phones.
   * A function when the code itself shows the input's values (e.g. users = 1_000_000).
   */
  code: string[] | ((input: I) => string[]);
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

export function codeFor<I>(program: Program<I>, input: I): string[] {
  return typeof program.code === 'function' ? program.code(input) : program.code;
}

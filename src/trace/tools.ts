import type { QuizQuestion } from '../lesson/schema';
import type { Frame, Value, View } from './types';

/** Seeded random numbers in [0, 1) (mulberry32), so an example can be reproduced from its seed. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randomInt = (random: () => number, lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1));

export function randomList(random: () => number, length: number, lo: number, hi: number): number[] {
  return Array.from({ length }, () => randomInt(random, lo, hi));
}

export const show = (v: Value): string => (Array.isArray(v) ? `[${v.map(show).join(', ')}]` : v === null ? 'None' : typeof v === 'boolean' ? (v ? 'True' : 'False') : String(v));

export interface Distractor {
  value: Value;
  /** Why someone might pick it, and why it's wrong. */
  why: string;
}

/**
 * A prediction whose right answer comes from the real run. Distractors that equal the answer or
 * each other are dropped (a common mistake can coincide with the truth). Returns undefined when no
 * distractor survives, because a one-option question teaches nothing.
 */
export function predict(prompt: string, answer: Value, whyRight: string, distractors: Distractor[], seed: number): QuizQuestion | undefined {
  const seen = new Set([show(answer)]);
  const wrong = distractors.filter((d) => {
    const key = show(d.value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!wrong.length) return undefined;
  const options = [{ text: show(answer), explanation: `Right. ${whyRight}` }, ...wrong.slice(0, 3).map((d) => ({ text: show(d.value), explanation: `No. ${d.why}` }))];
  // Shuffle deterministically, so the right answer isn't always first.
  const random = seeded(seed);
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [options[i], options[j]] = [options[j]!, options[i]!];
  }
  return { prompt, options, answer: options.findIndex((o) => o.text === show(answer)) };
}

/** Records frames as a program runs. */
export class Tracer {
  readonly frames: Frame[] = [];

  step(line: number | null, caption: string, vars: Record<string, Value>, views: View[], ask?: QuizQuestion): void {
    // Copy, so a program that later changes its own arrays can never rewrite an earlier frame.
    const snapshot = structuredClone({ vars: Object.entries(vars), views });
    this.frames.push({ line, caption, ...snapshot, ...(ask ? { ask } : {}) });
  }
}

import { describe, expect, it } from 'vitest';
import { classLayoutProblems, sequenceLayoutProblems } from '../engine/uml';
import { PROGRAMS } from './registry';
import { seeded, Tracer } from './tools';
import { codeFor, type Frame, type Program } from './types';

// Every program, on its default input and 200 random ones: the trace must be well-formed and
// its result must equal the plain reference implementation (CLAUDE.md section 10).

const RUNS = 200;

function checkFrames(p: Program<unknown>, input: unknown, frames: Frame[], label: string): void {
  const code = codeFor(p, input);
  expect(frames.length, label).toBeGreaterThan(1);
  for (const line of code) expect(line.length, `${label}: code line "${line}"`).toBeLessThanOrEqual(34);
  for (const [i, f] of frames.entries()) {
    const where = `${label} frame ${i}`;
    if (f.line !== null) expect(f.line >= 1 && f.line <= code.length, `${where}: line ${f.line}`).toBe(true);
    expect(f.caption.trim().length, `${where}: caption`).toBeGreaterThan(0);
    for (const v of f.views) {
      if (v.type !== 'uml') continue;
      const problems = v.diagram.type === 'class' ? classLayoutProblems(v.diagram) : sequenceLayoutProblems(v.diagram);
      expect(problems, `${where}: diagram fits a phone`).toEqual([]);
    }
    if (f.ask) {
      const texts = f.ask.options.map((o) => o.text);
      expect(new Set(texts).size, `${where}: unique options`).toBe(texts.length);
      expect(texts.length >= 2 && texts.length <= 4, `${where}: 2-4 options`).toBe(true);
      expect(f.ask.answer >= 0 && f.ask.answer < texts.length, `${where}: answer index`).toBe(true);
      expect(f.ask.options.every((o) => o.explanation.trim().length > 0), `${where}: explanations`).toBe(true);
    }
  }
  const result = frames.at(-1)!.vars.find(([name]) => name === 'result');
  expect(result, `${label}: last frame has a result`).toBeDefined();
}

describe.each(PROGRAMS.map((p) => [p.id, p] as const))('program %s', (_id, p) => {
  it('traces its default input correctly', () => {
    const frames = p.run(p.defaultInput);
    checkFrames(p, p.defaultInput, frames, 'default');
    expect(frames.at(-1)!.vars.find(([n]) => n === 'result')![1]).toEqual(p.reference(p.defaultInput));
  });

  it(`matches the reference on ${RUNS} random inputs`, () => {
    for (let seed = 1; seed <= RUNS; seed++) {
      const input = p.randomInput(seeded(seed));
      const frames = p.run(input);
      checkFrames(p, input, frames, `seed ${seed} (${p.describe(input)})`);
      expect(frames.at(-1)!.vars.find(([n]) => n === 'result')![1], p.describe(input)).toEqual(p.reference(input));
    }
  });

  it('asks at least one prediction on the default input', () => {
    expect(p.run(p.defaultInput).some((f) => f.ask)).toBe(true);
  });

  it('never lets a later step rewrite an earlier frame', () => {
    // Record each frame the moment it is made, then compare once the run is over.
    const atRecord: string[] = [];
    const original = Tracer.prototype.step;
    Tracer.prototype.step = function (this: Tracer, ...args: Parameters<Tracer['step']>) {
      original.apply(this, args);
      atRecord.push(JSON.stringify(this.frames.at(-1)));
    };
    try {
      for (const input of [p.defaultInput, p.randomInput(seeded(5))]) {
        atRecord.length = 0;
        const frames = p.run(input);
        expect(frames.map((f) => JSON.stringify(f))).toEqual(atRecord);
      }
    } finally {
      Tracer.prototype.step = original;
    }
  });
});

import { predict, randomInt, Tracer } from '../tools';
import type { Program } from '../types';

// D20 "Recursion and the call stack": each call waits on the stack for the one below it, then
// the answers come back up in reverse order.

const code = [
  'def fact(n):',
  '    if n <= 1:',
  '        return 1',
  '    return n * fact(n - 1)',
];

export function factorialDepth(n: number): { value: number; maxDepth: number } {
  let depth = 0;
  let maxDepth = 0;
  const f = (k: number): number => {
    depth++;
    maxDepth = Math.max(maxDepth, depth);
    const v = k <= 1 ? 1 : k * f(k - 1);
    depth--;
    return v;
  };
  return { value: f(n), maxDepth };
}

export const factorial: Program<number> = {
  id: 'factorial',
  code,
  defaultInput: 4,
  randomInput: (r) => randomInt(r, 3, 6),
  describe: (n) => `fact(${n})`,
  reference: (n) => {
    let p = 1;
    for (let k = 2; k <= n; k++) p *= k;
    return p;
  },
  run(n) {
    const t = new Tracer();
    const stack: string[] = [];
    const view = (top = true) => [{ type: 'stack' as const, label: 'call stack (top is running)', items: [...stack], highlightTop: top }];
    t.step(null, `fact(${n}) = ${n} × ${n - 1} × … × 1. Written recursively, each call hands a smaller problem to another call, and waits.`, { n }, view(false));
    const depthAsk = predict(
      `How many calls will be on the stack at its deepest, for fact(${n})?`,
      n,
      `fact(${n}) calls fact(${n - 1}), and so on down to fact(1): ${n} calls waiting at once.`,
      [
        { value: 1, why: 'Each call waits for the one it made, so they pile up.' },
        { value: n - 1, why: 'Count fact(1) too: it is a call, even though it returns straight away.' },
        { value: n + 1, why: 'There is no fact(0) here: fact(1) already returns 1.' },
      ],
      1,
    );
    let asked = false;
    const call = (k: number): number => {
      stack.push(`fact(${k})`);
      t.step(1, `Call fact(${k}). It goes on top of the stack.`, { n: k, depth: stack.length }, view(), k === n ? depthAsk : undefined);
      if (k <= 1) {
        t.step(3, `n is ${k}: the base case. Return 1 without calling again; this is what stops the recursion.`, { n: k, depth: stack.length }, view());
        stack.pop();
        return 1;
      }
      stack[stack.length - 1] = `fact(${k}): waiting for fact(${k - 1})`;
      t.step(4, `fact(${k}) needs fact(${k - 1}) first, so it waits.`, { n: k, depth: stack.length }, view());
      const below = call(k - 1);
      const value = k * below;
      const ask =
        !asked && k === 3
          ? ((asked = true),
            predict(
              `fact(2) returned ${below}. What does fact(3) return?`,
              value,
              `fact(3) = 3 × fact(2) = 3 × ${below} = ${value}.`,
              [
                { value: below, why: 'fact(3) multiplies what came back by its own n, 3.' },
                { value: 3 + below, why: 'The code multiplies: n * fact(n - 1).' },
              ],
              2,
            ))
          : undefined;
      stack[stack.length - 1] = `fact(${k}) = ${k} × ${below}`;
      t.step(4, `fact(${k - 1}) returned ${below}, so fact(${k}) returns ${k} × ${below} = ${value}.`, { n: k, depth: stack.length, returns: value }, view(), ask);
      stack.pop();
      return value;
    };
    const result = call(n);
    t.step(null, `The stack is empty again: fact(${n}) = ${result}. The calls went down ${n} levels, then the answers came back up.`, { result }, view(false));
    return t.frames;
  },
};

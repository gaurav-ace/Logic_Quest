import { predict, randomInt, Tracer } from '../tools';
import type { Program } from '../types';

// L7 "Work backwards": start at 1, press +1 or ×2, reach n in as few presses as possible.
// Going forwards there are many choices; going backwards from n there is only one sensible
// undo at each step. (claims.test.ts checks this gives the fewest presses, against a search.)

const code = [
  'def presses_to(n):',
  '    steps = []',
  '    while n > 1:',
  '        if n % 2 == 0:',
  '            n = n // 2',
  "            steps.append('×2')",
  '        else:',
  '            n = n - 1',
  "            steps.append('+1')",
  '    steps.reverse()',
  '    return steps',
];

export function backwards(n: number): string[] {
  const steps: string[] = [];
  while (n > 1) {
    if (n % 2 === 0) {
      n /= 2;
      steps.push('×2');
    } else {
      n -= 1;
      steps.push('+1');
    }
  }
  return steps.reverse();
}

export const workBackwards: Program<number> = {
  id: 'work-backwards',
  code,
  defaultInput: 22,
  randomInput: (r) => randomInt(r, 12, 60),
  describe: (n) => `n = ${n}`,
  reference: (n) => backwards(n),
  run(target) {
    const t = new Tracer();
    const view = (steps: string[], label: string) => [{ type: 'array' as const, label, values: steps }];
    t.step(null, `Start at 1. Each press is +1 or ×2. What is the fewest presses to reach ${target}? Going forwards there are many paths, so work backwards from ${target}.`, { n: target }, view([], 'steps (undone so far)'));
    const steps: string[] = [];
    t.step(2, 'steps will record the presses, last press first.', { n: target, steps }, view(steps, 'steps (undone so far)'));
    let n = target;
    let pass = 0;
    while (n > 1) {
      pass++;
      t.step(3, `n is ${n}, still above 1, so undo one more press.`, { n, steps }, view(steps, 'steps (undone so far)'));
      const even = n % 2 === 0;
      const next = even ? n / 2 : n - 1;
      const ask =
        pass <= 2 || next === 1
          ? predict(
              `n is ${n}. What is n after this pass?`,
              next,
              even ? `${n} is even, so the last press could have been ×2: undo it by halving to ${next}.` : `${n} is odd, so it can't come from ×2. The last press was +1: undo it to ${next}.`,
              [
                { value: n * 2, why: 'We are going backwards: undo ×2 by halving, not doubling.' },
                { value: even ? n - 1 : (n - 1) / 2, why: even ? 'Subtracting 1 also undoes a press, but halving removes much more in one step. Halve when you can.' : `${n} − 1 = ${n - 1} first; halving comes on a later pass.` },
                { value: n + 1, why: 'Undoing +1 means subtracting 1, not adding.' },
              ],
              pass,
            )
          : undefined;
      if (even) {
        n = next;
        steps.push('×2');
        t.step(6, `${n * 2} is even: halve it to ${n}, and record ×2.`, { n, steps }, view(steps, 'steps (undone so far)'), ask);
      } else {
        n = next;
        steps.push('+1');
        t.step(9, `${n + 1} is odd: subtract 1 to get ${n}, and record +1.`, { n, steps }, view(steps, 'steps (undone so far)'), ask);
      }
    }
    steps.reverse();
    t.step(10, `n reached 1. Reverse the list to read the presses forwards, from 1.`, { steps }, view(steps, 'presses, from 1'));
    let x = 1;
    const path = [1, ...steps.map((s) => (x = s === '×2' ? x * 2 : x + 1))];
    t.step(11, `Check forwards: ${path.join(' → ')}. ${steps.length} presses reach ${target}.`, { result: steps }, view(steps, 'presses, from 1'));
    return t.frames;
  },
};

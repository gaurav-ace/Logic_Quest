import { predict, randomInt, Tracer } from '../tools';
import type { Program } from '../types';

// D9 "Stacks": last in, first out. Check brackets match by pushing openers and popping on closers.

const code = [
  'def balanced(s):',
  "    pairs = {')': '(', ']': '['}",
  '    stack = []',
  '    for ch in s:',
  "        if ch in '([':",
  '            stack.append(ch)',
  '        elif not stack:',
  '            return False',
  '        else:',
  '            top = stack.pop()',
  '            if top != pairs[ch]:',
  '                return False',
  '    return not stack',
];

const PAIRS: Record<string, string> = { ')': '(', ']': '[' };

export const brackets: Program<string> = {
  id: 'brackets',
  code,
  defaultInput: '([()])[',
  randomInput: (r) => {
    // Build a balanced string, then sometimes break it, so both answers come up.
    let s = '';
    const build = (depth: number): void => {
      const n = randomInt(r, 1, 2);
      for (let i = 0; i < n && s.length < 8; i++) {
        const [o, c] = r() < 0.5 ? ['(', ')'] : ['[', ']'];
        s += o;
        if (depth < 2 && r() < 0.5) build(depth + 1);
        s += c;
      }
    };
    build(0);
    const k = r();
    if (k < 0.25) s = s.slice(0, -1);
    else if (k < 0.5) s = s.replace(/\)/, ']').replace(/\]/, ')');
    else if (k < 0.6) s = ']' + s;
    return s;
  },
  describe: (s) => `s = "${s}"`,
  // A different method: delete matched pairs until nothing changes.
  reference: (s) => {
    let prev = '';
    while (prev !== s) {
      prev = s;
      s = s.replace('()', '').replace('[]', '');
    }
    return s === '';
  },
  run(s) {
    const t = new Tracer();
    const stack: string[] = [];
    const view = (i: number | null, top = false) => [
      { type: 'array' as const, label: 's', values: [...s], ...(i === null ? {} : { pointers: [{ name: 'ch', index: i }], highlight: [i] }), done: i === null ? [] : Array.from({ length: i }, (_, k) => k) },
      { type: 'stack' as const, label: 'stack (open brackets waiting)', items: [...stack], highlightTop: top },
    ];
    t.step(null, `Is "${s}" balanced: every opener closed, in the right order? The most recent opener must close first: last in, first out.`, {}, view(null));
    t.step(3, 'Start with an empty stack.', { stack }, view(null));
    let asked = 0;
    for (const [i, ch] of [...s].entries()) {
      if (ch === '(' || ch === '[') {
        stack.push(ch);
        t.step(6, `${ch} opens: push it.`, { ch, stack }, view(i, true));
        continue;
      }
      const want = PAIRS[ch]!;
      const top = stack.at(-1);
      const ok = top === want;
      const ask =
        asked < 2 && top !== undefined
          ? (asked++,
            predict(
              `ch is ${ch} and the top of the stack is ${top}. What happens?`,
              ok ? `pop ${top}: they match` : 'return False',
              ok ? `${ch} closes the most recent opener, ${top}: pop it and carry on.` : `${ch} needs ${want}, but the most recent opener is ${top}: wrong order, so not balanced.`,
              [
                { value: ok ? 'return False' : `pop ${top}: they match`, why: ok ? `${top} and ${ch} are a pair, so it is fine.` : `${top} and ${ch} are not a pair.` },
                { value: `push ${ch}`, why: 'Only openers are pushed. A closer must match the top.' },
              ],
              i,
            ))
          : undefined;
      if (!top) {
        t.step(8, `${ch} has nothing to close: the stack is empty. Not balanced.`, { result: false }, view(i, true), ask);
        return t.frames;
      }
      if (stack.pop() !== want) {
        t.step(12, `${ch} needs ${want} on top, but the top is ${top}. Not balanced.`, { result: false }, view(i, true), ask);
        return t.frames;
      }
      t.step(10, `${ch} closes ${want}: pop it.`, { ch, stack }, view(i), ask);
    }
    const result = stack.length === 0;
    t.step(13, result ? 'Every opener was closed: the stack is empty, so it is balanced.' : `The string ended with ${stack.join('')} still open, so it is not balanced.`, { stack, result }, view(null));
    return t.frames;
  },
};

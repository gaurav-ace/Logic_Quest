import { predict, randomInt, Tracer } from '../tools';
import type { Program } from '../types';

// D8 "Fast and slow pointers": Floyd's tortoise and hare. If the list loops, the fast pointer
// laps the slow one and they meet; if not, fast falls off the end.

export interface CycleInput {
  length: number;
  /** Index the last node points back to, or null for no loop. */
  loopTo: number | null;
}

const code = [
  'def has_cycle(head):',
  '    slow = fast = head',
  '    while fast and fast.next:',
  '        slow = slow.next',
  '        fast = fast.next.next',
  '        if slow is fast:',
  '            return True',
  '    return False',
];

const nextOf = ({ length, loopTo }: CycleInput) => (i: number): number | null => (i + 1 < length ? i + 1 : loopTo);

export const cycleDetect: Program<CycleInput> = {
  id: 'cycle-detect',
  code,
  defaultInput: { length: 6, loopTo: 2 },
  randomInput: (r) => {
    const length = randomInt(r, 4, 7);
    return { length, loopTo: r() < 0.65 ? randomInt(r, 0, length - 1) : null };
  },
  describe: ({ length, loopTo }) => `${length} nodes; ${loopTo === null ? 'the last points to None' : `the last points back to node ${loopTo}`}`,
  // A different method: remember every node visited.
  reference: (input) => {
    const next = nextOf(input);
    const seen = new Set<number>();
    for (let i: number | null = 0; i !== null; i = next(i)) {
      if (seen.has(i)) return true;
      seen.add(i);
    }
    return false;
  },
  run(input) {
    const t = new Tracer();
    const next = nextOf(input);
    const view = (slow: number | null, fast: number | null) => [
      {
        type: 'list' as const,
        label: 'nodes (numbered by position)',
        nodes: Array.from({ length: input.length }, (_, i) => ({ value: i, next: next(i) })),
        head: 0,
        pointers: [...(slow === null ? [] : [{ name: 'slow', index: slow }]), ...(fast === null ? [] : [{ name: 'fast', index: fast }])],
        highlight: [slow, fast].filter((x): x is number => x !== null),
      },
    ];
    t.step(null, 'Does this list loop back on itself? Walking it forever would never tell you. Use two pointers at different speeds.', {}, view(null, null));
    let slow = 0;
    let fast: number | null = 0;
    t.step(2, 'Both start at the head.', { slow, fast }, view(slow, fast));
    let pass = 0;
    while (fast !== null && next(fast) !== null) {
      pass++;
      const s2 = next(slow)!;
      const f2: number | null = next(next(fast)!);
      t.step(4, `slow moves one step, to ${s2}.`, { slow: s2, fast }, view(s2, fast));
      const ask =
        pass <= 2
          ? predict(
              `fast is at node ${fast}. Where is it after line 5 (two steps)?`,
              f2,
              `Two steps from ${fast}: ${next(fast)}, then ${f2 === null ? 'None (off the end)' : f2}.`,
              [
                { value: next(fast), why: 'That is one step. fast moves two steps each pass.' },
                { value: s2, why: 'That is where slow went. fast moves twice as far.' },
                { value: fast, why: 'fast always moves; it never waits.' },
              ],
              pass,
            )
          : undefined;
      slow = s2;
      fast = f2;
      t.step(5, `fast moves two steps, to ${fast === null ? 'None' : fast}.`, { slow, fast }, view(slow, fast), ask);
      if (slow === fast) {
        t.step(7, `slow and fast are both at node ${slow}: they met, so there is a loop.`, { result: true }, view(slow, fast));
        return t.frames;
      }
    }
    t.step(8, 'fast reached the end (None), so there is no loop. Return False.', { result: false }, view(slow, null));
    return t.frames;
  },
};

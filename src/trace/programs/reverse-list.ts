import { predict, randomInt, randomList, show, Tracer } from '../tools';
import type { Program, Value } from '../types';

// D7 "Linked lists": follow pointers, and reverse a list by turning each arrow around.

const code = [
  'def reverse(head):',
  '    prev, cur = None, head',
  '    while cur:',
  '        nxt = cur.next',
  '        cur.next = prev',
  '        prev, cur = cur, nxt',
  '    return prev',
];

export const reverseList: Program<number[]> = {
  id: 'reverse-list',
  code,
  defaultInput: [1, 2, 3, 4],
  randomInput: (r) => randomList(r, randomInt(r, 3, 5), 1, 9),
  describe: (values) => `list ${values.join(' → ')}`,
  reference: (values) => [...values].reverse(),
  run(values) {
    const t = new Tracer();
    // Nodes stay in place on screen; only their next pointers change.
    const next: (number | null)[] = values.map((_, i) => (i + 1 < values.length ? i + 1 : null));
    const view = (head: number | null, ptrs: Record<string, number | null>, hl: number[] = []) => [
      {
        type: 'list' as const,
        label: 'nodes (arrows are next pointers)',
        nodes: values.map((value, i) => ({ value, next: next[i]! })),
        head,
        pointers: Object.entries(ptrs).filter((e): e is [string, number] => e[1] !== null).map(([name, index]) => ({ name, index })),
        highlight: hl,
      },
    ];
    const name = (i: number | null): Value => (i === null ? null : values[i]!);
    t.step(null, `A linked list ${values.join(' → ')}. Each node only knows its next node. Reverse it by turning every arrow around.`, {}, view(0, {}));
    let prev: number | null = null;
    let cur: number | null = 0;
    t.step(2, 'prev starts as None (nothing before the head), cur at the head.', { prev: name(prev), cur: name(cur) }, view(0, { cur }));
    let pass = 0;
    while (cur !== null) {
      pass++;
      const nxt: number | null = next[cur]!;
      t.step(4, `Remember the next node (${show(name(nxt))}) before the arrow changes, or the rest of the list is lost.`, { prev: name(prev), cur: name(cur), nxt: name(nxt) }, view(null, { prev, cur, nxt }, [cur]));
      const ask =
        pass === 2
          ? predict(
              `cur is ${name(cur)} and prev is ${show(name(prev))}. After line 5, where does ${name(cur)}'s arrow point?`,
              name(prev),
              `cur.next = prev: the arrow turns back to ${show(name(prev))}.`,
              [
                { value: name(nxt), why: `That was its old next. Line 5 turns the arrow around to prev.` },
                { value: null, why: 'Only the old head ends up pointing to None; this node points back to prev.' },
              ],
              pass,
            )
          : undefined;
      next[cur] = prev;
      t.step(5, `Turn ${name(cur)}'s arrow around: it now points to ${show(name(prev))}.`, { prev: name(prev), cur: name(cur), nxt: name(nxt) }, view(null, { prev, cur, nxt }, [cur]), ask);
      prev = cur;
      cur = nxt;
      t.step(6, `Step forward: prev = ${show(name(prev))}, cur = ${show(name(cur))}.`, { prev: name(prev), cur: name(cur) }, view(null, { prev, cur }));
    }
    const order: number[] = [];
    for (let i = prev; i !== null; i = next[i]!) order.push(values[i]!);
    t.step(7, `cur is None, so prev is the new head: ${order.join(' → ')}. Each node was visited once.`, { result: order }, view(prev, {}));
    return t.frames;
  },
};

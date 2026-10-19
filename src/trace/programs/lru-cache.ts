import type { ClassDiagram } from '../../engine/uml';
import { predict, randomInt, Tracer } from '../tools';
import type { Program, Value, View } from '../types';

// O12 "Design: LRU cache": a hash map finds a key's node in one step, and a doubly linked list
// keeps the nodes in order of use, newest first. A full cache evicts the node at the end.

export type Op = ['get', number] | ['put', number, number];

export interface LruInput {
  cap: number;
  ops: Op[];
}

const code = [
  'def get(key):',
  '    if key not in table:',
  '        return -1',
  '    node = table[key]',
  '    move_to_front(node)',
  '    return node.val',
  '',
  'def put(key, val):',
  '    if key in table:',
  '        table[key].val = val',
  '        move_to_front(table[key])',
  '        return',
  '    if len(table) == cap:',
  '        old = remove_last()',
  '        del table[old.key]',
  '    node = add_front(key, val)',
  '    table[key] = node',
];

/** Reference: a Map keeps insertion order, so delete-then-set moves a key to the newest end. */
export function lruReference({ cap, ops }: LruInput): number[] {
  const m = new Map<number, number>();
  const out: number[] = [];
  for (const op of ops) {
    if (op[0] === 'get') {
      const v = m.get(op[1]);
      if (v === undefined) out.push(-1);
      else {
        m.delete(op[1]);
        m.set(op[1], v);
        out.push(v);
      }
    } else {
      if (m.has(op[1])) m.delete(op[1]);
      else if (m.size === cap) m.delete(m.keys().next().value!);
      m.set(op[1], op[2]);
    }
  }
  return out;
}

interface Node {
  key: number;
  val: number;
  prev: Node | null;
  next: Node | null;
}

const classes: ClassDiagram = {
  type: 'class',
  classes: [
    { id: 'cache', name: 'LRUCache', col: 0, row: 0, fields: ['cap', 'table', 'head, tail'], methods: ['get(key)', 'put(key, val)'] },
    { id: 'node', name: 'Node', col: 1, row: 0, fields: ['key, val', 'prev, next'] },
  ],
  relations: [{ from: 'cache', to: 'node', type: 'has' }],
};

const describeOp = (op: Op) => (op[0] === 'get' ? `get(${op[1]})` : `put(${op[1]}, ${op[2]})`);

export const lruCache: Program<LruInput> = {
  id: 'lru-cache',
  code,
  // Key 1 is used again before the cache fills, so the eviction takes 2, not the oldest insert.
  defaultInput: { cap: 3, ops: [['put', 1, 10], ['put', 2, 20], ['put', 3, 30], ['get', 1], ['put', 4, 40], ['get', 2], ['get', 3], ['put', 5, 50], ['get', 1]] },
  randomInput: (r) => {
    const cap = randomInt(r, 2, 3);
    const ops: Op[] = Array.from({ length: cap }, (_, i): Op => ['put', i + 1, (i + 1) * 10]);
    for (let n = randomInt(r, 5, 7); n > 0; n--) {
      const key = randomInt(r, 1, cap + 2);
      ops.push(r() < 0.5 ? ['get', key] : ['put', key, key * 10 + randomInt(r, 1, 9)]);
    }
    return { cap, ops };
  },
  describe: ({ cap, ops }) => `cap = ${cap}; ${ops.map(describeOp).join(', ')}`,
  reference: (input) => lruReference(input),
  run({ cap, ops }) {
    const t = new Tracer();
    const table = new Map<number, Node>();
    let head: Node | null = null;
    let tail: Node | null = null;
    // For the wrong answers in predictions: when each cached key went in (first in, first out
    // would evict the earliest), and each key's last value (even after it was evicted).
    const insertedAt = new Map<number, number>();
    const lastVal = new Map<number, number>();
    const results: number[] = [];

    const unlink = (n: Node) => {
      if (n.prev) n.prev.next = n.next;
      else head = n.next;
      if (n.next) n.next.prev = n.prev;
      else tail = n.prev;
      n.prev = n.next = null;
    };
    const addFront = (n: Node) => {
      n.next = head;
      if (head) head.prev = n;
      head = n;
      tail ??= n;
    };
    const order = () => {
      const keys: Node[] = [];
      for (let n = head; n; n = n.next) keys.push(n);
      return keys;
    };
    const views = (touched: number | null, withClasses = false): View[] => {
      const nodes = order();
      const list: View = {
        type: 'list',
        label: 'Nodes in order of use (head = newest)',
        nodes: nodes.map((n, i) => ({ value: `${n.key}:${n.val}`, next: i + 1 < nodes.length ? i + 1 : null })),
        head: nodes.length ? 0 : null,
        pointers: nodes.length > 1 ? [{ name: 'oldest', index: nodes.length - 1 }] : [],
        highlight: touched === null ? [] : nodes.flatMap((n, i) => (n.key === touched ? [i] : [])),
      };
      return [...(withClasses ? [{ type: 'uml' as const, label: 'The classes', diagram: classes }] : []), list];
    };
    const vars = (extra: Record<string, Value> = {}) => ({ ...extra, keys: order().map((n) => n.key), results: [...results] });
    let asked = 0;

    t.step(null, `An empty cache that holds ${cap} items. The table finds a key's node at once; the list keeps nodes in order of use.`, vars(), views(null, true));
    ops.forEach((op, i) => {
      const key = op[1];
      if (op[0] === 'get') {
        const node = table.get(key);
        const answer = node ? node.val : -1;
        const evictedVal = !node && lastVal.has(key) ? lastVal.get(key)! : null;
        const ask =
          asked < 3 && (evictedVal !== null || (node && i > 0))
            ? (asked++,
              predict(
                `get(${key}): what does it return?`,
                answer,
                node ? `${key} is still in the table, so get returns its value and moves it to the front.` : `${key} was evicted earlier, so it isn't in the table any more.`,
                node ? [{ value: -1, why: `${key} hasn't been evicted: it's still in the table.` }] : [{ value: evictedVal!, why: `That was its value, but ${key} was evicted when the cache was full.` }],
                i + 1,
              ))
            : undefined;
        results.push(answer);
        if (node) {
          unlink(node);
          addFront(node);
          t.step(6, `get(${key}) finds it and moves it to the front: now the newest. Returns ${answer}.`, vars({ key }), views(key), ask);
        } else {
          t.step(3, `get(${key}): not in the table. Returns -1 (a miss).`, vars({ key }), views(null), ask);
        }
        return;
      }
      const val = op[2];
      const existing = table.get(key);
      if (existing) {
        existing.val = val;
        unlink(existing);
        addFront(existing);
        lastVal.set(key, val);
        t.step(12, `put(${key}, ${val}): already there, so update the value and move it to the front.`, vars({ key, val }), views(key));
        return;
      }
      if (table.size === cap) {
        const old = tail!;
        const fifo = [...insertedAt.entries()].sort((a, b) => a[1] - b[1])[0]![0];
        const ask =
          asked < 3
            ? (asked++,
              predict(
                `The cache is full. put(${key}, ${val}) evicts which key?`,
                old.key,
                `${old.key} is the least recently used: it's at the end of the list.`,
                [
                  ...(fifo !== old.key ? [{ value: fifo, why: `${fifo} went in first, but it was used more recently than ${old.key}. LRU goes by last use, not by age.` }] : []),
                  { value: head!.key, why: `${head!.key} is the newest: the last one to be evicted.` },
                ],
                i + 1,
              ))
            : undefined;
        unlink(old);
        table.delete(old.key);
        insertedAt.delete(old.key);
        t.step(15, `Full: remove the node at the end, key ${old.key}, the least recently used.`, vars({ key, val, evicted: old.key }), views(null), ask);
      }
      const node: Node = { key, val, prev: null, next: null };
      addFront(node);
      table.set(key, node);
      insertedAt.set(key, i);
      lastVal.set(key, val);
      t.step(17, `put(${key}, ${val}): a new node at the front.`, vars({ key, val }), views(key));
    });
    t.step(null, `Done. Every get and put took one table lookup and a few pointer changes, however big the cache.`, { result: results }, views(null, true));
    return t.frames;
  },
};

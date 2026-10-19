import { predict, randomInt, Tracer } from '../tools';
import type { Program, View } from '../types';

// S10 "Consistent hashing": servers and keys sit on a ring of positions 0..99; each key belongs
// to the first server clockwise from it. Adding a server only takes keys from its neighbour,
// while "key % number of servers" reshuffles most keys.

export interface RingInput {
  /** Key positions on the ring (already hashed), 0..99. */
  keys: number[];
  /** Server positions on the ring, 0..99. */
  servers: number[];
  /** Position of the server that is added. */
  added: number;
}

const code = [
  'def owner(key, ring):',
  '    for pos in sorted(ring):',
  '        if pos >= key: return pos',
  '    return min(ring)  # wrapped',
  'before = owners(keys, ring)',
  'ring.add(new_server)',
  'after = owners(keys, ring)',
  'moved = [k for k in keys',
  '         if before[k] != after[k]]',
];

export function owner(key: number, ring: number[]): number {
  const sorted = [...ring].sort((a, b) => a - b);
  return sorted.find((p) => p >= key) ?? sorted[0]!;
}

/** Keys that change owner: on the ring, and with "key mod N". */
export function moves({ keys, servers, added }: RingInput): { ring: number[]; modulo: number[] } {
  const after = [...servers, added];
  const ring = keys.filter((k) => owner(k, servers) !== owner(k, after));
  const modulo = keys.filter((k) => k % servers.length !== k % after.length);
  return { ring, modulo };
}

/** 7 positions is 36 px of ring here: enough for two 34 px circles not to overlap. */
export const MIN_GAP = 7;

const CX = 145;
const CY = 100;
const R = 82;

function ringView(keys: number[], servers: number[], hl: number[] = [], label = 'the ring (0 at the top, clockwise)'): View {
  const at = (pos: number) => {
    const a = (pos / 100) * 2 * Math.PI - Math.PI / 2;
    return { x: Math.round(CX + R * Math.cos(a)), y: Math.round(CY + R * Math.sin(a)) };
  };
  const nodes = [
    ...servers.map((p, i) => ({ id: `s${p}`, label: `S${i + 1}`, ...at(p) })),
    ...keys.map((k) => ({ id: `k${k}`, label: String(k), ...at(k) })),
  ];
  const notes: Record<string, string> = {};
  for (const k of keys) notes[`k${k}`] = `→S${servers.indexOf(owner(k, servers)) + 1}`;
  return { type: 'graph', label, nodes, edges: [], highlight: hl.map((h) => (servers.includes(h) ? `s${h}` : `k${h}`)), notes };
}

export const consistentHashing: Program<RingInput> = {
  id: 'consistent-hashing',
  code,
  defaultInput: { keys: [3, 24, 34, 42, 58, 72, 88, 95], servers: [15, 50, 80], added: 65 },
  randomInput: (r) => {
    const pool = Array.from({ length: 100 }, (_, i) => i).sort(() => r() - 0.5);
    // Keep the circles apart on screen: at least MIN_GAP positions apart, also across the wrap.
    const picked: number[] = [];
    for (const p of pool) if (picked.every((q) => Math.abs(p - q) >= MIN_GAP && Math.abs(p - q) <= 100 - MIN_GAP)) picked.push(p);
    const servers = picked.slice(0, 3);
    const added = picked[3]!;
    const keys = picked.slice(4, 4 + randomInt(r, 6, 8));
    return { keys, servers, added };
  },
  describe: ({ keys, servers, added }) => `servers at ${servers.join(', ')}; keys ${keys.join(', ')}; add a server at ${added}`,
  reference: (input) => {
    const m = moves(input);
    return [m.ring, m.modulo];
  },
  run(input) {
    const { keys, servers, added } = input;
    const t = new Tracer();
    const m = moves(input);
    t.step(null, `${servers.length} servers and ${keys.length} keys share positions on a ring. Each key belongs to the first server clockwise from it.`, {}, [ringView(keys, servers)]);
    const sample = keys[Math.floor(keys.length / 2)]!;
    const ownerAsk = predict(
      `Key ${sample}: which ring position owns it? (servers at ${servers.join(', ')})`,
      owner(sample, servers),
      `The first server at or after ${sample} going clockwise is at ${owner(sample, servers)}${owner(sample, servers) < sample ? ' (wrapping past 99 back to the start)' : ''}.`,
      servers.filter((p) => p !== owner(sample, servers)).map((p) => ({ value: p, why: p < sample ? `${p} is before ${sample}; owners are found by going clockwise (upwards) from the key.` : `${p} is further on; the first server clockwise wins.` })),
      1,
    );
    t.step(5, `Every key goes to the next server clockwise. Key ${sample} → position ${owner(sample, servers)}.`, { key: sample, owner: owner(sample, servers) }, [ringView(keys, servers, [sample, owner(sample, servers)])], ownerAsk);
    const after = [...servers, added];
    const ringAsk = predict(
      `A new server joins at ${added}. How many of the ${keys.length} keys change owner?`,
      m.ring.length,
      `Only keys between ${added} and the server before it move, and they all move to the new server: ${m.ring.length ? m.ring.join(', ') : 'none here'}.`,
      [
        { value: keys.length, why: 'Keys far from the new server keep their owner: the ring only changes near it.' },
        { value: m.modulo.length, why: `That is how many move with "key % number of servers". The ring moves far fewer.` },
        { value: 0, why: m.ring.length ? `Some keys sit just before ${added}; the new server is now first clockwise for them.` : 'Close, but think about which keys sit just before the new server.' },
      ],
      2,
    );
    t.step(6, `Add a server at ${added}.`, { new_server: added }, [ringView(keys, after, [added])]);
    t.step(9, `${m.ring.length} key${m.ring.length === 1 ? '' : 's'} moved (${m.ring.join(', ') || 'none'}), all to the new server. The rest stay put.`, { moved: m.ring }, [ringView(keys, after, [added, ...m.ring])], ringAsk);
    const table: View = {
      type: 'table',
      label: `"key % ${servers.length}" versus "key % ${after.length}"`,
      columns: ['key', `% ${servers.length}`, `% ${after.length}`, 'moved?'],
      rows: keys.map((k) => [k, k % servers.length, k % after.length, k % servers.length !== k % after.length ? 'yes' : 'no']),
    };
    t.step(null, `Compare the simple way, server = key % number of servers: going from ${servers.length} to ${after.length} servers moves ${m.modulo.length} of ${keys.length} keys. Every moved key is data copied across the network.`, { moved_ring: m.ring.length, moved_modulo: m.modulo.length, result: [m.ring, m.modulo] }, [table]);
    return t.frames;
  },
};


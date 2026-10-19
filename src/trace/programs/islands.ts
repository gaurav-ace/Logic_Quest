import { predict, Tracer } from '../tools';
import type { Program, Value } from '../types';

// D26 "DFS and connected parts": count islands in a grid. Each time we step on unvisited land,
// that is a new island; a depth-first "sink" then marks all of it as visited.

const code = [
  'def islands(grid):',
  '    count = 0',
  '    for r, c in all_cells(grid):',
  '        if grid[r][c] == 1:',
  '            count += 1',
  '            sink(grid, r, c)',
  '    return count',
  'def sink(g, r, c):',
  '    if not land(g, r, c): return',
  '    g[r][c] = 0   # visited',
  '    for dr, dc in STEPS:',
  '        sink(g, r + dr, c + dc)',
];

const STEPS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Island count by breadth-first flood fill (a different method from the trace's DFS). */
export function countIslandsBfs(grid: number[][]): number {
  const g = grid.map((row) => [...row]);
  let count = 0;
  for (let r = 0; r < g.length; r++) {
    for (let c = 0; c < g[0]!.length; c++) {
      if (g[r]![c] !== 1) continue;
      count++;
      const q: [number, number][] = [[r, c]];
      g[r]![c] = 0;
      while (q.length) {
        const [y, x] = q.shift()!;
        for (const [dy, dx] of STEPS) {
          const ny = y + dy;
          const nx = x + dx;
          if (g[ny]?.[nx] === 1) {
            g[ny]![nx] = 0;
            q.push([ny, nx]);
          }
        }
      }
    }
  }
  return count;
}

const LETTERS = 'ABCDEFGHIJ';

export const islands: Program<number[][]> = {
  id: 'islands',
  code,
  defaultInput: [
    [1, 1, 0, 0, 1],
    [1, 0, 0, 1, 1],
    [0, 0, 1, 0, 0],
    [1, 0, 1, 1, 0],
  ],
  randomInput: (r) => Array.from({ length: 4 }, () => Array.from({ length: 5 }, () => (r() < 0.45 ? 1 : 0))),
  describe: (grid) => `a ${grid.length} × ${grid[0]!.length} map (■ land, · water)`,
  reference: (grid) => countIslandsBfs(grid),
  run(input) {
    const t = new Tracer();
    const g = input.map((row) => [...row]);
    const owner = input.map((row) => row.map((): string | null => null));
    const table = (cell?: [number, number]) => [
      {
        type: 'table' as const,
        label: 'map (letters: island found; ■ land not visited yet)',
        columns: ['', ...input[0]!.map((_, c) => String(c))],
        rows: input.map((row, r): Value[] => [String(r), ...row.map((v, c) => owner[r]![c] ?? (v === 1 ? '■' : '·'))]),
        ...(cell ? { highlightCell: [cell[0], cell[1] + 1] as [number, number] } : {}),
      },
    ];
    t.step(null, 'How many separate islands? Land touching up, down, left or right is the same island.', {}, table());
    let count = 0;
    let asked = 0;
    const sink = (r: number, c: number, name: string): number => {
      if (g[r]?.[c] !== 1) return 0;
      g[r]![c] = 0;
      owner[r]![c] = name;
      t.step(10, `(${r}, ${c}) is land: mark it as island ${name}, then try its four neighbours.`, { r, c, island: name }, table([r, c]));
      let size = 1;
      for (const [dr, dc] of STEPS) size += sink(r + dr, c + dc, name);
      return size;
    };
    for (let r = 0; r < g.length; r++) {
      for (let c = 0; c < g[0]!.length; c++) {
        if (g[r]![c] !== 1) continue;
        const name = LETTERS[count]!;
        const ask =
          asked < 2 && count >= 1
            ? (asked++,
              predict(
                `The scan reaches land at (${r}, ${c}) that no island has claimed. ${count} island${count === 1 ? '' : 's'} so far. What is count now?`,
                count + 1,
                'Unvisited land can only be a new island: every cell of the earlier islands was already marked.',
                [
                  { value: count, why: 'Earlier islands were sunk completely, so this land is not part of them.' },
                  { value: count + 2, why: 'One new piece of land starts exactly one new island.' },
                ],
                asked,
              ))
            : undefined;
        count++;
        t.step(5, `Unvisited land at (${r}, ${c}): island ${name}. count = ${count}.`, { r, c, count }, table([r, c]), ask);
        const size = sink(r, c, name);
        t.step(6, `Island ${name} is fully marked: ${size} cell${size === 1 ? '' : 's'}. Keep scanning.`, { count }, table());
      }
    }
    t.step(7, `Scan finished: ${count} island${count === 1 ? '' : 's'}. Each cell was visited once, so this is O(rows × columns).`, { result: count }, table());
    return t.frames;
  },
};

import { predict, randomInt, Tracer } from '../tools';
import type { Program, Value, View } from '../types';

// R3 "Ride-hailing": find drivers near a rider without measuring the distance to every driver.
// Drivers are bucketed into 1 km grid cells; with a search radius no bigger than a cell, every
// driver in range is in the rider's cell or one of its 8 neighbours.

export interface NearbyInput {
  drivers: [id: string, x: number, y: number][];
  rider: [number, number];
  /** km, at most one cell. */
  radius: number;
}

export const GRID = 6;

const code = [
  'CELL = 1  # km',
  '',
  'def cell(x, y):',
  '    return (int(x // CELL),',
  '            int(y // CELL))',
  '',
  'grid = {}',
  'for d in drivers:',
  '    c = cell(d.x, d.y)',
  '    grid.setdefault(c, [])',
  '    grid[c].append(d)',
  '',
  'def nearby(rx, ry, radius):',
  '    cx, cy = cell(rx, ry)',
  '    near = [(cx + i, cy + j)',
  '            for i in (-1, 0, 1)',
  '            for j in (-1, 0, 1)]',
  '    found, checked = [], 0',
  '    for c in near:',
  '        for d in grid.get(c, []):',
  '            checked += 1',
  '            dist = hypot(d.x - rx,',
  '                         d.y - ry)',
  '            if dist <= radius:',
  '                found.append(d.id)',
  '    return found, checked',
];

const cellOf = (x: number, y: number): [number, number] => [Math.floor(x), Math.floor(y)];

/** Reference: measure every driver (the slow way), and count the 9-cell neighbourhood separately. */
export function bruteForce({ drivers, rider, radius }: NearbyInput): [string[], number] {
  const found = drivers.filter(([, x, y]) => Math.hypot(x - rider[0], y - rider[1]) <= radius).map(([id]) => id).sort();
  const [cx, cy] = cellOf(...rider);
  const inNine = drivers.filter(([, x, y]) => Math.abs(Math.floor(x) - cx) <= 1 && Math.abs(Math.floor(y) - cy) <= 1).length;
  return [found, inNine];
}

const one = (r: () => number) => Math.round(r() * GRID * 10) / 10;
const clampCoord = (v: number) => Math.min(GRID - 0.1, Math.max(0, v));

export const nearby: Program<NearbyInput> = {
  id: 'nearby',
  code,
  // One driver next door but out of range (E), one in the rider's own cell (B).
  defaultInput: {
    drivers: [['A', 0.4, 0.5], ['B', 2.8, 3.1], ['C', 3.3, 2.6], ['D', 5.5, 5.2], ['E', 1.2, 4.6], ['F', 4.6, 1.4], ['G', 3.6, 3.9], ['H', 0.9, 5.7]],
    rider: [2.5, 3.5],
    radius: 1,
  },
  randomInput: (r) => {
    const n = randomInt(r, 7, 10);
    const drivers: [string, number, number][] = Array.from({ length: n }, (_, i) => [String.fromCharCode(65 + i), clampCoord(one(r)), clampCoord(one(r))]);
    return { drivers, rider: [clampCoord(Math.round((1 + r() * 4) * 10) / 10), clampCoord(Math.round((1 + r() * 4) * 10) / 10)], radius: 1 };
  },
  describe: ({ drivers, rider }) => `rider at (${rider.join(', ')}); drivers ${drivers.map(([id, x, y]) => `${id}(${x}, ${y})`).join(' ')}`,
  reference: (input) => bruteForce(input),
  run({ drivers, rider, radius }) {
    const t = new Tracer();
    const grid = new Map<string, [string, number, number][]>();
    for (const d of drivers) {
      const k = cellOf(d[1], d[2]).join(',');
      grid.set(k, [...(grid.get(k) ?? []), d]);
    }
    const [cx, cy] = cellOf(...rider);
    // Grid as a table: one row per y, one column per x; R marks the rider's cell.
    const rows: Value[][] = Array.from({ length: GRID }, (_, y) => [
      `y${y}`,
      ...Array.from({ length: GRID }, (_, x) => {
        const ids = (grid.get(`${x},${y}`) ?? []).map(([id]) => id).join(' ');
        return x === cx && y === cy ? `R ${ids}`.trim() : ids || '·';
      }),
    ]);
    const columns = ['', ...Array.from({ length: GRID }, (_, x) => `x${x}`)];
    const view = (cell?: [number, number]): View[] => [{ type: 'table', label: 'Grid (1 km cells; R = rider)', columns, rows, ...(cell ? { highlightCell: [cell[1], cell[0] + 1] as [number, number] } : {}) }];

    const near: [number, number][] = [];
    for (const i of [-1, 0, 1]) for (const j of [-1, 0, 1]) near.push([cx + i, cy + j]);
    const firstAsk = predict(
      `The rider is in cell (${cx}, ${cy}). How many cells does the search look in?`,
      9,
      'Its own cell and the 8 around it. With a radius of one cell, nobody in range can be further away than that.',
      [
        { value: 1, why: 'A driver just across a cell edge can be closer than one in the same cell.' },
        { value: GRID * GRID, why: 'That is every cell: the slow way the grid is meant to avoid.' },
      ],
      1,
    );
    t.step(11, `Every driver goes into the grid cell under it: ${drivers.length} drivers in ${grid.size} cells.`, { cell: [cx, cy] }, view(), undefined);
    t.step(15, `The rider is at (${rider.join(', ')}), in cell (${cx}, ${cy}). Search that cell and its neighbours.`, { cx, cy }, view([cx, cy]), firstAsk);

    const found: string[] = [];
    let checked = 0;
    let askedOut = false;
    for (const [x, y] of near) {
      const here = grid.get(`${x},${y}`) ?? [];
      if (!here.length) continue;
      for (const [id, dx, dy] of here) {
        checked++;
        const dist = Math.round(Math.hypot(dx - rider[0], dy - rider[1]) * 100) / 100;
        const ok = Math.hypot(dx - rider[0], dy - rider[1]) <= radius;
        if (ok) found.push(id);
        const ask =
          !ok && !askedOut
            ? ((askedOut = true),
              predict(
                `Driver ${id} is in a neighbouring cell, ${dist} km away. Is it in the results?`,
                'no',
                `${dist} km is more than the ${radius} km radius. Being in a nearby cell only means it's worth measuring.`,
                [{ value: 'yes', why: `Nearby cells hold candidates; each is still measured, and ${id} is too far.` }],
                10 + checked,
              ))
            : undefined;
        t.step(ok ? 25 : 24, `Cell (${x}, ${y}): driver ${id} is ${dist} km away, so ${ok ? 'it is a match' : 'it is out of range'}.`, { checked, found: [...found] }, view([x, y]), ask);
      }
    }
    found.sort();
    const sumAsk = predict(
      `How many drivers did the search measure, out of ${drivers.length}?`,
      checked,
      `Only the drivers in the 9 cells around the rider. Scanning every driver would measure all ${drivers.length}; with a million drivers, the grid still measures only the few nearby.`,
      [{ value: drivers.length, why: 'That is the full scan; the grid skips drivers in far-away cells.' }],
      99,
    );
    t.step(26, `Found ${found.length ? found.join(', ') : 'nobody'} within ${radius} km, after measuring ${checked} of ${drivers.length} drivers.`, { result: [found, checked] }, view([cx, cy]), sumAsk);
    return t.frames;
  },
};

import { predict, Tracer } from '../tools';
import type { Program } from '../types';

// L8 "Estimate before you build": back-of-the-envelope storage maths. Every number here is
// illustrative (CLAUDE.md section 5.4): the skill is the chain of multiplications and units.

export interface EstimateInput {
  users: number;
  photosEach: number;
  kbEach: number;
}

const underscores = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '_');

const code = ({ users, photosEach, kbEach }: EstimateInput) => [
  `users = ${underscores(users)}`,
  `photos_each = ${photosEach}`,
  `kb_each = ${kbEach}`,
  'total_kb = users * photos_each',
  '           * kb_each',
  'total_gb = total_kb / 1_000_000',
  'print(total_gb, "GB")',
];

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 3 });

export const estimate: Program<EstimateInput> = {
  id: 'estimate',
  code,
  defaultInput: { users: 1_000_000, photosEach: 3, kbEach: 200 },
  randomInput: (r) => ({
    users: [10_000, 100_000, 1_000_000, 10_000_000][Math.floor(r() * 4)]!,
    photosEach: 1 + Math.floor(r() * 5),
    kbEach: [100, 200, 500][Math.floor(r() * 3)]!,
  }),
  describe: ({ users, photosEach, kbEach }) => `${fmt(users)} users, ${photosEach} photos each, ${kbEach} KB a photo (illustrative)`,
  reference: ({ users, photosEach, kbEach }) => (users * photosEach * kbEach) / 1_000_000,
  run({ users, photosEach, kbEach }) {
    const t = new Tracer();
    const table = (rows: (string | number)[][]) => [{ type: 'table' as const, label: 'Working', columns: ['quantity', 'value'], rows }];
    const rows: (string | number)[][] = [];
    t.step(null, `How much storage do the profile photos of ${fmt(users)} users need? Estimate first, so you know whether it's one disk or a data centre. (All numbers are illustrative.)`, {}, table(rows));
    rows.push(['users', fmt(users)]);
    t.step(1, `${fmt(users)} users.`, { users }, table(rows));
    rows.push(['photos each', photosEach]);
    t.step(2, `Each keeps ${photosEach} photo${photosEach === 1 ? '' : 's'}.`, { users, photos_each: photosEach }, table(rows));
    rows.push(['KB per photo', kbEach]);
    t.step(3, `A compressed photo is about ${kbEach} KB.`, { users, photos_each: photosEach, kb_each: kbEach }, table(rows));
    const totalKb = users * photosEach * kbEach;
    const kbAsk = predict(
      `Roughly how many KB in total? (${fmt(users)} × ${photosEach} × ${kbEach})`,
      fmt(totalKb),
      `Multiply the three: ${fmt(users)} × ${photosEach} = ${fmt(users * photosEach)} photos, × ${kbEach} KB = ${fmt(totalKb)} KB. Count the zeros carefully.`,
      [
        { value: fmt(totalKb / 10), why: 'One zero too few. Multiply out the zeros from every number.' },
        { value: fmt(totalKb * 10), why: 'One zero too many. Recount the zeros.' },
        { value: fmt(users * kbEach), why: `That forgets that each user keeps ${photosEach} photos.` },
      ],
      1,
    );
    rows.push(['total KB', fmt(totalKb)]);
    t.step(5, `total_kb = ${fmt(users)} × ${photosEach} × ${kbEach} = ${fmt(totalKb)} KB.`, { total_kb: totalKb }, table(rows), kbAsk);
    const totalGb = totalKb / 1_000_000;
    const gbAsk = predict(
      'How many GB is that? (Using decimal units: 1 GB = 1,000,000 KB.)',
      fmt(totalGb),
      `KB → MB divides by 1,000, and MB → GB divides by 1,000 again: ${fmt(totalKb)} / 1,000,000 = ${fmt(totalGb)} GB.`,
      [
        { value: fmt(totalKb / 1000), why: 'Dividing by 1,000 once gives MB, not GB. Divide by 1,000 again.' },
        { value: fmt(totalKb / 1_000_000_000), why: 'That divides once too often: it is TB.' },
      ],
      2,
    );
    rows.push(['total GB', fmt(totalGb)]);
    t.step(6, `Convert units: ${fmt(totalKb)} KB / 1,000,000 = ${fmt(totalGb)} GB.`, { total_kb: totalKb, total_gb: totalGb }, table(rows), gbAsk);
    const verdict = totalGb < 1000 ? 'That fits on a single large disk, before backups and copies.' : 'That is terabytes: you would plan for many disks, plus copies for safety.';
    t.step(7, `About ${fmt(totalGb)} GB. ${verdict}`, { result: totalGb }, table(rows));
    return t.frames;
  },
};

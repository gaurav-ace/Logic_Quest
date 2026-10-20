import { arrowEnds, WORLD, type Board, type Shape } from './board';

// Drawing maths shared by the screen and the SVG export: how a label wraps inside its box, and a
// stand-alone SVG of a whole board. Text is escaped, so a label can never become markup.

export const FONT = 14;
export const LINE = 18;
/** Average width of one character at 14 px, used to decide where a label wraps. */
const CHAR = 7.6;
const PAD = 8;

/**
 * Splits a label into lines that fit the shape: at word boundaries where possible, cutting a
 * too-long word, and ending with "…" when the shape runs out of room.
 */
export function wrapLabel(text: string, s: Pick<Shape, 'width' | 'height'>): string[] {
  const perLine = Math.max(4, Math.floor((s.width - 2 * PAD) / CHAR));
  const maxLines = Math.max(1, Math.floor((s.height - 2 * PAD) / LINE));
  const lines: string[] = [];
  let line = '';
  for (let word of text.split(' ').filter(Boolean)) {
    while (word.length > perLine) {
      if (line) lines.push(line);
      lines.push(word.slice(0, perLine));
      word = word.slice(perLine);
      line = '';
    }
    if (!line) line = word;
    else if (line.length + 1 + word.length <= perLine) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const last = kept[maxLines - 1]!;
  kept[maxLines - 1] = `${last.slice(0, perLine - 1)}…`;
  return kept;
}

export const escapeXml = (s: string) => s.replace(/[<>&"']/g, (c) => `&${{ '<': 'lt', '>': 'gt', '&': 'amp', '"': 'quot', "'": 'apos' }[c]};`);

/** The whole board as a stand-alone SVG file (light colours, readable when printed). */
export function boardSvg(board: Board): string {
  const parts: string[] = [];
  for (const a of board.arrows) {
    const e = arrowEnds(board, a);
    if (!e) continue;
    parts.push(`<line x1="${e.x1}" y1="${e.y1}" x2="${e.x2}" y2="${e.y2}" stroke="#334" stroke-width="2" marker-end="url(#head)"/>`);
    if (a.label) parts.push(`<text x="${(e.x1 + e.x2) / 2}" y="${(e.y1 + e.y2) / 2 - 6}" text-anchor="middle" font-size="${FONT}" fill="#223" stroke="#fff" stroke-width="4" paint-order="stroke">${escapeXml(a.label)}</text>`);
  }
  for (const s of board.shapes) {
    const note = s.kind === 'note';
    parts.push(`<rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" rx="${note ? 2 : 10}" fill="${note ? '#fff4b8' : '#eef2ff'}" stroke="${note ? '#c9a800' : '#3b5bdb'}" stroke-width="2"/>`);
    const lines = wrapLabel(s.label, s);
    const top = note ? s.y + PAD + FONT : s.y + s.height / 2 - ((lines.length - 1) * LINE) / 2 + FONT / 3;
    lines.forEach((l, i) => {
      const x = note ? s.x + PAD : s.x + s.width / 2;
      parts.push(`<text x="${x}" y="${top + i * LINE}" text-anchor="${note ? 'start' : 'middle'}" font-size="${FONT}" fill="#112">${escapeXml(l)}</text>`);
    });
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WORLD.width} ${WORLD.height}" width="${WORLD.width}" height="${WORLD.height}" font-family="system-ui, sans-serif">`,
    `<title>${escapeXml(board.name)}</title>`,
    '<defs><marker id="head" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#334"/></marker></defs>',
    '<rect width="100%" height="100%" fill="#fff"/>',
    ...parts,
    '</svg>',
  ].join('\n');
}

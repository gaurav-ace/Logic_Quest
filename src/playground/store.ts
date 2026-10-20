import type { KeyValue } from '../progress/store';
import { emptyBoard, parseBoard, type Board } from './board';

// One learner's boards, under their profile's key. A board that can't be read is dropped from the
// list rather than breaking the page, and failing storage never throws.

export const BOARDS_MAX = 20;

export interface SavedBoard {
  id: string;
  board: Board;
}

interface Saved {
  current: string | null;
  boards: SavedBoard[];
}

export class BoardStore {
  constructor(
    private readonly kv: KeyValue | null,
    private readonly key: string,
  ) {}

  private read(): Saved {
    try {
      const raw = JSON.parse(this.kv?.getItem(this.key) ?? 'null') as Partial<Saved> | null;
      const boards = (Array.isArray(raw?.boards) ? raw.boards : []).flatMap((b): SavedBoard[] => {
        const parsed = parseBoard(b?.board);
        return typeof b?.id === 'string' && /^b[0-9]+$/.test(b.id) && parsed.ok ? [{ id: b.id, board: parsed.board }] : [];
      });
      const current = boards.some((b) => b.id === raw?.current) ? raw!.current! : (boards[0]?.id ?? null);
      return { current, boards };
    } catch {
      return { current: null, boards: [] };
    }
  }

  private write(saved: Saved): boolean {
    try {
      this.kv?.setItem(this.key, JSON.stringify(saved));
      return this.kv !== null;
    } catch {
      return false;
    }
  }

  list(): SavedBoard[] {
    return this.read().boards;
  }

  /** The board last worked on; on first use, a new empty one is made and saved. */
  current(): SavedBoard {
    const saved = this.read();
    const found = saved.boards.find((b) => b.id === saved.current);
    if (found) return found;
    return this.create();
  }

  select(id: string): void {
    const saved = this.read();
    if (saved.boards.some((b) => b.id === id)) this.write({ ...saved, current: id });
  }

  /** Makes a new board and switches to it; with BOARDS_MAX boards already, returns the current one. */
  create(board: Board = emptyBoard()): SavedBoard {
    const saved = this.read();
    if (saved.boards.length >= BOARDS_MAX) return saved.boards.find((b) => b.id === saved.current) ?? saved.boards[0]!;
    const n = saved.boards.reduce((m, b) => Math.max(m, Number(b.id.slice(1))), 0) + 1;
    const made = { id: `b${n}`, board };
    this.write({ current: made.id, boards: [...saved.boards, made] });
    return made;
  }

  /** False when the browser refused to save. */
  save(id: string, board: Board): boolean {
    const saved = this.read();
    const boards = saved.boards.some((b) => b.id === id) ? saved.boards.map((b) => (b.id === id ? { id, board } : b)) : [...saved.boards, { id, board }];
    return this.write({ current: id, boards });
  }

  /** Deletes a board; the next one (or a fresh board) becomes current. */
  remove(id: string): void {
    const saved = this.read();
    const boards = saved.boards.filter((b) => b.id !== id);
    this.write({ current: saved.current === id ? (boards[0]?.id ?? null) : saved.current, boards });
  }
}

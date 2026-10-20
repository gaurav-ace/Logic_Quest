import { describe, expect, it } from 'vitest';
import type { ProgressEvent } from '../rewards/events';
import type { PracticeItem } from './schema';
import { practiceStatus } from './status';

const q = { prompt: 'P', options: [{ text: 'a', explanation: 'e' }, { text: 'b', explanation: 'e' }], answer: 0 };
const item = (id: string, level: 'medium' | 'hard', questions = 2): PracticeItem =>
  ({ id, level, kind: 'quiz', track: 'logic', title: id, objective: 'o', sources: [{ title: 's' }], intro: 'i', questions: Array(questions).fill(q) }) as PracticeItem;
let n = 0;
const answer = (lesson: string, question: number, correct: boolean): ProgressEvent => ({
  id: `e${++n}`, type: 'answer', at: `2026-10-20T10:00:${String(n).padStart(2, '0')}Z`, day: '2026-10-20', lesson, question, option: 0, correct,
});

describe('practiceStatus', () => {
  const items = [item('m1', 'medium'), item('m2', 'medium', 1), item('h1', 'hard')];

  it('nothing done: hard items locked', () => {
    const s = practiceStatus(items, []);
    expect(s.get('m1')).toEqual({ solved: 0, total: 2, done: false, locked: false });
    expect(s.get('h1')!.locked).toBe(true);
  });

  it('a wrong answer does not count; a later right one does', () => {
    const s = practiceStatus(items, [answer('practice:m1', 0, false), answer('practice:m1', 0, true)]);
    expect(s.get('m1')!.solved).toBe(1);
  });

  it('lesson answers with the same number never count for practice', () => {
    expect(practiceStatus(items, [answer('m1', 0, true)]).get('m1')!.solved).toBe(0);
  });

  it('hard opens only when every medium item is fully done', () => {
    const partly = [answer('practice:m1', 0, true), answer('practice:m1', 1, true)];
    expect(practiceStatus(items, partly).get('h1')!.locked).toBe(true);
    const all = [...partly, answer('practice:m2', 0, true)];
    const s = practiceStatus(items, all);
    expect(s.get('m2')!.done).toBe(true);
    expect(s.get('h1')!.locked).toBe(false);
  });

  it('a track with only hard items has nothing to unlock first', () => {
    expect(practiceStatus([item('h1', 'hard')], []).get('h1')!.locked).toBe(false);
  });
});

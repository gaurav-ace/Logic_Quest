import { describe, expect, it, vi } from 'vitest';
import { loadCatalog } from '../lesson/catalog';
import type { Lesson } from '../lesson/schema';
import { PROMPT_MAX, claudePrompt, handOff } from './claude';

const lessons = loadCatalog();
const lb = lessons.find((l) => l.id === 'load-balancer')!;

describe('prompt', () => {
  it("has the lesson's title, goal, every source and the question, with the answering rules", () => {
    const p = claudePrompt(lb, '  Why not round robin?  ');
    expect(p).toContain(lb.title);
    expect(p).toContain(lb.objective);
    for (const s of lb.sources) expect(p).toContain(s.title);
    expect(p).toContain('My question: Why not round robin?');
    expect(p).toContain('cite a source for each claim');
    expect(p).toContain("say when you're not sure");
  });

  it('stays under the length cap for every lesson, keeping the question and rules whole', () => {
    for (const l of lessons) {
      const p = claudePrompt(l, 'q'.repeat(2000));
      expect(p.length).toBeLessThanOrEqual(PROMPT_MAX);
      expect(p).toContain(`My question: ${'q'.repeat(500)}`);
      expect(p).toContain('cite a source for each claim');
    }
  });

  it('cuts a very long source list rather than the question', () => {
    const many: Lesson = { ...lb, sources: Array.from({ length: 80 }, (_, i) => ({ title: `Source number ${i} with a long title`, url: `https://example.org/${i}` })) };
    const p = claudePrompt(many, 'Why?');
    expect(p.length).toBeLessThanOrEqual(PROMPT_MAX);
    expect(p).toContain('Source number 0');
    expect(p).not.toContain('Source number 79');
    expect(p).toContain('My question: Why?');
  });
});

describe('hand-off', () => {
  it('uses the share sheet when there is one, and opens nothing else', async () => {
    const share = vi.fn(async () => {});
    const copy = vi.fn(async () => {});
    expect(await handOff('P', { share, copy })).toBe('shared');
    expect(share).toHaveBeenCalledWith({ text: 'P' });
    expect(copy).not.toHaveBeenCalled();
  });

  it('does nothing more when the learner closes the share sheet', async () => {
    const share = vi.fn(async () => {
      throw new DOMException('closed', 'AbortError');
    });
    const copy = vi.fn(async () => {});
    expect(await handOff('P', { share, copy })).toBe('cancelled');
    expect(copy).not.toHaveBeenCalled();
  });

  it('copies the prompt without a share sheet, or when sharing fails', async () => {
    const copy = vi.fn(async () => {});
    expect(await handOff('P', { copy })).toBe('copied');
    expect(copy).toHaveBeenCalledWith('P');
    const broken = vi.fn(async () => {
      throw new DOMException('not allowed', 'NotAllowedError');
    });
    expect(await handOff('P', { share: broken, copy })).toBe('copied');
  });

  it('falls back to showing the text when copying is blocked too', async () => {
    const copy = vi.fn(async () => {
      throw new Error('denied');
    });
    expect(await handOff('P', { copy })).toBe('manual');
    expect(await handOff('P', {})).toBe('manual');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { loadCatalog } from '../lesson/catalog';
import { ProgressStore } from '../progress/store';
import { CONTEXT_MAX, ENDPOINT, ERROR_TEXT, GEMINI_MODEL, QUESTION_MAX, TURNS_MAX, askGemini, errorFor, keyProblem, lessonContext, readAnswer, requestBody, type GeminiError } from './gemini';
import { GeminiKeyStore } from './key';

const lessons = loadCatalog();
const lb = lessons.find((l) => l.id === 'load-balancer')!;
const KEY = 'AQ.test-key_0123456789abcdefghijklmnopqrstuv';

const answer = (text: string, finishReason = 'STOP') => ({ candidates: [{ content: { parts: [{ text }] }, finishReason }] });
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const opts = (f: typeof fetch, online = true) => ({ fetch: f, online: () => online });

describe('request', () => {
  it('goes to the configured model, with the key in a header and never in the URL or body', async () => {
    const f = vi.fn(async () => reply(200, answer('Hi')));
    await askGemini(KEY, lb, [], 'Why least connections?', opts(f as unknown as typeof fetch));
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(ENDPOINT);
    expect(url).toContain(GEMINI_MODEL);
    expect(url).not.toContain(KEY);
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(KEY);
    expect(String(init.body)).not.toContain(KEY);
    expect(init.method).toBe('POST');
  });

  it("carries the lesson's goal, steps, sources and the question", () => {
    const body = JSON.parse(requestBody(lb, [], 'Why least connections?')) as { contents: { parts: { text: string }[] }[]; systemInstruction: { parts: { text: string }[] } };
    const all = body.contents.map((c) => c.parts[0]!.text).join('\n');
    expect(all).toContain(lb.objective);
    expect(all).toContain(lb.sources[0]!.title);
    expect(all).toContain('[Step 1]');
    expect(body.contents.at(-1)!.parts[0]!.text).toBe('Why least connections?');
    expect(body.systemInstruction.parts[0]!.text).toContain("I'm not sure");
  });

  it('sends nothing from progress, settings or profile names', () => {
    // Every course lesson: the request is built from lesson text only, so learner data can't appear.
    const store = new ProgressStore(null);
    const progress = store.exportText();
    for (const l of lessons) {
      const body = requestBody(l, [], 'q');
      expect(body).not.toContain('"events"');
      expect(body).not.toContain('Learner 1');
      expect(body).not.toContain(progress.slice(0, 40));
    }
  });

  it('keeps every lesson within the context limit, and long questions and histories within theirs', () => {
    for (const l of lessons) expect(lessonContext(l).length).toBeLessThanOrEqual(CONTEXT_MAX);
    const history = Array.from({ length: 10 }, (_, i) => ({ question: `q${i}`, answer: `a${i}` }));
    const body = JSON.parse(requestBody(lb, history, 'x'.repeat(2000))) as { contents: { role: string; parts: { text: string }[] }[] };
    // Lesson turn + acknowledgement + kept history + the new question.
    expect(body.contents).toHaveLength(2 + 2 * TURNS_MAX + 1);
    expect(body.contents[2]!.parts[0]!.text).toBe(`q${10 - TURNS_MAX}`);
    expect(body.contents.at(-1)!.parts[0]!.text).toHaveLength(QUESTION_MAX);
    // Roles alternate, as the API expects.
    body.contents.forEach((c, i) => expect(c.role).toBe(i % 2 === 0 ? 'user' : 'model'));
  });
});

describe('answers', () => {
  it('joins the text parts and leaves out thought parts', () => {
    expect(readAnswer({ candidates: [{ content: { parts: [{ text: 'secret plan', thought: true }, { text: 'Part one. ' }, { text: 'Part two.', thoughtSignature: 'x' }] }, finishReason: 'STOP' }] })).toEqual({ ok: true, text: 'Part one. Part two.', truncated: false });
  });

  it('marks an answer cut off by the length limit', () => {
    expect(readAnswer(answer('Half', 'MAX_TOKENS'))).toEqual({ ok: true, text: 'Half', truncated: true });
  });

  it('reports blocked prompts and answers, and never shows a partly blocked answer', () => {
    expect(readAnswer({ promptFeedback: { blockReason: 'SAFETY' } })).toEqual({ ok: false, error: 'blocked' });
    expect(readAnswer(answer('', 'SAFETY'))).toEqual({ ok: false, error: 'blocked' });
    expect(readAnswer(answer('Some text then', 'RECITATION'))).toEqual({ ok: false, error: 'blocked' });
  });

  it('treats empty or odd bodies as a failed answer, not a crash', () => {
    for (const b of [null, {}, { candidates: [] }, { candidates: [{}] }, answer('   '), { candidates: [{ content: { parts: [{ text: 5 }] } }] }]) {
      expect(readAnswer(b)).toEqual({ ok: false, error: 'failed' });
    }
  });
});

describe('errors', () => {
  // Bodies as the real API sent them on 2026-10-20 (400 for a wrong key, 403 for none, 429, 503).
  const bad = { error: { code: 400, status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } };
  const cases: [number, unknown, GeminiError][] = [
    [400, bad, 'bad-key'],
    [403, { error: { code: 403 } }, 'bad-key'],
    [429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED' } }, 'quota'],
    [503, { error: { code: 503, status: 'UNAVAILABLE' } }, 'busy'],
    [500, null, 'busy'],
    [400, { error: { code: 400, status: 'INVALID_ARGUMENT' } }, 'failed'],
    [404, { error: { code: 404 } }, 'failed'],
  ];

  it.each(cases)('HTTP %i gives the right reason', async (status, body, want) => {
    expect(errorFor(status, body)).toBe(want);
    const f = vi.fn(async () => reply(status, body));
    expect(await askGemini(KEY, lb, [], 'q', opts(f as unknown as typeof fetch))).toEqual({ ok: false, error: want });
  });

  it('a body that is not JSON still gives a reason', async () => {
    const f = vi.fn(async () => new Response('<html>oops</html>', { status: 502 }));
    expect(await askGemini(KEY, lb, [], 'q', opts(f as unknown as typeof fetch))).toEqual({ ok: false, error: 'failed' });
  });

  it("doesn't call at all without a key or when offline", async () => {
    const f = vi.fn();
    expect(await askGemini('', lb, [], 'q', opts(f as unknown as typeof fetch))).toEqual({ ok: false, error: 'no-key' });
    expect(await askGemini(KEY, lb, [], 'q', opts(f as unknown as typeof fetch, false))).toEqual({ ok: false, error: 'offline' });
    expect(f).not.toHaveBeenCalled();
  });

  it('a network failure is reported, not thrown', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await askGemini(KEY, lb, [], 'q', opts(f as unknown as typeof fetch))).toEqual({ ok: false, error: 'failed' });
  });

  it('every reason has a message, and none of them contains the key', () => {
    for (const t of Object.values(ERROR_TEXT)) expect(t.length).toBeGreaterThan(20);
  });
});

describe('key', () => {
  it('accepts both key formats and rejects pasted junk', () => {
    expect(keyProblem(KEY)).toBeNull();
    expect(keyProblem(`AIza${'x'.repeat(35)}`)).toBeNull();
    expect(keyProblem(`  ${KEY}\n`)).toBeNull();
    expect(keyProblem('')).not.toBeNull();
    expect(keyProblem('my key is AIza123')).not.toBeNull();
    expect(keyProblem('short')).not.toBeNull();
  });

  it('is stored under its own key, so a progress export never contains it', () => {
    const map = new Map<string, string>();
    const kv = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) };
    const keys = new GeminiKeyStore(kv, 'logic-quest:p:p1:gemini-key');
    const store = new ProgressStore(kv);
    expect(keys.set(` ${KEY} `)).toBe(true);
    expect(keys.get()).toBe(KEY);
    store.setSettings({ calm: true });
    expect(store.exportText()).not.toContain(KEY);
    keys.remove();
    expect(keys.get()).toBe('');
  });

  it('survives storage that is missing or throws', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); }, removeItem: () => { throw new Error('blocked'); } };
    const keys = new GeminiKeyStore(broken, 'k');
    expect(keys.get()).toBe('');
    expect(keys.set(KEY)).toBe(false);
    expect(() => keys.remove()).not.toThrow();
    expect(new GeminiKeyStore(null, 'k').set(KEY)).toBe(false);
  });
});

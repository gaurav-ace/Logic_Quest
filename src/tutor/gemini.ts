import type { Lesson, Source } from '../lesson/schema';
import { lessonPassages } from './search';

// Tier 2 of the tutor (Phase 6b, plan section 3.6): a Gemini chat on the learner's own free-tier
// key. Pure request building and response reading, so every case is tested with mocked fetch.
//
// Checked with the owner's key on 2026-10-20 (task 6b.20):
// - The endpoint answers browser calls from the site's origin (CORS preflight allows
//   content-type and x-goog-api-key), so a plain fetch works and the key stays out of the URL.
// - New keys can no longer use gemini-2.5-flash or 2.5-flash-lite (404 "no longer available to
//   new users"), the only models whose free tier included Google Search grounding. Newer models
//   have search "Not available" on the free tier (pricing page; a call with it got 429). So the
//   answer is grounded in the lesson's own text only, and the sources shown are the lesson's.
// - Follow-up turns work when the model's earlier answer is sent back as plain text.

/** One config value, so it can follow Google's free tier. Worked on 2026-10-20 with a new key. */
export const GEMINI_MODEL = 'gemini-3.5-flash-lite';
export const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
export const QUESTION_MAX = 500;
/** Characters of lesson text sent with each question: enough for any lesson's teaching text. */
export const CONTEXT_MAX = 12000;
/** Earlier turns kept in a conversation (question plus answer each). */
export const TURNS_MAX = 6;

export interface Turn {
  question: string;
  answer: string;
}

export type GeminiError = 'no-key' | 'offline' | 'bad-key' | 'quota' | 'busy' | 'blocked' | 'failed';

export type GeminiResult = { ok: true; text: string; truncated: boolean } | { ok: false; error: GeminiError };

export const SYSTEM_INSTRUCTION = [
  'You are a patient tutor inside Logic Quest, a learning app for logical thinking, algorithms, system design and agentic AI.',
  'The learner is a motivated beginner-to-intermediate programmer. Use plain words first, then the precise term, one idea at a time.',
  'Answer from the lesson text given below. You may add widely accepted facts from official documentation or well-known references, but say clearly when you go beyond the lesson.',
  "If you are not sure, say \"I'm not sure\" and point the learner to the lesson's sources. Never invent numbers, versions, APIs or quotes.",
  'Keep answers short: at most about 150 words. Plain text only, no Markdown headings or tables.',
].join(' ');

/** The lesson's teaching text, labelled, cut to CONTEXT_MAX. Only course text: never progress or names. */
export function lessonContext(lesson: Lesson): string {
  const head = [`Lesson: ${lesson.title}`, `Sources: ${lesson.sources.map(sourceLine).join('; ')}`];
  const body = lessonPassages(lesson).map((p) => `[${p.where}] ${p.text}`);
  let out = head.join('\n');
  for (const line of body) {
    if (out.length + line.length + 1 > CONTEXT_MAX) break;
    out += `\n${line}`;
  }
  return out;
}

const sourceLine = (s: Source) => (s.url ? `${s.title} (${s.url})` : s.title);

/** The request body. The key is not in it: it goes in the x-goog-api-key header. */
export function requestBody(lesson: Lesson, history: Turn[], question: string): string {
  const contents = [
    { role: 'user', parts: [{ text: `Here is the lesson the learner is on.\n\n${lessonContext(lesson)}` }] },
    { role: 'model', parts: [{ text: 'Understood. I will answer from this lesson.' }] },
  ];
  for (const t of history.slice(-TURNS_MAX)) {
    contents.push({ role: 'user', parts: [{ text: t.question }] }, { role: 'model', parts: [{ text: t.answer }] });
  }
  contents.push({ role: 'user', parts: [{ text: question.slice(0, QUESTION_MAX) }] });
  return JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] }, contents });
}

/** Maps an HTTP status and error body to the reason shown to the learner. */
export function errorFor(status: number, body: unknown): GeminiError {
  const reason = JSON.stringify((body as { error?: unknown } | null)?.error ?? '');
  if (status === 400 && reason.includes('API_KEY_INVALID')) return 'bad-key';
  if (status === 401 || status === 403) return 'bad-key';
  if (status === 429) return 'quota';
  if (status === 503 || status === 500 || status === 504) return 'busy';
  return 'failed';
}

const BLOCKED = new Set(['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'LANGUAGE']);

/** Reads a 200 response: the answer text without the model's thought parts, or why there is none. */
export function readAnswer(body: unknown): GeminiResult {
  const b = body as { promptFeedback?: { blockReason?: string }; candidates?: { finishReason?: string; content?: { parts?: { text?: unknown; thought?: boolean }[] } }[] } | null;
  if (b?.promptFeedback?.blockReason) return { ok: false, error: 'blocked' };
  const c = b?.candidates?.[0];
  if (!c) return { ok: false, error: 'failed' };
  const text = (c.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text as string)
    .join('')
    .trim();
  if (!text) return { ok: false, error: c.finishReason && BLOCKED.has(c.finishReason) ? 'blocked' : 'failed' };
  if (c.finishReason && BLOCKED.has(c.finishReason)) return { ok: false, error: 'blocked' };
  return { ok: true, text, truncated: c.finishReason === 'MAX_TOKENS' };
}

export interface AskOptions {
  fetch: typeof fetch;
  online: () => boolean;
}

export async function askGemini(key: string, lesson: Lesson, history: Turn[], question: string, opts: AskOptions): Promise<GeminiResult> {
  if (!key) return { ok: false, error: 'no-key' };
  if (!opts.online()) return { ok: false, error: 'offline' };
  let res: Response;
  try {
    res = await opts.fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: requestBody(lesson, history, question),
    });
  } catch {
    // fetch rejects only when the request never got an answer: no connection, or blocked.
    return { ok: false, error: opts.online() ? 'failed' : 'offline' };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // A body that isn't JSON is treated as having no details.
  }
  return res.ok ? readAnswer(body) : { ok: false, error: errorFor(res.status, body) };
}

/** What the learner reads for each failure. Each one is followed by the "Ask Claude" fallback. */
export const ERROR_TEXT: Record<GeminiError, string> = {
  'no-key': 'Gemini is not set up. Add your own free Gemini API key in Settings → AI tutor.',
  offline: "You're offline, so Gemini can't be reached. The suggested questions and search above still work.",
  'bad-key': 'Gemini did not accept the API key. Check it in Settings → AI tutor, or create a new one in Google AI Studio.',
  quota: "Gemini's free limit for your key has been reached. Try again later (the daily limit resets each day).",
  busy: 'Gemini is busy or down right now. Try again in a minute.',
  blocked: 'Gemini stopped before answering that question (its content filters). Try asking it another way.',
  failed: "Gemini didn't give an answer. Try again in a minute.",
};

/** A plausible key. Only a format check, so a typo or stray space is caught early; Google decides.
 * Keys come in more than one format (the owner's 2026 key has dots), so stay loose. */
export function keyProblem(key: string): string | null {
  const k = key.trim();
  if (!k) return 'Paste your key first.';
  if (!/^[A-Za-z0-9._-]{30,200}$/.test(k)) return "That doesn't look like a Gemini API key (letters, numbers, dots, - and _ only, no spaces).";
  return null;
}

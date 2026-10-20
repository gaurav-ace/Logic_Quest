import type { Lesson } from '../lesson/schema';
import { QUESTION_MAX } from './gemini';

// Tier 3 of the tutor (Phase 6b, plan section 3.6): hand the question to the Claude app or
// claude.ai, on the learner's own plan. The app can't call Claude itself (the API is billed
// separately from Pro), so it writes a prompt and passes it over. Nothing is stored or sent by
// the app. A link that pre-fills claude.ai was not checked to work, so it isn't used: the prompt
// is shared (Android share sheet) or copied, and the learner pastes it.

export const CLAUDE_URL = 'https://claude.ai/new';
/** Long enough for the lesson's goal, sources and a question; short enough to paste comfortably. */
export const PROMPT_MAX = 3000;

/** The prompt: lesson context, its sources and the question. No progress, names or other personal data. */
export function claudePrompt(lesson: Lesson, question: string): string {
  const sources = lesson.sources.map((s) => `- ${s.title}${s.url ? ` (${s.url})` : ''}`);
  const parts = [
    `I'm learning with an app called Logic Quest. I'm on the lesson "${lesson.title}".`,
    `The lesson's goal: ${lesson.objective}`,
    ...(lesson.simplifies ? [`What the lesson simplifies: ${clip(lesson.simplifies, 600)}`] : []),
    `The lesson's sources:\n${sources.join('\n')}`,
    `My question: ${question.trim().slice(0, QUESTION_MAX)}`,
    "Please answer for a motivated beginner-to-intermediate programmer: plain words first, then the precise term, one idea at a time. Prefer the sources above and official documentation, cite a source for each claim, and say when you're not sure rather than guess.",
  ];
  let text = parts.join('\n\n');
  if (text.length > PROMPT_MAX) {
    // Only the sources can be long; keep the question and instructions whole.
    const fixed = parts.filter((_, i) => i !== parts.length - 3).join('\n\n');
    const room = Math.max(0, PROMPT_MAX - fixed.length - 40);
    parts[parts.length - 3] = `The lesson's sources:\n${sources.join('\n').slice(0, room)}…`;
    text = parts.join('\n\n');
  }
  return text;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export interface HandoffEnv {
  share?: (data: { text: string }) => Promise<void>;
  copy?: (text: string) => Promise<void>;
}

/** What happened, so the panel can say it in plain words. */
export type HandoffResult = 'shared' | 'copied' | 'cancelled' | 'manual';

/**
 * Share sheet first (on Android the learner picks the Claude app). If there isn't one, copy the
 * prompt; the panel then shows an "Open Claude" link, a real tap, since opening a tab after an
 * await can be blocked as a pop-up. If copying is blocked too, 'manual': the panel shows the text.
 */
export async function handOff(prompt: string, env: HandoffEnv): Promise<HandoffResult> {
  if (env.share) {
    try {
      await env.share({ text: prompt });
      return 'shared';
    } catch (e) {
      // The learner closed the sheet: do nothing more. Other errors fall through to copy.
      if ((e as { name?: string } | null)?.name === 'AbortError') return 'cancelled';
    }
  }
  if (env.copy) {
    try {
      await env.copy(prompt);
      return 'copied';
    } catch {
      // Clipboard blocked: fall through.
    }
  }
  return 'manual';
}

import type { Lesson, QuizQuestion, Source } from '../lesson/schema';
import { STAGE_TITLE, practiceKey, type PracticeItem } from '../practice/schema';
import type { ReviewState } from './schedule';

// What a scheduled question turns into on the review screen. Multiple-choice questions that
// stand on their own are asked again right there. Exercises that need their diagram or code
// (improve the design, critique, debug, guided steps) are listed as "redo it in the lesson":
// answering them there records the same answer ids, so they move through the boxes too.

/** Question numbers of the lesson exercises (see render/design.ts and render/critique.ts). */
const EXERCISES: Record<number, string> = {
  300: 'Improve the design: spot the problem',
  301: 'Improve the design: pick the fix',
  310: 'Critique the design: spot the flaw',
  311: 'Critique the design: what fails first',
};

export type ReviewTarget =
  | { kind: 'ask'; state: ReviewState; from: string; href: string; intro?: string; question: QuizQuestion; sources: Source[] }
  | { kind: 'redo'; state: ReviewState; from: string; href: string; what: string };

export interface ReviewLookup {
  lesson(id: string): Lesson | undefined;
  /** Practice items by id, or undefined while the practice files aren't loaded. */
  practice?: (id: string) => PracticeItem | undefined;
  lessonHref(id: string): string;
  practiceHref(item: PracticeItem): string;
}

/**
 * The review target for a scheduled question, or null when it no longer exists (a lesson or
 * question removed since) or can't be judged yet (practice not loaded). Question numbers are
 * positions: if a lesson's quiz is edited, an old miss can point at a question that changed.
 * That only ever asks a real question from the same lesson, so it is accepted.
 */
export function reviewTarget(state: ReviewState, look: ReviewLookup): ReviewTarget | null {
  const prefix = practiceKey('');
  if (state.lesson.startsWith(prefix)) {
    const item = look.practice?.(state.lesson.slice(prefix.length));
    if (!item) return null;
    const from = `Practice: ${item.title}`;
    const href = look.practiceHref(item);
    if (item.kind === 'quiz') {
      const question = item.questions[state.question];
      return question ? { kind: 'ask', state, from, href, intro: item.intro, question, sources: item.sources } : null;
    }
    if (item.kind === 'debug') {
      const what = ['Find the buggy line', 'Predict the output', 'Pick the fix'][state.question];
      return what ? { kind: 'redo', state, from, href, what } : null;
    }
    const step = item.steps[state.question];
    return step?.check ? { kind: 'redo', state, from, href, what: `Step ${state.question + 1}: ${STAGE_TITLE[step.stage]}` } : null;
  }
  const lesson = look.lesson(state.lesson);
  if (!lesson) return null;
  const href = look.lessonHref(lesson.id);
  const question = lesson.quiz[state.question];
  if (question) return { kind: 'ask', state, from: lesson.title, href, question, sources: lesson.sources };
  const what = EXERCISES[state.question];
  return what ? { kind: 'redo', state, from: lesson.title, href, what } : null;
}

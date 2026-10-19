import type { Lesson } from '../lesson/schema';
import type { BadgeDef, RewardsConfig } from '../rewards/config';
import { localDay } from '../rewards/days';
import { answerOutcome, computeProgress, whatsNew, type AnswerOutcome, type LessonInfo, type Progress } from '../rewards/engine';
import { newId, type AnswerEvent, type ProgressEvent } from '../rewards/events';
import type { ProgressStore } from './store';

/** What the learner is told right after an action. */
export interface Feedback {
  outcome: AnswerOutcome | 'complete';
  xp: number;
  levelUp: boolean;
  badges: BadgeDef[];
  /** One plain line, e.g. "+10 XP, first try". */
  text: string;
}

const OUTCOME_TEXT: Record<AnswerOutcome, string> = {
  'first-try': 'first try',
  retry: 'after a retry',
  'already-scored': 'Already scored. Replays still count towards today’s goal.',
  wrong: '',
};

// Glue between the store (what happened) and the engine (what it's worth). Badge events are
// written the moment a badge is earned, so it is never taken away later.
export class Tracker {
  constructor(
    private readonly store: ProgressStore,
    private readonly lessons: LessonInfo[],
    private readonly config: RewardsConfig,
    private readonly now: () => Date = () => new Date(),
  ) {}

  static lessonInfo(lessons: Lesson[]): LessonInfo[] {
    return lessons.map((l) => ({ id: l.id, track: l.track, level: l.level }));
  }

  progress(): Progress {
    return computeProgress(this.store.events, this.lessons, this.config, localDay(this.now()));
  }

  answer(lesson: string, question: number, option: number, correct: boolean): Feedback {
    const event: AnswerEvent = { ...this.stamp(), type: 'answer', lesson, question, option, correct };
    const outcome = answerOutcome(this.store.events, event);
    const result = this.record(event);
    const text = outcome === 'first-try' || outcome === 'retry' ? `+${result.xp} XP, ${OUTCOME_TEXT[outcome]}` : OUTCOME_TEXT[outcome];
    return { ...result, outcome, text };
  }

  complete(lesson: string): Feedback {
    const result = this.record({ ...this.stamp(), type: 'complete', lesson });
    const p = this.progress();
    const goal = p.doneToday >= p.goalToday ? ' Today’s goal is done.' : '';
    const text = result.xp > 0 ? `Lesson complete: +${result.xp} XP.${goal}` : `Lesson complete.${goal}`;
    return { ...result, outcome: 'complete', text };
  }

  setDailyGoal(goal: number): void {
    const { min, max } = this.config.dailyGoal;
    if (!Number.isInteger(goal) || goal < min || goal > max) throw new Error(`Daily goal must be ${min} to ${max}`);
    this.store.add({ ...this.stamp(), type: 'goal', goal });
  }

  private record(event: ProgressEvent) {
    const before = this.progress();
    this.store.add(event);
    const after = this.progress();
    const change = whatsNew(before, after);
    const day = localDay(this.now());
    this.store.add(...change.badges.map((badge): ProgressEvent => ({ ...this.stamp(), type: 'badge', badge, day })));
    const badges = change.badges.map((id) => this.config.badges.find((b) => b.id === id)!).filter(Boolean);
    return { xp: change.xp, levelUp: change.levelUp, badges };
  }

  private stamp() {
    const at = this.now();
    return { id: newId(), at: at.toISOString(), day: localDay(at) };
  }
}

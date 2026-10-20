import type { Level, Track } from '../lesson/schema';
import type { BadgeDef, RewardsConfig } from './config';
import { addDays, daysBetween, type Day } from './days';
import { sortEvents, type AnswerEvent, type ProgressEvent } from './events';

// Every score is a pure function of the event log (see docs/PHASE2_PLAN.md). XP only comes from
// understanding and never goes down; coins carry the streak's stakes.

export interface LessonInfo {
  id: string;
  track: Track;
  level: Level;
}

/** How a day ended, for the streak. "pending" is today, still in progress. */
export type DayStatus = 'met' | 'buffer' | 'broken' | 'missed' | 'pending';

export interface Progress {
  xp: number;
  level: number;
  /** XP where the current level starts, and where the next one starts (null at the top level). */
  levelFrom: number;
  levelTo: number | null;
  coins: number;
  streak: number;
  bestStreak: number;
  goalToday: number;
  doneToday: number;
  /** Yesterday used the buffer: missing today breaks the streak. */
  bufferUsedYesterday: boolean;
  days: Map<Day, DayStatus>;
  completed: Set<string>;
  badges: Map<string, Day>;
}

const qKey = (lesson: string, question: number) => `${lesson}#${question}`;

export type AnswerOutcome = 'first-try' | 'retry' | 'already-scored' | 'wrong';

/** What an answer is worth, given everything recorded before it. */
export function answerOutcome(before: ProgressEvent[], answer: AnswerEvent): AnswerOutcome {
  if (!answer.correct) return 'wrong';
  let triedBefore = false;
  for (const e of before) {
    if (e.type !== 'answer' || e.lesson !== answer.lesson || e.question !== answer.question || e.id === answer.id) continue;
    if (e.correct) return 'already-scored';
    triedBefore = true;
  }
  return triedBefore ? 'retry' : 'first-try';
}

export function computeProgress(events: ProgressEvent[], lessons: LessonInfo[], config: RewardsConfig, today: Day): Progress {
  const log = sortEvents(events);
  const lessonById = new Map(lessons.map((l) => [l.id, l]));

  // XP: each question scores once, at its first correct answer (anti-farming).
  let xp = 0;
  const firstCorrect = new Set<string>();
  const triedWrong = new Set<string>();
  const firstWrongDay = new Map<string, Day>();
  const completedOn = new Map<string, Day>();
  const fixedMistakes: Day[] = [];
  for (const e of log) {
    if (e.type === 'answer') {
      const k = qKey(e.lesson, e.question);
      if (firstCorrect.has(k)) continue;
      if (!e.correct) {
        triedWrong.add(k);
        if (!firstWrongDay.has(k)) firstWrongDay.set(k, e.day);
        continue;
      }
      firstCorrect.add(k);
      xp += triedWrong.has(k) ? config.xp.afterRetry : config.xp.firstTry;
      // A mistake counts as fixed when it is put right on a later day, not by the next tap.
      const wrongDay = firstWrongDay.get(k);
      if (wrongDay !== undefined && daysBetween(wrongDay, e.day) > 0) fixedMistakes.push(e.day);
    } else if (e.type === 'complete' && !completedOn.has(e.lesson)) {
      completedOn.set(e.lesson, e.day);
      xp += config.xp.lessonComplete;
    }
  }

  const levelIndex = config.levels.reduce((best, need, i) => (xp >= need ? i : best), 0);
  const streakInfo = walkDays(log, config, today);

  return {
    xp,
    level: levelIndex + 1,
    levelFrom: config.levels[levelIndex]!,
    levelTo: config.levels[levelIndex + 1] ?? null,
    ...streakInfo,
    completed: new Set(completedOn.keys()),
    badges: earnedBadges(log, config.badges, lessons, lessonById, completedOn, fixedMistakes, streakInfo.streakReached),
  };
}

function goalOn(goals: { day: Day; goal: number }[], day: Day, fallback: number): number {
  let goal = fallback;
  for (const g of goals) if (g.day <= day) goal = g.goal;
  return goal;
}

function walkDays(log: ProgressEvent[], config: RewardsConfig, todayIn: Day) {
  const goals = log.filter((e) => e.type === 'goal').map((e) => ({ day: e.day, goal: e.goal }));
  // Distinct lessons finished per day: replays count towards the goal, the same lesson twice does
  // not. Each finished review session counts as one more (Phase 7).
  const finished = new Map<Day, Set<string>>();
  for (const e of log) {
    if (e.type !== 'complete' && e.type !== 'review') continue;
    if (!finished.has(e.day)) finished.set(e.day, new Set());
    finished.get(e.day)!.add(e.type === 'complete' ? e.lesson : `review:${e.id}`);
  }
  const activity = log.filter((e) => e.type === 'answer' || e.type === 'complete' || e.type === 'review').map((e) => e.day);
  // If the clock moved backwards, "today" is never earlier than the last recorded day.
  const today = activity.reduce((max, d) => (d > max ? d : max), todayIn);
  const met = (day: Day) => (finished.get(day)?.size ?? 0) >= goalOn(goals, day, config.dailyGoal.default);

  const days = new Map<Day, DayStatus>();
  const streakReached = new Map<number, Day>();
  let streak = 0;
  let best = 0;
  let coins = 0;
  let missRun = 0;
  const start = activity.reduce<Day | null>((min, d) => (min === null || d < min ? d : min), null);

  for (let day = start ?? today; start !== null && day <= today; day = addDays(day, 1)) {
    if (met(day)) {
      streak++;
      best = Math.max(best, streak);
      coins += config.coins.perGoalDay;
      missRun = 0;
      days.set(day, 'met');
      if (!streakReached.has(streak)) streakReached.set(streak, day);
    } else if (day === today) {
      days.set(day, 'pending'); // today isn't over: never counted as missed
    } else if (streak > 0 && missRun === 0) {
      missRun = 1;
      coins = Math.max(0, coins - config.coins.bufferCost);
      days.set(day, 'buffer');
    } else if (streak > 0) {
      missRun = 2;
      coins = Math.max(0, coins - config.coins.breakCost);
      streak = 0;
      days.set(day, 'broken');
    } else {
      days.set(day, 'missed');
    }
  }

  return {
    coins,
    streak,
    bestStreak: best,
    goalToday: goalOn(goals, today, config.dailyGoal.default),
    doneToday: finished.get(today)?.size ?? 0,
    bufferUsedYesterday: days.get(addDays(today, -1)) === 'buffer',
    days,
    streakReached,
  };
}

function earnedBadges(
  log: ProgressEvent[],
  defs: BadgeDef[],
  lessons: LessonInfo[],
  lessonById: Map<string, LessonInfo>,
  completedOn: Map<string, Day>,
  fixedMistakes: Day[],
  streakReached: Map<number, Day>,
): Map<string, Day> {
  const earned = new Map<string, Day>();
  // Badges already recorded are kept for good, even if their rule would no longer hold.
  for (const e of log) if (e.type === 'badge' && !earned.has(e.badge)) earned.set(e.badge, e.day);

  const completionDays = [...completedOn.values()].sort();
  const hardDays = [...completedOn].filter(([id]) => lessonById.get(id)?.level === 'hard').map(([, d]) => d).sort();
  const nth = (list: Day[], n: number) => list[n - 1];

  for (const def of defs) {
    if (earned.has(def.id)) continue;
    const r = def.rule;
    let day: Day | undefined;
    if (r.type === 'lessons') day = nth(completionDays, r.count);
    else if (r.type === 'hardLessons') day = nth(hardDays, r.count);
    else if (r.type === 'mistakesFixed') day = nth(fixedMistakes, r.count);
    else if (r.type === 'streak') day = [...streakReached].filter(([n]) => n >= r.days).map(([, d]) => d).sort()[0];
    else {
      // A track with no lessons yet can't be "finished".
      const inTrack = lessons.filter((l) => l.track === r.track);
      if (inTrack.length && inTrack.every((l) => completedOn.has(l.id))) day = inTrack.map((l) => completedOn.get(l.id)!).sort().at(-1);
    }
    if (day !== undefined) earned.set(def.id, day);
  }
  return earned;
}

/** What changed between two progress snapshots, for feedback right after an answer. */
export function whatsNew(before: Progress, after: Progress) {
  return {
    xp: after.xp - before.xp,
    levelUp: after.level > before.level,
    badges: [...after.badges.keys()].filter((id) => !before.badges.has(id)),
  };
}

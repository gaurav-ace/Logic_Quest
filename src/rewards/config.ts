import { TRACKS, type Track } from '../lesson/schema';
import raw from './rewards.config.json';

// All reward numbers live in rewards.config.json (CLAUDE.md section 7). This file only checks
// that the config makes sense, so a bad edit fails loudly at load time.

export type BadgeRule =
  | { type: 'lessons'; count: number }
  | { type: 'mistakesFixed'; count: number }
  | { type: 'hardLessons'; count: number }
  | { type: 'streak'; days: number }
  | { type: 'track'; track: Track };

export interface BadgeDef {
  id: string;
  title: string;
  description: string;
  rule: BadgeRule;
}

export interface RewardsConfig {
  version: 1;
  xp: { firstTry: number; afterRetry: number; lessonComplete: number };
  /** XP needed for each level; levels[0] is level 1 and must be 0. */
  levels: number[];
  dailyGoal: { default: number; min: number; max: number };
  /**
   * Spaced review of missed questions (Phase 7). intervals: days to wait in each box, shortest
   * first; a right answer after the last box means mastered. sessionMax: questions per session.
   * goalReviews: a finished session of this many (or all that were due, if fewer) counts as one
   * lesson towards the daily goal.
   */
  review: { intervals: number[]; sessionMax: number; goalReviews: number };
  coins: { perGoalDay: number; bufferCost: number; breakCost: number };
  badges: BadgeDef[];
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

export function validateConfig(data: unknown): RewardsConfig {
  const problems: string[] = [];
  const bad = (path: string, msg: string) => problems.push(`${path}: ${msg}`);
  const c = (typeof data === 'object' && data !== null ? data : {}) as Record<string, Record<string, unknown> | unknown>;
  const obj = (k: string) => (typeof c[k] === 'object' && c[k] !== null ? (c[k] as Record<string, unknown>) : {});

  if (c.version !== 1) bad('version', 'must be 1');
  const xp = obj('xp');
  for (const k of ['firstTry', 'afterRetry', 'lessonComplete']) if (!isCount(xp[k])) bad(`xp.${k}`, 'must be a whole number >= 0');
  if (isCount(xp.firstTry) && isCount(xp.afterRetry) && xp.afterRetry > xp.firstTry) {
    bad('xp.afterRetry', 'must not be more than xp.firstTry (first try earns the most)');
  }
  const coins = obj('coins');
  for (const k of ['perGoalDay', 'bufferCost', 'breakCost']) if (!isCount(coins[k])) bad(`coins.${k}`, 'must be a whole number >= 0');

  const levels = c.levels;
  if (!Array.isArray(levels) || levels.length < 2 || levels[0] !== 0) bad('levels', 'must be a list starting at 0 with at least 2 levels');
  else if (!levels.every((v, i) => isCount(v) && (i === 0 || v > (levels[i - 1] as number)))) bad('levels', 'must be whole numbers in increasing order');

  const goal = obj('dailyGoal');
  if (!isCount(goal.min) || !isCount(goal.max) || !isCount(goal.default) || goal.min < 1 || goal.min > goal.max || goal.default < goal.min || goal.default > goal.max) {
    bad('dailyGoal', 'needs 1 <= min <= default <= max');
  }

  const review = obj('review');
  const iv = review.intervals;
  if (!Array.isArray(iv) || iv.length < 1 || !iv.every((v, i) => isCount(v) && v >= 1 && (i === 0 || v > (iv[i - 1] as number)))) {
    bad('review.intervals', 'must be whole numbers of days >= 1, in increasing order');
  }
  for (const k of ['sessionMax', 'goalReviews']) if (!isCount(review[k]) || (review[k] as number) < 1) bad(`review.${k}`, 'must be a whole number >= 1');

  const ids = new Set<string>();
  const badges = Array.isArray(c.badges) ? c.badges : (bad('badges', 'must be a list'), []);
  badges.forEach((b: unknown, i) => {
    const p = `badges[${i}]`;
    const badge = (typeof b === 'object' && b !== null ? b : {}) as Record<string, unknown>;
    if (!isText(badge.id)) bad(`${p}.id`, 'must be non-empty text');
    else if (ids.has(badge.id)) bad(`${p}.id`, `duplicate badge id "${badge.id}"`);
    else ids.add(badge.id);
    if (!isText(badge.title) || !isText(badge.description)) bad(p, 'needs a title and a description');
    const rule = (typeof badge.rule === 'object' && badge.rule !== null ? badge.rule : {}) as Record<string, unknown>;
    switch (rule.type) {
      case 'lessons':
      case 'mistakesFixed':
      case 'hardLessons':
        if (!isCount(rule.count) || rule.count < 1) bad(`${p}.rule.count`, 'must be a whole number >= 1');
        break;
      case 'streak':
        if (!isCount(rule.days) || rule.days < 1) bad(`${p}.rule.days`, 'must be a whole number >= 1');
        break;
      case 'track':
        if (!TRACKS.includes(rule.track as Track)) bad(`${p}.rule.track`, `must be one of ${TRACKS.join(', ')}`);
        break;
      default:
        bad(`${p}.rule.type`, 'unknown badge rule');
    }
  });

  if (problems.length) throw new Error(`Invalid rewards config:\n- ${problems.join('\n- ')}`);
  return data as RewardsConfig;
}

export const REWARDS: RewardsConfig = validateConfig(raw);

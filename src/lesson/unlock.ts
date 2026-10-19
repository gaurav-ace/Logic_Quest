import type { Lesson, Track } from './schema';

// Difficulty ladder (CLAUDE.md section 6): a lesson that names `requires` stays locked until
// those lessons are finished, so harder lessons open after their foundations.

/** Lessons that must still be finished before `lesson` opens (empty when it is unlocked). */
export function missingRequirements(lesson: Lesson, completed: ReadonlySet<string>, byId: ReadonlyMap<string, Lesson>): Lesson[] {
  return (lesson.requires ?? []).filter((id) => !completed.has(id)).map((id) => byId.get(id)!);
}

export const TRACK_NAMES: Record<Track, string> = {
  web: 'Start here',
  logic: 'Logic foundations',
  dsa: 'Data structures and algorithms',
  hld: 'System design (HLD)',
  lld: 'Low-level design (LLD)',
  'real-world': 'Real-world systems',
  agentic: 'Agentic AI',
};

export interface TrackGroup {
  track: Track;
  name: string;
  lessons: Lesson[];
  done: number;
}

/** Lessons grouped by track, in curriculum order, keeping each track's lesson order. */
export function groupByTrack(lessons: Lesson[], completed: ReadonlySet<string>): TrackGroup[] {
  const order = Object.keys(TRACK_NAMES) as Track[];
  return order
    .map((track) => {
      const inTrack = lessons.filter((l) => l.track === track);
      return { track, name: TRACK_NAMES[track], lessons: inTrack, done: inTrack.filter((l) => completed.has(l.id)).length };
    })
    .filter((g) => g.lessons.length > 0);
}

/**
 * Which track starts open on the home screen: the first one not yet finished, so the learner
 * sees where to continue without scrolling past finished work.
 */
export function trackToOpen(groups: TrackGroup[]): Track | undefined {
  return groups.find((g) => g.done < g.lessons.length)?.track;
}

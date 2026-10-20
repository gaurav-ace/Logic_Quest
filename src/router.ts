// Hash routes, so the phone's back button moves between screens without a server.

import { TRACKS, type Track } from './lesson/schema';

export type Route =
  | { name: 'home' }
  | { name: 'progress' }
  | { name: 'settings' }
  | { name: 'playground' }
  | { name: 'lesson'; id: string }
  // Practice items load per track when opened, so the route carries the track and the item is
  // looked up after loading (an unknown id then shows a "not found" message).
  | { name: 'practice'; track: Track; id: string };

export const HOME: Route = { name: 'home' };

/** Anything unknown (a typo, a removed lesson) falls back to home rather than a blank screen. */
export function parseRoute(hash: string, lessonIds: ReadonlySet<string>): Route {
  if (/^#\/progress\/?$/.test(hash)) return { name: 'progress' };
  if (/^#\/settings\/?$/.test(hash)) return { name: 'settings' };
  if (/^#\/playground\/?$/.test(hash)) return { name: 'playground' };
  const m = /^#\/lesson\/([a-z0-9-]+)\/?$/.exec(hash);
  if (m && lessonIds.has(m[1]!)) return { name: 'lesson', id: m[1]! };
  const p = /^#\/practice\/([a-z-]+)\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(hash);
  if (p && TRACKS.includes(p[1] as Track)) return { name: 'practice', track: p[1] as Track, id: p[2]! };
  return HOME;
}

export function routeHash(route: Route): string {
  if (route.name === 'lesson') return `#/lesson/${route.id}`;
  if (route.name === 'practice') return `#/practice/${route.track}/${route.id}`;
  if (route.name === 'progress') return '#/progress';
  if (route.name === 'playground') return '#/playground';
  return route.name === 'settings' ? '#/settings' : '#/';
}

export function sameRoute(a: Route, b: Route): boolean {
  return routeHash(a) === routeHash(b);
}

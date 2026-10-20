// Hash routes, so the phone's back button moves between screens without a server.

export type Route = { name: 'home' } | { name: 'progress' } | { name: 'settings' } | { name: 'lesson'; id: string };

export const HOME: Route = { name: 'home' };

/** Anything unknown (a typo, a removed lesson) falls back to home rather than a blank screen. */
export function parseRoute(hash: string, lessonIds: ReadonlySet<string>): Route {
  if (/^#\/progress\/?$/.test(hash)) return { name: 'progress' };
  if (/^#\/settings\/?$/.test(hash)) return { name: 'settings' };
  const m = /^#\/lesson\/([a-z0-9-]+)\/?$/.exec(hash);
  if (m && lessonIds.has(m[1]!)) return { name: 'lesson', id: m[1]! };
  return HOME;
}

export function routeHash(route: Route): string {
  if (route.name === 'lesson') return `#/lesson/${route.id}`;
  if (route.name === 'progress') return '#/progress';
  return route.name === 'settings' ? '#/settings' : '#/';
}

export function sameRoute(a: Route, b: Route): boolean {
  return routeHash(a) === routeHash(b);
}

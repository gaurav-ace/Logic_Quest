// Hash routes, so the phone's back button moves between screens without a server.

export type Route = { name: 'home' } | { name: 'progress' } | { name: 'lesson'; id: string };

export const HOME: Route = { name: 'home' };

/** Anything unknown (a typo, a removed lesson) falls back to home rather than a blank screen. */
export function parseRoute(hash: string, lessonIds: ReadonlySet<string>): Route {
  if (/^#\/progress\/?$/.test(hash)) return { name: 'progress' };
  const m = /^#\/lesson\/([a-z0-9-]+)\/?$/.exec(hash);
  if (m && lessonIds.has(m[1]!)) return { name: 'lesson', id: m[1]! };
  return HOME;
}

export function routeHash(route: Route): string {
  if (route.name === 'lesson') return `#/lesson/${route.id}`;
  return route.name === 'progress' ? '#/progress' : '#/';
}

export function sameRoute(a: Route, b: Route): boolean {
  return routeHash(a) === routeHash(b);
}

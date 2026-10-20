import { describe, expect, it } from 'vitest';
import { HOME, parseRoute, routeHash, sameRoute } from './router';

const ids = new Set(['cache', 'load-balancer']);

describe('parseRoute', () => {
  it('reads a known lesson', () => {
    expect(parseRoute('#/lesson/cache', ids)).toEqual({ name: 'lesson', id: 'cache' });
    expect(parseRoute('#/lesson/load-balancer/', ids)).toEqual({ name: 'lesson', id: 'load-balancer' });
  });

  it('reads the progress screen', () => {
    expect(parseRoute('#/progress', ids)).toEqual({ name: 'progress' });
    expect(parseRoute('#/progress/', ids)).toEqual({ name: 'progress' });
    expect(parseRoute('#/progressx', ids)).toEqual(HOME);
  });

  it('reads the playground', () => {
    expect(parseRoute('#/playground', ids)).toEqual({ name: 'playground' });
    expect(parseRoute('#/playground/', ids)).toEqual({ name: 'playground' });
    expect(routeHash({ name: 'playground' })).toBe('#/playground');
    expect(parseRoute('#/playgroundx', ids)).toEqual(HOME);
  });

  it('reads the settings screen', () => {
    expect(parseRoute('#/settings', ids)).toEqual({ name: 'settings' });
    expect(parseRoute('#/settings/', ids)).toEqual({ name: 'settings' });
    expect(routeHash({ name: 'settings' })).toBe('#/settings');
  });

  it('reads a practice item, with its track', () => {
    expect(parseRoute('#/review', ids)).toEqual({ name: 'review' });
    expect(routeHash({ name: 'review' })).toBe('#/review');
    expect(parseRoute('#/practice/logic/second-largest', ids)).toEqual({ name: 'practice', track: 'logic', id: 'second-largest' });
    expect(routeHash({ name: 'practice', track: 'dsa', id: 'x-1' })).toBe('#/practice/dsa/x-1');
    for (const h of ['#/practice/nope/x', '#/practice/logic', '#/practice/logic/Bad_Id', '#/practice/logic/a/b']) expect(parseRoute(h, ids), h).toEqual(HOME);
  });

  it('treats empty and root hashes as home', () => {
    for (const h of ['', '#', '#/']) expect(parseRoute(h, ids)).toEqual(HOME);
  });

  it('falls back to home for unknown lessons and junk', () => {
    for (const h of ['#/lesson/nope', '#/lesson/', '#/lessons/cache', '#/lesson/cache/extra', '#/lesson/CACHE', '#<script>']) {
      expect(parseRoute(h, ids), h).toEqual(HOME);
    }
  });
});

describe('routeHash', () => {
  it('round-trips through parseRoute', () => {
    for (const r of [HOME, { name: 'progress' } as const, { name: 'lesson', id: 'cache' } as const]) expect(parseRoute(routeHash(r), ids)).toEqual(r);
  });

  it('compares routes', () => {
    expect(sameRoute(HOME, { name: 'home' })).toBe(true);
    expect(sameRoute(HOME, { name: 'lesson', id: 'cache' })).toBe(false);
    expect(sameRoute({ name: 'lesson', id: 'cache' }, { name: 'lesson', id: 'load-balancer' })).toBe(false);
  });
});

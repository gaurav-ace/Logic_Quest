import { describe, expect, it } from 'vitest';
import { HOME, parseRoute, routeHash, sameRoute } from './router';

const ids = new Set(['cache', 'load-balancer']);

describe('parseRoute', () => {
  it('reads a known lesson', () => {
    expect(parseRoute('#/lesson/cache', ids)).toEqual({ name: 'lesson', id: 'cache' });
    expect(parseRoute('#/lesson/load-balancer/', ids)).toEqual({ name: 'lesson', id: 'load-balancer' });
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
    for (const r of [HOME, { name: 'lesson', id: 'cache' } as const]) expect(parseRoute(routeHash(r), ids)).toEqual(r);
  });

  it('compares routes', () => {
    expect(sameRoute(HOME, { name: 'home' })).toBe(true);
    expect(sameRoute(HOME, { name: 'lesson', id: 'cache' })).toBe(false);
    expect(sameRoute({ name: 'lesson', id: 'cache' }, { name: 'lesson', id: 'load-balancer' })).toBe(false);
  });
});

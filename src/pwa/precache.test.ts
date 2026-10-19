import { describe, expect, it } from 'vitest';
import { cacheVersion, precacheList, type BuiltFile } from './precache';

const files: BuiltFile[] = [
  { path: 'index.html', content: '<html>' },
  { path: 'assets/index-abc.js', content: 'js' },
  { path: 'assets/index-abc.js.map', content: 'map' },
  { path: 'icons/icon-192.png', content: new Uint8Array([1, 2, 3]) },
  { path: 'sw.js', content: 'worker' },
];

describe('precacheList', () => {
  it('lists the start URL and every app file', () => {
    expect(precacheList(files)).toEqual(['./', 'assets/index-abc.js', 'icons/icon-192.png', 'index.html']);
  });

  it('never caches the worker itself or source maps', () => {
    const list = precacheList(files);
    expect(list).not.toContain('sw.js');
    expect(list.some((p) => p.endsWith('.map'))).toBe(false);
  });

  it('skips dotfiles', () => {
    expect(precacheList([{ path: 'icons/.DS_Store', content: '' }])).toEqual(['./']);
  });

  it('normalises Windows separators, leading slashes and duplicates', () => {
    const list = precacheList([
      { path: 'icons\\icon.svg', content: '' },
      { path: '/icons/icon.svg', content: '' },
      { path: './manifest.webmanifest', content: '' },
    ]);
    expect(list).toEqual(['./', 'icons/icon.svg', 'manifest.webmanifest']);
  });
});

describe('cacheVersion', () => {
  it('is stable for the same files in any order', () => {
    expect(cacheVersion(files)).toBe(cacheVersion([...files].reverse()));
    expect(cacheVersion(files)).toMatch(/^[0-9a-f]{8}$/);
  });

  it('changes when any cached content changes, even with the same name', () => {
    const changed = files.map((f) => (f.path === 'icons/icon-192.png' ? { ...f, content: new Uint8Array([1, 2, 4]) } : f));
    expect(cacheVersion(changed)).not.toBe(cacheVersion(files));
  });

  it('changes when a file is renamed', () => {
    const renamed = files.map((f) => (f.path === 'index.html' ? { ...f, path: 'home.html' } : f));
    expect(cacheVersion(renamed)).not.toBe(cacheVersion(files));
  });

  it('ignores files that are not cached', () => {
    const withMapChange = files.map((f) => (f.path.endsWith('.map') ? { ...f, content: 'other' } : f));
    expect(cacheVersion(withMapChange)).toBe(cacheVersion(files));
  });
});

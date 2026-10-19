// Build-time helpers for the service worker (used by vite.config.ts, tested in precache.test.ts).

export interface BuiltFile {
  /** Path relative to the site root, e.g. "assets/index-abc.js". */
  path: string;
  content: string | Uint8Array;
}

const SKIP = [/\.map$/, /^sw\.js$/, /(^|\/)\.[^/]+$/];

/**
 * Every file the app needs offline, as URLs relative to the service worker's scope.
 * "./" is included so the start URL itself is cached, not just index.html.
 */
export function precacheList(files: BuiltFile[]): string[] {
  const paths = files.map((f) => f.path.replace(/\\/g, '/').replace(/^\.?\//, '')).filter((p) => !SKIP.some((re) => re.test(p)));
  return ['./', ...new Set(paths)].sort();
}

/**
 * Cache version from file names and contents. A new deploy that changes any cached byte
 * gets a new version, so the worker installs a fresh cache and drops the old one.
 * FNV-1a is enough here: it detects changes, it does not need to resist attackers.
 */
export function cacheVersion(files: BuiltFile[]): string {
  let h = 0x811c9dc5;
  const mix = (byte: number) => {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  const enc = new TextEncoder();
  for (const f of [...files].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    if (SKIP.some((re) => re.test(f.path))) continue;
    for (const b of enc.encode(f.path)) mix(b);
    mix(0);
    for (const b of typeof f.content === 'string' ? enc.encode(f.content) : f.content) mix(b);
    mix(0);
  }
  return h.toString(16).padStart(8, '0');
}

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';
import { cacheVersion, precacheList, type BuiltFile } from './src/pwa/precache.ts';

const PUBLIC_DIR = 'public';

function filesIn(dir: string): BuiltFile[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return filesIn(full);
    return [{ path: relative(PUBLIC_DIR, full), content: readFileSync(full) }];
  });
}

// Writes dist/sw.js with the exact list of built files, so the worker can cache the whole
// app at install time. Hand-written instead of vite-plugin-pwa to keep dependencies at zero.
function serviceWorker(): Plugin {
  return {
    name: 'logic-quest-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const built: BuiltFile[] = Object.values(bundle).map((item) => ({
        path: item.fileName,
        content: item.type === 'asset' ? item.source : item.code,
      }));
      const files = [...built, ...filesIn(PUBLIC_DIR)];
      const source = readFileSync('src/pwa/sw.js', 'utf8')
        .replace("'__CACHE_VERSION__'", JSON.stringify(cacheVersion(files)))
        .replace('__PRECACHE_LIST__', JSON.stringify(precacheList(files)));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  // GitHub Pages serves the site from /<repo-name>/. The service worker scope follows this.
  base: '/Logic_Quest/',
  plugins: [serviceWorker()],
  test: {
    include: ['src/**/*.test.ts'],
    // Vitest 5 caches transformed files on disk keyed by their own content, so a file using
    // import.meta.glob kept its old file list: a new practice/*.json was silently left out of the
    // per-item tests. A cold transform costs a few seconds; a skipped test costs more.
    fsModuleCache: false,
  },
});

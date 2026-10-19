import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'prototype/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // The service worker runs in a worker scope, and its placeholder is filled in at build time.
    files: ['src/pwa/sw.js'],
    languageOptions: {
      globals: { self: 'readonly', caches: 'readonly', fetch: 'readonly', URL: 'readonly', setTimeout: 'readonly', __PRECACHE_LIST__: 'readonly' },
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly', fetch: 'readonly', WebSocket: 'readonly', setTimeout: 'readonly' },
    },
  },
);

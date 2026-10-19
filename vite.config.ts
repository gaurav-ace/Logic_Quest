import { defineConfig } from 'vitest/config';

export default defineConfig({
  // GitHub Pages serves the site from /<repo-name>/. The service worker scope must match this.
  base: '/Logic_Quest/',
  test: {
    include: ['src/**/*.test.ts'],
  },
});

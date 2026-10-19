# Changelog

## Phase 0, Foundations (in progress)

- 0.1 Tooling: TypeScript 6.0.3, Vite 8.3.4, Vitest 5.0.5, ESLint 10.13.0 with typescript-eslint 8.71.2. All pinned exactly. Scripts: `dev`, `build`, `typecheck`, `lint`, `test`, `check`.
- 0.2 Lesson schema (`src/lesson/schema.ts`) and validator (`src/lesson/validate.ts`). The validator reports every problem with its path, rejects unknown fields, and checks that node references, edges, step hops and quiz answers are consistent. First lesson data: `lessons/hello.json` (sourced from MDN).
- 0.3 Hello lesson renders from data (`index.html`, `src/render/lesson.ts`, `src/styles.css`, `src/engine/packet.ts`): goal, SVG diagram with a moving packet, step captions, Back/Next, and a quiz that explains every option and offers a replay after a wrong answer. Mobile first, system fonts, 48 px tap targets, safe areas, light/dark, reduced motion. Removed the 0.1 placeholder smoke test.
- 0.4 Installable PWA: `public/manifest.webmanifest`, icons (SVG plus 192/512/maskable PNGs drawn by `scripts/make_icons.py`, stdlib only), and a hand-written service worker (`src/pwa/sw.js`). A small Vite plugin writes `dist/sw.js` with the exact list of built files, and a content-based cache version (`src/pwa/precache.ts`, tested), so the whole app is cached on first visit and works offline. Registered only in production builds.

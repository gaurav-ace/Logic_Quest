# Changelog

## Phase 0, Foundations (done 2026-10-19)

- 0.1 Tooling: TypeScript 6.0.3, Vite 8.3.4, Vitest 5.0.5, ESLint 10.13.0 with typescript-eslint 8.71.2. All pinned exactly. Scripts: `dev`, `build`, `typecheck`, `lint`, `test`, `check`.
- 0.2 Lesson schema (`src/lesson/schema.ts`) and validator (`src/lesson/validate.ts`). The validator reports every problem with its path, rejects unknown fields, and checks that node references, edges, step hops and quiz answers are consistent. First lesson data: `lessons/hello.json` (sourced from MDN).
- 0.3 Hello lesson renders from data (`index.html`, `src/render/lesson.ts`, `src/styles.css`, `src/engine/packet.ts`): goal, SVG diagram with a moving packet, step captions, Back/Next, and a quiz that explains every option and offers a replay after a wrong answer. Mobile first, system fonts, 48 px tap targets, safe areas, light/dark, reduced motion. Removed the 0.1 placeholder smoke test.
- 0.4 Installable PWA: `public/manifest.webmanifest`, icons (SVG plus 192/512/maskable PNGs drawn by `scripts/make_icons.py`, stdlib only), and a hand-written service worker (`src/pwa/sw.js`). A small Vite plugin writes `dist/sw.js` with the exact list of built files, and a content-based cache version (`src/pwa/precache.ts`, tested), so the whole app is cached on first visit and works offline. Registered only in production builds.
- 0.5 CI and deploy: `.github/workflows/ci.yml` runs `npm ci`, lint, typecheck, tests and build on every push and pull request, and publishes `main` to GitHub Pages. README rewritten with dev commands and layout; `docs/IDEAS.md` started.

## Phase 1, Animation engine (in progress)

- 1.1 Step player (`src/engine/player.ts`): pure state machine for next/back/go-to, play/pause, 0.5x/1x/2x speed and auto-advance after a reading time based on caption length. A long frame never skips a step; reduced motion shows the packet at its destination but keeps reading time. 31 unit tests.
- 1.2 Renderer runs on the player. New controls: step dots (48 px tap targets), speed, Back / Play-Pause-Replay / Next. Auto-play pauses when the tab is hidden, and frames stop when nothing moves. Renderer split into `dom`, `diagram`, `controls`, `quiz` and `lesson` modules. Headless Chrome check script added as `scripts/browser-check.mjs`. Source links are now full-size tap targets.

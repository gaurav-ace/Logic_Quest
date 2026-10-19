# Phase 0 plan: Foundations

Status: done 2026-10-19. CI green, live on GitHub Pages, owner tested on web and Android.

**Goal (from CLAUDE.md section 9):** a "hello lesson" renders on desktop and in an Android-sized viewport, installs as a PWA, and one test passes in CI or a local script.

**Stack:** vanilla TypeScript, Vite, Vitest. Hosted on GitHub Pages, with GitHub Actions for CI.

## Tasks (one at a time, each committed separately)

| # | Task | Files | Tested by |
|---|------|-------|-----------|
| 0.1 | Tooling: `package.json`, `tsconfig.json`, `vite.config.ts`, ESLint config, `.gitignore`, `src/main.ts` stub | ~6, all config | `npm run lint`, `npm run typecheck`, `npm test` (one smoke test) all pass |
| 0.2 | Lesson schema and validator: `src/lesson/schema.ts`, `src/lesson/validate.ts`, `src/lesson/validate.test.ts`, `lessons/hello.json` | 4 | Tests: the valid hello lesson passes; a missing objective, a missing `sources`, an edge to an unknown node, a quiz answer index out of range, and an empty steps list each fail with a clear message |
| 0.3 | Hello lesson renders: `index.html`, `src/render/hello.ts`, `src/styles.css`. Uses system fonts (no Google Fonts, so it works offline), safe areas, 48 dp touch targets | 3–4 | Manual check at 360 px and desktop widths, tap only, reduced motion on. Browser device emulation only, stated as such |
| 0.4 | PWA: `public/manifest.webmanifest`, icons (SVG plus 192/512 PNG), hand-written `public/sw.js` (cache-first for app files, offline fallback), registered from `main.ts` | 4–5 | Lighthouse/DevTools "installable" check; app loads with network off |
| 0.5 | CI and deploy: `.github/workflows/ci.yml` (lint, typecheck, test, build), Pages deploy workflow, `CHANGELOG.md`, `docs/IDEAS.md` | 4 | Workflow runs green on GitHub. Needs a GitHub repo and a push, which only happens with the owner's approval |

Phase 0 is done when 0.1–0.5 are done **and** the owner installs the app on their Android phone from the Pages URL.

## Dependencies to approve (all dev-only, nothing ships to the browser)

| Package | Why | Without it |
|---------|-----|-----------|
| `typescript` | Type checking, typed lesson schema | Plain JS, schema errors found later |
| `vite` | Dev server (phone can open it over LAN), production build | Hand-rolled build script |
| `vitest` | Unit tests, shares Vite config | Node's built-in `node:test` plus a separate TS step |
| `eslint`, `@eslint/js`, `typescript-eslint` | Linting (required by Phase 0) | `tsc --strict` only |

Exact versions: the current stable release of each, checked with `npm view <pkg> version` at install time, then pinned in `package-lock.json`. Not chosen from memory.

Deliberately **not** used: a UI framework, `vite-plugin-pwa` (the service worker is small enough to write by hand and easier to understand), and a schema library such as zod (a hand-written validator with clear error messages is enough for now).

## Prerequisite: Node.js

Node is not installed in this WSL environment. Recommended: install the current Node LTS for your user only (no `sudo`, nothing system-wide) using nvm. The owner runs it themselves, because it downloads and runs an install script.

## Risks

- **PWA icons:** Android install works most reliably with PNG icons. Making PNGs without an image tool may need a one-off script or the owner supplying an icon.
- **Pages base path:** the site will live at `/<repo-name>/`, so Vite's `base` and the service worker scope must match it. Needs the repo name.
- **Real-device check:** only the owner can do it. Until then, report "browser emulation only".

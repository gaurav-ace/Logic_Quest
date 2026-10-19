# Logic_Quest

Build logical skills for DSA, system design and agentic AI.

Logic Quest is an installable web app (PWA) that shows software systems and algorithms as step-by-step animations, then checks your understanding with quizzes. It works on Android phones and desktops, and offline once it has been opened once.

**Live app:** https://gaurav-ace.github.io/Logic_Quest/ (on Android Chrome, open it and choose "Add to Home screen" or "Install app").

## Develop

Needs Node 24 or newer.

```sh
npm ci            # install the exact dev dependencies
npm run dev       # dev server; also prints a network URL you can open on your phone
npm run check     # lint + typecheck + tests
npm run build     # production build in dist/ (includes the service worker)
npm run preview   # serve dist/ to test the PWA and offline mode
```

The service worker is only registered in production builds, so use `build` + `preview` to test offline behaviour.

Phone and desktop checks in headless Chrome (layout, 48 px tap targets, touch-only taps through every control, offline and install checks), with `npm run preview` running:

```sh
node scripts/browser-check.mjs ui     # or: pwa, persist (closes and reopens Chrome on later days), lessons
LESSONS=bfs,heaps node scripts/browser-check.mjs lessons   # walk only these lessons
```

Set `CHROME_PATH` if Chrome is not in the default place. Screenshots go to your temp folder.

## Layout

| Path | What lives there |
|------|------------------|
| `lessons/` | Lesson data (JSON), checked by `src/lesson/validate.ts` at load time |
| `src/lesson/` | Lesson schema and validator |
| `src/engine/` | Step player and packet animation (pure, unit-tested) |
| `src/trace/` | Trace engine: programs that really run an algorithm and record frames, tested against reference implementations |
| `src/rewards/` | Reward rules (`rewards.config.json`) and the engine that computes XP, streak, coins and badges from the event log |
| `src/progress/` | Saving the event log, export and import |
| `src/render/` | DOM and SVG rendering |
| `src/pwa/` | Service worker template, precache helpers, registration |
| `public/` | Manifest and icons (regenerate PNGs with `python3 scripts/make_icons.py`) |
| `prototype/` | The original single-file prototype, kept for reference only |
| `docs/` | Project context, progress log, phase plans, parked ideas |

Project rules for contributors (human or AI) are in `CLAUDE.md`.

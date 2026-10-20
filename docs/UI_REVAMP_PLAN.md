# UI revamp plan

Status: **approved by the owner 2026-10-20 (softer modern look). In progress on branch `claude/ui_dev`: U1–U4 first pass built, see `docs/PROGRESS.md`.** Written 2026-10-19.

## 1. What is wrong today (from reading the code)

| Problem | Cause in the code |
|---|---|
| Content fills only the centre; about 30% blank on each side on a 1440 px screen | `main { max-width: 560px; margin: 0 auto }` in `src/styles.css`. One phone-width column is used at every screen size. There are no `min-width` media queries at all; the only queries are dark mode and reduced motion. |
| No sections for features | `src/main.ts` draws a header, then one `view` div. Home is the XP card, a heading, and 7 folding track lists (93 lessons). Progress, badges, settings and backup are one long page. There is no persistent navigation. |
| Dull look | One flat palette (pale grey-green grid background, navy 2 px outlines, yellow highlight), system font, no icons or illustrations, and the same card for every lesson, whether easy, hard, done or locked. The title is one line of text. |
| Lesson page wastes width | The stage (diagram, trace, sim) is limited to 528 px, so a desktop learner sees a small diagram and a tall scroll. Caption, controls, quiz and notes are stacked in order. |
| Home hides "where do I go next" | Tracks fold shut, so the learner sees a list of 7 headings, not a path. Only the first unfinished track opens. |

What is good and must survive: mobile-first 48 px targets, sticky player controls, back-button and leave-quiz guard, light/dark, reduced motion, PWA/offline, and the 1246-check browser suite. The revamp is a **layout and style** change; lesson data, engine, rewards and storage stay untouched (CLAUDE.md "do not mix concerns").

## 2. References (from general knowledge of these sites; I did not fetch them today)

| Site | Idea worth borrowing |
|---|---|
| LeetCode, Exercism, Boot.dev | Split lesson screen: instructions on one side, the working area on the other. Top bar with a few clear destinations. Progress shown as small chips on each item. |
| freeCodeCamp, Codecademy | Left sidebar listing the course outline with done ticks; the current item stays highlighted. |
| Duolingo, Brilliant | A visual path or grid of lesson tiles with state (done / next / locked) and a right-hand rail for streak, XP, daily goal. |
| VisuAlgo | The animation gets most of the screen; controls sit in a fixed strip under it. |
| Khan Academy, Educative | Course dashboard: "continue where you left off" card first, then topics. |
| GitHub, Linear (dev-tool look) | Calm neutral surfaces, one accent colour, tight type scale, a monospace font for code. |

## 3. Target layout

Three breakpoints, same features everywhere (CLAUDE.md section 8).

**Phone (under 720 px): keep today's single column,** plus a bottom tab bar (Learn, Progress, Settings) in thumb reach, replacing the header buttons.

**Tablet (720–1099 px):** two columns. Lesson grid of 2 across; lesson page keeps the single column but widens to about 760 px.

**Desktop (1100 px and up):** full-width app shell.

```
+------------------------------------------------------------------------+
| Logo  Logic Quest            [search lessons]        Lv 4 · 🔥 3 · 🪙 55 |  top bar
+----------+---------------------------------------------+---------------+
| Learn    |  Continue: "Binary search" (step 3 of 6) [>] |  Today  1/1   |
| Progress |                                             |  XP bar       |
| Settings |  Track tabs: Logic | DSA | HLD | LLD | ...  |  Streak week  |
|          |  +------+ +------+ +------+ +------+        |  Next badge   |
| Tracks   |  | tile | | tile | | tile | | tile |        |  Review queue |
|  Logic ✓ |  +------+ +------+ +------+ +------+        |               |
|  DSA  4/30|                                            |               |
|  HLD     |                                             |               |
+----------+---------------------------------------------+---------------+
```

- **Left rail (about 220 px):** the three main sections and the 7 tracks with "done of total". Collapses to the bottom tab bar on phones.
- **Centre:** the page for the current section, using up to about 1100 px.
- **Right rail (about 280 px, desktop only):** daily goal, XP and level, streak week, next badge. On phone and tablet these are the existing HUD card at the top of Learn.

**Lesson page on desktop:** split view.

```
+---------------------------------------+----------------------+
|  Stage (diagram / trace / sim)         |  Step 3 of 6         |
|  large, fills the left 60–65%          |  Caption             |
|                                        |  "What happens next?"|
|                                        |  Sim sliders / notes |
+---------------------------------------+----------------------+
|  Back   Play   Next   speed   dots                            |  sticky strip
+---------------------------------------------------------------+
|  Quiz (full width, after the last step)                       |
+---------------------------------------------------------------+
```

On a phone it stays stacked exactly as now (stage, caption, sticky controls). The lesson's own sidebar replaces the "← Lessons" link with a breadcrumb: Track › Lesson.

## 4. Visual direction

- **Keep the playful identity, drop the graph paper.** Replace the full-page grid with a plain surface and use the grid only inside diagram stages, where it helps reading.
- **Tokens, not one-off colours.** Extend the existing `:root` variables: surface-1/2/3, border, one primary accent (keep the navy/blue), a highlight (keep the yellow), plus a distinct hue per track used for its tile stripe, icon and progress ring (7 hues, checked for contrast in light and dark).
- **Type:** keep the system font for body (offline, fast; Google Fonts is already ruled out). Add a monospace stack for code and numbers, and a clearer scale (display, h1–h3, body, small).
- **Lesson tiles:** track icon, title, one-line objective, level chip (E/M/H), kind chip (Diagram / Trace / Sim / Design), time estimate, and a state: done (tick), next (accent ring, "Start"), locked (lock + "Finish X first"), in progress (ring).
- **Icons:** inline SVG sprite, hand-drawn in the repo. No icon library (CLAUDE.md: no new dependencies without asking).
- **Motion:** small, respecting reduced motion and calm mode. Tile hover lift on pointer devices only; nothing hover-only.
- **Keep the 2 px outline and offset-shadow buttons?** Decision for the owner (see section 7). It is the most "dull but distinctive" part of the current look.

## 5. Sections (information architecture)

| Section | Contents | Today |
|---|---|---|
| **Learn** (home) | Continue card, track tabs, lesson tiles, search/filter by level and kind, "Review mistakes" entry | Folding track list |
| **Progress** | Streak and week, XP and level history, badges grid, mistakes to review | One long page |
| **Settings** | Daily goal, calm mode, backup/export/import, storage status, app version | Bottom of Progress |
| **Lesson** | Split view, breadcrumb, objective, notes and sources in a side tab | Single column |

Routes: add `#/settings` next to `#/`, `#/progress`, `#/lesson/<id>` in `src/router.ts`. Existing links and the back-button/leave-quiz logic keep working.

## 6. Phased build (each phase is small, shippable and checked)

Per CLAUDE.md sections 4 and 9: one task at a time, about 5 files or 300 lines at most, tests before "done". UI phases are labelled **U1–U6** and need your approval to slot in ahead of Phase 6.

| # | Task | Main files | Check |
|---|---|---|---|
| **U1** | Design tokens, type scale, remove the page grid, track colours and icon sprite. No layout change. | `styles.css`, new `icons.ts`, `index.html` | Contrast check script for all token pairs in light and dark; `npm run check`; browser `ui` still 1246/1246 |
| **U2** | App shell: top bar, left rail (desktop), bottom tabs (phone), Settings split out of Progress, `#/settings` route. | `main.ts`, `router.ts`, new `shell.ts`, `progress.ts` | Router unit tests; back button and leave-quiz guard still pass in the browser suite |
| **U3** | Learn page: continue card, new tiles, track tabs instead of folds, filters, right rail on desktop. | `home.ts`, `hud.ts`, `styles.css` | Tile state tests (done/next/locked); 360 px and 1440 px screenshots |
| **U4** | Lesson page split view at 1100 px and up; wider stage; breadcrumb; notes in side tab. | `stepped.ts`, `lesson.ts`, `trace.ts`, `sim.ts`, `styles.css` | Walk all 93 lessons at 360, 768 and 1440 px (extend `browser-check.mjs` widths); no horizontal scroll; no clipped SVG |
| **U5** | Progress page: streak, badges grid, XP history; polish toasts and empty states. | `progress.ts`, `toast.ts` | Browser `ui`, `persist` |
| **U6** | Final pass: keyboard order and focus, screen-reader landmarks, reduced motion and calm mode, bundle size, offline/PWA. | various | `pwa` 7/7, `persist` 11/11, bundle size vs. now, Lighthouse-style manual check on a real phone |

Every phase ends with the screenshots at the three widths for your review before the next one starts.

## 7. Risks and what I need from you

- **Existing browser checks assume today's DOM** (class names such as `.lesson-card`, `.track`, `.player`). Renames break up to 1246 checks; keep those class names or update the script in the same task.
- **Desktop split view** is the biggest change to lesson rendering (U4). If it proves too invasive, a fallback is a wider single column with the caption beside the stage.
- **Bundle size** is already 575 kB (181 kB gzip) and over Vite's warning. The revamp adds no libraries; lazy-loading lessons (parked in `IDEAS.md`) is a separate task.
- **No screenshots reviewed yet.** This plan is from the code. U1 starts with screenshots of the live site at 360, 768 and 1440 px so we agree on the "before".

Questions for you:
1. **Look:** keep the playful navy outlines and offset shadows, or move to a softer modern look (thin borders, subtle shadows) like GitHub or Linear?
2. **Phase order:** do U1–U6 now, ahead of Phase 6, or after it?
3. **Right rail on desktop:** worth having, or keep progress stats only at the top of Learn?
4. **Dependencies:** is "no new dependencies, hand-drawn SVG icons" fine?

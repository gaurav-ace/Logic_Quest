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

## Deploy

Every push to `main` runs the checks and deploys to GitHub Pages by itself. To deploy again without a push, use **Actions → CI → Run workflow** on `main`. Do not use "Re-run" on an older run: a re-run uses that run's original commit, so it puts the old version back on the site.

Progress is saved in each browser separately (there is no server). To move it to another device, use Progress → Export, then Progress → Import on the other device; importing merges, so nothing is counted twice.

## Daily reminders (Discord)

`.github/workflows/reminder.yml` posts a short reminder to a Discord channel once in the morning (between 04:00 and 12:00 IST, usually early) and once in the evening (between 17:00 and 23:00 IST; skipped if GitHub runs it later than that). The Discord app on your phone shows it as a notification. The app itself asks for no permissions.

1. In Discord, open the channel's settings, then **Integrations > Webhooks > New Webhook**, and copy its URL.
2. On GitHub, go to **Settings > Secrets and variables > Actions > New repository secret**. Set the name to `DISCORD_WEBHOOK_URL` and paste the URL as the value. The URL is the password to the channel, so keep it only there.
3. Test it: **Actions > Daily reminder > Run workflow**.

Good to know:
- Scheduled runs only start once the workflow is on `main`.
- GitHub starts scheduled runs late, often by 4 to 5.5 hours. So each reminder has several tries, spread over the night (morning) and afternoon (evening), and only the first try inside its time window posts; the others log "skip". Manual runs always post.
- In a public repo, they pause after 60 days with no activity. Re-enable them from the Actions tab.
- The reminder can't see your progress, because progress lives only on your device. It reminds you; it can't tell you whether today's lesson is done.

Preview the text without sending anything: `node scripts/reminder.ts --dry-run --slot morning`.

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

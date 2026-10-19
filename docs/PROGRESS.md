# Progress

Update this file at the end of every session. Keep it short and factual. Only record things that were actually done and checked.

## Current phase

Phase 5b, Low-level design: **done**, pushed, and approved by the owner on 2026-10-19 ("site shows LLD now, proceed"); a phone check was not mentioned. Phase 5c plan drafted (`docs/PHASE5C_PLAN.md`), awaiting approval.

Phase 5, System design (HLD): **done**, pushed and approved by the owner on 2026-10-19.

Phases 0–4: **done** and approved (3 and 4 approved by the owner on 2026-10-19 without a line-by-line content review; the owner will report any content problems they find later). Live at https://gaurav-ace.github.io/Logic_Quest/.

## Done (Phase 5b)

- 5b.1 Design lessons: class and sequence diagrams from a pure, tested layout module; code snippets; "improve the design" exercise (tap the classes a change touches, pick the fix, see the smaller change); the validator rejects diagrams that won't fit and exercises whose fix isn't smaller.
- 5b.2–5b.4 Fourteen LLD lessons (O1–O14). Three are computed traces (state machine, LRU cache, per-user rate limiter), each tested against a reference on 200 random inputs plus claim tests; an LRU mutation (evict the newest) failed 3 tests. Traces can show class diagrams and end with an exercise.
- Checks run: `npm run check` 546/546; browser `ui` 821/821 (all 72 lessons walked through their exercises to the quiz at 360 px, with the new "nothing past the diagram's edge" check), `design` 29/29, `sim` 24/24, `pwa` 7/7, `persist` 11/11.
- Found by the checks and fixed: names and code lines too wide (validator), a line crossing a box, two arrowheads on one point, linked-list labels past the edge.
- Differences from the plan: long member lists are capped at 5 instead of folding; a few diagrams have 5–6 classes rather than "about 4" (they pass the fit checks).
- Sources: Martin (SRP 2014, OCP 2014, Solid Relevance 2020), Parnas 1972, Gang of Four 1994, Bloch, Liskov and Wing 1994, Python docs (classes, property, abc, typing.Protocol, zlib, dict, math.ceil, threading, functools.lru_cache, OrderedDict), Anthropic "Building effective agents", ReAct.

## Done (Phase 5)

- 5.1 Sim engine (`src/sim/`): seeded pure models, sliders, toggles, failure actions, live metrics, challenges with goals; every challenge proven winnable by its solution and not passable from its setup.
- 5.2–5.4 Sixteen lessons: request journey, scaling, load balancing, caching, CDNs, SQL vs NoSQL, indexes, replication, sharding, consistent hashing, message queues, rate limiting, CAP, idempotency, URL shortener design, AI chat service design. Every one has a "what this simplifies" note and sources; no `TODO-VERIFY`.
- Checks run: `npm run check` 513/513; browser `ui` 526/527 on the full 58 lessons (the one failure, graph notes clipped, was fixed and the 5 graph lessons rechecked 44/44), `sim` 24/24, `pwa` 7/7, `persist` 11/11.
- Bug I shipped in 5.3 and found in 5.4: sharding notes were clipped at the right edge (visible in the screenshot I had reviewed). New unit and browser checks fail on the old code; they also caught a Phase 4 graph-note clip.
- Sources: NGINX, MDN, RFC 9110, RFC 6585, Azure, AWS SQS, PostgreSQL docs, Stripe idempotency blog, Brewer (InfoQ 2012), Claude Platform docs; Gilbert & Lynch 2002 and Kleppmann's DDIA cited without links.

## Done (Phase 4)

- 4.1 New views: stack, queue, linked list, hash buckets, tree (binary and n-ary), graph, table cell highlight. Tree layout tested on 100 random BSTs.
- 4.2–4.4 Thirty DSA lessons, each a computed trace checked against a reference on 200 random inputs (often an independent algorithm), plus claim tests (`src/trace/programs/dsa-claims.test.ts`).
- Checks run: `npm run check` 368/368; browser `ui` 378/378 (all 42 lessons walked to their quiz at 360 px), `pwa` 7/7, `persist` 11/11.
- Bugs found by the checks and fixed: real-size SVGs scaled down by an old rule (9.9 px text); wide arrays overflowing the page; graph wider than the phone; my hard-coded wrong expectation in one test.

## Done (Phase 3)

- 3.1 Predict-then-reveal questions on diagram steps; tally before the quiz; shared stepped shell (`src/render/stepped.ts`).
- 3.2 Trace engine (`src/trace/`): programs really run and record frames; predictions computed from the run; every program tested against a reference on 200 seeded random inputs; "New example".
- 3.3 Eight logic lessons. Claims tested beyond the examples (n² to 1,000; L + 1 posts; Python float output; invariant at every check; work-backwards optimal vs BFS up to 600). Mutation check: removing the frame deep-copy initially went unnoticed; the test was rewritten to record frames as they are made, and now catches it in 4 programs.
- 3.4 Home grouped by track with folding sections; `requires` locking with an explanation on tap.
- Checks run: `npm run check` 218/218; browser `ui` 196/196 (every lesson walked to its quiz at 360 px), `pwa` 7/7, `persist` 11/11.
- Sources: Pólya; Myers, Sandler and Badgett; CLRS 4th ed.; Bentley; Wikipedia (Square number, Off-by-one error; owner may veto Wikipedia); Python docs (range, ZeroDivisionError; URLs moved to /3/builtins/ and were updated).

## Done (Phase 2)

- 2.1 Reward engine (`src/rewards/`): event log, XP, levels, streak with coin buffer and break, 18 badges, all numbers in `rewards.config.json` (validated). Mutation checks: removing anti-farming, the coin floor, or "today is never a miss" each made tests fail. The first coin-floor mutation survived and exposed a missing test, which was added.
- 2.2 Storage (`src/progress/store.ts`): merge on every write, backup of unreadable saves, works with storage full or blocked, export/import. Mutation checks: removing the merge, or the backup copy, made tests fail.
- 2.3 Rewards in lessons, HUD on home, ✓ Done on cards, pop-up (none in calm mode).
- 2.4 Progress screen with 7-day view, badges, settings, export and import.
- Checks run: `npm run check` 159/159 tests (12 files); fresh clone `npm ci && npm run check && npm run build` passes; headless Chrome `browser-check.mjs ui` 105/105 (now including rewards from zero, reload persistence, replay "Already scored", retry XP, calm mode, a real file download for export, importing the same file twice adding nothing, a bad file rejected, back button from progress) and `pwa` 7/7.

## Done (Phase 1)

- 1.1 Step player (`src/engine/player.ts`): 31 unit tests. Mutation check: disabling "play at the end restarts" made its test fail.
- 1.2 Renderer on the player, new controls (dots, speed, Back/Play/Next), pause when hidden. `scripts/browser-check.mjs` committed.
- 1.3 Load balancer, cache and agent loop lessons as JSON, each with sources whose wording was checked on 2026-10-19 (NGINX load balancing docs, Azure Cache-Aside pattern, Anthropic "Building effective agents", ReAct paper on arXiv). No `TODO-VERIFY` items. Validator now checks node fields and diagram bounds; catalog test fails if a lesson file is not listed.
- 1.4 Lesson list, hash routes (router unit tests), Android back button, "Leave the quiz?" sheet.
- Checks run: `npm run check` 72/72 tests; fresh clone `npm ci && npm run check && npm run build` passes; headless Chrome `browser-check.mjs ui` 69/69 (360 px phone with reduced motion, 740x360 landscape with motion, 1280 desktop, dark scheme) and `pwa` 7/7. Screenshots of every lesson reviewed.

## Done (Phase 0)

- 0.1 Tooling. `npm run check` passes. A deliberately broken file fails both lint and typecheck.
- 0.2 Lesson schema and validator. Removing the edge check made its test fail, so the tests do catch breakage. `lessons/hello.json` is sourced from MDN, page checked.
- 0.3 Hello lesson renders. Headless Chrome checks (22/22 pass) at 360x740 phone, 740x360 landscape and 1280x800 desktop: no horizontal scroll, all tap targets at least 48 px, diagram labels at least 14 px, touch-only taps through steps and quiz, Back/Next, wrong answer explains and offers a replay, right answer explains, reduced motion shows the packet at rest, normal motion animates it, no console errors. Light and dark screenshots reviewed.
- 0.4 PWA. Headless Chrome checks (7/7 pass): manifest loads with no errors, service worker activates and controls the page, Chrome reports no installability errors, app loads offline, offline URL with a query string loads.
- 0.5 CI and Pages workflow. Rerun of run 39214268975 (attempt 2) succeeded and deployed. Live site checked: page, sw.js, manifest and icons all return 200, and the live cache version (86d54969) matches the local build. Fresh-clone `npm ci && npm run check && npm run build` passes locally. First GitHub run (39214268975, commit 57208d3): `npm ci`, check (lint, typecheck, 32 tests) and build all passed; the Pages step failed with "Get Pages site failed... Not Found" because Pages was not yet set to build from GitHub Actions.
- Remote `origin` = `git@github.com:gaurav-ace/Logic_Quest.git`. GitHub's initial README commit merged in, so a normal push works (no force).

## Next step

1. Owner approves the Phase 5c plan (`docs/PHASE5C_PLAN.md`).
2. Build 5c.1–5c.4, then the owner checks and approves.

## Blockers and questions for the owner

- Wikipedia is cited for a few facts (square numbers, off-by-one, prefix sums, cycle detection, Big O, space–time tradeoff, topological sorting); the owner may veto it.

## Not tested yet

- Owner checked Phase 0 on their Android phone (2026-10-19): works. Device model and Android version not recorded.
- Service worker update path is tested in headless Chrome (`browser-check.mjs update`), not yet confirmed on the owner's phone.
- `vite.config.ts` is not type-checked (it would need `@types/node`, not approved). See `docs/IDEAS.md`.
- Screen reader behaviour has not been tested; captions use `aria-live`.
- Owner checked Phase 1 on the site and their Android phone (2026-10-19): all good.
- Owner checked Phase 2 on site and phone (2026-10-19): all good.
- Multi-day behaviour is tested with unit tests and a Chrome relaunch check on simulated dates; not yet over real days on a phone.
- The Android back button is simulated in tests by stepping back one browser history entry; the installed PWA's back gesture has not been checked.

## Environment notes

- WSL here has no IPv6 route, but DNS returns IPv6 first, so downloads hang. Use `curl -4`. `~/.bashrc` sets `PATH` for `~/.local/node` and `NODE_OPTIONS=--dns-result-order=ipv4first`.
- Browser checks: headless Windows Chrome driven over the DevTools protocol by a Windows `node.exe` (WSL can't reach Chrome's debug port in NAT mode). Script kept outside the repo; see `docs/IDEAS.md`.
- TypeScript is pinned to 6.0.x until typescript-eslint supports 7.

## Session log

- 2026-10-19: Created CLAUDE.md, PROJECT_CONTEXT.md and PROGRESS.md. No code written.
- 2026-10-19: Reviewed the prototype, recorded the decisions (stack, hosting, layout), ran git init, wrote the Phase 0 plan.
- 2026-10-19: Owner approved the plan and asked for the whole phase at once. Installed Node 24 LTS user-level (nvm failed because of the IPv6 issue). Built tasks 0.1–0.5, one commit each.
- 2026-10-19: Owner pushed. CI checks green on GitHub; deploy blocked until Pages source is set to GitHub Actions.
- 2026-10-19: CI green and Pages live. Owner tested on web and Android: works. Phase 0 closed. Phase 1 plan written.
- 2026-10-19: Owner approved the Phase 1 plan, chose "Claude drafts, owner reviews" for lessons, and asked for the check script in the repo. Built 1.1–1.4, one commit each. Not pushed.
- 2026-10-19: A manual 3rd re-run of the old Phase 0 run failed with "Multiple artifacts named github-pages" (attempts 2 and 3 both uploaded one). Fixed by naming the artifact per attempt. Not pushed yet.
- 2026-10-19: Owner approved Phase 1. Asked whether the curriculum is fixed or generated on request: explained the phased curriculum (Phases 3–6) plus lessons on request drafted by Claude and reviewed; no in-app generation (needs live model calls). Raised that LLD is missing from the phase list.
- 2026-10-19: Owner chose to add LLD as Phase 5b (CLAUDE.md section 9 updated) and asked for a full syllabus first. Drafted `docs/CURRICULUM.md`.
- 2026-10-19: Owner approved the curriculum and asked for real-world case studies and published incident articles, with the goal of senior-SDE confidence. Added Phase 5c to CLAUDE.md and the curriculum. Checked that 7 articles load; Uber/Netflix/Swiggy blogs marked TODO-VERIFY.
- 2026-10-19: Owner chose points + streak + badges and a 1-lesson daily goal. Wrote the Phase 2 plan.
- 2026-10-19: Owner asked for streak penalties; chose XP + streak coins (CLAUDE.md section 7 updated). Built Phase 2 tasks 2.1–2.4, one commit each. Not pushed.
- 2026-10-19: Owner approved Phase 2 and asked to make sure progress resumes across launches and days, then to build Phases 3 and 4. Added the persistent-storage request and the relaunch check. Owner chose tap-based DSA exercises (no code editor for now).
- 2026-10-19: Built Phase 3 (3.1–3.4). Fixed my own check-script bug (a recursive helper hung a run) and stopped 8 leftover headless Chrome processes it left behind; the script now refuses to start if its debug port is taken.
- 2026-10-19: Built Phase 4 (30 DSA lessons and 6 new views). Batches 4.2–4.4 committed as one change because they share the registry, catalog and claim tests.
- 2026-10-19: Owner reported the phone app didn't show new content after the push. Cause: cache-first page loading (new version only on the launch after next). Fixed with network-first pages, update checks on resume, and a Reload banner. `update` check reproduced the bug on the old worker (1 failure) and passes on the new one (6/6); pwa 7/7, persist 11/11.
- 2026-10-19 (new session): the update fix (c477bde) was pushed and deployed (CI green). Owner approved Phases 3 and 4 and the Phase 5 plan.
- 2026-10-19: Built Phase 5.1 (sim engine) and 5.2 (5 traffic lessons). Challenge goals were chosen from measured runs over 10–20 seeds; two first attempts ("uneven work" with 3 servers, and a stampede goal that allowed recovery) did not separate right from wrong settings and were redesigned.
- 2026-10-19: Built Phase 5.3 (5 data lessons). A suite run of mine failed one export check because my launch command collapsed the leading \\ of a Windows path; it also left 112 screenshots in a stray D:\wsl.localhost folder, which I checked and removed. Runs now go through a launcher script without that quoting.
- 2026-10-19: Built Phase 5.4 (6 lessons, 3 models, 1 trace). Found and fixed clipped diagram notes (sharding since 5.3, topological sort since Phase 4); proved the new checks fail on the old build via a temporary worktree at HEAD, then removed it.
- 2026-10-19: Owner pushed Phase 5. A re-run of an old workflow run (commit 2b14b10, attempt 4) finished 14 s after the new deploy and put the old version back; a manual "Run workflow" on a0dc2aa restored it. README now says to use "Run workflow", not "Re-run". Owner saw no progress on the phone: progress was earned only on the laptop (saves are per browser); export/import explained. Owner approved Phase 5.
- 2026-10-19: Owner approved the Phase 5b plan and chose to start 5c only after approving 5b. Built 5b.1–5b.4 (engine plus 14 lessons), one commit per batch.
- 2026-10-19: Owner pushed Phase 5b, but the site showed Phase 5. Cause, from the GitHub API: the push run (c1bb890) deployed at 14:26:54, then a re-run (attempt 4) of an older manual run for a0dc2aa finished at 14:32:46 and published the old commit again; the Reload banner then reloaded into that old version. Fix: the deploy job now checks that the run's commit is still the tip of main (git ls-remote) and skips deploying otherwise. Logic checked locally against the real repo (current main: deploy; old commit: skip); not yet seen running on GitHub.
- 2026-10-19: Owner pushed the CI fix; the push run for ad1f667 deployed and the site shows LLD. Owner approved 5b and asked to continue. Uber's H3 facts can come from h3geo.org (copyright Uber Technologies), which resolves the curriculum's TODO-VERIFY on Uber's blog. Wrote the Phase 5c plan.


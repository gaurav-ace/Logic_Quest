# Phase 2 plan: Rewards and progress

Status: waiting for the owner's approval.

**Goal (CLAUDE.md section 9):** points, streaks (with freeze), levels, badges, persistence, export and import.

**Done when:** the reward rules are config-driven and tested, including anti-farming and streak edge cases, and progress survives a reload.

**Owner's choices:** points, levels, streak and badges, with no cosmetic unlocks; the daily goal is 1 lesson.

## Key design choice: rewards are computed from a history, never stored as totals

Progress is saved as a log of events, such as "answered question 2 of *cache*, option 0, on 2026-10-19". Points, level, streak and badges are always **calculated from that log** by pure functions. This rules out the worst bugs (CLAUDE.md section 10: never lose or double-count points):
- **Replays can't farm points.** Each question scores only its first correct answer, so a replay adds events but no points.
- **No double-counting.** Every event has a unique id. Importing a backup, or two open tabs, merges logs by id, so the same answer is never counted twice.
- **Tuning is safe.** Change a number in the config and everything is recalculated consistently.

## Reward rules (all in `src/rewards/rewards.config.json`)

| Rule | Starting value |
|---|---|
| First-try correct answer | 10 points |
| Correct after one or more wrong tries | 5 points |
| Wrong answer | 0 points (never negative) |
| First completion of a lesson (every question answered correctly) | +10 bonus |
| Replay of a completed lesson | 0 points; still counts towards the daily goal |
| Levels | point thresholds in a list (level 2 at 30, level 3 at 80, …) |
| Daily goal | 1 completed lesson per day (local date); can be set to 1–3 |
| Streak freeze | 1 per calendar week (Monday–Sunday), used automatically to cover a single missed day |
| Badges | defined in config by type: finish N lessons, finish a whole track, finish a hard lesson, fix a past mistake (answer correctly a question you got wrong on an earlier day), reach a streak of N days |

**Streak edge cases to test:** two lessons on one day still count as one day; a single missed day uses the freeze; two missed days break the streak; a second freeze in the same week isn't allowed; week boundaries; month and year boundaries; daylight-saving changes (days are compared as local calendar dates, not 24-hour blocks); the clock moving backwards (no negative gaps, no crash); and a brand-new user.

## Tasks (built in order, one commit each, reported once at the end)

| # | Task | Main files | Tested by |
|---|---|---|---|
| 2.1 | **Reward engine (pure).** Event types, config file plus config validation (bad config fails loudly), and functions for points, level, streak with freeze, badges and "what's new" (the points and badges a single answer just earned, used for feedback). | `src/rewards/{events,config,engine}.ts`, `rewards.config.json`, tests | Unit tests: anti-farming (replay, re-answering, duplicate events), first-try versus retry, every streak case above, each badge type, levels at exact thresholds, and an invalid config |
| 2.2 | **Storage, export and import.** Versioned save in `localStorage`, read again on load; merge by event id; a newer save from another tab is merged, not overwritten; corrupt data is **kept in a backup key** and reported, never silently dropped; export as a `.json` file; import validates the file, then merges. Storage failures (private mode, full storage) show a notice and the app keeps working. | `src/progress/{store,backup}.ts`, tests | Unit tests with a fake storage: round trip, merge with no double count, corrupt data kept, wrong version, import of a bad file rejected with a message, storage throwing |
| 2.3 | **Wire rewards into lessons.** The quiz records events. Feedback shows the points earned ("+10 points, first try"), or "Already scored" on a replay, plus any new badge. A small bar on the home screen shows points, level, streak (with freeze status) and today's goal, and completed lessons get a ✓. Lesson schema gains `track` (web, hld, lld, logic, dsa, agentic, real-world) and `level` (easy, medium, hard), needed for track and hard-lesson badges. | `src/render/{quiz,home,hud}.ts`, `src/lesson/schema.ts`, lessons | Browser checks: points appear after a first-try answer, a replay shows "Already scored", the values survive a reload, 48 px targets, reduced motion |
| 2.4 | **Progress screen** (`#/progress`): points, level bar, streak and best streak, a 7-day view, badges (earned and locked, each with what it takes), settings (daily goal, calm mode with no pop-ups), and export and import buttons. Import shows what it will add before merging. | `src/render/progress.ts`, `src/router.ts`, `src/styles.css` | Router tests; browser checks: export produces a file, importing it again adds nothing (no double count), calm mode hides pop-ups, Android back from the progress screen |

## Risks

- **Logic is the risk here, not the UI.** Most of the effort goes into 2.1 tests.
- **localStorage can be cleared** by the browser or the user. Export is the safety net, and the progress screen says so plainly. (A cloud backend is out of scope.)
- **Exporting on Android:** the file goes to Downloads through Chrome's normal download flow. This needs a check on your phone.
- **No new dependencies** are planned.

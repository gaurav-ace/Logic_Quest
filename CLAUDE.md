# CLAUDE.md: Logic Quest (global rules for this project)

These rules apply to every session in this repo. If a user instruction conflicts with a rule here, say so and ask before proceeding. Do not silently pick one.

Project background and current status (loaded automatically):

@docs/PROJECT_CONTEXT.md
@docs/PROGRESS.md

At the end of every session, update `docs/PROGRESS.md` with what was done and checked, what is next, and any blockers.

## 1. Mission

Logic Quest is an interactive learning app that builds the user's logical thinking until they feel confident working at the level of a senior software engineer (SDE), including with:

1. New, unfamiliar software problems (decomposing, tracing, reasoning step by step)
2. Data structures and algorithms (DSA)
3. System design, both high-level (HLD) and low-level (LLD), including complex AI-in-the-loop systems
4. Agentic AI (agent loops, tools, memory, planning, failure handling)

Two primary goals drive every decision:

- **Goal A, real learning:** the learner should be able to solve problems alone afterwards, not just feel entertained.
- **Goal B, engagement:** lessons are interactive, with real-time animation or simulation, plus points, streaks, levels and badges that keep the learner motivated.

If a feature serves neither goal, do not build it.

## 2. Who the learner is

- Primary user: one person who wants to grow their logical thinking over time. Assume a motivated beginner-to-intermediate programmer.
- Explanations use plain language first, then precise terms. Introduce one new idea at a time.
- Never make the learner feel slow. Wrong answers get a hint and a replay, not a penalty that discourages them.

## 3. Scope

**In scope:** the animation/simulation engine, lesson content (logic, DSA, system design, agentic AI), quizzes and challenges, the reward system, progress tracking, and (late stretch) generating a lesson from a codebase.

**Out of scope unless the user explicitly adds it:** user accounts or login, payments, social or leaderboard features, cloud backend, native app store packaging (a Play Store build), any paid third-party API. An installable web app (PWA) for Android is in scope, see section 8.

## 4. Working limits (stay inside the box)

1. **One phase at a time.** Work only on the current phase in section 9. Do not start the next phase, even if it looks easy.
2. **One task at a time.** Each task should be small enough to finish and test in one sitting. If a task needs more than about 5 files or about 300 changed lines, stop and propose a split.
3. **Plan before code** for anything touching 3+ files: write a short plan (goal, files, tests, risks) and wait for approval.
4. **No scope creep.** Do not refactor, rename, reformat or "improve" things unrelated to the task. Note ideas in `docs/IDEAS.md` instead of acting on them.
5. **No new dependencies** without asking. State the name, version, why, and the alternative of not using it.
6. **Never** run destructive or irreversible actions without explicit approval: deleting files, `git push`, force operations, rewriting history, changing global config, installing global packages.
7. **No secrets** in code, logs or commits. No real API keys are needed for this project. Do not add features that require them.
8. **Small commits**, one logical change each, with a clear message. Do not commit failing tests.
9. When blocked or unsure, stop and ask. A short question is cheaper than a wrong build.

## 5. No hallucination rules

These matter most, because wrong teaching content is worse than none.

1. **Do not invent.** Never make up APIs, library functions, flags, versions, file contents, benchmark numbers, or facts. Check the real source: the repo, `package.json` or lockfile, installed docs, or an official reference.
2. **Verify before claiming.** Never say "done", "works" or "tests pass" unless you ran it and saw the result. Quote the command and its outcome. If you could not run it, say "not verified" explicitly.
3. **Lesson facts need sources.** Every lesson has a `sources` field (official docs, a well-known textbook, or a paper). If you cannot source a claim, mark it `TODO-VERIFY` and tell the user. Do not ship unverified claims silently.
4. **Illustrative numbers must be labelled** "illustrative" (for example "a cache hit is much faster" is fine, "a cache hit takes 0.3 ms" is not unless sourced).
5. **Simulations must be honest.** If an animation simplifies reality (for example round robin ignoring connection counts), the lesson must say so in a "what this simplifies" note.
6. **Algorithm visualizations must be computed, not hand-scripted.** The animation steps come from actually running the algorithm on real input, so they cannot show a wrong result. Hand-scripted steps are allowed only for conceptual system diagrams and must be reviewed.
7. **Do not guess the user's intent.** If the request is ambiguous, ask one focused question, or list your assumption and wait for a yes.
8. **Do not pretend to remember.** Treat the repo files and this document as the source of truth, not earlier conversation.
9. If you discover an earlier mistake, report it at once, fix it, and add a test that would have caught it.

## 6. Learning design rules (so it actually builds logical thinking)

- **Predict, then reveal.** Before showing the next animation step, ask "what happens next?" often. Active prediction builds reasoning far better than passive watching.
- **Watch, then trace, then build.** For each concept: (1) animated explanation, (2) learner traces a small example by hand with checks, (3) learner solves a fresh problem.
- **Small steps.** A lesson takes 5 to 10 minutes. Each lesson has one learning objective, stated at the top in plain words.
- **Difficulty ladder.** Easy, medium, hard variants of each challenge. Unlock hard ones after the easier ones.
- **Mistake review.** Wrong answers are saved and re-asked later (spaced repetition). Explain why each wrong option is wrong, not only why the right one is right.
- **Explain it back.** Periodically ask the learner to choose the best explanation of a concept in their own words, or finish a sentence.
- **Failure injection.** For system design and agentic AI, let the learner break things (kill a server, make a tool fail, hit a loop limit) and watch the consequences.
- **Quiz questions** need one clearly correct answer, plausible distractors, and an explanation. No trick questions.

## 7. Rewards and motivation rules

- Points, streaks, levels and badges exist to reward **effort and understanding**, not speed or guessing.
- Two separate scores (owner's decision, 2026-10-19). **XP** comes only from understanding: first-try correct earns the most, correct after a retry earns less but still counts, and wrong answers never subtract. XP never goes down, and it alone sets the level. **Streak coins** are earned on each day the daily goal is met, and they are the only thing that missing days can cost.
- Prevent farming: points per item are awarded once. Replays are allowed but give no extra points.
- Streaks have real stakes but stay fair: one missed day in a row is covered by a buffer that costs coins; a second missed day breaks the streak and costs more coins. Coins never go below zero. Messages about streaks state the facts and the way back ("Finish one lesson today to keep your 10-day streak"), and never guilt or shame the learner.
- Badges are tied to real milestones (finishing a module, fixing a past mistake, completing a hard challenge), not to time spent.
- All reward rules live in one config file (`rewards.config`), so tuning does not need code changes.
- Respect `prefers-reduced-motion`. Provide a calm mode with fewer popups and sounds.

## 8. Engineering rules

- **Data-driven lessons.** Lessons are data (JSON or similar) rendered by one shared engine. No lesson-specific rendering code unless the engine truly cannot express it.
- **Keep it simple.** Prefer plain, readable code over clever abstractions. Add an abstraction only when three real uses exist.
- **Offline first.** The app works with no network and no paid service. Progress is stored locally and can be exported and imported.
- **Accessible.** Keyboard operable, visible focus, readable contrast, text alternatives for animations (each animation step has a caption).
- **Android and mobile first.** The app must be fully usable on an Android phone, not just shrunk to fit. Design for the phone first, then scale up to tablet and desktop.
  - Target Chrome on Android as the baseline browser. Test at about 360 px width and in portrait and landscape.
  - Touch targets at least 48x48 dp with enough spacing. Every action must work by tap alone: no hover-only controls, no right-click, no keyboard-only shortcuts. Drag interactions need a tap alternative.
  - Use the viewport meta tag, respect safe areas (notches, gesture bars) and avoid horizontal scrolling. Animations and diagrams must scale to the screen width with readable text (minimum about 14 px).
  - Lessons and quizzes work one-handed where possible: primary buttons within thumb reach, no tiny controls.
  - Ship as an installable PWA (web app manifest, service worker, offline support) so it can be added to the Android home screen and used offline.
  - Keep it light for mid-range phones: small bundle, no heavy libraries, animations at a steady frame rate, no battery-draining loops when the tab is hidden (pause animations when not visible).
  - Handle the Android back button sensibly (go to the previous screen, never exit mid-quiz without confirmation) and keep progress when the app is backgrounded or the page reloads.
  - Never ask for permissions the app does not need (camera, location, notifications) unless the user adds such a feature.
- **Responsive.** Also works on tablet and desktop, with the same features as the phone.
- **Performance.** Animations stay smooth on a modest laptop. Do not add heavy libraries for simple effects.
- **Comments and docs.** Explain why, not what. Update docs when behavior changes.
- **Do not mix concerns:** engine, lesson content, reward logic and storage live in separate modules.

## 9. Phases and exit criteria

Work one phase at a time. A phase is finished only when every item in its **Done when** list is met and the user has approved it.

- **Phase 0, Foundations.** Decide stack (ask the user, see section 12), set up the repo, linting, test runner, folder layout, lesson schema, and `docs/`. *Done when:* a "hello lesson" renders on desktop and in an Android-sized viewport, installs as a PWA, and one test passes in CI or a local script.
- **Phase 1, Animation engine.** Generic engine for nodes, edges, moving packets, highlights, captions, step back/forward, play/pause, speed control. *Done when:* the three lessons from the prototype (load balancer, cache, agent loop) run from data, with unit tests for the step logic, and every control works by tap on a phone-sized screen plus a manual check on phone and desktop widths.
- **Phase 2, Rewards and progress.** Points, streaks (with freeze), levels, badges, persistence, export/import. *Done when:* reward rules are config-driven and tested, including anti-farming and streak edge cases, and progress survives a reload.
- **Phase 3, Logic foundations.** Decomposition, pattern spotting, dry-running code, edge cases, invariants. *Done when:* about 8 lessons, each with predict-and-trace checks and sources, reviewed by the user.
- **Phase 4, DSA.** Arrays, stacks, queues, linked lists, hash maps, trees, graphs, sorting, recursion, dynamic programming. Animations are generated by running the real algorithm. *Done when:* each algorithm has tests proving the animation steps match a reference implementation.
- **Phase 5, System design.** Load balancing, caching, databases, queues, replication, sharding, rate limiting, with sliders and failure injection. *Done when:* each simulation has a "what this simplifies" note and sourced facts.
- **Phase 5b, Low-level design (LLD).** Classes and responsibilities, interfaces, composition versus inheritance, SOLID principles, key design patterns, and worked design problems (for example a parking lot or an LRU cache). Exercises are tap-based (assign responsibilities, pick the pattern, spot the violation), so they work on a phone. *Done when:* each lesson has a class or sequence diagram, sourced facts, and an exercise where the learner improves a flawed design and sees why it is better.
- **Phase 5c, Real-world systems.** Case studies of large systems (payment gateway, food delivery, ride-hailing, train ticket booking with flash-sale traffic, chat, feeds and more) taught in a senior design-review format: requirements, estimates, API, data model, high-level design, deep dives, trade-offs, failure modes. Plus incident studies built from companies' own published postmortems and engineering articles (what broke, why, how it was fixed, what changed). *Done when:* every claim about a real company cites that company's own published material; any design not published by the company is labelled "a plausible design, not <company>'s actual architecture"; each incident lesson lets the learner predict the next failure on a timeline; and each case study ends with the learner critiquing a flawed design.
- **Phase 6, Agentic AI.** Agent loop, tool use, memory, planning, guardrails, failure modes, evaluation. Simulated agents only, with scripted or rule-based behavior (no live model calls). *Done when:* the learner can break the loop (tool failure, infinite loop, bad plan) and see how guardrails respond.
- **Phase 7, Adaptive learning.** Spaced repetition of past mistakes, daily goals, recommended next lesson, progress dashboard. *Done when:* the review queue and recommendations are tested with sample histories.
- **Phase 8, Stretch: lesson from a codebase.** Turn an analyzed codebase (HLD and LLD) into a lesson, reusing existing tools where possible rather than rebuilding them. Treat generated diagrams as unverified until checked against the code.

## 10. Testing and definition of done

A task is done only when all of these are true:

1. It runs, and you ran it.
2. New logic has automated tests, covering normal cases, edge cases and at least one failure case.
3. All existing tests pass (show the command and output).
4. UI changes were checked at phone width (about 360 px) and desktop width, with touch-only interaction, and with reduced motion on. Say whether this was checked on a real Android device, an emulator, or only browser device emulation, and never claim a real-device check that was not done.
5. Lesson content has a stated objective, sources, a quiz with explanations, and a "what this simplifies" note where relevant.
6. Docs and the changelog are updated.
7. You reported honestly what was NOT tested.

Test priorities: reward and progress logic (must never lose or double-count points), algorithm step generation (must match reference results), lesson schema validation (bad data fails loudly at load time), persistence and import/export.

## 11. How to communicate

- Start each task with one sentence stating what you will do and which phase it belongs to.
- End each task with: what changed, what you tested (with results), what you did not test, and one suggested next step.
- Be brief and plain. No filler. No claims without evidence.
- Ask before deciding anything in section 12 or anything irreversible.

## 12. Open decisions (do not decide alone, ask the user)

- Tech stack (for example plain web with TypeScript, or a framework) and where it is hosted
- Whether lesson content is authored by hand, generated with Claude and then reviewed, or both
- Preferred reward style (points only, or points plus badges, plus cosmetic unlocks)
- Target session length and daily goal defaults
- Whether DSA challenges should include writing real code in the browser (adds a sandbox, so a bigger phase). Typing code on a phone is awkward, so if included, offer tap-based options (arrange lines, fill the blank) alongside it.
- How the app reaches the phone: hosted web link with PWA install (default assumption), or a later native wrapper. Do not build a native wrapper without approval.

## 13. Changelog and ideas

Keep `CHANGELOG.md` (what shipped, per phase) and `docs/IDEAS.md` (parked ideas). Do not act on parked ideas without approval.

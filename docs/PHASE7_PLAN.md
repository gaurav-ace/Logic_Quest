# Phase 7 plan: adaptive learning

Status: draft, awaiting the owner's approval (2026-10-20). Branch: `claude/adaptive` from `main` once 6b is merged.

Exit criteria (CLAUDE.md section 9): spaced repetition of past mistakes, daily goals, a recommended next lesson and a progress dashboard; **the review queue and the recommendations are tested with sample histories.**

## 1. What exists already (so nothing is rebuilt)

- Every answer is already an event in the progress log: lesson, question, option, right or wrong, day. Wrong answers from day one are there, so the review queue works on the owner's existing history, with no migration.
- The reward engine already counts a "fixed mistake" when a missed question is answered right on a later day (badges `fix-mistake`, `fix-ten-mistakes`), and awards XP for an item only once.
- Daily goal (1–3 lessons a day, in settings) and the streak. Replays count towards the goal.
- Home has an "Up next" card: the first unlocked, unfinished lesson in curriculum order.

## 2. Approach

### 7.1 Review queue (spaced repetition of mistakes)

- **What goes in:** every multiple-choice question the learner has ever got wrong: lesson quiz questions and practice quiz and predict-the-output checks. Design and critique exercises need their diagram, so they aren't asked alone; a miss there puts "Redo the exercise in <lesson>" in the queue instead.
- **Schedule (Leitner boxes, simple and predictable):** a missed question goes to box 1. Right in review → next box; wrong → back to box 1. Box intervals are 1, 3, 7, 14 and 30 days, then the question is "mastered" and leaves the queue. The numbers live in `rewards.config.json`, so they can be tuned without code.
- **Computed from the log, never stored separately.** The queue is rebuilt from answer events, the way scores are. So it can't drift, and import and merge keep working.
- **A review answer is an ordinary answer event.** So the existing rules apply unchanged: no XP twice for the same item, and a mistake put right on a later day counts towards the badges. No new reward rules.
- **Options are shuffled in reviews** (seeded per question and day), so the learner recalls the idea, not the position. This fixes the known "right answer first" problem for reviews.
- **Screen `#/review`:** one question at a time, tap only. After each answer: why it's right, why the chosen option is wrong, and a link back to the lesson. Up to 10 a session, oldest due first. Home shows "N reviews due" when there are any.

### 7.2 Daily goal with reviews

- Today the goal counts lessons only. Proposed: **finishing a review session of 5 (or all that are due, if fewer) also counts as one lesson** towards the goal. Once all 103 lessons are done, the streak can still be kept by learning instead of replaying.
- A "Today" card on Home: lessons done of the goal, reviews due, and one line on what's left ("1 lesson or 5 reviews to keep your 4-day streak"), stated as fact, never as guilt (CLAUDE.md section 7).

### 7.3 Recommended next lesson

- Rule-based and explained, never a black box. Candidates: unlocked, unfinished lessons, plus untried practice sets in finished tracks.
- Order: due reviews first (as a separate card). Then the next lesson in the track the learner is in the middle of. If a track's first-try accuracy is low, the next lesson there waits until its reviews are done. A track not touched in 7 days or more is nudged up.
- The card says why: "Next in System design, where you left off", or "Your caching answers are shaky: 3 reviews first".
- Pure function from (lessons, events, today), so it's tested on sample histories.

### 7.4 Progress dashboard

- On the Progress page, per track: lessons done of the total, first-try accuracy, questions in review and mastered, and the 3 lessons with the most misses (each links to its lesson).
- Plain numbers and bars made with CSS, no chart library. Each bar has a text label (accessible, readable at 360 px).

## 3. Task split

| Task | What | Files (about) |
|---|---|---|
| 7.1 | Review scheduler (pure) and tests with sample histories; boxes in the config | `src/review/schedule.ts` + test, `rewards.config.json`, config validator |
| 7.2 | Review screen, "N due" on Home, option shuffle; browser mode `review` | `src/render/review.ts`, `main.ts`, `router.ts`, `home.ts`, styles |
| 7.3 | Daily goal counts a review session (only if the owner says yes); Today card | `src/rewards/engine.ts` + tests, `home.ts` |
| 7.4 | Recommender (pure) with reasons, tests; Up next card uses it | `src/review/recommend.ts` + test, `home.ts` |
| 7.5 | Dashboard on Progress; browser checks | `src/render/progress.ts`, styles, `scripts/browser-check.mjs` |

## 4. Tests

- **Scheduler, on hand-made histories:** a miss is due the next day; right answers walk up the boxes on the right days; a miss in box 4 drops to box 1; mastered questions leave; two misses of one question count once; same-day retries don't move it up a box; an import merging two devices' logs gives the same queue as one log; a question deleted from a lesson is dropped, not crashed on.
- **Random histories (300 seeds):** no question is due before its interval; nothing correct-only is ever in the queue; the queue never repeats a question.
- **Rewards unchanged:** reviewing never gives XP twice; a review put right on a later day counts as a fixed mistake (the existing engine tests plus new ones).
- **Recommender, on sample histories:** new learner → first lesson; mid-track → the next in that track; low accuracy with reviews due → reviews first; a track idle for 8 days → nudged up; everything done → practice or reviews; every result has a reason.
- **Mutation checks:** e.g. forgetting to reset to box 1, or off-by-one intervals, must fail tests.
- **Browser:** review session by touch at 360 px (shuffled options, explanations, the queue shrinking, survives a reload); Today card; dashboard layout; reduced motion; desktop.

## 5. Decisions for the owner

1. **Should a review session count towards the daily goal** (section 7.2)? I recommend yes: 5 reviews = 1 lesson.
2. **Shuffle options everywhere, not only in reviews?** That would fix the old "right answer usually first" problem across all 168 older questions. I recommend yes, now. It's a small change (seeded, so a question keeps one order within a session), with a test.
3. Leitner intervals 1, 3, 7, 14, 30 days: fine to start with? They're in the config, so easy to change later.

## 6. Risks

- **Old answer events point at questions by index.** If a lesson's quiz was edited since, an index may now point at a different question. Mitigation: store a short fingerprint of the question text with new answers, and drop old reviews whose question no longer exists. (Old events can't be fingerprinted; a few may show a question that has since changed. That's acceptable for review.)
- A big backlog on the first day (every past miss is due at once). Mitigation: at most 10 per session, oldest first, and the Home card says "10 of 37 due".

## 7. Sources to check while building

The review screen's one-line "why reviews work" note must be sourced. Candidates to check: Roediger and Karpicke (2006), on the testing effect; Cepeda et al. (2006), a meta-analysis of distributed practice; Leitner's box system (1972). Anything I can't check gets marked `TODO-VERIFY` and reported.

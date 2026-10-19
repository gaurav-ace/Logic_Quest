# Phase 3 plan: Logic foundations

Status: 3.1–3.4 built 2026-10-19. Waiting for the owner's content review of the 8 lessons (CLAUDE.md: done when reviewed by the owner).

**Goal (CLAUDE.md section 9):** decomposition, pattern spotting, dry-running code, edge cases, invariants.

**Done when:** about 8 lessons exist, each with predict-and-trace checks and sources, and the owner has reviewed them.

## New engine features (Phase 4 reuses both)

1. **Predict, then reveal** (CLAUDE.md section 6). Any diagram step can carry a `predict` question. Before that step plays, the learner answers "what happens next?", and every option is explained. Predictions give feedback and a tally ("You predicted 3 of 4"), not XP: XP stays tied to the quiz, so the reward rules don't change.
2. **Trace lessons, computed rather than scripted** (CLAUDE.md section 5.6). A trace lesson names a *program*: a TypeScript generator that actually runs the algorithm on an input and records a frame after each step. Each frame holds the current code line, the variables, and a view of the data (an array with pointers, or a table). The displayed code and the generator live in the same file. Tests check that the program's final result matches a plain reference implementation on many inputs. Questions inside a trace ("what is `best` after this line?") take their correct answer from the real run, and their distractors come from labelled common mistakes (the value before the line ran, an off-by-one value, and so on).
3. **"New example" button:** after watching, the learner reruns the same lesson on a fresh random input and traces it again. This is the "trace, then build" step.
4. **Lesson list grouped by track,** with progress per track. A lesson can name `requires` (other lessons to finish first), so hard lessons unlock after their foundations.

## Lessons (from docs/CURRICULUM.md)

| # | Lesson | Kind | Level | Planned source |
|---|---|---|---|---|
| L1 | Break it down | Diagram with predictions | easy | Pólya, *How to Solve It* |
| L2 | Spot the pattern (sum of odd numbers) | Trace | easy | Wikipedia "Square number" (sum of the first n odd numbers is n²); the trace itself checks it on every run |
| L3 | Dry-run code (find the largest value) | Trace | easy | Myers et al., *The Art of Software Testing* (desk checking) |
| L4 | Loops and their limits (off-by-one) | Trace | medium | Wikipedia "Off-by-one error" (fencepost error) |
| L5 | Edge cases (average of a list) | Trace | medium | Myers et al., *The Art of Software Testing* (boundary value analysis) |
| L6 | Invariants (running total) | Trace | medium | Cormen et al., *Introduction to Algorithms*, 4th ed. (loop invariants) |
| L7 | Work backwards (reach N with +1 and ×2) | Trace | medium | Pólya, *How to Solve It* (working backwards). The claim that the backward method is shortest is checked against breadth-first search in tests |
| L8 | Estimate before you build | Trace | hard | Bentley, *Programming Pearls*, "The Back of the Envelope". All numbers are labelled illustrative |

## Tasks (built in order, one commit each)

| # | Task | Tested by |
|---|---|---|
| 3.1 | Predictions on diagram steps (schema, validator, renderer, tally) | Validator tests; browser check that a prediction appears before the step and is explained |
| 3.2 | Trace engine: frame types, a choices helper for computed distractors, program registry, trace lesson schema, renderer (code, variables, array and table views), "New example" | Unit tests for choices (answer always included, options unique); browser checks at 360 px |
| 3.3 | The 8 lessons | Each program is tested against a reference implementation on 200+ random inputs; catalog validation; browser walk-through of every lesson |
| 3.4 | Home screen grouped by track; `requires` unlocking | Unit tests for unlocking; browser checks |

## Risks

- **Book sources have no links.** Titles and authors are given; edition and chapter only where certain.
- **Wikipedia is not on CLAUDE.md's preferred list** (official docs, textbooks, papers). It's used for two well-known facts, and the trace verifies one of them on every run. The owner can veto this.

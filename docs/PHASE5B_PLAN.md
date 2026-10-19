# Phase 5b plan: Low-level design (LLD)

Status: approved 2026-10-19 ("Approve, build all of it"). All four batches built 2026-10-19; awaiting the owner's review.

**Goal (CLAUDE.md section 9):** classes and responsibilities, interfaces, composition versus inheritance, SOLID, key design patterns, and worked design problems, with tap-based exercises (assign responsibilities, pick the pattern, spot the violation).

**Done when:** each lesson has a class or sequence diagram, sourced facts, and an exercise where the learner improves a flawed design and sees why it is better.

## The new pieces (5b.1)

LLD is about the *shape* of code, so Phase 5b adds three things to the engine:

- **Class diagram view:** boxes with a class name, a few fields and methods, and labelled arrows for "inherits", "implements", "has" (composition) and "uses". It works as a step view in diagram lessons and as a frame view in traces, so one implementation serves both. Laid out for a 360 px phone: at most about 4 classes on screen, in two columns, text at least 14 px. As built: the validator allows at most 5 members per class instead of folding long lists, so nothing is hidden.
- **Sequence diagram view:** a few objects across the top and the calls between them as numbered arrows, for flows such as Observer notifying listeners, or an agent calling a tool. Each step can highlight one call.
- **"Improve the design" exercise (new lesson part, after the steps and before the quiz):** the learner sees a flawed class diagram and a change request (for example "add an electric-vehicle spot"). They tap the classes they'd have to edit (spot the problem), then pick the fix from options, each explained. The diagram then changes to the improved design, and the same change request runs again: now one class changes instead of four. That before/after count is the "see why it is better". Correct first try earns XP, as quizzes do; wrong taps get a hint, never a penalty.
- **Short code panels on steps:** a few lines of Python (at most 34 characters a line, as in the traces) to show what the diagram means in code.

**Honesty:** class diagrams are conceptual, so they are hand-written data (CLAUDE.md allows this for conceptual diagrams, with review). The validator checks that every arrow, highlight and "classes to edit" answer names a real class, and that each exercise's fixed design really needs fewer edits for the change request than the flawed one. Anything that runs (a state machine, the LRU cache, the rate limiter) is a computed trace tested against a reference, as in Phase 4.

**Tests:** class and sequence layouts fit 304 px with nothing overlapping (unit test, plus the browser check that nothing is drawn past an SVG's edge); validator failures for bad references; exercise state logic (taps, retries, XP once); browser walk-through of every lesson at 360 px, touch only.

## Lessons (docs/CURRICULUM.md, O1–O14)

| Batch | Lessons | Kind |
|---|---|---|
| 5b.1 Engine | class and sequence views, code panels, "improve the design" exercise | (engine) |
| 5b.2 Basics and SOLID | O1 Objects and responsibilities, O2 Encapsulation, O3 Interfaces and polymorphism, O4 Composition versus inheritance, O5 SOLID part 1 (single responsibility, open/closed, Liskov), O6 SOLID part 2 (interface segregation, dependency inversion) | diagram + exercise |
| 5b.3 Patterns | O7 Strategy and Factory, O8 Observer (sequence diagram), O9 Decorator and Adapter, O10 State machines (computed trace: a real state machine runs an event list; invalid events are rejected) | mixed |
| 5b.4 Design problems | O11 Parking lot, O12 LRU cache (computed trace: hash map plus doubly linked list, tested against a reference on 200 random operation lists), O13 Rate limiter class (reuses the tested S12 token bucket, wrapped in a class with an injectable clock so it can be tested), O14 Tool-calling agent classes (Tool, Memory, Planner, Guardrail; sequence diagram of one loop) | mixed |

Each lesson: one objective, 5–8 steps with predictions, one "improve the design" exercise, a 2-question quiz, sources, and a "what this simplifies" note. `requires` builds the ladder (patterns need SOLID; design problems need the patterns they use; O12 also needs D7 Linked lists and D12 Hash maps).

## Sources (to check while building; unverified items get `TODO-VERIFY`)

Candidates: Gamma, Helm, Johnson and Vlissides, *Design Patterns* (1994; Strategy, Factory Method, Observer, Decorator, Adapter, State); Robert C. Martin, "Design Principles and Design Patterns" (2000) and *Agile Software Development* (2002) for SOLID; Liskov and Wing, "A behavioral notion of subtyping" (1994); Bloch, *Effective Java* 3rd ed. ("Favor composition over inheritance"); Python documentation (`abc`, classes, `collections.OrderedDict` for the LRU reference); Python's `functools.lru_cache` docs. Books are cited without links; web pages are checked to load.

## Risks

- **Phone layout of class diagrams:** UML gets crowded fast. Limits: about 4 classes per view, short member lists, two columns; the browser check fails on any clipping or overlap.
- **Hand-written diagrams can be wrong:** mitigated by validator checks on every reference and on the before/after edit counts, and by your review.
- **Opinionated topics:** SOLID and patterns are guidelines, not laws. Each lesson's simplifies note says when the pattern is overkill.
- **Size:** 14 lessons plus engine work, in 4 batches with their own checks and commits.
- **No new dependencies.**

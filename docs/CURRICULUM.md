# Curriculum

Status: **approved by the owner** (2026-10-19), with Phase 5c (real-world systems) added at the owner's request. **Built so far:** Phases 3 to 5c, and Phase 6 awaiting review: 103 lessons in the app.

**Goal of the whole curriculum:** after finishing it, the learner is confident working as a senior SDE: they can break down unfamiliar problems, choose and justify data structures and algorithms, and lead a design discussion for a large real-world system. Edit freely: reorder, cut, add. Once approved, each phase builds the lessons in its section.

This is a planning list, not lesson content. Facts, sources and quiz questions are written and checked when each lesson is built (CLAUDE.md section 5). Extra lessons can be requested at any time and go through the same "Claude drafts, owner reviews" process.

**Level:** E = easy, M = medium, H = hard. Hard lessons unlock after the easier ones in their track (CLAUDE.md section 6).

**How it animates:**
- **Computed:** the steps come from running the real algorithm on real input, and tests check them against a reference implementation (required for DSA).
- **Diagram:** a hand-written step sequence for a concept. These are reviewed, like the Phase 1 lessons.
- **Sim:** a live simulation with sliders or "break it" controls (failure injection).
- **Trace:** the learner steps through code or a design and predicts each next state.

Every lesson ends with a quiz in which each option is explained, and hard lessons add a fresh problem to solve (watch, then trace, then build).

## Already built

| Lesson | Category | Level | Animates |
|---|---|---|---|
| Hello, request | Web basics | E | Diagram |
| Load balancer | HLD | E | Diagram (becomes a Sim in Phase 5) |
| Cache | HLD | E | Diagram (becomes a Sim in Phase 5) |
| AI agent loop | Agentic AI | E | Diagram (becomes a Sim in Phase 6) |

## Phase 3: Logic foundations (8 lessons)

| # | Lesson | Goal | Level | Animates |
|---|---|---|---|---|
| L1 | Break it down | Split a vague problem into small questions you can answer one at a time | E | Diagram |
| L2 | Spot the pattern | Find the rule behind a sequence of inputs and outputs, then test your guess | E | Trace |
| L3 | Dry-run code | Track variables line by line in a table to predict what a short program prints | E | Trace |
| L4 | Loops and their limits | Predict how many times a loop runs, and find off-by-one errors | M | Trace |
| L5 | Edge cases | List the inputs that break code (empty, one item, duplicates, huge, negative) | M | Trace |
| L6 | Invariants | Name what stays true on every loop pass, and use it to prove code correct | M | Trace |
| L7 | Work backwards | Solve a problem by starting from the goal state | M | Diagram |
| L8 | Estimate before you build | Rough "how big, how slow" reasoning (back-of-the-envelope maths) | H | Trace |

## Phase 4: Data structures and algorithms (30 lessons)

### Complexity
| # | Lesson | Goal | Level | Animates |
|---|---|---|---|---|
| D1 | Big-O by counting | See how the number of steps grows as the input grows | E | Computed |
| D2 | Time versus space | Trade memory for speed, and know when it's worth it | M | Computed |

### Linear structures
| # | Lesson | Goal | Level | Animates |
|---|---|---|---|---|
| D3 | Arrays | Indexing, inserting and deleting, and why the middle is costly | E | Computed |
| D4 | Two pointers | Solve pair and reversal problems in one pass | M | Computed |
| D5 | Sliding window | Find the best subarray without re-adding everything | M | Computed |
| D6 | Prefix sums | Answer "sum from i to j" instantly after one pass | M | Computed |
| D7 | Linked lists | Follow pointers; insert and delete; reverse a list | E | Computed |
| D8 | Fast and slow pointers | Find the middle of a list, and detect a cycle | M | Computed |
| D9 | Stacks | Last in, first out: undo, and matching brackets | E | Computed |
| D10 | Monotonic stack | "Next greater element" in one pass | H | Computed |
| D11 | Queues and deques | First in, first out: task queues and the sliding-window maximum | E | Computed |

### Hashing
| # | Lesson | Goal | Level | Animates |
|---|---|---|---|---|
| D12 | Hash maps | Hashing, buckets and collisions; why lookups are usually fast | E | Computed |
| D13 | Counting and grouping | Frequency maps, anagrams and the two-sum problem | M | Computed |

### Searching and sorting
| # | Lesson | Goal | Level | Animates |
|---|---|---|---|---|
| D14 | Binary search | Halve the search space; find the first or last match | E | Computed |
| D15 | Binary search on the answer | Search over possible answers, not over an array | H | Computed |
| D16 | Simple sorts | Bubble, selection and insertion sort, and why they are slow | E | Computed |
| D17 | Merge sort | Divide, sort the halves, merge | M | Computed |
| D18 | Quick sort | Partition around a pivot; good and bad pivots | M | Computed |
| D19 | Heaps | Priority queues, top-k, merging sorted lists | M | Computed |

### Recursion
| # | Lesson | Goal | Level | Animates |
|---|---|---|---|---|
| D20 | Recursion and the call stack | Watch the call stack grow and unwind | E | Computed |
| D21 | Backtracking | Subsets, permutations, N-queens: try, undo, try again | H | Computed |

### Trees
| # | Lesson | Goal | Level | Animates |
|---|---|---|---|---|
| D22 | Tree traversals | Pre-order, in-order, post-order and level-order | E | Computed |
| D23 | Binary search trees | Insert, search and delete; why balance matters | M | Computed |
| D24 | Tries | Prefix search and autocomplete | M | Computed |

### Graphs
| # | Lesson | Goal | Level | Animates |
|---|---|---|---|---|
| D25 | Graph basics and BFS | Adjacency lists; shortest path when every edge costs the same | E | Computed |
| D26 | DFS and connected parts | Explore deep first; count islands | M | Computed |
| D27 | Topological sort | Order tasks that depend on each other | M | Computed |
| D28 | Dijkstra | Shortest path with weighted edges | H | Computed |
| D29 | Union-find | Group items quickly; detect cycles | H | Computed |

### Dynamic programming
| # | Lesson | Goal | Level | Animates |
|---|---|---|---|---|
| D30 | Dynamic programming | Overlapping subproblems; memoisation versus a table (climbing stairs, coin change, longest common subsequence) | H | Computed |

## Phase 5: System design, HLD (16 lessons)

| # | Lesson | Goal | Level | Animates |
|---|---|---|---|---|
| S1 | How a request travels | DNS, TCP/TLS, HTTP: what happens when you open a URL | E | Diagram |
| S2 | Scaling up versus out | Bigger machines or more machines, and stateless servers | E | Sim |
| S3 | Load balancing (sim) | Round robin versus least connections; kill a server and watch | M | Sim |
| S4 | Caching (sim) | Hit rate, expiry, invalidation, cache stampede | M | Sim |
| S5 | CDNs | Serve files near the user | E | Diagram |
| S6 | SQL versus NoSQL | Choose a database by its access pattern | M | Diagram |
| S7 | Indexes | Why an index speeds up reads and slows down writes | M | Sim |
| S8 | Replication | Leaders and followers, replication lag, failover | M | Sim |
| S9 | Sharding | Split data across machines; hot keys | H | Sim |
| S10 | Consistent hashing | Add or remove a server without moving everything | H | Computed |
| S11 | Message queues | Decouple services, retries, dead-letter queues | M | Sim |
| S12 | Rate limiting | Token bucket versus fixed window; protect a service | M | Computed |
| S13 | CAP and consistency | What you give up during a network split | H | Sim |
| S14 | Idempotency and retries | Make "try again" safe | M | Sim |
| S15 | Design: URL shortener | Put the pieces together: requirements, estimates, design | H | Diagram |
| S16 | Design: AI chat service | Model calls in the loop: queues, streaming, caching, cost limits | H | Diagram |

## Phase 5b: Low-level design, LLD (14 lessons)

| # | Lesson | Goal | Level | Animates |
|---|---|---|---|---|
| O1 | Objects and responsibilities | Give each class one clear job | E | Diagram |
| O2 | Encapsulation | Hide state behind methods; why public fields cause bugs | E | Trace |
| O3 | Interfaces and polymorphism | Code against "what it does", not "what it is" | M | Diagram |
| O4 | Composition versus inheritance | Prefer has-a over is-a, with a refactor exercise | M | Trace |
| O5 | SOLID, part 1 | Single responsibility, open/closed, Liskov substitution | M | Trace |
| O6 | SOLID, part 2 | Interface segregation, dependency inversion | M | Trace |
| O7 | Strategy and Factory | Swap behaviour; centralise object creation | M | Diagram |
| O8 | Observer | Notify many listeners without coupling to them | M | Diagram |
| O9 | Decorator and Adapter | Add behaviour, or fit a mismatched interface | M | Diagram |
| O10 | State machines | Model states and transitions explicitly | M | Sim |
| O11 | Design: parking lot | Classic LLD problem from requirements to classes | H | Trace |
| O12 | Design: LRU cache | Hash map plus linked list, with real code paths | H | Computed |
| O13 | Design: rate limiter class | Turn the S12 algorithm into a clean, testable class | H | Trace |
| O14 | Design: tool-calling agent | Classes for an agent: Tool, Memory, Planner, Guardrail | H | Trace |

## Phase 5c: Real-world systems (20 lessons)

Taught like a senior design review: clarify requirements, estimate scale, design the API and data model, draw the high-level design, deep-dive the hardest parts, weigh trade-offs, then inject failures. Each case study ends with the learner critiquing a flawed design.

**Accuracy rule:** company names are used for context only. Any claim about how a real company's system works must cite that company's own published article. Anything else is labelled "a plausible design, not <company>'s actual architecture".

### Case studies
| # | Lesson | Hard parts covered | Level | Animates |
|---|---|---|---|---|
| R1 | Payment gateway | Authorise and capture, idempotency keys, double-entry ledger, webhooks with retries, reconciliation | H | Diagram |
| R2 | Food delivery (Swiggy-style) | Order state machine, restaurant and delivery-partner matching, ETAs, dinner-time peaks | H | Diagram |
| R3 | Ride-hailing (Uber-style) | Live driver locations, geospatial indexing, matching, surge pricing | H | Computed |
| R4 | Train ticket booking (IRCTC Tatkal-style) | Traffic spike at opening time, waiting rooms and queues, seat inventory without double booking, seat holds during payment | H | Sim |
| R5 | Chat at scale | Delivery receipts, ordering, presence, storing huge message histories | H | Diagram |
| R6 | Video streaming | CDNs, adaptive bitrate, encoding pipeline | M | Diagram |
| R7 | News feed | Fan-out on write versus on read, the celebrity problem | H | Sim |
| R8 | E-commerce flash sale | Inventory reservation, overselling, cart expiry | H | Sim |
| R9 | Notification system | Fan-out, user preferences, retries, rate limits per channel | M | Diagram (a queues sim would have repeated S11) |
| R10 | Search autocomplete | Tries versus precomputed top-k, freshness | M | Computed |
| R11 | Unique ID generator | Time-ordered IDs without a central counter | M | Computed |
| R12 | Collaborative editing | Concurrent edits, conflict resolution, presence | H | Diagram |

### Incident and engineering-article studies

Built from the company's own write-up. Format: a timeline the learner steps through, predicting what fails next, then "how they fixed it" and "what you'd change".

| # | Lesson | Source (checked to load 2026-10-19 unless marked) | Level |
|---|---|---|---|
| I1 | Meta outage, 4 Oct 2021 | Engineering at Meta, "More details about the October 4 outage" | H |
| I2 | Cloudflare outage, 2 Jul 2019 | Cloudflare Blog, "Details of the Cloudflare outage on July 2, 2019" | H |
| I3 | Amazon S3 disruption, Feb 2017 | AWS, "Summary of the Amazon S3 Service Disruption in the Northern Virginia (US-EAST-1) Region" | M |
| I4 | GitHub incident, 21 Oct 2018 | The GitHub Blog, "October 21 post-incident analysis" | H |
| I5 | Slack outage, 4 Jan 2021 | Engineering at Slack, "Slack's Outage on January 4th 2021" | M |
| I6 | Storing trillions of messages | Discord Blog, "How Discord Stores Trillions of Messages" | H |
| I7 | Safe retries for payments | Stripe Blog, "Designing robust and predictable APIs with idempotency" | M |
| I8 | Geospatial indexing at Uber | H3's own docs at h3geo.org (copyright Uber Technologies); Uber's blog still refuses automated access | H |

More articles can be added on request. Netflix and Swiggy engineering blogs are candidates (`TODO-VERIFY`: they could not be reached automatically on 2026-10-19).

### Capstone
| # | Lesson | Goal | Level |
|---|---|---|---|
| C1 | Senior design review | Given a flawed design for a new system, find the risks, rank them and propose fixes, with no hints | H |

## Phase 6: Agentic AI (10 lessons)

| # | Lesson | Goal | Level | Animates |
|---|---|---|---|---|
| A1 | Prompt in, text out | What a single model call can and cannot do | E | Diagram |
| A2 | Tool use | How a model asks for a tool, and who actually runs it | E | Agent run |
| A3 | The agent loop (sim) | Decide, act, observe, repeat; set a step limit and break it | M | Agent run |
| A4 | Memory | Context window versus stored notes; what to keep | M | Agent run |
| A5 | Planning | Plan first versus act step by step; when plans go stale | M | Agent run |
| A6 | Workflows versus agents | Fixed chains, routing, parallel steps, and when an agent is overkill | M | Diagram |
| A7 | Guardrails | Input and output checks, permissions, human approval | M | Agent run |
| A8 | Failure modes | Tool errors, loops, wrong tool, hallucinated arguments: inject each one | H | Agent run |
| A9 | Multi-agent systems | Orchestrator and workers; hand-offs and their costs | H | Agent run |
| A10 | Evaluating agents | Test sets, success criteria, and catching regressions | H | Computed (a regression eval of the A8 agent) |

## Phase 8 (stretch): lesson from a codebase

Turn a real codebase's HLD and LLD into a lesson, reusing existing analysis tools where possible. Generated diagrams are treated as unverified until checked against the code.

## Totals

| Track | Lessons |
|---|---|
| Already built | 4 |
| Logic foundations | 8 |
| DSA | 30 |
| HLD | 16 |
| LLD | 14 |
| Real-world systems (case studies, incidents, capstone) | 21 |
| Agentic AI | 10 |
| **Planned total** | **103** |

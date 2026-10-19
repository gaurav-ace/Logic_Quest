# Phase 5 plan: System design (HLD)

Status: approved 2026-10-19 (all of 5.1–5.4).

**Goal (CLAUDE.md section 9):** load balancing, caching, databases, queues, replication, sharding and rate limiting, with sliders and failure injection.

**Done when:** each simulation has a "what this simplifies" note and sourced facts.

## The new piece: simulation lessons

Diagrams and traces show one fixed run. System design is about *what happens when conditions change*, so Phase 5 adds a third lesson kind, **sim**: a small live model of a system that the learner can push and break.

- **Controls:** sliders (traffic, number of servers, cache size, timeout, …), switches (health checks on or off, retries on or off), and failure buttons (kill a server, cut the network between two nodes, make the database slow). Every control is a 48 px tap target; there is no dragging without a tap alternative.
- **Live numbers:** requests served, errors, latency (typical and slowest 5 %), cache hit rate, queue length. Each has a small line chart of its recent history, drawn as inline SVG with no chart library.
- **Challenges with a goal,** for example "keep errors under 1 % for 10 seconds using at most 3 servers, with one server killed." The app checks the goal as the sim runs. Each challenge is a predict-then-try: first guess what will happen, then do it.
- **Honest models:** the sim is a simple step-by-step model (each tick: requests arrive, get routed, wait in queues, finish or fail). Every lesson states what the model leaves out, and every number on screen is labelled illustrative. The sims show *shapes* (more servers lowers latency until the database becomes the bottleneck), not real-world measurements.
- **Tests:** models are pure functions with a seeded random source, so runs repeat exactly. Tests check bookkeeping (every request is served, failed or still in flight, never lost or counted twice) and the behaviours each lesson teaches, with fixed seeds. For example: least connections beats round robin when request costs differ; with health checks off, a killed server produces errors; adding cache capacity never lowers the hit rate in the test workload.

## Lessons (docs/CURRICULUM.md, S1–S16)

| Batch | Lessons | Kind |
|---|---|---|
| 5.1 Engine | the sim engine, controls, live numbers, challenges | (engine) |
| 5.2 Traffic | S1 How a request travels (diagram), S2 Scaling up versus out (sim), S3 Load balancing (sim: round robin versus least connections, kill a server), S4 Caching (sim: hit rate, expiry, invalidation, stampede), S5 CDNs (sim) | mixed |
| 5.3 Data | S6 SQL versus NoSQL (diagram), S7 Indexes (trace: scan versus index lookup, tested), S8 Replication (sim: lag, failover), S9 Sharding (sim: hot keys), S10 Consistent hashing (trace: keys that move when a server is added, tested) | mixed |
| 5.4 Reliability and design | S11 Message queues (sim: backpressure, retries, dead-letter queue), S12 Rate limiting (trace: token bucket versus fixed window, tested), S13 CAP and consistency (sim: network partition), S14 Idempotency and retries (sim: double charge without an idempotency key), S15 Design: URL shortener, S16 Design: AI chat service (design-review diagrams) | mixed |

The two existing system design lessons (Load balancer, Cache) stay as the easy introductions, and the new sims build on them through `requires`.

## Sources (to check while building each lesson; unverified items get `TODO-VERIFY`)

Already checked: NGINX load-balancing docs, Azure Cache-Aside pattern, Stripe idempotency post. Candidates to check: Kleppmann, *Designing Data-Intensive Applications* (replication, partitioning, consistency: a book, no link); Karger et al. 1997, the consistent hashing paper; Gilbert and Lynch 2002, the CAP theorem proof; PostgreSQL documentation on indexes; AWS SQS documentation on dead-letter queues; MDN on DNS and HTTP; IETF RFCs where relevant (for example, token buckets).

## Risks

- **Size:** 16 lessons plus a new engine. Built in 4 batches, each committed with its own checks.
- **Honesty:** a simulation can look like measurement. Every sim shows an "illustrative model" label, and its simplifies note lists what is left out (network variance, warm-up, coordination costs, …).
- **Phone layout:** a sim screen has a diagram, controls and numbers. The design is diagram first, then the numbers and the controls in the bottom bar's thumb zone, checked at 360 px.
- **Battery:** the sim pauses when the tab is hidden and when the learner pauses it, and it runs at a modest tick rate.
- **No new dependencies.**

# Phase 5c plan: Real-world systems

Status: draft, awaiting the owner's approval.

**Goal (CLAUDE.md section 9):** case studies of large systems taught as a senior design review (requirements, estimates, API, data model, high-level design, deep dives, trade-offs, failure modes), plus incident studies built from companies' own postmortems and engineering articles.

**Done when:**
- every claim about a real company cites that company's own published material;
- any design the company hasn't published is labelled "a plausible design, not <company>'s actual architecture";
- each incident lesson lets the learner predict the next failure on a timeline;
- each case study ends with the learner critiquing a flawed design.

## The new pieces (5c.1, engine)

- **The accuracy rule, enforced by the validator.** A real-world lesson names its company and its `basis`.
  - **`published`:** at least one source must be on that company's own website (listed per company, for example `engineering.fb.com` for Meta). The lesson may then describe what the article says.
  - **`plausible`:** the app shows the label "A plausible design, not <company>'s actual architecture" at the top of the lesson. Data that breaks this rule fails to load.
- **Timeline steps for incidents.** A step can carry a time (for example "15:39 UTC"), shown as a chip next to the caption, with a "what fails next?" prediction before key moments. Each time and event is taken from the company's write-up and quoted in the source notes.
- **"Critique the design" exercise for HLD:**
  - The learner sees a flawed architecture and a list of candidate risks.
  - They tap the real ones. Each candidate has an explanation, including why the decoys are not real problems.
  - Then they answer "which would you fix first, and how?", with every option explained.
  - The flawed parts light up on the diagram.
  - It works on diagram, trace and sim lessons, before the quiz, and scores XP once.
- **Two new simulation models:**
  - `inventory`: seats or stock, many buyers at once, and three things to get right. Overselling happens when "check then take" isn't atomic. Holds expire while people pay. A waiting room protects the database at opening time.
  - `fanout`: a news feed built by fan-out on write versus fan-out on read, plus the celebrity account that breaks fan-out on write.

  The models are tested as in Phase 5: bookkeeping checks, behaviour claims, and challenges that are winnable from their solutions but not from their setups.
- **Two new computed traces, each tested against a brute-force reference:**
  - `nearby`: find drivers near a rider by searching grid cells instead of every driver.
  - `snowflake`: time-ordered unique IDs built from timestamp, machine and sequence bits, with no central counter.

## Lessons (docs/CURRICULUM.md, R1–R12, I1–I8, C1)

| Batch | Lessons | Kind |
|---|---|---|
| 5c.1 Engine | accuracy rule, timeline steps, critique exercise, `inventory` and `fanout` models, `nearby` and `snowflake` traces | (engine) |
| 5c.2 Case studies, part 1 | R1 Payment gateway (authorise and capture, idempotency keys, double-entry ledger, webhooks with retries, reconciliation), R2 Food delivery (order state machine, partner matching, dinner peak), R3 Ride-hailing (nearby-driver search, trace; H3 facts from Uber's own h3geo.org), R4 Train booking with a Tatkal-style opening spike (sim: `inventory`) | mixed |
| 5c.3 Case studies, part 2 | R5 Chat at scale, R6 Video streaming, R7 News feed (sim: `fanout`), R8 Flash sale (sim: `inventory`, other challenges), R9 Notification system (sim: the existing `queues` model), R10 Search autocomplete (trace: the trie with precomputed top results), R11 Unique ID generator (trace: `snowflake`), R12 Collaborative editing | mixed |
| 5c.4 Incidents and capstone | I1 Meta outage 2021, I2 Cloudflare outage 2019, I3 Amazon S3 2017, I4 GitHub 2018, I5 Slack 2021, I6 Discord storing trillions of messages, I7 Stripe safe retries, I8 Uber H3 geospatial indexing; C1 Senior design review (critique a new flawed design with no hints, and choose what to fix first) | diagram with timeline |

**How each lesson is checked:**
- **Case studies:** requirements, a rough estimate (labelled illustrative), API, data model, design, one or two deep dives with predictions, trade-offs, failure modes, then the critique.
- **Incidents:** what the company's write-up says happened, in order, with predictions; then how they fixed it; then "what would you change?" Every time and cause comes from the write-up, with a quote in the notes.
- **Company names:** Swiggy, Uber and IRCTC are named only for context. Where they haven't published a design, the lesson is `plausible` and shows the label.

## Sources

Checked to load on 2026-10-19:
- Engineering at Meta: "More details about the October 4 outage"
- Cloudflare: "Details of the Cloudflare outage on July 2, 2019"
- AWS: Amazon S3 disruption summary (message 41926)
- GitHub: "October 21 post-incident analysis"
- Slack Engineering: "Slack's outage on January 4th 2021"
- Discord: "How Discord stores trillions of messages"
- Stripe: idempotency post
- h3geo.org: Uber's H3 docs, "Copyright Uber Technologies"

Uber's blog itself still refuses automated access, so H3 facts come from h3geo.org only.

General facts (ledgers, webhooks, CDNs, adaptive bitrate, Snowflake-style IDs) need their own sources, checked while building. Anything I can't verify is marked `TODO-VERIFY` and listed in the report.

## Risks

- **Size:** 21 lessons plus engine work, the largest phase so far. Built in 4 batches with their own checks and commits.
- **Accuracy about real companies:** enforced by the validator rule above, by quoting the write-ups, and by your review. Incident timelines are simplified to their key moments, and the "what this simplifies" note says what was left out.
- **Hand-written conceptual diagrams** (allowed for system concepts): reviewed in screenshots and by you. Anything that computes (search, IDs, sims) is tested.
- **No new dependencies.**

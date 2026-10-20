# Plan: tutor, practice, workshop, profiles, HLD playground, reminders

Status: draft, awaiting the owner's approval. Owner's answers so far (2026-10-20): local profiles; reminders at 08:00 and 21:00 IST; priority order as below; AI chat at no extra cost. Claude Pro can't power an in-app chat (the API is billed separately), so the owner chose an in-app **Gemini chat on a free Gemini API key**, keeping the "Ask Claude" hand-off as the fallback (section 3.6). Branch: `claude/ai_integration` (from `main` at 4818635).

The owner asked for seven things (2026-10-20). This plan analyses each one, picks an approach, flags where it conflicts with `CLAUDE.md`, and sets a priority order. Nothing is built until the owner approves.

## 1. Conflicts with CLAUDE.md (the owner must decide these)

| Request | Rule it touches | Proposed resolution |
|---|---|---|
| AI chat bot in every lesson | §3 no paid third-party API; §4.7 no API keys; §8 offline first; §5 "wrong teaching content is worse than none" | Three tiers (section 3.6). **Tier 1** is offline, free and always sourced. **Tier 2** is an in-app Gemini chat on the learner's own **free-tier** Gemini API key, opt-in and off by default. **Tier 3** hands the question to the Claude app or claude.ai (owner's Pro plan) and is the fallback when Gemini fails. Tier 2 needs a written exception to §3/§4.7: "free-tier AI API, learner's own key stored only on their device, off by default, never required to use the app". |
| User accounts | §3 accounts and cloud backend are out of scope "unless the user explicitly adds it" | The owner has now added it. Proposed: **local profiles** (several learners on one device, no server). Syncing across devices would need a cloud backend, which is still out of scope, so export/import stays the way to move progress. |
| Twice-daily phone reminder via Discord webhook | §3 no cloud backend; §4.7 no secrets in code; §8 never ask for permissions not needed | A **GitHub Actions scheduled workflow** posts to a Discord webhook. The webhook URL lives only in a GitHub repository secret, never in code. The app asks for no phone permissions: the Discord app shows the notification. |
| All of it | §9 one phase at a time; Phase 6 awaits review, Phase 7 is next | Add a new **Phase 6b, Practice and tools** between 6 and 7 (Phase 7's mistake review will reuse the practice items). Phase 6 review can happen in parallel, since 6b touches no Phase 6 lessons. |

If approved, CLAUDE.md §3, §9 and §12 and `docs/PROJECT_CONTEXT.md` get updated first, in their own commit.

## 2. Priority order (and why)

| # | Milestone | Size | Why this position |
|---|---|---|---|
| M1 | Local learner profiles | M | Foundation. Every new feature saves something (workshop notes, boards, practice progress, AI key). Doing profiles first means storage moves once, not four times. Highest data risk, so it gets the most tests. |
| M2 | Discord reminders | S | Independent and small, and an early visible win. It only needs the owner to create a webhook. |
| M3 | Practice engine: section drop-down, "Debug it" and "corner case" questions, medium/hard ladder | M | Core of Goal A (solve problems alone). M4 and M5 plug into it. |
| M4 | Problem workshop pane (guided break-it-down) | M–L | The owner's main learning idea. Needs M3's practice list to live in. |
| M5 | Practice content, by track | L (content) | The engine is useless without problems. Done in batches, one track per batch, each one sourced and reviewed. |
| M6 | Ask the tutor, tier 1 (offline, sourced) | M | Useful immediately, with no cost and no risk of wrong answers. Needs a curated FAQ per lesson, which is content work like M5. |
| M7 | HLD playground (drag-and-drop canvas) | L | Standalone and high engagement, but it can't check a design automatically, so it adds less to Goal A than M3–M5. Largest piece of new UI. |
| M8 | Gemini chat, tier 2 (free Gemini API key, answers in the app) | M | Builds on M6's panel. Last because it's the only piece that depends on an outside service. |
| M9 | Ask Claude, tier 3 (hand-off to the Claude app or claude.ai, Pro plan) | S | The fallback for when Gemini is unavailable, out of quota, or not set up. Small. |

M1 → M3 → M4 is a strict dependency chain. M2, M6 and M7 only need M1 and could move earlier if the owner prefers. M8 and M9 need M6's tutor panel.

## 3. Approach per feature

### 3.1 M1: Local learner profiles

- **What the learner sees:** with one profile, nothing changes. Settings gets a "Learners" section: add, rename, switch, delete (with confirmation and an offer to export first). With two or more profiles, the app asks "Who's learning?" on launch, and the top bar shows the current name (tap it to switch).
- **Storage:** a profile list under `logic-quest:profiles`. Each profile's save lives under `logic-quest:p:<id>:progress`, in the existing `SaveData` format, so the reward engine is untouched. New per-profile keys get the same prefix (workshop notes, boards, settings).
- **Migration:** on first launch after the update, the existing save becomes profile 1 ("Learner 1", renamable). The old key is **kept, not deleted**, as a backup. Migration is idempotent: running it twice creates no second profile.
- **No PIN or password.** Anything in local storage can be read by anyone using the device, so a PIN would only look like security. The UI says profiles are "for sharing a device, not for privacy".
- **Export/import** is per profile. Importing into a profile merges by event id (existing rule), so nothing is double-counted.
- **Tests:** migration (fresh device, existing save, run twice, unreadable save keeps its backup), switching never mixes events between profiles, delete only removes that profile's keys, storage full or blocked. Mutation checks: drop the "already migrated" guard; write to the wrong profile key.
- **Browser check:** create 2 profiles, earn XP in each, reload, and confirm each one keeps only its own progress.

### 3.2 M2: Discord reminders (twice a day)

- **How it works:** `.github/workflows/reminder.yml` runs on a `schedule` (cron) twice a day and runs `scripts/reminder.mjs`, which POSTs a short message to the webhook URL in the `DISCORD_WEBHOOK_URL` repository secret. The Discord app on the phone shows it as a notification.
- **Message:** the facts and a way in, never guilt (§7). For example: "Daily goal: 1 lesson (5–10 min). Today's practice pick: *Find the bug: off-by-one in binary search* → <link>." The pick is chosen from the catalog by date, so it's deterministic and testable. It stays well under Discord's 2000-character `content` limit.
- **Honest limits (stated in the README and the plan):**
  - The workflow can't see progress, because progress lives only on the phone. So it can't say "you already did today's lesson". It sends a reminder, not a status.
  - GitHub says scheduled runs "can be delayed during periods of high loads", so times are approximate. Runs are set off the top of the hour to help.
  - In a public repo, scheduled workflows "are automatically disabled when no repository activity has occurred in 60 days". The README explains how to re-enable them.
- **Owner's steps:** create a webhook in a Discord channel (Channel settings → Integrations → Webhooks) and add it as a repository secret. I never see or log the URL.
- **Tests:** unit tests for the message builder (length limit, deterministic pick, link format, no URL in output) and a `--dry-run` mode that prints instead of posting. The first real post happens only after the owner adds the secret.
- **Times (owner's choice):** 08:00 and 21:00 IST. IST is UTC+5:30 with no daylight saving, so the cron times are 02:30 and 15:30 UTC.

### 3.3 M3: Practice per section (drop-down, medium/hard, debugging)

- **Where:** each track section on the Learn page gets a **"Practice"** drop-down (a native `<select>` filter plus a list, tap-friendly) with filters *All / Medium / Hard* and *Quiz / Debug it / Guided problem*. Hard items unlock after the track's medium ones (§6 difficulty ladder), with the same "locked, here's why" explanation lessons already use.
- **Item kinds (all tap-based, none is a code editor):**
  1. **Corner-case quiz.** Advanced edge cases (empty input, duplicates, overflow, concurrency, partial failure, retries). Uses the existing quiz format: one right answer, an explanation for every option.
  2. **Debug it.** A short snippet (Python, like the existing lessons) or a design or log excerpt, plus a symptom ("returns -1 for the last element"). Steps: (a) tap the suspicious line, (b) predict the output on a given input, (c) pick the fix, (d) see why each other fix is wrong. Where the bug is in an algorithm, the "actual output" is **computed by running both the buggy and the fixed version** (the trace engine pattern, §5.6), so the visual can't lie.
  3. **Guided problem.** Opens the workshop (M4).
- **Rewards:** XP only from graded checks, once per item (existing anti-farming via the event log). Free-text notes earn nothing, because they can't be checked offline.
- **Data:** practice items are JSON, validated at load like lessons (bad data fails loudly). They're **loaded per track on demand** (`import()`), so the main bundle doesn't grow. It's already over Vite's 500 kB warning.
- **Tests:** validator (every option explained, the debug line exists, the fix differs from the bug), computed debug outputs match a reference, unlock ladder, XP once per item.

### 3.4 M4: Problem workshop pane (structured break-it-down)

A side pane on wide screens and a full-screen sheet on phones. Every guided problem follows the same six-step pattern, so the habit transfers:

1. **Understand.** What goes in, what comes out, what's given. The learner types a short restatement, then taps the best one of 3 restatements (graded).
2. **Shrink it.** "What's the smallest version you could solve right now?" The learner writes it, then picks from options (graded), and a **small animated example** of that tiny case plays (computed trace for DSA, a diagram for systems).
3. **Break it down.** A sub-problem outline: add, indent or outdent, and move up or down with buttons (tap only; dragging is optional). Then the expert decomposition is shown beside it, and a graded "put these sub-steps in order" check follows.
4. **Logic per piece.** The learner writes the steps in plain words for one sub-problem at a time. Check: trace it on a small input by predicting values; predictions are computed from the reference run.
5. **Edge cases.** The learner lists theirs, then taps which given inputs break a naive solution (graded).
6. **Put it together and reflect.** A combined outline. "Which step was hardest?" is saved for Phase 7's review queue.

- **Hints** are progressive (3 levels per step), never the full answer at once, and they don't cost XP. A first-try correct answer earns more (§7).
- **Honesty:** the pane says that free text isn't checked offline ("compare with the expert breakdown"). An optional "Get AI feedback on my breakdown" button sends the outline to Gemini (M8), or hands it to Claude (M9) when Gemini isn't available.
- **Saved per profile**, and included in export/import.
- **Tests:** step state machine (can't skip a graded check, resume after reload), outline operations (indent and outdent rules, move at the edges), graded checks, persistence.

### 3.5 M5: Practice content

- **First batch per track:** 4 medium and 2 hard items (a mix of corner-case, debug and guided) for logic, DSA, HLD, LLD, real-world and agentic. That's 36 items, done one track per commit. More can be requested later, following the same process.
- **Same rules as lessons:** objective, sources, an explanation for every option, a "what this simplifies" note, `TODO-VERIFY` for anything unsourced. Claude drafts and the owner reviews.
- **Debugging themes** (examples): off-by-one in binary search, mutating a list while looping over it, a missing base case, a cache with no invalidation, retry without idempotency (double charge), read-your-writes on a lagging replica, an agent with no step limit, a prompt injection in a tool result.

### 3.6 M6 and M8: Ask about this lesson (the chat bot)

The requirement is "the response should be authentic from some good source". A language model can't guarantee that on its own, so the plan has three tiers, from most to least trustworthy.

**Tier 1 (M6): offline tutor, always sourced, the default.**
- A "Ask about this lesson" button opens a chat-style panel.
- It offers **suggested questions** for the lesson ("Why not round robin here?", "What if the cache is down?"). Each one has a curated answer written from the lesson's sources and reviewed by the owner, with the source linked under it.
- It has a **search box** that matches the question against this lesson and the whole course (captions, explanations, "what this simplifies" notes, FAQs). It shows the best passages with their lesson and source.
- It **never generates text.** If nothing matches, it says so and lists the lesson's sources. It works offline, with no key and no cost.
- **Limit:** it only knows what the course contains. Writing FAQs for 103 lessons is content work, so start with the lessons the owner uses most, and use search everywhere else.

**Tier 2 (M8): Gemini chat in the app, on a free Gemini API key.**
- **Why Gemini:** Google AI Studio gives out Gemini API keys with a free tier. The owner's Google AI Pro plan isn't required for this, but it does give "Expanded limits in AI Studio". Claude Pro can't be used, because the Claude API is billed separately from it.
- **Setup (once per profile):** Settings → AI tutor → paste a Gemini API key, with a link to AI Studio and step-by-step instructions.
  - The key is stored only in that profile on that device. It's never put in exports, logs or URLs, and there's a "Remove key" button.
  - Off by default. The rest of the app never needs it.
- **Asking:** in the lesson's tutor panel, type a question or tap a suggested one. The answer appears in the panel, and follow-up questions keep the conversation going (kept for the current lesson visit only).
- **Grounding, for "authentic from a good source":**
  - Every request carries the current lesson: title, objective, the current step's caption, quiz explanations, the "what this simplifies" note and the source list.
  - The system instruction says to:
    - answer from the lesson and its sources first;
    - prefer official documentation and well-known references;
    - say "I'm not sure" rather than guess;
    - keep to one idea at a time, in plain words.
  - **Grounding with Google Search** is turned on, so the model can look things up and return the pages it used. They're shown under the answer as a "Sources" list (https links only).
- **Model:** `gemini-2.5-flash`. Google's pricing page (checked 2026-10-20) lists it as free of charge, with Search grounding free "up to 500 RPD (limit shared with Flash-Lite RPD)". For Gemini 3 and newer, grounding is "Not available" on the free tier, so they would answer without search. The model name lives in one config value, so it can be changed when Google changes the free tier.
- **How it's called:** a plain `fetch` to the Gemini API's REST endpoint, so there's no new dependency. **To verify at build time, before any UI work:**
  - that the endpoint accepts calls from a web page (CORS);
  - the exact request and response fields for grounding.

  If direct calls don't work, I'll stop and report back rather than add a proxy or a dependency without asking. The Claude hand-off (tier 3) still works either way.
- **Safety:**
  - Answers are rendered as plain text, never as HTML. The model's output can't inject markup or scripts.
  - Links are shown only if they're https.
  - Every answer is labelled "AI-generated (Gemini). Check the sources below."
- **Privacy (stated in settings):** Google says free-tier content is "used to improve our products". So the app sends only the lesson text and the learner's question or notes, never progress, profile names or other personal data. The paid tier doesn't use content that way. Google AI Pro includes "$10 in monthly Google Cloud credits", which might pay for it, but that is not verified to cover Gemini API charges and isn't part of this plan.
- **When Gemini doesn't work:** the panel says why in plain words and offers **"Ask Claude instead"** (tier 3) right there. Causes covered:
  - no key;
  - offline;
  - invalid key;
  - quota or rate limit reached;
  - the service is down;
  - the answer was blocked.
- **Tests (no real calls in CI):** a mocked `fetch` checks:
  - the request includes the lesson context and the question, and never the key in the URL or anything from progress;
  - grounding sources are parsed into links, and non-https links are dropped;
  - each error (400/403 bad key, 429 quota, 5xx, network failure, blocked answer) gives the right message and the Claude fallback;
  - output is shown as text (a `<script>` in the answer appears literally);
  - the key is removed from exports.

  One real call is made by the owner with their own key, and reported as such.

**Tier 3 (M9): Ask Claude, handed off to the owner's Claude Pro plan. This is the fallback.**
- **Why a hand-off and not a chat built into the app:** Claude Pro covers claude.ai, the Claude apps and Claude Code. The Claude API, which an in-app chat would need, is billed separately and needs an API key, and a web app can't sign in with a Pro account.
- **How it works:**
  1. In the tutor panel (always visible, and shown prominently when Gemini fails), tap "Ask Claude".
  2. The app builds a prompt with:
     - the lesson's title, objective and current step;
     - the lesson's sources;
     - the question;
     - instructions to answer at the learner's level, prefer the listed sources and official docs, cite a source for each claim, and say when unsure.
  3. On Android it opens the system share sheet (Web Share API) so the learner can pick the Claude app. Elsewhere, and as a fallback, it copies the prompt and opens claude.ai. A link that pre-fills claude.ai is used only if checked to work at build time.
- **Honest limits:**
  - The answer stays in the Claude app.
  - It needs a network connection.
  - Pro usage limits apply.
  - The button says "Opens Claude. Answers there are AI-generated: check the cited sources."
- **No dependency, no key, nothing stored.**
- **Tests:** the prompt builder (lesson context, sources and question; length cap; no progress or personal data); share when available, otherwise copy and open; disabled with a message when offline.

### 3.7 M7: HLD playground

- **New tab `#/playground`.**
  - A palette of shapes: client, mobile app, load balancer, API service, worker, database, cache, queue, CDN, object storage, external API, LLM/agent, generic box, sticky note.
  - Arrows with optional labels and free text notes.
  - Select, move, resize notes, delete, undo and redo, pan and zoom, snap to a grid.
- **Works by tap alone (§8):**
  - Tap a palette item, then tap the canvas to place it.
  - "Connect" mode: tap box A, then box B.
  - To move: drag, or select and use the nudge buttons.
  - Pinch or the +/− buttons zoom.
  - Keyboard: arrows move, Delete removes, Ctrl+Z undoes.
  - Landscape is suggested on phones but isn't required.
- **Practice prompts:** "Design a URL shortener / chat / ride-hailing". Each prompt shows requirements and a **self-review checklist** (single points of failure? where's the cache? what happens when X fails?). After that, the learner can compare with the matching case-study lesson's diagram.
  - **No automatic grading.** A design can't be honestly scored by rules, and the page says so.
- **Saved per profile:** several boards, plus export as JSON (re-importable) and SVG.
- **No new dependency:** plain SVG with pointer events, like the existing engine.
- **Tests:** the board model (add, connect, delete cascades to edges, undo and redo, serialise and parse round trip, bad files rejected), hit-testing and snapping maths, and a browser check that places, connects, labels, reloads and exports by touch at 360 px.

## 4. Task split (each task ≤ about 5 files and 300 lines, §4.2)

| Task | Content |
|---|---|
| 6b.0 | CLAUDE.md / PROJECT_CONTEXT updates for the approved decisions |
| 6b.1 | Profile store and migration (pure, tests) |
| 6b.2 | Profile UI: switcher, "Who's learning?", Settings → Learners; browser check |
| 6b.3 | Reminder script, workflow, README section (dry-run tested) |
| 6b.4 | Practice schema, validator and per-track loader |
| 6b.5 | Practice drop-down on Learn, corner-case quiz runner, unlock ladder |
| 6b.6 | "Debug it" runner (computed buggy vs fixed outputs) |
| 6b.7 | Workshop model (steps, outline ops, persistence) |
| 6b.8 | Workshop UI (pane or sheet) and browser walk |
| 6b.9–6b.14 | Practice content, one track per task |
| 6b.15 | Tutor tier 1: panel, search index, FAQ schema |
| 6b.16 | Tutor FAQs for a first set of lessons |
| 6b.17 | Playground board model and tests |
| 6b.18 | Playground canvas UI, palette, tap modes |
| 6b.19 | Playground prompts, checklists, export |
| 6b.20 | Gemini spike: check CORS and the grounding response with the owner's key; report before building |
| 6b.21 | Gemini client (request builder, response and source parsing, error mapping) and tests |
| 6b.22 | Settings → AI tutor (key handling) and the chat in the tutor panel; browser check with mocked responses |
| 6b.23 | Ask Claude hand-off (prompt builder, share or copy-and-open), also used as the Gemini fallback |

Every task follows CLAUDE.md §10. This includes `npm run check` and the browser suites at 360 px and desktop, with touch only and reduced motion. Real-phone checks are left to the owner and reported as not done.

## 5. Risks

- **Content volume** (M5 and M6) is the slowest part and needs the owner's review time. Batches keep it reviewable.
- **Storage migration** (M1) could lose progress if it's wrong. Mitigation: the old key is kept, migration is idempotent, there are mutation-tested unit tests, and a reload check runs in the browser.
- **Phone canvas** (M7) is cramped at 360 px. Tap modes and zoom keep it usable, but it will be nicer on a tablet or desktop.
- **Gemini and Claude answers** aren't reviewed course content, so they can be wrong. Mitigations: lesson grounding, search sources shown, AI-generated labels, and the reviewed tier 1 answers come first.
- **Google's free tier can change** (models, limits, the grounding allowance). The model name is one config value, and every failure falls back to the Claude hand-off.
- **Gemini key on a shared device:** other learners on the same device could use it. Settings says so, and the key can be removed at any time.
- **Direct browser calls may be blocked** (CORS). Task 6b.20 checks this first. If it fails, I'll ask before adding a proxy or a dependency.
- **Reminders** depend on GitHub's scheduler (delays, the 60-day pause) and can't see progress.

## 6. Sources checked for this plan (2026-10-20)

- Gemini API pricing (free tier; free models; Search grounding on the free tier only for 2.5 Flash, up to 500 RPD; free-tier content "used to improve our products"): https://ai.google.dev/gemini-api/docs/pricing
- Google AI Pro plan page ("Expanded limits in AI Studio"; "$10 in monthly Google Cloud credits from Google Developer Programme"; no API credits listed): https://one.google.com/about/ai-premium/

- GitHub Docs, events that trigger workflows, `schedule` (delays under load, UTC by default, 5-minute minimum, disabled after 60 days of inactivity in public repos): https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
- Discord developer docs, Execute Webhook (`POST /webhooks/{id}/{token}`, `content` up to 2000 characters, no extra auth): https://docs.discord.com/developers/resources/webhook

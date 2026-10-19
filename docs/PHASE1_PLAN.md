# Phase 1 plan: Animation engine

Status: waiting for the owner's approval.

**Goal (CLAUDE.md section 9):** a generic engine for nodes, edges, moving packets, highlights, captions, step back/forward, play/pause and speed control.

**Done when:** the three prototype lessons (load balancer, cache, agent loop) run from data, the step logic has unit tests, every control works by tap on a phone-sized screen, and a manual check passes at phone and desktop widths.

**Out of scope (later phases):** points, streaks, levels and badges (Phase 2); predict-the-next-step questions (Phase 3); failure injection and sliders (Phases 5–6).

## Tasks (built in order, one commit each, reported once at the end)

| # | Task | Main files | Tested by |
|---|------|-----------|-----------|
| 1.1 | **Player state machine (pure, no DOM).** Holds the step index, playing or paused, speed (0.5x, 1x, 2x) and packet progress. Actions: `next`, `back`, `goTo`, `play`, `pause`, `setSpeed`, `tick(ms)`, `restart`. While playing, it advances to the next step after the packet arrives plus a short pause for reading, and stops at the end of the lesson. | `src/engine/player.ts`, `player.test.ts` | Unit tests: next/back at both ends, play pauses at the last step, speed scales timing, a long `tick` never skips a step, back while playing, restart, a 1-step lesson, a step with no packet |
| 1.2 | **Renderer uses the player.** Controls: Back, Play/Pause, Next, a speed button that cycles 0.5x → 1x → 2x, and tappable step dots. The animation pauses when the tab is hidden. With reduced motion, the packet jumps to the end and auto-play still waits long enough to read. The caption stays the text alternative. | `src/render/lesson.ts`, `src/render/controls.ts`, `src/styles.css` | Headless Chrome at 360 px, landscape and desktop, touch-only taps on every control, reduced motion on and off |
| 1.3 | **Three lessons as data.** Load balancer, cache and AI agent loop, rewritten from the prototype into JSON. Each has one objective, about 5 steps, 1–2 quiz questions with every option explained, sources, and a "what this simplifies" note (for example, round robin here ignores connection counts and server weights). Schema change: optional per-node `width`, so longer labels like "Database" fit at a readable size. | `lessons/*.json`, `src/lesson/schema.ts`, `validate.ts` (+ tests) | The validator test loads every lesson file. Facts checked against the sources below; anything unsourced is marked `TODO-VERIFY` and reported |
| 1.4 | **Lesson list and the Android back button.** A home screen lists the lessons, and hash URLs (`#/lesson/<id>`) let the phone's back button return to the list. Pressing back during a quiz shows an in-page "Leave the quiz?" bar instead of leaving straight away. | `src/main.ts`, `src/render/home.ts`, `src/router.ts` (+ test) | Router unit tests. Headless check that the browser back button returns to the list, and that back during a quiz asks first |

## Planned sources (pages checked to load on 2026-10-19; the claims will be checked against them during 1.3)

- Load balancer: NGINX docs, "Using nginx as HTTP load balancer" (round robin as the default method, marking failed servers unavailable), https://nginx.org/en/docs/http/load_balancing.html
- Cache: Microsoft Azure Architecture Center, "Cache-Aside pattern" (read from the cache, fall back to the database, then populate the cache; stale data and expiry), https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside
- Agent loop: Anthropic, "Building effective agents" (agents use tools in a loop, based on feedback from the environment), https://www.anthropic.com/engineering/building-effective-agents. Also Yao et al. 2022, "ReAct: Synergizing Reasoning and Acting in Language Models", https://arxiv.org/abs/2210.03629

## Risks

- **Size:** 1.2 may get close to the 300-line limit. If so, controls move into their own module (already planned as `controls.ts`).
- **Hand-scripted steps:** allowed for conceptual system diagrams (CLAUDE.md section 5.6), but they need the owner's review. Please read the three lessons once they're built.
- **No new dependencies** are planned.

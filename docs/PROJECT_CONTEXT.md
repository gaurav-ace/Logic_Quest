# Logic Quest: project context

Read this at the start of every session. The behaviour rules are in `CLAUDE.md`. Current status is in `docs/PROGRESS.md`.

## What this project is

An interactive learning app that makes the user better at logical thinking by showing software systems and algorithms as real-time animations and simulations, then checking understanding with quizzes and challenges. Points, streaks, levels and badges keep the learner motivated.

## Why it exists (the owner's words, summarised)

- Develop the user's logical thinking enough to make them confident with new software problems, DSA, complex AI-in-the-loop system design, and agentic AI.
- Make it as interactive as possible, with real-time animation and simulation, and as motivating as possible, with rewards of some sort.
- Deliver in small phases with sufficient testing.
- It must be usable on an Android phone as well as on a computer.

## Who the learner is

One person (the project owner) who wants to build logical thinking over time. Treat them as a motivated beginner-to-intermediate programmer. Topics: logic and problem solving, DSA, system design, agentic AI.

## Where the idea came from

The owner first asked two questions: (1) is there a tool that analyzes a system and presents its HLD and LLD, and (2) is there a tool that explains complex software simply with animations, quizzes and rewards. A web search found tools for (1), such as CodeBoarding, Archify and Swark, but the answer for (2) was a mix of separate tools (Visualgo, Boot.dev, Brilliant, ByteByteGo, Educative, Hugging Face's agents course), not one platform. This project aims to fill that gap. The code-to-lesson idea is kept as a late stretch (Phase 8 in `CLAUDE.md`).

## The prototype

Location: `prototype/logic-quest.html`. A single HTML file with no build step and no libraries. It loads a font from Google Fonts, which will need replacing for offline use.

What it does today:
- Three short lessons: load balancer, cache, AI agent loop.
- Each lesson has 5 steps. A dot animates between boxes, the active boxes highlight, and a caption explains each step. Back and Next buttons move through the steps.
- After the last step, a single multiple-choice question appears.
- Scoring: 10 points for a first-try correct answer, 5 after a retry, and a 5-point bonus on every third correct first try in a row. A wrong answer resets the streak and never removes points. Each lesson scores once. A level is gained every 30 points.
- Points and completed lessons are saved in the browser's local storage.
- Light and dark colour schemes, and reduced-motion is respected for the popup.

Known limits (not yet addressed):
- Lesson steps are hand-written inside the HTML, not loaded from data.
- Only one quiz question per lesson, and no mistake review.
- No automated tests.
- Not an installable web app (PWA) and not checked against the Android rules in `CLAUDE.md` (48 dp touch targets, back button, offline).
- Only the streak, points and level exist. There are no badges yet.

Treat the prototype as a reference for look and behaviour, not as code to extend. Phase 1 rebuilds it as a data-driven engine.

## Decisions made so far

- The app should work on Android phones, delivered as an installable web app (PWA). A native app store build is out of scope unless the owner approves it.
- Work happens in small phases with testing. Phase list and exit criteria are in `CLAUDE.md` section 9.
- Agentic AI lessons use simulated, rule-based agents. No live model calls and no API keys.
- 2026-10-19, tech stack: vanilla TypeScript (no UI framework), Vite for dev server and build, Vitest for tests. The owner left the choice to Claude. Reasons: the core is an SVG animation engine, so a framework adds little; typed lesson schema; small bundle for mid-range phones.
- 2026-10-19, toolchain: Node 24 LTS (v24.22.0), installed for the user only in `~/.local/node`. TypeScript is pinned to 6.0.x, not 7.x, because typescript-eslint 8.71.2 supports only `typescript >=4.8.4 <6.1.0`. Upgrade when typescript-eslint supports 7.
- 2026-10-19, hosting: GitHub Pages (HTTPS, so the PWA can install), with GitHub Actions running the tests as CI. Owner approved.
- 2026-10-19, lesson content: Claude drafts each lesson from cited sources and marks anything unverified `TODO-VERIFY`; the owner reviews and approves it before the phase closes.
- 2026-10-19, UI checks: the headless-Chrome check script is committed to the repo (`scripts/`), so phone-width and touch checks can be rerun each phase.
- 2026-10-19, curriculum: low-level design (LLD) added as Phase 5b, right after system design (HLD). The curriculum is a fixed, phased syllabus (`docs/CURRICULUM.md`); extra lessons can be requested in any session and follow the same "Claude drafts, owner reviews" process. No in-app lesson generation (it would need live model calls).
- 2026-10-19, goal raised: the owner wants to be confident as a senior SDE after finishing. Added Phase 5c, real-world systems: case studies (payment gateway, Swiggy-style food delivery, Uber-style ride-hailing, IRCTC-style train booking, and more) and incident studies from companies' published postmortems and engineering articles (Meta, Stripe, and others). Curriculum approved.
- 2026-10-19, rewards: points, levels, a forgiving daily streak (one freeze a week) and milestone badges. No cosmetic unlocks for now.
- 2026-10-19, daily goal: 1 lesson a day by default (about 5–10 minutes), changeable in settings.
- 2026-10-19, layout: docs moved into `docs/`, prototype into `prototype/`, git repo initialised. Owner approved.

## Decisions still open (ask the owner, do not decide alone)

Copied from `CLAUDE.md` section 12. Move each item here under "Decisions made" once answered.

- Whether DSA challenges include real code writing in the browser

## Glossary

- **HLD / LLD:** high-level design (components and how they connect) and low-level design (classes, modules, detailed flows).
- **PWA:** a website that can be installed on a phone's home screen and work offline.
- **Phase:** one stage of the plan in `CLAUDE.md` section 9. Only the current phase is worked on.

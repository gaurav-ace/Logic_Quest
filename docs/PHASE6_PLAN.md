# Phase 6 plan: Agentic AI

Status: draft, awaiting the owner's approval.

**Goal (CLAUDE.md section 9):** the agent loop, tool use, memory, planning, guardrails, failure modes and evaluation. Agents are simulated only, with scripted or rule-based behaviour and no live model calls.

**Done when:** the learner can break the loop (a tool failure, an infinite loop, a bad plan) and see how guardrails respond.

## The new piece (6.1, engine): agent runs

A sim shows numbers changing over time, but an agent run is a sequence of turns, so it gets its own lesson kind, `agent`. It borrows the sim's settings and challenges, and the trace's step-through.

**A scenario (code, like a sim model) has three parts:**
- **The task and its tools.** For example, "book a meeting" with `calendar.find`, `calendar.book` and `email.send`. Each tool is a small, deterministic function over a fake world, such as a calendar.
- **A scripted "model".** A rule-based policy that picks the next action from what's in its context: call a tool with arguments, write a note, make a plan, or answer. It's honest about being a script. Every lesson's "what this simplifies" note says that a real model's choices vary, and these rules only show the shape.
- **Settings the learner changes.** A step limit, whether tool errors are returned to the model, a guardrail on or off, how much history to keep, and failure injections such as "the calendar tool times out", "the tool returns the wrong person", "the model invents an argument" and "the plan is out of date".

**A run (pure and tested) records one frame per turn:**
- what's in the context;
- what the model decided;
- what the tool returned, or what the guardrail did;
- running counts: steps, tool calls, tokens (illustrative), blocked calls, and whether the task finished correctly.

**On screen:**
- the loop diagram (decide → act → observe), with the current part lit;
- a transcript of turns, each with a caption;
- the counters.

The learner steps through the run with "what happens next?" predictions, then changes a setting and runs it again. It reuses the stepped player.

**Challenges, like the sims' challenges:** goals are checked on the run's outcome, for example "finish the task in at most 8 steps with no unsafe tool call". They're tested the same way as the sims': each one is winnable with its hidden solution and not passable from its setup.

**Tests on the runner:**
- the step limit is never exceeded;
- a call the guardrail blocks never reaches the tool;
- every tool result answers a call that was really made;
- token counts add up;
- the same settings always give the same run.

Each scenario also gets claim tests for what its lesson teaches. For example: without a step limit, the "retry the failing tool" rule never ends; with one, it stops at the limit.

**Evaluation (A10)** is a computed trace. It runs the scripted agent over a small test set and grades each end state, and a "new prompt version" setting changes the policy, so the regression shows up in the table.

## Lessons (docs/CURRICULUM.md, A1–A10)

The existing "AI agent loop" diagram lesson stays as the track's easy introduction. It keeps its id, so nobody's progress is lost.

| Batch | Lessons | Kind |
|---|---|---|
| 6.1 Engine | runner, scenario format, renderer, validator rules, browser-check walk; first lesson **A3 The agent loop** (step limit, and a tool that keeps failing) | agent |
| 6.2 Foundations | **A1** Prompt in, text out (what one call can't do: no fresh facts, no actions); **A2** Tool use (the model asks, your code runs the tool, the result goes back); **A4** Memory (a context budget; keep everything versus notes versus compaction); **A5** Planning (plan first versus step by step; a plan that goes stale when the world changes) | diagram, agent ×3 |
| 6.3 Breaking things | **A6** Workflows versus agents (chains, routing, parallel steps, orchestrator-workers, evaluator-optimizer; when an agent is overkill; ends with a critique); **A7** Guardrails (input checks, tool permissions, human approval for risky actions, a prompt injection hidden in a tool result); **A8** Failure modes (inject a tool error, a loop, the wrong tool, an invented argument; watch which guardrail catches each one) | diagram, agent ×2 |
| 6.4 Scale and quality | **A9** Multi-agent systems (a lead agent and workers; parallel speed versus token cost; duplicated work and too many workers); **A10** Evaluating agents (test set, graders, end-state checks, catching a regression) | agent, trace |

## Sources (checked to load on 2026-10-19)

- Anthropic, "Building effective agents" (Dec 2024): workflows versus agents, the five workflow patterns, stopping conditions such as a maximum number of iterations, human checkpoints, ground truth from the environment, starting simple.
- Claude Platform docs, "Tool use with Claude": `tool_use` blocks, `stop_reason: "tool_use"`, your code runs client tools and returns a `tool_result`, server tools.
- Anthropic, "Effective context engineering for AI agents" (Sep 2025): context as a finite resource, compaction, structured note-taking, sub-agents, just-in-time retrieval.
- Anthropic, "How we built our multi-agent research system" (Jun 2025): orchestrator-worker; agents use about 4× and multi-agent systems about 15× the tokens of chats; failure modes (50 subagents for simple queries, duplicated work); evaluation advice.
- Anthropic, "Demystifying evals for AI agents" (Jan 2026): tasks, trials, graders and harness; code, model and human graders; capability versus regression evals.
- OWASP Top 10 for LLM Applications 2025: LLM01 Prompt Injection, LLM06 Excessive Agency.
- Yao et al. (2022), ReAct (already cited).

Anything I can't verify while building is marked `TODO-VERIFY` and listed in the report.

## Risks

- **Teaching wrong ideas about real models.** A script is predictable and a real model isn't. Each lesson says what the script's rules are and what it simplifies. Claims about real systems come only from the sources above. Token counts are labelled illustrative.
- **Size.** About 9 lessons plus a new lesson kind. 6.1 alone is more than 5 files, so it's split into a pure runner with tests first, then the renderer and A3.
- **Bundle size.** It's already past Vite's 500 kB warning (parked idea: load lessons per track). This phase adds to it. I'll report the number after each batch.
- **No new dependencies.**

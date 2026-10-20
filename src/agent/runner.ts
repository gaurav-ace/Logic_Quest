import type { QuizQuestion } from '../lesson/schema';
import type { Params } from '../sim/types';
import type { Frame, Value, View } from '../trace/types';
import type { AgentEvent, AgentRun, Call, Decision, Entry, RunState, Scenario, ToolResult } from './types';

// The agent loop every scenario shares: decide, (guard), act, observe, repeat. The runner owns
// the parts that must hold whatever the script decides: the step limit, guardrails before tools,
// how tool errors reach the model, the context budget, and the counts. Scenarios own the world,
// the tools and the scripted model.
//
// Settings the runner reads, when a scenario offers them as controls:
//   limitOn + maxSteps   stop the loop after maxSteps model turns
//   errors               send a failed tool's error back to the model (else it sees an empty result)
//   budget               context size in tokens; the oldest entries are dropped past it
//   compact              when dropping, leave a short summary in their place

/** A loop with no limit would never end; the demo stops here and says so. */
export const RUN_CAP = 30;
/** Rows of the transcript shown at once, so it fits a phone. */
const TRANSCRIPT_ROWS = 5;
const MAX_ASKS = 3;

/** Illustrative token count: roughly one token per 4 characters of English. */
export const tokensOf = (text: string) => Math.max(1, Math.ceil(text.length / 4));

export const callText = (c: Call) => `${c.tool}(${Object.values(c.args).join(', ')})`;

export function decisionText(d: Decision): string {
  if (d.kind === 'call') return callText(d.call);
  if (d.kind === 'answer') return `answer: ${d.text}`;
  return `note: ${d.text}`;
}

export function runAgent<W>(scenario: Scenario<W>, params: Params): AgentRun {
  const state: RunState<W> = {
    world: scenario.init(params),
    params,
    context: [{ kind: 'task', text: scenario.task, tokens: tokensOf(scenario.task) }],
    notes: [],
    turn: 0,
    answer: null,
    calls: [],
    outcome: { answered: 0, stopped: 0, correct: 0, steps: 0, toolCalls: 0, tokens: 0, blocked: 0, reviews: 0 },
  };
  const frames: Frame[] = [];
  const rows: Value[][] = [];
  let asked = 0;
  const hasControl = (id: string) => scenario.controls.some((c) => c.id === id);
  const limit = hasControl('maxSteps') && (!hasControl('limitOn') || params.limitOn) ? Number(params.maxSteps) : Infinity;
  const budget = hasControl('budget') ? Number(params.budget) : Infinity;

  const views = (): View[] => [
    { type: 'table', label: 'Transcript', columns: ['turn', 'model did', 'result'], rows: rows.slice(-TRANSCRIPT_ROWS), ...(rows.length ? { highlightRow: Math.min(rows.length, TRANSCRIPT_ROWS) - 1 } : {}) },
    ...(Number.isFinite(budget) || state.notes.length
      ? [
          {
            type: 'table' as const,
            label: `Context (${contextTokens()} of ${Number.isFinite(budget) ? budget : '∞'} tokens), oldest first`,
            columns: ['kind', 'what the model can see'],
            rows: [...state.context.map((e): Value[] => [e.kind, e.text]), ...state.notes.map((n): Value[] => ['note (kept)', n])],
          },
        ]
      : []),
  ];
  const contextTokens = () => state.context.reduce((s, e) => s + e.tokens, 0) + state.notes.reduce((s, n) => s + tokensOf(n), 0);
  const vars = (): [string, Value][] => {
    const o = state.outcome;
    return [['steps', o.steps], ['tool calls', o.toolCalls], ['tokens', o.tokens], ...(scenario.guard ? ([['blocked', o.blocked], ['reviews', o.reviews]] as [string, Value][]) : [])];
  };
  const ask = (event: AgentEvent): QuizQuestion | undefined => {
    if (asked >= MAX_ASKS || !scenario.predict) return undefined;
    const q = scenario.predict(event, state, asked);
    if (q) asked++;
    return q;
  };
  const frame = (caption: string, q?: QuizQuestion, end = false) => {
    frames.push(structuredClone({ line: null, caption, vars: end ? [...vars(), ['result', state.answer ?? 'stopped']] : vars(), views: views(), ...(q ? { ask: q } : {}) }));
  };
  const add = (entry: Omit<Entry, 'tokens'>) => {
    state.context.push({ ...entry, tokens: tokensOf(entry.text) });
    // Over budget: drop the oldest entries after the pinned task (compaction leaves a summary).
    const dropped: Entry[] = [];
    while (contextTokens() > budget && state.context.length > 2) dropped.push(...state.context.splice(1, 1));
    if (dropped.length) {
      // Compaction keeps a short summary in their place. Making room for it may fold more old
      // entries in (an earlier summary is the oldest, so it is folded in first).
      let compacted = false;
      if (params.compact) {
        const summarize = scenario.summarize ?? ((es: Entry[]) => `earlier: ${es.map((e) => e.text).join('; ')}`.slice(0, 60));
        let summary = summarize(dropped);
        while (contextTokens() + tokensOf(summary) > budget && state.context.length > 2) {
          dropped.push(...state.context.splice(1, 1));
          summary = summarize(dropped);
        }
        compacted = contextTokens() + tokensOf(summary) <= budget;
        if (compacted) state.context.splice(1, 0, { kind: 'summary', text: summary, tokens: tokensOf(summary) });
      }
      frame(`The context is over its ${budget}-token budget, so the oldest ${dropped.length === 1 ? 'entry is' : `${dropped.length} entries are`} dropped${compacted ? ' and replaced by a short summary' : ''}: the model can no longer see ${dropped.map((e) => `"${e.text}"`).join(', ')}.`, ask({ kind: 'dropped', entries: dropped }));
    }
  };

  frame(`Task: ${scenario.task} The model works in a loop: decide, act with a tool, look at the result, repeat.`);
  while (state.answer === null) {
    if (state.outcome.steps >= limit) {
      state.outcome.stopped = 1;
      frame(`Step limit reached (${limit}): the app stops the loop and tells the user it couldn't finish, instead of letting it run on.`, ask({ kind: 'limit' }));
      break;
    }
    if (state.outcome.steps >= RUN_CAP) {
      state.outcome.stopped = 1;
      frame(`Nothing would ever stop this loop: with no step limit it runs forever, burning tokens. This demo stops it at ${RUN_CAP} turns.`);
      break;
    }
    const decision = scenario.policy({ context: state.context, notes: state.notes, turn: state.turn }, params);
    state.turn++;
    state.outcome.steps++;
    state.outcome.tokens += contextTokens() + tokensOf(decisionText(decision));
    const q = ask({ kind: 'decision', decision });
    if (decision.kind === 'answer') {
      state.answer = decision.text;
      state.outcome.answered = 1;
      state.outcome.correct = scenario.grade(decision.text, state) ? 1 : 0;
      rows.push([state.turn, `answer`, decision.text]);
      frame(`Turn ${state.turn}: ${decision.why} The model answers: "${decision.text}"`, q);
      break;
    }
    if (decision.kind === 'note') {
      state.notes.push(decision.text);
      rows.push([state.turn, `note`, decision.text]);
      frame(`Turn ${state.turn}: ${decision.why} It writes a note to memory: "${decision.text}". Notes are kept even when old context is dropped.`, q);
      continue;
    }
    const call = decision.call;
    state.calls.push(call);
    const row: Value[] = [state.turn, callText(call), '…'];
    rows.push(row);
    add({ kind: 'call', text: callText(call), tool: call.tool });
    frame(`Turn ${state.turn}: ${decision.why} It asks for ${callText(call)}. The model only asks; the app decides whether to run it.`, q);

    const verdict = scenario.guard?.(call, state) ?? null;
    if (verdict && 'review' in verdict) {
      state.outcome.reviews++;
      const approved = scenario.review ? scenario.review(call, state) : false;
      const vq = ask({ kind: 'verdict', call, verdict, approved });
      if (!approved) {
        state.outcome.blocked++;
        row[2] = 'rejected by a person';
        add({ kind: 'blocked', text: `${callText(call)} rejected by reviewer` });
        frame(`Guardrail: ${verdict.review} A person reviews it and rejects it, so the tool never runs.`, vq);
        continue;
      }
      frame(`Guardrail: ${verdict.review} A person reviews it and approves it.`, vq);
    } else if (verdict) {
      state.outcome.blocked++;
      row[2] = 'blocked';
      add({ kind: 'blocked', text: `${callText(call)} blocked: ${verdict.block}` });
      frame(`Guardrail: blocked, ${verdict.block} The tool never runs; the model is told it was blocked.`, ask({ kind: 'verdict', call, verdict }));
      continue;
    }

    const tool = scenario.tools[call.tool];
    const result: ToolResult = tool ? tool.run(call.args, state.world, params) : { ok: false, text: `no tool called ${call.tool}` };
    state.outcome.toolCalls++;
    scenario.afterCall?.(call, result, state);
    const rq = ask({ kind: 'result', call, result });
    if (result.ok) {
      row[2] = result.text;
      add({ kind: 'result', text: result.text, tool: call.tool });
      frame(`The app runs it and sends the result back: ${result.text}.`, rq);
    } else if (params.errors === false) {
      row[2] = '(empty)';
      add({ kind: 'result', text: '', tool: call.tool });
      frame(`The tool failed (${result.text}), but the app doesn't pass errors on: the model just sees an empty result.`, rq);
    } else {
      row[2] = `error: ${result.text}`;
      add({ kind: 'error', text: result.text, tool: call.tool });
      frame(`The tool fails, and the app sends the error back: "${result.text}".`, rq);
    }
  }
  scenario.finish?.(state);
  const o = state.outcome;
  frame(
    o.answered
      ? `Done in ${o.steps} turn${o.steps === 1 ? '' : 's'}, ${o.toolCalls} tool call${o.toolCalls === 1 ? '' : 's'}, about ${o.tokens} tokens. The answer is ${o.correct ? 'right' : 'wrong'}.`
      : `Stopped after ${o.steps} turns and about ${o.tokens} tokens, without an answer.`,
    undefined,
    true,
  );
  return { frames, outcome: { ...o } };
}

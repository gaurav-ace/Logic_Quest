import { predict } from '../../trace/tools';
import type { Scenario } from '../types';

// A2 "Tool use": the model can't look anything up by itself. Given a tool, it asks for a call;
// your code runs it and sends the result back. Without the tool it can only guess, and if your
// code never runs the call, no result ever comes.

interface World {
  status: string;
}

export const orderStatus: Scenario<World> = {
  id: 'order-status',
  task: 'Where is my order #4417?',
  rules: [
    'If an order_status result is in the context, answer from it.',
    'If it has no order_status tool, answer from general knowledge.',
    'If the last call got no result, ask for it again.',
    'Otherwise, ask for order_status(4417).',
  ],
  controls: [
    { kind: 'toggle', id: 'hasTool', label: 'Give the model the order_status tool', value: true },
    { kind: 'toggle', id: 'runTool', label: 'Your code runs the calls the model asks for', value: true },
    { kind: 'slider', id: 'maxSteps', label: 'Max steps', min: 2, max: 8, step: 1, value: 4 },
  ],
  metrics: [
    { id: 'correct', label: 'Right answer', format: 'count', better: 'high' },
    { id: 'madeUp', label: 'Made-up answers', format: 'count', better: 'low' },
    { id: 'toolCalls', label: 'Tool calls run', format: 'count', better: 'low' },
    { id: 'steps', label: 'Model turns', format: 'count', better: 'low' },
  ],
  tools: {
    order_status: {
      describe: 'order_status(id): where an order is now',
      // With runTool off, nothing runs the call: the app just never sends a result back.
      run: (_args, world, params) => (params.runTool ? { ok: true, text: world.status } : { ok: false, text: 'no result: the app never ran the call' }),
    },
  },
  init: () => ({ status: 'out for delivery, arriving by 6 pm' }),
  policy({ context }, params) {
    const got = context.find((e) => e.kind === 'result' && e.tool === 'order_status' && e.text);
    if (got) return { kind: 'answer', text: `Your order is ${got.text}.`, why: 'Rule 1: the result is in the context.' };
    if (!params.hasTool) return { kind: 'answer', text: 'Orders usually arrive within 3 to 5 days.', why: "Rule 2: it has no tool, so it can only answer from what it already knows, which doesn't include your order." };
    const last = context[context.length - 1]!;
    if (last.kind === 'error') return { kind: 'call', call: { tool: 'order_status', args: { id: 4417 } }, why: 'Rule 3: no result came back, so it asks again.' };
    return { kind: 'call', call: { tool: 'order_status', args: { id: 4417 } }, why: 'Rule 4: it needs the live status.' };
  },
  grade: (answer, state) => answer.includes(state.world.status),
  finish(state) {
    state.outcome.madeUp = state.outcome.answered && !state.outcome.correct ? 1 : 0;
  },
  predict(event, state, asked) {
    if (event.kind === 'decision' && event.decision.kind === 'call' && asked === 0) {
      return predict(
        'The model has an order_status tool. What does it send back on its first turn?',
        'A request to call order_status(4417)',
        'The model only asks for the call (a tool_use block). Your code decides whether to run it, runs it, and sends the result back.',
        [
          { value: 'The order status', why: "It can't know the status yet: nothing has looked it up." },
          { value: 'Nothing: it runs the tool itself', why: 'The model never runs tools; your application does.' },
        ],
        13,
      );
    }
    if (event.kind === 'result' && !event.result.ok && asked <= 1) {
      return predict(
        "The model asked for order_status, but your code doesn't run calls. What does the model get back?",
        'No result at all',
        "Nothing runs unless your code runs it. The model is left waiting, and asks again.",
        [
          { value: 'The order status', why: 'Something has to run the lookup to get it.' },
          { value: 'An answer it worked out itself', why: "The model can't reach your order system." },
        ],
        17,
      );
    }
    if (event.kind === 'decision' && event.decision.kind === 'answer' && !state.params.hasTool) {
      return predict(
        'The model has no tool and the user asks about their own order. What will it do?',
        'Answer with a general guess',
        "With no way to look it up, the best it can do is general knowledge, which says nothing true about order #4417.",
        [
          { value: 'Look the order up', why: 'It has no tool to do that with.' },
          { value: "Say exactly where the order is", why: "That's in your order system, which it can't see." },
        ],
        19,
      );
    }
    return undefined;
  },
};

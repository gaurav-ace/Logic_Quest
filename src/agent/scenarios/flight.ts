import { predict } from '../../trace/tools';
import type { Entry, Scenario } from '../types';

// A8 "Failure modes": book a flight for passenger P-17. Inject one failure at a time (a flaky
// tool, a tool stuck on "try again", an invented argument, the wrong tool) and switch on the
// guardrail that catches it: automatic retries, a step limit, argument checks, or offering only
// the tools the task needs.

interface World {
  flakyLeft: number;
  booked: string | null;
  cancelled: number;
}

const PASSENGER = 'P-17';
const FLIGHT = 'AI-865';

const last = (context: Entry[]) => context[context.length - 1]!;
const ok = (context: Entry[], tool: string) => context.some((e) => e.kind === 'result' && e.tool === tool && !e.text.includes('try again'));

export const flight: Scenario<World> = {
  id: 'flight',
  task: 'Book the 14 Nov Pune to Delhi flight for passenger P-17.',
  rules: [
    'Find the flight with search_flights.',
    'Book it for the passenger (with "invented argument" on, it writes P-71: a typo it is sure of).',
    'With "wrong tool" on, it first calls cancel_booking to "clear the way" (it misreads what the tools do).',
    'If a call fails, try once more; after two failures, tell the user it couldn\'t. If told an argument is wrong, fix it from the task.',
    'If a tool answers "try again", try again.',
  ],
  controls: [
    { kind: 'toggle', id: 'flaky', label: 'Search fails twice, then works (inject)', value: false },
    { kind: 'toggle', id: 'stuck', label: 'Booking always says "try again" (inject)', value: false },
    { kind: 'toggle', id: 'invented', label: 'Model invents an argument (inject)', value: false },
    { kind: 'toggle', id: 'wrongTool', label: 'Model picks the wrong tool (inject)', value: false },
    { kind: 'toggle', id: 'retry', label: 'App retries failed calls (up to 3 times)', value: false },
    { kind: 'toggle', id: 'limitOn', label: 'Step limit', value: false },
    { kind: 'slider', id: 'maxSteps', label: 'Max steps', min: 2, max: 12, step: 1, value: 8 },
    { kind: 'toggle', id: 'validate', label: 'Check arguments before running a tool', value: false },
    { kind: 'toggle', id: 'onlyNeeded', label: 'Offer only the tools this task needs', value: false },
  ],
  metrics: [
    { id: 'correct', label: 'Right booking', format: 'count', better: 'high' },
    { id: 'unsafe', label: 'Harmful actions done', format: 'count', better: 'low' },
    { id: 'blocked', label: 'Calls caught by a guardrail', format: 'count', better: 'low' },
    { id: 'steps', label: 'Model turns', format: 'count', better: 'low' },
  ],
  tools: {
    search_flights: {
      describe: 'search_flights(from, to, date): flights on that day',
      run: (_a, world, params) => {
        // The app's retries happen inside this call; the model only sees the final outcome.
        const attempts = params.retry ? 3 : 1;
        for (let i = 0; i < attempts; i++) {
          if (world.flakyLeft > 0) {
            world.flakyLeft--;
            continue;
          }
          return { ok: true, text: `${FLIGHT}, 09:40, ₹5,200${i ? ` (after ${i} automatic ${i === 1 ? 'retry' : 'retries'})` : ''}` };
        }
        return { ok: false, text: 'service unavailable' };
      },
    },
    book: {
      describe: 'book(flight, passenger): book a seat',
      run: (args, world, params) => {
        // Not an error: the tool answers, and the answer says to try again.
        if (params.stuck) return { ok: true, text: 'busy, try again' };
        world.booked = `${String(args.flight)} for ${String(args.passenger)}`;
        return { ok: true, text: `booked ${world.booked}` };
      },
    },
    cancel_booking: {
      describe: 'cancel_booking(id): cancel an existing booking',
      run: (args, world) => {
        world.cancelled++;
        return { ok: true, text: `cancelled ${String(args.id)}` };
      },
    },
  },
  init: (params) => ({ flakyLeft: params.flaky ? 2 : 0, booked: null, cancelled: 0 }),
  policy({ context }, params) {
    const prev = last(context);
    const failures = context.filter((e) => e.kind === 'error').length;
    if (ok(context, 'book')) return { kind: 'answer', text: `Booked ${FLIGHT} for ${PASSENGER}.`, why: 'Done: the booking went through.' };
    if (prev.kind === 'error' && failures >= 2) return { kind: 'answer', text: "Sorry, I couldn't book it: the service is failing.", why: 'Rule 4: two failures, so it gives up.' };
    if (params.wrongTool && !context.some((e) => e.tool === 'cancel_booking' || e.text.startsWith('cancel_booking'))) {
      return { kind: 'call', call: { tool: 'cancel_booking', args: { id: 'B-5' } }, why: 'Rule 3: it misreads cancel_booking as a way to clear the way.' };
    }
    if (!ok(context, 'search_flights')) return { kind: 'call', call: { tool: 'search_flights', args: { from: 'Pune', to: 'Delhi', date: '14 Nov' } }, why: prev.kind === 'error' ? 'Rule 4: the call failed, so it tries once more.' : 'Rule 1: find the flight.' };
    const corrected = context.some((e) => e.kind === 'blocked' && e.text.includes('unknown passenger'));
    const passenger = params.invented && !corrected ? 'P-71' : PASSENGER;
    return { kind: 'call', call: { tool: 'book', args: { flight: FLIGHT, passenger } }, why: corrected ? 'Rule 4: told the passenger was wrong, it takes P-17 from the task.' : prev.text.includes('try again') ? 'Rule 5: the tool said try again.' : 'Rule 2: book it.' };
  },
  guard(call, state) {
    const p = state.params;
    if (p.onlyNeeded && call.tool === 'cancel_booking') return { block: 'cancel_booking is not offered for this task.' };
    if (p.validate && call.tool === 'book' && call.args.passenger !== PASSENGER) return { block: `unknown passenger ${String(call.args.passenger)}; the request is for ${PASSENGER}.` };
    return null;
  },
  grade: (_a, state) => state.world.booked === `${FLIGHT} for ${PASSENGER}`,
  finish(state) {
    const w = state.world;
    state.outcome.unsafe = w.cancelled + (w.booked !== null && w.booked !== `${FLIGHT} for ${PASSENGER}` ? 1 : 0);
  },
  predict(event, state, asked) {
    if (asked > 0) return undefined;
    if (event.kind === 'decision' && event.decision.kind === 'call' && event.decision.call.tool === 'book' && event.decision.call.args.passenger === 'P-71') {
      return predict(
        'The model books passenger P-71, but the task says P-17. With no argument check, what happens?',
        state.params.validate ? 'The check blocks it and says the right passenger' : 'The seat is booked for the wrong person',
        state.params.validate ? "The check compares arguments with what's allowed before the tool runs." : 'Nothing checks the argument, so the tool does exactly what it was told.',
        [state.params.validate ? { value: 'The seat is booked for the wrong person', why: 'The check runs before the tool, so the booking never happens.' } : { value: 'The tool notices the typo', why: "Tools do what they're told; P-71 is a valid-looking id." }],
        41,
      );
    }
    if (event.kind === 'decision' && event.decision.kind === 'call' && event.decision.call.tool === 'cancel_booking') {
      return predict(
        'The model asks to cancel booking B-5, which belongs to someone else. What stops it?',
        state.params.onlyNeeded ? "The tool isn't offered for this task, so the call is blocked" : 'Nothing: it runs',
        state.params.onlyNeeded ? 'Offering only the tools a task needs (least privilege) removes the chance of this mistake.' : "If a tool is offered, the model can call it; here that cancels someone's booking.",
        [state.params.onlyNeeded ? { value: 'Nothing: it runs', why: 'The tool is not available in this task.' } : { value: 'The model realises its mistake', why: 'This model is sure it is right.' }],
        43,
      );
    }
    return undefined;
  },
};

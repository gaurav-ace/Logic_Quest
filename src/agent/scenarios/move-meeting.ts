import { predict } from '../../trace/tools';
import type { Entry, Scenario } from '../types';

// A5 "Planning": move a meeting to Thursday and tell the team. A plan written up front can go
// stale: if someone takes Room A after the plan is made, following the plan blindly emails the
// team a time that was never booked. Re-planning when a step fails, or deciding one step at a
// time from the latest results, gets it right.

interface World {
  /** Rooms free on Thursday at 10:00, in the order find_room returns them. */
  free: string[];
  booked: string | null;
  emailed: string | null;
}

const PLAN = 'plan: book(Room A); email(team, Room A)';

const results = (context: Entry[], tool: string) => context.filter((e) => (e.kind === 'result' || e.kind === 'error') && e.tool === tool);

export const moveMeeting: Scenario<World> = {
  id: 'move-meeting',
  task: 'Move the team meeting to Thursday 10:00 and tell everyone where it is.',
  rules: [
    'Plan first on: write a plan once (book Room A, then email the team), then do its steps in order without checking results.',
    'Re-plan on failure on: if a step failed, write a new plan that starts by finding a free room.',
    'Plan first off: decide each step from the latest result (find a room, book it, email, answer).',
    'When the email is sent, answer.',
  ],
  controls: [
    { kind: 'toggle', id: 'planFirst', label: 'Plan first, then follow the plan', value: true },
    { kind: 'toggle', id: 'replan', label: 'Re-plan when a step fails', value: false },
    { kind: 'toggle', id: 'stale', label: 'Someone books Room A after the plan is made (inject)', value: false },
  ],
  metrics: [
    { id: 'correct', label: 'Team told the right room', format: 'count', better: 'high' },
    { id: 'wrongEmails', label: 'Emails about an unbooked room', format: 'count', better: 'low' },
    { id: 'steps', label: 'Model turns', format: 'count', better: 'low' },
    { id: 'tokens', label: 'Tokens (illustrative)', format: 'count', better: 'low' },
  ],
  tools: {
    find_room: {
      describe: 'find_room(day, time): the first free room',
      run: (_a, world) => (world.free.length ? { ok: true, text: world.free[0]! } : { ok: false, text: 'no free room' }),
    },
    book: {
      describe: 'book(room): book it for Thursday 10:00',
      run: (args, world) => {
        const room = String(args.room);
        if (!world.free.includes(room)) return { ok: false, text: `${room} is already booked` };
        world.booked = room;
        world.free = world.free.filter((r) => r !== room);
        return { ok: true, text: `booked ${room}` };
      },
    },
    email: {
      describe: 'email(to, room): tell people where the meeting is',
      run: (args, world) => {
        world.emailed = String(args.room);
        return { ok: true, text: `emailed team: ${String(args.room)}` };
      },
    },
  },
  init: (params) => ({ free: params.stale ? ['Room B'] : ['Room A', 'Room B'], booked: null, emailed: null }),
  policy({ context, notes }, params) {
    const emailed = results(context, 'email').some((e) => e.kind === 'result');
    if (emailed) return { kind: 'answer', text: 'Moved to Thursday 10:00; the team has been told.', why: 'Rule 4: the email is sent.' };
    const last = context[context.length - 1]!;
    if (params.planFirst) {
      const plan = notes[notes.length - 1];
      if (!plan) return { kind: 'note', text: PLAN, why: 'Rule 1: it writes the plan first, assuming Room A is free as usual.' };
      if (params.replan && last.kind === 'error' && plan === PLAN) {
        return { kind: 'note', text: 'plan: find_room(Thu, 10:00); book(it); email(team, it)', why: 'Rule 2: a step failed, so it plans again from what it now knows.' };
      }
      if (plan === PLAN) {
        // Follow the plan in order, whatever the results said.
        if (!results(context, 'book').length) return { kind: 'call', call: { tool: 'book', args: { room: 'Room A' } }, why: 'Rule 1: plan step 1.' };
        return { kind: 'call', call: { tool: 'email', args: { to: 'team', room: 'Room A' } }, why: 'Rule 1: plan step 2 (it doesn\'t check how step 1 went).' };
      }
    }
    // Step by step (or the new plan): use the latest facts.
    const found = results(context, 'find_room').filter((e) => e.kind === 'result').at(-1)?.text;
    const booked = results(context, 'book').filter((e) => e.kind === 'result').at(-1)?.text;
    if (!found) return { kind: 'call', call: { tool: 'find_room', args: { day: 'Thu', time: '10:00' } }, why: params.planFirst ? 'New plan, step 1.' : 'Rule 3: first find a free room.' };
    if (!booked) return { kind: 'call', call: { tool: 'book', args: { room: found } }, why: params.planFirst ? 'New plan, step 2.' : 'Rule 3: book the room it found.' };
    return { kind: 'call', call: { tool: 'email', args: { to: 'team', room: booked.replace('booked ', '') } }, why: params.planFirst ? 'New plan, step 3.' : 'Rule 3: tell the team the booked room.' };
  },
  grade: (_answer, state) => state.world.booked !== null && state.world.emailed === state.world.booked,
  finish(state) {
    const w = state.world;
    state.outcome.wrongEmails = w.emailed !== null && w.emailed !== w.booked ? 1 : 0;
  },
  predict(event, state, asked) {
    if (event.kind === 'result' && !event.result.ok && event.call.tool === 'book' && asked === 0) {
      const blind = state.params.planFirst && !state.params.replan;
      return predict(
        'Booking Room A failed: someone took it after the plan was made. What does the model do next?',
        blind ? 'Emails the team about Room A anyway' : state.params.planFirst ? 'Writes a new plan' : 'Finds another free room',
        blind ? "It follows the plan without checking results, so the team is told about a room nobody booked." : state.params.planFirst ? 'Re-planning on failure: the old plan is stale, so it starts again from the facts.' : "Deciding step by step, it sees the failure and finds another room.",
        [
          ...(blind ? [{ value: 'Finds another free room', why: 'Only if it looked at the result; this model follows the plan blindly.' }] : [{ value: 'Emails the team about Room A anyway', why: 'It saw the failure, so it does not carry on with Room A.' }]),
          { value: 'Stops and reports an error', why: 'None of its rules says to stop here.' },
        ],
        29,
      );
    }
    return undefined;
  },
};

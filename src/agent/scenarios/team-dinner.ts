import { predict } from '../../trace/tools';
import type { Entry, Scenario } from '../types';

// A4 "Memory": the model asks five teammates what they can eat, then picks a restaurant. With a
// small context, early answers fall out of view: the model asks again (wasting turns) or, after a
// lossy summary, picks a restaurant that doesn't suit someone. Notes it writes down survive.

interface World {
  needs: Record<string, string>;
}

export const TEAM = ['Asha', 'Ben', 'Chen', 'Dev', 'Ela'] as const;
const NEEDS: Record<string, string> = { Asha: 'vegetarian', Ben: 'no nuts', Chen: 'gluten-free', Dev: 'vegan', Ela: 'mild food' };
/** What each restaurant can serve, in the order the model checks them. */
export const RESTAURANTS: [string, string[]][] = [
  ['Pasta Place', ['vegetarian', 'no nuts', 'mild food']],
  ['Spice Route', ['vegetarian', 'no nuts', 'gluten-free', 'vegan']],
  ['Green Bowl', ['vegetarian', 'no nuts', 'gluten-free', 'vegan', 'mild food']],
  ['Steak House', ['gluten-free', 'mild food']],
];

/** Everything the model can see right now: its context and its notes. */
const visible = (context: Entry[], notes: string[]) => [...context.map((e) => e.text), ...notes].join(' | ');

/** Teammates whose name the model can still see, and the needs it can still read in full. */
export function recall(context: Entry[], notes: string[]) {
  const seen = visible(context.slice(1), notes); // the task names everyone, so skip it
  const known = TEAM.filter((n) => seen.includes(`${n}:`) || seen.includes(`(${n})`));
  const needs = TEAM.filter((n) => seen.includes(`${n}: ${NEEDS[n]}`)).map((n) => NEEDS[n]!);
  return { known, needs };
}

export const pick = (needs: string[]) => RESTAURANTS.find(([, serves]) => needs.every((x) => serves.includes(x)))?.[0] ?? 'none of them';

export const teamDinner: Scenario<World> = {
  id: 'team-dinner',
  task: 'Book a team dinner that suits Asha, Ben, Chen, Dev and Ela. Options: Pasta Place, Spice Route, Green Bowl, Steak House.',
  rules: [
    'Ask each teammate what they can eat, until it has heard from all five (it looks for their names in what it can see).',
    'If notes are on: after each answer, write it down as a note.',
    'Then pick the first restaurant that fits every need it can still read, and answer.',
  ],
  controls: [
    { kind: 'slider', id: 'budget', label: 'Context budget', min: 40, max: 160, step: 10, value: 160, unit: 'tokens' },
    { kind: 'toggle', id: 'notes', label: 'Model writes notes to memory', value: false },
    { kind: 'toggle', id: 'compact', label: 'Compact dropped context into a summary', value: false },
  ],
  metrics: [
    { id: 'correct', label: 'Right restaurant', format: 'count', better: 'high' },
    { id: 'asked', label: 'Questions asked', format: 'count', better: 'low' },
    { id: 'steps', label: 'Model turns', format: 'count', better: 'low' },
    { id: 'tokens', label: 'Tokens (illustrative)', format: 'count', better: 'low' },
  ],
  tools: {
    ask_team: {
      describe: 'ask_team(name): what that teammate can eat',
      run: (args, world) => ({ ok: true, text: `${String(args.name)}: ${world.needs[String(args.name)]}` }),
    },
  },
  init: () => ({ needs: { ...NEEDS } }),
  policy({ context, notes }, params) {
    const last = context[context.length - 1]!;
    if (params.notes && last.kind === 'result' && last.tool === 'ask_team' && !notes.includes(last.text)) {
      return { kind: 'note', text: last.text, why: 'Rule 2: it writes the answer down.' };
    }
    const { known, needs } = recall(context, notes);
    const next = TEAM.find((n) => !known.includes(n));
    if (next) return { kind: 'call', call: { tool: 'ask_team', args: { name: next } }, why: `Rule 1: it can't see an answer from ${next}.` };
    return { kind: 'answer', text: `Booked ${pick(needs)}.`, why: `Rule 3: it can read ${needs.length === 5 ? 'all five needs' : `${needs.length} of the five needs`}.` };
  },
  // A summary keeps the facts it can fit: who said what, oldest first, cut off at 60 characters.
  summarize(dropped) {
    const facts = [...new Set(dropped.flatMap((e) => e.text.match(new RegExp(`(${TEAM.join('|')}): [a-z -]+?(?=;|$|\\|)`, 'g')) ?? []))];
    return `earlier: ${facts.join('; ')}`.slice(0, 60);
  },
  grade: (answer) => answer === `Booked ${pick(Object.values(NEEDS))}.`,
  finish(state) {
    state.outcome.asked = state.calls.length;
  },
  predict(event, state, asked) {
    if (event.kind === 'dropped' && asked === 0) {
      const gone = event.entries.find((e) => e.kind === 'result');
      if (!gone) return undefined;
      const name = gone.text.split(':')[0]!;
      return predict(
        `The context is full, and ${name}'s answer is about to be dropped${state.params.notes ? ', but it is also in a note' : ''}. What will the model do about ${name} later?`,
        state.params.notes ? 'Nothing: the note still has it' : state.params.compact ? 'Depends on the summary' : `Ask ${name} again`,
        state.params.notes ? 'Notes are kept outside the context, so the answer survives.' : state.params.compact ? "If the short summary still names them in full, it remembers; a cut-off summary loses details." : `Once the answer is out of view, the model can't tell it ever asked.`,
        state.params.notes
          ? [{ value: `Ask ${name} again`, why: 'The note keeps the answer in view.' }]
          : [
              { value: 'Nothing: it remembers', why: "The model only knows what's in its context right now." },
              ...(state.params.compact ? [{ value: `Ask ${name} again`, why: 'The summary may still name them, so it might not ask.' }] : [{ value: 'Depends on the summary', why: "Compaction is off: there's no summary." }]),
            ],
        23,
      );
    }
    return undefined;
  },
};

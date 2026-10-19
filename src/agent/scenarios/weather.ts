import { predict } from '../../trace/tools';
import type { Entry, Scenario } from '../types';

// A3 "The agent loop": one tool, one question. Break the tool and watch the loop: a model that
// retries on every error never stops without a step limit, and a model that never hears about
// the error makes an answer up.

interface World {
  forecast: string;
}

const lastOf = (context: Entry[]) => context[context.length - 1]!;

export const weather: Scenario<World> = {
  id: 'weather',
  task: 'Will it rain in Pune tomorrow? Should I take an umbrella?',
  rules: [
    'If a forecast is in the context, answer from it.',
    'If the last forecast call failed, call it again.',
    'If the last forecast came back empty, answer anyway with a guess.',
    'Otherwise, call forecast(Pune, tomorrow).',
  ],
  controls: [
    { kind: 'toggle', id: 'down', label: 'Forecast tool is down (inject a failure)', value: false },
    { kind: 'toggle', id: 'errors', label: 'Send tool errors back to the model', value: true },
    { kind: 'toggle', id: 'limitOn', label: 'Step limit', value: true },
    { kind: 'slider', id: 'maxSteps', label: 'Max steps', min: 1, max: 10, step: 1, value: 6 },
  ],
  metrics: [
    { id: 'correct', label: 'Right answer', format: 'count', better: 'high' },
    { id: 'madeUp', label: 'Made-up answers', format: 'count', better: 'low' },
    { id: 'steps', label: 'Model turns', format: 'count', better: 'low' },
    { id: 'tokens', label: 'Tokens (illustrative)', format: 'count', better: 'low' },
  ],
  tools: {
    forecast: {
      describe: 'forecast(city, day): the weather forecast',
      run: (_args, world, params) => (params.down ? { ok: false, text: 'timeout after 10 s' } : { ok: true, text: world.forecast }),
    },
  },
  init: () => ({ forecast: 'rain, 80% chance' }),
  policy({ context }) {
    const got = context.find((e) => e.kind === 'result' && e.tool === 'forecast' && e.text);
    if (got) return { kind: 'answer', text: `Yes, take an umbrella: ${got.text}.`, why: 'Rule 1: a forecast is in the context.' };
    const last = lastOf(context);
    if (last.kind === 'error') return { kind: 'call', call: { tool: 'forecast', args: { city: 'Pune', day: 'tomorrow' } }, why: 'Rule 2: the last call failed, so it tries again.' };
    if (last.kind === 'result' && !last.text) return { kind: 'answer', text: 'Probably dry, no umbrella needed.', why: 'Rule 3: the result was empty, so it guesses.' };
    return { kind: 'call', call: { tool: 'forecast', args: { city: 'Pune', day: 'tomorrow' } }, why: 'Rule 4: no forecast yet.' };
  },
  grade: (answer, state) => answer.includes(state.world.forecast),
  finish(state) {
    // An answer given with no forecast in the context was made up.
    state.outcome.madeUp = state.outcome.answered && !state.context.some((e) => e.kind === 'result' && e.text) ? 1 : 0;
  },
  predict(event, state, asked) {
    if (event.kind === 'result' && !event.result.ok && state.params.errors !== false && asked === 0) {
      return predict(
        'The forecast tool timed out, and the app sends the error back. What does the model do next?',
        'Calls forecast again',
        'Rule 2: after a failed call it tries again, and it will keep doing that while the tool is down.',
        [
          { value: 'Tells the user it failed', why: 'None of its rules says to give up; rule 2 says try again.' },
          { value: 'Guesses an answer', why: 'It guesses only after an empty result (rule 3), not after an error.' },
        ],
        3,
      );
    }
    if (event.kind === 'result' && !event.result.ok && state.params.errors === false) {
      return predict(
        "The forecast tool failed, but the app doesn't pass errors on. What will the model do?",
        'Guess an answer',
        'It sees an empty result, and rule 3 says to answer anyway. Hiding the error turned a failure into a confident wrong answer.',
        [
          { value: 'Call forecast again', why: 'It retries only after an error it can see (rule 2); it sees an empty result.' },
          { value: 'Tell the user it failed', why: "It doesn't know anything failed." },
        ],
        5,
      );
    }
    if (event.kind === 'limit') {
      return predict(
        `The model has used all ${String(state.params.maxSteps)} steps and still wants to call forecast. What happens?`,
        'The app stops the loop',
        'The step limit lives in the app, not the model: the app ends the loop and reports that it couldn\'t finish.',
        [
          { value: 'The model calls forecast once more', why: 'The limit is checked before every turn; there is no extra turn.' },
          { value: 'The model decides to stop', why: "Its rules never say stop; that's why the app needs a limit." },
        ],
        7,
      );
    }
    return undefined;
  },
};

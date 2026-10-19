import type { PlayerAction, PlayerState } from '../engine/player';
import { button, el } from './dom';

export interface Controls {
  element: HTMLElement;
  /** `lockForward` while a prediction is open: answer it (or skip) to move on. */
  update(state: PlayerState, atEnd: boolean, lockForward?: boolean): void;
}

/** Up to this many 48 px dots fit in one row beside the speed button on a 360 px phone. */
const MAX_DOTS = 5;

// Two rows so everything fits at 360 px with 48 px targets: step dots (or, for long traces, a
// progress bar) and speed on top, Back / Play / Next within thumb reach below.
export function buildControls(stepCount: number, dispatch: (a: PlayerAction) => void): Controls {
  const useDots = stepCount <= MAX_DOTS;
  const dots = useDots
    ? Array.from({ length: stepCount }, (_, i) => button('', () => dispatch({ type: 'goTo', step: i }), { class: 'dot', 'aria-label': `Go to step ${i + 1}` }))
    : [];
  const bar = el('div', { class: 'step-bar', role: 'progressbar', 'aria-label': 'Steps', 'aria-valuemin': 1, 'aria-valuemax': stepCount });
  const fill = el('i');
  bar.append(fill);
  const speed = button('', () => dispatch({ type: 'cycleSpeed' }), { class: 'speed' });
  const back = button('Back', () => dispatch({ type: 'back' }));
  const play = button('', () => dispatch({ type: 'toggle' }), { class: 'play' });
  const next = button('', () => dispatch({ type: 'next' }), { class: 'primary' });

  const top = el('div', { class: 'controls-top' });
  const dotRow = el('div', { class: 'dots', role: 'group', 'aria-label': 'Steps' });
  dotRow.append(...dots);
  top.append(useDots ? dotRow : bar, speed);
  const bottom = el('div', { class: 'controls' });
  bottom.append(back, play, next);
  const element = el('div', { class: 'player-controls' });
  element.append(top, bottom);

  return {
    element,
    update(s, atEnd, lockForward = false) {
      dots.forEach((d, i) => {
        d.classList.toggle('seen', i <= s.step);
        if (i === s.step) d.setAttribute('aria-current', 'step');
        else d.removeAttribute('aria-current');
      });
      bar.setAttribute('aria-valuenow', String(s.step + 1));
      fill.style.width = `${((s.step + 1) / stepCount) * 100}%`;
      speed.textContent = `${s.speed}x`;
      speed.setAttribute('aria-label', `Speed ${s.speed}x. Tap to change.`);
      back.disabled = s.step === 0;
      play.textContent = s.playing ? 'Pause' : atEnd ? 'Replay' : 'Play';
      play.setAttribute('aria-pressed', String(s.playing));
      next.textContent = s.step === stepCount - 1 ? 'Take the quiz' : 'Next';
      next.disabled = s.finished || lockForward; // the quiz is already open below, or a prediction is open
      play.disabled = lockForward;
      for (const d of dots) d.disabled = lockForward;
    },
  };
}

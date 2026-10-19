import type { Feedback } from '../progress/tracker';
import { el } from './dom';

const SHOW_MS = 2400;

export function clearToast(): void {
  document.querySelector('.toast')?.remove();
}

/**
 * A short reward pop-up near the bottom of the screen (within thumb reach). Calm mode shows
 * nothing, since the quiz already prints the same reward as text. Hidden from screen readers
 * for the same reason: the text line is the accessible version.
 */
export function celebrate(feedback: Feedback, calm: boolean): void {
  if (calm) return;
  const parts = [feedback.xp > 0 ? `+${feedback.xp} XP` : '', feedback.levelUp ? 'Level up!' : '', ...feedback.badges.map((b) => `🏅 ${b.title}`)];
  const text = parts.filter(Boolean).join('  ·  ');
  if (!text) return;
  clearToast();
  const toast = el('div', { class: 'toast', 'aria-hidden': 'true' }, text);
  document.body.append(toast);
  setTimeout(() => toast.remove(), SHOW_MS);
}

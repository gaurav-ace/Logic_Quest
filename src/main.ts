import './styles.css';
import { loadCatalog } from './lesson/catalog';
import type { Lesson } from './lesson/schema';
import { LessonValidationError } from './lesson/validate';
import { ProgressStore, SAVE_KEY, browserStorage } from './progress/store';
import { Tracker } from './progress/tracker';
import { registerServiceWorker } from './pwa/register';
import { REWARDS } from './rewards/config';
import { button, el } from './render/dom';
import { renderHome } from './render/home';
import { renderLesson, type LessonView } from './render/lesson';
import { celebrate, clearToast } from './render/toast';
import { HOME, parseRoute, routeHash, sameRoute, type Route } from './router';

function start(root: HTMLElement, lessons: Lesson[]): void {
  const byId = new Map(lessons.map((l) => [l.id, l]));
  const ids = new Set(byId.keys());
  const store = new ProgressStore(browserStorage());
  const tracker = new Tracker(store, Tracker.lessonInfo(lessons), REWARDS);

  const header = el('header', { class: 'app-header' });
  const backToList = button('← Lessons', () => history.back(), { class: 'nav-back' });
  header.append(el('h1', {}, 'Logic Quest'), backToList);
  const view = el('div');
  const guard = el('div', { class: 'guard', role: 'alertdialog', 'aria-label': 'Leave the quiz?' });
  guard.hidden = true;
  root.replaceChildren(header, view, guard);

  let current: Route = HOME;
  let lessonView: LessonView | undefined;
  let leaving = false;

  function show(route: Route): void {
    lessonView?.destroy();
    lessonView = undefined;
    guard.hidden = true;
    clearToast();
    current = route;
    backToList.hidden = route.name === 'home';
    if (route.name === 'lesson') {
      const lesson = byId.get(route.id)!;
      document.title = `${lesson.title} · Logic Quest`;
      lessonView = renderLesson(view, lesson, {
        answer: (q, option, correct) => tracker.answer(lesson.id, q, option, correct),
        complete: () => tracker.complete(lesson.id),
        celebrate: (f) => celebrate(f, store.settings.calm),
      });
    } else {
      document.title = 'Logic Quest';
      renderHome(view, lessons, tracker.progress(), REWARDS.coins.bufferCost, (id) => {
        location.hash = routeHash({ name: 'lesson', id });
      });
      if (store.notice) view.prepend(el('p', { class: 'card notice', role: 'status' }, store.notice));
    }
    window.scrollTo(0, 0);
  }

  // The Android back button (and "← Lessons") pops history. Leaving mid-quiz asks first
  // (CLAUDE.md section 8): put the lesson entry back and show an in-page question.
  window.addEventListener('hashchange', () => {
    const next = parseRoute(location.hash, ids);
    if (sameRoute(next, current)) return;
    if (!leaving && lessonView?.inQuiz()) {
      history.pushState(null, '', routeHash(current));
      askToLeave();
      return;
    }
    leaving = false;
    show(next);
  });

  function askToLeave(): void {
    // Staying is the safe choice, so it gets the prominent button.
    const stay = button(
      'Stay',
      () => {
        guard.hidden = true;
      },
      { class: 'primary' },
    );
    const leave = button('Leave', () => {
      leaving = true;
      history.back();
    });
    const actions = el('div', { class: 'controls' });
    actions.append(leave, stay);
    guard.replaceChildren(el('p', {}, 'Leave the quiz? You can come back to it any time.'), actions);
    guard.hidden = false;
    stay.focus();
  }

  // Progress saved in another tab: merge it, and refresh the home screen's numbers.
  window.addEventListener('storage', (e) => {
    if (e.key !== SAVE_KEY) return;
    store.reload();
    if (current.name === 'home') show(current);
  });

  // A deep link straight to a lesson still gets a home entry underneath it, so back goes to
  // the lesson list instead of closing the app.
  const first = parseRoute(location.hash, ids);
  history.replaceState(null, '', routeHash(HOME));
  if (first.name === 'lesson') history.pushState(null, '', routeHash(first));
  show(first);
}

function showLoadError(root: HTMLElement, e: unknown): never {
  // Bad lesson data must fail loudly, on screen as well as in the console.
  const box = el('pre', { class: 'card load-error' });
  box.textContent = e instanceof LessonValidationError ? e.message : `Could not load the lessons: ${String(e)}`;
  root.replaceChildren(el('h1', {}, 'Logic Quest'), box);
  throw e;
}

registerServiceWorker();
const root = document.getElementById('app');
if (root) {
  let lessons: Lesson[];
  try {
    lessons = loadCatalog();
  } catch (e) {
    showLoadError(root, e);
  }
  start(root, lessons);
}

import './styles.css';
import { loadCatalog } from './lesson/catalog';
import type { Lesson } from './lesson/schema';
import { LessonValidationError } from './lesson/validate';
import { requestPersistentStorage, type PersistState } from './progress/persist';
import { ProgressStore, SAVE_KEY, browserStorage } from './progress/store';
import { Tracker } from './progress/tracker';
import { registerServiceWorker } from './pwa/register';
import { REWARDS } from './rewards/config';
import { button, el } from './render/dom';
import { icon, type IconName } from './render/icons';
import { renderHome } from './render/home';
import { renderLesson, type LessonView } from './render/lesson';
import { renderProgress, renderSettings } from './render/progress';
import { celebrate, clearToast } from './render/toast';
import { HOME, parseRoute, routeHash, sameRoute, type Route } from './router';

const NAV: { route: Route; label: string; icon: IconName }[] = [
  { route: HOME, label: 'Learn', icon: 'learn' },
  { route: { name: 'progress' }, label: 'Progress', icon: 'progress' },
  { route: { name: 'settings' }, label: 'Settings', icon: 'settings' },
];

function chip(label: string, value: string): HTMLElement {
  const c = el('span', { class: 'chip' });
  c.append(el('small', {}, label), el('strong', {}, value));
  return c;
}

function start(root: HTMLElement, lessons: Lesson[]): void {
  const byId = new Map(lessons.map((l) => [l.id, l]));
  const ids = new Set(byId.keys());
  const store = new ProgressStore(browserStorage());
  const tracker = new Tracker(store, Tracker.lessonInfo(lessons), REWARDS);
  let persistState: PersistState = 'unsupported';

  // Shell: top bar (brand, back, stats), a nav that is a bottom tab bar on phones and a left
  // rail on wide screens, and the page itself.
  const header = el('header', { class: 'topbar' });
  const backToList = button('← Lessons', () => history.back(), { class: 'nav-back' });
  const chips = el('div', { class: 'chips', 'aria-label': 'Your level, streak and coins', role: 'group' });
  const brand = el('a', { class: 'brand', href: routeHash(HOME) });
  brand.append(el('span', { class: 'brand-mark', 'aria-hidden': 'true' }, 'LQ'), el('h1', {}, 'Logic Quest'));
  header.append(brand, backToList, chips);
  const nav = el('nav', { class: 'nav', 'aria-label': 'Main' });
  const navLinks = NAV.map(({ route, label, icon: iconName }) => {
    const a = el('a', { class: 'nav-item', href: routeHash(route) });
    const ic = el('span', { class: 'nav-icon' });
    ic.append(icon(iconName));
    a.append(ic, el('span', { class: 'nav-label' }, label));
    nav.append(a);
    return { route, a };
  });
  const view = el('main', { class: 'page', id: 'view' });
  const guard = el('div', { class: 'guard', role: 'alertdialog', 'aria-label': 'Leave the quiz?' });
  guard.hidden = true;
  root.replaceChildren(header, nav, view, guard);

  let current: Route = HOME;
  let lessonView: LessonView | undefined;
  let leaving = false;

  function show(route: Route): void {
    lessonView?.destroy();
    lessonView = undefined;
    guard.hidden = true;
    clearToast();
    current = route;
    backToList.hidden = route.name !== 'lesson';
    document.body.dataset.route = route.name;
    for (const { route: r, a } of navLinks) {
      if (r.name === route.name) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    const p = tracker.progress();
    chips.replaceChildren(chip('Lv', String(p.level)), chip('Streak', `${p.streak}d`), chip('Coins', String(p.coins)));
    if (route.name === 'progress') {
      document.title = 'Progress · Logic Quest';
      renderProgress(view, tracker, REWARDS);
    } else if (route.name === 'settings') {
      document.title = 'Settings · Logic Quest';
      renderSettings(view, tracker, store, REWARDS, persistState);
    } else if (route.name === 'lesson') {
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

  // Ask the browser not to clear saved progress when space runs low.
  void requestPersistentStorage().then((state) => {
    persistState = state;
    if (current.name === 'settings') show(current);
  });

  // Progress saved in another tab: merge it, and refresh the home screen's numbers.
  window.addEventListener('storage', (e) => {
    if (e.key !== SAVE_KEY) return;
    store.reload();
    if (current.name !== 'lesson') show(current);
  });

  // A deep link straight to a lesson or the progress screen still gets a home entry underneath
  // it, so back goes to the lesson list instead of closing the app.
  const first = parseRoute(location.hash, ids);
  history.replaceState(null, '', routeHash(HOME));
  if (first.name !== 'home') history.pushState(null, '', routeHash(first));
  show(first);
}

function showLoadError(root: HTMLElement, e: unknown): never {
  // Bad lesson data must fail loudly, on screen as well as in the console.
  const box = el('pre', { class: 'card load-error' });
  box.textContent = e instanceof LessonValidationError ? e.message : `Could not load the lessons: ${String(e)}`;
  root.replaceChildren(el('h1', {}, 'Logic Quest'), box);
  throw e;
}

// A new version took over while the app was open. Offer a reload rather than doing it, so a
// lesson in progress is never interrupted.
function showUpdateBanner(): void {
  if (document.querySelector('.update-banner')) return;
  const bar = el('div', { class: 'update-banner', role: 'status' });
  bar.append(el('span', {}, 'A new version with updated lessons is ready.'), button('Reload', () => location.reload(), { class: 'primary' }));
  document.body.append(bar);
}

registerServiceWorker(showUpdateBanner);
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

import './styles.css';
import { loadCatalog } from './lesson/catalog';
import { TRACKS, type Lesson, type Track } from './lesson/schema';
import { LessonValidationError } from './lesson/validate';
import { persistMessage, requestPersistentStorage, type PersistState } from './progress/persist';
import { loadPractice, practiceTracks } from './practice/catalog';
import { practiceKey, type PracticeItem } from './practice/schema';
import { practiceStatus } from './practice/status';
import { WorkshopStore } from './practice/workshop';
import { Profiles, profileKey } from './progress/profiles';
import { ProgressStore, browserStorage } from './progress/store';
import { Tracker } from './progress/tracker';
import { registerServiceWorker } from './pwa/register';
import { REWARDS } from './rewards/config';
import { button, el } from './render/dom';
import { icon, type IconName } from './render/icons';
import { renderHome } from './render/home';
import { renderLearners, renderPicker } from './render/learners';
import { renderPractice, type PracticeContext, type PracticeHooks } from './render/practice';
import { practiceSection } from './render/practice-list';
import { renderWorkshop } from './render/workshop';
import { renderPlayground } from './render/playground';
import { PROMPT_DATA, validatePrompts } from './playground/prompts';
import { BoardStore } from './playground/store';
import { tutorPanel } from './render/tutor';
import { faqPassages, loadFaqs, type FaqFile } from './tutor/faq';
import { GeminiKeyStore } from './tutor/key';
import { buildIndex, lessonPassages, type Index } from './tutor/search';
import { renderLesson, type LessonView } from './render/lesson';
import { renderProgress, renderSettings } from './render/progress';
import { celebrate, clearToast } from './render/toast';
import { HOME, parseRoute, routeHash, sameRoute, type Route } from './router';

const NAV: { route: Route; label: string; icon: IconName }[] = [
  { route: HOME, label: 'Learn', icon: 'learn' },
  { route: { name: 'progress' }, label: 'Progress', icon: 'progress' },
  { route: { name: 'playground' }, label: 'Design', icon: 'design' },
  { route: { name: 'settings' }, label: 'Settings', icon: 'settings' },
];

function chip(label: string, value: string): HTMLElement {
  const c = el('span', { class: 'top-stat' });
  c.append(el('small', {}, label), el('strong', {}, value));
  return c;
}

function start(root: HTMLElement, lessons: Lesson[]): void {
  const byId = new Map(lessons.map((l) => [l.id, l]));
  const ids = new Set(byId.keys());
  // Bad prompt data fails loudly at load, like lessons.
  const prompts = validatePrompts(PROMPT_DATA, ids);
  const kv = browserStorage();
  const profiles = new Profiles(kv);
  const store = new ProgressStore(kv, undefined, profileKey(profiles.current.id, 'progress'));
  const tracker = new Tracker(store, Tracker.lessonInfo(lessons), REWARDS);
  let persistState: PersistState = 'unsupported';
  const geminiKey = () => new GeminiKeyStore(kv, profileKey(profiles.current.id, 'gemini-key'));
  const settingsHref = routeHash({ name: 'settings' });

  // The tutor's search covers every lesson plus the open track's suggested answers; built once per track.
  const tutorData = new Map<Track, Promise<{ faqs: FaqFile; index: Index }>>();
  const lessonTracks = new Map(lessons.map((l) => [l.id, l.track] as const));
  const titles = new Map(lessons.map((l) => [l.id, l.title] as const));
  const loadTutor = (track: Track) => {
    let p = tutorData.get(track);
    if (!p) {
      p = loadFaqs(track, lessonTracks).then((faqs) => ({ faqs, index: buildIndex([...lessons.flatMap(lessonPassages), ...faqPassages(faqs, titles)]) }));
      p.catch(() => tutorData.delete(track));
      tutorData.set(track, p);
    }
    return p;
  };

  // Shell: top bar (brand, back, stats), a nav that is a bottom tab bar on phones and a left
  // rail on wide screens, and the page itself.
  const header = el('header', { class: 'topbar' });
  const backToList = button('← Lessons', () => history.back(), { class: 'nav-back' });
  const chips = el('div', { class: 'top-stats', 'aria-label': 'Your level, streak and coins', role: 'group' });
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
  // A real hash link would be read as a route, so the click only moves focus.
  const skip = el('a', { class: 'skip', href: routeHash(HOME) }, 'Skip to content');
  skip.addEventListener('click', (e) => {
    e.preventDefault();
    view.focus();
  });
  // The page is focusable so a route change moves keyboard and screen-reader users to it.
  view.tabIndex = -1;
  root.replaceChildren(skip, header, nav, view, guard);

  let current: Route = HOME;
  let lessonView: LessonView | undefined;
  const withPractice = new Set(practiceTracks(TRACKS));
  // The track whose practice list was last used, so coming back reopens it.
  let practiceOpen: Track | null = null;
  let leaving = false;

  function show(route: Route): void {
    lessonView?.destroy();
    lessonView = undefined;
    guard.hidden = true;
    clearToast();
    current = route;
    backToList.hidden = route.name !== 'lesson' && route.name !== 'practice';
    document.body.dataset.route = route.name;
    for (const { route: r, a } of navLinks) {
      if (r.name === route.name) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    const p = tracker.progress();
    chips.replaceChildren(chip('Lv', String(p.level)), chip('Streak', `${p.streak}d`), chip('Coins', String(p.coins)));
    // Always show whose progress this is (owner's choice, 2026-10-20); it opens Settings > Learners.
    const who = el('a', { class: 'top-stat who', href: routeHash({ name: 'settings' }), 'aria-label': `Learning as ${profiles.current.name}. Change in Settings.` });
    // Phones show only the initial, so the top bar still fits at 360 px.
    const initial = [...profiles.current.name][0]!.toUpperCase();
    who.append(el('span', { class: 'who-initial', 'aria-hidden': 'true' }, initial), el('small', {}, 'Learner'), el('strong', {}, profiles.current.name));
    chips.prepend(who);
    if (route.name === 'progress') {
      document.title = 'Progress · Logic Quest';
      renderProgress(view, tracker, REWARDS);
    } else if (route.name === 'playground') {
      document.title = 'Design playground · Logic Quest';
      renderPlayground(view, new BoardStore(kv, profileKey(profiles.current.id, 'boards')), {
        prompts,
        lesson: (id) => {
          const l = byId.get(id);
          return l ? { title: l.title, href: routeHash({ name: 'lesson', id }) } : null;
        },
      });
    } else if (route.name === 'settings') {
      document.title = 'Settings · Logic Quest';
      renderSettings(view, tracker, store, REWARDS, persistState, () => renderLearners(profiles, switchTo), new WorkshopStore(kv, profileKey(profiles.current.id, 'workshop')), geminiKey());
    } else if (route.name === 'lesson') {
      const lesson = byId.get(route.id)!;
      document.title = `${lesson.title} · Logic Quest`;
      lessonView = renderLesson(view, lesson, {
        answer: (q, option, correct) => tracker.answer(lesson.id, q, option, correct),
        complete: () => tracker.complete(lesson.id),
        celebrate: (f) => celebrate(f, store.settings.calm),
        tutor: tutorPanel(lesson, {
          load: () => loadTutor(lesson.track),
          href: (id) => routeHash({ name: 'lesson', id }),
          ai: {
            geminiKey: () => geminiKey().get(),
            // Wrapped, since fetch and the clipboard throw when called detached from their objects.
            fetch: (input, init) => fetch(input, init),
            online: () => navigator.onLine,
            ...(navigator.share ? { share: (data: ShareData) => navigator.share(data) } : {}),
            ...(navigator.clipboard ? { copy: (text: string) => navigator.clipboard.writeText(text) } : {}),
            settingsHref,
          },
        }),
      });
    } else if (route.name === 'practice') {
      showPractice(route.track, route.id);
    } else {
      document.title = 'Logic Quest';
      renderHome(view, lessons, tracker.progress(), REWARDS.coins.bufferCost, (id) => {
        location.hash = routeHash({ name: 'lesson', id });
      }, (track) => {
        if (!withPractice.has(track)) return null;
        const load = () => loadPractice(track, ids).then((items) => ({ items, status: practiceStatus(items, store.events) }));
        return practiceSection(load, (item) => {
          practiceOpen = track;
          location.hash = routeHash({ name: 'practice', track, id: item.id });
        }, practiceOpen === track);
      });
      if (store.notice) view.prepend(el('p', { class: 'card notice', role: 'status' }, store.notice));
    }
    window.scrollTo(0, 0);
    view.focus({ preventScroll: true });
  }

  function showPractice(track: Track, id: string): void {
    view.replaceChildren(el('p', { class: 'muted' }, 'Loading…'));
    loadPractice(track, ids).then(
      (items) => {
        if (current.name !== 'practice' || current.id !== id) return; // moved on while loading
        const item = items.find((i) => i.id === id);
        if (!item) {
          view.replaceChildren(el('h2', {}, 'Not found'), el('p', {}, 'That practice problem doesn’t exist (any more).'), button('Back to lessons', () => history.back(), { class: 'primary' }));
          return;
        }
        document.title = `${item.title} · Logic Quest`;
        lessonView = renderPracticeItem(item);
      },
      (e: unknown) => view.replaceChildren(el('p', { class: 'card bad' }, `Practice couldn't load: ${e instanceof Error ? e.message : String(e)}`)),
    );
  }

  function renderPracticeItem(item: PracticeItem): LessonView {
    const hooks: PracticeHooks = {
      answer: (check, option, correct) => {
        const f = tracker.answer(practiceKey(item.id), check, option, correct);
        // Practice doesn't count towards the daily goal, so the lesson wording would mislead.
        return f.outcome === 'already-scored' ? { ...f, text: 'Already scored.' } : f;
      },
      celebrate: (f) => celebrate(f, store.settings.calm),
    };
    const related = item.related ? byId.get(item.related) : undefined;
    const ctx: PracticeContext = {
      back: () => history.back(),
      ...(related ? { related: { title: related.title, open: () => (location.hash = routeHash({ name: 'lesson', id: related.id })) } } : {}),
    };
    if (item.kind === 'guided') return renderWorkshop(view, item, hooks, ctx, { store: new WorkshopStore(kv, profileKey(profiles.current.id, 'workshop')) });
    return renderPractice(view, item, hooks, ctx);
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
    // Update just that line: redrawing Settings would throw away a rename or removal in progress.
    const line = view.querySelector('.persist-state');
    if (line) line.textContent = persistMessage(state);
  });

  // Progress saved in another tab: merge it, and refresh the home screen's numbers.
  window.addEventListener('storage', (e) => {
    if (e.key !== store.key) return;
    store.reload();
    if (current.name !== 'lesson') show(current);
  });

  // A deep link straight to a lesson or the progress screen still gets a home entry underneath
  // it, so back goes to the lesson list instead of closing the app.
  const first = parseRoute(location.hash, ids);
  history.replaceState(null, '', routeHash(HOME));
  if (first.name !== 'home') history.pushState(null, '', routeHash(first));
  if (needsPicker()) {
    document.title = 'Who’s learning? · Logic Quest';
    renderPicker(view, profiles, (id) => {
      markPicked();
      if (id === profiles.current.id) show(first);
      else switchTo(id);
    });
  } else show(first);

  // Switching reloads, so every screen starts from the new learner's save with nothing left over.
  function switchTo(id: string): void {
    profiles.select(id);
    markPicked();
    location.replace(routeHash(HOME));
    location.reload();
  }

  // Ask once per app launch. Where session storage is blocked the picker is skipped (Settings
  // still switches learners), since asking on every reload would loop.
  function needsPicker(): boolean {
    if (profiles.all.length < 2) return false;
    try {
      return sessionStorage.getItem(PICKED_KEY) === null;
    } catch {
      return false;
    }
  }
  function markPicked(): void {
    try {
      sessionStorage.setItem(PICKED_KEY, '1');
    } catch {
      // See needsPicker.
    }
  }
}

const PICKED_KEY = 'logic-quest:picked';

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

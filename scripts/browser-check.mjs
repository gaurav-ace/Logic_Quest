// Headless Chrome checks for phone and desktop layouts, touch-only use, and offline/PWA.
// No dependencies: talks to Chrome over the DevTools protocol with Node's built-in WebSocket.
//
//   npm run build && npm run preview          (in another terminal)
//   node scripts/browser-check.mjs [ui|pwa|persist|lessons|update|sim|design|agent|profiles|practice|practice-walk|workshop|tutor|playground] [url] [screenshot-dir]
//   DIST_DIR=dist node scripts/browser-check.mjs update   (edits dist/ to simulate a deploy: rebuild after)
//   LESSONS=binary-search,heaps node scripts/browser-check.mjs lessons   (walk only those)
//
// CHROME_PATH overrides where Chrome is found. On WSL in NAT mode, WSL cannot reach a Windows
// Chrome's debug port, so run this file with a Windows node.exe instead (see docs/PROGRESS.md).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const mode = process.argv[2] ?? 'ui';
// Lesson files, read straight from the repo so the expected count never goes stale.
const lessonsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'lessons');
const lessonFiles = readdirSync(lessonsDir).filter((f) => f.endsWith('.json'));
const lessonData = (id) => JSON.parse(readFileSync(join(lessonsDir, `${id}.json`), 'utf8'));
const url = process.argv[3] ?? 'http://localhost:4173/Logic_Quest/';
const outDir = process.argv[4] ?? join(tmpdir(), 'logic-quest-shots');
mkdirSync(outDir, { recursive: true });

const defaultChrome = {
  win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  linux: 'google-chrome',
}[process.platform];
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let chrome;
let ws;
let id = 0;
const pending = new Map();
const events = [];

// Start Chrome on a profile folder. Reusing the folder later is a real relaunch: whatever the
// app saved to disk must still be there.
async function launch(profileDir = mkdtempSync(join(tmpdir(), 'lq-cdp-'))) {
  // A Chrome left over from an interrupted run would answer instead of ours: fail clearly.
  const leftover = await fetch(`http://127.0.0.1:${PORT}/json/version`).then(() => true, () => false);
  if (leftover) throw new Error(`Port ${PORT} is already in use, probably by a headless Chrome from an interrupted run. Close it and retry.`);
  chrome = spawn(process.env.CHROME_PATH ?? defaultChrome, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`,
    '--no-first-run', '--no-default-browser-check', 'about:blank',
  ], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    try {
      target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page');
    } catch {
      await sleep(200);
    }
  }
  if (!target) throw new Error('Could not reach Chrome. Set CHROME_PATH?');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else events.push(msg);
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
}

// Close Chrome the normal way, so it writes its storage to disk like a phone closing the app.
async function quit() {
  const exited = new Promise((r) => chrome.once('exit', r));
  try {
    await send('Browser.close');
  } catch {
    chrome.kill();
  }
  await Promise.race([exited, sleep(5000)]);
  ws.close();
}

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, (msg) => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(`eval failed: ${expr}\n${r.exceptionDetails.exception?.description}`);
  return r.result.value;
};

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const shot = async (name) => {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
};
const viewport = async (width, height, mobile) => {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
};
const media = (motion, scheme = 'light') =>
  send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: motion }, { name: 'prefers-color-scheme', value: scheme }],
  });
// Always a fresh page load, via about:blank. A URL that differs only in its hash would otherwise
// be an in-page navigation, which the app (correctly) treats as the learner moving between screens.
const load = async (u = url) => {
  await send('Page.navigate', { url: 'about:blank' });
  await send('Page.navigate', { url: u });
  for (let i = 0; i < 50; i++) {
    await sleep(100);
    if ((await evaluate('document.readyState')) === 'complete') break;
  }
  await sleep(300);
};
const text = (sel) => evaluate(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`);

// Tap a visible button by its exact text, or by aria-label when `by` is 'label'. Touch events only.
const tap = async (name, by = 'text') => {
  const box = await evaluate(`(() => {
    const match = (b) => ${by === 'label' ? `b.getAttribute('aria-label') === ${JSON.stringify(name)}` : `b.textContent.trim() === ${JSON.stringify(name)}`};
    const b = [...document.querySelectorAll('button, a, summary')].find((b) => b.offsetParent && match(b));
    if (!b) return null;
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  if (!box) throw new Error(`nothing to tap: "${name}"`);
  await sleep(150);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x, y: box.y }] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(250);
};

// Tap the n-th element matching a CSS selector. If it sits in a folded track, tap the track
// open first, the way a learner would.
const tapSel = async (selector, n = 0) => {
  const folded = await evaluate(`(() => {
    const d = document.querySelectorAll(${JSON.stringify(selector)})[${n}]?.closest('details');
    if (!d || d.open) return null;
    const r = d.querySelector('summary').getBoundingClientRect();
    d.scrollIntoView({ block: 'center' });
    const r2 = d.querySelector('summary').getBoundingClientRect();
    return { x: r2.x + r2.width / 2, y: r2.y + r2.height / 2, r };
  })()`);
  if (folded) {
    await sleep(150);
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: folded.x, y: folded.y }] });
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(250);
  }
  const box = await evaluate(`(() => {
    const b = document.querySelectorAll(${JSON.stringify(selector)})[${n}];
    if (!b) return null;
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  if (!box) throw new Error(`nothing to tap: ${selector} #${n}`);
  await sleep(150);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x, y: box.y }] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(250);
};
// What the Android back button does: step back one history entry.
const browserBack = async () => {
  const h = await send('Page.getNavigationHistory');
  await send('Page.navigateToHistoryEntry', { entryId: h.entries[h.currentIndex - 1].id });
  await sleep(400);
};
const hash = () => evaluate('location.hash');

// Answer "Skip" on any open prediction, so a walk-through can move on.
const skipPrediction = async () => {
  if (await evaluate(`!!document.querySelector('.predict:not([hidden])')`)) await tap('Skip, just show me');
};
const takeQuiz = async () => {
  await skipPrediction();
  try {
    await tap('Take the quiz');
  } catch (e) {
    const buttons = await evaluate(`[...document.querySelectorAll('button')].map((b) => b.textContent.trim() + (b.offsetParent ? '' : ' (hidden)')).join(' | ')`);
    throw new Error(`${e.message}. Buttons on screen: ${buttons}`, { cause: e });
  }
};

const layoutChecks = async (label) => {
  const m = await evaluate(`(() => {
    const targets = [...document.querySelectorAll('button, summary, a')].filter((b) => b.offsetParent)
      .map((b) => b.getBoundingClientRect()).map((r) => [Math.round(r.width), Math.round(r.height)]);
    // Smallest rendered text across every SVG: font size times how much that SVG is scaled.
    const sizes = [...document.querySelectorAll('svg')].filter((s) => s.viewBox.baseVal && s.viewBox.baseVal.width && s.querySelector('text')).flatMap((s) => {
      const scale = s.getBoundingClientRect().width / s.viewBox.baseVal.width;
      return [...s.querySelectorAll('text')].map((t) => parseFloat(getComputedStyle(t).fontSize) * scale);
    });
    const labelPx = sizes.length ? +Math.min(...sizes).toFixed(1) : null;
    // Every node label must fit inside its box (8 units of padding).
    const overflow = [...document.querySelectorAll('svg .node, svg .snode')].filter((g) => g.querySelector('text').getBBox().width > g.querySelector('rect').getBBox().width - 8).map((g) => g.querySelector('text').textContent);
    // Every text and box must be drawn inside its SVG, or the edge clips it (1 unit of slack).
    const clipped = [...document.querySelectorAll('svg')].filter((s) => s.viewBox.baseVal && s.viewBox.baseVal.width).flatMap((s) => {
      const v = s.viewBox.baseVal;
      return [...s.querySelectorAll('text, rect')].filter((e) => {
        const b = e.getBBox();
        return b.x < v.x - 1 || b.y < v.y - 1 || b.x + b.width > v.x + v.width + 1 || b.y + b.height > v.y + v.height + 1;
      }).map((e) => e.textContent || e.tagName);
    });
    return { vw: document.documentElement.clientWidth, scrollW: document.documentElement.scrollWidth, targets, labelPx, overflow, clipped };
  })()`);
  check(`${label}: no horizontal scroll`, m.scrollW <= m.vw, `scrollWidth ${m.scrollW}, viewport ${m.vw}`);
  const small = m.targets.filter(([w, h]) => w < 48 || h < 48);
  check(`${label}: tap targets >= 48px`, small.length === 0, `${m.targets.length} targets${small.length ? ', too small: ' + JSON.stringify(small) : ''}`);
  if (m.labelPx !== null) {
    check(`${label}: diagram labels >= 14px`, m.labelPx >= 14, `smallest ~${m.labelPx}px`);
    check(`${label}: labels fit inside their boxes`, m.overflow.length === 0, m.overflow.join(', '));
    check(`${label}: nothing drawn past the diagram's edge`, m.clipped.length === 0, m.clipped.join(', '));
  }
};

// Design lessons: the shortest way through "improve the design" (one wrong check, "Show me",
// then each fix option in turn), checking the layout of each part on the way.
async function walkExercise(id) {
  await layoutChecks(`${id}-360 exercise`);
  await shot(`${id}-360-exercise`);
  // The walk below never picks a class, so check the class buttons are really on screen
  // (a top-bar rule once hid them on phones).
  const chips = await evaluate(`[...document.querySelectorAll('.exercise .chips button')].map((b) => [b.textContent, !!b.offsetParent, Math.round(b.getBoundingClientRect().height)])`);
  check(`${id}: every class can be tapped`, chips.length > 0 && chips.every(([, shown, h]) => shown && h >= 48), JSON.stringify(chips));
  await tap('Check');
  await tap('Show me');
  await tap('Next: fix the design');
  for (let i = 0; i < 6 && !(await evaluate(`[...document.querySelectorAll('button')].some((b) => b.offsetParent && b.textContent === 'See the fixed design')`)); i++) {
    if (await evaluate(`!document.querySelectorAll('.exercise .option')[${i}].disabled`)) await tapSel('.exercise .option', i);
  }
  await tap('See the fixed design');
  await layoutChecks(`${id}-360 fixed design`);
  await shot(`${id}-360-fixed`);
  await tap('On to the quiz');
}

// Case studies: the shortest way through "critique the design" (check with nothing picked,
// "Show me", then each fix-first option in turn), checking the layout of each part.
async function walkCritique(id) {
  await layoutChecks(`${id}-360 critique`);
  await shot(`${id}-360-critique`);
  await tap('Check');
  check(`${id}: an empty critique gets a hint, not the answer`, (await text('.critique .feedback')).startsWith('Not quite:'), await text('.critique .feedback'));
  await tap('Show me');
  const real = lessonData(id).critique.risks.filter((r) => r.real).length;
  check(`${id}: every real risk is marked after "Show me"`, (await evaluate(`document.querySelectorAll('.critique .risk.right').length`)) === real);
  await layoutChecks(`${id}-360 critique revealed`);
  await shot(`${id}-360-critique-revealed`);
  await tap('Next: what to fix first');
  for (let i = 0; i < 6 && !(await evaluate(`[...document.querySelectorAll('button')].some((b) => b.offsetParent && b.textContent === 'On to the quiz')`)); i++) {
    if (await evaluate(`!document.querySelectorAll('.critique .option')[${i}].disabled`)) await tapSel('.critique .option', i);
  }
  await layoutChecks(`${id}-360 fix first`);
  await shot(`${id}-360-fix-first`);
  await tap('On to the quiz');
}

// Every lesson: layout, labels, and a walk through all steps to the quiz.
async function walkLessons() {
  await load();
  // LESSONS=a,b walks only those lessons (handy when debugging one).
  const only = process.env.LESSONS?.split(',');
  const ids = (await evaluate(`[...document.querySelectorAll('.lesson-card')].map((c) => c.dataset.id)`)).filter((id) => !only || only.includes(id));
  for (const id of ids) {
    await load(url + '#/lesson/' + id);
    await layoutChecks(`${id}-360`);
    await shot(`${id}-360-step1`);
    if (await evaluate(`!!document.querySelector('.stage.sim')`)) {
      // Sims have no steps: check the layout, then open the quiz.
      await sleep(600);
      await shot(`${id}-360-mid`);
      await tap('Take the quiz');
      if (await evaluate(`!!document.querySelector('.critique:not([hidden])')`)) await walkCritique(id);
      check(`${id}: sim runs and its quiz opens`, await evaluate(`!document.querySelector('.quiz').hidden`));
      continue;
    }
    let guard = 0;
    while ((await text('.controls .primary')) !== 'Take the quiz' && guard++ < 80) {
      await skipPrediction();
      await tap('Next');
      if (guard === 4) await shot(`${id}-360-mid`);
    }
    await layoutChecks(`${id}-360 last step`);
    await takeQuiz();
    if (await evaluate(`!!document.querySelector('.critique:not([hidden])')`)) await walkCritique(id);
    else if (await evaluate(`!!document.querySelector('.exercise:not([hidden])')`)) await walkExercise(id);
    const quizShown = await evaluate(`!document.querySelector('.quiz').hidden`);
    check(`${id}: walked every step to the quiz`, guard < 80 && quizShown, `${guard} steps`);
  }
}

if (mode !== 'persist') await launch();

if (mode === 'ui') {
  // Home screen and navigation, including what the Android back button does.
  await viewport(360, 740, true);
  await media('reduce');
  await load();
  await layoutChecks('home-360');
  await shot('home-360');
  const titles = await evaluate(`[...document.querySelectorAll('.lesson-title')].map((t) => t.textContent)`);
  check('home lists every lesson', titles.length === lessonFiles.length && titles[0] === 'Hello, request' && titles.includes('AI agent loop'), titles.join(', '));
  check('no "← Lessons" button on home', !(await evaluate(`!!document.querySelector('.nav-back').offsetParent`)));
  check('lessons are grouped by track, with the first unfinished one open', JSON.stringify(await evaluate(`[...document.querySelectorAll('details.track')].map((d) => [d.dataset.track, d.open])`)) === JSON.stringify([['web', true], ['logic', false], ['dsa', false], ['hld', false], ['lld', false], ['real-world', false], ['agentic', false]]));
  check('track headers count progress', (await text('details.track[data-track="logic"] summary')) === 'Logic foundations0 of 8 done', await text('details.track[data-track="logic"] summary'));
  await tapSel('.lesson-card[data-id="estimate"]');
  check('a locked lesson explains what to finish first, and stays on the list', (await text('.lesson-card[data-id="estimate"] .lesson-lock')) === 'Finish “Spot the pattern” and “Dry-run code” first.' && (await hash()) === '#/', await text('.lesson-card[data-id="estimate"] .lesson-lock'));
  await layoutChecks('home-360 logic open');
  await shot('home-360-tracks');
  await tapSel('.lesson-card[data-id="cache"]');
  check('tapping a card opens that lesson', (await hash()) === '#/lesson/cache' && (await text('h2')) === 'Cache');
  await browserBack();
  check('back button returns to the list', (await hash()) === '#/' && (await text('h2')) === 'Lessons');
  await tapSel('.lesson-card[data-id="load-balancer"]');
  await tap('← Lessons');
  check('"← Lessons" returns to the list', (await text('h2')) === 'Lessons');
  await tapSel('.lesson-card[data-id="load-balancer"]');
  await tap('Go to step 5', 'label');
  await takeQuiz();
  await browserBack();
  check('guard makes Stay the prominent choice', (await text('.guard .primary')) === 'Stay');
  check('back during the quiz asks first and stays on the lesson', (await hash()) === '#/lesson/load-balancer' && (await evaluate(`!document.querySelector('.guard').hidden`)));
  await layoutChecks('quiz guard');
  await shot('guard-360');
  await tap('Stay');
  check('Stay keeps the quiz', (await evaluate(`document.querySelector('.guard').hidden && !document.querySelector('.quiz').hidden`)));
  await browserBack();
  await tap('Leave');
  check('Leave goes to the list', (await hash()) === '#/' && (await text('h2')) === 'Lessons');
  await load(url + '#/lesson/agent-loop');
  check('deep link opens the lesson', (await text('h2')) === 'AI agent loop');
  await browserBack();
  check('back from a deep link goes to the list, not out of the app', (await hash()) === '#/' && (await text('h2')) === 'Lessons');
  await load(url + '#/lesson/no-such-lesson');
  check('unknown lesson link falls back to the list', (await text('h2')) === 'Lessons');

  // Rewards and progress: a fresh browser profile starts at zero.
  await load();
  check('HUD starts at zero', (await text('.hud-stats')) === 'Level1XP0 / 30Streak0 daysCoins0', await text('.hud-stats'));
  check('HUD shows today and the way to start a streak', (await text('.hud-today')) === 'Today: 0 / 1. Finish 1 lesson today to start a streak.');
  await load(url + '#/lesson/hello-request-response');
  await tap('Go to step 2', 'label');
  await takeQuiz();
  await tap('The browser, by sending a request');
  const reward = await evaluate(`[...document.querySelectorAll('.reward span')].map((s) => s.textContent)`);
  check('first-try answer shows XP, lesson bonus, goal and badges, one per line',
    JSON.stringify(reward) === JSON.stringify(['+10 XP, first try', 'Lesson complete: +10 XP. Today’s goal is done.', 'Badge earned: First steps.', 'Badge earned: Web basics done.']), JSON.stringify(reward));
  check('one toast with everything earned (calm mode off)', (await text('.toast')) === '+20 XP  ·  🏅 First steps  ·  🏅 Web basics done', await text('.toast'));
  await layoutChecks('reward-360');
  await shot('reward-360');
  await tap('← Lessons');
  check('finished quiz leaves without asking', (await text('h2')) === 'Lessons');
  check('toast is cleared when the screen changes', !(await evaluate(`!!document.querySelector('.toast')`)));
  check('HUD after one lesson', (await text('.hud-stats')) === 'Level1XP20 / 30Streak1 dayCoins5', await text('.hud-stats'));
  check('HUD says today is done', (await text('.hud-today')) === 'Today: 1 / 1. Today’s goal is done.');
  check('finished lesson is marked done', (await evaluate(`document.querySelectorAll('.lesson-card.done').length`)) === 1);
  await shot('home-after-reward-360');
  await load();
  check('progress survives a reload', (await text('.hud-stats')) === 'Level1XP20 / 30Streak1 dayCoins5', await text('.hud-stats'));
  await load(url + '#/lesson/hello-request-response');
  await tap('Go to step 2', 'label');
  await takeQuiz();
  await tap('The browser, by sending a request');
  check('replay says already scored, no new XP', (await text('.reward')).startsWith('Already scored.'), await text('.reward'));
  await load(url + '#/lesson/load-balancer');
  await tap('Go to step 5', 'label');
  await takeQuiz();
  await tap('Keep sending it every third request');
  check('wrong answer shows no reward', (await text('.reward')) === '');
  await tap('Stop sending it requests for a while, then try it again');
  check('right after a retry earns less', (await text('.reward')) === '+5 XP, after a retry', await text('.reward'));

  // Progress screen: stats, week, badges, settings, export and import.
  await load();
  await tap('Progress');
  check('Progress button opens the progress screen', (await hash()) === '#/progress' && (await text('h2')) === 'Your progress');
  await layoutChecks('progress-360');
  await shot('progress-360');
  check('today shows as goal met in the 7-day view', await evaluate(`[...document.querySelectorAll('.week .day')].at(-1).classList.contains('met')`));
  check('badges count what was earned', (await text('.panel[aria-label="Badges"] h3')) === 'Badges: 2 of 18', await text('.panel[aria-label="Badges"] h3'));
  // Settings and backup have their own screen, reached from the nav.
  await tap('Settings');
  check('Settings opens its own screen', (await hash()) === '#/settings' && (await text('h2')) === 'Settings');
  await tap('2 lessons a day', 'label');
  check('daily goal can be raised', (await evaluate(`document.querySelector('[aria-label="2 lessons a day"]').getAttribute('aria-pressed')`)) === 'true');
  await tap('Progress');
  check('the new goal shows on the progress screen', (await text('.hud-today')).startsWith('Today: 1 / 2'), await text('.hud-today'));
  await tap('Settings');
  await tap('1 lesson a day', 'label');
  await tap('Calm mode: off');
  check('calm mode turns on', (await evaluate(`!!document.querySelector('[aria-pressed="true"]') && [...document.querySelectorAll('button')].some((b) => b.textContent === 'Calm mode: on')`)));
  await load(url + '#/lesson/cache');
  await tap('Go to step 5', 'label');
  await takeQuiz();
  await tap('Users may see the old profile');
  const calmLines = await evaluate(`[...document.querySelectorAll('.reward span')].map((s) => s.textContent)`);
  // 20 + 5 XP so far, +10 here crosses the level-2 threshold (30).
  check('calm mode: reward as text (with the level-up), no pop-up', JSON.stringify(calmLines) === JSON.stringify(['+10 XP, first try', 'Level up!']) && !(await evaluate(`!!document.querySelector('.toast')`)), JSON.stringify(calmLines));
  await load(url + '#/settings');
  await tap('Calm mode: on');

  // Export: a real download through Chrome's download flow.
  const downloads = join(outDir, 'downloads');
  rmSync(downloads, { recursive: true, force: true });
  mkdirSync(downloads, { recursive: true });
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  await tap('Export backup');
  await sleep(1000);
  const today = await evaluate(`(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })()`);
  const exported = join(downloads, `logic-quest-progress-${today}.json`);
  const backupOk = existsSync(exported);
  check('export downloads a backup file', backupOk, exported);
  // The stats live on the progress screen; read them there and come back (the backup message is read first).
  const progressStats = async () => {
    await tap('Progress');
    const t = await text('.hud-stats');
    await tap('Settings');
    return t;
  };
  const xpBefore = await progressStats();
  const importFile = async (path) => {
    const { result } = await send('Runtime.evaluate', { expression: `document.querySelector('input[type=file]')` });
    await send('DOM.setFileInputFiles', { files: [path], objectId: result.objectId });
    await sleep(500);
  };
  if (backupOk) {
    const backup = JSON.parse(readFileSync(exported, 'utf8'));
    check('backup holds the events and settings', backup.app === 'logic-quest' && backup.version === 1 && backup.events.length > 0);
    await importFile(exported);
    const same = await text('.backup-status');
    check('importing the same backup adds nothing', same === 'Everything in that file is already here. Nothing to add.' && (await progressStats()) === xpBefore, same);
    const extra = { id: 'imported-1', type: 'complete', at: new Date().toISOString(), day: today, lesson: 'agent-loop' };
    const merged = join(downloads, 'with-extra.json');
    writeFileSync(merged, JSON.stringify({ ...backup, events: [...backup.events, extra] }));
    await importFile(merged);
    check('import previews only what is new', (await text('.backup-status')).startsWith('This file has 1 new item of progress.'), await text('.backup-status'));
    await tap('Merge');
    check('merge adds it once: +10 XP for the newly completed lesson', (await text('.backup-status')) === 'Merged 1 new item of progress.');
    const xpAfter = await progressStats();
    await importFile(merged);
    const again = await text('.backup-status');
    check('importing the merged file again adds nothing', again === 'Everything in that file is already here. Nothing to add.' && (await progressStats()) === xpAfter, `${xpBefore} -> ${xpAfter}`);
    const bad = join(downloads, 'bad.json');
    writeFileSync(bad, '{"version": 1, "events": [{"id": "x"}]}');
    await importFile(bad);
    check('a bad file is rejected with a reason', (await text('.backup-status')).startsWith("That file can't be imported: event 1 is invalid"), await text('.backup-status'));
  }
  await layoutChecks('progress-360 after import');
  await load(url + '#/settings');
  await browserBack();
  check('back from a settings deep link goes to the list', (await text('h2')) === 'Lessons');
  await load(url + '#/progress');
  await browserBack();
  check('back from a progress deep link goes to the list', (await text('h2')) === 'Lessons');

  // Trace lesson: computed frames, code highlighting, a prediction from the real run.
  await load(url + '#/lesson/dry-run');
  await layoutChecks('trace-360');
  await shot('trace-360-start');
  check('trace shows the input and the code', (await text('.trace-input')) === 'nums = [3, 8, 2, 9, 4]' && (await evaluate(`document.querySelectorAll('.code li').length`)) === 6);
  await tap('Next');
  check('line 2 runs: highlighted, best = 3', (await evaluate(`[...document.querySelectorAll('.code li')].findIndex((l) => l.classList.contains('current'))`)) === 1 && (await text('.vars')).includes('best3'), await text('.vars'));
  await tap('Next');
  await tap('Next');
  check('a computed prediction opens before the comparison', await evaluate(`!!document.querySelector('.predict:not([hidden])')`) && (await text('.predict h3')).startsWith('Predict: nums[i] is 8 and best is 3.'), await text('.predict h3'));
  await shot('trace-360-predict');
  await tap('3');
  check('the wrong guess is explained from the real values', (await text('.predict .feedback')) === 'No. 8 > 3, so line 5 does run and replaces best.', await text('.predict .feedback'));
  await tap('8');
  await tap('See what happens');
  check('reveal runs line 5: best = 8', (await evaluate(`document.querySelector('.code li.current').textContent`)).includes('best = nums[i]') && (await text('.vars')).includes('best8'));
  await tap('New example');
  check('New example traces a fresh input from the start', (await text('.trace-input')).startsWith('Example 2: nums = ') && (await text('.step-label')).startsWith('Step 1 of '), await text('.trace-input'));
  await layoutChecks('trace-360 new example');

  // Predict, then reveal (cache lesson, step 2).
  await load(url + '#/lesson/cache');
  await tap('Next');
  check('prediction appears before step 2 plays', await evaluate(`!document.querySelector('.predict').hidden`) && (await text('.caption')) === 'Before this step plays: what do you think happens?');
  check('prediction hides the answer: step 1 state still shown', (await evaluate(`[...document.querySelectorAll('.node.on')].map((g) => g.textContent).join()`)) === 'App');
  check('Next and Play are locked until answered or skipped', await evaluate(`document.querySelector('.controls .primary').disabled && document.querySelector('.play').disabled`));
  await layoutChecks('predict-360');
  await shot('predict-360');
  await tap('It returns the profile');
  check('wrong prediction is explained, with another try', (await text('.predict .feedback')).startsWith('No. Nothing has been saved') && (await text('.predict .quiz-after')) === 'Not quite. Try another option.');
  await tap('It has nothing: a cache miss');
  await tap('See what happens');
  check('reveal shows the real step', (await text('.caption')).startsWith('Cache miss') && (await evaluate(`document.querySelector('.predict').hidden`)));
  await tap('Back');
  await tap('Next');
  check('an answered prediction is not asked again in the same run', await evaluate(`document.querySelector('.predict').hidden`));
  await tap('Go to step 5', 'label');
  await takeQuiz();
  check('tally before the quiz counts first-try predictions', (await text('.tally')) === 'You predicted 0 of 1 step right on the first try.', await text('.tally'));

  await walkLessons();

  // Phone, reduced motion: walk every control by touch.
  await load(url + '#/lesson/hello-request-response');
  await layoutChecks('phone-360');
  await shot('phone-360-1-start');
  check('step label and caption shown', (await text('.step-label')) === 'Step 1 of 2' && (await text('.caption')).startsWith('You type an address'));
  check('Back disabled on step 1', await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent === 'Back').disabled`));
  check('reduced motion: packet already at its destination', (await evaluate(`document.querySelector('.packet').getAttribute('cx')`)) === '340');
  await tap('Next');
  check('Next → step 2, button says "Take the quiz"', (await text('.step-label')) === 'Step 2 of 2' && (await text('.primary')) === 'Take the quiz');
  await tap('Back');
  check('Back → step 1', (await text('.step-label')) === 'Step 1 of 2');
  await tap('Go to step 2', 'label');
  check('step dot → step 2', (await text('.step-label')) === 'Step 2 of 2');
  await tap('1x');
  check('speed cycles 1x → 2x', (await text('.speed')) === '2x');
  await tap('Play');
  check('Play → Pause, pressed', (await text('.play')) === 'Pause' && (await evaluate(`document.querySelector('.play').getAttribute('aria-pressed')`)) === 'true');
  await sleep(2600); // step 2 reading time at 2x is about 2.1 s
  check('auto-play stops at the end and offers Replay', (await text('.play')) === 'Replay');
  await tap('Replay');
  check('Replay starts again from step 1', (await text('.step-label')) === 'Step 1 of 2' && (await text('.play')) === 'Pause');
  await evaluate(`Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'))`);
  check('hidden tab pauses auto-play', (await text('.play')) === 'Play');
  await evaluate(`delete document.hidden; document.dispatchEvent(new Event('visibilitychange'))`);
  await tap('Go to step 2', 'label');
  await takeQuiz();
  check('quiz appears after the last step', await evaluate(`!document.querySelector('.quiz').hidden`));
  check('"Take the quiz" is disabled while the quiz is open', await evaluate(`document.querySelector('.controls .primary').disabled`));
  await tap('The server, by sending the page when it is ready');
  check('wrong answer explains why', (await text('.feedback')).startsWith("Not in HTTP's basic model"));
  await shot('phone-360-2-wrong');
  await tap('Replay the steps');
  check('Replay the steps → step 1 playing, quiz hidden', (await text('.step-label')) === 'Step 1 of 2' && (await evaluate(`document.querySelector('.quiz').hidden`)));
  await tap('Pause');
  await tap('Go to step 2', 'label');
  await takeQuiz();
  await tap('The browser, by sending a request');
  check('right answer marked and explained', await evaluate(`!!document.querySelector('.option.right') && document.querySelector('.feedback').textContent.startsWith('Right.')`));
  await layoutChecks('phone-360 quiz');
  await shot('phone-360-3-right');

  // Landscape with motion: the packet should actually travel.
  await viewport(740, 360, true);
  await media('no-preference');
  await load(url + '#/lesson/hello-request-response');
  await layoutChecks('phone-landscape');
  await tap('Next');
  const cx = Number(await evaluate(`document.querySelector('.packet').getAttribute('cx')`));
  check('motion on: packet is mid-flight after Next', cx > 80 && cx < 340, `cx=${cx.toFixed(0)}`);

  await viewport(1280, 800, false);
  await media('no-preference');
  await load();
  await layoutChecks('desktop-1280 home');
  await shot('desktop-1280-home');
  await load(url + '#/lesson/load-balancer');
  await layoutChecks('desktop-1280 lesson');
  await shot('desktop-1280-lesson');

  await viewport(360, 740, true);
  await media('reduce', 'dark');
  await load(url + '#/lesson/cache');
  await shot('phone-360-dark');
}

if (mode === 'lessons') {
  await viewport(360, 740, true);
  await media('reduce');
  await walkLessons();
}

async function simChecks() {
  await viewport(360, 740, true);
  await media('reduce');
  await load(url + '#/lesson/load-balancing-sim');
  await layoutChecks('sim-360');
  await shot('sim-360-start');
  const simTime = async () => Number((await text('.player .step-label')).match(/([0-9.]+) s simulated/)?.[1] ?? NaN);
  const t0 = await simTime();
  await sleep(1200);
  check('the sim runs in simulated time', (await simTime()) > t0, `${t0} -> ${await simTime()}`);
  await tap('Pause');
  const t1 = await simTime();
  await sleep(800);
  check('Pause stops simulated time', (await simTime()) === t1 && (await text('.player .play')) === 'Play');
  await tap('Play');
  check('four live numbers with history lines', (await evaluate(`document.querySelectorAll('.sim-metrics .metric').length`)) === 4 && (await evaluate(`document.querySelectorAll('.sim-metrics .spark').length`)) === 4);
  await tap('Health checks: on');
  check('a switch flips by tap', await evaluate(`[...document.querySelectorAll('button')].some((b) => b.textContent === 'Health checks: off')`));
  await tap('Health checks: off');
  // A tap near the right end of the traffic slider moves it up (touch only, no keyboard).
  const box = await evaluate(`(() => { const r = document.querySelector('#sim-rate').getBoundingClientRect(); document.querySelector('#sim-rate').scrollIntoView({ block: 'center' }); const q = document.querySelector('#sim-rate').getBoundingClientRect(); return { x: q.x + q.width * 0.97, y: q.y + q.height / 2, r: r.width }; })()`);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x, y: box.y }] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(300);
  check('a slider moves by tap', Number(await evaluate(`document.querySelector('#sim-rate').value`)) >= 55, await evaluate(`document.querySelector('#sim-rate').value`));
  await tap('Kill server 2');
  await sleep(300);
  check('failure injection: server 2 is shown as down', await evaluate(`[...document.querySelectorAll('.snode')].some((g) => g.classList.contains('down') && g.textContent.includes('Server 2'))`));
  await shot('sim-360-killed');
  await tap('Reset');

  // Challenge 1, end to end: predict, start, fix, succeed, earn XP.
  check('a challenge asks for a prediction before it starts', (await text('.challenge h3')).startsWith('Challenge 1 of 3') && !(await evaluate(`[...document.querySelectorAll('button')].some((b) => b.textContent === 'Start challenge')`)));
  await tap('About a third of requests fail, and it stays that way');
  await tap('Start challenge');
  check('starting locks the settings the challenge fixes', await evaluate(`document.querySelector('#sim-rate').disabled && document.querySelector('#sim-servers').disabled`));
  // Speed cycles 1x -> 2x -> 4x: two taps to run the challenge faster.
  await tap('1x');
  await tap('2x');
  check('speed reaches 4x', (await text('.player .speed')) === '4x');
  await tap('Health checks: off');
  let done = false;
  for (let i = 0; i < 60 && !done; i++) {
    await sleep(500);
    done = (await text('.challenge h3')).startsWith('Challenge 1 done');
  }
  check('the challenge completes once the goal holds', done, await text('.challenge'));
  check('completing a challenge earns XP', (await text('.challenge .reward')) === '+10 XP', await text('.challenge .reward'));
  await shot('sim-360-challenge-done');
  await layoutChecks('sim-360 after challenge');

  // Hidden tab: simulated time must not move.
  await evaluate(`Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'))`);
  const t2 = await simTime();
  await sleep(800);
  check('a hidden tab freezes the sim', (await simTime()) === t2);
  await evaluate(`delete document.hidden; document.dispatchEvent(new Event('visibilitychange'))`);
  await tap('Take the quiz');
  check('the sim quiz opens', await evaluate(`!document.querySelector('.quiz').hidden`));
}

if (mode === 'sim') await simChecks();

// One agent lesson end to end: the scripted run step by step, the outcome, a challenge by touch
// (predict, start, locked settings, fix, run, XP), a failed attempt's feedback, and no second
// scoring after a reload.
async function agentChecks() {
  await viewport(360, 740, true);
  await media('reduce');
  await load(url + '#/lesson/agent-loop-limits');
  await layoutChecks('agent-360');
  await shot('agent-360-start');
  check('the scripted model\'s rules are shown', (await evaluate(`document.querySelectorAll('.stage .rules li').length`)) === 4);
  let guard = 0;
  while ((await text('.controls .primary')) !== 'Take the quiz' && guard++ < 40) {
    await skipPrediction();
    await tap('Next');
  }
  check('the default run steps to its end: right answer in 2 turns', (await text('.caption')).startsWith('Done in 2 turns'), await text('.caption'));
  check('the transcript shows the tool call and the answer', (await evaluate(`[...document.querySelectorAll('.view-table td')].map((t) => t.textContent).join('|')`)).includes('forecast(Pune, tomorrow)'));
  const tile = (label) => evaluate(`[...document.querySelectorAll('.agent-panel .metric')].find((m) => m.querySelector('small').textContent === ${JSON.stringify(label)})?.querySelector('strong').textContent ?? null`);
  check('the outcome tiles show this run', (await tile('Right answer')) === '1' && (await tile('Model turns')) === '2', `${await tile('Right answer')} / ${await tile('Model turns')}`);

  check('a challenge asks for a prediction before it starts', (await text('.agent-panel .challenge h3')).startsWith('Challenge 1 of 3') && !(await evaluate(`[...document.querySelectorAll('button')].some((b) => b.offsetParent && b.textContent === 'Start challenge')`)));
  await tap("It doesn't: the model retries on every error, forever");
  await tap('Start challenge');
  check('starting runs the challenge\'s setup: the loop hits the demo cap', (await tile('Model turns')) === '30', await tile('Model turns'));
  check('the challenge locks the settings it fixes', await evaluate(`[...document.querySelectorAll('.agent-panel button.toggle')].filter((b) => b.disabled).length === 2`));
  await layoutChecks('agent-360 challenge');
  await shot('agent-360-challenge');
  await tap('Step limit: off');
  await tap('Run with these settings');
  check('the fixed run passes the challenge and earns XP', (await text('.agent-panel .challenge .reward')) === 'Challenge done: The loop that never ends. +10 XP', await text('.agent-panel .challenge .reward'));
  check('the new run stops at the limit', (await tile('Model turns')) === '6', await tile('Model turns'));
  check('the next challenge follows', (await text('.agent-panel .challenge')).includes('Challenge 2 of 3'));

  await tap('Start challenge');
  await tap('Run with these settings');
  check('a run that misses the goal says what was off', (await text('.agent-panel .challenge .feedback')).startsWith('Not yet: Made-up answers was 1, needs at most 0'), await text('.agent-panel .challenge .feedback'));
  await tap('Hint');
  check('a hint is there when asked for', (await text('.agent-panel .challenge')).includes('What does the model see when the tool fails?'));
  await shot('agent-360-not-yet');

  await load(url + '#/lesson/agent-loop-limits');
  await tap("It doesn't: the model retries on every error, forever");
  await tap('Start challenge');
  await tap('Step limit: off');
  await tap('Run with these settings');
  check('a challenge solved before is not scored again', (await text('.agent-panel .challenge .reward')).endsWith('Already scored.'), await text('.agent-panel .challenge .reward'));
  await viewport(1280, 800, false);
  await load(url + '#/lesson/agent-loop-limits');
  await layoutChecks('agent-desktop');
  await shot('agent-desktop');
}
if (mode === 'agent') await agentChecks();

// One design lesson end to end: diagrams, code, the exercise with XP and retries, the quiz
// guard during the exercise, and no second scoring after a reload.
async function designChecks() {
  const id = 'objects-and-responsibilities';
  const lesson = lessonData(id);
  const ex = lesson.exercise;
  const flawed = lesson.diagrams[ex.flawed].classes;
  const nameOf = (cid) => flawed.find((c) => c.id === cid).name;
  await viewport(360, 740, true);
  await media('reduce');
  const toExercise = async () => {
    await load(url + '#/lesson/' + id);
    let seenCalls = 0;
    let seenCode = false;
    for (let guard = 0; (await text('.controls .primary')) !== 'Take the quiz' && guard < 40; guard++) {
      await skipPrediction();
      await tap('Next');
      const calls = await evaluate(`document.querySelectorAll('.stage .call[visibility="visible"]').length`);
      if (calls >= 3 && seenCalls < 3) await shot('design-360-sequence');
      seenCalls = Math.max(seenCalls, calls);
      seenCode ||= await evaluate(`!document.querySelector('.code-snippet').hidden && document.querySelector('.code-snippet').textContent.includes('class Order')`);
    }
    await takeQuiz();
    return { seenCalls, seenCode };
  };
  await load(url + '#/lesson/' + id);
  await layoutChecks('design-360');
  check('a class diagram is drawn, with a text alternative', (await evaluate(`document.querySelectorAll('.stage svg.uml .uclass').length`)) === 1 && (await evaluate(`document.querySelector('.stage .view-uml .sr-only').textContent`)).startsWith('Class diagram: Order'));
  const seen = await toExercise();
  check('the sequence diagram reveals its calls one step at a time', seen.seenCalls === 4, `${seen.seenCalls} calls`);
  check('a step shows its code', seen.seenCode);
  check('the exercise comes before the quiz', await evaluate(`!document.querySelector('.exercise').hidden && document.querySelector('.quiz').hidden`));
  await layoutChecks('design exercise');
  await browserBack();
  check('back during the exercise asks first', await evaluate(`!document.querySelector('.guard').hidden`));
  await tap('Stay');
  // One class picked: not enough, so a hint and another try.
  await tap(nameOf(ex.edits.flawed[0]));
  check('a tapped class is marked in the diagram', await evaluate(`document.querySelectorAll('.exercise .uclass.picked').length === 1`));
  await tap('Check');
  check('too few picks get a hint, not the answer', (await text('.exercise .feedback')).startsWith(`Not quite: ${ex.edits.flawed.length - 1} more classes would have to change.`), await text('.exercise .feedback'));
  for (const cid of ex.edits.flawed.slice(1)) await tap(nameOf(cid));
  await tap('Check');
  check('the right picks earn retry XP', /^\+\d+ XP, after a retry$/.test(await text('.exercise .reward')), await text('.exercise .reward'));
  check('every class the change touches is marked', (await evaluate(`document.querySelectorAll('.exercise .uclass.edit').length`)) === ex.edits.flawed.length);
  await shot('design-360-spotted');
  await tap('Next: fix the design');
  await tap(ex.fix.options[ex.fix.answer].text);
  check('the right fix on the first try earns first-try XP', /^\+\d+ XP, first try$/.test(await text('.exercise .reward')), await text('.exercise .reward'));
  await tap('See the fixed design');
  check('the fixed design shows the smaller change', (await text('.exercise .compare')) === `Same change: edit ${ex.edits.fixed.length} class (${ex.edits.fixed.map((c) => lesson.diagrams[ex.fixed].classes.find((k) => k.id === c).name).join(', ')}) instead of ${ex.edits.flawed.length}.`, await text('.exercise .compare'));
  await layoutChecks('design fixed');
  await shot('design-360-fixed');
  await tap('On to the quiz');
  check('then the quiz opens', await evaluate(`!document.querySelector('.quiz').hidden`));
  // A replay after a reload scores nothing new.
  await toExercise();
  for (const cid of ex.edits.flawed) await tap(nameOf(cid));
  await tap('Check');
  check('a replayed exercise is not scored again', (await text('.exercise .reward')).startsWith('Already scored'), await text('.exercise .reward'));
}

if (mode === 'design') await designChecks();

if (mode === 'pwa') {
  await viewport(360, 740, true);
  await load();
  const manifest = await send('Page.getAppManifest');
  check('manifest found', !!manifest.url && !(manifest.errors || []).length, manifest.url);
  const sw = await evaluate(`navigator.serviceWorker.ready.then((r) => r.active && r.active.state + ' ' + r.scope)`);
  check('service worker active', !!sw && sw.startsWith('activated'), sw);
  await load(); // the second load is served under the worker's control
  check('page controlled by service worker', await evaluate('!!navigator.serviceWorker.controller'));
  const inst = await send('Page.getInstallabilityErrors');
  check('installable (no installability errors)', inst.installabilityErrors.length === 0, JSON.stringify(inst.installabilityErrors));
  await send('Network.enable');
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await load();
  check('loads offline', (await text('h2')) === 'Lessons');
  await load(url + '?offline-deep-link=1#/lesson/cache');
  check('offline deep link with a query string opens the lesson', (await text('h2')) === 'Cache');
}

if (mode === 'persist') {
  // Close the app and open it again on later days: progress must resume, never reset.
  // Later days are simulated by moving the page's clock forward.
  const profile = mkdtempSync(join(tmpdir(), 'lq-persist-'));
  const openOnDay = async (days) => {
    await launch(profile);
    await viewport(360, 740, true);
    await media('reduce');
    const shift = days * 86_400_000;
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `(() => { const R = Date; const off = ${shift};
        class D extends R { constructor(...a) { if (a.length === 0) super(R.now() + off); else super(...a); } static now() { return R.now() + off; } }
        globalThis.Date = D; })();`,
    });
    await load();
  };
  const stats = () => text('.hud-stats');

  await openOnDay(0);
  await load(url + '#/lesson/hello-request-response');
  await tap('Go to step 2', 'label');
  await takeQuiz();
  await tap('The browser, by sending a request');
  await load();
  check('day 1: one lesson done', (await stats()) === 'Level1XP20 / 30Streak1 dayCoins5', await stats());
  await quit();

  await openOnDay(1);
  check('day 2, after closing the app: XP, streak and coins resume', (await stats()) === 'Level1XP20 / 30Streak1 dayCoins5', await stats());
  check('day 2: today starts fresh', (await text('.hud-today')) === 'Today: 0 / 1. Finish 1 lesson today to grow your streak. Missing today uses your buffer (−15 coins).', await text('.hud-today'));
  check('day 2: finished lesson still marked done', (await evaluate(`document.querySelectorAll('.lesson-card.done').length`)) === 1);
  await load(url + '#/settings');
  check('settings screen reports the storage protection state', /keep your progress|may clear it/.test(await text('.persist-state')), await text('.persist-state'));
  await load(url + '#/lesson/cache');
  await tap('Go to step 5', 'label');
  await takeQuiz();
  await tap('Users may see the old profile');
  await tap('Next question');
  await tap('So the next request is a cache hit');
  await load();
  check('day 2: second lesson grows the streak', (await stats()) === 'Level2XP50 / 80Streak2 daysCoins10', await stats());
  await quit();

  await openOnDay(3); // day 3 skipped
  check('day 4 after a missed day: buffer used, streak kept, coins taken', (await stats()) === 'Level2XP50 / 80Streak2 daysCoins0', await stats());
  check('day 4: says plainly how to keep the streak', (await text('.hud-today')) === 'Today: 0 / 1. Yesterday used your buffer. Finish 1 lesson today to keep your 2-day streak.', await text('.hud-today'));
  await quit();

  await openOnDay(5); // day 4 skipped too
  check('day 6 after a second missed day: streak ends, XP and level untouched', (await stats()) === 'Level2XP50 / 80Streak0 daysCoins0', await stats());
  await load(url + '#/progress');
  check('best streak is remembered', (await text('.panel[aria-label="Streak"] p')) === 'Current: 0 days. Best: 2.', await text('.panel[aria-label="Streak"] p'));
  await shot('persist-day6-progress');
}

if (mode === 'profiles') {
  // Two learners on one phone: separate progress, rename, the launch picker, and removing one.
  await viewport(360, 740, true);
  await media('reduce');
  const stats = () => text('.hud-stats');
  const type = async (selector, value) => {
    await tapSel(selector);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).value = ''`);
    await send('Input.insertText', { text: value });
  };
  await load();
  await load(url + '#/lesson/hello-request-response');
  await tap('Go to step 2', 'label');
  await takeQuiz();
  await tap('The browser, by sending a request');
  await load();
  check('one learner: progress as before, and the top bar shows the learner, linking to Settings', (await stats()) === 'Level1XP20 / 30Streak1 dayCoins5' && (await text('.who-initial')) === 'L' && (await evaluate(`document.querySelector('a.who').getAttribute('href')`)) === '#/settings', await stats());

  await load(url + '#/settings');
  check('settings lists the one learner', (await text('.learner-name')) === 'Learner 1 (you, now)', await text('.learner-name'));
  await tap('Rename Learner 1', 'label');
  await type('.learner-row input', 'Asha');
  await tap('Save');
  check('rename saves', (await text('.learner-name')) === 'Asha (you, now)', await text('.learner-name'));
  await type('.learner-add input', 'Ben');
  await tap('Add learner');
  check('add a learner', (await text('.learner-status')) === 'Added Ben. Tap Switch to start learning as them.', await text('.learner-status'));
  await type('.learner-add input', ' ben ');
  await tap('Add learner');
  check('a duplicate name is refused with a reason', (await text('.learner-status')) === 'Another learner already has that name.', await text('.learner-status'));
  await layoutChecks('settings with two learners (360px)');
  await shot('profiles-settings');

  await tap('Switch to Ben', 'label');
  await sleep(1500);
  check('switching opens the new learner with their own, empty progress', (await stats()) === 'Level1XP0 / 30Streak0 daysCoins0', await stats());
  check('the top bar says who is learning (initial on phones, full name for screen readers)', (await text('.who-initial')) === 'B' && (await evaluate(`document.querySelector('.who').getAttribute('aria-label')`)) === 'Learning as Ben. Change in Settings.', await text('.who-initial'));
  await layoutChecks('home as Ben (360px)');
  await shot('profiles-home-ben');

  // A new launch of the app asks who is learning.
  await evaluate('sessionStorage.clear()');
  await load();
  check('a new launch asks "Who’s learning?"', (await text('.picker h2')) === 'Who’s learning?', await text('.picker h2'));
  await layoutChecks('learner picker (360px)');
  await shot('profiles-picker');
  await tap('Asha');
  await sleep(1500);
  check('picking Asha shows her progress, untouched by Ben', (await stats()) === 'Level1XP20 / 30Streak1 dayCoins5' && (await text('.who strong')) === 'Asha', await stats());
  await load();
  check('a reload in the same launch does not ask again', !(await evaluate(`!!document.querySelector('.picker')`)));

  await load(url + '#/settings');
  await tap('Remove Ben', 'label');
  check('removing asks first, with Keep as the safe choice', (await evaluate(`document.activeElement?.textContent`)) === 'Keep', await evaluate(`document.activeElement?.textContent`));
  await tap('Remove Ben');
  check('removed: one learner left', (await evaluate(`document.querySelectorAll('.learner-row').length`)) === 1 && (await text('.learner-status')) === 'Removed Ben.', await text('.learner-status'));
  await evaluate('sessionStorage.clear()');
  await load();
  check('with one learner left, no picker, and her progress survives the reload', !(await evaluate(`!!document.querySelector('.picker')`)) && (await stats()) === 'Level1XP20 / 30Streak1 dayCoins5', await stats());
  await viewport(1280, 800, false);
  await media('no-preference', 'dark');
  await load(url + '#/settings');
  check('Settings shows the app version (build commit and date)', /^App version ([0-9a-f]{7}|local), built \d{4}-\d{2}-\d{2}$/.test(await text('.app-version')), await text('.app-version'));
  await shot('profiles-settings-desktop-dark');
}

if (mode === 'practice') {
  // Practice under a track: the drop-down, filters, the hard lock, a quiz item and a debug item by
  // touch, XP that only counts once, the leave check, and statuses after a reload.
  await viewport(360, 740, true);
  await media('reduce');
  // A plain tap on the n-th match (no folding logic: used for <summary> elements themselves).
  const tapOnly = async (selector, n = 0) => {
    const box = await evaluate(`(() => { const b = document.querySelectorAll(${JSON.stringify(selector)})[${n}]; if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!box) throw new Error(`nothing to tap: ${selector} #${n}`);
    await sleep(150);
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x, y: box.y }] });
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(300);
  };
  const openLogicPractice = async () => {
    if (!(await evaluate(`document.querySelector('.track[data-track="logic"]').open`))) await tapOnly('.track[data-track="logic"] > summary');
    if (!(await evaluate(`document.querySelector('.track[data-track="logic"] .practice').open`))) await tapOnly('.track[data-track="logic"] .practice > summary');
    await sleep(800);
  };
  const cards = () => evaluate(`[...document.querySelectorAll('.track[data-track="logic"] .practice-card')].map((c) => c.dataset.id + (c.classList.contains('locked') ? ':locked' : '') + (c.classList.contains('done') ? ':done' : ''))`);
  await load();
  await openLogicPractice();
  const first = await cards();
  check('the logic track has a practice drop-down with 6 problems, hard ones locked', first.length === 6 && first.filter((c) => c.endsWith(':locked')).length === 2, JSON.stringify(first));
  check('it says how many are done', (await text('.track[data-track="logic"] .practice-count')) === '0 of 6 done', await text('.track[data-track="logic"] .practice-count'));
  await layoutChecks('practice list (360px)');
  await shot('practice-list');
  await evaluate(`(() => { const s = document.querySelectorAll('.track[data-track="logic"] .practice-filter')[1]; s.value = 'debug'; s.dispatchEvent(new Event('change')); })()`);
  check('filtering by type shows only debug problems', (await cards()).length === 3 && (await text('.track[data-track="logic"] .practice-count')) === '0 of 6 done · showing 3', await text('.track[data-track="logic"] .practice-count'));
  await evaluate(`(() => { const s = document.querySelectorAll('.track[data-track="logic"] .practice-filter')[1]; s.value = 'all'; s.dispatchEvent(new Event('change')); })()`);
  await tapSel('.practice-card[data-id="merge-meetings"]');
  check('a locked hard problem explains itself', (await evaluate(`document.querySelector('.practice-card[data-id="merge-meetings"] .lesson-lock').textContent`)) === 'Finish the medium problems in this track first.');

  await tapSel('.practice-card[data-id="python-arithmetic-corners"]');
  await sleep(600);
  check('a quiz problem opens with its goal and level', (await text('h2')) === 'Arithmetic that surprises' && (await text('.practice-meta')) === 'Medium · Corner cases', await text('.practice-meta'));
  await tap('-3');
  check('a wrong answer explains itself and costs nothing', /rounds down/.test(await text('.practice-check .feedback')) && (await text('.practice-check .reward')) === 'Not quite. Try another option.');
  await tap('-4');
  check('then the right one earns retry XP', (await text('.practice-check .reward')) === '+5 XP, after a retry', await text('.practice-check .reward'));
  await layoutChecks('practice quiz (360px)');
  for (const answer of ['1', '2', '2.67']) {
    await tap('Next question');
    await tap(answer);
  }
  check('finishing shows Done', (await text('.practice-done h3')) === 'Done ✓');
  await shot('practice-quiz-done');
  await tap('Back to practice');
  await sleep(800);
  check('Back returns to the list, still open, with the problem marked done', (await cards()).includes('python-arithmetic-corners:done') && (await text('.track[data-track="logic"] .practice-count')) === '1 of 6 done', JSON.stringify(await cards()));

  await tapSel('.practice-card[data-id="fence-posts-debug"]');
  await sleep(600);
  await tapSel('.code-line', 0);
  check('debug: a wrong line gets a hint', /trace it line by line/.test(await text('.debug-lines .feedback')));
  await tapSel('.code-line', 2);
  check('debug: the right line explains why', /one more post than gaps/.test(await text('.debug-lines .feedback')), await text('.debug-lines .feedback'));
  await tap('5');
  check('debug: the predicted output is shown as the app computed it', (await evaluate(`[...document.querySelectorAll('.run-rows p')].map((p) => p.textContent).join(' | ')`)) === 'Buggy code gives: 5', await evaluate(`[...document.querySelectorAll('.run-rows p')].map((p) => p.textContent).join(' | ')`));
  await tap('return length // gap + 1');
  const runText = () => evaluate(`[...document.querySelectorAll('.run-panel')].at(-1).textContent`);
  check('debug: after the fix, both versions are run', /Buggy code gives: 5Fixed code gives: 6Different/.test(await runText()), await runText());
  const before = await runText();
  await tap('Try another input');
  check('debug: "Try another input" runs both versions on a new input', (await runText()) !== before && /Fixed code gives: \d+/.test(await runText()), await runText());
  await layoutChecks('debug problem (360px)');
  await shot('practice-debug-done');
  await tap('Back to practice');
  await sleep(600);

  await tapSel('.practice-card[data-id="last-item-never-checked"]');
  await sleep(600);
  await tapSel('.code-line', 0);
  await browserBack();
  check('leaving a started problem asks first', (await evaluate(`!document.querySelector('.guard').hidden`)) && (await text('h2')) === 'The last item is never checked');
  await tap('Stay');
  await load();
  // Quiz 5 + 10 + 10 + 10, debug 5 + 10 + 10. Practice adds XP but isn't a finished lesson.
  check('practice XP counts once, towards the level, but not towards the daily goal', (await text('.hud-stats')) === 'Level2XP60 / 80Streak0 daysCoins0', await text('.hud-stats'));
  await openLogicPractice();
  check('after a reload, the done problems are still done', (await text('.track[data-track="logic"] .practice-count')) === '2 of 6 done', await text('.track[data-track="logic"] .practice-count'));
  await tapSel('.practice-card[data-id="python-arithmetic-corners"]');
  await sleep(600);
  await tap('-4');
  check('replaying earns nothing new', (await text('.practice-check .reward')) === 'Already scored.', await text('.practice-check .reward'));
  await viewport(1280, 800, false);
  await media('no-preference', 'dark');
  await load(url + '#/practice/logic/remove-while-looping');
  await sleep(800);
  await shot('practice-debug-desktop-dark');
  await layoutChecks('debug problem (desktop)');
}

if (mode === 'practice-walk') {
  // Every practice item in every track, solved by touch at 360 px with the right answers read
  // from the data files, then a layout check of the finished page (all its steps stay on screen).
  await viewport(360, 740, true);
  await media('reduce');
  const practiceDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'practice');
  // Tap by exact text inside the last element matching `scope`, so an earlier step's option with
  // the same words can never be hit instead.
  const tapIn = async (scope, name) => {
    const box = await evaluate(`(() => {
      const s = [...document.querySelectorAll(${JSON.stringify(scope)})].at(-1);
      const b = s && [...s.querySelectorAll('button')].find((b) => b.offsetParent && !b.disabled && b.textContent.trim() === ${JSON.stringify(name)});
      if (!b) return null;
      b.scrollIntoView({ block: 'center' });
      const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    if (!box) throw new Error(`nothing to tap in ${scope}: "${name}"`);
    await sleep(120);
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x, y: box.y }] });
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(200);
  };
  const right = (q) => q.options[q.answer].text;
  for (const file of readdirSync(practiceDir).filter((f) => f.endsWith('.json')).sort()) {
    const track = file.replace(/\.json$/, '');
    for (const item of JSON.parse(readFileSync(join(practiceDir, file), 'utf8'))) {
      const name = `${track}/${item.id}`;
      try {
        await load(`${url}#/practice/${track}/${item.id}`);
        await sleep(600);
        if (item.kind === 'quiz') {
          for (const [k, q] of item.questions.entries()) {
            await tapIn('.practice-check', right(q));
            if (k < item.questions.length - 1) await tap('Next question');
          }
        } else if (item.kind === 'debug') {
          await tapSel('.code-line', item.bugLine);
          await tapIn('main', right(item.predict));
          if (item.program) {
            const rows = await evaluate(`[...document.querySelectorAll('.run-rows p')].map((p) => p.textContent).join(' | ')`);
            check(`${name}: the buggy run shown matches the predicted answer`, rows === `Buggy code gives: ${right(item.predict)}`, rows);
          }
          await tapIn('main', right(item.fix));
        } else {
          for (const [k, step] of item.steps.entries()) {
            const c = step.check;
            if (c?.type === 'choice') await tapIn('.workshop-step', right(c));
            else if (c?.type === 'order') {
              for (const part of c.parts) await tapIn('.workshop-step', part);
              await tapIn('.workshop-step', 'Check the order');
            } else if (c?.type === 'select') {
              for (const kase of c.cases.filter((x) => x.pick)) await tapIn('.workshop-step', kase.text);
              await tapIn('.workshop-step', 'Check');
            }
            if (k < item.steps.length - 1) await tapIn('.workshop-step', 'Next step');
            else await tapIn('.workshop-step', 'Show the expert’s version');
          }
        }
        check(`${name}: solved by touch, ends with Done`, (await text('.practice-done h3')) === 'Done ✓', await text('.practice-done h3'));
      } catch (e) {
        check(`${name}: solved by touch, ends with Done`, false, e.message);
      }
      await layoutChecks(`${name} (360px)`);
      await shot(`walk-${track}-${item.id}`);
    }
  }
}

if (mode === 'tutor') {
  // "Ask about this lesson": suggested answers with sources, a typed search over the course, a
  // question nothing matches, a lesson with no suggested questions, and the conversation
  // surviving a lesson that redraws itself ("New example"). Touch only, 360 px.
  await viewport(360, 740, true);
  await media('reduce');
  const ask = async (q) => {
    await tapSel('.tutor-ask input');
    await send('Input.insertText', { text: q });
    await tap('Search');
    await sleep(300);
  };
  const turns = () => evaluate(`document.querySelectorAll('.tutor-turn').length`);
  await load(url + '#/lesson/cache');
  await sleep(600);
  check('the panel sits under the goal, folded', (await evaluate(`document.querySelector('.objective').nextElementSibling.matches('details.tutor:not([open])')`)));
  await tap('Ask about this lesson');
  await sleep(800);
  const qs = await evaluate(`[...document.querySelectorAll('.tutor-q')].map((b) => b.textContent)`);
  check('the cache lesson offers its 3 suggested questions', qs.length === 3 && qs[0] === 'Should I update the database or remove the cached copy first?', JSON.stringify(qs));
  await tap(qs[0]);
  check('a suggested question shows its reviewed answer, with sources', /^Update the database first/.test(await text('.tutor-answer p')) && (await text('.tutor-sources summary')) === 'Sources (1)', await text('.tutor-answer p'));
  await layoutChecks('tutor answer (360px)');
  await ask('why not round robin');
  const hits = await evaluate(`[...document.querySelectorAll('.tutor-turn')[0].querySelectorAll('.tutor-where')].map((p) => p.textContent)`);
  check('a typed question shows the closest course passages, newest first', hits.length > 0 && hits.length <= 5 && (await text('.tutor-you')) === 'why not round robin', JSON.stringify(hits));
  check('passages from other lessons link to them', await evaluate(`[...document.querySelectorAll('.tutor-turn')[0].querySelectorAll('a.tutor-open')].some((a) => a.getAttribute('href') === '#/lesson/load-balancer')`));
  await ask('zebra quokka kiwi');
  check('when nothing matches it says so and lists the lesson’s sources', /^Nothing in the course matches/.test(await evaluate(`document.querySelector('.tutor-turn .tutor-answer p').textContent`)));
  await ask('<img src=x onerror=alert(1)>');
  check('a question is shown as text, never as HTML', (await text('.tutor-you')) === '<img src=x onerror=alert(1)>' && !(await evaluate(`!!document.querySelector('.tutor-log img')`)));
  await layoutChecks('tutor search (360px)');
  await shot('tutor-cache');

  await load(url + '#/lesson/arrays');
  await sleep(600);
  await tap('Ask about this lesson');
  await sleep(800);
  check('a lesson without suggested questions still has search', (await evaluate(`document.querySelectorAll('.tutor-q').length`)) === 0 && !!(await evaluate(`document.querySelector('.tutor-ask input')`)));
  await ask('index of the last item');
  const before = await turns();
  await tap('New example');
  await sleep(500);
  check('the conversation survives the lesson redrawing itself', before === 1 && (await turns()) === 1 && (await evaluate(`document.querySelector('details.tutor').open`)), `${before} -> ${await turns()}`);

  await viewport(1280, 800, false);
  await media('no-preference', 'dark');
  await load(url + '#/lesson/agent-guardrails');
  await sleep(600);
  await tap('Ask about this lesson');
  await sleep(800);
  await tap('Can a system prompt alone stop prompt injection?');
  await layoutChecks('tutor (desktop)');
  await shot('tutor-desktop-dark');
}

if (mode === 'tutor-ai') {
  // The AI tiers in the tutor panel, by touch at 360 px, with Gemini mocked (no real call is ever
  // made): Ask Claude without a key (copy, then copying blocked), saving a key in Settings, Gemini
  // answers shown as text with the key only in a header, follow-ups, each failure offering Claude,
  // offline, and removing the key. Replies, the clipboard and being offline are driven from
  // localStorage, so they survive page loads.
  await viewport(360, 740, true);
  await media('reduce');
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const real = window.fetch.bind(window);
      window.fetch = async (input, init = {}) => {
        const u = String(input);
        if (!u.startsWith('https://generativelanguage.googleapis.com/')) return real(input, init);
        const log = JSON.parse(localStorage.getItem('test:gem-log') || '[]');
        log.push({ url: u, headers: init.headers, body: init.body });
        localStorage.setItem('test:gem-log', JSON.stringify(log));
        const queue = JSON.parse(localStorage.getItem('test:gem') || '[]');
        const next = queue.shift() || { status: 500, body: {} };
        localStorage.setItem('test:gem', JSON.stringify(queue));
        return new Response(JSON.stringify(next.body), { status: next.status, headers: { 'Content-Type': 'application/json' } });
      };
      Object.defineProperty(Navigator.prototype, 'onLine', { get: () => localStorage.getItem('test:offline') !== '1' });
      // No share sheet in this test browser, so the copy path is the one checked.
      Object.defineProperty(Navigator.prototype, 'share', { value: undefined });
      Object.defineProperty(Navigator.prototype, 'clipboard', { get: () => ({ writeText: async (t) => {
        if (localStorage.getItem('test:clip') === 'deny') throw new DOMException('denied', 'NotAllowedError');
        localStorage.setItem('test:copied', t);
      } }) });
    })();`,
  });
  const FAKE = 'AQ.browser-check-not-a-real-key_0123456789';
  const queue = (...replies) => evaluate(`localStorage.setItem('test:gem', ${JSON.stringify(JSON.stringify(replies))})`);
  const gemLog = async () => JSON.parse((await evaluate(`localStorage.getItem('test:gem-log') || '[]'`)));
  const ok = (t) => ({ status: 200, body: { candidates: [{ content: { parts: [{ text: 'thinking…', thought: true }, { text: t }] }, finishReason: 'STOP' }] } });
  const type = async (selector, value) => {
    await tapSel(selector);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).value = ''`);
    await send('Input.insertText', { text: value });
  };
  const latest = (sel) => evaluate(`document.querySelector('.tutor-turn')?.querySelector(${JSON.stringify(sel)})?.textContent ?? null`);
  const openPanel = async (id = 'cache') => {
    await load(url + `#/lesson/${id}`);
    await sleep(600);
    await tap('Ask about this lesson');
    await sleep(800);
  };
  const buttons = () => evaluate(`[...document.querySelectorAll('.tutor-ai-row button')].map((b) => b.textContent)`);

  await load();
  await openPanel();
  check('without a key: only Ask Claude, and a link to add a Gemini key', JSON.stringify(await buttons()) === '["Ask Claude"]' && (await evaluate(`document.querySelector('.tutor-ai a.tutor-open').offsetParent !== null && document.querySelector('.tutor-ai a.tutor-open').getAttribute('href')`)) === '#/settings', JSON.stringify(await buttons()));
  await tap('Ask Claude');
  check('an empty question asks for one first', (await text('.tutor-ai-hint')) === 'Type a question in the box first.' && (await evaluate(`document.querySelectorAll('.tutor-turn').length`)) === 0);
  await type('.tutor-ask input', 'Why delete instead of update?');
  await tap('Ask Claude');
  await sleep(300);
  const copied = await evaluate(`localStorage.getItem('test:copied')`);
  check('Ask Claude copies a prompt with the lesson, its sources and the question', !!copied && copied.includes('"Cache"') && copied.includes('My question: Why delete instead of update?') && copied.includes('cite a source'), copied?.slice(0, 120));
  check('then offers an Open Claude link to claude.ai', (await evaluate(`document.querySelector('.tutor-turn a.tutor-open')?.getAttribute('href')`)) === 'https://claude.ai/new' && (await latest('.tutor-to')) === 'To Claude: ');
  await layoutChecks('ask claude (360px)');
  await evaluate(`localStorage.setItem('test:clip', 'deny')`);
  await type('.tutor-ask input', 'What is a TTL?');
  await tap('Ask Claude');
  await sleep(300);
  check('when copying is blocked, the prompt is shown to copy by hand', ((await evaluate(`document.querySelector('.tutor-turn textarea')?.value`)) ?? '').includes('My question: What is a TTL?'));
  await evaluate(`localStorage.removeItem('test:clip')`);
  await layoutChecks('ask claude by hand (360px)');
  await shot('tutor-ai-claude');

  // Settings: a bad paste is refused, a good one saved and never shown again.
  await load(url + '#/settings');
  await sleep(500);
  check('Settings has the AI tutor card with the privacy note', /used to improve our products/.test((await text('.ai-tutor')) ?? ''));
  await type('.ai-key-form input', 'my key is 123');
  await tap('Save key');
  check('a pasted sentence is refused as a key', /doesn't look like a Gemini API key/.test((await text('.ai-key-status')) ?? ''), await text('.ai-key-status'));
  check('the key box hides what is typed', (await evaluate(`document.querySelector('.ai-key-form input').type`)) === 'password');
  await type('.ai-key-form input', FAKE);
  await tap('Save key');
  check('a key is saved for this learner, and not shown', /^Key saved/.test((await text('.ai-key-status')) ?? '') && !(await evaluate(`document.body.innerHTML.includes(${JSON.stringify(FAKE)})`)) && (await evaluate(`localStorage.getItem('logic-quest:p:p1:gemini-key')`)) === FAKE);
  await layoutChecks('settings ai tutor (360px)');
  await shot('tutor-ai-settings');

  // Gemini answers, shown as text, with the key only in a header.
  await queue(ok('<img src=x onerror=alert(1)> Delete it.\nThe next read refills it.'), ok('Because the TTL limits staleness.'));
  await openPanel();
  check('with a key: Ask Gemini and Ask Claude', JSON.stringify(await buttons()) === '["Ask Gemini","Ask Claude"]', JSON.stringify(await buttons()));
  await type('.tutor-ask input', 'Why delete the cached copy?');
  await tap('Ask Gemini');
  await sleep(500);
  check('the answer is labelled AI-generated and shown as text, not HTML', /^AI-generated \(Gemini\)/.test((await latest('.tutor-where')) ?? '') && (await latest('.tutor-ai-text')) === '<img src=x onerror=alert(1)> Delete it.\nThe next read refills it.' && !(await evaluate(`!!document.querySelector('.tutor-log img')`)), await latest('.tutor-ai-text'));
  check("the model's thinking is left out, and the lesson's sources are listed", !((await latest('.tutor-ai-text')) ?? '').includes('thinking') && /^Sources \(\d+\)$/.test((await latest('.tutor-sources summary')) ?? ''));
  let sent = await gemLog();
  const body0 = JSON.parse(sent[0]?.body ?? '{}');
  check('the key goes only in a header, never in the URL or body', sent.length === 1 && !sent[0].url.includes(FAKE) && !sent[0].body.includes(FAKE) && sent[0].headers['x-goog-api-key'] === FAKE, sent[0]?.url);
  check("the request carries the lesson's text and the question, and no progress", sent[0].body.includes('Lesson: Cache') && body0.contents.at(-1).parts[0].text === 'Why delete the cached copy?' && !sent[0].body.includes('"events"'));
  await type('.tutor-ask input', 'And why a TTL too?');
  await tap('Ask Gemini');
  await sleep(500);
  sent = await gemLog();
  check('a follow-up sends the earlier question and answer', JSON.parse(sent[1].body).contents.length === 5 && sent[1].body.includes('The next read refills it.'));
  await layoutChecks('gemini answer (360px)');
  await shot('tutor-ai-gemini');

  // Every failure says why and offers Claude.
  const failures = [
    [{ status: 429, body: { error: { code: 429, status: 'RESOURCE_EXHAUSTED' } } }, /free limit/],
    [{ status: 400, body: { error: { code: 400, details: [{ reason: 'API_KEY_INVALID' }] } } }, /did not accept the API key/],
    [{ status: 503, body: { error: { code: 503 } } }, /busy or down/],
    [{ status: 200, body: { promptFeedback: { blockReason: 'SAFETY' } } }, /stopped before answering/],
  ];
  for (const [reply, want] of failures) {
    await queue(reply);
    await type('.tutor-ask input', `Failure ${reply.status}`);
    await tap('Ask Gemini');
    await sleep(500);
    const msg = await latest('.bad');
    const offers = await evaluate(`[...document.querySelector('.tutor-turn').querySelectorAll('button')].some((b) => b.textContent === 'Ask Claude instead')`);
    check(`Gemini ${reply.status}${reply.body.promptFeedback ? ' (blocked)' : ''}: says why and offers Claude`, want.test(msg ?? '') && offers, msg);
  }
  check('a wrong key links to Settings', await evaluate(`[...document.querySelectorAll('.tutor-turn')].some((t) => t.querySelector('a[href="#/settings"]') && /did not accept/.test(t.textContent))`));
  await evaluate(`localStorage.removeItem('test:copied')`);
  await tap('Ask Claude instead');
  await sleep(300);
  check('Ask Claude instead hands the same question over', ((await evaluate(`localStorage.getItem('test:copied')`)) ?? '').includes('My question: Failure 200'));
  await layoutChecks('gemini failures (360px)');
  await shot('tutor-ai-failures');

  const before = (await gemLog()).length;
  await evaluate(`localStorage.setItem('test:offline', '1')`);
  await type('.tutor-ask input', 'Offline question');
  await tap('Ask Gemini');
  await sleep(300);
  check('offline: says so without calling Gemini', /You're offline/.test((await latest('.bad')) ?? '') && (await gemLog()).length === before);
  await tap('Ask Claude instead');
  await sleep(200);
  check('offline: Ask Claude says it needs a connection', /needs a connection/.test(await evaluate(`document.querySelector('.tutor-turn').textContent`)));
  await evaluate(`localStorage.removeItem('test:offline')`);

  // Removing the key turns Gemini off again.
  await load(url + '#/settings');
  await sleep(500);
  await tap('Remove key');
  check('Remove key deletes it', (await evaluate(`localStorage.getItem('logic-quest:p:p1:gemini-key')`)) === null && /^Key removed/.test((await text('.ai-key-status')) ?? ''));
  await openPanel();
  check('without the key, Ask Gemini is gone', JSON.stringify(await buttons()) === '["Ask Claude"]');

  await viewport(1280, 800, false);
  await media('no-preference', 'dark');
  await openPanel('load-balancer');
  await layoutChecks('tutor ai (desktop)');
  await shot('tutor-ai-desktop-dark');
}

if (mode === 'review') {
  // Phase 7 review by touch at 360 px, from a seeded history: yesterday's misses on 10 lesson
  // questions, one practice question and one design exercise. Home's card, a session of 10 (one
  // left waiting), a wrong tap then the right one, finishing (counts towards today's goal), the
  // exercise sent back to its lesson, the rest after a reload, and the empty state.
  await viewport(360, 740, true);
  await media('reduce');
  const day = (n) => new Date(Date.now() + n * 86_400_000).toLocaleDateString('en-CA');
  const yesterday = day(-1);
  const quizLessons = lessonFiles.map((f) => lessonData(f.replace(/\.json$/, ''))).filter((l) => l.quiz?.length).slice(0, 10);
  const practice = JSON.parse(readFileSync(join(lessonsDir, '..', 'practice', 'dsa.json'), 'utf8'));
  const pq = (Array.isArray(practice) ? practice : practice.items).find((i) => i.id === 'python-structure-corners');
  // Prompt -> its options, to tap a wrong one and then the right one by text.
  const answers = new Map([...quizLessons.map((l) => l.quiz[0]), pq.questions[0]].map((q) => [q.prompt, q]));
  let n = 0;
  const miss = (lesson, question) => ({ id: `seed${++n}`, type: 'answer', at: `${yesterday}T10:00:${String(n).padStart(2, '0')}.000Z`, day: yesterday, lesson, question, option: 9, correct: false });
  const events = [...quizLessons.map((l) => miss(l.id, 0)), miss('practice:python-structure-corners', 0), miss('composition-inheritance', 301)];
  await load();
  await evaluate(`localStorage.setItem('logic-quest:progress', ${JSON.stringify(JSON.stringify({ version: 1, events, settings: {} }))})`);
  await load();
  check('Home shows how many reviews are due', (await text('.review-card h3')) === '12 questions to review', await text('.review-card h3'));
  // The last miss seeded is in an LLD lesson, so that's where "Up next" picks up, with its reason.
  check('Up next follows the track worked on last, and says why', (await text('.continue small')) === 'Up next' && /^Next in Low-level design.*, where you left off\.$/.test((await text('.up-next-why')) ?? ''), `${await text('.continue small')} | ${await text('.up-next-why')}`);
  await layoutChecks('home with reviews (360px)');
  await shot('review-home');
  await tap('Start review');
  await sleep(800);
  check('a session asks 10 and says how many wait', (await text('.review-count')) === '10 questions today, 1 more after this session.', await text('.review-count'));
  check('the review cites its source', /Roediger and Karpicke/.test((await text('.review-source')) ?? ''));
  const prompt = async () => (await text('.review-box h3')) ?? '';
  const q0 = answers.get(await prompt());
  check('the first question is one of the missed ones', !!q0, await prompt());
  const wrong = q0.options.find((_, i) => i !== q0.answer).text;
  await tap(wrong);
  check('a wrong tap explains, and offers another try', (await text('.review-box .quiz-after p')) === 'Try another option. This question will come back tomorrow.');
  await tap(q0.options[q0.answer].text);
  check('the right answer explains, and moves on', (await text('.review-box .feedback')) === q0.options[q0.answer].explanation && !!(await evaluate(`[...document.querySelectorAll('.review-box button')].some((b) => b.textContent === 'Next question')`)));
  await layoutChecks('review question (360px)');
  await shot('review-question');
  await tap('Next question');
  for (let i = 1; i < 10; i++) {
    const q = answers.get(await prompt());
    if (!q) {
      check(`question ${i + 1} is a missed one`, false, await prompt());
      break;
    }
    await tap(q.options[q.answer].text);
    const canStop = await evaluate(`[...document.querySelectorAll('.review-box button')].some((b) => b.textContent === 'Stop here')`);
    if (i === 3) check('no Stop here before 5 answers', !canStop);
    if (i === 4) check('Stop here is offered after 5 answers', canStop);
    await tap(i === 9 ? 'Finish the review' : 'Next question');
  }
  check('finishing says it counts towards today’s goal', /^Review done\. Today’s goal is done\./.test((await text('.review-box p')) ?? ''), await text('.review-box p'));
  check('the design exercise is sent back to its lesson', await evaluate(`[...document.querySelectorAll('.review-redo a')].some((a) => a.getAttribute('href') === '#/lesson/composition-inheritance')`));
  check('and 1 more question waits', /1 more question is due/.test(await evaluate(`document.querySelector('.review-box').textContent`)));
  await layoutChecks('review done (360px)');
  await shot('review-done');

  await load();
  check('after a reload, Home has the 2 left (the waiting question and the exercise)', (await text('.review-card h3')) === '2 questions to review', await text('.review-card h3'));
  check('the finished review met today’s goal', /^Today: 1 \/ 1\. Today’s goal is done\./.test((await text('.hud-today')) ?? ''), await text('.hud-today'));
  await tap('Start review');
  await sleep(800);
  const q = answers.get(await prompt());
  await tap(q.options[q.answer].text);
  await tap('Finish the review');
  await load(url + '#/review');
  await sleep(800);
  check('when nothing is left, it says when the next review is due', (await text('.review-empty')) === 'Nothing to review today. The next review is due tomorrow.', await text('.review-empty'));
  await layoutChecks('review empty (360px)');

  await load(url + '#/progress');
  await sleep(500);
  const cards = await evaluate(`[...document.querySelectorAll('.track-stat')].map((c) => c.querySelector('h4').textContent + ': ' + [...c.querySelectorAll('p')].map((p) => p.textContent).join(' | '))`);
  check('Progress shows every track', cards.length === 7, JSON.stringify(cards));
  check('a track lists its most-missed lessons as links', await evaluate(`[...document.querySelectorAll('.most-missed a')].length > 0`));
  check('first-try share and reviews are stated in words', cards.some((c) => /First try right: \d+% \(\d+ of \d+\)/.test(c)) && cards.some((c) => /In review: \d+ · Mastered: \d+/.test(c)), JSON.stringify(cards));
  await layoutChecks('progress by track (360px)');
  await evaluate(`document.querySelector('.track-stats').scrollIntoView()`);
  await shot('review-progress');

  await viewport(1280, 800, false);
  await media('no-preference', 'dark');
  await load();
  await layoutChecks('home with reviews (desktop)');
  await shot('review-desktop-dark');
}

if (mode === 'playground') {
  // The design playground by touch at 360 px: place, connect, label, drag, nudge, undo and redo,
  // delete (taking its arrows), pinch zoom, saving across a reload, several designs; then the
  // keyboard on desktop.
  await viewport(360, 740, true);
  await media('reduce');
  const touch = async (type, points) => send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const tapAt = async (x, y) => {
    await touch('touchStart', [{ x, y }]);
    await touch('touchEnd', []);
    await sleep(200);
  };
  const box = (sel, n = 0) => evaluate(`(() => { const e = document.querySelectorAll(${JSON.stringify(sel)})[${n}]; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, left: r.left, top: r.top }; })()`);
  const counts = async () => evaluate(`[document.querySelectorAll('.pg-shape').length, document.querySelectorAll('.pg-arrow').length].join('/')`);
  const shapeX = (n) => evaluate(`+document.querySelectorAll('.pg-shape rect')[${n}].getAttribute('x')`);
  const enter = () => send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }).then(() => send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }));

  await load(url + '#/playground');
  await sleep(500);
  check('the Design tab opens the playground', (await text('h2')) === 'Design playground' && (await evaluate(`document.querySelector('.nav-item[aria-current="page"]')?.textContent`)) === 'Design');
  check('first visit starts one empty design, with a hint', (await evaluate(`document.querySelectorAll('.pg-bar option').length`)) === 1 && (await counts()) === '0/0' && /^Start by tapping a box type/.test(await text('.pg-status')));
  await tap('API service');
  check('a palette item waits for a tap on the board', /Tap the board to place: API service/.test(await text('.pg-status')));
  await scrollToCanvas();
  const c = await box('.pg-canvas');
  await tapAt(c.left + 90, c.top + 60);
  check('tapping the board places it, selected', (await counts()) === '1/0' && (await text('.pg-panel h3')) === 'Selected: API service', await text('.pg-panel h3'));
  await tap('Database');
  await scrollToCanvas();
  const c2 = await box('.pg-canvas');
  await tapAt(c2.left + 90, c2.top + 230);
  await tap('Connect');
  await scrollToCanvas();
  const s1 = await box('.pg-shape rect', 0);
  const s2 = await box('.pg-shape rect', 1);
  await tapAt(s1.x, s1.y);
  check('Connect asks for the second box', (await text('.pg-status')) === 'Now tap the box the arrow goes to.');
  await tapAt(s2.x, s2.y);
  check('tapping two boxes draws an arrow between them, selected', (await counts()) === '2/1' && /^Selected: arrow from API service to Database$/.test(await text('.pg-panel h3')), await text('.pg-panel h3'));
  await tapSel('.pg-panel input');
  await send('Input.insertText', { text: 'SQL' });
  await enter();
  await sleep(200);
  check('the arrow gets a label', (await text('.pg-arrow text')) === 'SQL');
  await layoutChecks('playground (360px)');
  const scale = await evaluate(`(() => { const t = document.querySelector('.pg-shape text'); return t.getScreenCTM().a * parseFloat(t.getAttribute('font-size')); })()`);
  check('board labels are at least 14 px at the starting zoom', scale >= 14, `${scale}px`);
  await shot('playground-360');

  await scrollToCanvas();
  const before = await shapeX(1);
  const d = await box('.pg-shape rect', 1);
  await touch('touchStart', [{ x: d.x, y: d.y }]);
  for (let k = 1; k <= 5; k++) {
    await touch('touchMove', [{ x: d.x + k * 20, y: d.y }]);
    await sleep(30);
  }
  await touch('touchEnd', []);
  await sleep(200);
  check('dragging a box moves it, snapped to the grid', (await shapeX(1)) === before + 100, `${before} -> ${await shapeX(1)}`);
  await tap('Move right', 'label');
  check('the arrow buttons nudge it one grid step', (await shapeX(1)) === before + 120);
  await tap('Undo');
  await tap('Undo');
  check('Undo steps back through the nudge and the drag', (await shapeX(1)) === before);
  await tap('Redo');
  check('Redo steps forward again', (await shapeX(1)) === before + 100);

  await tap(`The design as text: 2 boxes, 1 arrow`);
  await tapSel('.pg-text li button', 0);
  await tap('Delete');
  check('deleting a box takes its arrows with it', (await counts()) === '1/0');
  await tap('Undo');
  check('and Undo brings both back', (await counts()) === '2/1');

  await scrollToCanvas();
  const p = await box('.pg-canvas');
  const z0 = await evaluate(`document.querySelector('.pg-svg g').getAttribute('transform')`);
  await touch('touchStart', [{ x: p.x - 100, y: p.y, id: 1 }, { x: p.x + 100, y: p.y, id: 2 }]);
  for (let k = 1; k <= 5; k++) {
    await touch('touchMove', [{ x: p.x - 100 + k * 15, y: p.y, id: 1 }, { x: p.x + 100 - k * 15, y: p.y, id: 2 }]);
    await sleep(30);
  }
  await touch('touchEnd', []);
  await sleep(200);
  const z1 = await evaluate(`document.querySelector('.pg-svg g').getAttribute('transform')`);
  check('pinching zooms out', /scale\(0\./.test(z1) && z0.startsWith('scale(1)'), `${z0} -> ${z1}`);
  await tap('Zoom in', 'label');
  check('the + button zooms back in', (await evaluate(`document.querySelector('.pg-svg g').getAttribute('transform')`)) !== z1);
  await layoutChecks('playground zoomed (360px)');

  await load(url + '#/playground');
  await sleep(500);
  check('after a reload the design is still there', (await counts()) === '2/1' && (await text('.pg-arrow text')) === 'SQL');
  await tap('Design: My design');
  await tap('New design');
  check('New design starts an empty second one', (await evaluate(`document.querySelectorAll('.pg-bar option').length`)) === 2 && (await counts()) === '0/0');
  await tap('Delete design');
  check('deleting asks for a second tap', (await evaluate(`[...document.querySelectorAll('.pg-bar button')].some((b) => b.textContent === 'Tap again to delete')`)));
  await tap('Tap again to delete');
  check('and then goes back to the remaining design', (await evaluate(`document.querySelectorAll('.pg-bar option').length`)) === 1 && (await counts()) === '2/1');

  // A practice prompt: requirements, a checklist that is saved, and lessons to compare with.
  await tap('Practice prompts');
  await evaluate(`(() => { const s = document.querySelector('.pg-practice select'); s.value = 'url-shortener'; s.dispatchEvent(new Event('change')); })()`);
  await sleep(200);
  check('a prompt shows its requirements, checklist and lessons to compare', (await text('.pg-practice summary')) === 'Practice: A URL shortener' && (await evaluate(`document.querySelectorAll('.pg-checklist input').length`)) === 5 && (await evaluate(`[...document.querySelectorAll('.pg-practice a')].map((a) => a.getAttribute('href')).join(' ')`)) === '#/lesson/design-url-shortener #/lesson/cache #/lesson/rate-limiting');
  await tapSel('.pg-checklist label', 1);
  check('ticking a question counts it', /\(1 of 5\)/.test(await evaluate(`[...document.querySelectorAll('.pg-practice h3')][1].textContent`)));
  await layoutChecks('playground practice (360px)');
  await load(url + '#/playground');
  await sleep(500);
  check('the prompt and the tick are kept after a reload', (await text('.pg-practice summary')) === 'Practice: A URL shortener' && (await evaluate(`[...document.querySelectorAll('.pg-checklist input')].map((i) => i.checked).join()`)) === 'false,true,false,false,false');

  // Files: JSON and SVG downloads, and importing the JSON back as a new design.
  const downloads = join(outDir, 'playground-downloads');
  rmSync(downloads, { recursive: true, force: true });
  mkdirSync(downloads, { recursive: true });
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  await tap('Files');
  await tap('Download as JSON');
  await tap('Download as SVG');
  await sleep(1500);
  const got = readdirSync(downloads).sort();
  check('both files download', got.join(' ') === 'my-design.json my-design.svg', got.join(' '));
  const saved = got.includes('my-design.json') ? JSON.parse(readFileSync(join(downloads, 'my-design.json'), 'utf8')) : {};
  check('the JSON holds the boxes, the arrow and the prompt', saved.shapes?.length === 2 && saved.arrows?.[0]?.label === 'SQL' && saved.prompt === 'url-shortener');
  check('the SVG is a picture of the same design', got.includes('my-design.svg') && /<svg[\s\S]*SQL[\s\S]*<\/svg>/.test(readFileSync(join(downloads, 'my-design.svg'), 'utf8')));
  const importFile = async (path) => {
    const { result } = await send('Runtime.evaluate', { expression: `document.querySelector('.pg-files input[type=file]')` });
    await send('DOM.setFileInputFiles', { files: [path], objectId: result.objectId });
    await sleep(600);
  };
  if (got.includes('my-design.json')) {
    await importFile(join(downloads, 'my-design.json'));
    check('importing it adds it as a new design', (await evaluate(`document.querySelectorAll('.pg-bar option').length`)) === 2 && (await counts()) === '2/1' && /^Imported “My design”/.test(await text('.pg-status')), await text('.pg-status'));
  }
  const bad = join(downloads, 'bad.json');
  writeFileSync(bad, JSON.stringify({ version: 1, name: 'x', shapes: [{ id: 's1', kind: 'rocket', x: 0, y: 0, width: 140, height: 60, label: '' }], arrows: [] }));
  await importFile(bad);
  check('a bad file is refused with the reason, and nothing changes', (await text('.pg-status')) === "That file can't be imported: shape s1 has an unknown kind. Nothing was changed." && (await evaluate(`document.querySelectorAll('.pg-bar option').length`)) === 2, await text('.pg-status'));

  await viewport(1280, 800, false);
  await media('no-preference', 'dark');
  await load(url + '#/playground');
  await sleep(500);
  await evaluate(`document.querySelector('.pg-text').open = true`);
  await tapSel('.pg-text li button', 1);
  const kx = await shapeX(1);
  await evaluate(`document.querySelector('.pg-canvas').focus()`);
  const key = async (k, code, vk, mods = 0) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods });
    await sleep(150);
  };
  await key('ArrowRight', 'ArrowRight', 39);
  check('keyboard: an arrow key nudges the selected box', (await shapeX(1)) === kx + 20);
  await key('Delete', 'Delete', 46);
  check('keyboard: Delete removes it', (await counts()) === '1/0');
  await key('z', 'KeyZ', 90, 2);
  check('keyboard: Ctrl+Z undoes', (await counts()) === '2/1');
  await layoutChecks('playground (desktop)');
  await shot('playground-desktop-dark');

  async function scrollToCanvas() {
    await evaluate(`document.querySelector('.pg-canvas').scrollIntoView({ block: 'center' })`);
    await sleep(150);
  }
}

if (mode === 'workshop') {
  // One guided problem end to end by touch: notes, hints, the outline editor, the order and
  // select checks, resuming after a reload, XP, and the two-column layout on desktop.
  await viewport(360, 740, true);
  await media('reduce');
  const typeInto = async (selector, value, n = 0) => {
    await tapSel(selector, n);
    await send('Input.insertText', { text: value });
    await sleep(150);
  };
  const lastStep = () => evaluate(`[...document.querySelectorAll('.workshop-step')].at(-1)?.dataset.stage`);
  await load(url + '#/practice/logic/second-largest');
  await sleep(800);
  check('a guided problem opens with the problem and step 1', /^Given a list of numbers, return the second largest distinct value/.test(await text('.problem p')) && (await lastStep()) === 'understand', await text('.problem p'));
  await typeInto('.workshop-step textarea', 'In: numbers. Out: biggest value below the max.');
  check('notes collect in "My workspace"', (await text('.workspace .ws-row p')) === 'In: numbers. Out: biggest value below the max.', await text('.workspace .ws-row p'));
  await tap('Show a hint (1 of 2)');
  check('hints come one at a time', (await evaluate(`document.querySelectorAll('.hint-list li').length`)) === 1 && !!(await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent === 'Another hint (2 of 2)')`)));
  await tap('Return the second item of the list');
  await tap('The largest value that is smaller than the maximum; None if there is none');
  check('after the right answer, the expert’s version appears', /^An expert’s version: In: a list of numbers/.test(await evaluate(`document.querySelector('.expert').textContent`)));
  await layoutChecks('workshop step 1 (360px)');
  await tap('Next step');
  await tap('3: the smaller of the two');
  await tap('Next step');
  check('step 3 is the breakdown, with an outline editor', (await lastStep()) === 'breakdown' && !!(await evaluate(`document.querySelector('.outline-add input')`)));
  await typeInto('.outline-add input', 'Loop over the list');
  await tap('Add');
  await typeInto('.outline-add input', 'Update best and second');
  await tap('Add');
  await tap('Indent “Update best and second”', 'label');
  await typeInto('.outline-add input', 'Remember best and second');
  await tap('Add');
  await tap('Move “Remember best and second” up', 'label');
  await tap('Outdent “Remember best and second”', 'label');
  const outline = () => evaluate(`[...document.querySelectorAll('.workshop-step .outline-row')].map((r) => r.style.getPropertyValue('--depth').trim() + ':' + r.querySelector('.outline-text').textContent).join(' | ')`);
  check('the outline can be built, indented, moved and outdented by tap', (await outline()) === '0:Loop over the list | 0:Remember best and second | 1:Update best and second', await outline());
  check('the workspace shows the outline', (await evaluate(`[...document.querySelectorAll('.workspace .outline li')].map((l) => l.textContent).join(' | ')`)) === 'Loop over the list | Remember best and second | Update best and second');
  await layoutChecks('workshop outline (360px)');
  await shot('workshop-outline');
  // Tap the parts in the (deliberately shuffled) order they're shown: never the right order.
  const poolCount = await evaluate(`document.querySelectorAll('.order-pool button').length`);
  for (let k = 0; k < poolCount; k++) await tapSel('.order-pool button', 0);
  await tap('Check the order');
  check('a wrong order gets a hint, not a penalty', /what must already exist/.test(await text('.order-check .feedback')));
  for (let k = 0; k < poolCount; k++) await tap('Undo');
  for (const part of ['Decide what to remember: the best and the second best so far', 'Start both as None (nothing seen yet)', 'For each number, update the best and the second best', 'Return the second best (None if it was never set)']) await tap(part);
  await tap('Check the order');
  check('the right order passes and explains why', /That fixes the order/.test(await text('.order-check .feedback')) && (await text('.order-check .reward')) === '+5 XP, after a retry', await text('.order-check .reward'));
  await tap('Next step');
  await load(url + '#/practice/logic/second-largest');
  await sleep(800);
  check('after a reload it resumes at step 4, with notes and outline kept', (await lastStep()) === 'logic' && (await evaluate(`document.querySelectorAll('.workshop-step.done').length`)) === 3 && (await evaluate(`document.querySelector('.workshop-step textarea').value`)) === 'In: numbers. Out: biggest value below the max.' && (await outline()) === '0:Loop over the list | 0:Remember best and second | 1:Update best and second');
  await tap('Nothing: 9 equals the best, and the second best must be smaller than the best');
  await tap('Next step');
  await tap('[]');
  await tap('Check');
  check('select: a partial pick says how many are missing', /3 to add/.test(await text('.select-check .feedback')), await text('.select-check .feedback'));
  for (const c of ['[7]', '[5, 5]', '[4, 9, 7, 9]']) await tap(c);
  await tap('Check');
  check('select: the right picks pass, and every case is explained', (await evaluate(`document.querySelectorAll('.case-why li').length`)) === 6);
  await layoutChecks('workshop edge cases (360px)');
  await tap('Next step');
  await tap('Show the expert’s version');
  check('the last step ends with Done', (await text('.practice-done h3')) === 'Done ✓');
  await shot('workshop-done');
  await load();
  // Retry 5 + 10 + retry 5 + 10 + retry 5.
  check('XP from the graded checks only', (await text('.hud-stats')) === 'Level2XP35 / 80Streak0 daysCoins0', await text('.hud-stats'));

  // Backups carry the workshop: export, lose the notes on this device, import, and they're back.
  const downloads = join(outDir, 'workshop-downloads');
  rmSync(downloads, { recursive: true, force: true });
  mkdirSync(downloads, { recursive: true });
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  await load(url + '#/settings');
  await tap('Export backup');
  await sleep(1500);
  const file = readdirSync(downloads).find((f) => f.endsWith('.json'));
  const backup = file ? JSON.parse(readFileSync(join(downloads, file), 'utf8')) : {};
  check('the backup file holds the workshop notes and outline', backup.workshop?.['second-largest']?.notes?.['0'] === 'In: numbers. Out: biggest value below the max.' && backup.workshop['second-largest'].outline.length === 3, JSON.stringify(backup.workshop ?? null).slice(0, 120));
  await evaluate(`localStorage.removeItem('logic-quest:p:p1:workshop')`);
  await load(url + '#/settings');
  const importFile = async () => {
    const { result } = await send('Runtime.evaluate', { expression: `document.querySelector('input[type=file]')` });
    await send('DOM.setFileInputFiles', { files: [join(downloads, file)], objectId: result.objectId });
    await sleep(500);
  };
  if (file) {
    await importFile();
    check('import offers the workshop notes back, and no progress twice', (await text('.backup-status')).startsWith('This file has workshop notes for 1 problem.'), await text('.backup-status'));
    await tap('Merge');
    await importFile();
    check('importing it again adds nothing', (await text('.backup-status')) === 'Everything in that file is already here. Nothing to add.', await text('.backup-status'));
    await load(url + '#/practice/logic/second-largest');
    await sleep(800);
    check('the problem resumes with the imported notes and outline', (await evaluate(`document.querySelector('.workshop-step textarea').value`)) === 'In: numbers. Out: biggest value below the max.' && (await outline()) === '0:Loop over the list | 0:Remember best and second | 1:Update best and second', await outline());
  }
  await viewport(1280, 800, false);
  await media('no-preference', 'dark');
  await load(url + '#/practice/logic/second-largest');
  await sleep(800);
  const cols = await evaluate(`(() => { const s = document.querySelector('.workshop-steps').getBoundingClientRect(); const w = document.querySelector('.workspace').getBoundingClientRect(); return w.left > s.right - 1 && Math.abs(w.top - s.top) < 2; })()`);
  check('desktop: "My workspace" sits beside the steps', cols);
  await layoutChecks('workshop (desktop)');
  await shot('workshop-desktop-dark');
}

if (mode === 'update') {
  // What a phone sees after a deploy. DIST_DIR is the served dist/ folder; this edits it to
  // simulate a new release, so rebuild afterwards (npm run build).
  const dist = process.env.DIST_DIR;
  if (!dist) throw new Error('update mode needs DIST_DIR (the served dist/ folder)');
  await viewport(360, 740, true);
  await load();
  await evaluate('navigator.serviceWorker.ready.then(() => true)');
  await load();
  check('installed: the page is served by the service worker', await evaluate('!!navigator.serviceWorker.controller'));

  // A deploy that changes the page: opening the app again must show it, not the cached copy.
  const indexPath = join(dist, 'index.html');
  const original = readFileSync(indexPath, 'utf8');
  writeFileSync(indexPath, original.replace('<head>', '<head><meta name="lq-deploy" content="2">'));
  await load();
  check('after a deploy, reopening the app shows the new version', (await evaluate(`document.querySelector('meta[name="lq-deploy"]')?.content ?? null`)) === '2');

  // A deploy that changes the service worker while the app stays open: offer a reload.
  const swPath = join(dist, 'sw.js');
  writeFileSync(swPath, readFileSync(swPath, 'utf8').replace(/const VERSION = "([0-9a-f]+)"/, 'const VERSION = "$1-next"'));
  // The app checks for updates when it comes back to the front.
  await evaluate(`Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange'))`);
  let banner = false;
  for (let i = 0; i < 40 && !banner; i++) {
    await sleep(250);
    banner = await evaluate(`!!document.querySelector('.update-banner')`);
  }
  check('a new version arriving while the app is open shows a Reload banner', banner);
  if (banner) {
    await shot('update-banner');
    await tap('Reload');
    await sleep(800);
    check('Reload loads the new version, and the banner is gone', !(await evaluate(`!!document.querySelector('.update-banner')`)) && (await evaluate(`document.querySelector('meta[name="lq-deploy"]')?.content ?? null`)) === '2');
  }
  // Offline still works after all that.
  await send('Network.enable');
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await load();
  check('offline: the app still opens from the cache', (await text('h2')) === 'Lessons');
}

const errors = [];
for (const e of events) {
  if (e.method === 'Runtime.exceptionThrown') errors.push(e.params.exceptionDetails.exception?.description);
  if (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') errors.push(`${e.params.entry.text} ${e.params.entry.url ?? ''}`);
}
check('no page errors', errors.length === 0, errors.join(' | '));
await quit();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed. Screenshots: ${outDir}`);
process.exit(failed ? 1 : 0);

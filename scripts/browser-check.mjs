// Headless Chrome checks for phone and desktop layouts, touch-only use, and offline/PWA.
// No dependencies: talks to Chrome over the DevTools protocol with Node's built-in WebSocket.
//
//   npm run build && npm run preview          (in another terminal)
//   node scripts/browser-check.mjs [ui|pwa|persist|lessons|update|sim|design|agent] [url] [screenshot-dir]
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
    check('import previews only what is new', (await text('.backup-status')).startsWith('This file has 1 new item.'), await text('.backup-status'));
    await tap('Merge 1 item');
    check('merge adds it once: +10 XP for the newly completed lesson', (await text('.backup-status')) === 'Merged 1 item into your progress.');
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

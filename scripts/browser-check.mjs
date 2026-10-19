// Headless Chrome checks for phone and desktop layouts, touch-only use, and offline/PWA.
// No dependencies: talks to Chrome over the DevTools protocol with Node's built-in WebSocket.
//
//   npm run build && npm run preview          (in another terminal)
//   node scripts/browser-check.mjs [ui|pwa|persist] [url] [screenshot-dir]
//
// CHROME_PATH overrides where Chrome is found. On WSL in NAT mode, WSL cannot reach a Windows
// Chrome's debug port, so run this file with a Windows node.exe instead (see docs/PROGRESS.md).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const mode = process.argv[2] ?? 'ui';
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

// Tap the n-th element matching a CSS selector.
const tapSel = async (selector, n = 0) => {
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

const layoutChecks = async (label) => {
  const m = await evaluate(`(() => {
    const targets = [...document.querySelectorAll('button, summary, a')].filter((b) => b.offsetParent)
      .map((b) => b.getBoundingClientRect()).map((r) => [Math.round(r.width), Math.round(r.height)]);
    const svg = document.querySelector('svg');
    const labelPx = svg ? +(parseFloat(getComputedStyle(svg.querySelector('text')).fontSize) * svg.getBoundingClientRect().width / 420).toFixed(1) : null;
    // Every node label must fit inside its box (8 units of padding).
    const overflow = [...document.querySelectorAll('svg .node')].filter((g) => g.querySelector('text').getBBox().width > g.querySelector('rect').getBBox().width - 8).map((g) => g.textContent);
    return { vw: document.documentElement.clientWidth, scrollW: document.documentElement.scrollWidth, targets, labelPx, overflow };
  })()`);
  check(`${label}: no horizontal scroll`, m.scrollW <= m.vw, `scrollWidth ${m.scrollW}, viewport ${m.vw}`);
  const small = m.targets.filter(([w, h]) => w < 48 || h < 48);
  check(`${label}: tap targets >= 48px`, small.length === 0, `${m.targets.length} targets${small.length ? ', too small: ' + JSON.stringify(small) : ''}`);
  if (m.labelPx !== null) {
    check(`${label}: diagram labels >= 14px`, m.labelPx >= 14, `~${m.labelPx}px`);
    check(`${label}: labels fit inside their boxes`, m.overflow.length === 0, m.overflow.join(', '));
  }
};

if (mode !== 'persist') await launch();

if (mode === 'ui') {
  // Home screen and navigation, including what the Android back button does.
  await viewport(360, 740, true);
  await media('reduce');
  await load();
  await layoutChecks('home-360');
  await shot('home-360');
  const titles = await evaluate(`[...document.querySelectorAll('.lesson-title')].map((t) => t.textContent)`);
  check('home lists the 4 lessons in order', JSON.stringify(titles) === JSON.stringify(['Hello, request', 'Load balancer', 'Cache', 'AI agent loop']), titles.join(', '));
  check('no "← Lessons" button on home', !(await evaluate(`!!document.querySelector('.nav-back').offsetParent`)));
  await tapSel('.lesson-card', 2);
  check('tapping a card opens that lesson', (await hash()) === '#/lesson/cache' && (await text('h2')) === 'Cache');
  await browserBack();
  check('back button returns to the list', (await hash()) === '#/' && (await text('h2')) === 'Lessons');
  await tapSel('.lesson-card', 1);
  await tap('← Lessons');
  check('"← Lessons" returns to the list', (await text('h2')) === 'Lessons');
  await tapSel('.lesson-card', 1);
  await tap('Go to step 5', 'label');
  await tap('Take the quiz');
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
  await tap('Take the quiz');
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
  await tap('Take the quiz');
  await tap('The browser, by sending a request');
  check('replay says already scored, no new XP', (await text('.reward')).startsWith('Already scored.'), await text('.reward'));
  await load(url + '#/lesson/load-balancer');
  await tap('Go to step 5', 'label');
  await tap('Take the quiz');
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
  await tap('2 lessons a day', 'label');
  check('daily goal can be raised', (await evaluate(`document.querySelector('[aria-label="2 lessons a day"]').getAttribute('aria-pressed')`)) === 'true' && (await text('.hud-today')).startsWith('Today: 1 / 2'));
  await tap('1 lesson a day', 'label');
  await tap('Calm mode: off');
  check('calm mode turns on', (await evaluate(`!!document.querySelector('[aria-pressed="true"]') && [...document.querySelectorAll('button')].some((b) => b.textContent === 'Calm mode: on')`)));
  await load(url + '#/lesson/cache');
  await tap('Go to step 5', 'label');
  await tap('Take the quiz');
  await tap('Users may see the old profile');
  const calmLines = await evaluate(`[...document.querySelectorAll('.reward span')].map((s) => s.textContent)`);
  // 20 + 5 XP so far, +10 here crosses the level-2 threshold (30).
  check('calm mode: reward as text (with the level-up), no pop-up', JSON.stringify(calmLines) === JSON.stringify(['+10 XP, first try', 'Level up!']) && !(await evaluate(`!!document.querySelector('.toast')`)), JSON.stringify(calmLines));
  await load(url + '#/progress');
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
  const xpBefore = await text('.hud-stats');
  const importFile = async (path) => {
    const { result } = await send('Runtime.evaluate', { expression: `document.querySelector('input[type=file]')` });
    await send('DOM.setFileInputFiles', { files: [path], objectId: result.objectId });
    await sleep(500);
  };
  if (backupOk) {
    const backup = JSON.parse(readFileSync(exported, 'utf8'));
    check('backup holds the events and settings', backup.app === 'logic-quest' && backup.version === 1 && backup.events.length > 0);
    await importFile(exported);
    check('importing the same backup adds nothing', (await text('.backup-status')) === 'Everything in that file is already here. Nothing to add.' && (await text('.hud-stats')) === xpBefore);
    const extra = { id: 'imported-1', type: 'complete', at: new Date().toISOString(), day: today, lesson: 'agent-loop' };
    const merged = join(downloads, 'with-extra.json');
    writeFileSync(merged, JSON.stringify({ ...backup, events: [...backup.events, extra] }));
    await importFile(merged);
    check('import previews only what is new', (await text('.backup-status')).startsWith('This file has 1 new item.'), await text('.backup-status'));
    await tap('Merge 1 item');
    check('merge adds it once: +10 XP for the newly completed lesson', (await text('.backup-status')) === 'Merged 1 item into your progress.');
    const xpAfter = await text('.hud-stats');
    await importFile(merged);
    check('importing the merged file again adds nothing', (await text('.backup-status')) === 'Everything in that file is already here. Nothing to add.' && (await text('.hud-stats')) === xpAfter, `${xpBefore} -> ${xpAfter}`);
    const bad = join(downloads, 'bad.json');
    writeFileSync(bad, '{"version": 1, "events": [{"id": "x"}]}');
    await importFile(bad);
    check('a bad file is rejected with a reason', (await text('.backup-status')).startsWith("That file can't be imported: event 1 is invalid"), await text('.backup-status'));
  }
  await layoutChecks('progress-360 after import');
  await browserBack();
  check('back from progress returns to the list', (await text('h2')) === 'Lessons');
  await load(url + '#/progress');
  await browserBack();
  check('back from a progress deep link goes to the list', (await text('h2')) === 'Lessons');

  // Every lesson: layout, labels, and a walk through all steps to the quiz.
  for (const id of ['load-balancer', 'cache', 'agent-loop']) {
    await load(url + '#/lesson/' + id);
    await layoutChecks(`${id}-360`);
    await shot(`${id}-360-step1`);
    const steps = await evaluate(`document.querySelectorAll('.dot').length`);
    for (let k = 1; k < steps; k++) await tap('Next');
    await shot(`${id}-360-last`);
    await tap('Take the quiz');
    check(`${id}: quiz opens with question 1 of 2`, (await text('.quiz-count')) === 'Question 1 of 2');
  }

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
  await tap('Take the quiz');
  check('quiz appears after the last step', await evaluate(`!document.querySelector('.quiz').hidden`));
  check('"Take the quiz" is disabled while the quiz is open', await evaluate(`document.querySelector('.controls .primary').disabled`));
  await tap('The server, by sending the page when it is ready');
  check('wrong answer explains why', (await text('.feedback')).startsWith("Not in HTTP's basic model"));
  await shot('phone-360-2-wrong');
  await tap('Replay the steps');
  check('Replay the steps → step 1 playing, quiz hidden', (await text('.step-label')) === 'Step 1 of 2' && (await evaluate(`document.querySelector('.quiz').hidden`)));
  await tap('Pause');
  await tap('Go to step 2', 'label');
  await tap('Take the quiz');
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
  await tap('Take the quiz');
  await tap('The browser, by sending a request');
  await load();
  check('day 1: one lesson done', (await stats()) === 'Level1XP20 / 30Streak1 dayCoins5', await stats());
  await quit();

  await openOnDay(1);
  check('day 2, after closing the app: XP, streak and coins resume', (await stats()) === 'Level1XP20 / 30Streak1 dayCoins5', await stats());
  check('day 2: today starts fresh', (await text('.hud-today')) === 'Today: 0 / 1. Finish 1 lesson today to grow your streak. Missing today uses your buffer (−15 coins).', await text('.hud-today'));
  check('day 2: finished lesson still marked done', (await evaluate(`document.querySelectorAll('.lesson-card.done').length`)) === 1);
  await load(url + '#/progress');
  check('progress screen reports the storage protection state', /keep your progress|may clear it/.test(await text('.persist-state')), await text('.persist-state'));
  await load(url + '#/lesson/cache');
  await tap('Go to step 5', 'label');
  await tap('Take the quiz');
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

// Headless Chrome checks for phone and desktop layouts, touch-only use, and offline/PWA.
// No dependencies: talks to Chrome over the DevTools protocol with Node's built-in WebSocket.
//
//   npm run build && npm run preview          (in another terminal)
//   node scripts/browser-check.mjs [ui|pwa] [url] [screenshot-dir]
//
// CHROME_PATH overrides where Chrome is found. On WSL in NAT mode, WSL cannot reach a Windows
// Chrome's debug port, so run this file with a Windows node.exe instead (see docs/PROGRESS.md).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
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
const chrome = spawn(process.env.CHROME_PATH ?? defaultChrome, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'lq-cdp-'))}`,
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  try {
    target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page');
  } catch {
    await sleep(200);
  }
}
if (!target) throw new Error('Could not reach Chrome. Set CHROME_PATH?');

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
const events = [];
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  } else events.push(msg);
});
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
const load = async (u = url) => {
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

const layoutChecks = async (label) => {
  const m = await evaluate(`(() => {
    const targets = [...document.querySelectorAll('button, summary, a')].filter((b) => b.offsetParent)
      .map((b) => b.getBoundingClientRect()).map((r) => [Math.round(r.width), Math.round(r.height)]);
    const svg = document.querySelector('svg');
    const labelPx = svg ? +(parseFloat(getComputedStyle(svg.querySelector('text')).fontSize) * svg.getBoundingClientRect().width / 420).toFixed(1) : null;
    return { vw: document.documentElement.clientWidth, scrollW: document.documentElement.scrollWidth, targets, labelPx };
  })()`);
  check(`${label}: no horizontal scroll`, m.scrollW <= m.vw, `scrollWidth ${m.scrollW}, viewport ${m.vw}`);
  const small = m.targets.filter(([w, h]) => w < 48 || h < 48);
  check(`${label}: tap targets >= 48px`, small.length === 0, `${m.targets.length} targets${small.length ? ', too small: ' + JSON.stringify(small) : ''}`);
  if (m.labelPx !== null) check(`${label}: diagram labels >= 14px`, m.labelPx >= 14, `~${m.labelPx}px`);
};

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');

if (mode === 'ui') {
  // Phone, reduced motion: walk every control by touch.
  await viewport(360, 740, true);
  await media('reduce');
  await load();
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
  await load();
  await layoutChecks('phone-landscape');
  await tap('Next');
  const cx = Number(await evaluate(`document.querySelector('.packet').getAttribute('cx')`));
  check('motion on: packet is mid-flight after Next', cx > 80 && cx < 340, `cx=${cx.toFixed(0)}`);

  await viewport(1280, 800, false);
  await media('no-preference');
  await load();
  await layoutChecks('desktop-1280');
  await shot('desktop-1280');

  await viewport(360, 740, true);
  await media('reduce', 'dark');
  await load();
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
  check('loads offline', !!(await text('h2')));
  await load(url + '?offline-deep-link=1');
  check('offline navigation with a query string still loads', !!(await text('h2')));
}

const errors = [];
for (const e of events) {
  if (e.method === 'Runtime.exceptionThrown') errors.push(e.params.exceptionDetails.exception?.description);
  if (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') errors.push(`${e.params.entry.text} ${e.params.entry.url ?? ''}`);
}
check('no page errors', errors.length === 0, errors.join(' | '));
ws.close();
chrome.kill();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed. Screenshots: ${outDir}`);
process.exit(failed ? 1 : 0);

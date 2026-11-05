#!/usr/bin/env node
/**
 * Scripted click-through of a web page at phone width, played in a throwaway Chrome window while you record the screen.
 *
 *   node run.cjs rehearse <promo.json>            headless, nothing on screen: runs every step, prints timings, saves stills
 *   node run.cjs check    <promo.json>            opens the real phone-size Chrome window for ~10 s (no recording), reports geometry
 *   node run.cjs play     <promo.json> [waitSecs] opens the window on a magenta calibration screen and waits for <workDir>/go, then holds the
 *                                                 magenta 2.5 s, plays the steps and prints "STOP RECORDING NOW". YOU record the whole screen
 *                                                 meanwhile (Prodoozie: Full Screen, Record). TAKES OVER THE SCREEN. waitSecs: how long to
 *                                                 wait for the go file (default 900).
 *
 * The window is a separate Chrome instance (own temp profile, started with `open -n` so it comes to the front) driven over the
 * DevTools port, so a browser extension's glow and indicators never reach the footage. The cursor and click ripple are a page-side
 * overlay, because DevTools clicks do not move the OS pointer. Nothing on the site is changed: the overlay lives in this throwaway
 * browser only.
 *
 * STEPS (promo.json "steps", run in order). An element is {css, nth?} or {text, tag?, exact?, nth?}; text matches the deepest element
 * whose textContent contains it (an inline link that wraps over two lines is aimed at its first line box).
 *   {"hold": ms}                       wait
 *   {"mark": "label"}                  timestamp (prints, appears in run.json, can trigger a still)
 *   {"cursor": true|false}             show/hide the cursor overlay
 *   {"scrollTo": {...element, "at": 470, "ms": 1200}}   eased scroll so the element's top sits `at` px from the viewport top
 *   {"scrollBy": {"px": 220, "ms": 1000}}
 *   {"click": {...element, "glideMs": 500, "settle": 120}}   glide the cursor to it (scrolling first if it is off screen), click
 *   {"point": {...element, "glideMs": 600, "dx": 0, "dy": 0}}   glide the overlay cursor to it WITHOUT clicking or moving the real pointer (no hover state,
 *                                       no link status bubble): "this button is here". dx/dy nudge the tip off the centre so it
 *                                       does not cover the label. The element must already be on screen.
 *   {"park": true}                     move the real pointer to the right margin, where no link is. Do this after a button click and
 *                                       before scrolling: a link that scrolls under a resting pointer shows Chrome's status bubble
 *   {"waitPath": "/path"} {"waitFor": "css"} {"waitText": "text"}
 *   {"goto": "https://..."}            full navigation
 *   {"key": "Enter"}
 *   {"blur": true}                     blur the focused element. After a link click Next.js moves focus to the new page's first link, and a
 *                                       site's "Skip to main content" link is drawn while it has focus: it would be in the footage. The
 *                                       element's text is noted (nothing is noted when nothing had focus)
 *   {"eval": "document.title"}         run a JS expression in the page; a result that is not undefined is noted. For the odd thing no step
 *                                       says (remove a banner, set a cookie) before it is worth a module
 *   {"module": "file.cjs"}             site-specific logic: module.exports = async (ctx) => {...} (ctx below); may return notes
 * ctx = { page, cfg, sleep, log(label), mark, clickEl(expr,opts), glide, rect, elExpr, scrollSettled, ensure }
 *   `await ctx.log(label)`: in a rehearsal it takes the label's still and the module waits for it, so the still-free total stays exact.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { loadConfig, resolveIn, requirePuppeteer, resolveUserAgent, recorderSeen, sleep } = require('./lib.cjs');

const [mode = 'rehearse', cfgPath, waitArg] = process.argv.slice(2);
if (!['rehearse', 'check', 'play'].includes(mode) || !cfgPath) {
  console.error('usage: node run.cjs rehearse|check|play <promo.json> [waitSecs]');
  process.exit(2);
}
const cfg = loadConfig(cfgPath);
const puppeteer = requirePuppeteer(cfg);
const W = cfg.viewport.width;
const H = cfg.viewport.height;
const marks = [];
const mark = label => marks.push({ label, t: Date.now() });

// ─── Page-side overlay (idempotent per document) ─────────────────────────────

const LIB = `(() => {
  if (window.__promo) return;
  const HIDE = ${JSON.stringify(cfg.hide)};
  const RIPPLE = ${JSON.stringify(cfg.brand.ripple || cfg.brand.accent)};
  const ease = k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const root = document.documentElement;
  const state = { x: 340, y: 700 };

  const el = document.createElement('div');
  el.id = '__promo_cursor';
  el.style.cssText = 'position:fixed;left:0;top:0;width:34px;height:34px;z-index:2147483646;pointer-events:none;opacity:0;will-change:transform;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))';
  el.innerHTML = '<svg width="34" height="34" viewBox="0 0 24 24" style="transform-origin:7px 4px"><path d="M5 3l14 8.5-6.2 1.4 3.7 6.6-2.6 1.5-3.7-6.6L5 20z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const svg = el.firstChild;

  const marker = document.createElement('div');
  marker.id = '__promo_marker';
  marker.style.cssText = 'position:fixed;inset:0;background:#ff00ff;z-index:2147483647;display:none';

  const place = () => { el.style.transform = 'translate(' + (state.x - 7) + 'px,' + (state.y - 4) + 'px)'; };
  root.appendChild(el);
  root.appendChild(marker);
  place();

  // A classic desktop scrollbar (grey thumb plus a ~15px gutter) shows in the window while a page scrolls, which makes a phone-width
  // video look like a desktop window. Hide it: a phone has none. Not only the page's: a card that scrolls sideways (a wide table)
  // drew its own thumb under the table, so every scroller. Headless Chrome draws no scrollbar, so only a real recording shows one.
  const bars = document.createElement('style');
  bars.textContent = '*{scrollbar-width:none}*::-webkit-scrollbar{display:none}';
  document.head.appendChild(bars);

  // Floating chrome that is not part of the story (feedback buttons and the like).
  const hideNoise = () => {
    if (!HIDE.length) return;
    for (const b of document.querySelectorAll('button,a')) {
      if (!HIDE.includes(b.textContent.trim())) continue;
      let n = b;
      while (n && n !== document.body && getComputedStyle(n).position !== 'fixed') n = n.parentElement;
      (n && n !== document.body ? n : b).style.display = 'none';
    }
  };
  setInterval(hideNoise, 200);
  hideNoise();

  window.__promo = {
    marker: on => { marker.style.display = on ? 'block' : 'none'; },
    show: on => { el.style.opacity = on ? '1' : '0'; },
    moveTo: (x, y, ms) => new Promise(res => {
      const x0 = state.x, y0 = state.y, t0 = performance.now();
      const step = t => {
        const k = Math.min(1, (t - t0) / ms), e = ease(k);
        state.x = x0 + (x - x0) * e; state.y = y0 + (y - y0) * e; place();
        k < 1 ? requestAnimationFrame(step) : res();
      };
      requestAnimationFrame(step);
    }),
    scrollTo: (y, ms) => new Promise(res => {
      const y0 = window.scrollY, t0 = performance.now();
      const step = t => {
        const k = Math.min(1, (t - t0) / ms);
        window.scrollTo({ top: y0 + (y - y0) * ease(k), behavior: 'instant' }); // 'instant': a site's CSS smooth-scroll would make each step mushy
        k < 1 ? requestAnimationFrame(step) : res();
      };
      requestAnimationFrame(step);
    }),
    pulse: () => {
      const r = document.createElement('div');
      r.style.cssText = 'position:fixed;width:56px;height:56px;border-radius:50%;border:4px solid ' + RIPPLE + ';z-index:2147483645;pointer-events:none;left:' + (state.x - 28) + 'px;top:' + (state.y - 28) + 'px';
      root.appendChild(r);
      r.animate([{ transform: 'scale(.25)', opacity: 0.95 }, { transform: 'scale(1.15)', opacity: 0 }], { duration: 520, easing: 'ease-out' }).onfinish = () => r.remove();
      svg.animate([{ transform: 'scale(1)' }, { transform: 'scale(.8)' }, { transform: 'scale(1)' }], { duration: 240 });
    },
  };
  document.addEventListener('mousedown', () => window.__promo.pulse(), true);
})()`;

const ensure = page => page.evaluate(LIB);

// ─── Element helpers ─────────────────────────────────────────────────────────

/** A page-side JS expression that evaluates to the element described by `spec`. */
function elExpr(spec) {
  if (typeof spec === 'string') spec = { css: spec };
  const nth = spec.nth || 0;
  if (spec.css) return `document.querySelectorAll(${JSON.stringify(spec.css)})[${nth}]`;
  if (spec.text) {
    const cmp = spec.exact ? `e.textContent.trim() === ${JSON.stringify(spec.text)}` : `e.textContent.includes(${JSON.stringify(spec.text)})`;
    // Deepest matches only, so a text search never returns <body> or a wrapper.
    return `(() => { const c = [...document.querySelectorAll(${JSON.stringify(spec.tag || '*')})].filter(e => ${cmp}); return c.filter(e => !c.some(o => o !== e && e.contains(o)))[${nth}]; })()`;
  }
  throw new Error('element spec needs css or text: ' + JSON.stringify(spec));
}

async function rect(page, expr) {
  return page.evaluate(expr => {
    const el = eval(expr);
    if (!el) return null;
    // An inline link that wraps has several line boxes; the centre of its bounding box can sit on plain text between them.
    const b = el.getClientRects()[0] || el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, top: b.top, bottom: b.bottom, vh: window.innerHeight };
  }, expr);
}

async function scrollSettled(page) {
  // A site's own smooth scroll (focus management, scrollIntoView) may still be moving: aim only once it stops.
  let last = -1;
  let same = 0;
  for (let i = 0; i < 24 && same < 2; i++) {
    const y = await page.evaluate(() => Math.round(window.scrollY));
    same = y === last ? same + 1 : 0;
    last = y;
    await sleep(35);
  }
}

const glide = async (page, x, y, ms) => {
  await page.evaluate((x, y, ms) => window.__promo.moveTo(x, y, ms), x, y, ms);
  await page.mouse.move(x, y);
};
const clickAt = async (page, x, y) => {
  await page.mouse.move(x, y);
  await sleep(80);
  await page.mouse.down();
  await sleep(60);
  await page.mouse.up();
};

/** Glide to an element's centre and click it; scrolls first if it is not comfortably on screen. */
async function clickEl(page, expr, { glideMs = 450, settle = 120, settleScroll = true } = {}) {
  if (settleScroll) await scrollSettled(page);
  let r = await rect(page, expr);
  if (!r) throw new Error('element not found: ' + expr);
  if (r.top < 90 || r.bottom > r.vh - 40) {
    const dy = r.y - r.vh * 0.55;
    await page.evaluate(dy => window.__promo.scrollTo(window.scrollY + dy, 500), dy);
    r = await rect(page, expr);
  }
  // Chrome draws a hovered link's URL in a status bubble at the bottom-left of the window (seen 2026-11-02, 1.3 s of the first take).
  // It is browser UI, so no CSS can hide it. The real pointer therefore never goes near a link: the overlay cursor glides to it and
  // the anchor is activated with el.click(). Buttons are fine: they have no bubble, and keep their real hover styling.
  const isLink = await page.evaluate(expr => !!eval(expr)?.closest('a[href]'), expr);
  if (isLink) {
    await page.evaluate((x, y, ms) => window.__promo.moveTo(x, y, ms), r.x, r.y, glideMs);
    await sleep(settle);
    await page.evaluate(expr => {
      window.__promo.pulse();
      eval(expr).click();
    }, expr);
    return;
  }
  await glide(page, r.x, r.y, glideMs);
  await sleep(settle);
  await clickAt(page, r.x, r.y);
}

// ─── Steps ───────────────────────────────────────────────────────────────────

async function runSteps(page, log) {
  const ctx = { page, cfg, sleep, log, mark, clickEl: (e, o) => clickEl(page, e, o), glide: (x, y, ms) => glide(page, x, y, ms), rect: e => rect(page, e), elExpr, scrollSettled: () => scrollSettled(page), ensure: () => ensure(page) };
  const notes = [];
  for (const [i, step] of cfg.steps.entries()) {
    const kind = Object.keys(step)[0];
    const v = step[kind];
    try {
      switch (kind) {
        case 'hold':
          await sleep(v);
          break;
        case 'mark':
          await log(v); // rehearse takes the still here, and the steps wait for it
          break;
        case 'cursor':
          await page.evaluate(on => window.__promo.show(on), !!v);
          break;
        case 'scrollTo': {
          const abs = await page.evaluate(expr => {
            const el = eval(expr);
            if (!el) return null;
            const b = el.getClientRects()[0] || el.getBoundingClientRect();
            return b.top + window.scrollY;
          }, elExpr(v));
          if (abs == null) throw new Error('element not found');
          await page.evaluate((y, ms) => window.__promo.scrollTo(y, ms), abs - (v.at ?? 470), v.ms ?? 1200);
          break;
        }
        case 'scrollBy':
          await page.evaluate((px, ms) => window.__promo.scrollTo(window.scrollY + px, ms), v.px, v.ms ?? 1000);
          break;
        case 'click':
          await clickEl(page, elExpr(v), { glideMs: v.glideMs ?? 500, settle: v.settle ?? 120 });
          break;
        case 'point': {
          const r = await rect(page, elExpr(v));
          if (!r) throw new Error('element not found');
          await page.evaluate((x, y, ms) => window.__promo.moveTo(x, y, ms), r.x + (v.dx ?? 0), r.y + (v.dy ?? 0), v.glideMs ?? 600);
          break;
        }
        case 'park':
          await page.mouse.move(W - 6, Math.round(H * 0.5));
          break;
        case 'waitPath':
          await page.waitForFunction(p => location.pathname === p, { timeout: 20000 }, v);
          await ensure(page);
          break;
        case 'waitFor':
          await page.waitForSelector(v, { timeout: 20000 });
          break;
        case 'waitText':
          await page.waitForFunction(t => document.body.innerText.includes(t), { timeout: 20000 }, v);
          break;
        case 'goto':
          await page.goto(v, { waitUntil: 'networkidle2', timeout: 60000 });
          await ensure(page);
          break;
        case 'key':
          await page.keyboard.press(v);
          break;
        case 'blur': {
          const was = await page.evaluate(() => {
            const a = document.activeElement;
            if (!a || a === document.body || !a.blur) return null;
            const label = (a.textContent || a.getAttribute('aria-label') || a.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
            a.blur();
            return label;
          });
          if (was !== null) notes.push({ blur: was });
          break;
        }
        case 'eval': {
          const out = await page.evaluate(String(v));
          if (out !== undefined) notes.push({ eval: String(v).slice(0, 60), out });
          break;
        }
        case 'module': {
          const fn = require(resolveIn(cfg, v));
          const out = await (fn.default || fn)(ctx);
          if (out !== undefined) notes.push({ module: v, out });
          break;
        }
        default:
          throw new Error('unknown step kind');
      }
    } catch (e) {
      throw new Error(`step ${i + 1} ${JSON.stringify(step)}: ${e.message}`);
    }
  }
  return notes;
}

// ─── Browser setup ───────────────────────────────────────────────────────────

function waitForPort(port, ms) {
  const end = Date.now() + ms;
  return new Promise((resolve, reject) => {
    const tryOnce = () =>
      http
        .get({ host: '127.0.0.1', port, path: '/json/version', timeout: 1000 }, res => {
          res.resume();
          resolve();
        })
        .on('error', () => (Date.now() > end ? reject(new Error('Chrome DevTools port never opened')) : setTimeout(tryOnce, 250)));
    tryOnce();
  });
}

/** The .app that `chrome` (the executable inside it) belongs to, so a CHROME_PATH other than the default is the one that opens. */
const chromeApp = () => cfg.chrome.match(/^(.*?\.app)(\/|$)/)?.[1] || 'Google Chrome';

async function openWindow(dir) {
  execFileSync('open', [
    '-n',
    '-a',
    chromeApp(),
    '--args',
    `--user-data-dir=${dir}`,
    `--remote-debugging-port=${cfg.port}`,
    '--no-first-run',
    '--no-default-browser-check',
    // CalculateNativeWinOcclusion off: a window another app (the recorder's Ready screen) partly covers keeps rendering and animating.
    '--disable-features=Translate,MediaRouter,CalculateNativeWinOcclusion',
    // Open on a blank data: page, not on cfg.start: prime() navigates once the user agent is set. Opening on the start page made a load of its
    // own before the override, without the marker (and one more than needed). Not about:blank: Chrome refuses it as an app and opens a New Tab page.
    '--app=data:text/html,<title>promo</title>',
    `--window-size=${W},${H + 28}`,
    `--window-position=${cfg.window.left},${cfg.window.top}`,
  ]);
  await waitForPort(cfg.port, 20000);
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${cfg.port}`, defaultViewport: null });
  const host = new URL(cfg.start).host;
  let page;
  for (let i = 0; i < 40 && !page; i++) {
    page = (await browser.pages()).find(p => p.url().startsWith('data:text/html') || p.url().includes(host));
    if (!page) await sleep(250);
  }
  if (!page) {
    await browser.close().catch(() => {}); // do not leave a stray Chrome window (and its DevTools port) behind: a retry would connect to it
    throw new Error('app window never appeared');
  }
  return { browser, page };
}

async function fitWindow(page) {
  const cdp = await page.createCDPSession();
  const { windowId } = await cdp.send('Browser.getWindowForTarget');
  for (let i = 0; i < 4; i++) {
    const g = await page.evaluate(() => ({ iw: innerWidth, ih: innerHeight, ow: outerWidth, oh: outerHeight }));
    if (g.iw === W && g.ih === H) return g;
    await cdp.send('Browser.setWindowBounds', {
      windowId,
      bounds: { left: cfg.window.left, top: cfg.window.top, width: W + (g.ow - g.iw), height: H + (g.oh - g.ih) },
    });
    await sleep(400);
  }
  return page.evaluate(() => ({ iw: innerWidth, ih: innerHeight, ow: outerWidth, oh: outerHeight }));
}

async function dismissBanners(page) {
  // Click each configured button text once, in this throwaway profile. Pick the privacy-preserving option ("Necessary Only").
  // Returns { clicked, reload }: reload is true only when a clicked button is still on screen afterwards, i.e. the banner needs the next
  // load to go away. A banner that unmounts on the click needs nothing more, and one that navigated has already loaded the page again.
  let clicked = false;
  for (const text of cfg.dismiss) {
    const hit = await page.evaluate(t => {
      const b = [...document.querySelectorAll('button,a,[role=button]')].find(x => x.textContent.trim() === t);
      if (!b) return false;
      (window.__promoDismissed = window.__promoDismissed || []).push(b);
      b.click();
      return true;
    }, text);
    clicked = clicked || hit;
  }
  if (!clicked) return { clicked, reload: false };
  await sleep(600);
  try {
    const reload = await page.evaluate(() => window.__promoDismissed.some(b => b.isConnected && b.getClientRects().length > 0 && getComputedStyle(b).visibility !== 'hidden'));
    return { clicked, reload };
  } catch {
    // The click navigated: the old document is gone. Wait for the new one and use it as it is.
    await page.waitForFunction('document.readyState === "complete"', { timeout: 30000 }).catch(() => {});
    await ensure(page);
    return { clicked, reload: false };
  }
}

async function prime(page) {
  const ua = await resolveUserAgent(page.browser(), cfg);
  if (ua) await page.setUserAgent(ua);
  await page.goto(cfg.start, { waitUntil: 'networkidle2', timeout: 60000 });
  await ensure(page);
  // One load of the start page. A second one only when a clicked cookie banner is still showing (it was a load a visit counter sees).
  const { clicked, reload } = cfg.dismiss.length ? await dismissBanners(page) : { clicked: false, reload: false };
  if (reload) {
    await page.goto(cfg.start, { waitUntil: 'networkidle2', timeout: 60000 });
    await ensure(page);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  return clicked;
}

// ─── Modes ───────────────────────────────────────────────────────────────────

async function rehearse() {
  const browser = await puppeteer.launch({ headless: true, executablePath: cfg.chrome, defaultViewport: { width: W, height: H, deviceScaleFactor: 2 } });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 2 });
    console.log('banner dismissed:', await prime(page));
    const dir = path.join(cfg.workDir, 'rehearsal');
    fs.mkdirSync(dir, { recursive: true });
    const wanted = new Set(process.env.STILLS === '0' ? [] : cfg.stills);
    const t0 = Date.now();
    // A still is taken AT its mark, with the steps waiting for it, so the time it takes is known exactly and can be taken out of the total
    // (it used to be taken alongside the next step, which both raced that step and made the total depend on whether stills were on).
    let stillMs = 0;
    const log = async label => {
      mark(label);
      console.log(((Date.now() - t0) / 1000).toFixed(1).padStart(5), label);
      if (wanted.has(label)) {
        const s0 = Date.now();
        await page.screenshot({ path: path.join(dir, label.replace(/[^\w-]+/g, '-') + '.png') });
        stillMs += Date.now() - s0;
      }
    };
    const notes = await runSteps(page, log);
    const stepsMs = Date.now() - t0; // the steps, stills included
    await page.screenshot({ path: path.join(dir, 'final.png') });
    const stillsOn = process.env.STILLS !== '0';
    // stillFreeMs is the steps' length without the stills, the same whether this run took stills or not: it is the video's true length.
    const stillFreeMs = Math.max(0, stepsMs - stillMs);
    console.log('steps total', (stepsMs / 1000).toFixed(1), 's', stillsOn ? `(${(stillMs / 1000).toFixed(1)} s of it is stills; without them ${(stillFreeMs / 1000).toFixed(1)} s, which is the length of the video's moving part)` : '(no stills: true timing)');
    for (const n of notes) console.log(JSON.stringify(n));
    // totalMs is the steps with the stills included; stillFreeMs is the one `play` quotes.
    fs.writeFileSync(path.join(cfg.workDir, 'rehearsal.json'), JSON.stringify({ totalMs: stepsMs, stepsMs, stillMs, stillFreeMs, stillsOn, notes }, null, 2));
  } finally {
    await browser.close();
  }
}

function cleanup(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 6, retryDelay: 400 });
  } catch (e) {
    console.warn('could not remove', dir, '-', e.code);
  }
}

async function check() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promo-'));
  const { browser, page } = await openWindow(dir);
  try {
    await sleep(800);
    const fit = await fitWindow(page);
    const dismissed = await prime(page);
    const geo = await page.evaluate(() => ({ screenX, screenY, outerWidth, outerHeight, innerWidth, innerHeight, dpr: devicePixelRatio, screenW: screen.width, screenH: screen.height }));
    await page.evaluate(() => window.__promo.marker(true));
    await sleep(2500);
    console.log(JSON.stringify({ fit, geo, dismissed }));
  } finally {
    await browser.close().catch(() => {});
    await sleep(1500);
    cleanup(dir);
  }
}

/** Wait for the go file; resolves true when it appears, false after waitSecs. */
async function waitForGo(goFile, waitSecs) {
  const end = Date.now() + waitSecs * 1000;
  while (Date.now() < end) {
    if (fs.existsSync(goFile)) return true;
    await sleep(250);
  }
  return false;
}

/**
 * Raise the throwaway Chrome above whatever app is frontmost. page.bringToFront() does not do it across apps: when the go signal comes from
 * another window (the chat, a terminal), that window covers the top left of the screen and the recording would be of it, not of the page
 * (seen on the first real pass). The window is found by its own profile folder, so a Chrome of the person's own is never the one raised.
 * Uses System Events, which may ask once for permission to control it.
 */
function raiseWindow(dir) {
  try {
    const ps = execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    const main = ps.split('\n').find(l => l.includes(`--user-data-dir=${dir}`) && !l.includes('--type='));
    const pid = main && Number(main.trim().split(/\s+/)[0]);
    if (!pid) return 'could not find the window to raise';
    execFileSync('osascript', ['-e', `tell application "System Events" to set frontmost of (first process whose unix id is ${pid}) to true`], { stdio: 'pipe', timeout: 8000 });
    return null;
  } catch (e) {
    return `could not raise the window (${String(e.stderr || e.message).trim().split('\n')[0]}). If another window covers it, click the magenta window before you say go`;
  }
}

async function play() {
  const goFile = path.join(cfg.workDir, 'go');
  const waitSecs = Number(waitArg) || 900;
  // A go file or a run.json left by an earlier run must never be mistaken for this one's.
  fs.rmSync(goFile, { force: true });
  fs.rmSync(path.join(cfg.workDir, 'run.json'), { force: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promo-'));
  const { browser, page } = await openWindow(dir);
  try {
    await sleep(800);
    const fit = await fitWindow(page);
    await prime(page);
    const geo = await page.evaluate(() => ({ screenX, screenY, outerWidth, outerHeight, innerWidth, innerHeight, dpr: devicePixelRatio, screenW: screen.width, screenH: screen.height }));
    console.log('window', JSON.stringify({ fit, geo }));
    // Nothing is recorded yet, so say now what would make the recording unusable.
    const problems = [];
    if (geo.dpr !== 2) problems.push(`this display is ${geo.dpr}x and the layout assumes 2x (a Retina display): the recording would be soft and the crop checks would warn`);
    if (fit.iw !== W || fit.ih !== H) problems.push(`the window is ${fit.iw}x${fit.ih} and the viewport should be ${W}x${H}: the display is too small for the window, or the window was moved`);
    if (problems.length) throw new Error('not recording this: ' + problems.join('; ') + '. Run `node scripts/doctor.cjs` and see the Display lines.');
    await page.evaluate(() => window.__promo.marker(true)); // magenta: gives the exact crop rectangle and the cut frame in the take
    const tOpen = Date.now();
    let rough = '';
    try {
      const r = JSON.parse(fs.readFileSync(path.join(cfg.workDir, 'rehearsal.json'), 'utf8'));
      rough = ` The script itself takes about ${Math.round((r.stillFreeMs ?? r.totalMs) / 1000)} s.`;
    } catch {}
    console.log(
      [
        '',
        'WINDOW READY. It shows a magenta screen at the top left of the main display.',
        'Now, in the recorder: choose the whole screen (Prodoozie: Ready screen, Full Screen), press Record, wait out the 3-2-1,',
        'move the pointer to the far right edge of the screen, take your hands off the keyboard and mouse, and say "recording".',
        cfg.recorder === 'other' ? 'The recorder is "other": nobody checks that it is recording.' : 'When you say go, a take being written in Prodoozie\'s recordings folder is checked first; with no recording the script does not play.',
        `Waiting for ${goFile} (up to ${Math.round(waitSecs / 60)} min).${rough}`,
        '',
      ].join('\n'),
    );
    // A go without a recording is a script played into nothing: check the recorder is writing a take, and if not, wait for go again.
    const goBy = Date.now() + waitSecs * 1000;
    for (;;) {
      if (!(await waitForGo(goFile, Math.max(1, (goBy - Date.now()) / 1000)))) throw new Error(`no go file after ${waitSecs} s: nothing was played`);
      fs.rmSync(goFile, { force: true });
      const seen = recorderSeen(cfg);
      if (seen.ok) {
        if (seen.note) console.log('note:', seen.note);
        break;
      }
      console.log(`NOT PLAYING: ${seen.message} Start the recording (Prodoozie: Record, wait out the 3-2-1), then create ${goFile} again. The window stays on magenta.`);
    }
    await page.bringToFront();
    const raised = raiseWindow(dir);
    if (raised) console.log('WARNING:', raised);
    await sleep(600);
    console.log('GO. Hands off. Magenta for 2.5 s, then the script plays.');
    await sleep(2500); // magenta frames in the take: the crop box and the cut frame are read from them
    await page.evaluate(() => window.__promo.marker(false));
    const t0 = Date.now();

    const log = label => {
      mark(label);
      console.log(((Date.now() - t0) / 1000).toFixed(1).padStart(5), label);
    };
    const notes = await runSteps(page, log);
    const tEnd = Date.now();
    fs.writeFileSync(path.join(cfg.workDir, 'run.json'), JSON.stringify({ mode: 'play', t0, tEnd, tOpen, geo, marks, notes }, null, 2));
    console.log(`steps done, ${((tEnd - t0) / 1000).toFixed(1)} s. The window closes in 3 s.`);
    console.log('STOP RECORDING NOW (in the recorder, press Stop). Then wait for the take to be saved.');
    await sleep(3000);
  } finally {
    await browser.close().catch(() => {});
    await sleep(1500);
    cleanup(dir);
  }
}

(async () => {
  if (mode === 'rehearse') await rehearse();
  else if (mode === 'check') await check();
  else await play();
})().catch(e => {
  console.error(e.message || e);
  process.exit(1);
});

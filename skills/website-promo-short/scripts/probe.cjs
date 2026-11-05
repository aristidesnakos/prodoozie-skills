#!/usr/bin/env node
/**
 * node probe.cjs <url> [--out dir] [--dismiss "Necessary Only"] [--width 428] [--height 761] [--puppeteer-from path/to/package.json]
 *                     [--user-agent-marker "<marker>"] [--user-agent "<ua>"] [--config promo.json]
 *
 * Headless, nothing on screen. Loads the page at phone width (2x), dismisses a banner by button text if asked, saves
 * <out>/probe-top.png and prints the title, page height, any horizontal overflow, and every link and button with its absolute y
 * position and whether its text wraps over several lines (a wrapped inline link needs aiming at its first line).
 * Use it to pick the first page and the elements the storyboard clicks, and to see what floating chrome needs hiding.
 * Hrefs are printed shortened to 80 characters, so a page of long tracking links cannot push the useful lines off the top.
 *
 * --config promo.json  takes `userAgentMarker`, `userAgent`, `puppeteerFrom`, `viewport` and `dismiss` from a promo.json (a flag wins over
 *                      the file), so the probe loads the page the way `run.cjs` will.
 * --user-agent-marker  added to Chrome's own user agent (e.g. "my-site-promo/1.0"). Without one, headless Chrome sends "HeadlessChrome" and no
 *                      marker: set one when the site counts its visits and you need your own told apart or left out.
 * --user-agent         a full user-agent string instead.
 */
const fs = require('node:fs');
const path = require('node:path');
const { DEFAULTS, requirePuppeteer, resolveUserAgent } = require('./lib.cjs');

const args = process.argv.slice(2);
const url = args.find(a => /^https?:/.test(a));
const flag = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
if (!url) {
  console.error('usage: node probe.cjs <url> [--out dir] [--dismiss "text"] [--width 428] [--height 761] [--user-agent-marker "<marker>"] [--config promo.json]');
  process.exit(2);
}
const cfgFile = flag('--config', null);
const fileCfg = cfgFile ? JSON.parse(fs.readFileSync(path.resolve(cfgFile), 'utf8')) : {};
const W = Number(flag('--width', fileCfg.viewport?.width ?? 428));
const H = Number(flag('--height', fileCfg.viewport?.height ?? 761));
const out = path.resolve(flag('--out', '.'));
const dismiss = flag('--dismiss', null) ? [flag('--dismiss', null)] : fileCfg.dismiss || [];
const userAgent = flag('--user-agent', fileCfg.userAgent || null);
const userAgentMarker = flag('--user-agent-marker', fileCfg.userAgentMarker || null);
const puppeteerFrom = flag('--puppeteer-from', null)
  ? path.resolve(flag('--puppeteer-from'))
  : fileCfg.puppeteerFrom
    ? path.resolve(path.dirname(path.resolve(cfgFile)), fileCfg.puppeteerFrom)
    : DEFAULTS.puppeteerFrom;
const chrome = fileCfg.chrome || DEFAULTS.chrome;
const shorten = (s, n = 80) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
fs.mkdirSync(out, { recursive: true });

(async () => {
  const puppeteer = requirePuppeteer({ puppeteerFrom });
  const browser = await puppeteer.launch({ headless: true, executablePath: chrome, defaultViewport: { width: W, height: H, deviceScaleFactor: 2 } });
  try {
    const page = await browser.newPage();
    const ua = await resolveUserAgent(browser, { userAgent, userAgentMarker });
    if (ua) await page.setUserAgent(ua);
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 2 });
    console.log(ua ? `user agent: ${ua}` : 'user agent: headless default (the site sees "HeadlessChrome"; pass --user-agent-marker or --config if it counts visits)');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    for (const t of dismiss) {
      await page.evaluate(t => [...document.querySelectorAll('button,a,[role=button]')].find(x => x.textContent.trim() === t)?.click(), t);
      await new Promise(r => setTimeout(r, 600));
    }
    await page.screenshot({ path: path.join(out, 'probe-top.png') });
    const info = await page.evaluate(() => {
      const items = [...document.querySelectorAll('a[href],button')]
        .map(el => {
          const rects = el.getClientRects();
          const b = rects[0];
          if (!b || !b.width) return null;
          const fixed = (() => {
            for (let n = el; n && n !== document.body; n = n.parentElement) if (getComputedStyle(n).position === 'fixed') return true;
            return false;
          })();
          return { tag: el.tagName.toLowerCase(), text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 70), href: el.getAttribute('href') || '', y: Math.round(b.top + scrollY), lines: rects.length, fixed };
        })
        .filter(Boolean);
      return { title: document.title, docHeight: document.documentElement.scrollHeight, overflowX: document.documentElement.scrollWidth > innerWidth, items };
    });
    console.log(`${info.title}\nheight ${info.docHeight}px at ${W}px wide; horizontal overflow: ${info.overflowX}`);
    console.log('FIXED-position items (floating chrome: hide it via "hide" in promo.json):');
    for (const i of info.items.filter(i => i.fixed)) console.log(`  [${i.tag}] "${i.text}"`);
    console.log('links and buttons (y = px from page top; lines>1 = wrapped):');
    for (const i of info.items.filter(i => !i.fixed)) console.log(`  y=${String(i.y).padStart(5)} [${i.tag}] "${i.text}" ${shorten(i.href)}${i.lines > 1 ? `  (wraps over ${i.lines} lines)` : ''}`);
    console.log('screenshot:', path.join(out, 'probe-top.png'));
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error(e.message || e);
  process.exit(1);
});

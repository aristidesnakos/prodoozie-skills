#!/usr/bin/env node
/**
 * node render-assets.cjs <promo.json>
 *
 * Draws two 1080x1920 overlay images into <workDir>:
 *   frame.png    transparent rounded window for the screen capture, plus the URL pill above it (visible all video)
 *   endcard.png  the closing card: eyebrow, headline, sub, mascot, the URL large, footer
 *
 * Every word is HTML text drawn by Chromium (no image model draws text). The run refuses to write a card if the web
 * fonts did not load, rather than silently falling back to a system font.
 *
 * It also measures what it drew, in the page, once the fonts are in (px of the 1080 wide canvas, FIT below):
 *   - the headline: if its widest line is wider than the card allows, the type shrinks until it fits (down to 60%); past that it stops
 *     and says which measure failed;
 *   - the URL pill, the end card's URL box, the eyebrow and the footer: too wide stops the run with a message, because shrinking a URL
 *     below legibility is not a fix. Shorten `urlPath`, or leave it empty.
 * With no `endcard.mascot` the card has no empty band: the CTA follows the sub and the stack is centred above the footer.
 * Colours that are not brand fields of their own (grid lines, shadows, pill border) come from lib.cjs `look(brand)`.
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadConfig, resolveIn, requirePuppeteer, layout, look } = require('./lib.cjs');

// What each element of the overlays may measure, in px of the canvas width.
const FIT = { headline: 960, pill: 1000, urlBox: 960, eyebrow: 1000, footerRoom: 920, footerGap: 40, minHeadlineScale: 0.6 };

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A line is a string or an array of runs; a run is a string or {text, accent?, serif?}. */
function renderLine(line) {
  const runs = Array.isArray(line) ? line : [line];
  return runs
    .map(r => {
      if (typeof r === 'string') return esc(r);
      const cls = [r.accent ? 'accent' : '', r.serif ? 'serif' : ''].filter(Boolean).join(' ');
      return `<span class="${cls}">${esc(r.text)}</span>`;
    })
    .join('');
}

/** The card's fonts: `brand.fontsLink` (raw HTML for the <head>) when the faces are not on Google Fonts, otherwise the sans and serif families from Google Fonts. */
function fontsLink(brand) {
  if (brand.fontsLink) return brand.fontsLink;
  const fam = (name, weights) => `family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@${weights}`;
  const families = brand.sans === brand.serif ? [fam(brand.sans, '500;700;900')] : [fam(brand.sans, '500;700;900'), fam(brand.serif, '700;900')];
  return (
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    `<link href="https://fonts.googleapis.com/css2?${families.join('&')}&display=swap" rel="stylesheet">`
  );
}

function frameHtml(cfg, L) {
  const b = cfg.brand;
  const k = look(b);
  const { hole } = L;
  return `<!doctype html><html><head><meta charset="utf-8">${fontsLink(b)}<style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:1080px;height:1920px;overflow:hidden;background:transparent;position:relative;font-family:'${b.sans}',sans-serif;color:${b.ink}}
  .hole{position:absolute;left:${hole.x}px;top:${hole.y}px;width:${hole.w}px;height:${hole.h}px;border-radius:${hole.r}px;
    box-shadow:inset 0 0 0 3px ${k.ring},0 0 0 3000px ${b.cream}}
  /* The band must stack above the hole: the hole's huge shadow would otherwise paint over the pill. */
  .band{z-index:2;position:absolute;left:0;right:0;top:0;height:${hole.y}px;display:flex;align-items:center;justify-content:center}
  .pill{display:flex;align-items:center;gap:22px;height:104px;padding:0 44px;border-radius:52px;background:#fff;border:3px solid ${k.pillBorder};box-shadow:0 8px 24px ${k.pillShadow}}
  .dot{width:26px;height:26px;border-radius:50%;background:${b.accent}}
  .url{font-weight:900;font-size:50px;letter-spacing:-.5px;color:${b.ink};white-space:nowrap}
  .url b{color:${b.accentInk};font-weight:900}
</style></head><body>
  <div class="band"><div class="pill"><span class="dot"></span><span class="url">${esc(cfg.urlHost)}<b>${esc(cfg.urlPath || '')}</b></span></div></div>
  <div class="hole"></div>
</body></html>`;
}

function endHtml(cfg, mascotB64) {
  const b = cfg.brand;
  const e = cfg.endcard;
  const k = look(b);
  const mascot = mascotB64
    ? `<div class="mascotbox"><div class="circle"></div><div class="mascot"></div></div>`
    : '';
  const cta = `<div class="cta">
    <div class="label">${esc(e.ctaLabel)}</div>
    <div class="urlbox"><span>${esc(cfg.urlHost)}<b>${esc(cfg.urlPath || '')}</b></span></div>
  </div>`;
  return `<!doctype html><html><head><meta charset="utf-8">${fontsLink(b)}<style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:1080px;height:1920px;overflow:hidden;font-family:'${b.sans}',sans-serif;color:${b.ink}}
  body{background:${b.cream};position:relative;
    background-image:linear-gradient(${k.grid} 1px,transparent 1px),linear-gradient(90deg,${k.grid} 1px,transparent 1px);background-size:60px 60px}
  .stripe{position:absolute;left:0;top:0;bottom:200px;width:22px;background:${b.accent}}
  .wrap{position:absolute;left:0;right:0;top:0;bottom:200px;display:flex;flex-direction:column;align-items:center;padding-top:150px}
  .eyebrow{background:${b.accentInk};color:${b.cream};font-weight:900;font-size:40px;letter-spacing:6px;padding:20px 44px;border-radius:44px}
  h1{margin-top:56px;font-family:'${b.serif}',serif;font-weight:900;font-size:150px;line-height:1.02;text-align:center;letter-spacing:-2px}
  .accent{color:${b.accent}}
  .sub{margin-top:36px;font-weight:700;font-size:50px;line-height:1.35;text-align:center;color:${b.ink2}}
  .sub .serif{font-family:'${b.serif}',serif;font-weight:900;letter-spacing:10px;color:${b.ink}}
  .mascotbox{position:relative;margin-top:44px;width:470px;height:470px}
  .circle{position:absolute;inset:0;border-radius:50%;background:${b.sagePale}}
  .mascot{position:absolute;left:40px;top:14px;width:400px;height:400px;${mascotB64 ? `background:url(data:image/png;base64,${mascotB64}) center/contain no-repeat` : ''}}
  .cta{position:absolute;left:0;right:0;bottom:262px;display:flex;flex-direction:column;align-items:center;gap:26px}
  .label{font-weight:900;font-size:44px;letter-spacing:3px;color:${b.accentInk};text-transform:uppercase}
  .urlbox{background:#fff;border:5px solid ${b.accentInk};border-radius:64px;padding:30px 48px;box-shadow:0 12px 0 ${b.accentInk}}
  .urlbox span{font-weight:900;font-size:56px;letter-spacing:-1px;white-space:nowrap;color:${b.ink}}
  .urlbox b{color:${b.accentInk};font-weight:900}
  .foot{position:absolute;left:0;right:0;bottom:0;height:200px;background:${b.accentInk};display:flex;align-items:center;justify-content:space-between;padding:0 80px;color:${b.cream}}
  .foot .l{font-weight:700;font-size:34px;white-space:nowrap}
  .foot .r{font-weight:900;font-size:50px;white-space:nowrap}
  ${mascotB64 ? '' : '/* No mascot: no empty band. The CTA follows the sub and the stack is centred above the footer. */\n  .wrap{justify-content:center;padding-top:0}\n  .cta{position:static;margin-top:110px}'}
</style></head><body>
  <div class="stripe"></div>
  <div class="wrap">
    <div class="eyebrow">${esc(e.eyebrow)}</div>
    <h1>${e.headline.map(renderLine).join('<br>')}</h1>
    <p class="sub">${e.sub.map(renderLine).join('<br>')}</p>
    ${mascot}${mascotB64 ? '' : '\n    ' + cta}
  </div>
  ${mascotB64 ? cta : ''}
  <div class="foot"><span class="l">${esc(e.footerLeft)}</span><span class="r">${esc(e.footerRight)}</span></div>
</body></html>`;
}

/** Widths of the line boxes of an element, in the page (a line is a set of rects at about the same height). */
const LINES_JS = `window.__lines = el => {
  const r = document.createRange();
  r.selectNodeContents(el);
  const rows = new Map();
  for (const x of r.getClientRects()) {
    if (x.width < 0.5) continue;
    const key = Math.round(x.top / 40);
    const c = rows.get(key);
    rows.set(key, c ? { l: Math.min(c.l, x.left), r: Math.max(c.r, x.right) } : { l: x.left, r: x.right });
  }
  return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => Math.round(v.r - v.l));
}`;

/**
 * Measures the card in the page and returns { note, problems }. Shrinks the headline when its widest line is wider than FIT.headline.
 * A card that already fits is not touched, so every card that fitted before renders byte for byte as it did.
 */
async function fitEndcard(page, cfg) {
  await page.evaluate(LINES_JS);
  const m = await page.evaluate(
    (max, minScale) => {
      const h1 = document.querySelector('h1');
      const cs = getComputedStyle(h1);
      const base = parseFloat(cs.fontSize);
      const ls = parseFloat(cs.letterSpacing) || 0;
      let lines = window.__lines(h1);
      let size = base;
      for (let i = 0; i < 4 && Math.max(...lines) > max; i++) {
        size = Math.max(Math.floor(size * (max / Math.max(...lines)) * 0.99), Math.ceil(base * minScale));
        h1.style.fontSize = size + 'px';
        h1.style.letterSpacing = (ls * size) / base + 'px';
        lines = window.__lines(h1);
        if (size <= Math.ceil(base * minScale)) break;
      }
      const w = sel => document.querySelector(sel)?.getBoundingClientRect().width ?? 0;
      return { base, size, lines, urlBox: w('.urlbox'), eyebrow: w('.eyebrow'), footL: w('.foot .l'), footR: w('.foot .r') };
    },
    FIT.headline,
    FIT.minHeadlineScale,
  );
  const url = cfg.urlHost + (cfg.urlPath || '');
  const widest = Math.max(...m.lines);
  const problems = [];
  if (widest > FIT.headline) {
    problems.push(`endcard headline: its widest line is ${widest}px at ${m.size}px type and the card allows ${FIT.headline}px (the type was already shrunk to ${Math.round((m.size / m.base) * 100)}%). Shorten the line or split it over more lines: about 12 characters per line at 150px.`);
  }
  if (m.urlBox > FIT.urlBox) problems.push(`endcard URL box: "${url}" is ${Math.round(m.urlBox)}px wide and the card allows ${FIT.urlBox}px. Shorten urlPath or leave it empty.`);
  if (m.eyebrow > FIT.eyebrow) problems.push(`endcard eyebrow: "${cfg.endcard.eyebrow}" is ${Math.round(m.eyebrow)}px wide and the card allows ${FIT.eyebrow}px. Shorten it.`);
  if (m.footL + m.footR + FIT.footerGap > FIT.footerRoom) problems.push(`endcard footer: the two texts need ${Math.round(m.footL + m.footR + FIT.footerGap)}px and the bar has ${FIT.footerRoom}px. Shorten footerLeft or footerRight.`);
  const wrapped = m.lines.length > cfg.endcard.headline.length ? `; it wraps to ${m.lines.length} lines (you wrote ${cfg.endcard.headline.length})` : '';
  const shrunk = m.size < m.base ? `; shrunk from ${m.base}px to ${m.size}px to fit` : '';
  const note = `endcard: headline widest line ${widest}px of ${FIT.headline} at ${m.size}px${shrunk}${wrapped}; URL box ${Math.round(m.urlBox)}px of ${FIT.urlBox}`;
  return { note, problems };
}

async function fitFrame(page, cfg) {
  const w = await page.evaluate(() => document.querySelector('.pill')?.getBoundingClientRect().width ?? 0);
  const problems = [];
  if (w > FIT.pill) problems.push(`URL pill: "${cfg.urlHost}${cfg.urlPath || ''}" is ${Math.round(w)}px wide and the band allows ${FIT.pill}px. Shorten urlPath or leave it empty (the end card can still show the full URL).`);
  return { note: `frame: URL pill ${Math.round(w)}px of ${FIT.pill}`, problems };
}

(async () => {
  const cfg = loadConfig(process.argv[2]);
  const L = layout(cfg);
  const puppeteer = requirePuppeteer(cfg);
  const mascotPath = cfg.endcard.mascot ? resolveIn(cfg, cfg.endcard.mascot) : null;
  const mascotB64 = mascotPath ? fs.readFileSync(mascotPath).toString('base64') : null;

  const browser = await puppeteer.launch({ headless: true, executablePath: cfg.chrome });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    for (const [name, html, transparent, need] of [
      ['frame', frameHtml(cfg, L), true, [cfg.brand.sans]],
      ['endcard', endHtml(cfg, mascotB64), false, [cfg.brand.sans, cfg.brand.serif]],
    ]) {
      // 'load', not 'networkidle0': the Google Fonts slices for Japanese can keep the network busy past the 30 s default.
      await page.setContent(html, { waitUntil: 'load', timeout: 120000 });
      await page.evaluate(() => document.fonts.ready);
      const loaded = await page.evaluate(() => [...new Set([...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/"/g, '')))]);
      const missing = need.filter(f => !loaded.includes(f));
      if (missing.length) throw new Error(`${name}: font(s) ${missing.join(', ')} did not load (loaded: ${loaded.join(', ') || 'none'}); refusing to draw with a fallback`);
      const fit = await (name === 'frame' ? fitFrame(page, cfg) : fitEndcard(page, cfg));
      console.log(fit.note);
      if (fit.problems.length) throw new Error(`${name}: refusing to draw, it does not fit:\n  - ${fit.problems.join('\n  - ')}`);
      const out = path.join(cfg.workDir, `${name}.png`);
      await page.screenshot({ path: out, omitBackground: transparent });
      console.log('wrote', out);
    }
  } finally {
    await browser.close();
  }
  console.log('hole', JSON.stringify(L.hole));
})().catch(e => {
  console.error(e.message || e);
  process.exit(1);
});

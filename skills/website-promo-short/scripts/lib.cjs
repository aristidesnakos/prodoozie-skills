// Shared by every script in this skill: loads promo.json with defaults, resolves paths, and computes the one
// layout (where the screen capture sits in the 1080x1920 canvas) that render-assets.cjs and build-video.cjs must agree on.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');

const SKILL_DIR = path.resolve(__dirname, '..');
const CANVAS = { w: 1080, h: 1920 };
const BAND_H = 190; // the strip above the window that carries the URL pill

const DEFAULTS = {
  // Where `puppeteer-core` (or `puppeteer`) resolves from. The skill's own package.json: `npm install` in the skill folder is the setup.
  // PUPPETEER_FROM or promo.json "puppeteerFrom" point at another project's package.json instead.
  puppeteerFrom: process.env.PUPPETEER_FROM || path.join(SKILL_DIR, 'package.json'),
  chrome: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  port: 9333, // Chrome's DevTools port for the throwaway window (check, play)
  recorder: 'prodoozie', // "prodoozie": `play` checks Prodoozie is writing a take when you say go. "other": another recorder, not checked
  projects: null, // where Prodoozie keeps its recordings; null = ~/Movies/iRecord/Projects (the folder keeps the name Prodoozie had before)
  viewport: { width: 428, height: 761 }, // CSS px; 428x761 is 9:16 and gets the site's phone layout
  window: { left: 60, top: 70 }, // where the Chrome window sits on the display (points)
  userAgent: null, // a full user-agent string; see userAgentMarker for the usual need
  userAgentMarker: null, // appended to Chrome's own user agent, e.g. "my-site-promo/1.0", so the visits can be told apart in the site's logs
  start: null, // first page; defaults to `url`
  dismiss: [], // button texts to click once on first load (cookie banners): choose the privacy-preserving one
  hide: [], // texts of floating buttons to hide while recording (a chat or feedback button)
  steps: [],
  stills: [], // rehearse: mark labels to screenshot
  workDir: 'work',
  outDir: 'out',
  tailSec: 0.15, // kept after the last step's mark, before the end card starts
  endHoldSec: 3.6,
  transition: 'slideup', // xfade name. Not 'fade': dissolving two text-heavy screens is a muddy double exposure
  transitionSec: 0.45,
  fps: 60,
  music: null, // { file, lufs: -24, fadeInSec: 0.5, fadeOutSec: 2 }
  // A neutral palette: replace it with the site's own. Fonts are Google Fonts families (the end card loads them; see render-assets.cjs).
  brand: {
    cream: '#F6F4EF', // the paper: the end card's ground and the frame around the window
    sagePale: '#E4E2DA', // the disc behind a mascot (only drawn when endcard.mascot is set)
    accent: '#2563EB', // the identity colour: the URL pill's dot, the end card's stripe, the headline's accent words, the click ripple
    accentInk: '#1E40AF', // the colour of the eyebrow, the URL box and the footer bar: dark enough for cream text on it
    ink: '#1B1F24', // text
    ink2: '#3C434B', // secondary text
    serif: 'Fraunces', // the headline's face
    sans: 'Inter', // everything else
    // Optional. null = a quiet tint of the brand's own ink/cream (see look() below).
    grid: null, // the end card's grid lines, a CSS colour
    pillBorder: null, // the URL pill's border, a CSS colour
    ripple: null, // the click ripple's colour; null = accent
    fontsLink: null, // raw HTML for the card's <head> when the faces are not on Google Fonts
  },
  urlHost: null, // shown in the pill and on the end card: "example.com"
  urlPath: null, // "/pricing" (accent colour)
  endcard: {
    eyebrow: 'WATCH THIS',
    headline: ['Your headline', [{ text: 'goes here', accent: true }]], // lines: string | run[]; run: string | {text, accent?, serif?}
    sub: ['One line of what it is.', 'Free. No sign-up.'],
    mascot: null, // path to a transparent PNG, relative to promo.json
    ctaLabel: 'Take it here',
    footerLeft: '',
    footerRight: '',
  },
};

function deepMerge(base, over) {
  if (Array.isArray(over) || over === null || typeof over !== 'object') return over === undefined ? base : over;
  const out = { ...base };
  for (const k of Object.keys(over)) {
    out[k] = base && typeof base[k] === 'object' && !Array.isArray(base[k]) && base[k] !== null ? deepMerge(base[k], over[k]) : over[k];
  }
  return out;
}

function loadConfig(file) {
  if (!file) throw new Error('usage: <script> <path/to/promo.json> ...');
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) throw new Error(`promo.json not found: ${abs}`);
  const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const cfg = deepMerge(DEFAULTS, raw);
  cfg._file = abs;
  cfg._dir = path.dirname(abs);
  cfg.start = cfg.start || cfg.url;
  if (!cfg.name) throw new Error('promo.json needs a "name" (used for file names)');
  if (!cfg.url) throw new Error('promo.json needs a "url" (the page the video promotes)');
  if (!cfg.start) throw new Error('promo.json needs a "start" or "url"');
  if (!cfg.urlHost) {
    const u = new URL(cfg.url);
    cfg.urlHost = u.host.replace(/^www\./, '');
    cfg.urlPath = cfg.urlPath ?? (u.pathname === '/' ? '' : u.pathname.replace(/\/$/, ''));
  }
  cfg.workDir = path.resolve(cfg._dir, cfg.workDir);
  cfg.outDir = path.resolve(cfg._dir, cfg.outDir);
  // A relative puppeteerFrom is relative to the promo.json, like every other path in it.
  if (raw.puppeteerFrom) cfg.puppeteerFrom = path.resolve(cfg._dir, raw.puppeteerFrom.replace(/^~(?=$|\/)/, os.homedir()));
  fs.mkdirSync(cfg.workDir, { recursive: true });
  fs.mkdirSync(cfg.outDir, { recursive: true });
  return cfg;
}

const resolveIn = (cfg, p) => (p ? path.resolve(cfg._dir, p.replace(/^~(?=$|\/)/, os.homedir())) : p);

/** puppeteer-core is what `npm install` puts in the skill folder; a project that has the full puppeteer works too. */
function requirePuppeteer(cfg) {
  const from = cfg?.puppeteerFrom || DEFAULTS.puppeteerFrom;
  const req = createRequire(from);
  for (const name of ['puppeteer-core', 'puppeteer']) {
    try {
      return req(name);
    } catch (e) {
      if (e.code !== 'MODULE_NOT_FOUND') throw e;
    }
  }
  throw new Error(`puppeteer-core not found from ${from}. Run \`npm install\` in ${SKILL_DIR} (or \`node ${path.join(SKILL_DIR, 'scripts', 'doctor.cjs')}\` to see what else is missing), or point "puppeteerFrom" / PUPPETEER_FROM at a package.json whose project has puppeteer.`);
}

/**
 * The user agent the site should see, or null for the browser's own. `userAgent` is a full string; `userAgentMarker` is added to
 * Chrome's real one (headless Chrome says "HeadlessChrome": made "Chrome" so a rehearsal and a recording look alike to the site).
 */
async function resolveUserAgent(browser, cfg) {
  if (cfg.userAgent) return cfg.userAgent;
  if (!cfg.userAgentMarker) return null;
  const real = (await browser.userAgent()).replace('HeadlessChrome', 'Chrome');
  return `${real} ${cfg.userAgentMarker}`;
}

// ─── Prodoozie's recordings ──────────────────────────────────────────────────

const DEFAULT_PROJECTS = path.join(os.homedir(), 'Movies', 'iRecord', 'Projects');
const TAKE = /^take-\d+\.mp4$/; // not take-001.camera.mp4, not take-001.repairing.mp4

/** Every take-NNN.mp4 at <root>/<recording>/scenes/<scene>/, newest first. before-repair/ and .trash/ are never looked in. */
function findTakes(root) {
  const out = [];
  const dirs = f => {
    try {
      return fs.readdirSync(f, { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'before-repair');
    } catch {
      return [];
    }
  };
  for (const rec of dirs(root)) {
    const scenes = path.join(root, rec.name, 'scenes');
    for (const scene of dirs(scenes)) {
      const dir = path.join(scenes, scene.name);
      for (const f of fs.readdirSync(dir)) if (TAKE.test(f)) out.push({ file: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs });
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

/**
 * Is the recorder writing a take right now? Prodoozie writes the take file as it records, so a take written in the last `withinMs` is a
 * recording in progress, and none is a recording that never started. `play` asks when it is told to go: a script played into nothing is
 * a minute wasted and, on a site that counts visits, a visit for no video. Another recorder cannot be seen: "recorder": "other" skips it.
 */
function recorderSeen(cfg, withinMs = 20000, now = Date.now()) {
  if (cfg.recorder === 'other') return { ok: true, note: 'recorder is "other": not checked' };
  const root = cfg.projects ? resolveIn(cfg, cfg.projects) : DEFAULT_PROJECTS;
  if (!fs.existsSync(root)) return { ok: true, note: `no Prodoozie recordings folder at ${root}: could not check that it is recording` };
  const newest = findTakes(root)[0];
  const age = newest ? now - newest.mtime : Infinity;
  if (age <= withinMs) return { ok: true, take: newest.file, ageMs: age };
  return {
    ok: false,
    ageMs: age,
    message: newest
      ? `no take is being written: the newest take in ${root} was last written ${Math.round(age / 60000) >= 2 ? Math.round(age / 60000) + ' min' : Math.round(age / 1000) + ' s'} ago.`
      : `no take is being written: there is no take at all in ${root}.`,
  };
}

/** Where the screen capture sits in the canvas, and how big it is drawn. Even numbers only (yuv420p). */
function layout(cfg) {
  const vw = cfg.viewport.width;
  const vh = cfg.viewport.height;
  const even = n => Math.round(n / 2) * 2;
  const maxH = CANVAS.h - BAND_H - 40;
  let w = 944;
  let h = even((w * vh) / vw);
  if (h > maxH) {
    h = even(maxH);
    w = even((h * vw) / vh);
  }
  return { canvas: CANVAS, bandH: BAND_H, hole: { x: Math.round((CANVAS.w - w) / 2), y: BAND_H, w, h, r: 40 } };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── The overlays' colours that are not brand fields of their own ────────────

const hexParts = hex => {
  let h = String(hex).trim().replace('#', '');
  if (h.length === 3) h = h.replace(/./g, c => c + c);
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgba = (hex, a) => `rgba(${hexParts(hex).join(',')},${a})`;
const mixHex = (from, to, t) => {
  const a = hexParts(from);
  const b = hexParts(to);
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
};

/**
 * The colours render-assets.cjs draws that are not brand fields of their own, all derived from the brand's ink and cream
 *   ring, pillShadow: the window's inner ring and the pill's drop shadow, the brand's `ink` at 16% and 10%.
 *   pillBorder, grid: `brand.pillBorder` / `brand.grid` when given, otherwise a quiet tint of the brand's own ink and cream.
 */
function look(brand) {
  return {
    ring: rgba(brand.ink, '.16'),
    pillShadow: rgba(brand.ink, '.10'),
    pillBorder: brand.pillBorder || mixHex(brand.cream, brand.ink, 0.12),
    grid: brand.grid || rgba(brand.ink, '.06'),
  };
}

module.exports = { SKILL_DIR, CANVAS, BAND_H, DEFAULTS, DEFAULT_PROJECTS, loadConfig, resolveIn, requirePuppeteer, resolveUserAgent, findTakes, recorderSeen, layout, sleep, look };

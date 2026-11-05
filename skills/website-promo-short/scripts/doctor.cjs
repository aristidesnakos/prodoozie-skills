#!/usr/bin/env node
/**
 * node doctor.cjs [--json]
 *
 * Step 0 of the skill: checks this Mac can run it, and prints the exact fix for each thing that is missing.
 * It needs only Node itself (no npm install first), so it can say that npm install is what is missing.
 *
 *   ok     passed
 *   WARN   the skill can run, but something is untested or likely to bite (does not change the exit code)
 *   FAIL   it will not work until fixed (exit code 1)
 *
 * What it cannot check, and says so at the end: the recorder's Screen Recording permission and licence.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { DEFAULTS, SKILL_DIR } = require('./lib.cjs');

const json = process.argv.includes('--json');
const results = [];
const add = (id, status, detail, fix) => results.push({ id, status, detail, ...(fix ? { fix } : {}) });
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024, ...opts });
const tryRun = (cmd, args, opts) => {
  try {
    return run(cmd, args, opts);
  } catch {
    return null;
  }
};
const cmp = (a, b) => {
  for (let i = 0; i < 3; i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return d;
  }
  return 0;
};
const ver = s => String(s).match(/\d+(\.\d+){0,2}/)?.[0].split('.').map(Number) || [0];

const NODE_MIN = [22, 12, 0]; // what the pinned puppeteer-core (package.json) asks for
const DISK_FAIL_GB = 2;
const DISK_WARN_GB = 5;
const WINDOW_BOTTOM_PT = DEFAULTS.window.top + DEFAULTS.viewport.height + 28 + 40; // window top + viewport + title bar + the Dock's margin

// ─── macOS ───────────────────────────────────────────────────────────────────
if (process.platform !== 'darwin') {
  add('macos', 'FAIL', `this is ${process.platform}: the skill opens Chrome app windows with \`open\` and records the screen with a Mac recorder`, 'Run it on a Mac.');
} else {
  const v = (tryRun('sw_vers', ['-productVersion']) || '').trim();
  const arm = process.arch === 'arm64';
  const tested = ver(v)[0] >= 26 && arm;
  add('macos', tested ? 'ok' : 'WARN', `macOS ${v || '?'}, ${process.arch}${tested ? '' : ' (made and tested on macOS 26 on Apple Silicon only)'}`);
}

// ─── Node ────────────────────────────────────────────────────────────────────
add(
  'node',
  cmp(ver(process.versions.node), NODE_MIN) >= 0 ? 'ok' : 'FAIL',
  `Node ${process.versions.node}${cmp(ver(process.versions.node), NODE_MIN) >= 0 ? '' : ` (needs ${NODE_MIN.join('.')} or newer, the version the pinned puppeteer-core needs)`}`,
  'brew install node   (or install Node 22+ from https://nodejs.org)',
);

// ─── ffmpeg ──────────────────────────────────────────────────────────────────
const ff = tryRun('ffmpeg', ['-hide_banner', '-version']);
const fp = tryRun('ffprobe', ['-hide_banner', '-version']);
if (!ff || !fp) {
  add('ffmpeg', 'FAIL', `${!ff ? 'ffmpeg' : 'ffprobe'} not found on PATH`, 'brew install ffmpeg');
} else {
  const encoders = tryRun('ffmpeg', ['-hide_banner', '-encoders']) || '';
  const filters = tryRun('ffmpeg', ['-hide_banner', '-filters']) || '';
  const missing = [];
  if (!/\blibx264\b/.test(encoders)) missing.push('the libx264 encoder');
  for (const f of ['xfade', 'overlay', 'ebur128']) if (!new RegExp(`\\b${f}\\b`).test(filters)) missing.push(`the ${f} filter`);
  const first = ff.split('\n')[0].replace(/^ffmpeg version /, '').split(' ')[0];
  add('ffmpeg', missing.length ? 'FAIL' : 'ok', missing.length ? `ffmpeg ${first} lacks ${missing.join(', ')}` : `ffmpeg ${first} and ffprobe, with libx264, xfade, overlay and ebur128`, missing.length ? 'brew install ffmpeg   (the Homebrew build has them)' : undefined);
}

// ─── Chrome ──────────────────────────────────────────────────────────────────
const chromePath = DEFAULTS.chrome;
if (!fs.existsSync(chromePath)) {
  add('chrome', 'FAIL', `Google Chrome not found at ${chromePath}`, 'Install Google Chrome (https://www.google.com/chrome/), or set CHROME_PATH to the executable inside its .app.');
} else {
  const v = (tryRun(chromePath, ['--version']) || '').trim();
  add('chrome', 'ok', `${v || 'Google Chrome'}${process.env.CHROME_PATH ? ' (from CHROME_PATH)' : ''}`);
}

// ─── puppeteer ───────────────────────────────────────────────────────────────
{
  const from = DEFAULTS.puppeteerFrom;
  let found = null;
  for (const name of ['puppeteer-core', 'puppeteer']) {
    try {
      // The package's exports map need not list ./package.json, so find it from the entry point instead.
      let dir = path.dirname(require('node:module').createRequire(from).resolve(name));
      while (dir !== path.dirname(dir)) {
        const f = path.join(dir, 'package.json');
        if (fs.existsSync(f) && JSON.parse(fs.readFileSync(f, 'utf8')).name === name) {
          found = `${name} ${JSON.parse(fs.readFileSync(f, 'utf8')).version}`;
          break;
        }
        dir = path.dirname(dir);
      }
      if (found) break;
    } catch {}
  }
  add('puppeteer', found ? 'ok' : 'FAIL', found ? `${found}, from ${path.dirname(from)}` : `puppeteer-core not found from ${from}`, `cd "${SKILL_DIR}" && npm install`);
}

// ─── Display ─────────────────────────────────────────────────────────────────
// The layout assumes a 2x (Retina) main display: the Chrome window opens at the top left of it, and the recorder films it.
{
  let note = null;
  const raw = process.platform === 'darwin' ? tryRun('system_profiler', ['SPDisplaysDataType', '-json'], { timeout: 20000 }) : null;
  let main = null;
  try {
    for (const g of JSON.parse(raw).SPDisplaysDataType) for (const d of g.spdisplays_ndrvs || []) if (!main || d.spdisplays_main === 'spdisplays_yes') main = d;
  } catch {}
  const px = main?._spdisplays_pixels?.match(/(\d+)\s*x\s*(\d+)/);
  const pt = main?._spdisplays_resolution?.match(/(\d+)\s*x\s*(\d+)/);
  if (!px || !pt) {
    note = 'could not read the main display from system_profiler';
    add('display', 'WARN', note, 'Run `node scripts/run.cjs check <promo.json>` later: it opens the window for 10 s and reports the real scale (dpr) and size.');
  } else {
    const scale = Number(px[1]) / Number(pt[1]);
    const name = main._name || 'main display';
    const problems = [];
    if (Math.abs(scale - 2) > 0.05) problems.push(`it is ${scale.toFixed(2)}x, not 2x`);
    if (Number(pt[2]) < WINDOW_BOTTOM_PT) problems.push(`it is ${pt[2]} points tall and the window needs about ${WINDOW_BOTTOM_PT}`);
    add(
      'display',
      problems.length ? 'FAIL' : 'ok',
      `${name}: ${px[1]}x${px[2]} pixels, ${pt[1]}x${pt[2]} points, ${scale.toFixed(0)}x${problems.length ? ` (${problems.join('; ')})` : ''}`,
      problems.length ? 'Make the main display a 2x one at least 900 points tall: the built-in Retina screen, or System Settings → Displays → a scaled resolution that is not "larger text". An external display at 1x will not do.' : undefined,
    );
  }
}

// ─── Disk ────────────────────────────────────────────────────────────────────
try {
  const target = fs.existsSync(path.join(os.homedir(), 'Movies')) ? path.join(os.homedir(), 'Movies') : os.homedir();
  const s = fs.statfsSync(target);
  const gb = (s.bavail * s.bsize) / 1024 ** 3;
  add(
    'disk',
    gb < DISK_FAIL_GB ? 'FAIL' : gb < DISK_WARN_GB ? 'WARN' : 'ok',
    `${gb.toFixed(1)} GB free on the disk holding ${target} (a full-screen recording is about 150 MB a minute at 2x)`,
    gb < DISK_WARN_GB ? 'Free some space before recording: empty the Trash, or delete old recordings.' : undefined,
  );
} catch (e) {
  add('disk', 'WARN', `could not read free disk space (${e.message})`);
}

// ─── Prodoozie ───────────────────────────────────────────────────────────────
// A Mac that updated Prodoozie through its own updater still has it at /Applications/iRecord.app (the name it had before).
{
  const candidates = ['/Applications/Prodoozie.app', '/Applications/iRecord.app', path.join(os.homedir(), 'Applications', 'Prodoozie.app')];
  const app = candidates.find(p => fs.existsSync(path.join(p, 'Contents', 'Info.plist')));
  if (app) {
    const plist = key => (tryRun('plutil', ['-extract', key, 'raw', '-o', '-', path.join(app, 'Contents', 'Info.plist')]) || '').trim();
    const name = plist('CFBundleName');
    const version = plist('CFBundleShortVersionString');
    add('prodoozie', name === 'Prodoozie' ? 'ok' : 'WARN', `${name || path.basename(app)} ${version} at ${app}${name === 'Prodoozie' ? '' : ' (not Prodoozie: the recorder this skill was made with)'}`);
  } else {
    add('prodoozie', 'WARN', 'Prodoozie is not installed in /Applications', 'Get it at https://prodoozie.com. It is the recorder this skill was made and tested with; another recorder that films the whole screen at 2x may work, untested.');
  }
}

// ─── Port ────────────────────────────────────────────────────────────────────
// Last, because it waits for an answer.
const portCheck = new Promise(resolve => {
  const s = net.connect({ host: '127.0.0.1', port: DEFAULTS.port });
  s.setTimeout(800);
  s.once('connect', () => {
    s.destroy();
    resolve(true);
  });
  s.once('timeout', () => {
    s.destroy();
    resolve(false);
  });
  s.once('error', () => resolve(false));
});

portCheck.then(busy => {
  add('port', busy ? 'WARN' : 'ok', busy ? `something is listening on ${DEFAULTS.port}, the DevTools port the window uses (a Chrome left over from an earlier run?)` : `port ${DEFAULTS.port} is free`, busy ? `Quit that Chrome, or set "port" in promo.json to a free port.` : undefined);

  const fails = results.filter(r => r.status === 'FAIL').length;
  const warns = results.filter(r => r.status === 'WARN').length;
  if (json) {
    console.log(JSON.stringify({ ok: fails === 0, results }, null, 2));
  } else {
    console.log('website-promo-short: doctor\n');
    for (const r of results) {
      console.log(`  ${r.status.padEnd(4)}  ${r.detail}`);
      if (r.fix && r.status !== 'ok') console.log(`        fix: ${r.fix}`);
    }
    console.log('\nNot checked here: the recorder\'s Screen Recording permission (System Settings → Privacy & Security → Screen Recording), its trial or');
    console.log('licence, and that Do Not Disturb is on. Do those before recording.');
    console.log(fails ? `\n${fails} problem${fails > 1 ? 's' : ''} to fix${warns ? `, ${warns} warning${warns > 1 ? 's' : ''}` : ''}.` : `\nAll clear${warns ? `, with ${warns} warning${warns > 1 ? 's' : ''}` : ''}.`);
  }
  process.exit(fails ? 1 : 0);
});

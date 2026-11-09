#!/usr/bin/env node
// Renders cut.json's "cards" to PNGs with headless Chrome: <workDir>/cards/<name>.png.
//   node render-cards.cjs cut.json
// A card is { "template": "intro"|"step"|"end"|"thumb", ...its fields }. Fields are text: escaped, and a new line in
// "title" is a line break. Step frames are transparent where the picture shows. Needs the internet for the fonts.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { SKILL_DIR, CHROME, loadCut, pngSize } = require('./lib.cjs');

const cut = loadCut(process.argv[2]);
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
fs.mkdirSync(cut.cardsDir, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'install-video-chrome-'));
const { x, y, w, h } = cut.picture;
let failed = 0;

try {
  for (const [name, card] of Object.entries(cut.cards)) {
    const tpl = path.join(SKILL_DIR, 'templates', `${card.template}.html`);
    if (!fs.existsSync(tpl)) { console.error(`${name}: no template "${card.template}"`); failed++; continue; }
    let html = fs.readFileSync(tpl, 'utf8');
    const [cw, ch] = (html.match(/size (\d+)x(\d+)/) || [0, 1920, 1080]).slice(1).map(Number);
    const fields = { ground: cut.ground, px: x, py: y, pw: w, ph: h, pxo: x - 0.5, pyo: y - 0.5, pwo: w + 1, pho: h + 1, ...card };
    const missing = [];
    html = html.replace(/\{\{(\w+)\}\}/g, (_, k) => {
      if (!(k in fields)) { missing.push(k); return ''; }
      return k === 'title' ? esc(fields[k]).replace(/\n/g, '<br>') : esc(fields[k]);
    });
    if (missing.length) console.warn(`${name}: no value for ${missing.join(', ')} (left empty)`);
    const htmlFile = path.join(cut.cardsDir, `${name}.html`);
    const png = path.join(cut.cardsDir, `${name}.png`);
    fs.writeFileSync(htmlFile, html);
    fs.rmSync(png, { force: true });
    try {
      execFileSync(CHROME, ['--headless=new', `--user-data-dir=${profile}`, '--disable-gpu', '--hide-scrollbars',
        '--force-device-scale-factor=1', '--default-background-color=00000000', `--window-size=${cw},${ch}`,
        '--virtual-time-budget=6000', `--screenshot=${png}`, `file://${htmlFile}`], { stdio: 'ignore', timeout: 60000 });
    } catch { /* Chrome exits non-zero after a screenshot on some versions; the file is the test */ }
    if (!fs.existsSync(png)) { console.error(`${name}: Chrome wrote no PNG`); failed++; continue; }
    const s = pngSize(png);
    const ok = s.width === cw && s.height === ch;
    console.log(`${ok ? 'ok  ' : 'BAD '} ${name}  ${s.width}x${s.height}${s.alpha ? ' with alpha' : ''}  ${path.relative(process.cwd(), png)}`);
    if (!ok) failed++;
  }
} finally {
  fs.rmSync(profile, { recursive: true, force: true });
}
console.log('Read every PNG before building: fonts that failed to load fall back to a system face without a word.');
process.exit(failed ? 1 : 0);

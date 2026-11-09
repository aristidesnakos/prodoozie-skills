// Shared by render-cards.cjs and build-video.cjs: loads cut.json with its defaults and resolves its paths.
// "picture" is the one layout: where the screen sits on the canvas. The step frames' hole and the build both read it.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SKILL_DIR = path.resolve(__dirname, '..');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const DEFAULTS = {
  workDir: 'work',
  out: 'out/video.mp4',
  fps: 30,
  canvas: [1920, 1080],
  ground: '#0B0907', // pelt-950
  picture: { x: 80, y: 130, w: 1760, h: 886 }, // where the cropped screen lands; leaves a band at the top for the step title
  crop: null, // { x, w, h } in the take's pixels; each segment gives its own y
  paint: [], // painted over the take before the crop: [{ mode: "delogo"|"fill", box: [x, y, w, h], color, until }]
  cards: {},
  timeline: [],
};

const expand = p => (p && p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p);

function loadCut(file) {
  if (!file) throw new Error('usage: <script> cut.json');
  const abs = path.resolve(expand(file));
  const cut = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(abs, 'utf8')) };
  const base = path.dirname(abs);
  const at = p => path.resolve(base, expand(p));
  cut.file = abs;
  cut.base = base;
  cut.take = cut.take ? at(cut.take) : null;
  cut.workDir = at(cut.workDir);
  cut.out = at(cut.out);
  cut.cardsDir = cut.cardsDir ? at(cut.cardsDir) : path.join(cut.workDir, 'cards');
  return cut;
}

function probe(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
    'stream=width,height:format=duration,size', '-of', 'json', file], { encoding: 'utf8' });
  const j = JSON.parse(out);
  return { width: j.streams[0].width, height: j.streams[0].height, duration: Number(j.format.duration), size: Number(j.format.size) };
}

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), alpha: b[25] === 6 };
}

module.exports = { SKILL_DIR, CHROME, loadCut, probe, pngSize, expand };

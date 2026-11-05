#!/usr/bin/env node
/**
 * node analyze-take.cjs <promo.json> [take.mp4]
 *
 * Finds, in a full-display recording of the `run.cjs play` run: (1) the pixel rectangle of the phone-size viewport, from the magenta
 * calibration screen shown at the start, and (2) the video time at which the scripted run begins (the first non-magenta frame).
 * Writes <workDir>/take-analysis.json. The take path defaults to <workDir>/take-path.txt (written by find-take.cjs).
 *
 * Takes ~10-40 s: it decodes the whole take once to read one pixel per frame.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { loadConfig } = require('./lib.cjs');

const cfg = loadConfig(process.argv[2]);
const takeFile = process.argv[3] || (fs.existsSync(path.join(cfg.workDir, 'take-path.txt')) ? fs.readFileSync(path.join(cfg.workDir, 'take-path.txt'), 'utf8').trim() : null);
if (!takeFile || !fs.existsSync(takeFile)) {
  console.error('no take file: run `node scripts/find-take.cjs <promo.json>` (it writes work/take-path.txt), or pass the recording as the second argument');
  process.exit(2);
}

// The display profile shifts #ff00ff to about (236, 45, 245) in the capture, so match by shape, not by value.
const isMagenta = (r, g, b) => r > 190 && b > 190 && r - g > 120 && b - g > 120;

const [SW, SH] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', takeFile])
  .toString()
  .trim()
  .split(',')
  .map(Number);

// 1) bounding box of magenta in an early frame
const frame = execFileSync('ffmpeg', ['-v', 'error', '-ss', '0.6', '-i', takeFile, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {
  maxBuffer: SW * SH * 3 + 4096,
});
if (frame.length !== SW * SH * 3) throw new Error(`unexpected frame size ${frame.length} for ${SW}x${SH}`);
let x0 = SW, y0 = SH, x1 = -1, y1 = -1, n = 0;
for (let y = 0; y < SH; y++) {
  for (let x = 0; x < SW; x++) {
    const i = (y * SW + x) * 3;
    if (isMagenta(frame[i], frame[i + 1], frame[i + 2])) {
      n++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
}
if (n === 0) throw new Error('no magenta in the frame at 0.6 s: the recording began after the calibration screen, or the window was not on screen. Record it again: start the recording while the window shows magenta, and only then say go.');
const box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, fill: +(n / ((x1 - x0 + 1) * (y1 - y0 + 1))).toFixed(4) };
console.log(`take ${SW}x${SH}; viewport box (px):`, JSON.stringify(box));
if (box.fill < 0.98) console.warn('WARNING: the magenta area is not a clean rectangle (fill < 0.98): something overlapped the window. Check a frame by eye.');
const expectW = cfg.viewport.width * 2;
if (Math.abs(box.w - expectW) > 4) console.warn(`WARNING: box width ${box.w} px is not 2x the ${cfg.viewport.width} px viewport; check the display scale.`);

// 2) per-frame colour at a point inside the viewport
const cx = box.x + Math.round(box.w / 2);
const cy = box.y + Math.round(box.h / 2);
const colours = execFileSync('ffmpeg', ['-v', 'error', '-i', takeFile, '-an', '-vf', `crop=4:4:${cx}:${cy},scale=1:1:flags=area,format=rgb24`, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'], { maxBuffer: 64 * 1024 * 1024 });
const pts = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time', '-of', 'csv=p=0', takeFile], { maxBuffer: 64 * 1024 * 1024 })
  .toString()
  .trim()
  .split('\n')
  .map(Number)
  .sort((a, b) => a - b);
const frames = colours.length / 3;

let firstMagenta = -1;
let firstAfter = -1;
for (let i = 0; i < frames; i++) {
  const m = isMagenta(colours[i * 3], colours[i * 3 + 1], colours[i * 3 + 2]);
  if (m && firstMagenta < 0) firstMagenta = i;
  if (!m && firstMagenta >= 0) {
    firstAfter = i;
    break;
  }
}
if (firstMagenta < 0 || firstAfter < 0) throw new Error('could not find the magenta -> page transition');
const out = { takeFile, display: { w: SW, h: SH }, box, startTime: pts[firstAfter], startFrame: firstAfter, frames };
console.log(JSON.stringify(out));
fs.writeFileSync(path.join(cfg.workDir, 'take-analysis.json'), JSON.stringify(out, null, 2));

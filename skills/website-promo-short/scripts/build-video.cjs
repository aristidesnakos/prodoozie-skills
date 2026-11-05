#!/usr/bin/env node
/**
 * node build-video.cjs <promo.json>
 *
 * Builds <outDir>/<name>.mp4 (1080x1920, silent) from the take:
 *   cut at the calibration frame -> crop to the viewport -> scale into the rounded window of frame.png (URL pill above it)
 *   -> slide into endcard.png.
 * Needs <workDir>/take-analysis.json (analyze-take.cjs), run.json (run.cjs play), frame.png and endcard.png (render-assets.cjs).
 * Add music afterwards with mix-music.cjs, so the level can be changed without re-encoding the picture.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { loadConfig, layout } = require('./lib.cjs');

const cfg = loadConfig(process.argv[2]);
const need = f => {
  const p = path.join(cfg.workDir, f);
  if (!fs.existsSync(p)) {
    console.error(`missing ${p}`);
    process.exit(2);
  }
  return p;
};
const analysis = JSON.parse(fs.readFileSync(need('take-analysis.json'), 'utf8'));
const run = JSON.parse(fs.readFileSync(need('run.json'), 'utf8'));
const frame = need('frame.png');
const endcard = need('endcard.png');

const L = layout(cfg);
const { box } = analysis;
const dur = +((run.tEnd - run.t0) / 1000 + cfg.tailSec).toFixed(2);
const tr = cfg.transitionSec;
const fps = cfg.fps;
const takeDur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', analysis.takeFile]).toString().trim());
if (analysis.startTime + dur > takeDur + 0.05) {
  console.error(`the steps (${dur}s from ${analysis.startTime}s) run past the end of the take (${takeDur}s). The recording stopped before the steps finished: record it again and press Stop only after "STOP RECORDING NOW".`);
  process.exit(2);
}

const filter = [
  `[0:v]crop=${box.w}:${box.h}:${box.x}:${box.y},scale=${L.hole.w}:${L.hole.h}:flags=lanczos,fps=${fps},setpts=PTS-STARTPTS[vid]`,
  `color=c=0x${cfg.brand.cream.replace('#', '')}:s=${L.canvas.w}x${L.canvas.h}:r=${fps}:d=${dur}[bg]`,
  `[bg][vid]overlay=${L.hole.x}:${L.hole.y}[a]`,
  `[a][2:v]overlay=0:0,format=yuv420p[main]`,
  `[1:v]scale=${L.canvas.w}:${L.canvas.h},format=yuv420p,fps=${fps},setpts=PTS-STARTPTS[end]`,
  `[main][end]xfade=transition=${cfg.transition}:duration=${tr}:offset=${+(dur - tr).toFixed(2)}[v]`,
].join(';');

const out = path.join(cfg.outDir, `${cfg.name}.mp4`);
execFileSync(
  'ffmpeg',
  [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-ss', String(analysis.startTime), '-t', String(dur), '-i', analysis.takeFile,
    '-loop', '1', '-framerate', String(fps), '-t', String(cfg.endHoldSec), '-i', endcard,
    '-i', frame,
    '-filter_complex', filter,
    '-map', '[v]', '-an',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-r', String(fps), '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    out,
  ],
  { stdio: 'inherit' },
);
const info = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height,r_frame_rate,duration', '-of', 'csv=p=0', out]).toString().trim();
console.log('wrote', out, '-', info, '-', Math.round(fs.statSync(out).size / 1024), 'kB');
// Chrome's link-hover status bubble is a dark pill at the bottom-left of the viewport. Flag it if a light page shows one.
try {
  const px = L.hole.x + 32;
  const py = L.hole.y + L.hole.h - 24;
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', out, '-t', String(dur), '-an', '-vf', `crop=2:2:${px}:${py},scale=1:1:flags=area,format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 16 * 1024 * 1024 });
  const g = [...raw];
  const median = [...g].sort((a, b) => a - b)[Math.floor(g.length / 2)];
  const spans = [];
  let s = -1;
  g.forEach((v, i) => {
    const dark = median > 140 && v < 90;
    if (dark && s < 0) s = i;
    if ((!dark || i === g.length - 1) && s >= 0) {
      if (i - s >= 4) spans.push([+(s / fps).toFixed(2), +(i / fps).toFixed(2)]);
      s = -1;
    }
  });
  if (spans.length) console.warn(`WARNING: a dark pill sits at the bottom-left of the window at ${spans.map(x => x.join('-') + ' s').join(', ')}: Chrome's link status bubble (the real pointer hovered a link). Record again, and keep your hands off the mouse once recording.`);
  else console.log('bottom-left check: no link status bubble.');
} catch (e) {
  console.warn('bottom-left check skipped:', e.message);
}
console.log(`next: contact sheet to check it by eye:  ffmpeg -i "${out}" -vf "select='not(mod(n\\,${fps * 4}))',scale=270:480,tile=11x1" -frames:v 1 -vsync 0 ${path.join(cfg.workDir, 'sheet.png')}`);

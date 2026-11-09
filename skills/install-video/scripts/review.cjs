#!/usr/bin/env node
// A contact sheet and full frames of a video, to Read before anyone else sees it.
//   node review.cjs <video.mp4> [--fps 2] [--times 2.2,5.5,15.6] [--out review/]
// On a raw take use --fps 1 to find where each step starts; on the cut, read the sheet, then every frame listed.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { probe } = require('./lib.cjs');

const args = process.argv.slice(2);
const video = args[0];
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
if (!video || !fs.existsSync(video)) { console.error('usage: review.cjs <video.mp4> [--fps 2] [--times a,b] [--out dir]'); process.exit(2); }
const fps = Number(opt('--fps', 2));
const out = path.resolve(opt('--out', 'review'));
fs.mkdirSync(out, { recursive: true });
const v = probe(video);
const cols = 8;
const rows = Math.ceil((Math.floor(v.duration * fps) + 2) / cols); // ffmpeg's fps filter yields a frame or two more than duration x fps
const sheet = path.join(out, 'sheet.jpg');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', video, '-vf', `fps=${fps},scale=320:-1,tile=${cols}x${rows}:padding=4:color=white`,
  '-frames:v', '1', '-update', '1', sheet]);
console.log(`${path.basename(video)}  ${v.width}x${v.height}  ${v.duration.toFixed(2)} s  ${(v.size / 1e6).toFixed(1)} MB`);
console.log(`sheet: ${sheet}  (${cols} across, one tile every ${(1 / fps).toFixed(2)} s, reading left to right)`);
const times = (opt('--times', '') || '').split(',').filter(Boolean).map(Number);
for (const t of times) {
  const f = path.join(out, `frame-${t.toFixed(1)}.jpg`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', video, '-frames:v', '1', '-update', '1', f]);
  console.log(`frame: ${f}`);
}
console.log('Look for: a pointer that should not be there, a bar that comes and goes at the top, text cut at an edge, a zoom that lands off its target.');

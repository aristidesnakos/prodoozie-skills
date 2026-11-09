#!/usr/bin/env node
// Cuts the take into the video cut.json describes: segments of the take (cropped, painted, sped up, eased zooms) under
// their step frame, and cards, joined in order. Silent stereo track, H.264, 30 fps, fast start.
//   node build-video.cjs cut.json [--only <row index>]
// The ground (color, d=dur) sets each row's length; no overlay uses shortest=1. A looped PNG runs at 25 fps, so ending on it
// dropped every row's last frame (the posted cut is 0.3 s short of its plan for that reason).
// Each segment is encoded on its own into <workDir>/segments/, so a change to one row rebuilds in seconds with --only,
// then everything is joined again without re-encoding.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { loadCut, probe } = require('./lib.cjs');

const cut = loadCut(process.argv[2]);
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > 0 ? Number(process.argv[onlyArg + 1]) : null;
const FPS = cut.fps;
const [CW, CH] = cut.canvas;
const P = cut.picture;
const segDir = path.join(cut.workDir, 'segments');
fs.mkdirSync(segDir, { recursive: true });
fs.mkdirSync(path.dirname(cut.out), { recursive: true });
const ground = '0x' + cut.ground.replace('#', '');
// Every row carries the same colour tags: BT.709 primaries and matrix on the sRGB curve, as Prodoozie's own Save Video
// writes. Rows that disagree make ffmpeg rebuild its filters at each join (a contact sheet then loses its first tiles), and an
// untagged row is read as BT.709 by players while ffmpeg encoded it with BT.601 (the brand amber came out 239,161,15).
const TAGS = ['-color_primaries', 'bt709', '-color_trc', 'iec61966-2-1', '-colorspace', 'bt709', '-color_range', 'tv'];
const ENC = [...TAGS, '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '96k', '-ar', '48000', '-ac', '2'];
const ff = a => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a], { stdio: ['ignore', 'inherit', 'inherit'] });
const card = name => {
  const f = path.join(cut.cardsDir, `${name}.png`);
  if (!fs.existsSync(f)) throw new Error(`no card ${f}: run render-cards.cjs first`);
  return f;
};

// smoothstep from frame a to frame b of the segment's output (zoompan's `on`)
const ease = (a, b) => { const p = `clip((on-${a})/(${b}-${a}),0,1)`; return `(${p}*${p}*(3-2*${p}))`; };

let take = null;
if (cut.timeline.some(r => !r.card)) {
  if (!cut.take || !fs.existsSync(cut.take)) throw new Error(`take not found: ${cut.take}`);
  take = probe(cut.take);
  const c = cut.crop;
  if (!c) throw new Error('cut.json needs "crop": { x, w, h } in the take\'s pixels');
  const ar = (c.w / c.h) / (P.w / P.h);
  if (Math.abs(ar - 1) > 0.01) console.warn(`WARNING: crop ${c.w}x${c.h} and picture ${P.w}x${P.h} differ in shape by ${((ar - 1) * 100).toFixed(1)}%: the picture is stretched`);
}

// The take's colour. A Prodoozie screen take is Display P3 on the sRGB curve, tagged so since 2026-10-19; an older untagged one
// is the same picture (the app reads it so), hence the default. cut.json "takeColor": { "primaries": "bt709" } for a take
// from another recorder that really is BT.709.
const takeTags = take ? JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
  'stream=color_primaries,color_transfer', '-of', 'json', cut.take], { encoding: 'utf8' })).streams[0] : {};
const known = v => (v && v !== 'unknown' ? v : null);
const tc = { primaries: known(takeTags.color_primaries) || 'smpte432', trc: known(takeTags.color_transfer) || 'iec61966-2-1', ...(cut.takeColor || {}) };
// yuv (BT.709 matrix, video range) -> RGB, taking the take's primaries to BT.709 and keeping the sRGB curve
const FROM_TAKE = `colorspace=ispace=bt709:irange=tv:iprimaries=${tc.primaries}:itrc=${tc.trc}:space=bt709:range=tv:primaries=bt709:trc=srgb:format=yuv444p,` +
  'scale=in_color_matrix=bt709:in_range=tv,format=rgb24';
const TO_YUV = 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=color_primaries=bt709:color_trc=iec61966-2-1:colorspace=bt709:range=tv';
if (take) console.log(`take colour: ${tc.primaries} primaries, ${tc.trc} curve -> BT.709 primaries on the sRGB curve`);

const names = [];
cut.timeline.forEach((row, i) => {
  const name = `row-${String(i).padStart(2, '0')}`;
  names.push(name);
  if (only !== null && only !== i) return;
  const out = path.join(segDir, `${name}.mp4`);
  const dur = row.dur;
  if (row.card) {
    const fade = row.fade ?? 0.25;
    ff(['-loop', '1', '-t', String(dur + 1), '-i', card(row.card), '-f', 'lavfi', '-t', String(dur), '-i', 'anullsrc=r=48000:cl=stereo',
      '-filter_complex', `color=c=${ground}:s=${CW}x${CH}:r=${FPS}:d=${dur},format=rgba[g];[g][0:v]overlay=0:0:format=rgb,` +
      `fade=t=in:st=0:d=${fade},fade=t=out:st=${(dur - fade).toFixed(3)}:d=${fade},${TO_YUV}[o]`,
      '-map', '[o]', '-map', '1:a', ...ENC, '-frames:v', String(Math.round(dur * FPS)), '-t', String(dur), out]);
    console.log(`${i}  card ${row.card}  ${dur}s`);
    return;
  }
  const speed = row.speed ?? 1;
  const c = cut.crop;
  const y0 = row.y;
  if (y0 === undefined) throw new Error(`timeline[${i}] needs "y", the crop's top in the take's pixels`);
  if (c.x + c.w > take.width || y0 + c.h > take.height) throw new Error(`timeline[${i}]: crop ${c.x},${y0} ${c.w}x${c.h} runs past the take (${take.width}x${take.height})`);
  // paint: a row's own list replaces the global one; a global item with "until" stops at that take second
  const paint = (row.paint ?? cut.paint.filter(p => p.until === undefined || row.from < p.until)).map(p => {
    const [x, y, w, h] = p.box;
    if (p.mode === 'delogo') return `delogo=x=${x}:y=${y}:w=${w}:h=${h}`;
    if (p.mode === 'fill') return `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=${p.color || 'white'}:t=fill`;
    throw new Error(`timeline[${i}]: paint mode "${p.mode}" is not delogo or fill`);
  });
  const z = row.zoom;
  let zexpr = '1';
  let cx = c.w / 2;
  let cy = c.h / 2;
  if (z && z.to && z.to !== 1) {
    const [ia, ib] = (z.in || [0, dur]).map(s => Math.round(s * FPS));
    let e = ease(ia, ib);
    if (z.out) { const [oa, ob] = z.out.map(s => Math.round(s * FPS)); e = `(${e}-${ease(oa, ob)})`; }
    zexpr = `1+(${z.to}-1)*${e}`;
    if (z.at) [cx, cy] = z.at;
  }
  const xe = `max(0,min(iw-iw/zoom,${cx}-iw/zoom/2))`;
  const ye = `max(0,min(ih-ih/zoom,${cy}-ih/zoom/2))`;
  const chain = `[0:v]${paint.length ? paint.join(',') + ',' : ''}crop=${c.w}:${c.h}:${c.x}:${y0},setpts=PTS/${speed},fps=${FPS},` +
    `zoompan=z='${zexpr}':x='${xe}':y='${ye}':d=1:s=${P.w}x${P.h}:fps=${FPS},${FROM_TAKE}[v]`;
  const overlay = row.frame ? `[b][1:v]overlay=0:0:format=rgb,${TO_YUV}[o]` : `[b]${TO_YUV}[o]`;
  const fc = `color=c=${ground}:s=${CW}x${CH}:r=${FPS}:d=${dur},format=rgba[g];${chain};[g][v]overlay=${P.x}:${P.y}:format=rgb[b];${overlay}`;
  const frameIn = row.frame ? ['-loop', '1', '-t', String(dur + 1), '-i', card(row.frame)] : [];
  const audioIdx = row.frame ? 2 : 1;
  ff(['-ss', String(row.from), '-t', (dur * speed).toFixed(3), '-i', cut.take, ...frameIn,
    '-f', 'lavfi', '-t', String(dur), '-i', 'anullsrc=r=48000:cl=stereo', '-filter_complex', fc,
    '-map', '[o]', '-map', `${audioIdx}:a`, ...ENC, '-frames:v', String(Math.round(dur * FPS)), '-t', String(dur), out]);
  console.log(`${i}  take ${row.from.toFixed(2)}-${(row.from + dur * speed).toFixed(2)}s  ->  ${dur}s${speed !== 1 ? ` at ${speed}x` : ''}` +
    `${z && z.to ? `  zoom ${z.to}x` : ''}${paint.length ? `  paint ${paint.length}` : ''}`);
});

const list = path.join(segDir, 'list.txt');
fs.writeFileSync(list, names.map(n => `file '${n}.mp4'\n`).join(''));
ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', cut.out]);
const o = probe(cut.out);
const planned = cut.timeline.reduce((s, r) => s + r.dur, 0);
console.log(`\n${path.relative(process.cwd(), cut.out)}  ${o.width}x${o.height}  ${o.duration.toFixed(2)}s (planned ${planned.toFixed(2)})  ${(o.size / 1e6).toFixed(1)} MB`);
console.log('Next: node review.cjs on it, and Read the sheet and the frames it prints.');

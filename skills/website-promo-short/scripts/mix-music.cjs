#!/usr/bin/env node
/**
 * node mix-music.cjs <promo.json> [--lufs -24] [--file track.wav]
 *
 * Adds a music bed to <outDir>/<name>.mp4 -> <outDir>/<name>-music.mp4 (picture stream copied, not re-encoded).
 * The track is trimmed (or looped, if shorter) to the video, converted to stereo, measured with EBU R128 and gained to the
 * target integrated loudness, with a fade-in and a fade-out. Re-run with a different --lufs to re-level; it overwrites the output.
 *
 * Default target -24 LUFS: a bed under a silent screen recording. -18 was audibly too forward as "background music".
 * Platforms normalise loudness on upload, so judge the relative level, not the number.
 *
 * Music must be something you may publish: your own track, or one whose licence covers a promo on the platforms you post to. Not a
 * "free" track of unclear origin.
 */
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { loadConfig, resolveIn } = require('./lib.cjs');

const args = process.argv.slice(2);
const flag = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const cfg = loadConfig(args[0]);
const music = cfg.music || {};
const file = flag('--file') ? path.resolve(flag('--file')) : music.file ? resolveIn(cfg, music.file) : null;
const target = Number(flag('--lufs', music.lufs ?? -24));
const fadeIn = music.fadeInSec ?? 0.5;
const fadeOut = music.fadeOutSec ?? 2;
if (!file || !fs.existsSync(file)) {
  console.error('no music file: set music.file in promo.json or pass --file');
  process.exit(2);
}
const video = path.join(cfg.outDir, `${cfg.name}.mp4`);
if (!fs.existsSync(video)) {
  console.error(`build the picture first: ${video} not found`);
  process.exit(2);
}
const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video]).toString().trim());
const base = `atrim=0:${dur},asetpts=PTS-STARTPTS,aformat=channel_layouts=stereo`;

// 1) measure the trimmed, stereo track
const m = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-stream_loop', '-1', '-i', file, '-t', String(dur), '-af', `${base},ebur128=peak=true`, '-f', 'null', '-'], { encoding: 'utf8' });
const all = [...m.stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)];
if (!all.length) {
  console.error('could not measure the track:\n' + m.stderr.slice(-800));
  process.exit(1);
}
const measured = Number(all[all.length - 1][1]);
const gain = +(target - measured).toFixed(2);
console.log(`track ${measured} LUFS -> target ${target} LUFS: gain ${gain >= 0 ? '+' : ''}${gain} dB`);

// 2) mux
const out = path.join(cfg.outDir, `${cfg.name}-music.mp4`);
const af = `[1:a]${base},volume=${gain}dB,afade=t=in:st=0:d=${fadeIn},afade=t=out:st=${+(dur - fadeOut).toFixed(2)}:d=${fadeOut},aresample=48000[a]`;
execFileSync(
  'ffmpeg',
  ['-hide_banner', '-loglevel', 'error', '-y', '-i', video, '-stream_loop', '-1', '-i', file, '-filter_complex', af, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', String(dur), '-movflags', '+faststart', out],
  { stdio: 'inherit' },
);

// 3) verify the result
const v = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', out, '-af', 'ebur128=peak=true', '-vn', '-f', 'null', '-'], { encoding: 'utf8' });
const I = [...v.stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop()?.[1];
const P = [...v.stderr.matchAll(/Peak:\s+(-?[\d.]+) dBFS/g)].pop()?.[1];
console.log(`wrote ${out}: ${I} LUFS, peak ${P} dBFS, ${dur}s`);
if (P && Number(P) > -1) console.warn('WARNING: peak above -1 dBFS; lower --lufs.');

#!/usr/bin/env node
// Prodoozie's takes on disk: ~/Movies/iRecord/Projects/<Recording>/scenes/scene-NNN/take-NNN.mp4
// (the folder keeps the name the app had before; a camera file sits beside a take as .camera.mp4 and is skipped).
//   node take.cjs writing [--seconds 6]   is a take being written now? Exit 0 yes, 1 no. Run it a few seconds after Record.
//   node take.cjs newest [--since <ISO time or epoch ms>]   the newest take, refused while it is still growing
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = process.env.IRECORD_STORE_ROOT ? path.join(process.env.IRECORD_STORE_ROOT, 'Projects') : path.join(os.homedir(), 'Movies/iRecord/Projects');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function takes() {
  const out = [];
  if (!fs.existsSync(ROOT)) return out;
  for (const rec of fs.readdirSync(ROOT)) {
    const scenes = path.join(ROOT, rec, 'scenes'); // never before-repair/, which keeps an original under the live take's name
    if (!fs.existsSync(scenes)) continue;
    for (const sc of fs.readdirSync(scenes)) {
      const dir = path.join(scenes, sc);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const f of fs.readdirSync(dir)) {
        if (!/^take-\d+\.mp4$/.test(f)) continue; // skips .camera.mp4 and an interrupted repair's .repairing.mp4
        const p = path.join(dir, f);
        const s = fs.statSync(p);
        out.push({ path: p, recording: rec, size: s.size, mtime: s.mtimeMs });
      }
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

async function main() {
  const cmd = args[0];
  if (cmd === 'writing') {
    const secs = Number(opt('--seconds', 6));
    const before = new Map(takes().map(t => [t.path, t.size]));
    await sleep(secs * 1000);
    const grew = takes().filter(t => t.size > (before.get(t.path) ?? 0));
    if (grew.length) { console.log(`writing: ${grew[0].recording} (${path.basename(grew[0].path)}, ${(grew[0].size / 1e6).toFixed(1)} MB)`); return; }
    console.log(`NOT WRITING: no take grew in ${secs} s. The recording has not started, or Prodoozie stopped it.`);
    process.exit(1);
  }
  if (cmd === 'newest') {
    const since = opt('--since');
    const t0 = since ? (/^\d+$/.test(since) ? Number(since) : Date.parse(since)) : 0;
    const t = takes()[0];
    if (!t || t.mtime < t0) { console.error('no take newer than the run'); process.exit(1); }
    const s1 = t.size;
    await sleep(2000);
    if (fs.statSync(t.path).size !== s1) { console.error(`still being written: ${t.path}. Stop the recording and wait for Prodoozie to save it.`); process.exit(1); }
    console.log(t.path);
    return;
  }
  console.error('usage: take.cjs writing [--seconds 6] | newest [--since <time>]');
  process.exit(2);
}
main();

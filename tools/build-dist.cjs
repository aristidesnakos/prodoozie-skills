#!/usr/bin/env node
/**
 * node tools/build-dist.cjs [--check]
 *
 * Builds dist/<name>/ for every skill in PUBLISHED:
 *   dist/<name>/manifest.json        every file of the skill, with its path (relative to the manifest's own URL), size and sha256
 *   dist/<name>/<name>.zip           the same files, no node_modules, in sorted order with fixed times, so the same sources make the same zip
 *
 * --check builds nothing: it exits 1 when any dist/<name>/manifest.json is not what the sources would make, and when a skill's LICENSE
 * differs from the repo's. Run it before a commit that touches a skill, and the site's sync script runs it before it copies.
 */
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PUBLISHED = ['website-promo-short', 'install-video']; // a skill in skills/ that is not listed here is not packaged
const DIST = path.join(ROOT, 'dist');
const SKIP = new Set(['node_modules', 'work', 'out', '.DS_Store', '.git']);
const check = process.argv.includes('--check');
const LICENSE = fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8');
const FIXED = new Date('2026-01-01T00:00:00Z');

function walk(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.name.endsWith('.mp4')) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), r));
    else if (e.isFile()) out.push(r);
  }
  return out;
}
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

function manifestFor(name) {
  const skill = path.join(ROOT, 'skills', name);
  const files = walk(skill).sort();
  const pkg = JSON.parse(fs.readFileSync(path.join(skill, 'package.json'), 'utf8'));
  const deps = Object.keys(pkg.dependencies || {}).length > 0;
  const doctor = fs.existsSync(path.join(skill, 'scripts', 'doctor.cjs'));
  const steps = [deps && '`npm install` in that folder', doctor && '`node scripts/doctor.cjs`'].filter(Boolean);
  return {
    skill, files, deps,
    manifest: {
      name,
      version: pkg.version,
      license: pkg.license,
      install: {
        to: `~/.claude/skills/${name}/`,
        note: "Each path is relative to this manifest's own URL. Put every file at the same path under the folder above, check its sha256" +
          (steps.length ? `, then run ${steps.join(' and ')}.` : '. Nothing to install: the scripts use only Node and ffmpeg.'),
      },
      files: files.map(p => ({ path: p, bytes: fs.statSync(path.join(skill, p)).size, sha256: sha(path.join(skill, p)) })),
    },
  };
}

let stale = 0;
for (const name of PUBLISHED) {
  const { skill, files, deps, manifest } = manifestFor(name);
  const out = path.join(DIST, name);
  if (fs.readFileSync(path.join(skill, 'LICENSE'), 'utf8') !== LICENSE) {
    console.error(`${name}: the skill's LICENSE differs from the repo's: copy LICENSE into skills/${name}/`);
    process.exit(1);
  }
  if (check) {
    const file = path.join(out, 'manifest.json');
    const have = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    const same = have && JSON.stringify({ ...have, zip: undefined }) === JSON.stringify(manifest);
    console.log(same ? `dist/${name}/ is current (${files.length} files)` : `dist/${name}/ is out of date: run node tools/build-dist.cjs`);
    if (!same) stale++;
    continue;
  }
  // The zip: a staging copy with fixed times, added in sorted order, no extra file attributes (-X), so it is reproducible.
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'dist-'));
  const top = path.join(stage, name);
  for (const p of files) {
    const dest = path.join(top, p);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(skill, p), dest);
    fs.chmodSync(dest, 0o644);
  }
  for (const p of [...files, ...new Set(files.map(f => path.dirname(f)).filter(d => d !== '.'))]) fs.utimesSync(path.join(top, p), FIXED, FIXED);
  fs.utimesSync(top, FIXED, FIXED);
  fs.mkdirSync(out, { recursive: true });
  const zip = path.join(out, `${name}.zip`);
  fs.rmSync(zip, { force: true });
  execFileSync('zip', ['-X', '-q', zip, ...files.map(f => `${name}/${f}`)], { cwd: stage });
  fs.rmSync(stage, { recursive: true, force: true });
  manifest.zip = {
    path: `${name}.zip`, bytes: fs.statSync(zip).size, sha256: sha(zip),
    note: deps ? 'The same files as one archive; unzip into ~/.claude/skills/ and run `npm install` in the new folder.' : 'The same files as one archive; unzip into ~/.claude/skills/.',
  };
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`dist/${name}/manifest.json: ${files.length} files; dist/${name}/${name}.zip: ${(manifest.zip.bytes / 1024).toFixed(0)} KB, sha256 ${manifest.zip.sha256.slice(0, 12)}…`);
}
if (check) process.exit(stale ? 1 : 0);

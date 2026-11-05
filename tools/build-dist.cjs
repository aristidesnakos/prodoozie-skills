#!/usr/bin/env node
/**
 * node tools/build-dist.cjs [--check]
 *
 * Builds dist/ from skills/website-promo-short/:
 *   dist/manifest.json               every file of the skill, with its path (relative to the manifest's own URL), size and sha256
 *   dist/website-promo-short.zip     the same files, no node_modules, in sorted order with fixed times, so the same sources make the same zip
 *
 * --check builds nothing: it exits 1 when dist/manifest.json is not what the sources would make, and when the skill's LICENSE differs
 * from the repo's. Run it before a commit that touches the skill, and the site's sync script runs it before it copies.
 */
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const NAME = 'website-promo-short';
const SKILL = path.join(ROOT, 'skills', NAME);
const DIST = path.join(ROOT, 'dist');
const SKIP = new Set(['node_modules', 'work', 'out', '.DS_Store', '.git']);
const check = process.argv.includes('--check');

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
const files = walk(SKILL).sort();
const pkg = JSON.parse(fs.readFileSync(path.join(SKILL, 'package.json'), 'utf8'));
const manifest = {
  name: NAME,
  version: pkg.version,
  license: pkg.license,
  install: {
    to: `~/.claude/skills/${NAME}/`,
    note: "Each path is relative to this manifest's own URL. Put every file at the same path under the folder above, check its sha256, then run `npm install` in that folder and `node scripts/doctor.cjs`.",
  },
  files: files.map(p => ({ path: p, bytes: fs.statSync(path.join(SKILL, p)).size, sha256: sha(path.join(SKILL, p)) })),
};

if (fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8') !== fs.readFileSync(path.join(SKILL, 'LICENSE'), 'utf8')) {
  console.error('the skill\'s LICENSE differs from the repo\'s: copy LICENSE into skills/website-promo-short/');
  process.exit(1);
}

if (check) {
  const have = fs.existsSync(path.join(DIST, 'manifest.json')) ? JSON.parse(fs.readFileSync(path.join(DIST, 'manifest.json'), 'utf8')) : null;
  const same = have && JSON.stringify({ ...have, zip: undefined }) === JSON.stringify(manifest);
  console.log(same ? `dist/ is current (${files.length} files)` : 'dist/ is out of date: run node tools/build-dist.cjs');
  process.exit(same ? 0 : 1);
}

// The zip: a staging copy with fixed times, added in sorted order, no extra file attributes (-X), so it is reproducible.
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'dist-'));
const top = path.join(stage, NAME);
for (const p of files) {
  const dest = path.join(top, p);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(SKILL, p), dest);
  fs.chmodSync(dest, 0o644);
}
for (const p of [...files, ...new Set(files.map(f => path.dirname(f)).filter(d => d !== '.'))]) fs.utimesSync(path.join(top, p), new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'));
fs.utimesSync(top, new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'));
fs.mkdirSync(DIST, { recursive: true });
const zip = path.join(DIST, `${NAME}.zip`);
fs.rmSync(zip, { force: true });
execFileSync('zip', ['-X', '-q', zip, ...files.map(f => `${NAME}/${f}`)], { cwd: stage });
fs.rmSync(stage, { recursive: true, force: true });

manifest.zip = { path: `${NAME}.zip`, bytes: fs.statSync(zip).size, sha256: sha(zip), note: 'The same files as one archive; unzip into ~/.claude/skills/ and run `npm install` in the new folder.' };
fs.writeFileSync(path.join(DIST, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`dist/manifest.json: ${files.length} files; dist/${NAME}.zip: ${(manifest.zip.bytes / 1024).toFixed(0)} KB, sha256 ${manifest.zip.sha256.slice(0, 12)}…`);

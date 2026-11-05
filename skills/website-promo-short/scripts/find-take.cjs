#!/usr/bin/env node
/**
 * node find-take.cjs <promo.json> [take-file] [--projects <folder>]
 *
 * Picks the recording `run.cjs play` was filmed in, checks it can be that one, and writes its path to <workDir>/take-path.txt, which
 * analyze-take.cjs reads. Give a file (Prodoozie's take, or any full-screen recording at 2x: a QuickTime or Shift-Command-5 .mov works the
 * same, untested) to skip the search.
 *
 * With no file it looks at Prodoozie's takes: the newest take-NNN.mp4 at <projects>/<recording>/scenes/<scene>/, <projects> being
 * ~/Movies/iRecord/Projects (the folder keeps the name Prodoozie had before; pass --projects if you moved it). A take's .camera.mp4, a
 * repair's .repairing.mp4 and anything under before-repair/ or .trash/ are never taken.
 *
 * It refuses (exit 2) a take last written before the run started, and one written in the last 4 s (the recorder is still saving it).
 * It warns when the take looks cut short. What the take really contains is decided by analyze-take.cjs: the magenta screen, and the
 * steps running to its end.
 *
 * The take shows the whole desktop. It stays private: nothing in this skill sends it anywhere, and neither should you.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadConfig, findTakes, DEFAULT_PROJECTS } = require('./lib.cjs');

const args = process.argv.slice(2);
const positional = [];
let projectsArg = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--projects') projectsArg = args[++i];
  else positional.push(args[i]);
}
const home = p => path.resolve(p.replace(/^~(?=$|\/)/, os.homedir()));
const projects = projectsArg ? home(projectsArg) : DEFAULT_PROJECTS;
const cfg = loadConfig(positional[0]);
const given = positional[1] ? home(positional[1]) : null;

const STILL_SAVING_MS = 4000;

const fail = msg => {
  console.error(msg);
  process.exit(2);
};

let take = given;
if (take) {
  if (!fs.existsSync(take)) fail(`no such file: ${take}`);
} else {
  if (!fs.existsSync(projects)) fail(`no Prodoozie recordings folder at ${projects}. Pass the take's path: node find-take.cjs <promo.json> <take.mp4> (or --projects <folder>).`);
  const takes = findTakes(projects);
  if (!takes.length) fail(`no take-NNN.mp4 under ${projects}/<recording>/scenes/<scene>/. Is the recording saved? Or pass the take's path.`);
  take = takes[0].file;
}

const stat = fs.statSync(take);
const age = Date.now() - stat.mtimeMs;
if (age < STILL_SAVING_MS) fail(`${take} was written ${Math.round(age / 1000)} s ago: the recorder is probably still saving it. Press Stop, wait a few seconds, run this again.`);

let duration = null;
try {
  duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', take], { encoding: 'utf8' }).trim());
} catch {}
if (!duration) fail(`ffprobe could not read ${take}: it is not a finished recording (still saving, or damaged).`);

const runFile = path.join(cfg.workDir, 'run.json');
if (fs.existsSync(runFile)) {
  const run = JSON.parse(fs.readFileSync(runFile, 'utf8'));
  if (stat.mtimeMs < run.t0) {
    fail(`the newest take (${take}, last written ${new Date(stat.mtimeMs).toLocaleTimeString()}) is older than this run (started ${new Date(run.t0).toLocaleTimeString()}), so it cannot be it. The recording is still going, or was not saved.`);
  }
  if (stat.mtimeMs < run.tEnd - 1000) console.warn(`WARNING: the take was last written before the steps finished (${new Date(stat.mtimeMs).toLocaleTimeString()} against ${new Date(run.tEnd).toLocaleTimeString()}): the recording may have been stopped early.`);
  const startedAt = stat.mtimeMs - duration * 1000;
  if (startedAt > run.t0) console.warn(`WARNING: by its length the take began (${new Date(startedAt).toLocaleTimeString()}) after the steps did (${new Date(run.t0).toLocaleTimeString()}): it cannot hold the magenta screen. analyze-take.cjs will say.`);
} else {
  console.warn('note: no run.json in the work folder, so the take could not be checked against a run.');
}

fs.writeFileSync(path.join(cfg.workDir, 'take-path.txt'), take);
console.log(`take: ${take}`);
console.log(`      ${duration.toFixed(1)} s, ${(stat.size / 1048576).toFixed(0)} MB, saved ${new Date(stat.mtimeMs).toLocaleString()}`);
console.log('This recording shows the whole desktop. Keep it private; only the cropped video this skill builds is for sharing.');

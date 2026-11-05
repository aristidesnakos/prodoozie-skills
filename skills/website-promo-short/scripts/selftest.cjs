#!/usr/bin/env node
/**
 * node selftest.cjs [--keep]
 *
 * Proves the skill works on this Mac without visiting any site, opening a window you can see, or recording anything. About a minute.
 *
 *   1. serves examples/demo-site on localhost and rehearses its promo.json headless: no step errors, the page loaded once per page and
 *      every request carried the user-agent marker, the cookie banner was dismissed, the stills were taken;
 *   2. renders the two overlays (frame.png, end card.png), 1080x1920 each (needs the internet once: the end card's fonts are Google Fonts);
 *   3. builds a stand-in for a recording (a magenta calibration screen, then one of the rehearsal's stills, on a grey 3360x2100 desktop) and
 *      sends it through find-take, analyze-take and build-video, beside decoys find-take must skip (a camera file, a repair's copy,
 *      before-repair/, the Trash, and a take older than the run). The video must come out 1080x1920, 60 fps, H.264, the right length.
 *
 *   4. checks the test `play` makes when told to go: a take written in the last 20 s is a recording, anything else is not.
 *
 * What it cannot prove: that the recorder films the screen, and how a real site behaves. `run.cjs play` and your own pages are those.
 * --keep leaves the temp folder for you to look at.
 */
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const SKILL = path.resolve(__dirname, '..');
const S = __dirname;
const keep = process.argv.includes('--keep');
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`);
};
const node = (script, args, env = {}) => execFileSync(process.execPath, [path.join(S, script), ...args], { encoding: 'utf8', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
const freePort = () =>
  new Promise(res => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });
const getJson = (port, p) =>
  new Promise((res, rej) => http.get({ host: '127.0.0.1', port, path: p, agent: false }, r => {
    let b = '';
    r.on('data', c => (b += c));
    r.on('end', () => res(JSON.parse(b)));
  }).on('error', rej));
const pngSize = f => {
  const b = fs.readFileSync(f);
  return b.readUInt32BE(16) + 'x' + b.readUInt32BE(20);
};

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'promo-selftest-'));
  const proj = path.join(tmp, 'demo');
  fs.cpSync(path.join(SKILL, 'examples', 'demo-site'), proj, { recursive: true });
  const port = await freePort();
  const cfgPath = path.join(proj, 'promo.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8').replaceAll('9477', String(port)));
  cfg.workDir = 'work';
  cfg.outDir = 'out';
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  const server = spawn(process.execPath, [path.join(proj, 'server.cjs')], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  let failed = false;
  try {
    for (let i = 0; i < 40; i++) {
      try {
        await getJson(port, '/__reqs');
        break;
      } catch {
        await new Promise(r => setTimeout(r, 150));
      }
    }
    console.log(`website-promo-short: selftest (demo site on port ${port}, files in ${tmp})\n`);

    // 1. rehearse
    console.log('1. rehearse, headless');
    let out;
    try {
      out = node('run.cjs', ['rehearse', cfgPath]);
      check('the steps ran with no error', /steps total/.test(out));
    } catch (e) {
      check('the steps ran with no error', false, (e.stderr || e.message).toString().split('\n')[0]);
    }
    const reqs = (await getJson(port, '/__reqs')).filter(r => !r.path.startsWith('/__'));
    const count = p => reqs.filter(r => r.path === p).length;
    check('each page loaded once', count('/') === 1 && count('/roasts') === 1, reqs.map(r => r.path).join(' '));
    check('every request carried the user-agent marker', reqs.length > 0 && reqs.every(r => r.ua.endsWith(cfg.userAgentMarker) && !r.ua.includes('HeadlessChrome')));
    check('the cookie banner was dismissed', /banner dismissed: true/.test(out || ''));
    const wk = path.join(proj, 'work');
    const stills = (cfg.stills || []).map(l => path.join(wk, 'rehearsal', l.replace(/[^\w-]+/g, '-') + '.png'));
    check('the stills were taken', stills.length > 0 && stills.every(f => fs.existsSync(f)));
    const rehearsal = fs.existsSync(path.join(wk, 'rehearsal.json')) ? JSON.parse(fs.readFileSync(path.join(wk, 'rehearsal.json'), 'utf8')) : null;
    check('rehearsal.json holds the true length', !!rehearsal && rehearsal.stillFreeMs > 1000, rehearsal ? `${(rehearsal.stillFreeMs / 1000).toFixed(1)} s` : '');

    // 2. overlays
    console.log('\n2. overlays');
    try {
      node('render-assets.cjs', [cfgPath]);
      check('frame.png is 1080x1920', pngSize(path.join(wk, 'frame.png')) === '1080x1920');
      check('endcard.png is 1080x1920', pngSize(path.join(wk, 'endcard.png')) === '1080x1920');
    } catch (e) {
      check('the overlays rendered', false, (e.stderr || e.message).toString().split('\n').filter(Boolean).slice(-1)[0]);
    }

    // 3. a stand-in recording through find-take, analyze-take and build-video
    console.log('\n3. a stand-in for the recording, through find-take, analyze-take and build-video');
    const MAGENTA_S = 3;
    const STEPS_S = 6;
    const PAGE_S = 8;
    const projects = path.join(tmp, 'Projects');
    const scene = path.join(projects, 'Demo', 'scenes', 'scene-001');
    const decoys = [path.join(projects, 'Demo', 'before-repair', 'abc'), path.join(projects, 'Demo', '.trash')];
    for (const d of [scene, ...decoys]) fs.mkdirSync(d, { recursive: true });
    const take = path.join(scene, 'take-002.mp4');
    const still = stills[1] || stills[0];
    const box = { x: 120, y: 204, w: cfg.viewport.width * 2, h: cfg.viewport.height * 2 };
    const ff = args => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      // a grey 3360x2100 desktop with the window in it: magenta (as a capture renders it) for 3 s, then the page for 8
      ff(['-f', 'lavfi', '-i', `color=c=0x303030:s=3360x2100:r=60:d=${MAGENTA_S + PAGE_S}`, '-f', 'lavfi', '-i', `color=c=0xEC2DF5:s=${box.w}x${box.h}:r=60:d=${MAGENTA_S}`, '-loop', '1', '-framerate', '60', '-t', String(PAGE_S), '-i', still,
        '-filter_complex', `[2:v]scale=${box.w}:${box.h}[pg];[1:v][pg]concat=n=2:v=1:a=0[win];[0:v][win]overlay=${box.x}:${box.y}:shortest=1,format=yuv420p[v]`, '-map', '[v]', '-c:v', 'libx264', '-preset', 'ultrafast', '-r', '60', take]);
      check('a stand-in recording was written', fs.existsSync(take));
    } catch (e) {
      check('a stand-in recording was written', false, (e.stderr || e.message).toString().split('\n')[0]);
    }
    const now = Date.now();
    const tStart = now - 60000; // the recording began 60 s ago
    const t0 = tStart + MAGENTA_S * 1000;
    const tEnd = t0 + STEPS_S * 1000;
    fs.writeFileSync(path.join(wk, 'run.json'), JSON.stringify({ mode: 'play', t0, tEnd, tOpen: tStart, marks: [], notes: [] }));
    const setTime = (f, ms) => fs.utimesSync(f, new Date(ms), new Date(ms));
    setTime(take, tEnd + 2000);
    // decoys, all NEWER than the real take: none may be picked
    const dummy = f => {
      fs.copyFileSync(take, f);
      setTime(f, tEnd + 4000);
    };
    dummy(path.join(scene, 'take-002.camera.mp4'));
    dummy(path.join(scene, 'take-003.repairing.mp4'));
    dummy(path.join(decoys[0], 'take-004.mp4'));
    dummy(path.join(decoys[1], 'take-005.mp4'));
    let found = '';
    try {
      node('find-take.cjs', [cfgPath, '--projects', projects]);
      found = fs.readFileSync(path.join(wk, 'take-path.txt'), 'utf8').trim();
    } catch {}
    check('find-take picks the real take and skips the decoys', found === take, found ? path.relative(projects, found) : 'it refused');

    // an older take than the run must be refused
    const old = path.join(tmp, 'old.mp4');
    fs.copyFileSync(take, old);
    setTime(old, t0 - 3600000);
    let refusedOld = false;
    try {
      node('find-take.cjs', [cfgPath, old]);
    } catch (e) {
      refusedOld = e.status === 2;
    }
    check('find-take refuses a take older than the run', refusedOld);
    // one still being written must be refused
    const fresh = path.join(tmp, 'fresh.mp4');
    fs.copyFileSync(take, fresh);
    let refusedFresh = false;
    try {
      node('find-take.cjs', [cfgPath, fresh]);
    } catch (e) {
      refusedFresh = e.status === 2;
    }
    check('find-take refuses a take written seconds ago', refusedFresh);
    fs.writeFileSync(path.join(wk, 'take-path.txt'), take); // the refusals above wrote nothing; this is the right one

    try {
      node('analyze-take.cjs', [cfgPath]);
      const a = JSON.parse(fs.readFileSync(path.join(wk, 'take-analysis.json'), 'utf8'));
      check('analyze-take finds the window', a.box.x === box.x && a.box.y === box.y && Math.abs(a.box.w - box.w) <= 2 && Math.abs(a.box.h - box.h) <= 2, JSON.stringify(a.box));
      check('analyze-take finds where the script began', Math.abs(a.startTime - MAGENTA_S) < 0.1, `${a.startTime} s`);
    } catch (e) {
      check('analyze-take ran', false, (e.stderr || e.message).toString().split('\n').filter(Boolean).slice(-1)[0]);
    }
    try {
      const b = node('build-video.cjs', [cfgPath]);
      const mp4 = path.join(proj, 'out', `${cfg.name}.mp4`);
      const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,avg_frame_rate', '-show_entries', 'format=duration', '-of', 'json', mp4], { encoding: 'utf8' });
      const j = JSON.parse(probe);
      const want = STEPS_S + cfg.tailSec + cfg.endHoldSec - cfg.transitionSec;
      check('the video is 1080x1920, 60 fps, H.264', j.streams[0].width === 1080 && j.streams[0].height === 1920 && j.streams[0].avg_frame_rate === '60/1' && j.streams[0].codec_name === 'h264');
      check('the video is the right length', Math.abs(Number(j.format.duration) - want) < 0.3, `${Number(j.format.duration).toFixed(2)} s, expected about ${want.toFixed(2)}`);
      check('the video has no sound', !/audio/.test(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', mp4], { encoding: 'utf8' })));
      check('the bottom-left check ran and found no link status bubble', /no link status bubble/.test(b));
    } catch (e) {
      check('build-video ran', false, (e.stderr || e.message).toString().split('\n').filter(Boolean).slice(-1)[0]);
    }

    // 4. the recorder check `play` makes when told to go (no window needed)
    console.log('\n4. the check that a recording is running');
    const { recorderSeen } = require('./lib.cjs');
    const store = path.join(tmp, 'Store');
    const sc = path.join(store, 'Rec', 'scenes', 'scene-001');
    fs.mkdirSync(sc, { recursive: true });
    const tk = path.join(sc, 'take-001.mp4');
    fs.writeFileSync(tk, 'x');
    const at = ms => fs.utimesSync(tk, new Date(ms), new Date(ms));
    const base = { projects: store, recorder: 'prodoozie', _dir: tmp };
    at(Date.now() - 600000);
    const stale = recorderSeen(base);
    check('a take last written ten minutes ago is not a recording', stale.ok === false && /no take is being written/.test(stale.message), stale.message);
    at(Date.now() - 3000);
    check('a take written 3 s ago is a recording', recorderSeen(base).ok === true);
    fs.copyFileSync(tk, path.join(sc, 'take-001.camera.mp4'));
    fs.writeFileSync(path.join(sc, 'take-002.repairing.mp4'), 'x');
    at(Date.now() - 600000);
    check('a camera file or a repair copy does not make it one', recorderSeen(base).ok === false);
    check('recorder "other" is not checked', recorderSeen({ ...base, recorder: 'other' }).ok === true);
    const noStore = recorderSeen({ ...base, projects: path.join(tmp, 'nowhere') });
    check('no Prodoozie folder: not refused, said', noStore.ok === true && /could not check/.test(noStore.note));
  } finally {
    server.kill();
    if (!keep) fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 4, retryDelay: 300 });
    else console.log(`\nkept: ${tmp}`);
  }
  const bad = results.filter(r => !r).length;
  console.log(`\n${results.length - bad} of ${results.length} checks passed.${bad ? ' Something above failed: run `node scripts/doctor.cjs`.' : ''}`);
  process.exit(bad ? 1 : 0);
})().catch(e => {
  console.error(e.stack || e);
  process.exit(1);
});

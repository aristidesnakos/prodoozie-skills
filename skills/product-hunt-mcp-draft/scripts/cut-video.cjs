#!/usr/bin/env node
/**
 * node scripts/cut-video.cjs <cut.json> [--frames]
 *
 * Cuts a Full Screen recording of the chat window into a 1920x1080 video: the chat column cropped out of the take on the left, a step
 * label on the right that changes at the times cut.json gives, and an end card. Labels and the card are drawn by a throwaway headless
 * Chrome (puppeteer-core) in the Mac's own fonts; ffmpeg does the rest. Silent, 30 fps, H.264, fast start, the take converted to BT.709 primaries and the file tagged BT.709 primaries on the sRGB
 * curve with the BT.709 matrix, which is how Prodoozie's own Save Video tags a file.
 *
 * cut.json (paths relative to the file; every field in references/cut-json.md):
 *   { "take": "...take-001.mp4", "output": "draft-by-mcp.mp4", "crop": [x, y, w, h],
 *     "kicker": "Product Hunt, by MCP",
 *     "steps": [ { "from": 0, "to": 17, "call": "", "say": "...", "note": "...", "step": "" }, ... ],
 *     "end": { "big": "7 MCP calls.", "sub": "...", "url": "example.com", "seconds": 3.5 } }
 *
 * --frames writes six check frames beside the output (<output>-frames/), to be looked at before the video is shown to anyone.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const SKILL_DIR = path.resolve(__dirname, '..');
const W = 1920, H = 1080, FPS = 30;
const BRAND_DEFAULT = {
  ground: '#0B0907', ink: '#F2ECE4', accent: '#E8A317',
  display: 'Futura', body: 'Helvetica Neue', mono: 'Menlo',
};

function die(msg) { console.error(`cut-video: ${msg}`); process.exit(1); }
function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function loadCut(file) {
  if (!file) die('usage: node scripts/cut-video.cjs <cut.json> [--frames]');
  const dir = path.dirname(path.resolve(file));
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const home = p => p.replace(/^~(?=$|\/)/, os.homedir());
  const cut = {
    take: path.resolve(dir, home(raw.take || '')),
    output: path.resolve(dir, home(raw.output || 'draft-by-mcp.mp4')),
    crop: raw.crop,
    duration: raw.duration,
    kicker: raw.kicker || '',
    steps: raw.steps || [],
    end: raw.end || null,
    brand: { ...BRAND_DEFAULT, ...(raw.brand || {}) },
    chrome: raw.chrome || process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  };
  if (!fs.existsSync(cut.take)) die(`take not found: ${cut.take}`);
  if (!Array.isArray(cut.crop) || cut.crop.length !== 4 || cut.crop.some(n => !Number.isFinite(n) || n < 0)) die('"crop" must be [x, y, w, h] in take pixels');
  if (!cut.steps.length) die('"steps" is empty');
  cut.steps.forEach((s, i) => {
    if (!(Number.isFinite(s.from) && Number.isFinite(s.to) && s.to > s.from)) die(`steps[${i}]: "from" and "to" must be seconds with to > from`);
    if (!s.say) die(`steps[${i}]: "say" is empty`);
  });
  return cut;
}

function probe(take) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
    '-show_entries', 'format=duration', '-of', 'json', take]).toString();
  const j = JSON.parse(out);
  return { w: j.streams[0].width, h: j.streams[0].height, duration: parseFloat(j.format.duration) };
}

// The take's own colour tags, as the ffmpeg `colorspace` filter step that brings it to BT.709 primaries on the sRGB curve. An untagged
// take is read as a Prodoozie take (Display P3, sRGB curve, BT.709 matrix); a take already in BT.709 primaries needs no step.
function takeColorspace(take) {
  const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
    'stream=color_primaries,color_transfer,color_space', '-of', 'json', take]).toString()).streams[0] || {};
  const known = v => (v && v !== 'unknown' && v !== 'reserved' ? v : null);
  const primaries = known(j.color_primaries) || 'smpte432';
  const trc = known(j.color_transfer) || 'iec61966-2-1';
  const space = known(j.color_space) || 'bt709';
  if (primaries === 'bt709' && trc === 'iec61966-2-1' && space === 'bt709') return '';
  return `colorspace=primaries=bt709:trc=iec61966-2-1:space=bt709:range=tv:iprimaries=${primaries}:itrc=${trc}:ispace=${space}:irange=tv:format=yuv420p,`;
}

function puppeteer() {
  for (const name of ['puppeteer-core', 'puppeteer']) {
    try { return require(require.resolve(name, { paths: [SKILL_DIR] })); } catch {}
  }
  die(`puppeteer-core not found. Run \`npm install\` in ${SKILL_DIR}.`);
}

function labelHTML(cut, s) {
  const b = cut.brand;
  return `<!doctype html><html><head><style>
  html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:transparent}
  .panel{position:absolute;left:1030px;top:0;width:790px;height:${H}px;display:flex;flex-direction:column;justify-content:center}
  .kicker{font-family:'${b.display}';font-weight:600;font-size:26px;letter-spacing:6px;color:${b.accent};text-transform:uppercase;margin-bottom:34px}
  .call{font-family:'${b.mono}';font-weight:500;font-size:40px;color:${b.accent};margin-bottom:22px}
  .say{font-family:'${b.display}';font-weight:600;font-size:58px;line-height:1.12;color:${b.ink}}
  .note{font-family:'${b.body}';font-size:28px;line-height:1.45;color:${b.ink};opacity:.72;margin-top:30px}
  .step{font-family:'${b.body}';font-weight:500;font-size:24px;color:${b.ink};opacity:.55;position:absolute;left:1030px;bottom:70px;letter-spacing:1px}
  </style></head><body><div class="panel">
  ${cut.kicker ? `<div class="kicker">${esc(cut.kicker)}</div>` : ''}${s.call ? `<div class="call">${esc(s.call)}</div>` : ''}
  <div class="say">${esc(s.say)}</div>${s.note ? `<div class="note">${esc(s.note)}</div>` : ''}</div>
  ${s.step ? `<div class="step">${esc(s.step)}</div>` : ''}</body></html>`;
}

function endHTML(cut) {
  const b = cut.brand, e = cut.end;
  return `<!doctype html><html><head><style>
  html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:${b.ground};display:flex;align-items:center;justify-content:center}
  .wrap{text-align:center}
  .big{font-family:'${b.display}';font-weight:700;font-size:150px;color:${b.ink};letter-spacing:-1px}
  .sub{font-family:'${b.body}';font-size:40px;color:${b.ink};opacity:.75;margin-top:18px}
  .url{font-family:'${b.display}';font-weight:600;font-size:44px;letter-spacing:8px;color:${b.accent};margin-top:90px;text-transform:uppercase}
  </style></head><body><div class="wrap"><div class="big">${esc(e.big)}</div>
  ${e.sub ? `<div class="sub">${esc(e.sub)}</div>` : ''}${e.url ? `<div class="url">${esc(e.url)}</div>` : ''}</div></body></html>`;
}

async function render(cut, dir) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cut-video-chrome-'));
  const browser = await puppeteer().launch({
    executablePath: cut.chrome, headless: 'new', userDataDir: profile,
    args: ['--no-first-run', '--no-default-browser-check'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    const files = [];
    for (const [i, s] of cut.steps.entries()) {
      await page.setContent(labelHTML(cut, s), { waitUntil: 'load' });
      const f = path.join(dir, `step-${i}.png`);
      await page.screenshot({ path: f, omitBackground: true });
      files.push(f);
    }
    let end = null;
    if (cut.end) {
      await page.setContent(endHTML(cut), { waitUntil: 'load' });
      end = path.join(dir, 'end.png');
      await page.screenshot({ path: end });
    }
    return { files, end };
  } finally {
    await browser.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

function fitBox(cw, ch) {
  // The chat column sits left of the labels: at most 860 wide and 960 tall, its top-left at (110, 60) when height-bound.
  const scale = Math.min(860 / cw, 960 / ch);
  const w = Math.round(cw * scale / 2) * 2, h = Math.round(ch * scale / 2) * 2;
  return { w, h, x: 110, y: Math.round((H - h) / 2) };
}

(async () => {
  const cut = loadCut(process.argv[2]);
  const wantFrames = process.argv.includes('--frames');
  const take = probe(cut.take);
  const [cx, cy, cw, ch] = cut.crop;
  if (cx + cw > take.w || cy + ch > take.h) die(`crop ${cut.crop.join(',')} falls outside the take (${take.w}x${take.h})`);
  const D = Math.min(cut.duration || take.duration, take.duration);
  const box = fitBox(cw, ch);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cut-video-'));
  try {
    const { files, end } = await render(cut, tmp);
    const args = ['-v', 'error', '-y', '-i', cut.take];
    for (const f of files) args.push('-loop', '1', '-t', String(D), '-i', f);
    if (end) args.push('-loop', '1', '-t', String(cut.end.seconds || 3.5), '-i', end);
    args.push('-f', 'lavfi', '-t', String(D), '-i', `color=c=${cut.brand.ground.replace('#', '0x')}:s=${W}x${H}:r=${FPS}`);
    const ground = files.length + (end ? 1 : 0) + 1;
    // Colour: the take is converted to BT.709 primaries on the sRGB curve (a Prodoozie take is Display P3 on the sRGB curve), every
    // layer is composited in RGB so the cards keep their exact values, and the file is BT.709 YCbCr tagged BT.709 primaries, sRGB
    // curve, BT.709 matrix. Overlaying RGB cards onto YUV would convert them with BT.601's matrix and shift the brand colours.
    const toBT709 = takeColorspace(cut.take);
    const chain = [`[0:v]trim=duration=${D},setpts=PTS-STARTPTS,${toBT709}crop=${cw}:${ch}:${cx}:${cy},`
      + `scale=${box.w}:${box.h}:flags=lanczos:in_color_matrix=bt709:in_range=tv,format=gbrp,fps=${FPS},setsar=1[v]`,
      `[${ground}:v]format=gbrp[g]`, `[g][v]overlay=${box.x}:${box.y}:format=gbrp[m0]`];
    cut.steps.forEach((s, i) => {
      const last = i === cut.steps.length - 1;
      // Half-open, so a frame on a boundary carries one label, never two.
      const enable = last ? `gte(t,${s.from})` : `gte(t,${s.from})*lt(t,${s.to})`;
      chain.push(`[m${i}][${i + 1}:v]overlay=format=gbrp:enable='${enable}'[m${i + 1}]`);
    });
    const n = cut.steps.length;
    const toFile = 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,'
      + 'setparams=color_primaries=bt709:color_trc=iec61966-2-1:colorspace=bt709:range=tv,setsar=1';
    chain.push(`[m${n}]${toFile}[main]`);
    if (end) {
      chain.push(`[${files.length + 1}:v]fps=${FPS},format=gbrp,${toFile}[endv]`, '[main][endv]concat=n=2:v=1:a=0[out]');
    } else {
      chain.push('[main]null[out]');
    }
    args.push('-filter_complex', chain.join(';'), '-map', '[out]', '-c:v', 'libx264', '-crf', '20', '-preset', 'slow',
      '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'iec61966-2-1', '-colorspace', 'bt709', '-color_range', 'tv',
      '-movflags', '+faststart', '-an', cut.output);
    fs.mkdirSync(path.dirname(cut.output), { recursive: true });
    execFileSync('ffmpeg', args, { stdio: 'inherit' });

    const out = probe(cut.output);
    const bytes = fs.statSync(cut.output).size;
    console.log(`wrote ${cut.output}`);
    console.log(`  ${out.w}x${out.h}, ${out.duration.toFixed(1)} s, ${(bytes / 1e6).toFixed(1)} MB, silent`);
    console.log(`  chat column ${cw}x${ch} at (${cx}, ${cy}) of ${take.w}x${take.h}, shown at ${box.w}x${box.h}`);
    if (wantFrames) {
      const fdir = cut.output.replace(/\.mp4$/i, '') + '-frames';
      fs.mkdirSync(fdir, { recursive: true });
      const times = [1, ...cut.steps.map(s => (s.from + Math.min(s.to, D)) / 2), D + (cut.end ? 1 : -1)];
      for (const t of times) {
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', t.toFixed(2), '-i', cut.output, '-frames:v', '1', '-vf', 'scale=960:-1',
          path.join(fdir, `t${t.toFixed(1).padStart(5, '0')}.jpg`)]);
      }
      console.log(`  check frames: ${fdir} (${times.length}). Look at every one before showing the video to anyone.`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch(e => die(e.stack || String(e)));

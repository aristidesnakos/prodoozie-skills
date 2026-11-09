#!/usr/bin/env node
// The terminal stage: a dark page on localhost (term.html) that shows real commands and their real output, live.
// A browser tab shows the page; Prodoozie films the screen. Use it when the agent cannot type into Terminal.app.
//
//   stage.cjs serve   [--port 8765]          serve the stage folder on 127.0.0.1 (run it in the background)
//   stage.cjs stop                           stop that server
//   stage.cjs reset                          clear the page
//   stage.cjs run "<shown>" [options] -- <argv...>
//        types <shown> on the page (33 ms a character), then runs <argv> and streams every output line to it.
//        --cwd <dir>        folder the command runs in (default: the current folder)
//        --env K=V          extra environment, repeatable
//        --hide <regex>     drop output lines that match, repeatable
//        --pty              run under `script -q /dev/null` (for commands that print only to a terminal)
//        --capture-open     put a stub `open` first in PATH and set BROWSER to it, so a sign-in link lands in
//                           <stage>/opened-url.txt instead of a browser tab (read it with `opened`)
//   stage.cjs opened  [--wait 20]            print the captured link once it exists (it is a one-time sign-in link:
//                                            never paste it into a report)
//   stage.cjs drop-last                      remove the last command and its output from the page
//
// The stage folder is ./work/stage, or --dir <dir>, or STAGE_DIR. The page's prompt word is ?prompt=<word> (default "demo").
'use strict';
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const args = process.argv.slice(2);
const cmd = args.shift();

function takeOpt(name, many = false) {
  const out = [];
  for (;;) {
    const i = args.indexOf(name);
    if (i < 0 || (args.indexOf('--') >= 0 && i > args.indexOf('--'))) break;
    out.push(args[i + 1]);
    args.splice(i, 2);
    if (!many) break;
  }
  return many ? out : out[0];
}
function takeFlag(name) {
  const i = args.indexOf(name);
  if (i < 0 || (args.indexOf('--') >= 0 && i > args.indexOf('--'))) return false;
  args.splice(i, 1);
  return true;
}

const DIR = path.resolve(takeOpt('--dir') || process.env.STAGE_DIR || 'work/stage');
const LOG = path.join(DIR, 'log.json');
const OPENED = path.join(DIR, 'opened-url.txt');
fs.mkdirSync(DIR, { recursive: true });

const load = () => { try { return JSON.parse(fs.readFileSync(LOG, 'utf8')); } catch { return []; } };
const save = ev => { fs.writeFileSync(LOG + '.tmp', JSON.stringify(ev)); fs.renameSync(LOG + '.tmp', LOG); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// OSC (titles, links), CSI (colours, cursor moves) and two-byte escapes; a literal ^D a pty echoes on exit
const ANSI = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b[@-Z\\-_]|\^D/g;

async function main() {
  if (cmd === 'serve') {
    const port = Number(takeOpt('--port') || 8765);
    if (!fs.existsSync(LOG)) save([]);
    const page = fs.readFileSync(path.join(__dirname, 'term.html'));
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://x');
      if (url.pathname === '/' || url.pathname === '/term.html') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(page);
      }
      if (url.pathname === '/log.json') {
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        return res.end(fs.existsSync(LOG) ? fs.readFileSync(LOG) : '[]');
      }
      res.writeHead(404); res.end();
    });
    server.listen(port, '127.0.0.1', () => {
      fs.writeFileSync(path.join(DIR, 'server.pid'), String(process.pid));
      console.log(`stage: http://127.0.0.1:${port}/term.html  (folder ${DIR})`);
    });
    return;
  }
  if (cmd === 'stop') {
    const f = path.join(DIR, 'server.pid');
    if (!fs.existsSync(f)) return console.log('stage: no server.pid, nothing to stop');
    try { process.kill(Number(fs.readFileSync(f, 'utf8')), 'SIGTERM'); console.log('stage: stopped'); } catch { console.log('stage: server was not running'); }
    fs.rmSync(f, { force: true });
    return;
  }
  if (cmd === 'reset') { save([]); fs.rmSync(OPENED, { force: true }); return console.log('stage: cleared'); }
  if (cmd === 'drop-last') {
    const ev = load();
    let i = ev.length - 1;
    while (i >= 0 && ev[i].t !== 'cmd') i--;
    if (i < 0) return console.log('stage: no command to drop');
    save(ev.slice(0, i));
    return console.log(`stage: dropped "${ev[i].text.slice(0, 60)}" and ${ev.length - i - 1} output lines`);
  }
  if (cmd === 'opened') {
    const wait = Number(takeOpt('--wait') || 20);
    for (let t = 0; t < wait * 2; t++) {
      if (fs.existsSync(OPENED) && fs.statSync(OPENED).size > 0) {
        return console.log(fs.readFileSync(OPENED, 'utf8').split('\n').find(l => /^https?:/.test(l)) || '');
      }
      await sleep(500);
    }
    console.error('stage: no link was opened');
    process.exit(1);
  }
  if (cmd === 'run') {
    const shown = args.shift();
    const cwd = path.resolve(takeOpt('--cwd') || '.');
    const env = { ...process.env };
    for (const kv of takeOpt('--env', true)) { const i = kv.indexOf('='); env[kv.slice(0, i)] = kv.slice(i + 1); }
    const hide = takeOpt('--hide', true).map(r => new RegExp(r));
    const pty = takeFlag('--pty');
    if (takeFlag('--capture-open')) {
      const shim = path.join(DIR, 'shim');
      fs.mkdirSync(shim, { recursive: true });
      fs.writeFileSync(path.join(shim, 'open'), `#!/bin/sh\nprintf '%s\\n' "$@" > "${OPENED}"\nexit 0\n`, { mode: 0o755 });
      fs.rmSync(OPENED, { force: true });
      env.PATH = `${shim}:${env.PATH}`;
      env.BROWSER = path.join(shim, 'open');
    }
    const dd = args.indexOf('--');
    let argv = dd >= 0 ? args.slice(dd + 1) : args;
    if (!shown || argv.length === 0) { console.error('usage: stage.cjs run "<shown>" [options] -- <argv...>'); process.exit(2); }
    if (pty) argv = ['script', '-q', '/dev/null', ...argv];

    const ev = load();
    ev.push({ t: 'cmd', text: shown, done: false });
    save(ev);
    await sleep(shown.length * 33 + 600); // the page types it first
    const child = spawn(argv[0], argv.slice(1), { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    const onData = d => {
      buf += d.toString('utf8');
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).replace(ANSI, '').replace(/\r/g, '');
        buf = buf.slice(i + 1);
        if (hide.some(r => r.test(line))) continue;
        const e = load(); e.push({ t: 'out', text: line }); save(e);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    const code = await new Promise(r => child.on('close', r));
    if (buf.trim()) onData('\n');
    const e = load();
    for (let k = e.length - 1; k >= 0; k--) if (e[k].t === 'cmd') { e[k].done = true; break; }
    save(e);
    console.log(`stage: "${shown.slice(0, 60)}" exited ${code}`);
    process.exit(code ?? 1);
  }
  console.error('usage: stage.cjs serve|stop|reset|run|opened|drop-last (see the header of this file)');
  process.exit(2);
}
main();

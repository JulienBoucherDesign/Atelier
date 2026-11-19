#!/usr/bin/env node
// Atelier engine — runs the real site on this computer and applies the changes a Claude Code cloud session sends.
//
// It watches the inbox folder for transfer files (atelier@owner@repo.tgz), unpacks them into its own copy of
// the site, runs the site's development server and serves it at http://localhost:3210 with a small badge.
// It contacts no hosting provider and no Git host: the site's files come from the transfer files only.
// Started and kept alive by mcp.mjs (the part Claude starts); it stops by itself when Claude is closed.
// No dependencies: Node.js 20 or later.
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { VERSION, dataDir, inboxDir } from './paths.mjs';

const WIN = process.platform === 'win32';
const DATA = dataDir();
const INBOX = inboxDir();
const BASE_PORT = +process.env.ATELIER_PORT || 3210;
const SUPERVISED = process.env.ATELIER_SUPERVISED === '1';
const HEARTBEAT = path.join(DATA, 'heartbeat');
const ENGINE_FILE = path.join(DATA, 'engine.json');
const LABEL = 'cloud session (not pushed)';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const exists = p => { try { fs.statSync(p); return true; } catch { return false; } };
const readJSON = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const log = m => console.log(new Date().toTimeString().slice(0, 8) + '  ' + m);

// ---------- state ----------
const S = {
  repo: '', slug: '', dir: '', id: '', seen: '', label: '', status: 'waiting', error: '', notice: '', needFull: false,
  mode: '', target: '', applied: 0, staticRoot: '', port: 0,
  dev: null, devGen: 0, clients: new Set(), token: crypto.randomBytes(16).toString('hex'),
};
const publicState = () => ({
  atelier: VERSION, repo: S.repo, showing: S.repo ? LABEL : '', id: S.id, seen: S.seen, label: S.label, status: S.status, error: S.error,
  notice: S.notice, need_full: S.needFull, mode: S.mode, applied: S.applied, url: 'http://localhost:' + S.port,
});
function broadcast(event) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(publicState())}\n\n`;
  for (const c of S.clients) c.write(msg);
}
function writeStatus() {
  try {
    fs.mkdirSync(INBOX, { recursive: true });
    fs.writeFileSync(path.join(INBOX, 'status.json'), JSON.stringify({ ...publicState(), time: new Date().toISOString() }, null, 2));
  } catch {}
}
function setStatus(status, error = '') {
  S.status = status; S.error = error;
  broadcast('status'); writeStatus();
}
function note(msg, needFull = false) { S.notice = msg; S.needFull = needFull; if (msg) log(msg); writeStatus(); broadcast('status'); }

// one job at a time on the site copy (unpack, install, start)
let chain = Promise.resolve();
const locked = fn => (chain = chain.then(fn, fn).catch(e => { log('Error: ' + (e && e.message || e)); }));

// ---------- child processes ----------
const ANSI = /\x1b\[[0-9;?]*[ -\/]*[@-~]/g;
const NOISE = /^(\+ |\++$|(dev|optional)?[dD]ependencies:$|Progress: .*[^e]$|Packages: )/;
const URL_RE = /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1?\]|0\.0\.0\.0):(\d{2,5})/;
function childEnv(extra = {}) {
  const env = { ...process.env };
  const key = Object.keys(env).find(k => k.toUpperCase() === 'PATH') || 'PATH';
  env[key] = path.dirname(process.execPath) + path.delimiter + (env[key] || '');
  return { ...env, NEXT_TELEMETRY_DISABLED: '1', BROWSER: 'none', NO_COLOR: '1', FORCE_COLOR: '0', npm_config_update_notifier: 'false', ...extra };
}
// runs a command, echoes its output (prefixed) and keeps its last lines
function run(cwd, env, onLine, cmd, args) {
  const tail = [];
  const proc = spawn(cmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: !WIN });
  let buf = '';
  const feed = d => {
    buf += d.toString();
    const lines = buf.split('\n'); buf = lines.pop();
    for (let l of lines) {
      l = l.replace(ANSI, '').replace(/[\s\r]+$/, '');
      if (!l.trim()) continue;
      if (!NOISE.test(l)) console.log('          | ' + l);
      tail.push(l); if (tail.length > 12) tail.shift();
      if (onLine) onLine(l);
    }
  };
  proc.stdout.on('data', feed); proc.stderr.on('data', feed);
  const done = new Promise(resolve => {
    proc.on('error', e => resolve({ code: 1, tail: [e.message] }));
    proc.on('close', code => resolve({ code, tail }));
  });
  return { proc, done };
}
function killTree(proc) {
  if (!proc || proc.exitCode !== null) return;
  try {
    if (WIN) spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else { process.kill(-proc.pid, 'SIGTERM'); setTimeout(() => { try { process.kill(-proc.pid, 'SIGKILL'); } catch {} }, 3000).unref(); }
  } catch { try { proc.kill(); } catch {} }
}
function stopDev() { const p = S.dev; S.dev = null; S.devGen++; killTree(p); }

function npmCli() {
  const d = path.dirname(fs.realpathSync(process.execPath));
  return [path.join(d, 'node_modules', 'npm', 'bin', 'npm-cli.js'), path.join(d, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')].find(exists) || '';
}
function npm(cwd, args) {
  const cli = npmCli();
  if (cli) return run(cwd, childEnv(), null, process.execPath, [cli, ...args]).done;
  return WIN ? run(cwd, childEnv(), null, 'cmd', ['/c', 'npm', ...args]).done : run(cwd, childEnv(), null, 'npm', args).done;
}
function readPkg() { try { return JSON.parse(fs.readFileSync(path.join(S.dir, 'package.json'), 'utf8')); } catch { return null; } }
function lockHash() {
  for (const f of ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'package.json']) {
    try { return f + ':' + crypto.createHash('sha256').update(fs.readFileSync(path.join(S.dir, f))).digest('hex'); } catch {}
  }
  return '';
}
function pnpmVersion(pkg) {
  const m = /^pnpm@(\d+\.\d+\.\d+)/.exec(pkg.packageManager || '');
  if (m) return m[1];
  try {
    const v = /lockfileVersion:\s*['"]?(\d+)/.exec(fs.readFileSync(path.join(S.dir, 'pnpm-lock.yaml'), 'utf8').slice(0, 200));
    if (v) return { 9: '10', 6: '8', 5: '7' }[v[1]] || '10';
  } catch {}
  return '10';
}
// installs pnpm once, inside Atelier's own folder, and returns its entry point
async function pnpmEntry(pkg) {
  const ver = pnpmVersion(pkg);
  const dir = path.join(DATA, 'tools', 'pnpm-' + ver);
  const find = () => ['pnpm.cjs', 'pnpm.mjs', 'pnpm.js'].map(n => path.join(dir, 'node_modules', 'pnpm', 'bin', n)).find(exists);
  if (find()) return find();
  log(`Installing pnpm ${ver} (once)…`);
  fs.mkdirSync(dir, { recursive: true });
  const r = await npm(dir, ['install', '--prefix', dir, '--no-audit', '--no-fund', '--loglevel=error', 'pnpm@' + ver]);
  if (r.code !== 0 || !find()) throw new Error('could not install pnpm: ' + r.tail.join(' | '));
  return find();
}
async function installDeps(pkg) {
  const h = lockHash();
  const hashFile = S.dir + '.deps';
  let prev = ''; try { prev = fs.readFileSync(hashFile, 'utf8'); } catch {}
  if (prev === h && exists(path.join(S.dir, 'node_modules'))) return;
  setStatus('install');
  log(exists(path.join(S.dir, 'node_modules')) ? 'Updating the site dependencies…' : 'Installing the site dependencies (1 to 3 minutes the first time)…');
  let r;
  if (exists(path.join(S.dir, 'pnpm-lock.yaml')) || (pkg.packageManager || '').startsWith('pnpm')) {
    const entry = await pnpmEntry(pkg);
    for (const extra of [[], ['--no-frozen-lockfile']]) {
      r = await run(S.dir, childEnv({ CI: 'true' }), null, process.execPath, [entry, 'install', ...extra]).done;
      if (r.code === 0) break;
    }
  } else r = await npm(S.dir, ['install', '--no-audit', '--no-fund']);
  if (r.code !== 0) throw new Error('could not install the dependencies: ' + r.tail.join(' | '));
  fs.writeFileSync(hashFile, h);
  log('Dependencies installed.');
}
function freePort() {
  return new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); s.on('error', () => resolve(3000)); });
}
function portOpen(target) {
  return new Promise(resolve => {
    const [h, p] = target.split(':');
    const s = net.connect(+p, h); s.setTimeout(500);
    s.once('connect', () => { s.destroy(); resolve(true); }); s.once('error', () => resolve(false)); s.once('timeout', () => { s.destroy(); resolve(false); });
  });
}
function staticRoot(dir) {
  if (exists(path.join(dir, 'index.html'))) return dir;
  for (const d of ['public', 'docs', 'site', 'www', 'src', 'dist', 'build']) if (exists(path.join(dir, d, 'index.html'))) return path.join(dir, d);
  return dir;
}
// values the site needs to run, kept on this computer only: <owner-repo>.env.local or .env.local, next to the inbox or in the data folder
function copyEnvFile() {
  for (const d of [path.dirname(INBOX), DATA]) for (const n of [S.slug + '.env.local', '.env.local']) {
    try { fs.writeFileSync(path.join(S.dir, '.env.local'), fs.readFileSync(path.join(d, n))); log(`Using ${n} for the site.`); return; } catch {}
  }
}

// installs what is needed, then starts the site (call under the lock)
async function startSite() {
  stopDev();
  copyEnvFile();
  const pkg = readPkg();
  if (!pkg || !(pkg.scripts && pkg.scripts.dev)) {
    S.mode = 'static'; S.staticRoot = staticRoot(S.dir);
    setStatus('ready'); log('Static site ready.'); broadcast('reload');
    return;
  }
  try { await installDeps(pkg); } catch (e) { log(e.message); setStatus('error', e.message); return; }
  setStatus('start');
  const port = await freePort();
  const nextBin = path.join(S.dir, 'node_modules', 'next', 'dist', 'bin', 'next');
  const script = pkg.scripts.dev.trim();
  let args, mode = 'dev';
  if (exists(nextBin) && /^next dev(\s+[-\w=.]+)*$/.test(script)) {
    mode = 'next';
    args = [nextBin, 'dev', ...script.split(/\s+/).slice(2), '-p', String(port), '-H', '127.0.0.1'];
  } else {
    try { args = [await pnpmEntry(pkg), 'run', 'dev']; } catch (e) { setStatus('error', e.message); return; }
  }
  S.mode = mode; S.target = '127.0.0.1:' + port;
  const gen = ++S.devGen;
  log('Starting the site…');
  const onLine = l => { if (mode !== 'next') { const m = URL_RE.exec(l); if (m && S.devGen === gen) S.target = '127.0.0.1:' + m[1]; } };
  const { proc, done } = run(S.dir, childEnv({ PORT: String(port), HOST: '127.0.0.1' }), onLine, process.execPath, args);
  S.dev = proc;
  let exited = false;
  done.then(({ tail }) => {
    exited = true;
    if (S.devGen !== gen) return;
    const msg = 'The site stopped' + (tail.length ? ': ' + tail.slice(-4).join(' | ') : '');
    log(msg); setStatus('error', msg);
  });
  (async () => {
    const deadline = Date.now() + 4 * 60000;
    while (Date.now() < deadline && !exited && S.devGen === gen) {
      if (await portOpen(S.target)) { setStatus('ready'); log('Site ready: http://localhost:' + S.port); broadcast('reload'); return; }
      await sleep(400);
    }
    if (!exited && S.devGen === gen) setStatus('error', 'The site is taking too long to start.');
  })();
}

// ---------- transfer files ----------
// A transfer is a gzipped tar made by pack.sh in the cloud session:
//   .atelier/transfer   key=value lines: repo, id, base, kind (full or delta), label
//   .atelier/deleted    paths removed since "base", separated by NUL (delta only)
//   …                   the site's files (all of them for "full", the changed ones for "delta")
function parseOctal(b) {
  if (b[0] & 0x80) { let n = 0; for (let i = 1; i < b.length; i++) n = n * 256 + b[i]; return n; }
  const s = b.toString('latin1').replace(/[\0 ]+$/, '').trim();
  return s ? parseInt(s, 8) : 0;
}
function parsePax(data) {
  const out = {}; let i = 0;
  while (i < data.length) {
    const sp = data.indexOf(0x20, i); if (sp < 0) break;
    const len = parseInt(data.toString('latin1', i, sp), 10); if (!len) break;
    const rec = data.toString('utf8', sp + 1, i + len - 1);
    const eq = rec.indexOf('='); if (eq > 0) out[rec.slice(0, eq)] = rec.slice(eq + 1);
    i += len;
  }
  return out;
}
function* tarEntries(buf) {
  const cstr = b => { const e = b.indexOf(0); return b.toString('utf8', 0, e < 0 ? b.length : e); };
  let off = 0, longName = '', longLink = '', pax = {};
  while (off + 512 <= buf.length) {
    const h = buf.subarray(off, off + 512);
    if (h[0] === 0 && h.every(b => b === 0)) break;
    const size = parseOctal(h.subarray(124, 136));
    const type = h[156] ? String.fromCharCode(h[156]) : '0';
    let name = cstr(h.subarray(0, 100));
    if (h.toString('latin1', 257, 263) === 'ustar\0') { const prefix = cstr(h.subarray(345, 500)); if (prefix) name = prefix + '/' + name; }
    const data = buf.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === 'L') { longName = cstr(data); continue; }
    if (type === 'K') { longLink = cstr(data); continue; }
    if (type === 'x') { pax = parsePax(data); continue; }
    if (type === 'g') continue;
    yield { name: (pax.path || longName || name).replace(/^\.\//, ''), type, data, link: pax.linkpath || longLink || cstr(h.subarray(157, 257)) };
    longName = longLink = ''; pax = {};
  }
}
const PROTECTED = new Set(['node_modules', '.git', '.next', '.atelier']);
function safeJoin(root, rel) {
  rel = String(rel).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  const parts = rel.split('/');
  if (!rel || rel.startsWith('/') || /^[A-Za-z]:/.test(rel) || parts.some(p => p === '..' || p === '' || p === '.')) return '';
  if (PROTECTED.has(parts[0])) return '';
  return path.join(root, ...parts);
}
const repoSlug = repo => repo.replace(/[^A-Za-z0-9._-]+/g, '-');
const siteStateFile = () => S.dir + '.json';
function pruneEmptyDirs(file) {
  let d = path.dirname(file);
  while (d.startsWith(S.dir + path.sep)) { try { fs.rmdirSync(d); } catch { break; } d = path.dirname(d); }
}

// switches the site on display (call under the lock)
function openSite(repo) {
  stopDev();
  Object.assign(S, { repo, slug: repoSlug(repo), id: '', label: '', mode: '', notice: '', needFull: false, applied: 0 });
  S.dir = path.join(DATA, 'sites', S.slug);
  const st = readJSON(siteStateFile());
  if (st && exists(S.dir)) Object.assign(S, { id: st.id || '', label: st.label || '', applied: st.time || 0 });
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(path.join(DATA, 'last.json'), JSON.stringify({ repo }));
}

async function applyTransfer(file) {
  let entries;
  try { entries = [...tarEntries(zlib.gunzipSync(fs.readFileSync(file)))]; } catch (e) { note(`A transfer was received but could not be read (${e.message}).`); return; }
  const metaEntry = entries.find(e => e.name === '.atelier/transfer');
  if (!metaEntry) { note('A file was received that is not an Atelier transfer.'); return; }
  const m = {};
  for (const l of metaEntry.data.toString('utf8').split('\n')) { const i = l.indexOf('='); if (i > 0) m[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }
  if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(m.repo || '') || !/^[0-9a-f]{7,64}$/.test(m.id || '') || !['full', 'delta'].includes(m.kind)) { note('A transfer was received with an unreadable description.'); return; }
  const delEntry = entries.find(e => e.name === '.atelier/deleted');
  const deleted = delEntry ? delEntry.data.toString('utf8').split('\0').filter(Boolean) : [];

  await locked(async () => {
    S.seen = m.id; // the last transfer looked at, applied or not
    const first = m.repo !== S.repo;
    if (first) { log((S.repo ? 'The cloud session works on another site: ' : 'Site of the session: ') + m.repo); openSite(m.repo); }
    const st = (exists(S.dir) && readJSON(siteStateFile())) || { id: '', files: [] };
    if (m.id === st.id) { // already applied (same transfer seen again, or nothing changed)
      S.notice = ''; S.needFull = false;
      if (first || !['ready', 'install', 'start'].includes(S.status)) await startSite(); else writeStatus();
      return;
    }
    if (m.kind === 'delta' && m.base !== st.id) {
      note('This computer does not have the state these changes start from. A full snapshot is needed.', true);
      if (first && st.id) await startSite();
      return;
    }
    const before = lockHash(), wasMode = S.mode, wasStatus = S.status;
    const files = new Set(m.kind === 'full' ? [] : st.files || []);
    const incoming = new Set();
    if (m.kind === 'full' && !st.id && exists(S.dir)) { // leftovers of an unknown state: keep only the installed dependencies
      for (const n of fs.readdirSync(S.dir)) if (n !== 'node_modules') fs.rmSync(path.join(S.dir, n), { recursive: true, force: true });
    }
    fs.mkdirSync(S.dir, { recursive: true });
    let written = 0, skipped = 0;
    for (const e of entries) {
      if (e.name.startsWith('.atelier/') || e.name === '.atelier') continue;
      if (e.type === '5') continue; // directories are created as needed
      const dest = safeJoin(S.dir, e.name);
      if (!dest || !['0', '7', '2'].includes(e.type)) { skipped++; continue; }
      try {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        if (e.type === '2') { try { fs.rmSync(dest, { force: true, recursive: true }); } catch {} fs.symlinkSync(e.link, dest); }
        else {
          try { if (fs.lstatSync(dest).isSymbolicLink() || fs.lstatSync(dest).isDirectory()) fs.rmSync(dest, { force: true, recursive: true }); } catch {}
          fs.writeFileSync(dest, e.data);
        }
        written++; files.add(e.name); incoming.add(e.name);
      } catch (err) { skipped++; log(`Could not write ${e.name}: ${err.message}`); }
    }
    const toRemove = m.kind === 'full' ? (st.files || []).filter(f => !incoming.has(f)) : deleted;
    let removed = 0;
    for (const f of toRemove) {
      const dest = safeJoin(S.dir, f); files.delete(f);
      if (!dest) continue;
      try { fs.rmSync(dest, { force: true, recursive: true }); removed++; pruneEmptyDirs(dest); } catch {}
    }
    const time = Date.now();
    fs.writeFileSync(siteStateFile(), JSON.stringify({ repo: m.repo, id: m.id, label: m.label || '', time, files: [...files] }));
    Object.assign(S, { id: m.id, label: m.label || '', applied: time, notice: '', needFull: false });
    log(`${m.kind === 'full' ? 'Full snapshot' : 'Changes'} applied: ${written} file(s) written, ${removed} removed${skipped ? `, ${skipped} skipped` : ''}  (${m.id.slice(0, 7)})`);
    const pkg = readPkg();
    const isStatic = !pkg || !(pkg.scripts && pkg.scripts.dev);
    if (first || !['ready', 'install', 'start'].includes(wasStatus) || lockHash() !== before || (wasMode === 'static') !== isStatic) { await startSite(); return; }
    writeStatus(); broadcast('status');
    broadcast(wasMode === 'static' ? 'reload' : 'updated');
  });
}

const TRANSFER_RE = /^atelier@[A-Za-z0-9._-]+@[A-Za-z0-9._-]+?( \(\d+\))?\.tgz$/;
function newestTransfer() {
  let best = null;
  for (const d of [INBOX, path.join(os.homedir(), 'Downloads')]) {
    let names = []; try { names = fs.readdirSync(d); } catch { continue; }
    for (const n of names) {
      if (!TRANSFER_RE.test(n)) continue;
      try { const st = fs.statSync(path.join(d, n)); if (st.isFile() && (!best || st.mtimeMs > best.mtimeMs)) best = { file: path.join(d, n), mtimeMs: st.mtimeMs, size: st.size }; } catch {}
    }
  }
  return best;
}
async function watchInbox() {
  let applied = '', pending = '';
  for (;;) {
    await sleep(400);
    const t = newestTransfer();
    if (!t) continue;
    const sig = `${t.file}|${t.mtimeMs}|${t.size}`;
    if (sig === applied) continue;
    if (sig !== pending) { pending = sig; continue; } // wait until the file is fully written
    applied = sig;
    await applyTransfer(t.file);
  }
}

// ---------- local server ----------
const OVERLAY = `
<script>(function(){
try{document.currentScript&&document.currentScript.remove()}catch(e){}
if(window.__at)return;window.__at=1;
var css='#__at{position:fixed;z-index:2147483647;right:12px;bottom:12px;font:12px/1.45 system-ui,sans-serif;color:#e6e8ee;background:#161920f2;border:1px solid #2a2f3a;border-radius:12px;box-shadow:0 10px 30px #0007;backdrop-filter:blur(8px);max-width:min(340px,calc(100vw - 24px));text-align:left;transition:border-color .3s}'+
'#__at *{box-sizing:border-box}#__at .h{display:flex;align-items:center;gap:8px;padding:8px 11px;cursor:pointer;user-select:none}'+
'#__at .d{width:8px;height:8px;border-radius:50%;background:#4ade80;flex:none}#__at .d.b{background:#fbbf24;animation:__atp 1s infinite}#__at .d.e{background:#f87171}'+
'@keyframes __atp{50%{opacity:.35}}#__at.f{border-color:#4ade80}#__at.w .d{background:#fbbf24}'+
'#__at code{font:11px ui-monospace,Menlo,Consolas,monospace;color:#7c9cff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#__at .n{margin-left:auto;color:#8b93a7;white-space:nowrap;padding-left:6px}'+
'#__at .p{display:none;border-top:1px solid #2a2f3a;padding:9px 11px}#__at.o .p{display:block}'+
'#__at .m{color:#8b93a7}#__at .s{color:#c9cedb;margin-bottom:4px;word-break:break-word}#__at .err{color:#fca5a5;margin-top:6px;word-break:break-word}'+
'#__at button{font:inherit;border-radius:7px;padding:4px 9px;cursor:pointer;border:1px solid #2a2f3a;background:#1c2029;color:#e6e8ee;margin-top:8px}';
var st=document.createElement('style');st.textContent=css;var el=document.createElement('div');el.id='__at';
el.innerHTML='<div class="h"><span class="d"></span><code class="br"></code><span class="n"></span></div>'+
'<div class="p"><div class="s"></div><div class="m"></div><button class="rl">Reload the page</button><div class="err"></div></div>';
function mount(){var r=document.documentElement;r.appendChild(st);r.appendChild(el);
 new MutationObserver(function(){if(!el.isConnected){r.appendChild(st);r.appendChild(el)}}).observe(r,{childList:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
var q=function(s){return el.querySelector(s)},S=null;
q('.h').onclick=function(){el.classList.toggle('o');try{sessionStorage.__ato=el.classList.contains('o')?1:''}catch(e){}};
try{if(sessionStorage.__ato)el.classList.add('o')}catch(e){}
q('.rl').onclick=function(){location.reload()};
function ago(ms){var s=Math.max(0,Math.round((Date.now()-ms)/1000));if(s<5)return 'just now';if(s<60)return s+' s ago';var m=Math.round(s/60);if(m<60)return m+' min ago';return Math.round(m/60)+' h ago'}
var LBL={waiting:'waiting…',install:'installing…',start:'starting…',error:'error'};
function paint(s){S=s;var busy=s.status&&s.status!=='ready'&&s.status!=='error';
 q('.br').textContent=s.showing||'—';q('.d').className='d'+(s.status==='error'?' e':busy?' b':'');
 q('.n').textContent=LBL[s.status]||(s.applied?ago(s.applied):'');
 q('.s').textContent=s.label||'';q('.m').textContent=(s.repo||'')+(s.id?'  ('+s.id.slice(0,7)+')':'');
 q('.err').textContent=s.status==='error'?s.error:(s.notice||'');el.classList.toggle('w',!!s.notice&&s.status!=='error');}
setInterval(function(){if(S)paint(S)},5000);
function flash(){el.classList.add('f');setTimeout(function(){el.classList.remove('f')},1500)}
var es=new EventSource('/__at/events');
es.addEventListener('status',function(e){paint(JSON.parse(e.data))});
es.addEventListener('updated',function(e){paint(JSON.parse(e.data));flash()});
es.addEventListener('reload',function(e){var s=JSON.parse(e.data);if(s.mode==='static'||document.getElementById('__at_wait'))location.reload();else{paint(s);flash()}});
})();</script>`;
const htmlEscape = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function waitPage() {
  let title = 'Starting the site…', sub = 'The page will appear by itself as soon as it is ready.';
  if (S.status === 'waiting') { title = 'Waiting for the Claude Code session'; sub = 'Ask for a change in your cloud session: the site will appear here after the first transfer.'; }
  else if (S.status === 'install') { title = 'Installing dependencies…'; sub = 'One to three minutes the first time. The page will appear by itself.'; }
  else if (S.status === 'error') { title = 'The site does not start'; sub = htmlEscape(S.error); }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Atelier</title></head><body style="font:15px system-ui,sans-serif;background:#0f1115;color:#e6e8ee;display:grid;place-items:center;height:100vh;margin:0"><div id="__at_wait" style="text-align:center;max-width:620px;padding:20px"><h2 style="font-weight:600">${title}</h2><p style="color:#8b93a7;line-height:1.5">${sub}</p></div><script>setTimeout(function(){location.reload()},5000)</script>${OVERLAY}</body></html>`;
}
const MIME = { '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.pdf': 'application/pdf', '.wasm': 'application/wasm' };
const send = (res, code, body, type = 'text/plain; charset=utf-8') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); };
const wantsHTML = req => String(req.headers.accept || '').includes('text/html');

function serveStatic(req, res, pathname) {
  const root = S.staticRoot;
  let p; try { p = decodeURIComponent(pathname); } catch { return send(res, 400, 'Bad request'); }
  let file = path.join(root, p);
  if ((file !== root && !file.startsWith(root + path.sep)) || p.includes('/.git')) return send(res, 403, 'Forbidden');
  try { if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html'); } catch {}
  if (!exists(file) && !path.extname(file) && exists(file + '.html')) file += '.html';
  if (!exists(file)) {
    let body = `<!doctype html><meta charset="utf-8"><body style="font:15px system-ui;padding:40px">404 — this page does not exist in the version on display.`;
    try { body = fs.readFileSync(path.join(root, '404.html'), 'utf8'); } catch {}
    return send(res, 404, body + OVERLAY, MIME['.html']);
  }
  const ext = path.extname(file).toLowerCase();
  if (ext === '.html' || ext === '.htm') {
    const s = fs.readFileSync(file, 'utf8');
    const i = s.toLowerCase().lastIndexOf('</body>');
    return send(res, 200, i >= 0 ? s.slice(0, i) + OVERLAY + s.slice(i) : s + OVERLAY, MIME[ext]);
  }
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}
function proxyHttp(req, res) {
  const [host, port] = S.target.split(':');
  const up = http.request({ host, port: +port, method: req.method, path: req.url, headers: { ...req.headers, 'accept-encoding': 'identity' } }, upRes => {
    const h = { ...upRes.headers };
    if (req.method === 'GET' && upRes.statusCode !== 304 && /text\/html/i.test(String(h['content-type'] || '')) && !h['content-encoding']) {
      delete h['content-length'];
      res.writeHead(upRes.statusCode, h);
      upRes.pipe(res, { end: false });         // the stream passes through untouched…
      upRes.on('end', () => res.end(OVERLAY)); // …and the badge is appended at the end
    } else { res.writeHead(upRes.statusCode, h); upRes.pipe(res); }
  });
  up.on('error', () => { if (res.headersSent) return res.end(); wantsHTML(req) ? send(res, 502, waitPage(), MIME['.html']) : send(res, 502, 'Site unavailable'); });
  req.pipe(up);
}
function proxyUpgrade(req, socket, head) { // WebSocket: the framework's hot reload
  if (S.status !== 'ready' || S.mode === 'static' || !S.target) return socket.destroy();
  const [host, port] = S.target.split(':');
  const up = net.connect(+port, host, () => {
    let raw = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
    for (let i = 0; i < req.rawHeaders.length; i += 2) raw += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
    up.write(raw + '\r\n'); if (head && head.length) up.write(head);
    socket.pipe(up).pipe(socket);
  });
  const kill = () => { socket.destroy(); up.destroy(); };
  up.on('error', kill); socket.on('error', kill);
}
function quit(why) {
  log(why);
  stopDev();
  try { if ((readJSON(ENGINE_FILE) || {}).pid === process.pid) fs.rmSync(ENGINE_FILE, { force: true }); } catch {}
  setTimeout(() => process.exit(0), WIN ? 500 : 150);
}
async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  switch (url.pathname) {
    case '/__at/events': {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write(`event: status\ndata: ${JSON.stringify(publicState())}\n\n`);
      S.clients.add(res); req.on('close', () => S.clients.delete(res));
      return;
    }
    case '/__at/state': return send(res, 200, JSON.stringify(publicState()), 'application/json');
    case '/__at/quit': {
      if (req.method !== 'POST' || req.headers['x-atelier'] !== S.token) return send(res, 403, 'Refused');
      send(res, 200, 'Stopping'); quit('Stopping the preview (asked by Claude).');
      return;
    }
  }
  if (S.mode === 'static' && S.status === 'ready') return serveStatic(req, res, url.pathname);
  if (S.status !== 'ready') return wantsHTML(req) ? send(res, 503, waitPage(), MIME['.html']) : send(res, 503, 'Site is starting');
  proxyHttp(req, res);
}
function atelierOn(port) { // is an Atelier already listening on this port?
  return new Promise(resolve => {
    const r = http.get({ host: '127.0.0.1', port, path: '/__at/state', timeout: 1500 }, res => {
      let b = ''; res.on('data', d => b += d); res.on('end', () => { try { resolve('atelier' in JSON.parse(b)); } catch { resolve(false); } });
    });
    r.on('error', () => resolve(false)); r.on('timeout', () => { r.destroy(); resolve(false); });
  });
}
function listen(server, port) {
  return new Promise(resolve => { server.once('error', () => resolve(false)); server.listen(port, '127.0.0.1', () => { server.removeAllListeners('error'); resolve(true); }); });
}

// ---------- startup ----------
log(`Atelier ${VERSION} engine starting (Node ${process.versions.node}, ${process.platform})`);
if (+process.versions.node.split('.')[0] < 20) { log(`Node.js 20 or later is required (current version: ${process.versions.node}).`); process.exit(1); }
fs.mkdirSync(INBOX, { recursive: true }); fs.mkdirSync(DATA, { recursive: true });

const server = http.createServer((req, res) => handle(req, res).catch(e => { try { send(res, 500, String(e && e.message || e)); } catch {} }));
server.on('upgrade', proxyUpgrade);
for (let p = BASE_PORT; p < BASE_PORT + 20 && !S.port; p++) {
  if (await listen(server, p)) S.port = p;
  else if (await atelierOn(p)) { log(`Atelier is already running on port ${p}.`); process.exit(0); }
}
if (!S.port) { log(`No free port between ${BASE_PORT} and ${BASE_PORT + 19}.`); process.exit(1); }
fs.writeFileSync(ENGINE_FILE, JSON.stringify({ pid: process.pid, port: S.port, token: S.token, version: VERSION, started: Date.now() }));
log(`Preview: http://localhost:${S.port}   Inbox: ${INBOX}   Data: ${DATA}`);

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => quit('Stopping the preview…'));
process.on('exit', () => killTree(S.dev));
setInterval(() => { for (const c of S.clients) c.write(': ping\n\n'); }, 20000).unref();

// Claude keeps a heartbeat file fresh while it runs; without it for 90 seconds, the preview stops.
if (SUPERVISED) {
  const started = Date.now();
  setInterval(() => {
    let age = Infinity; try { age = Date.now() - fs.statSync(HEARTBEAT).mtimeMs; } catch {}
    if (age > 90000 && Date.now() - started > 90000) quit('Claude is no longer running: stopping the preview.');
  }, 15000).unref();
}

// bring back the last site on display, then wait for transfers
const last = readJSON(path.join(DATA, 'last.json'));
if (last && last.repo) {
  await locked(async () => {
    openSite(last.repo);
    if (S.id) { log(`Bringing back ${S.repo} (${S.id.slice(0, 7)}).`); await startSite(); } else { S.repo = ''; setStatus('waiting'); }
  });
} else { writeStatus(); log('Waiting for the first transfer from the Claude Code session…'); }
watchInbox();

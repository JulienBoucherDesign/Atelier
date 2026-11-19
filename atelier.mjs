#!/usr/bin/env node
// Atelier — the real site, live on your computer, while Claude Code edits it in a cloud session.
//
// This script keeps a copy of the site's GitHub repository, runs it locally, and applies the changes
// the cloud session drops into the "inbox" subfolder (through the Claude desktop app, not GitHub).
// The open page updates by itself. Atelier never writes to GitHub.
//
// Portable: everything it creates stays in its own folder ("inbox" and "data").
// Start: double-click Atelier.cmd (Windows), or run "node atelier.mjs".
// Options: [repo] [--branch name] [--prefix claude/] [--port 3210] [--no-open]
// No dependencies: Node.js 20 or later, and git.
import { spawn, execFile } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const VERSION = '4.0';
const WIN = process.platform === 'win32';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = process.env.ATELIER_HOME || path.join(HERE, 'data');
const INBOX = process.env.ATELIER_INBOX || path.join(HERE, 'inbox');
const REPO_BASE = process.env.ATELIER_REPO_BASE || 'https://github.com/';
const SESSION_LABEL = 'cloud session (not pushed)';
const STARTED = Date.now();

const sleep = ms => new Promise(r => setTimeout(r, ms));
const exists = p => { try { fs.statSync(p); return true; } catch { return false; } };
const log = m => console.log(new Date().toTimeString().slice(0, 8) + '  ' + m);
function fatal(m) { console.error('\n[ERROR] ' + m + '\n'); stopDev(); process.exit(1); }

// ---------- configuration ----------
function readKV(file) {
  const m = {};
  let txt = '';
  try { txt = fs.readFileSync(file, 'utf8'); } catch { return m; }
  for (let l of txt.replace(/^﻿/, '').split(/\r?\n/)) {
    l = l.trim();
    if (!l || l.startsWith('#')) continue;
    const i = l.indexOf('=');
    if (i > 0 && !l.slice(0, i).includes('/')) m[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim();
    else if (!m.repo) m.repo = l;
  }
  return m;
}
function normalizeRepo(s) {
  s = (s || '').trim();
  if (!s) return '';
  if (/^[\w.-]+\/[\w.-]+$/.test(s)) return 'https://github.com/' + s + '.git';
  if (s.startsWith('https://github.com/')) {
    const p = s.replace(/\/+$/, '').replace(/\.git$/, '').slice('https://github.com/'.length).split('/');
    if (p.length >= 2) return `https://github.com/${p[0]}/${p[1]}.git`;
  }
  return s;
}
const repoParts = repo => repo.replace(/\\/g, '/').replace(/\/+$/, '').replace(/\.git$/, '').split('/').slice(-2);
const repoSlug = repo => repoParts(repo).join('-').replace(/[^A-Za-z0-9._-]+/g, '-');
const repoLabel = repo => repoParts(repo).join('/');
const savedRepo = () => readKV(path.join(DATA, 'config.txt')).repo || '';
function saveRepo(repo) { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(path.join(DATA, 'config.txt'), 'repo=' + repo + '\n'); }

const cfg = { repo: '', pinned: false, branch: '', prefix: 'claude/', port: 3210, open: true };
{
  const kv = readKV(path.join(HERE, 'atelier.txt'));
  if (kv.repo) cfg.repo = kv.repo;
  if (kv.branch) cfg.branch = kv.branch;
  if (kv.prefix) cfg.prefix = kv.prefix;
  if (+kv.port > 0) cfg.port = +kv.port;
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--branch') cfg.branch = a[++i] || '';
    else if (a[i] === '--prefix') cfg.prefix = a[++i] || cfg.prefix;
    else if (a[i] === '--port') cfg.port = +a[++i] || cfg.port;
    else if (a[i] === '--no-open') cfg.open = false;
    else if (a[i] === '--version') { console.log('Atelier ' + VERSION); process.exit(0); }
    else if (a[i] === '-h' || a[i] === '--help') {
      console.log(`Atelier ${VERSION} — live preview of the site Claude Code edits in a cloud session.\n\n  node atelier.mjs [repo] [--branch name] [--prefix claude/] [--port 3210] [--no-open]\n\nWithout a repo, Atelier shows the repository of the Claude Code session that sends it changes.`);
      process.exit(0);
    } else if (!a[i].startsWith('-')) cfg.repo = a[i];
  }
  cfg.pinned = !!cfg.repo;
  cfg.repo = normalizeRepo(cfg.repo || savedRepo());
}

// ---------- state ----------
const S = {
  dir: '', branch: cfg.branch, auto: !cfg.branch, sha: '', subject: '', status: cfg.repo ? 'clone' : 'waiting', error: '',
  mode: '', target: '', applied: 0, session: false, notice: '', defBr: 'main', staticRoot: '', port: 0,
  gen: 0, dev: null, devGen: 0, clients: new Set(), token: crypto.randomBytes(16).toString('hex'),
};
const publicState = () => ({
  repo: cfg.repo ? repoLabel(cfg.repo) : '', branch: S.branch, auto: S.auto, prefix: cfg.prefix, sha: S.sha.slice(0, 7), subject: S.subject,
  status: S.status, error: S.error, mode: S.mode, applied: S.applied, session: S.session, notice: S.notice,
});
function broadcast(event) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(publicState())}\n\n`;
  for (const c of S.clients) c.write(msg);
}
function writeStatus() {
  const st = publicState();
  try {
    fs.mkdirSync(INBOX, { recursive: true });
    fs.writeFileSync(path.join(INBOX, 'status.json'), JSON.stringify({
      url: 'http://localhost:' + S.port, repo: st.repo, status: st.status, error: st.error, showing: st.branch, commit: S.sha,
      message: st.subject, notice: st.notice, time: new Date().toISOString(), version: VERSION,
    }, null, 2));
  } catch {}
}
function setStatus(status, error = '') {
  S.status = status; S.error = error;
  broadcast('status');
  if (status === 'ready' || status === 'error' || status === 'waiting') writeStatus();
}
function note(msg) { S.notice = msg; writeStatus(); broadcast('status'); }

// one job at a time on the site copy (update, install, start)
let chain = Promise.resolve();
const locked = fn => (chain = chain.then(fn, fn).catch(e => { log('Error: ' + (e && e.message || e)); }));

// ---------- git ----------
let GIT = 'git';
function findGit() {
  return new Promise(resolve => {
    execFile('git', ['--version'], { windowsHide: true }, err => {
      if (!err) return resolve('git');
      const cands = WIN ? [process.env.ProgramFiles, process.env.ProgramW6432, process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')]
        .filter(Boolean).map(d => path.join(d, 'Git', 'cmd')) : [];
      const dir = cands.find(exists); // Git for Windows installed but not on the PATH
      resolve(dir ? path.join(dir, 'git') : '');
    });
  });
}
function git(dir, ...args) {
  return new Promise((resolve, reject) => {
    execFile(GIT, ['-c', 'core.longpaths=true', ...args], { cwd: dir || undefined, windowsHide: true, maxBuffer: 1 << 26, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } },
      (err, stdout, stderr) => {
        if (err) { const all = (String(stdout) + String(stderr)).trim(); const e = new Error(all.split('\n').pop() || err.message); e.output = all; return reject(e); }
        resolve(String(stdout).trim());
      });
  });
}
async function lsRemote(dir) {
  const m = {};
  for (const l of (await git(dir, 'ls-remote', '--heads', 'origin')).split('\n')) {
    const f = l.split(/\s+/);
    if (f.length === 2 && f[1].startsWith('refs/heads/')) m[f[1].slice(11)] = f[0];
  }
  return m;
}
const fetchAll = dir => git(dir, 'fetch', '--quiet', '--prune', 'origin', '+refs/heads/*:refs/remotes/origin/*');
async function listRefs(dir) {
  let out = '';
  try { out = await git(dir, 'for-each-ref', '--sort=-committerdate', '--format=%(refname)%09%(objectname)%09%(committerdate:unix)%09%(subject)', 'refs/remotes/origin'); } catch { return []; }
  return out.split('\n').map(l => l.split('\t')).filter(f => f.length >= 4)
    .map(f => ({ name: f[0].replace('refs/remotes/origin/', ''), sha: f[1], date: +f[2], subject: f.slice(3).join('\t') }))
    .filter(r => r.name !== 'HEAD' && r.name !== 'gh-pages');
}
async function defaultBranch(dir) {
  try { return (await git(dir, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD')).replace(/^origin\//, ''); } catch {}
  for (const b of ['main', 'master']) { try { await git(dir, 'rev-parse', '--verify', '-q', 'refs/remotes/origin/' + b); return b; } catch {} }
  return 'main';
}

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
// installs pnpm once, inside Atelier's folder, and returns its entry point
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

// installs what is needed, then starts the site (call under the lock)
async function startSite() {
  stopDev();
  for (const n of ['.env.local', 'env.local', '.env.local.txt', 'env.local.txt']) {
    try { fs.writeFileSync(path.join(S.dir, '.env.local'), fs.readFileSync(path.join(HERE, n))); log(`Using ${n} for the site.`); break; } catch {}
  }
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
    if (!exited && S.devGen === gen) setStatus('error', 'The site is taking too long to start. Check the messages in the Atelier window.');
  })();
}

// moves the working copy to a commit and restarts what needs restarting
function apply(branch, ref, first) {
  return locked(async () => {
    const before = lockHash();
    try { await git(S.dir, 'checkout', '--force', '--detach', ref.sha); } catch (e) { setStatus('error', 'Could not update: ' + e.message); return; }
    try { await git(S.dir, 'clean', '-fdq'); } catch {}
    const wasMode = S.mode, wasStatus = S.status;
    Object.assign(S, { branch, sha: ref.sha, subject: ref.subject, applied: Date.now() });
    log(`${branch} @ ${ref.sha.slice(0, 7)}  ${ref.subject}`);
    const pkg = readPkg();
    const isStatic = !pkg || !(pkg.scripts && pkg.scripts.dev);
    if (first || wasStatus === 'error' || lockHash() !== before || (wasMode === 'static') !== isStatic) { await startSite(); writeStatus(); return; }
    broadcast('status');
    broadcast(wasMode === 'static' ? 'reload' : 'updated');
    writeStatus();
  });
}
async function sync(first) {
  if (S.session && !first) return;
  const refs = await listRefs(S.dir);
  let want;
  if (S.auto) want = refs.find(r => r.name.startsWith(cfg.prefix)) || refs.find(r => r.name === S.defBr) || refs[0];
  else {
    want = refs.find(r => r.name === S.branch);
    if (!want) { setStatus('error', `Branch "${S.branch}" does not exist (or no longer exists) on GitHub.`); return; }
  }
  if (!want) { setStatus('error', 'No branch found in the repository.'); return; }
  if (first || want.sha !== S.sha || want.name !== S.branch) {
    if (!first && want.name !== S.branch) log('Now following branch ' + want.name);
    await apply(want.name, want, first);
  }
}
async function pollLoop(gen) {
  let prev = {}; try { prev = await lsRemote(S.dir); } catch {}
  let fails = 0, lastChange = Date.now();
  while (S.gen === gen) {
    await sleep(Date.now() - lastChange > 20 * 60000 ? 5000 : 2000); // every 2 s while working, every 5 s when idle
    if (S.gen !== gen) return;
    let cur;
    try { cur = await lsRemote(S.dir); } catch (e) { if (++fails === 5) log(`GitHub is not answering (${e.message}). Retrying…`); continue; }
    if (fails >= 5) log('Connection to GitHub restored.');
    fails = 0;
    const keys = new Set([...Object.keys(cur), ...Object.keys(prev)]);
    if (![...keys].some(k => cur[k] !== prev[k])) continue;
    prev = cur; lastChange = Date.now();
    try { await fetchAll(S.dir); } catch (e) { log('Could not fetch: ' + e.message); continue; }
    if (S.gen === gen) await sync(false);
  }
}

// ---------- changes received from the cloud session ----------
const BUNDLE_RE = /^preview@([A-Za-z0-9._-]+)@([A-Za-z0-9._-]+?)( \(\d+\))?\.bundle$/;
const bundleRepo = file => { const m = BUNDLE_RE.exec(path.basename(file)); return m ? `${REPO_BASE}${m[1]}/${m[2]}.git` : ''; };
function newestBundle() {
  let best = null;
  for (const d of [INBOX, path.join(os.homedir(), 'Downloads')]) {
    let names = []; try { names = fs.readdirSync(d); } catch { continue; }
    for (const n of names) {
      if (!BUNDLE_RE.test(n)) continue;
      try { const st = fs.statSync(path.join(d, n)); if (st.isFile() && (!best || st.mtimeMs > best.mtimeMs)) best = { file: path.join(d, n), mtimeMs: st.mtimeMs, size: st.size }; } catch {}
    }
  }
  return best && best.mtimeMs > STARTED - 30 * 60000 ? best : null;
}
async function applyBundle(file) {
  const fetchIt = () => git(S.dir, 'fetch', '--quiet', '--no-tags', file, '+refs/atelier/wip:refs/atelier/wip');
  try { await fetchIt(); } catch {
    try { await fetchAll(S.dir); } catch {} // the session's starting point may just have reached GitHub
    try { await fetchIt(); } catch (e) {
      log('Changes received but unusable: ' + (e.output || e.message));
      note(`Changes received from the cloud session could not be applied (${e.message}).`);
      return;
    }
  }
  const sha = await git(S.dir, 'rev-parse', 'refs/atelier/wip');
  const subject = await git(S.dir, 'log', '-1', '--format=%s', 'refs/atelier/wip');
  const same = S.session && S.sha === sha;
  Object.assign(S, { session: true, auto: false, notice: '' });
  if (same) return;
  log('Changes received from the cloud session.');
  await apply(SESSION_LABEL, { name: SESSION_LABEL, sha, subject }, false);
}
async function watchInbox() {
  let applied = '', pending = '';
  for (;;) {
    await sleep(400);
    const b = newestBundle();
    if (!b) continue;
    const sig = `${b.file}|${b.mtimeMs}|${b.size}`;
    if (sig === applied) continue;
    if (sig !== pending) { pending = sig; continue; } // wait until the file is fully written
    applied = sig;
    const repo = bundleRepo(b.file);
    if (repo !== cfg.repo) {
      if (cfg.pinned) { note(`Changes received for ${repoLabel(repo)}, but this Atelier is pinned to ${repoLabel(cfg.repo)}.`); continue; }
      log(cfg.repo ? `The cloud session works on ${repoLabel(repo)}: switching site…` : 'Site of the session: ' + repoLabel(repo));
      await openRepo(repo);
    }
    if (S.dir) await applyBundle(b.file);
  }
}

// opens (or switches) the repository on display: local copy, starting branch, site, GitHub polling
async function openRepo(repo) {
  const gen = ++S.gen;
  await locked(async () => { stopDev(); });
  cfg.repo = repo;
  if (!cfg.pinned) saveRepo(repo);
  Object.assign(S, { dir: path.join(DATA, 'sites', repoSlug(repo)), branch: cfg.branch, auto: !cfg.branch, sha: '', subject: '', mode: '', session: false, notice: '' });
  setStatus('clone');
  if (!exists(path.join(S.dir, '.git'))) {
    log('Fetching the site from GitHub for the first time…');
    fs.rmSync(S.dir, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(S.dir), { recursive: true });
    try { await git('', 'clone', '--quiet', '--no-checkout', repo, S.dir); } catch (e) {
      const msg = `Could not fetch ${repoLabel(repo)} from GitHub (${e.message}). If the repository is private, Git on this computer must be signed in to your GitHub account.`;
      log(msg); const d = S.dir; S.dir = ''; fs.rmSync(d, { recursive: true, force: true }); setStatus('error', msg); return;
    }
  } else {
    try { if ((await git(S.dir, 'remote', 'get-url', 'origin')) !== repo) await git(S.dir, 'remote', 'set-url', 'origin', repo); } catch {}
  }
  try { await fetchAll(S.dir); } catch (e) { log(`Could not fetch right now (${e.message}): showing the last known version.`); }
  S.defBr = await defaultBranch(S.dir);
  await sync(true);
  log(S.auto ? `Following the latest pushed "${cfg.prefix}…" branch (currently ${S.branch}).` : `Following branch ${S.branch}.`);
  pollLoop(gen);
}

// ---------- local server ----------
const OVERLAY = `
<script>(function(){
try{document.currentScript&&document.currentScript.remove()}catch(e){}
if(window.__at)return;window.__at=1;var TK='__TOKEN__';
var css='#__at{position:fixed;z-index:2147483647;right:12px;bottom:12px;font:12px/1.45 system-ui,sans-serif;color:#e6e8ee;background:#161920f2;border:1px solid #2a2f3a;border-radius:12px;box-shadow:0 10px 30px #0007;backdrop-filter:blur(8px);max-width:min(340px,calc(100vw - 24px));text-align:left;transition:border-color .3s}'+
'#__at *{box-sizing:border-box}#__at .h{display:flex;align-items:center;gap:8px;padding:8px 11px;cursor:pointer;user-select:none}'+
'#__at .d{width:8px;height:8px;border-radius:50%;background:#4ade80;flex:none}#__at .d.b{background:#fbbf24;animation:__atp 1s infinite}#__at .d.e{background:#f87171}'+
'@keyframes __atp{50%{opacity:.35}}#__at.f{border-color:#4ade80}#__at.w .d{background:#fbbf24}'+
'#__at code{font:11px ui-monospace,Menlo,Consolas,monospace;color:#7c9cff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#__at .n{margin-left:auto;color:#8b93a7;white-space:nowrap;padding-left:6px}'+
'#__at .p{display:none;border-top:1px solid #2a2f3a;padding:9px 11px}#__at.o .p{display:block}'+
'#__at .m{color:#8b93a7}#__at .s{color:#c9cedb;margin-bottom:8px;word-break:break-word}#__at .err{color:#fca5a5;margin-top:6px;word-break:break-word}'+
'#__at select{width:100%;background:#0f1115;color:#e6e8ee;border:1px solid #2a2f3a;border-radius:7px;padding:5px 6px;font:inherit;margin:3px 0 7px}'+
'#__at label{display:flex;gap:6px;align-items:center;color:#8b93a7;cursor:pointer}#__at button{font:inherit;border-radius:7px;padding:4px 9px;cursor:pointer;border:1px solid #2a2f3a;background:#1c2029;color:#e6e8ee;margin-top:8px}';
var st=document.createElement('style');st.textContent=css;var el=document.createElement('div');el.id='__at';
el.innerHTML='<div class="h"><span class="d"></span><code class="br"></code><span class="n"></span></div>'+
'<div class="p"><div class="s"></div><div class="m">Branch on display</div><select></select>'+
'<label><input type="checkbox" class="au"> <span class="al"></span></label><button class="rl">Reload the page</button><div class="err"></div></div>';
function mount(){var r=document.documentElement;r.appendChild(st);r.appendChild(el);
 new MutationObserver(function(){if(!el.isConnected){r.appendChild(st);r.appendChild(el)}}).observe(r,{childList:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
var q=function(s){return el.querySelector(s)},S=null,lastBr=null;
q('.h').onclick=function(){el.classList.toggle('o');try{sessionStorage.__ato=el.classList.contains('o')?1:''}catch(e){}if(el.classList.contains('o'))branches()};
try{if(sessionStorage.__ato)el.classList.add('o')}catch(e){}
q('.rl').onclick=function(){location.reload()};
function esc(s){return String(s||'').replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function ago(ms){var s=Math.max(0,Math.round((Date.now()-ms)/1000));if(s<5)return 'just now';if(s<60)return s+' s ago';var m=Math.round(s/60);if(m<60)return m+' min ago';return Math.round(m/60)+' h ago'}
var LBL={waiting:'waiting…',clone:'fetching…',install:'installing…',start:'starting…',update:'updating…',error:'error'};
function paint(s){S=s;var busy=s.status&&s.status!=='ready'&&s.status!=='error';
 q('.br').textContent=s.branch||'—';q('.d').className='d'+(s.status==='error'?' e':busy?' b':'');
 q('.n').textContent=LBL[s.status]||(s.applied?ago(s.applied):'');
 q('.s').textContent=(s.subject||'')+(s.sha?'  ('+s.sha+')':'');
 q('.al').textContent=s.session?'Go back to the latest '+s.prefix+'… branch on GitHub':'Follow the latest '+s.prefix+'… branch automatically';q('.au').checked=!!s.auto;
 q('.err').textContent=s.status==='error'?s.error:(s.notice||'');el.classList.toggle('w',!!s.notice&&s.status!=='error');
 if(lastBr!==s.branch){lastBr=s.branch;if(el.classList.contains('o'))branches()}}
function branches(){fetch('/__at/branches').then(function(r){return r.json()}).then(function(l){var cur=S&&S.branch;l=l||[];
 if(cur&&!l.some(function(b){return b.name===cur}))l.unshift({name:cur});
 q('select').innerHTML=l.map(function(b){return '<option value="'+esc(b.name)+'"'+(b.name===cur?' selected':'')+'>'+esc(b.name)+'</option>'}).join('')}).catch(function(){})}
function post(b){return fetch('/__at/branch',{method:'POST',headers:{'Content-Type':'application/json','X-Atelier':TK},body:JSON.stringify(b)})}
q('select').onchange=function(){post({branch:this.value})};
q('.au').onchange=function(){post({auto:this.checked})};
setInterval(function(){if(S)paint(S)},5000);
function flash(){el.classList.add('f');setTimeout(function(){el.classList.remove('f')},1500)}
var es=new EventSource('/__at/events');
es.addEventListener('status',function(e){paint(JSON.parse(e.data))});
es.addEventListener('updated',function(e){paint(JSON.parse(e.data));flash()});
es.addEventListener('reload',function(e){var s=JSON.parse(e.data);if(s.mode==='static'||document.getElementById('__at_wait'))location.reload();else{paint(s);flash()}});
})();</script>`.replace('__TOKEN__', S.token);
const htmlEscape = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function waitPage() {
  let title = 'Starting the site…', sub = 'The page will appear by itself as soon as it is ready.';
  if (S.status === 'waiting') { title = 'Waiting for the Claude Code session'; sub = 'Ask for a change in your cloud session: the site will appear here after the first transfer.'; }
  else if (S.status === 'clone') title = 'Fetching the site…';
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
    case '/__at/branches': return send(res, 200, JSON.stringify(S.dir ? (await listRefs(S.dir)).slice(0, 60) : []), 'application/json');
    case '/__at/branch': {
      if (req.method !== 'POST' || req.headers['x-atelier'] !== S.token) return send(res, 403, 'Refused');
      let body = ''; for await (const c of req) { body += c; if (body.length > 4096) break; }
      let j = {}; try { j = JSON.parse(body || '{}'); } catch {}
      if (typeof j.auto === 'boolean') { S.auto = j.auto; if (j.auto) Object.assign(S, { session: false, notice: '' }); }
      if (j.branch) Object.assign(S, { branch: String(j.branch), auto: false, sha: '', session: false, notice: '' });
      if (S.dir) sync(false).catch(() => {});
      res.writeHead(204); return res.end();
    }
  }
  if (S.mode === 'static' && S.status === 'ready') return serveStatic(req, res, url.pathname);
  if (S.status !== 'ready') return wantsHTML(req) ? send(res, 503, waitPage(), MIME['.html']) : send(res, 503, 'Site is starting');
  proxyHttp(req, res);
}

function openBrowser(url) {
  try {
    if (WIN) spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', windowsHide: true, detached: true }).unref();
    else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  } catch {}
}
function atelierOn(port) { // is an Atelier already listening on this port?
  return new Promise(resolve => {
    const r = http.get({ host: '127.0.0.1', port, path: '/__at/state', timeout: 1500 }, res => {
      let b = ''; res.on('data', d => b += d); res.on('end', () => { try { resolve('prefix' in JSON.parse(b)); } catch { resolve(false); } });
    });
    r.on('error', () => resolve(false)); r.on('timeout', () => { r.destroy(); resolve(false); });
  });
}
function listen(server, port) {
  return new Promise(resolve => { server.once('error', () => resolve(false)); server.listen(port, '127.0.0.1', () => { server.removeAllListeners('error'); resolve(true); }); });
}

// ---------- startup ----------
console.log(`\n  Atelier ${VERSION} — live preview of the site edited by Claude Code\n`);
if (+process.versions.node.split('.')[0] < 20) fatal(`Node.js 20 or later is required (current version: ${process.versions.node}).`);
fs.mkdirSync(INBOX, { recursive: true }); fs.mkdirSync(DATA, { recursive: true });

const server = http.createServer((req, res) => handle(req, res).catch(e => { try { send(res, 500, String(e && e.message || e)); } catch {} }));
server.on('upgrade', proxyUpgrade);
for (let p = cfg.port; p < cfg.port + 20 && !S.port; p++) {
  if (await listen(server, p)) S.port = p;
  else if (await atelierOn(p)) {
    console.log(`  Atelier is already running: http://localhost:${p}`);
    if (cfg.open) openBrowser('http://localhost:' + p);
    await sleep(1500); process.exit(0);
  }
}
if (!S.port) fatal(`No free port between ${cfg.port} and ${cfg.port + 19}.`);
const siteURL = 'http://localhost:' + S.port;
console.log(`  Site    : ${cfg.repo ? repoLabel(cfg.repo) : 'the one of the Claude Code session (waiting for the first transfer)'}\n  Preview : ${siteURL}\n  Inbox   : ${INBOX}\n\n  Keep this window open. Close it to stop the preview.\n`);

GIT = await findGit();
if (!GIT) fatal('Git is not installed on this computer.\nInstall "Git for Windows" from https://git-scm.com/downloads/win (default options), then start Atelier again.');

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { console.log('\n  Stopping the preview…'); stopDev(); setTimeout(() => process.exit(0), WIN ? 400 : 100); });
process.on('exit', () => killTree(S.dev));
setInterval(() => { for (const c of S.clients) c.write(': ping\n\n'); }, 20000).unref();
if (cfg.open) openBrowser(siteURL);

writeStatus();
if (cfg.repo) await openRepo(cfg.repo);
else log('Waiting for the first transfer from the Claude Code session…');
watchInbox();

#!/usr/bin/env node
// Atelier — the part Claude starts on the user's computer (a local MCP server, spoken over stdin/stdout).
//
// It keeps the preview engine (engine.mjs) running while Claude is open, and gives Claude two tools:
//   status  where the preview is, where to drop transfers, and whether the last one was applied
//   stop    stop the preview
// No dependencies: Node.js 20 or later. Everything written to stdout is protocol; logs go to stderr.
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { VERSION, dataDir, inboxDir } from './paths.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = dataDir();
const INBOX = inboxDir();
const ENGINE_FILE = path.join(DATA, 'engine.json');
const HEARTBEAT = path.join(DATA, 'heartbeat');
const STOPPED = path.join(DATA, 'stopped');
const LOG = path.join(DATA, 'engine.log');
// A cloud session also loads this plugin, inside its own remote machine. The preview belongs on the user's computer, so that copy stays idle.
const IN_CLOUD = process.env.ATELIER_FORCE_LOCAL !== '1' && (process.env.CLAUDE_CODE_REMOTE === 'true' || !!process.env.CCR_AGENT_PROXY_ENABLED);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const readJSON = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const err = m => process.stderr.write(`[atelier] ${m}\n`);

// ---------- the engine ----------
function getState(port) {
  return new Promise(resolve => {
    const r = http.get({ host: '127.0.0.1', port, path: '/__at/state', timeout: 1500 }, res => {
      let b = ''; res.on('data', d => b += d); res.on('end', () => { try { const j = JSON.parse(b); resolve('atelier' in j ? j : null); } catch { resolve(null); } });
    });
    r.on('error', () => resolve(null)); r.on('timeout', () => { r.destroy(); resolve(null); });
  });
}
function askQuit(info) {
  return new Promise(resolve => {
    const r = http.request({ host: '127.0.0.1', port: info.port, path: '/__at/quit', method: 'POST', headers: { 'X-Atelier': info.token }, timeout: 2000 }, res => { res.resume(); res.on('end', () => resolve(true)); });
    r.on('error', () => resolve(false)); r.on('timeout', () => { r.destroy(); resolve(false); });
    r.end();
  });
}
const heartbeat = () => { try { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(HEARTBEAT, String(Date.now())); } catch {} };
async function running() {
  const info = readJSON(ENGINE_FILE);
  if (!info || !info.port) return null;
  const state = await getState(info.port);
  return state ? { info, state } : null;
}
let starting = null;
function ensureEngine() {
  if (!starting) starting = (async () => {
    heartbeat();
    let r = await running();
    if (r && r.state.atelier !== VERSION) { err(`replacing engine ${r.state.atelier} with ${VERSION}`); await askQuit(r.info); await sleep(1200); r = null; }
    if (r) return r;
    try { if (fs.statSync(LOG).size > 1 << 20) fs.renameSync(LOG, LOG + '.old'); } catch {}
    const out = fs.openSync(LOG, 'a');
    const child = spawn(process.execPath, [path.join(HERE, 'engine.mjs')], {
      detached: true, stdio: ['ignore', out, out], windowsHide: true,
      env: { ...process.env, ATELIER_DATA: DATA, ATELIER_INBOX: INBOX, ATELIER_SUPERVISED: '1' },
    });
    child.on('error', e => err('could not start the engine: ' + e.message));
    child.unref(); fs.closeSync(out);
    for (let i = 0; i < 40; i++) { await sleep(250); r = await running(); if (r) return r; }
    return null;
  })().finally(() => { starting = null; });
  return starting;
}
function logTail(n) {
  try { const t = fs.readFileSync(LOG, 'utf8'); return t.slice(-6000).split('\n').filter(Boolean).slice(-n); } catch { return []; }
}

// ---------- tools ----------
const TOOLS = [
  {
    name: 'status',
    description: 'Atelier preview on the user\'s computer: starts it if needed and returns its state as JSON. `inbox` is the folder on that computer where transfer files (atelier@owner@repo.tgz, made by pack.sh) must be dropped; `url` is the preview address; `status` is waiting, install, start, ready or error; `id` is the transfer on display. Pass `wait_for` with the id printed by pack.sh to wait until that transfer is applied. `need_full: true` means a full snapshot must be sent (run pack.sh full); `seen` is the last transfer looked at, applied or not.',
    inputSchema: {
      type: 'object',
      properties: {
        wait_for: { type: 'string', description: 'Transfer id (printed by pack.sh) to wait for.' },
        timeout_seconds: { type: 'number', description: 'How long to wait for it, 45 at most. Default 40 when wait_for is given.' },
      },
    },
  },
  {
    name: 'stop',
    description: 'Stops the Atelier preview on the user\'s computer. It starts again at the next `status` call.',
    inputSchema: { type: 'object', properties: {} },
  },
];
async function toolStatus(args) {
  if (IN_CLOUD) return { running: false, where: 'cloud session', hint: 'This copy of Atelier runs inside the cloud session and stays idle. Use the Atelier tools whose name starts with mcp__remote-devices__: they run on the user\'s computer.' };
  try { fs.rmSync(STOPPED, { force: true }); } catch {}
  const waitFor = typeof args.wait_for === 'string' ? args.wait_for.trim() : '';
  const timeout = Math.max(0, Math.min(45, Number(args.timeout_seconds ?? (waitFor ? 40 : 0)) || 0)) * 1000;
  const started = Date.now(), deadline = started + timeout;
  let r = await ensureEngine();
  while (waitFor && Date.now() < deadline) {
    // "full snapshot needed" is only believed once the engine has had time to look at the file just dropped
    if (r && r.state.need_full && r.state.seen === waitFor && Date.now() - started > 2500) break;
    if (r && r.state.id === waitFor && (r.state.status === 'ready' || r.state.status === 'error')) break;
    await sleep(600);
    r = await running() || await ensureEngine();
  }
  const base = { where: 'user computer', inbox: INBOX, separator: path.sep, node: process.versions.node, platform: process.platform };
  if (!r) return { running: false, ...base, error: 'The preview engine did not start.', log: logTail(15) };
  const out = { running: true, ...r.state, ...base };
  if (waitFor) out.applied_requested = r.state.id === waitFor;
  if (r.state.status !== 'ready' || r.state.notice) out.log = logTail(15);
  return out;
}
async function toolStop() {
  if (IN_CLOUD) return { stopped: false, where: 'cloud session' };
  try { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(STOPPED, '1'); } catch {}
  const r = await running();
  if (r) await askQuit(r.info);
  return { stopped: true };
}

// ---------- protocol (JSON-RPC 2.0, one message per line) ----------
const send = msg => process.stdout.write(JSON.stringify(msg) + '\n');
async function onMessage(msg) {
  const { id, method, params } = msg;
  const reply = result => { if (id !== undefined) send({ jsonrpc: '2.0', id, result }); };
  const fail = (code, message) => { if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code, message } }); };
  switch (method) {
    case 'initialize':
      return reply({ protocolVersion: (params && params.protocolVersion) || '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'atelier', version: VERSION } });
    case 'ping': return reply({});
    case 'tools/list': return reply({ tools: TOOLS });
    case 'tools/call': {
      const name = params && params.name, args = (params && params.arguments) || {};
      try {
        const result = name === 'status' ? await toolStatus(args) : name === 'stop' ? await toolStop() : null;
        if (!result) return fail(-32602, 'Unknown tool: ' + name);
        return reply({ content: [{ type: 'text', text: JSON.stringify(result, null, 1) }] });
      } catch (e) { return reply({ content: [{ type: 'text', text: 'Atelier error: ' + (e && e.message || e) }], isError: true }); }
    }
    case 'resources/list': return reply({ resources: [] });
    case 'prompts/list': return reply({ prompts: [] });
    default:
      if (id !== undefined) fail(-32601, 'Method not found: ' + method);
  }
}
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', line => { line = line.trim(); if (!line) return; let msg; try { msg = JSON.parse(line); } catch { return; } onMessage(msg).catch(e => err(e.message)); });
rl.on('close', () => process.exit(0));

// ---------- keep the preview alive while Claude is open ----------
if (!IN_CLOUD) {
  const tick = () => { heartbeat(); if (!fs.existsSync(STOPPED)) ensureEngine().catch(e => err(e.message)); };
  tick();
  setInterval(tick, 20000);
}

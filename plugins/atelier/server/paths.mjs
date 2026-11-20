// Where Atelier keeps its files on the user's computer. Shared by the MCP server and the engine.
import os from 'node:os';
import path from 'node:path';

export const VERSION = '5.1';

// Site copies, their dependencies, logs. Inside Claude's own plugin folder when Claude provides one.
export function dataDir() {
  const set = v => v && !v.includes('${') ? v : '';
  if (set(process.env.ATELIER_DATA)) return process.env.ATELIER_DATA;
  if (set(process.env.CLAUDE_PLUGIN_DATA)) return process.env.CLAUDE_PLUGIN_DATA;
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Atelier');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Caches', 'Atelier');
  return path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'atelier');
}

// Where the cloud session drops its transfers: the system temporary folder, which Claude can be given access to.
export function inboxDir() {
  return process.env.ATELIER_INBOX || path.join(os.tmpdir(), 'atelier', 'inbox');
}

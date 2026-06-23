// Gitsidian — main process. Authored by will.be.
'use strict';

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const { execFile, execFileSync } = require('child_process');
const pty = require('node-pty');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const https = require('https');

// Pin the app name so user data (added projects, settings) always lives under
// ".../Application Support/Gitsidian" — not the dev-mode default of "Electron".
app.setName('Gitsidian');

// GUI-launched macOS apps inherit only a minimal PATH (no /opt/homebrew/bin),
// so CLIs like `gh` aren't found. Recover the real PATH from a login shell.
function patchPathFromLoginShell() {
  if (process.platform === 'win32') return;
  try {
    const sh = process.env.SHELL || '/bin/zsh';
    const out = execFileSync(sh, ['-lic', 'echo "G1TSIDIAN_PATH=$PATH"'], { timeout: 5000 }).toString();
    const m = out.match(/G1TSIDIAN_PATH=(.+)/);
    if (m && m[1].trim()) process.env.PATH = m[1].trim();
  } catch {}
}
patchPathFromLoginShell();

// ===========================================================================
// Helpers
// ===========================================================================

function expandHome(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { maxBuffer: 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      resolve({ err, stdout: (stdout || '').toString(), stderr: (stderr || '').toString() });
    });
  });
}

function git(repoPath, args) {
  return run('git', ['-C', repoPath, ...args]);
}

// The user's login shell — used to launch CLIs with a full PATH/profile.
function userShell() {
  return process.env.SHELL || '/bin/zsh';
}

// ===========================================================================
// AI CLI registry
// ===========================================================================
// Each entry: how to detect it, and how to launch it. `args` is the default
// argument list passed to the binary. Detection is by presence on PATH.

const AI_CLIS = [
  { id: 'claude', name: 'Claude Code', bin: 'claude', args: [], color: '#d97757' },
  { id: 'codex', name: 'Codex (OpenAI)', bin: 'codex', args: [], color: '#10a37f' },
  { id: 'gemini', name: 'Gemini CLI', bin: 'gemini', args: [], color: '#4285f4' },
  { id: 'opencode', name: 'OpenCode', bin: 'opencode', args: [], color: '#f59e0b' },
  { id: 'aider', name: 'Aider', bin: 'aider', args: [], color: '#a371f7' },
  { id: 'goose', name: 'Goose', bin: 'goose', args: [], color: '#22c55e' },
  { id: 'crush', name: 'Crush', bin: 'crush', args: [], color: '#ec4899' },
  { id: 'cursor', name: 'Cursor Agent', bin: 'cursor-agent', args: [], color: '#60a5fa' },
  { id: 'amazonq', name: 'Amazon Q', bin: 'q', args: ['chat'], color: '#ff9900' },
  { id: 'cody', name: 'Sourcegraph Cody', bin: 'cody', args: [], color: '#a855f7' },
  { id: 'plandex', name: 'Plandex', bin: 'plandex', args: [], color: '#14b8a6' },
  { id: 'interpreter', name: 'Open Interpreter', bin: 'interpreter', args: [], color: '#ef4444' },
  { id: 'gptme', name: 'gptme', bin: 'gptme', args: [], color: '#84cc16' },
  { id: 'mods', name: 'Mods', bin: 'mods', args: [], color: '#f472b6' },
  { id: 'llm', name: 'llm', bin: 'llm', args: [], color: '#38bdf8' },
  { id: 'aichat', name: 'aichat', bin: 'aichat', args: [], color: '#fbbf24' },
  { id: 'sgpt', name: 'Shell GPT', bin: 'sgpt', args: [], color: '#34d399' },
  { id: 'ollama', name: 'Ollama', bin: 'ollama', args: ['run', 'llama3'], color: '#cbd5e1' },
  { id: 'shell', name: 'Terminal (shell)', bin: null, args: [], color: '#7d8590' },
];

// User-added custom commands (e.g. `ollama run deepseek-coder`, `aider --model deepseek`).
function customAiFile() { return path.join(app.getPath('userData'), 'ai-clis.json'); }
function readCustomAis() {
  try { const r = JSON.parse(fs.readFileSync(customAiFile(), 'utf8')); return Array.isArray(r) ? r : []; }
  catch { return []; }
}
function writeCustomAis(list) {
  fs.mkdirSync(path.dirname(customAiFile()), { recursive: true });
  fs.writeFileSync(customAiFile(), JSON.stringify(list, null, 2));
}
// Resolve an AI id to its definition (built-in or custom), falling back to shell.
function resolveAi(id) {
  return AI_CLIS.find((a) => a.id === id)
    || readCustomAis().find((a) => a.id === id)
    || AI_CLIS.find((a) => a.id === 'shell');
}

// Resolve a binary on PATH. On macOS/Linux we go through a login shell so we
// see the same PATH the user gets in their Terminal; on Windows we use `where`.
function whichBin(bin) {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      execFile('where', [bin], { timeout: 5000 }, (err, stdout) => {
        const p = (stdout || '').trim().split(/\r?\n/).filter(Boolean)[0];
        resolve(p || null);
      });
      return;
    }
    execFile(userShell(), ['-lic', `command -v ${bin} 2>/dev/null`], { timeout: 5000 }, (err, stdout) => {
      const p = (stdout || '').trim().split('\n').filter(Boolean).pop();
      resolve(p && !p.includes(' ') ? p : null);
    });
  });
}

async function listAis() {
  const out = [];
  for (const ai of AI_CLIS) {
    if (ai.bin === null) {
      out.push({ ...ai, installed: true, path: userShell() });
    } else {
      const p = await whichBin(ai.bin);
      out.push({ ...ai, installed: !!p, path: p || null });
    }
  }
  // User-added custom commands — detect by the first token of the command.
  for (const ai of readCustomAis()) {
    const bin = (ai.command || '').trim().split(/\s+/)[0];
    const p = bin ? await whichBin(bin) : null;
    out.push({ id: ai.id, name: ai.name, command: ai.command, custom: true, installed: !!p, path: p || null, color: '#9aa2b1' });
  }
  return out;
}

// ===========================================================================
// Vault detection
// ===========================================================================

// Where Obsidian stores its registry of known vaults, per platform.
function obsidianRegistryPath() {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'obsidian', 'obsidian.json');
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || '', 'obsidian', 'obsidian.json');
  }
  return path.join(os.homedir(), '.config', 'obsidian', 'obsidian.json');
}

function readObsidianVaults() {
  const file = obsidianRegistryPath();
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const vaults = raw.vaults || {};
    return Object.entries(vaults).map(([id, v]) => ({ id, path: v.path, source: 'obsidian' }));
  } catch {
    return [];
  }
}

// Vaults the user has manually added in Gitsidian (persisted in userData).
function extraVaultsFile() {
  return path.join(app.getPath('userData'), 'vaults.json');
}
function readExtraVaults() {
  try {
    const raw = JSON.parse(fs.readFileSync(extraVaultsFile(), 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}
function writeExtraVaults(list) {
  fs.mkdirSync(path.dirname(extraVaultsFile()), { recursive: true });
  fs.writeFileSync(extraVaultsFile(), JSON.stringify(list, null, 2));
}

// ===========================================================================
// Git status (repo-wide)
// ===========================================================================

async function gitStatus(repoPath, { fetch = false } = {}) {
  if (!fs.existsSync(path.join(repoPath, '.git'))) return { isRepo: false };
  if (fetch) await git(repoPath, ['fetch', '--quiet']);

  const branchRes = await git(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const branch = branchRes.err ? '?' : branchRes.stdout.trim();

  const dirtyRes = await git(repoPath, ['status', '--porcelain']);
  const dirty = !dirtyRes.err && dirtyRes.stdout.trim().length > 0;
  const changedCount = dirty ? dirtyRes.stdout.trim().split('\n').length : 0;

  let ahead = 0, behind = 0, hasUpstream = false;
  // Prefer the configured upstream; if none is set (e.g. pushed without `-u`),
  // fall back to origin/<branch> so the repo is still recognised as "on GitHub".
  let countRes = await git(repoPath, ['rev-list', '--left-right', '--count', '@{upstream}...HEAD']);
  if (countRes.err) {
    const originRef = `origin/${branch}`;
    const exists = !(await git(repoPath, ['rev-parse', '--verify', '--quiet', originRef])).err;
    if (exists) countRes = await git(repoPath, ['rev-list', '--left-right', '--count', `${originRef}...HEAD`]);
  }
  if (!countRes.err && countRes.stdout.trim()) {
    const [b, a] = countRes.stdout.trim().split(/\s+/).map((n) => parseInt(n, 10) || 0);
    behind = b; ahead = a; hasUpstream = true;
  }
  return { isRepo: true, branch, dirty, changedCount, ahead, behind, hasUpstream };
}

// Scan the user's home folder for git repos and Obsidian vaults so they don't
// have to hunt through Finder. Bounded depth + a skip-list keeps it fast; we
// stop descending once a repo/vault marker is found.
const SCAN_SKIP = new Set([
  'node_modules', 'Library', 'Applications', 'Pictures', 'Music', 'Movies',
  '.Trash', '.Trashes', '.cache', '.npm', '.cargo', '.rustup', '.gradle', '.m2',
  'go', 'venv', '.venv', 'vendor', 'dist', 'build', '.next', '.cache',
]);

function scanRepos({ maxDepth = 4, maxResults = 800 } = {}) {
  const home = os.homedir();
  const results = [];

  function walk(dir, depth) {
    if (depth > maxDepth || results.length >= maxResults) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    const names = new Set(entries.map((e) => e.name));
    const isGit = names.has('.git');
    const isObs = names.has('.obsidian');
    if (isGit || isObs) {
      results.push({ path: dir, name: path.basename(dir), git: isGit, obsidian: isObs });
      return; // don't recurse into a repo/vault
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.') || SCAN_SKIP.has(e.name)) continue;
      walk(path.join(dir, e.name), depth + 1);
    }
  }

  walk(home, 0);
  results.sort((a, b) => a.path.localeCompare(b.path));
  return results;
}

// Build the full project list: Obsidian-detected + user-added, de-duped by path.
async function listProjects({ fetch = false } = {}) {
  const seen = new Set();
  const merged = [];
  for (const v of [...readObsidianVaults(), ...readExtraVaults()]) {
    const abs = expandHome(v.path);
    if (!abs || seen.has(abs)) continue;
    seen.add(abs);
    merged.push({ ...v, path: abs });
  }

  const vaults = [];
  for (const v of merged) {
    const exists = fs.existsSync(v.path);
    let folders = [];
    if (exists) {
      try {
        folders = fs.readdirSync(v.path, { withFileTypes: true })
          .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
          .map((d) => ({ name: d.name, path: path.join(v.path, d.name) }))
          .sort((a, b) => a.name.localeCompare(b.name));
      } catch { folders = []; }
    }
    const status = exists ? await gitStatus(v.path, { fetch }) : { isRepo: false, missing: true };
    vaults.push({
      id: v.id || v.path,
      name: path.basename(v.path),
      path: v.path,
      source: v.source || 'added',
      exists,
      folders,
      git: status,
    });
  }
  vaults.sort((a, b) => a.name.localeCompare(b.name));
  return vaults;
}

// ===========================================================================
// PTY manager — one pseudo-terminal per session/tab
// ===========================================================================

const sessions = new Map(); // id -> { proc, busy, idleTimer, win }
let seq = 0;
const IDLE_MS = 700; // silence after which a tab is considered "idle / waiting"

function emit(win, channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function createSession(win, { cwd, ai }) {
  const id = `s${++seq}`;
  const aiDef = resolveAi(ai);

  // The command to run: a custom command string, a built-in bin+args, or none (shell).
  const cmdWin = aiDef.command || (aiDef.bin ? [aiDef.bin, ...(aiDef.args || [])].join(' ') : '');
  const cmdUnix = aiDef.command || (aiDef.bin ? [aiDef.bin, ...(aiDef.args || [])].map(shellQuote).join(' ') : '');

  // Build the shell command per-platform.
  let shellPath, shellArgs;
  if (process.platform === 'win32') {
    shellPath = 'powershell.exe';
    shellArgs = cmdWin ? ['-NoLogo', '-Command', cmdWin] : ['-NoLogo'];
  } else {
    // macOS/Linux: a login+interactive shell that execs the command (full PATH).
    shellPath = userShell();
    shellArgs = cmdUnix ? ['-l', '-i', '-c', `exec ${cmdUnix}`] : ['-l', '-i'];
  }

  const proc = pty.spawn(shellPath, shellArgs, {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: cwd && fs.existsSync(cwd) ? cwd : os.homedir(),
    env: { ...process.env, TERM: 'xterm-256color', GITSIDIAN: '1' },
  });

  const session = { proc, busy: false, idleTimer: null, win };
  sessions.set(id, session);

  const markIdle = () => {
    session.busy = false;
    emit(win, 'pty:status', { id, busy: false, alive: true });
  };

  proc.onData((data) => {
    emit(win, 'pty:data', { id, data });
    // Activity heuristic: output flowing => busy; quiet for IDLE_MS => idle.
    if (!session.busy) {
      session.busy = true;
      emit(win, 'pty:status', { id, busy: true, alive: true });
    }
    clearTimeout(session.idleTimer);
    session.idleTimer = setTimeout(markIdle, IDLE_MS);
  });

  proc.onExit(({ exitCode }) => {
    clearTimeout(session.idleTimer);
    sessions.delete(id);
    emit(win, 'pty:status', { id, busy: false, alive: false, exitCode });
  });

  return { id, ai: aiDef.id, aiName: aiDef.name, color: aiDef.color || '#9aa2b1', cwd };
}

// ===========================================================================
// Window
// ===========================================================================

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 820,
    minHeight: 520,
    title: 'Gitsidian',
    backgroundColor: '#0d0f14',
    // macOS: inset traffic lights over our custom bar. Windows/Linux: native
    // frame (controls top-right), with our toolbar sitting just below it.
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile('index.html');

  // App keyboard shortcuts. On macOS use Cmd (terminals use Ctrl, so no clash);
  // on Windows/Linux use Ctrl+Shift to avoid clobbering terminal Ctrl keys.
  // preventDefault() here also overrides menu accelerators (e.g. Cmd+W close window).
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const mac = process.platform === 'darwin';
    const mod = mac ? (input.meta && !input.control && !input.alt)
                    : (input.control && input.shift && !input.alt);
    if (!mod) return;
    const key = (input.key || '').toLowerCase();
    let action = null;
    if (key === 't') action = 'new-terminal';
    else if (key === 'w') action = 'close-tab';
    else if (key === 'k') action = 'clear';
    else if (mac && /^[1-9]$/.test(key)) action = 'switch:' + key; // Cmd+1..9
    if (action) { event.preventDefault(); win.webContents.send('shortcut', action); }
  });

  return win;
}

// ===========================================================================
// IPC
// ===========================================================================

ipcMain.handle('projects:list', (_e, opts) => listProjects(opts || {}));
ipcMain.handle('ai:list', () => listAis());

// Add a custom AI command (e.g. "ollama run deepseek-coder"). Validates that
// its binary is on PATH, then persists it.
ipcMain.handle('ai:add', async (_e, { name, command } = {}) => {
  name = (name || '').trim();
  command = (command || '').trim();
  if (!name || !command) return { ok: false, error: 'Please enter a name and a command.' };
  const bin = command.split(/\s+/)[0];
  const found = await whichBin(bin);
  if (!found) return { ok: false, error: `"${bin}" isn't on your PATH. Install it first, or check the command.` };
  const list = readCustomAis();
  const id = `custom:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`;
  list.push({ id, name, command });
  writeCustomAis(list);
  return { ok: true, id };
});
ipcMain.handle('repos:scan', (_e, opts) => scanRepos(opts || {}));

// Add several folders as projects at once (used by the repo scanner).
ipcMain.handle('vault:addPaths', (_e, paths) => {
  const list = readExtraVaults();
  for (const p of paths || []) {
    const abs = expandHome(p);
    if (!list.some((v) => expandHome(v.path) === abs)) list.push({ path: abs, source: 'added' });
  }
  writeExtraVaults(list);
  return { ok: true, count: (paths || []).length };
});

// Per-file git status for a repo, as { files: {absPath: 'new'|'modified'|'deleted'},
// dirs: [absPaths of folders containing changes] } — for tinting the file tree.
ipcMain.handle('git:changes', async (_e, p) => {
  const repo = expandHome(p);
  const empty = { files: {}, dirs: [] };
  if (!fs.existsSync(path.join(repo, '.git'))) return empty;
  const r = await git(repo, ['status', '--porcelain']);
  if (r.err || !r.stdout.trim()) return empty;
  const files = {};
  const dirSet = new Set();
  for (const line of r.stdout.split('\n')) {
    if (!line.trim()) continue;
    const code = line.slice(0, 2);
    let rel = line.slice(3).trim();
    if (rel.includes(' -> ')) rel = rel.split(' -> ')[1];       // renames
    rel = rel.replace(/^"|"$/g, '');                             // quoted paths
    const abs = path.join(repo, rel);
    let type = 'modified';
    if (code === '??' || code.includes('A')) type = 'new';
    else if (code.includes('D')) type = 'deleted';
    files[abs] = type;
    let d = path.dirname(abs);
    while (d.length > repo.length && d.startsWith(repo)) { dirSet.add(d); d = path.dirname(d); }
  }
  return { files, dirs: [...dirSet] };
});

// Add a path to the repo's .gitignore (and untrack it if it was tracked).
ipcMain.handle('git:ignore', async (_e, { repo, target } = {}) => {
  const repoAbs = expandHome(repo);
  const targetAbs = expandHome(target);
  let rel = path.relative(repoAbs, targetAbs);
  if (!rel || rel.startsWith('..')) return { ok: false, error: 'That path is outside the project.' };
  let isDir = false;
  try { isDir = fs.statSync(targetAbs).isDirectory(); } catch {}
  const entry = isDir ? `${rel.replace(/\/+$/, '')}/` : rel;

  const gi = path.join(repoAbs, '.gitignore');
  let lines = [];
  try { lines = fs.readFileSync(gi, 'utf8').split('\n'); } catch {}
  if (!lines.map((l) => l.trim()).includes(entry)) {
    let content = lines.join('\n');
    if (content && !content.endsWith('\n')) content += '\n';
    fs.writeFileSync(gi, content + entry + '\n');
  }
  // If it's currently tracked, untrack it so the ignore takes effect.
  if (fs.existsSync(path.join(repoAbs, '.git'))) {
    const tracked = !(await git(repoAbs, ['ls-files', '--error-unmatch', rel])).err;
    if (tracked) await git(repoAbs, ['rm', '--cached', '-r', '--quiet', '--', rel]);
  }
  return { ok: true, entry };
});

// Immediate children of a directory, for lazy file-tree expansion.
// Dotfiles are hidden; directories sort before files.
ipcMain.handle('fs:list', (_e, dirPath) => {
  try {
    const abs = expandHome(dirPath);
    const entries = fs.readdirSync(abs, { withFileTypes: true })
      .filter((d) => !d.name.startsWith('.'))
      .map((d) => ({ name: d.name, path: path.join(abs, d.name), isDir: d.isDirectory() }));
    entries.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
    return entries;
  } catch {
    return [];
  }
});

ipcMain.handle('vault:addFolder', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'], title: 'Add a folder as a vault' });
  if (res.canceled || !res.filePaths.length) return { canceled: true };
  const list = readExtraVaults();
  if (!list.some((v) => expandHome(v.path) === res.filePaths[0])) {
    list.push({ path: res.filePaths[0], source: 'added' });
    writeExtraVaults(list);
  }
  return { canceled: false, path: res.filePaths[0] };
});

ipcMain.handle('vault:clone', async (e, { url, parentDir, name }) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  let dest = parentDir ? expandHome(parentDir) : null;
  if (!dest) {
    const res = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Where should the cloned vault go?',
    });
    if (res.canceled || !res.filePaths.length) return { canceled: true };
    dest = res.filePaths[0];
  }
  const folderName = name || (url.split('/').pop() || 'vault').replace(/\.git$/, '');
  const target = path.join(dest, folderName);
  const res = await run('git', ['clone', url, target]);
  if (res.err) return { ok: false, error: res.stderr || res.err.message };
  const list = readExtraVaults();
  list.push({ path: target, source: 'added' });
  writeExtraVaults(list);
  return { ok: true, path: target };
});

// Write a sensible .gitignore when first initializing a repo (never overwrite).
function ensureGitignore(repo) {
  const gi = path.join(repo, '.gitignore');
  if (fs.existsSync(gi)) return;
  fs.writeFileSync(gi, [
    'node_modules/', '.DS_Store', '.env', '.env.*', '*.log', 'dist/', 'build/', '',
  ].join('\n'));
}

// Publish a project to GitHub. Handles three starting points:
//  - not a git repo  -> git init + .gitignore + initial commit, then create + push
//  - repo, no commits -> .gitignore + initial commit, then create + push
//  - repo with commits, no remote -> create + push (working tree untouched)
ipcMain.handle('git:publish', async (_e, { path: p, name, isPrivate }) => {
  const repo = expandHome(p);
  if (!fs.existsSync(repo)) return { ok: false, error: 'Folder not found.' };

  const ghv = await run('gh', ['--version']);
  if (ghv.err) return { ok: false, error: 'GitHub CLI (gh) not found on PATH. Install it to publish.' };
  const auth = await run('gh', ['auth', 'status']);
  if (auth.err) return { ok: false, error: 'Not signed in to GitHub. Run: gh auth login' };

  if (!fs.existsSync(path.join(repo, '.git'))) {
    const init = await git(repo, ['init']);
    if (init.err) return { ok: false, error: init.stderr || 'git init failed' };
  }

  const hasCommit = !(await git(repo, ['rev-parse', 'HEAD'])).err;
  if (!hasCommit) {
    ensureGitignore(repo);
    await git(repo, ['add', '-A']);
    const commit = await git(repo, ['commit', '-m', 'Initial commit']);
    if (commit.err) return { ok: false, error: commit.stderr || 'Nothing to commit.' };
  }

  // Already has an origin? Then just push the current branch upstream.
  const hasOrigin = !(await git(repo, ['remote', 'get-url', 'origin'])).err;
  if (hasOrigin) {
    const push = await git(repo, ['push', '-u', 'origin', 'HEAD']);
    if (push.err) return { ok: false, error: push.stderr || 'Push failed.' };
  } else {
    const vis = isPrivate ? '--private' : '--public';
    const create = await run('gh', ['repo', 'create', name, vis, '--source', repo, '--remote', 'origin', '--push']);
    if (create.err) return { ok: false, error: create.stderr || create.err.message };
  }

  const url = (await git(repo, ['remote', 'get-url', 'origin'])).stdout.trim()
    .replace(/\.git$/, '').replace(/^git@github\.com:/, 'https://github.com/');
  return { ok: true, url };
});

ipcMain.handle('vault:remove', (_e, vaultPath) => {
  const list = readExtraVaults().filter((v) => expandHome(v.path) !== expandHome(vaultPath));
  writeExtraVaults(list);
  return { ok: true };
});

// Inspect a repo before pushing: visibility, your permission, ownership, and
// the list of pending changes — so the UI can warn appropriately.
ipcMain.handle('git:repoInfo', async (_e, p) => {
  const repo = expandHome(p);
  const info = { hasOrigin: false, changedFiles: [] };
  if (!fs.existsSync(path.join(repo, '.git'))) return info;

  const st = await git(repo, ['status', '--porcelain']);
  info.changedFiles = st.stdout.trim() ? st.stdout.trim().split('\n').map((l) => l.slice(3)) : [];

  const origin = await git(repo, ['remote', 'get-url', 'origin']);
  if (origin.err) return info;
  info.hasOrigin = true;

  const ghv = await run('gh', ['--version']);
  if (!ghv.err) {
    const view = await run('gh', ['repo', 'view', '--json', 'visibility,viewerPermission,nameWithOwner,owner'], { cwd: repo });
    if (!view.err) {
      try {
        const j = JSON.parse(view.stdout);
        info.visibility = j.visibility;                 // PUBLIC | PRIVATE | INTERNAL
        info.viewerPermission = j.viewerPermission;     // ADMIN | MAINTAIN | WRITE | TRIAGE | READ
        info.nameWithOwner = j.nameWithOwner;
        info.ownerLogin = j.owner && j.owner.login;
        info.canPush = ['ADMIN', 'MAINTAIN', 'WRITE'].includes(j.viewerPermission);
      } catch {}
    }
    const me = await run('gh', ['api', 'user', '--jq', '.login']);
    if (!me.err) info.isOwn = info.ownerLogin && me.stdout.trim().toLowerCase() === info.ownerLogin.toLowerCase();
  }
  return info;
});

// Pull the latest from GitHub. Fast-forward only, so it never creates a merge
// commit or clobbers local work — if it can't cleanly update, it says why.
// Preview what a pull would bring: incoming commit count, changed files, and an
// approximate size — so users with limited storage can decide before pulling.
ipcMain.handle('git:pullPreview', async (_e, p) => {
  const repo = expandHome(p);
  const branch = (await git(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim() || 'HEAD';
  await git(repo, ['fetch', '--quiet', 'origin', branch]); // refresh origin/<branch>
  const ref = `origin/${branch}`;
  if ((await git(repo, ['rev-parse', '--verify', '--quiet', ref])).err) {
    return { ok: false, error: 'No matching branch on GitHub.' };
  }
  const behind = parseInt((await git(repo, ['rev-list', '--count', `HEAD..${ref}`])).stdout.trim() || '0', 10);
  if (behind === 0) return { ok: true, behind: 0, files: [], bytes: 0 };

  const ns = await git(repo, ['diff', '--name-status', `HEAD..${ref}`]);
  const lines = ns.stdout.trim() ? ns.stdout.trim().split('\n') : [];
  const files = [];
  let bytes = 0;
  for (const ln of lines.slice(0, 500)) {
    const parts = ln.split('\t');
    const status = parts[0][0]; // A / M / D / R
    const file = parts[parts.length - 1];
    let size = 0;
    if (status !== 'D') {
      const s = await git(repo, ['cat-file', '-s', `${ref}:${file}`]);
      if (!s.err) size = parseInt(s.stdout.trim() || '0', 10) || 0;
    }
    bytes += size;
    files.push({ status, file, size });
  }
  return { ok: true, behind, files, bytes, truncated: lines.length > 500 };
});

ipcMain.handle('git:pull', async (_e, p) => {
  const repo = expandHome(p);
  // Pull explicitly from origin/<branch> so it works even without upstream tracking.
  const branch = (await git(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim() || 'HEAD';
  let res = await git(repo, ['pull', '--ff-only', 'origin', branch]);
  if (res.err && /couldn.t find remote ref|no such ref|does not appear/i.test(res.stderr || '')) {
    res = await git(repo, ['pull', '--ff-only']); // fall back to default
  }
  if (res.err) {
    const out = (res.stderr || res.stdout || '').trim();
    if (/diverg|not possible to fast-forward|would be overwritten|local changes/i.test(out)) {
      return { ok: false, error: 'Can’t fast-forward — you have local commits or edits. Commit/push or stash them first, then pull.' };
    }
    if (/no tracking information|no upstream/i.test(out)) {
      return { ok: false, error: 'This branch isn’t tracking a GitHub branch yet.' };
    }
    return { ok: false, error: out || 'Pull failed.' };
  }
  const upToDate = /already up to date/i.test(res.stdout);
  return { ok: true, upToDate, output: res.stdout.trim() };
});

// Commit all changes and push. Returns a friendly error if the push is
// rejected (e.g. the remote is ahead).
ipcMain.handle('git:sync', async (_e, { path: p, message }) => {
  const repo = expandHome(p);
  await git(repo, ['add', '-A']);
  const commit = await git(repo, ['commit', '-m', message || 'Update via Gitsidian']);
  const nothingToCommit = /nothing to commit/i.test(commit.stdout + commit.stderr);
  if (commit.err && !nothingToCommit) {
    return { ok: false, error: commit.stderr || commit.stdout || 'Commit failed.' };
  }
  // -u sets upstream tracking so future status/push/pull "just work".
  const push = await git(repo, ['push', '-u', 'origin', 'HEAD']);
  if (push.err) {
    const out = push.stderr || '';
    if (/rejected|non-fast-forward|fetch first/i.test(out)) {
      return { ok: false, error: 'Push rejected — the GitHub copy has newer commits. Pull/merge those first, then push again.' };
    }
    return { ok: false, error: out || 'Push failed.' };
  }
  return { ok: true, committed: !nothingToCommit };
});

// Sidebar layout (groups, ordering, hidden projects) — persisted in userData.
function layoutFile() { return path.join(app.getPath('userData'), 'layout.json'); }
ipcMain.handle('layout:get', () => {
  try { return JSON.parse(fs.readFileSync(layoutFile(), 'utf8')); }
  catch { return { groups: [], ungrouped: [], hidden: [] }; }
});
ipcMain.handle('layout:set', (_e, data) => {
  fs.mkdirSync(path.dirname(layoutFile()), { recursive: true });
  fs.writeFileSync(layoutFile(), JSON.stringify(data, null, 2));
  return true;
});

ipcMain.handle('pty:create', (e, opts) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  return createSession(win, opts);
});
ipcMain.on('pty:input', (_e, { id, data }) => {
  const s = sessions.get(id);
  if (s) s.proc.write(data);
});
ipcMain.on('pty:resize', (_e, { id, cols, rows }) => {
  const s = sessions.get(id);
  if (s) { try { s.proc.resize(cols, rows); } catch {} }
});
ipcMain.on('pty:kill', (_e, { id }) => {
  const s = sessions.get(id);
  if (s) { try { s.proc.kill(); } catch {} }
});

// Register a folder as an Obsidian vault (if not already one), preserving the
// existing registry. Returns true if a new entry was added.
function ensureObsidianVault(abs) {
  const file = obsidianRegistryPath();
  let data = {};
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  if (!data.vaults) data.vaults = {};
  const already = Object.values(data.vaults).some((v) => v && expandHome(v.path) === abs);
  if (already) return false;
  data.vaults[crypto.randomBytes(8).toString('hex')] = { path: abs, ts: Date.now() };
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

// Add a local git exclude (never committed) — used to keep .obsidian out of
// code repos we bridge into Obsidian.
function excludeLocally(repo, pattern) {
  try {
    const ex = path.join(repo, '.git', 'info', 'exclude');
    let txt = '';
    try { txt = fs.readFileSync(ex, 'utf8'); } catch {}
    if (!txt.split(/\r?\n/).includes(pattern)) fs.appendFileSync(ex, `\n${pattern}\n`);
  } catch {}
}

// Tell Obsidian to hide build/system folders from the vault (file list + graph),
// by merging into .obsidian/app.json's userIgnoreFilters.
function applyObsidianIgnore(abs) {
  const dir = path.join(abs, '.obsidian');
  const appFile = path.join(dir, 'app.json');
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(appFile, 'utf8')); } catch {}
  const want = ['node_modules/', '.git/', 'dist/', 'build/', 'out/'];
  const cur = Array.isArray(cfg.userIgnoreFilters) ? cfg.userIgnoreFilters : [];
  cfg.userIgnoreFilters = Array.from(new Set([...cur, ...want]));
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(appFile, JSON.stringify(cfg, null, 2));
    excludeLocally(abs, '.obsidian/');
  } catch {}
}

// Is the Obsidian app currently running? (It only reads its vault list at
// startup, so a freshly-registered vault won't be openable until it restarts.)
function isObsidianRunning() {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      execFile('tasklist', ['/FI', 'IMAGENAME eq Obsidian.exe', '/NH'], { timeout: 4000 },
        (e, o) => resolve(/Obsidian\.exe/i.test(o || '')));
    } else {
      // Match the app bundle in the command line — robust across helper procs.
      execFile('pgrep', ['-f', 'Obsidian.app/Contents/MacOS'], { timeout: 4000 },
        (e, o) => resolve(!!(o || '').trim()));
    }
  });
}

function openObsidianUri(abs) {
  return shell.openExternal(`obsidian://open?path=${encodeURIComponent(abs)}`);
}

// Open a folder in Obsidian: register it as a vault (if needed) and open it.
// If it's a brand-new vault AND Obsidian is already running, Obsidian can't
// pick it up live — so we report that instead of firing a URL that errors.
ipcMain.handle('open:obsidian', async (_e, arg) => {
  const opts = typeof arg === 'string' ? { path: arg } : (arg || {});
  const abs = expandHome(opts.path);
  const added = ensureObsidianVault(abs);
  if (opts.excludeNoise) applyObsidianIgnore(abs);
  if (added && (await isObsidianRunning())) {
    return { ok: false, reason: 'restart-needed' };
  }
  await openObsidianUri(abs);
  return { ok: true, added };
});

// Quit Obsidian, then reopen it on the (now-registered) vault so a new vault
// actually opens.
ipcMain.handle('obsidian:restartOpen', async (_e, p) => {
  const abs = expandHome(p);
  if (process.platform === 'win32') {
    await run('taskkill', ['/IM', 'Obsidian.exe', '/F']);
  } else {
    await run('osascript', ['-e', 'tell application "Obsidian" to quit']);
  }
  await new Promise((r) => setTimeout(r, 1800));
  ensureObsidianVault(abs); // re-write in case the running app overwrote it
  await openObsidianUri(abs);
  return { ok: true };
});
ipcMain.handle('open:finder', (_e, folderPath) => shell.openPath(expandHome(folderPath)));
// Open a file in its default app (e.g. the user's editor) or a folder in Finder.
ipcMain.handle('open:item', (_e, p) => shell.openPath(expandHome(p)));
// Reveal a file/folder in Finder, highlighted.
ipcMain.handle('open:reveal', (_e, p) => { shell.showItemInFolder(expandHome(p)); return true; });
// Open an external URL (e.g. the new GitHub repo) in the default browser.
ipcMain.handle('open:url', (_e, url) => shell.openExternal(url));

// Convert a git remote (ssh or https, any host) to its browser URL.
function toWebUrl(remote) {
  if (!remote) return null;
  let u = remote.trim()
    .replace(/^git@([^:]+):/, 'https://$1/')   // git@github.com:owner/repo
    .replace(/^ssh:\/\/git@/, 'https://')        // ssh://git@github.com/owner/repo
    .replace(/\.git$/, '');
  return /^https?:\/\//.test(u) ? u : null;
}

// The browser URL of a repo's origin remote (GitHub, GitLab, etc.), or null.
ipcMain.handle('git:webUrl', async (_e, p) => {
  const repo = expandHome(p);
  const r = await git(repo, ['remote', 'get-url', 'origin']);
  return r.err ? null : toWebUrl(r.stdout);
});

// --- GitHub account management (the friendly GitHub↔computer bridge) ---

// List the GitHub accounts gh knows about, flagging the active one.
ipcMain.handle('gh:accounts', async () => {
  const v = await run('gh', ['--version']);
  if (v.err) return { installed: false, accounts: [] };
  const r = await run('gh', ['auth', 'status']);
  const text = `${r.stdout || ''}\n${r.stderr || ''}`;
  const accounts = [];
  for (const line of text.split('\n')) {
    const m = line.match(/Logged in to \S+ account (\S+)/);
    if (m) { accounts.push({ login: m[1], active: false }); continue; }
    const a = line.match(/Active account:\s*(true|false)/i);
    if (a && accounts.length) accounts[accounts.length - 1].active = /true/i.test(a[1]);
  }
  return { installed: true, accounts };
});

// Switch the active gh account (controls which identity pushes/pulls).
ipcMain.handle('gh:switch', async (_e, login) => {
  const r = await run('gh', ['auth', 'switch', '--hostname', 'github.com', '--user', login]);
  if (r.err) return { ok: false, error: r.stderr || r.stdout || 'Switch failed.' };
  return { ok: true };
});

// ===========================================================================
// File operations — read/write for the built-in editor, plus create / rename /
// delete (to Trash) for the file tree. All paths are validated as absolute.
// ===========================================================================

const MAX_EDIT_BYTES = 2 * 1024 * 1024; // 2 MB — beyond this we don't open in-app.

// Does a buffer look binary? (NUL byte in the first chunk is a strong signal.)
function looksBinary(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

ipcMain.handle('fs:read', (_e, p) => {
  try {
    const abs = expandHome(p);
    const st = fs.statSync(abs);
    if (st.isDirectory()) return { ok: false, error: 'That is a folder.' };
    if (st.size > MAX_EDIT_BYTES) return { ok: false, tooLarge: true, error: 'File is larger than 2 MB — open it in your editor instead.' };
    const buf = fs.readFileSync(abs);
    if (looksBinary(buf)) return { ok: false, binary: true, error: 'This looks like a binary file.' };
    return { ok: true, content: buf.toString('utf8'), size: st.size };
  } catch (e) {
    return { ok: false, error: e.message || 'Could not read the file.' };
  }
});

ipcMain.handle('fs:write', (_e, { path: p, content } = {}) => {
  try {
    fs.writeFileSync(expandHome(p), content != null ? String(content) : '');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'Could not save the file.' };
  }
});

// Create a file or folder named `name` inside `parent`. Refuses to clobber.
ipcMain.handle('fs:create', (_e, { parent, name, isDir } = {}) => {
  try {
    const safe = String(name || '').trim();
    if (!safe || safe.includes('/') || safe.includes('\\') || safe === '.' || safe === '..') {
      return { ok: false, error: 'Enter a valid name (no slashes).' };
    }
    const target = path.join(expandHome(parent), safe);
    if (fs.existsSync(target)) return { ok: false, error: `"${safe}" already exists.` };
    if (isDir) fs.mkdirSync(target);
    else fs.writeFileSync(target, '');
    return { ok: true, path: target };
  } catch (e) {
    return { ok: false, error: e.message || 'Could not create that.' };
  }
});

// Rename a file/folder in place (same parent directory).
ipcMain.handle('fs:rename', (_e, { path: p, newName } = {}) => {
  try {
    const abs = expandHome(p);
    const safe = String(newName || '').trim();
    if (!safe || safe.includes('/') || safe.includes('\\') || safe === '.' || safe === '..') {
      return { ok: false, error: 'Enter a valid name (no slashes).' };
    }
    const target = path.join(path.dirname(abs), safe);
    if (target === abs) return { ok: true, path: target };
    if (fs.existsSync(target)) return { ok: false, error: `"${safe}" already exists.` };
    fs.renameSync(abs, target);
    return { ok: true, path: target };
  } catch (e) {
    return { ok: false, error: e.message || 'Could not rename.' };
  }
});

// Delete to the OS Trash (recoverable) rather than permanently.
ipcMain.handle('fs:delete', async (_e, p) => {
  try {
    await shell.trashItem(expandHome(p));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'Could not delete.' };
  }
});

// Save a pasted image (base64) into `dir`, return the new file's path.
ipcMain.handle('fs:saveImage', (_e, { dir, base64, ext } = {}) => {
  try {
    const safeExt = /^[a-z0-9]{1,5}$/i.test(ext || '') ? ext : 'png';
    const folder = expandHome(dir) && fs.existsSync(expandHome(dir)) ? expandHome(dir) : app.getPath('temp');
    let name, target, i = 0;
    do { name = `pasted-image${i ? '-' + i : ''}.${safeExt}`; target = path.join(folder, name); i++; }
    while (fs.existsSync(target) && i < 1000);
    fs.writeFileSync(target, Buffer.from(base64, 'base64'));
    return { ok: true, path: target };
  } catch (e) {
    return { ok: false, error: e.message || 'Could not save the image.' };
  }
});

// ===========================================================================
// Git: inline diff, branch list / switch, AI-suggested commit messages
// ===========================================================================

// Unified diff for one file vs HEAD. Handles untracked files (shows them as
// all-added) so "new" files preview too.
ipcMain.handle('git:diff', async (_e, { repo, file } = {}) => {
  const repoAbs = expandHome(repo);
  const rel = path.relative(repoAbs, expandHome(file));
  if (!rel || rel.startsWith('..')) return { ok: false, error: 'That file is outside the project.' };
  const tracked = !(await git(repoAbs, ['ls-files', '--error-unmatch', rel])).err;
  let diff;
  if (tracked) {
    diff = await git(repoAbs, ['diff', 'HEAD', '--', rel]);
  } else {
    // Untracked: diff against an empty tree so the whole file shows as added.
    diff = await git(repoAbs, ['diff', '--no-index', '--', process.platform === 'win32' ? 'NUL' : '/dev/null', rel]);
  }
  const text = (diff.stdout || '').trim();
  return { ok: true, diff: text, empty: !text, rel };
});

ipcMain.handle('git:branches', async (_e, p) => {
  const repo = expandHome(p);
  if (!fs.existsSync(path.join(repo, '.git'))) return { ok: false, error: 'Not a git repo.' };
  const cur = (await git(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim();
  const r = await git(repo, ['for-each-ref', '--format=%(refname:short)', '--sort=-committerdate', 'refs/heads']);
  const branches = r.err ? [] : r.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  return { ok: true, current: cur, branches };
});

ipcMain.handle('git:checkout', async (_e, { repo, branch, create } = {}) => {
  const r = expandHome(repo);
  const name = String(branch || '').trim();
  if (!name) return { ok: false, error: 'Enter a branch name.' };
  const args = create ? ['checkout', '-b', name] : ['checkout', name];
  const res = await git(r, args);
  if (res.err) {
    const out = (res.stderr || res.stdout || '').trim();
    if (/already exists/i.test(out)) return { ok: false, error: `Branch "${name}" already exists.` };
    if (/local changes|would be overwritten/i.test(out)) {
      return { ok: false, error: 'You have uncommitted changes that conflict — commit or stash them first.' };
    }
    return { ok: false, error: out || 'Checkout failed.' };
  }
  return { ok: true, branch: name };
});

// Suggest a commit message from the pending changes. Prefers a local AI CLI
// (Claude Code's non-interactive `-p`); falls back to a name-based summary so
// it always returns something useful even with no AI installed.
function summarizeChanges(nameStatus) {
  const lines = nameStatus.split('\n').map((l) => l.trim()).filter(Boolean);
  const files = lines.map((l) => l.split('\t').pop());
  if (!files.length) return 'Update project';
  const verbBy = { A: 'Add', M: 'Update', D: 'Remove', R: 'Rename' };
  const first = lines[0].split('\t');
  const verb = verbBy[first[0][0]] || 'Update';
  const head = files[0];
  if (files.length === 1) return `${verb} ${head}`;
  return `${verb} ${head} and ${files.length - 1} other file${files.length - 1 === 1 ? '' : 's'}`;
}

ipcMain.handle('ai:commitMessage', async (_e, p) => {
  const repo = expandHome(p);
  await git(repo, ['add', '-A']); // stage so new files are included in the diff/summary
  const ns = await git(repo, ['diff', '--cached', '--name-status']);
  const nameStatus = (ns.stdout || '').trim();
  if (!nameStatus) return { ok: false, error: 'Nothing to commit.' };
  const fallback = summarizeChanges(nameStatus);

  const claude = await whichBin('claude');
  if (!claude) return { ok: true, message: fallback, source: 'summary' };

  const diff = (await git(repo, ['diff', '--cached', '--stat'])).stdout
    + '\n\n' + (await git(repo, ['diff', '--cached'])).stdout.slice(0, 6000);
  const prompt = 'Write a concise git commit message (one line, imperative mood, under 72 chars, '
    + 'no quotes, no trailing period) for these staged changes:\n\n' + diff;
  const res = await run(claude, ['-p', prompt], { cwd: repo, timeout: 30000 });
  const out = (res.stdout || '').trim().split('\n').map((s) => s.trim()).filter(Boolean)[0];
  if (res.err || !out) return { ok: true, message: fallback, source: 'summary' };
  return { ok: true, message: out.replace(/^["'`]|["'`]$/g, '').slice(0, 120), source: 'ai' };
});

// ===========================================================================
// Session persistence — remember open tabs across relaunches.
// ===========================================================================
function sessionFile() { return path.join(app.getPath('userData'), 'session.json'); }
ipcMain.handle('session:save', (_e, data) => {
  try {
    fs.mkdirSync(path.dirname(sessionFile()), { recursive: true });
    fs.writeFileSync(sessionFile(), JSON.stringify(data || {}, null, 2));
    return true;
  } catch { return false; }
});
ipcMain.handle('session:load', () => {
  try { return JSON.parse(fs.readFileSync(sessionFile(), 'utf8')); }
  catch { return { tabs: [] }; }
});

// ===========================================================================
// Auto-update — check GitHub Releases, download with approval, hand off to the
// installer.
// ===========================================================================
// The builds are ad-hoc signed (not notarized / not Windows-signed), so we
// can't use Squirrel's silent in-place update — it verifies signatures and
// would reject these artifacts. Instead we fetch the latest release, and *only
// on explicit user approval* download the right installer and open it (mounts
// the .dmg on macOS, runs the NSIS setup on Windows). That automates the same
// manual re-download flow people do today. (When signing/notarization lands,
// this can be swapped for electron-updater for true in-place updates.)

const UPDATE_REPO = 'willbe89/gitsidian'; // owner/repo for the Releases API

// GET JSON from a URL, following redirects. GitHub requires a User-Agent.
function httpsGetJson(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'));
    const req = https.get(url, {
      headers: { 'User-Agent': 'Gitsidian-Updater', Accept: 'application/vnd.github+json' },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(httpsGetJson(res.headers.location, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`GitHub returned HTTP ${res.statusCode}`)); }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { body += d; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(new Error('Bad response from GitHub.')); } });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('Update check timed out.')));
  });
}

// Parse "v1.2.3" / "1.2.3" → [1,2,3] (ignores any -prerelease suffix).
function parseVer(v) {
  return String(v || '').replace(/^v/, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
}
// Is version a strictly newer than b? (major.minor.patch compare)
function isNewer(a, b) {
  const x = parseVer(a), y = parseVer(b);
  for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
  return false;
}

// Choose the release asset matching this platform + CPU arch.
function pickAsset(assets = []) {
  const arch = process.arch; // 'arm64' | 'x64'
  if (process.platform === 'darwin') {
    const dmgs = assets.filter((a) => /\.dmg$/i.test(a.name));
    if (arch === 'arm64') return dmgs.find((a) => /arm64/i.test(a.name)) || dmgs[0] || null;
    return dmgs.find((a) => /(x64|intel)/i.test(a.name)) || dmgs.find((a) => !/arm64/i.test(a.name)) || dmgs[0] || null;
  }
  if (process.platform === 'win32') {
    const exes = assets.filter((a) => /\.exe$/i.test(a.name));
    return exes.find((a) => new RegExp(arch, 'i').test(a.name)) || exes[0] || null;
  }
  return null; // Linux not packaged yet → caller falls back to the releases page.
}

async function checkForUpdate() {
  const data = await httpsGetJson(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`);
  const latest = (data.tag_name || '').replace(/^v/, '');
  const current = app.getVersion();
  const asset = pickAsset(data.assets || []);
  return {
    current,
    latest,
    updateAvailable: !!latest && isNewer(latest, current),
    notes: data.body || '',
    htmlUrl: data.html_url || `https://github.com/${UPDATE_REPO}/releases/latest`,
    name: data.name || data.tag_name || '',
    asset: asset ? { name: asset.name, url: asset.browser_download_url, size: asset.size } : null,
  };
}

// Stream a URL to a file, following redirects (GitHub asset URLs redirect to a
// signed objects host). Reports fractional progress when a length is known.
function downloadToFile(url, destPath, onProgress, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'));
    const req = https.get(url, { headers: { 'User-Agent': 'Gitsidian-Updater' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(downloadToFile(res.headers.location, destPath, onProgress, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`Download failed (HTTP ${res.statusCode}).`)); }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let received = 0;
      const file = fs.createWriteStream(destPath);
      file.on('error', (e) => { try { fs.unlinkSync(destPath); } catch {} reject(e); });
      res.on('data', (chunk) => {
        received += chunk.length;
        if (onProgress) onProgress(total ? received / total : 0, received, total);
      });
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(destPath)));
    });
    req.on('error', reject);
    req.setTimeout(120000, () => req.destroy(new Error('Download timed out.')));
  });
}

ipcMain.handle('app:version', () => app.getVersion());

ipcMain.handle('update:check', async () => {
  try { return { ok: true, ...(await checkForUpdate()) }; }
  catch (e) { return { ok: false, error: e.message || 'Update check failed.' }; }
});

ipcMain.handle('update:download', async (e, asset) => {
  if (!asset || !asset.url) return { ok: false, error: 'No installer is published for this platform.' };
  const win = BrowserWindow.fromWebContents(e.sender);
  // Sanitize the asset name to a bare filename before joining into temp.
  const dest = path.join(app.getPath('temp'), path.basename(asset.name || 'gitsidian-update'));
  let lastSent = 0;
  try {
    await downloadToFile(asset.url, dest, (frac) => {
      // Throttle progress events a little to avoid flooding the renderer.
      const pct = Math.round(frac * 100);
      if (pct !== lastSent) { lastSent = pct; emit(win, 'update:progress', { frac }); }
    });
    return { ok: true, path: dest };
  } catch (err) {
    try { fs.unlinkSync(dest); } catch {}
    return { ok: false, error: err.message || 'Download failed.' };
  }
});

ipcMain.handle('update:install', async (_e, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return { ok: false, error: 'Installer not found — try downloading again.' };
  // Open the installer: macOS mounts the .dmg in Finder; Windows runs the NSIS
  // setup. Then quit so the user can replace the running copy.
  const errMsg = await shell.openPath(filePath); // returns '' on success, else an error string
  if (errMsg) return { ok: false, error: errMsg };
  setTimeout(() => app.quit(), 1000);
  return { ok: true };
});

// ===========================================================================
// Lifecycle
// ===========================================================================

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  for (const s of sessions.values()) { try { s.proc.kill(); } catch {} }
  if (process.platform !== 'darwin') app.quit();
});

// Gitsidian — main process. Authored by will.be.
'use strict';

const { app, BrowserWindow, ipcMain, shell, dialog, clipboard, nativeImage } = require('electron');
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

// ---------------------------------------------------------------------------
// Agent roles — per-project role prompts, stored as editable .md files under
// `<project>/.gitsidian/roles/`. Assigning a role injects its prompt into the
// AI pane; the user can edit the files freely. (Global role library = later.)
// ---------------------------------------------------------------------------
const ROLE_DEFAULTS = [
  { name: 'Coordinator', body: 'You are the Coordinator. Break the user\'s goal into clear tasks, delegate them to the other agents (Research, Writer, Reviewer, Tester, Planner), and integrate their results into a coherent whole. Track what is done and what remains, surface blockers early, and keep the plan and the shared context up to date. Be concise and decisive.' },
  { name: 'Research', body: 'You are the Research agent. Investigate the question or task: read the relevant code, docs, and history, and gather the facts needed to act. Return concise, well-organised findings with concrete references (file paths, line numbers, links). Flag uncertainty rather than guessing. Do not implement changes — your output feeds the Planner and Writer.' },
  { name: 'Writer', body: 'You are the Writer (implementer). Carry out the task based on the plan and research: write the code or content, follow the conventions already in the project, and keep changes focused and minimal. Explain non-obvious decisions briefly. When done, hand off to the Reviewer and Tester with a short summary of what changed and why.' },
  { name: 'Reviewer', body: 'You are the Reviewer. Critically review the work for correctness, security, edge cases, and clarity. Assume there is a bug until you have checked. Be specific: cite the exact location and explain the risk and a concrete fix. Separate must-fix issues from nice-to-haves. Approve only when you are confident.' },
  { name: 'Tester', body: 'You are the Tester. Design and run tests that actually exercise the change, including edge cases and failure modes. Report results plainly: what passed, what failed, and the exact steps to reproduce any failure. Prefer reproducible commands. Do not claim something works unless you have verified it.' },
  { name: 'Planner', body: 'You are the Planner. Turn the goal into an ordered, dependency-aware plan: a short list of concrete steps, each with a clear owner role and a definition of done. Call out risks and unknowns up front. Keep it lightweight — enough structure to coordinate the other agents without over-engineering.' },
];
function roleSlug(name) {
  return String(name || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'role';
}
function rolesDir(root) { return path.join(expandHome(root), '.gitsidian', 'roles'); }
function roleFileBody(name, body) {
  // First line names the role; the rest is the prompt. Edit freely.
  return `# Role: ${name}\n\n${body}\n`;
}

// Create the standard role files in a project (only writing ones that are missing).
ipcMain.handle('roles:ensure', (_e, { root } = {}) => {
  try {
    if (!root) return { ok: false, error: 'No project.' };
    const dir = rolesDir(root);
    fs.mkdirSync(dir, { recursive: true });
    const created = [];
    for (const r of ROLE_DEFAULTS) {
      const p = path.join(dir, roleSlug(r.name) + '.md');
      if (!fs.existsSync(p)) { fs.writeFileSync(p, roleFileBody(r.name, r.body)); created.push(r.name); }
    }
    return { ok: true, dir, created };
  } catch (e) {
    return { ok: false, error: e.message || 'Could not create role files.' };
  }
});

// List the role files present in a project.
ipcMain.handle('roles:list', (_e, { root } = {}) => {
  try {
    if (!root) return { ok: true, roles: [] };
    const dir = rolesDir(root);
    if (!fs.existsSync(dir)) return { ok: true, roles: [] };
    const roles = fs.readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith('.md'))
      .map((f) => ({ slug: f.replace(/\.md$/i, ''), path: path.join(dir, f) }));
    return { ok: true, roles };
  } catch (e) {
    return { ok: false, error: e.message || 'Could not list roles.', roles: [] };
  }
});

// Read one role's prompt by name (returns exists:false if there's no file yet).
ipcMain.handle('roles:get', (_e, { root, name } = {}) => {
  try {
    if (!root || !name) return { ok: false, exists: false, error: 'Missing project or role.' };
    const p = path.join(rolesDir(root), roleSlug(name) + '.md');
    if (!fs.existsSync(p)) return { ok: true, exists: false, path: p };
    return { ok: true, exists: true, path: p, body: fs.readFileSync(p, 'utf8') };
  } catch (e) {
    return { ok: false, exists: false, error: e.message || 'Could not read the role.' };
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

// Read an image file as a data URL for the in-app preview (CSP allows data:).
ipcMain.handle('fs:readImage', (_e, p) => {
  try {
    const abs = expandHome(p);
    const ext = path.extname(abs).slice(1).toLowerCase();
    const mime = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
      webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif',
    }[ext] || 'application/octet-stream';
    const st = fs.statSync(abs);
    if (st.size > 25 * 1024 * 1024) return { ok: false, error: 'Image is too large to preview (over 25 MB).' };
    return { ok: true, dataUrl: `data:${mime};base64,${fs.readFileSync(abs).toString('base64')}`, size: st.size };
  } catch (e) {
    return { ok: false, error: e.message || 'Could not read the image.' };
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

// A project's files (relative paths) for the command palette's fuzzy open.
// Uses git for repos (fast, respects .gitignore); a bounded walk otherwise.
ipcMain.handle('proj:files', async (_e, p) => {
  const root = expandHome(p);
  if (!root || !fs.existsSync(root)) return { ok: false, files: [] };
  if (fs.existsSync(path.join(root, '.git'))) {
    const r = await git(root, ['ls-files', '--cached', '--others', '--exclude-standard']);
    if (!r.err) return { ok: true, files: r.stdout.split('\n').filter(Boolean).slice(0, 8000) };
  }
  const out = [];
  (function walk(dir, depth) {
    if (depth > 8 || out.length >= 8000) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.') || SCAN_SKIP.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else out.push(path.relative(root, full));
    }
  })(root, 0);
  return { ok: true, files: out.slice(0, 8000) };
});

// Full-text search across a project. Uses `git grep` for repos (fast, respects
// .gitignore, includes untracked); a bounded file walk otherwise.
ipcMain.handle('proj:search', async (_e, { root, query, caseSensitive } = {}) => {
  const r = expandHome(root);
  const q = String(query || '');
  const MAX = 500;
  if (!q.trim() || !r || !fs.existsSync(r)) return { ok: true, results: [], truncated: false };

  if (fs.existsSync(path.join(r, '.git'))) {
    const args = ['grep', '-n', '-I', '--no-color', '--untracked'];
    if (!caseSensitive) args.push('-i');
    args.push('-F', '-e', q); // fixed-string match
    const res = await git(r, args);
    const lines = (res.stdout || '').split('\n').filter(Boolean).slice(0, MAX);
    const results = lines.map((ln) => {
      const m = ln.match(/^(.*?):(\d+):(.*)$/);
      return m ? { file: m[1], line: parseInt(m[2], 10), text: m[3].slice(0, 300) } : null;
    }).filter(Boolean);
    return { ok: true, results, truncated: lines.length >= MAX };
  }

  const results = [];
  const needle = caseSensitive ? q : q.toLowerCase();
  (function walk(dir, depth) {
    if (depth > 8 || results.length >= MAX) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (results.length >= MAX) return;
      if (e.name.startsWith('.') || SCAN_SKIP.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full, depth + 1); continue; }
      let buf;
      try { buf = fs.readFileSync(full); } catch { continue; }
      if (looksBinary(buf) || buf.length > 1024 * 1024) continue;
      const txt = buf.toString('utf8');
      if ((caseSensitive ? txt : txt.toLowerCase()).indexOf(needle) === -1) continue;
      txt.split('\n').forEach((line, i) => {
        if (results.length >= MAX) return;
        if ((caseSensitive ? line : line.toLowerCase()).includes(needle)) {
          results.push({ file: path.relative(r, full), line: i + 1, text: line.slice(0, 300) });
        }
      });
    }
  })(r, 0);
  return { ok: true, results, truncated: results.length >= MAX };
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

// Accepts a repo path (string) to summarize ALL pending changes, or
// { repo, staged: true } to summarize only what's staged. Non-destructive — it
// never stages anything itself (the review tab curates staging on its own).
ipcMain.handle('ai:commitMessage', async (_e, arg) => {
  const opts = typeof arg === 'string' ? { repo: arg } : (arg || {});
  const repo = expandHome(opts.repo);
  const staged = !!opts.staged;
  const hasHead = !(await git(repo, ['rev-parse', '--verify', '--quiet', 'HEAD'])).err;

  let nameStatus, diffText;
  if (staged) {
    nameStatus = (await git(repo, ['diff', '--cached', '--name-status'])).stdout.trim();
    diffText = (await git(repo, ['diff', '--cached', '--stat'])).stdout
      + '\n\n' + (await git(repo, ['diff', '--cached'])).stdout.slice(0, 6000);
  } else {
    // All pending changes, without staging: tracked via diff, untracked listed.
    const tracked = hasHead ? (await git(repo, ['diff', 'HEAD', '--name-status'])).stdout.trim() : '';
    const untracked = (await git(repo, ['ls-files', '--others', '--exclude-standard'])).stdout.trim()
      .split('\n').filter(Boolean).map((f) => 'A\t' + f).join('\n');
    nameStatus = [tracked, untracked].filter(Boolean).join('\n');
    diffText = (hasHead ? (await git(repo, ['diff', 'HEAD', '--stat'])).stdout
      + '\n\n' + (await git(repo, ['diff', 'HEAD'])).stdout.slice(0, 6000) : '') + '\n' + untracked;
  }
  if (!nameStatus) return { ok: false, error: staged ? 'Nothing staged to describe.' : 'Nothing to commit.' };
  const fallback = summarizeChanges(nameStatus);

  const claude = await whichBin('claude');
  if (!claude) return { ok: true, message: fallback, source: 'summary' };

  const prompt = 'Write a concise git commit message (one line, imperative mood, under 72 chars, '
    + 'no quotes, no trailing period) for these changes:\n\n' + diffText;
  const res = await run(claude, ['-p', prompt], { cwd: repo, timeout: 30000 });
  const out = (res.stdout || '').trim().split('\n').map((s) => s.trim()).filter(Boolean)[0];
  if (res.err || !out) return { ok: true, message: fallback, source: 'summary' };
  return { ok: true, message: out.replace(/^["'`]|["'`]$/g, '').slice(0, 120), source: 'ai' };
});

// ===========================================================================
// Review & stage — per-file staging and a staged-only commit, for the review tab.
// ===========================================================================

// Per-file status with staged/unstaged flags, parsed from porcelain v1 (XY codes).
ipcMain.handle('git:statusFiles', async (_e, p) => {
  const repo = expandHome(p);
  if (!fs.existsSync(path.join(repo, '.git'))) return { ok: false, error: 'Not a git repo.' };
  const r = await git(repo, ['status', '--porcelain=v1']);
  if (r.err) return { ok: false, error: r.stderr || 'git status failed.' };
  const files = [];
  for (const line of r.stdout.split('\n')) {
    if (!line.trim()) continue;
    const x = line[0], y = line[1];
    let rel = line.slice(3);
    if (rel.includes(' -> ')) rel = rel.split(' -> ')[1]; // rename → new path
    rel = rel.replace(/^"|"$/g, '');
    const untracked = x === '?' && y === '?';
    const staged = !untracked && x !== ' ';
    const unstaged = untracked || y !== ' ';
    let type = 'modified';
    if (untracked || x === 'A') type = 'new';
    else if (x === 'D' || y === 'D') type = 'deleted';
    else if (x === 'R') type = 'renamed';
    files.push({ file: rel, x, y, staged, unstaged, type });
  }
  files.sort((a, b) => a.file.localeCompare(b.file));
  return { ok: true, files };
});

ipcMain.handle('git:stage', async (_e, { repo, file } = {}) => {
  const r = await git(expandHome(repo), ['add', '--', file]);
  return r.err ? { ok: false, error: r.stderr || 'Could not stage.' } : { ok: true };
});

ipcMain.handle('git:unstage', async (_e, { repo, file } = {}) => {
  const r = expandHome(repo);
  const hasHead = !(await git(r, ['rev-parse', '--verify', '--quiet', 'HEAD'])).err;
  const res = hasHead ? await git(r, ['reset', '-q', 'HEAD', '--', file])
                      : await git(r, ['rm', '--cached', '-q', '--', file]);
  return res.err ? { ok: false, error: res.stderr || 'Could not unstage.' } : { ok: true };
});

ipcMain.handle('git:stageAll', async (_e, p) => {
  const r = await git(expandHome(p), ['add', '-A']);
  return r.err ? { ok: false, error: r.stderr || 'Could not stage all.' } : { ok: true };
});

ipcMain.handle('git:unstageAll', async (_e, p) => {
  const repo = expandHome(p);
  const hasHead = !(await git(repo, ['rev-parse', '--verify', '--quiet', 'HEAD'])).err;
  const res = hasHead ? await git(repo, ['reset', '-q', 'HEAD', '--']) : await git(repo, ['rm', '-r', '--cached', '-q', '.']);
  return res.err ? { ok: false, error: res.stderr || 'Could not unstage all.' } : { ok: true };
});

// Commit only what's staged (unlike git:sync, which stages everything first).
ipcMain.handle('git:commitStaged', async (_e, { repo, message } = {}) => {
  const r = expandHome(repo);
  // `diff --cached --quiet` exits non-zero when there ARE staged changes.
  const hasStaged = (await git(r, ['diff', '--cached', '--quiet'])).err;
  if (!hasStaged) return { ok: false, error: 'Nothing staged to commit.' };
  const c = await git(r, ['commit', '-m', message || 'Update via Gitsidian']);
  if (c.err) return { ok: false, error: c.stderr || c.stdout || 'Commit failed.' };
  return { ok: true };
});

// Push the current branch (sets upstream), with friendly rejection messages.
ipcMain.handle('git:push', async (_e, p) => {
  const push = await git(expandHome(p), ['push', '-u', 'origin', 'HEAD']);
  if (push.err) {
    const out = push.stderr || '';
    if (/rejected|non-fast-forward|fetch first/i.test(out)) {
      return { ok: false, error: 'Push rejected — the GitHub copy has newer commits. Pull those first, then push again.' };
    }
    if (/no upstream|no configured push|does not appear to be a git/i.test(out)) {
      return { ok: false, error: 'No GitHub remote — publish this project first.' };
    }
    return { ok: false, error: out || 'Push failed.' };
  }
  return { ok: true };
});

// ===========================================================================
// Commit history — a per-project log and the diff for a single commit.
// ===========================================================================

ipcMain.handle('git:log', async (_e, { repo, limit = 200 } = {}) => {
  const r = expandHome(repo);
  if (!fs.existsSync(path.join(r, '.git'))) return { ok: false, error: 'Not a git repo.' };
  // \x1f (unit separator) between fields; one commit per line (subject is %s, single line).
  const res = await git(r, ['log', `-n${limit}`, '--pretty=format:%H%x1f%h%x1f%an%x1f%ar%x1f%s']);
  if (res.err) {
    if (/does not have any commits|bad revision|unknown revision/i.test(res.stderr || '')) return { ok: true, commits: [] };
    return { ok: false, error: res.stderr || 'git log failed.' };
  }
  const commits = res.stdout.split('\n').filter(Boolean).map((line) => {
    const [hash, short, author, date, subject] = line.split('\x1f');
    return { hash, short, author, date, subject };
  });
  return { ok: true, commits };
});

ipcMain.handle('git:commitDiff', async (_e, { repo, hash } = {}) => {
  const res = await git(expandHome(repo), ['show', '--stat', '--patch', hash]);
  if (res.err) return { ok: false, error: res.stderr || 'Could not load that commit.' };
  return { ok: true, diff: res.stdout };
});

// ===========================================================================
// Pull requests (via gh)
// ===========================================================================
const PR_URL_RE = /https:\/\/github\.com\/\S+\/pull\/\d+/;

// Is there already an open PR for the current branch? (Returns {exists:false}
// rather than an error when there isn't, so the UI can offer to create one.)
ipcMain.handle('gh:prView', async (_e, p) => {
  const res = await run('gh', ['pr', 'view', '--json', 'url,state,number,title'], { cwd: expandHome(p) });
  if (res.err) return { ok: true, exists: false };
  try { const j = JSON.parse(res.stdout); return { ok: true, exists: true, ...j }; }
  catch { return { ok: true, exists: false }; }
});

// Push the current branch, then open a PR. If one already exists, gh prints its
// URL — we surface that instead of erroring.
ipcMain.handle('gh:prCreate', async (_e, { repo, title, body } = {}) => {
  const r = expandHome(repo);
  const ghv = await run('gh', ['--version']);
  if (ghv.err) return { ok: false, error: 'GitHub CLI (gh) not found on PATH.' };
  const push = await git(r, ['push', '-u', 'origin', 'HEAD']);
  if (push.err && /no configured push|does not appear to be a git|no such remote/i.test(push.stderr || '')) {
    return { ok: false, error: 'No GitHub remote — publish this project first.' };
  }
  const res = await run('gh', ['pr', 'create', '--title', title || 'Update', '--body', body || ''], { cwd: r });
  const out = `${res.stdout || ''}\n${res.stderr || ''}`;
  const m = out.match(PR_URL_RE);
  if (res.err) {
    if (m) return { ok: true, url: m[0], existed: true }; // already exists
    const msg = (res.stderr || res.stdout || '').trim();
    if (/no commits between/i.test(msg)) return { ok: false, error: 'No new commits on this branch vs the base — commit something first.' };
    if (/not.*logged|auth/i.test(msg)) return { ok: false, error: 'Not signed in to GitHub — run: gh auth login' };
    return { ok: false, error: msg || 'Could not create the pull request.' };
  }
  return { ok: true, url: m ? m[0] : out.trim() };
});

// Raw diff for one file — working-vs-index (staged:false) or index-vs-HEAD
// (staged:true) — used by the review tab's per-hunk staging.
ipcMain.handle('git:fileDiff', async (_e, { repo, file, staged } = {}) => {
  const args = ['diff'];
  if (staged) args.push('--cached');
  args.push('--', file);
  const r = await git(expandHome(repo), args);
  return { ok: !r.err || !!r.stdout, diff: r.stdout || '' };
});

// Apply a single hunk to the index (stage), or reverse it out (unstage).
ipcMain.handle('git:applyHunk', async (_e, { repo, patch, reverse } = {}) => {
  const r = expandHome(repo);
  const tmp = path.join(os.tmpdir(), `gits-hunk-${process.pid}-${Math.round(process.hrtime()[1])}.patch`);
  try {
    fs.writeFileSync(tmp, patch.endsWith('\n') ? patch : patch + '\n');
    const args = ['apply', '--cached'];
    if (reverse) args.push('--reverse');
    args.push(tmp);
    const res = await git(r, args);
    try { fs.unlinkSync(tmp); } catch {}
    if (res.err) return { ok: false, error: (res.stderr || 'Could not apply that hunk.').trim() };
    return { ok: true };
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch {}
    return { ok: false, error: e.message || 'Could not apply that hunk.' };
  }
});

// Move a file/folder into another directory (drag-and-drop in the tree).
ipcMain.handle('fs:move', (_e, { src, destDir } = {}) => {
  try {
    const s = expandHome(src), d = expandHome(destDir);
    const target = path.join(d, path.basename(s));
    if (target === s) return { ok: true, path: target };
    if (path.relative(s, d) === '' || (d + path.sep).startsWith(s + path.sep)) {
      return { ok: false, error: "Can't move a folder into itself." };
    }
    if (fs.existsSync(target)) return { ok: false, error: 'Something with that name already exists there.' };
    fs.renameSync(s, target);
    return { ok: true, path: target };
  } catch (e) {
    return { ok: false, error: e.message || 'Could not move.' };
  }
});

// Pick a name in destDir that doesn't collide ("foo.txt" → "foo copy.txt" → "foo copy 2.txt").
function uniqueDest(destDir, base) {
  let target = path.join(destDir, base);
  if (!fs.existsSync(target)) return target;
  const ext = path.extname(base);
  const stem = base.slice(0, base.length - ext.length);
  for (let i = 1; i < 1000; i++) {
    const name = i === 1 ? `${stem} copy${ext}` : `${stem} copy ${i}${ext}`;
    target = path.join(destDir, name);
    if (!fs.existsSync(target)) return target;
  }
  return path.join(destDir, `${stem}-${Date.now()}${ext}`);
}

// Copy or move (cut) a file/folder into destDir, auto-renaming on collision.
// Also powers Duplicate (copy into the same folder).
ipcMain.handle('fs:paste', (_e, { src, destDir, cut } = {}) => {
  try {
    const s = expandHome(src), d = expandHome(destDir);
    if (!fs.existsSync(s)) return { ok: false, error: 'The source no longer exists.' };
    if (!fs.existsSync(d)) return { ok: false, error: 'The destination folder no longer exists.' };
    if ((d + path.sep).startsWith(s + path.sep)) return { ok: false, error: "Can't move a folder into itself." };
    if (cut && path.dirname(s) === d) return { ok: true, path: s }; // cut+paste into same folder: no-op
    const target = uniqueDest(d, path.basename(s));
    if (cut) fs.renameSync(s, target);
    else fs.cpSync(s, target, { recursive: true });
    return { ok: true, path: target };
  } catch (e) {
    return { ok: false, error: e.message || 'Could not complete that.' };
  }
});

// Folder picker for "Move to…".
ipcMain.handle('fs:pickFolder', async (e, title) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const res = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], title: title || 'Choose a destination folder' });
  return (res.canceled || !res.filePaths.length) ? null : res.filePaths[0];
});

// Watch open editor files so the app can reload them when changed on disk
// (e.g. an AI agent edited the file). Re-attaches across atomic-save renames.
const fileWatchers = new Map(); // abs path -> { watcher, timer }
function emitToAll(channel, payload) {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(channel, payload);
}
ipcMain.handle('watch:add', (_e, p) => {
  const abs = expandHome(p);
  if (fileWatchers.has(abs)) return true;
  const entry = { watcher: null, timer: null };
  const attach = () => {
    try {
      entry.watcher = fs.watch(abs, (eventType) => {
        clearTimeout(entry.timer);
        entry.timer = setTimeout(() => {
          emitToAll('file:changed', { path: abs });
          if (eventType === 'rename') { try { entry.watcher.close(); } catch {} if (fs.existsSync(abs)) attach(); }
        }, 150);
      });
    } catch {}
  };
  attach();
  fileWatchers.set(abs, entry);
  return true;
});
ipcMain.handle('watch:remove', (_e, p) => {
  const abs = expandHome(p);
  const e = fileWatchers.get(abs);
  if (e) { try { e.watcher && e.watcher.close(); } catch {} clearTimeout(e.timer); fileWatchers.delete(abs); }
  return true;
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
// Team — a private "hub" repo holds the chat (as comments on one GitHub issue).
// Identity is the gh account; config persists in userData; messages cache locally.
// No server: this is the free tier (real-time relay is a paid-tier upgrade).
// ===========================================================================
function teamFile() { return path.join(app.getPath('userData'), 'team.json'); }
function readTeam() { try { return JSON.parse(fs.readFileSync(teamFile(), 'utf8')); } catch { return {}; } }
function writeTeam(d) {
  fs.mkdirSync(path.dirname(teamFile()), { recursive: true });
  fs.writeFileSync(teamFile(), JSON.stringify(d, null, 2));
  return d;
}
function chatCacheFile() { return path.join(app.getPath('userData'), 'team-chat.json'); }

// Get or update the team config ({ repo, issue }).
ipcMain.handle('team:config', (_e, patch) => {
  let cfg = readTeam();
  if (patch && typeof patch === 'object') cfg = writeTeam({ ...cfg, ...patch });
  return cfg;
});

// The signed-in GitHub identity used as the chat username/profile.
ipcMain.handle('team:whoami', async () => {
  const r = await run('gh', ['api', 'user', '--jq', '{login: .login, name: .name, avatar: .avatar_url}']);
  if (r.err) return { ok: false, error: 'Not signed in to GitHub — run: gh auth login' };
  try { return { ok: true, ...JSON.parse(r.stdout) }; } catch { return { ok: false, error: 'Could not read your GitHub user.' }; }
});

// Create a new PRIVATE hub repo for the team (one-click setup); return owner/name.
ipcMain.handle('team:createRepo', async (_e, name) => {
  const safe = String(name || '').trim().replace(/[^a-zA-Z0-9._-]/g, '-');
  if (!safe) return { ok: false, error: 'Enter a repo name.' };
  const who = await run('gh', ['api', 'user', '--jq', '.login']);
  if (who.err) return { ok: false, error: 'Not signed in to GitHub — run: gh auth login' };
  const login = (who.stdout || '').trim();
  const create = await run('gh', ['repo', 'create', safe, '--private', '--description', 'Gitsidian team hub']);
  if (create.err && !/already exists/i.test(create.stderr || '')) {
    return { ok: false, error: create.stderr || 'Could not create the repo.' };
  }
  return { ok: true, repo: `${login}/${safe}` };
});

const CHAT_TITLE = 'Gitsidian Team Chat';
// Find the chat issue in the hub repo, creating it if needed.
ipcMain.handle('team:chatInit', async (_e, repo) => {
  if (!repo || !repo.includes('/')) return { ok: false, error: 'Enter the hub repo as owner/name.' };
  const view = await run('gh', ['repo', 'view', repo, '--json', 'nameWithOwner,visibility']);
  if (view.err) return { ok: false, error: `Can't access "${repo}". Create it (private) first, or check the name.` };
  let visibility = null;
  try { visibility = JSON.parse(view.stdout).visibility; } catch {} // PUBLIC | PRIVATE | INTERNAL
  const list = await run('gh', ['issue', 'list', '--repo', repo, '--search', `${CHAT_TITLE} in:title`, '--state', 'all', '--json', 'number,title', '--limit', '20']);
  if (!list.err) {
    try { const hit = JSON.parse(list.stdout).find((i) => i.title === CHAT_TITLE); if (hit) return { ok: true, issue: hit.number, visibility }; } catch {}
  }
  const create = await run('gh', ['issue', 'create', '--repo', repo, '--title', CHAT_TITLE, '--body', 'Gitsidian team chat — messages appear as comments below.']);
  if (create.err) return { ok: false, error: create.stderr || 'Could not create the chat thread.' };
  const m = (create.stdout || '').match(/\/issues\/(\d+)/);
  return m ? { ok: true, issue: parseInt(m[1], 10), visibility } : { ok: false, error: 'Created the thread but could not read its number.' };
});

// Read chat messages (issue comments), newest-last. Also refreshes the local cache.
ipcMain.handle('team:chatList', async (_e, { repo, issue } = {}) => {
  if (!repo || !issue) return { ok: false, error: 'Team chat is not set up.' };
  const r = await run('gh', ['api', '--paginate', `repos/${repo}/issues/${issue}/comments`,
    '--jq', '.[] | {id: .id, login: .user.login, avatar: .user.avatar_url, body: .body, at: .created_at}']);
  if (r.err) return { ok: false, error: r.stderr || 'Could not load messages.' };
  const messages = (r.stdout || '').split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  try { fs.writeFileSync(chatCacheFile(), JSON.stringify({ repo, issue, messages, at: Date.now() })); } catch {}
  return { ok: true, messages };
});

// Locally-cached messages — instant render offline / before the first fetch.
ipcMain.handle('team:chatCache', (_e, { repo, issue } = {}) => {
  try {
    const c = JSON.parse(fs.readFileSync(chatCacheFile(), 'utf8'));
    if (c.repo === repo && c.issue === issue) return { ok: true, messages: c.messages || [] };
  } catch {}
  return { ok: true, messages: [] };
});

// Invite a GitHub user to the hub repo (they can then read + chat). Adds them
// as a collaborator with write access.
ipcMain.handle('team:invite', async (_e, { repo, username, permission } = {}) => {
  const u = String(username || '').trim().replace(/^@/, '');
  if (!repo || !u) return { ok: false, error: 'Enter a GitHub username.' };
  const r = await run('gh', ['api', '-X', 'PUT', `repos/${repo}/collaborators/${u}`, '-f', `permission=${permission || 'push'}`]);
  if (r.err) {
    const msg = (r.stderr || '').trim();
    if (/Not Found/i.test(msg)) return { ok: false, error: `No GitHub user "${u}".` };
    return { ok: false, error: msg || 'Could not send the invite.' };
  }
  return { ok: true, user: u };
});

// Team profiles (display name + avatar) live in `.gitsidian/members.json` in the
// hub repo, read/written via the gh contents API — no server, shared with the team.
const MEMBERS_PATH = '.gitsidian/members.json';
function decodeB64Json(b64) { try { return JSON.parse(Buffer.from((b64 || '').replace(/\s/g, ''), 'base64').toString('utf8')) || {}; } catch { return {}; } }

ipcMain.handle('team:profiles', async (_e, repo) => {
  if (!repo) return {};
  const r = await run('gh', ['api', `repos/${repo}/contents/${MEMBERS_PATH}`, '--jq', '.content']);
  return r.err ? {} : decodeB64Json(r.stdout);
});

ipcMain.handle('team:pickImage', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const res = await dialog.showOpenDialog(win, {
    properties: ['openFile'], title: 'Choose an avatar image',
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
  });
  return (res.canceled || !res.filePaths.length) ? null : res.filePaths[0];
});

// Set your display name and/or avatar in the team's members.json (merge + push).
ipcMain.handle('team:setProfile', async (_e, { repo, login, alias, avatarPath } = {}) => {
  if (!repo || !login) return { ok: false, error: 'Team chat is not set up.' };
  const get = await run('gh', ['api', `repos/${repo}/contents/${MEMBERS_PATH}`]);
  let profiles = {}, sha = null;
  if (!get.err) { try { const j = JSON.parse(get.stdout); sha = j.sha; profiles = decodeB64Json(j.content); } catch {} }
  const entry = profiles[login] || {};
  if (alias !== undefined) { const a = String(alias || '').trim(); if (a) entry.alias = a; else delete entry.alias; }
  if (avatarPath) {
    try {
      const img = nativeImage.createFromPath(avatarPath);
      if (img.isEmpty()) return { ok: false, error: 'That image could not be read.' };
      entry.avatar = img.resize({ width: 96, height: 96 }).toDataURL();
    } catch { return { ok: false, error: 'Could not process that image.' }; }
  }
  profiles[login] = entry;
  const content = Buffer.from(JSON.stringify(profiles, null, 2)).toString('base64');
  const args = ['api', '-X', 'PUT', `repos/${repo}/contents/${MEMBERS_PATH}`, '-f', `message=Update ${login} profile`, '-f', `content=${content}`];
  if (sha) args.push('-f', `sha=${sha}`);
  const put = await run('gh', args);
  if (put.err) return { ok: false, error: (put.stderr || 'Could not save your profile.').trim() };
  // Return the authoritative merged profiles so the renderer doesn't have to
  // re-GET (the contents API can serve a stale copy right after a write).
  return { ok: true, profiles };
});

ipcMain.handle('team:chatPost', async (_e, { repo, issue, body } = {}) => {
  if (!body || !body.trim()) return { ok: false, error: 'Empty message.' };
  const r = await run('gh', ['api', '-X', 'POST', `repos/${repo}/issues/${issue}/comments`, '-f', `body=${body}`]);
  if (r.err) return { ok: false, error: r.stderr || 'Could not send your message.' };
  return { ok: true };
});

// Delete a single chat message (issue comment). GitHub allows the comment author
// or anyone with write/admin on the repo; otherwise it 403s (surfaced as an error).
ipcMain.handle('team:chatDelete', async (_e, { repo, id } = {}) => {
  if (!repo || !id) return { ok: false, error: 'Missing message.' };
  const r = await run('gh', ['api', '-X', 'DELETE', `repos/${repo}/issues/comments/${id}`]);
  if (r.err) {
    const msg = (r.stderr || '').trim();
    if (/403|forbidden/i.test(msg)) return { ok: false, error: "You can only delete your own messages (or any if you own the repo)." };
    return { ok: false, error: msg || 'Could not delete the message.' };
  }
  return { ok: true };
});

// Delete a whole channel = the repo's chat issue. Tries a permanent GraphQL
// deleteIssue (needs admin/maintain on the repo); falls back to closing it.
ipcMain.handle('team:channelDelete', async (_e, { repo, issue } = {}) => {
  if (!repo || !issue) return { ok: false, error: 'Team chat is not set up.' };
  const info = await run('gh', ['api', `repos/${repo}/issues/${issue}`, '--jq', '.node_id']);
  const nodeId = (info.stdout || '').trim();
  if (!info.err && nodeId) {
    const del = await run('gh', ['api', 'graphql', '-f',
      `query=mutation{deleteIssue(input:{issueId:"${nodeId}"}){clientMutationId}}`]);
    if (!del.err) return { ok: true, mode: 'deleted' };
  }
  const close = await run('gh', ['issue', 'close', String(issue), '--repo', repo]);
  if (!close.err) return { ok: true, mode: 'closed' };
  return { ok: false, error: (close.stderr || 'Could not delete the channel.').trim() };
});

// Save a chat transcript to a .md file the user picks.
ipcMain.handle('chat:exportMd', async (e, { markdown, name } = {}) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const res = await dialog.showSaveDialog(win, {
    title: 'Save chat backup',
    defaultPath: (name || 'chat-backup') + '.md',
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });
  if (res.canceled || !res.filePath) return { ok: false, canceled: true };
  try { fs.writeFileSync(res.filePath, markdown || '', 'utf8'); return { ok: true, path: res.filePath }; }
  catch (err) { return { ok: false, error: String(err && err.message || err) }; }
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

// Copy text to the system clipboard (reliable, no web-permission prompt).
ipcMain.handle('clipboard:write', (_e, text) => { clipboard.writeText(String(text == null ? '' : text)); return true; });

ipcMain.handle('update:check', async () => {
  try { return { ok: true, ...(await checkForUpdate()) }; }
  catch (e) { return { ok: false, error: e.message || 'Update check failed.' }; }
});

// Remember the last installer we downloaded, so we can prune it (no disk bloat)
// and offer to delete it once the update has been applied.
function updateRecordFile() { return path.join(app.getPath('userData'), 'update-download.json'); }
function readUpdateRecord() { try { return JSON.parse(fs.readFileSync(updateRecordFile(), 'utf8')); } catch { return null; } }
function writeUpdateRecord(rec) {
  try { fs.mkdirSync(path.dirname(updateRecordFile()), { recursive: true }); fs.writeFileSync(updateRecordFile(), JSON.stringify(rec || {}, null, 2)); } catch {}
}

ipcMain.handle('update:download', async (e, asset, version) => {
  if (!asset || !asset.url) return { ok: false, error: 'No installer is published for this platform.' };
  const win = BrowserWindow.fromWebContents(e.sender);
  // Download into Downloads (where users expect installers + can find them).
  const dir = app.getPath('downloads');
  const dest = path.join(dir, path.basename(asset.name || 'gitsidian-update'));
  // Prune the previously-downloaded installer so old versions don't pile up.
  const prev = readUpdateRecord();
  if (prev && prev.path && prev.path !== dest) { try { fs.unlinkSync(prev.path); } catch {} }
  let lastSent = 0;
  try {
    await downloadToFile(asset.url, dest, (frac) => {
      const pct = Math.round(frac * 100);
      if (pct !== lastSent) { lastSent = pct; emit(win, 'update:progress', { frac }); }
    });
    writeUpdateRecord({ path: dest, version: version || null });
    return { ok: true, path: dest };
  } catch (err) {
    try { fs.unlinkSync(dest); } catch {}
    return { ok: false, error: err.message || 'Download failed.' };
  }
});

ipcMain.handle('update:install', async (_e, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return { ok: false, error: 'Installer not found — try downloading again.' };
  // Reveal it in Finder/Explorer (so it's easy to find) and open it: macOS mounts
  // the .dmg; Windows runs the NSIS setup. We do NOT auto-quit — the renderer
  // shows clear steps and a "Quit to finish" button instead.
  try { shell.showItemInFolder(filePath); } catch {}
  const errMsg = await shell.openPath(filePath); // '' on success, else an error string
  if (errMsg) return { ok: false, error: errMsg };
  return { ok: true };
});

ipcMain.handle('app:quit', () => { app.quit(); return true; });

// Is there a leftover downloaded installer we could clean up?
ipcMain.handle('update:pendingCleanup', () => {
  const rec = readUpdateRecord();
  if (rec && rec.path && fs.existsSync(rec.path)) return { path: rec.path, version: rec.version || null };
  return null;
});
ipcMain.handle('update:deleteFile', (_e, p) => {
  try { if (p) fs.unlinkSync(p); } catch {}
  writeUpdateRecord(null);
  return true;
});

// ===========================================================================
// Open files from the OS (Gitsidian as a file handler, e.g. default for .md)
// ===========================================================================
// Extensions we'll open when launched as the handler. Markdown leads (the app's
// renderer is the selling point); a few plain-text kinds tag along.
const OPENABLE = /\.(md|markdown|mdx|mdown|markdn|txt|text|log|json|ya?ml|toml|csv)$/i;
let mainWin = null;
const pendingOpen = [];

// Queue an OS-opened item. Directories open as a terminal tab; files open in the
// editor/preview. `terminal:true` forces a terminal even for a file's folder.
function queueOpenItem(p, terminal = false) {
  let st; try { st = fs.statSync(p); } catch { return; }
  const abs = path.resolve(p);
  if (st.isDirectory()) pendingOpen.push({ path: abs, kind: 'terminal' });
  else if (terminal) pendingOpen.push({ path: path.dirname(abs), kind: 'terminal' });
  else pendingOpen.push({ path: abs, kind: 'file' });
  flushPendingOpen();
}
function queueOpenTerminal(dir) { // from the gitsidian:// scheme
  try { if (dir && fs.existsSync(dir)) { pendingOpen.push({ path: path.resolve(dir), kind: 'terminal' }); flushPendingOpen(); } } catch {}
}
function flushPendingOpen() {
  if (!mainWin || mainWin.isDestroyed()) return;
  const send = () => { while (pendingOpen.length) mainWin.webContents.send('open-external-item', pendingOpen.shift()); };
  if (mainWin.webContents.isLoading()) mainWin.webContents.once('did-finish-load', send);
  else send();
}
// Pull openable path / URL arguments out of an argv (Windows/Linux deliver here).
function consumeArgv(argv) {
  for (const a of (argv || []).slice(1)) {
    if (!a || a.startsWith('-')) continue;
    if (/^gitsidian:\/\//i.test(a)) { handleDeepLink(a); continue; }
    try { const st = fs.statSync(a); if (st.isDirectory() || OPENABLE.test(a)) queueOpenItem(a); } catch {}
  }
}
// gitsidian://terminal?cwd=/path  → open a terminal there.
function handleDeepLink(url) {
  try {
    const u = new URL(url);
    const host = (u.hostname || u.pathname.replace(/^\/+/, '')).toLowerCase();
    if (host.startsWith('terminal')) {
      const cwd = u.searchParams.get('cwd') || u.searchParams.get('path');
      if (cwd) queueOpenTerminal(decodeURIComponent(cwd));
    }
  } catch {}
}

// macOS delivers files via 'open-file' and deep links via 'open-url' (either can
// fire before the window exists — both queue and flush once it's ready).
app.on('open-file', (e, p) => { e.preventDefault(); queueOpenItem(p); });
app.on('open-url', (e, url) => { e.preventDefault(); handleDeepLink(url); });
// Register the gitsidian:// scheme so other apps / scripts can open a terminal.
try { app.setAsDefaultProtocolClient('gitsidian'); } catch {}

// One running instance: a second launch (double-click / deep link) routes into
// the existing window instead of opening a new app.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.focus(); }
    consumeArgv(argv);
  });
}

// Classify dropped paths (file vs directory) for the renderer's drag-drop.
ipcMain.handle('path:kinds', (_e, paths) => (paths || []).map((p) => {
  try { return { path: p, dir: fs.statSync(p).isDirectory() }; } catch { return { path: p, dir: false, missing: true }; }
}));

// Set Gitsidian as the default app for Markdown. macOS has no public Electron
// API for file-type defaults, so we use `duti` when present (one-click); without
// it we report back so the renderer can show manual steps.
ipcMain.handle('app:markdownDefaultInfo', async () => {
  const info = { platform: process.platform, bundleId: 'com.willbe.gitsidian', hasDuti: false, isDefault: false };
  if (process.platform !== 'darwin') return info;
  const duti = await run('duti', ['-V']);
  info.hasDuti = !duti.err;
  const cur = await run('duti', ['-x', 'md']); // current handler for .md
  info.isDefault = !cur.err && /Gitsidian/i.test(cur.stdout || '');
  return info;
});
ipcMain.handle('app:setMarkdownDefault', async () => {
  if (process.platform !== 'darwin') return { ok: false, error: 'Setting the default app is only supported on macOS right now.' };
  const duti = await run('duti', ['-V']);
  if (duti.err) return { ok: false, needsDuti: true };
  const exts = ['md', 'markdown', 'mdx', 'mdown', 'markdn'];
  const fails = [];
  for (const ext of exts) {
    const r = await run('duti', ['-s', 'com.willbe.gitsidian', ext, 'all']);
    if (r.err) fails.push(`${ext}: ${(r.stderr || 'failed').trim()}`);
  }
  // Also bind the markdown UTI so editors that ask by type follow suit.
  await run('duti', ['-s', 'com.willbe.gitsidian', 'net.daringfireball.markdown', 'all']);
  if (fails.length === exts.length) return { ok: false, error: fails[0] || 'duti could not set the default.' };
  return { ok: true, partial: fails.length ? fails : null };
});

// ===========================================================================
// Lifecycle
// ===========================================================================

app.whenReady().then(() => {
  mainWin = createWindow();
  // Files / deep links passed on the command line (Windows/Linux handler launch).
  if (process.platform !== 'darwin') consumeArgv(process.argv);
  flushPendingOpen();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWin = createWindow();
  });
});

app.on('window-all-closed', () => {
  for (const s of sessions.values()) { try { s.proc.kill(); } catch {} }
  if (process.platform !== 'darwin') app.quit();
});

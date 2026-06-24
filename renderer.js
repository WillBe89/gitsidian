// Gitsidian — renderer. Authored by will.be.
'use strict';

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const vaultListEl = document.getElementById('vault-list');
const aiSelect = document.getElementById('ai-select');
const tabbar = document.getElementById('tabbar');
const terminalsEl = document.getElementById('terminals');
const welcomeEl = document.getElementById('welcome');
const refreshBtn = document.getElementById('refresh-vaults');
const addFolderBtn = document.getElementById('add-folder');
const importBtn = document.getElementById('import-repo');

// import modal
const importModal = document.getElementById('import-modal');
const importUrl = document.getElementById('import-url');
const importName = document.getElementById('import-name');
const importStatus = document.getElementById('import-status');

// publish modal
const publishModal = document.getElementById('publish-modal');
const publishName = document.getElementById('publish-name');
const publishIntro = document.getElementById('publish-intro');
const publishStatus = document.getElementById('publish-status');
let publishCtx = null;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const sessions = new Map(); // id -> session object
let activeId = null;
let ais = [];

// Persistent "+" button that opens a plain shell terminal (use Gitsidian
// instead of Terminal.app). Lives at the end of the tab strip.
const newTermBtn = el('button', { class: 'new-tab', title: 'New terminal (shell, in your home folder)', text: '+' });
newTermBtn.addEventListener('click', () => openSession(undefined, 'terminal', 'shell'));

// --- Tab grouping / quadrant layout --------------------------------------
// A "group" arranges 2–4 open tabs in a grid (side-by-side or 2×2 quadrants).
// Tabs still count toward the 24-tab cap; grouping just lays them out together.
let groups = [];            // [{ id, name, members: [sessionId, …] }]  (2–4 members)
let activeGroupId = null;   // when set, the terminals area shows this group's grid
let paneGroupSeq = 0;
const selectedIds = new Set(); // tabs held via shift-click (a selection, not a group yet)
const groupChipEls = new Map(); // groupId -> chip element
let tabDragId = null;       // session id being drag-reordered in the strip
let cellDragId = null;      // session id being dragged between quadrant cells
const MAX_GROUP = 4;
// Where each member sits in the grid, by member count then index (CSS grid-area).
const GRID_AREAS = {
  2: ['1 / 1 / 2 / 2', '1 / 2 / 2 / 3'],
  3: ['1 / 1 / 2 / 2', '1 / 2 / 2 / 3', '2 / 1 / 3 / 3'],
  4: ['1 / 1 / 2 / 2', '1 / 2 / 2 / 3', '2 / 1 / 3 / 2', '2 / 2 / 3 / 3'],
};
const GRID_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>';

const groupBtn = el('button', { class: 'new-tab group-toggle', title: 'Shift-click 2–4 tabs, then click here to group them', html: GRID_SVG });
groupBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (selectedIds.size >= 2) createGroupFromSelection();
  else showToast('Shift-click 2–4 tabs to hold them, then click here (or right-click) to group.');
});

// Keep the persistent "+" and group controls at the end of the tab strip.
function appendTabControls() {
  tabbar.appendChild(newTermBtn);
  tabbar.appendChild(groupBtn);
}

const groupOf = (id) => groups.find((g) => g.members.includes(id)) || null;

// Drop a dragged tab onto empty strip space → remove it from its group (and send
// it to the end). Tab/chip drops stopPropagation, so this only fires on blank area.
tabbar.addEventListener('dragover', (e) => { if (tabDragId) e.preventDefault(); });
tabbar.addEventListener('drop', (e) => {
  if (!tabDragId) return;
  if (e.target.closest && e.target.closest('.tab, .group-chip')) return;
  e.preventDefault();
  if (selectionDragging()) { tabDragId = null; clearTabDropMarks(); createGroupFromSelection(); return; }
  const id = tabDragId; tabDragId = null; clearTabDropMarks();
  const s = sessions.get(id); if (!s) return;
  const wasGrouped = !!groupOf(id);
  if (wasGrouped) removeFromGroup(id);
  if (s.tabEl) { tabbar.appendChild(s.tabEl); appendTabControls(); }
  syncSessionsOrder();
  if (wasGrouped) showToast('Removed from group');
});

// Lightweight non-blocking toast for occasional notices (e.g. session cap).
let toastTimer = null;
function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = el('div', { id: 'toast', class: 'toast' }); document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

const TERM_THEME = {
  background: '#0a0c10',
  foreground: '#d7dce5',
  cursor: '#e23a63',
  cursorAccent: '#0a0c10',
  selectionBackground: '#2a3346',
  black: '#0a0c10', brightBlack: '#5b6473',
  red: '#e2547d', brightRed: '#ff7a9c',
  green: '#5fc77a', brightGreen: '#7fe39a',
  yellow: '#e2b53a', brightYellow: '#ffd166',
  blue: '#5b9dff', brightBlue: '#82b6ff',
  magenta: '#c084fc', brightMagenta: '#d6a8ff',
  cyan: '#56d4dd', brightCyan: '#7fe6ee',
  white: '#d7dce5', brightWhite: '#ffffff',
};

const TERM_THEME_LIGHT = {
  background: '#ffffff',
  foreground: '#1b1f27',
  cursor: '#c0264b',
  cursorAccent: '#ffffff',
  selectionBackground: '#cfe0ff',
  black: '#1b1f27', brightBlack: '#5b6675',
  red: '#cf222e', brightRed: '#e2547d',
  green: '#1a7f37', brightGreen: '#2da44e',
  yellow: '#9a6700', brightYellow: '#bf8700',
  blue: '#0969da', brightBlue: '#218bff',
  magenta: '#8250df', brightMagenta: '#a371f7',
  cyan: '#1b7c83', brightCyan: '#3192aa',
  white: '#6e7781', brightWhite: '#1b1f27',
};
// Theme registry. Each theme sets surface/text CSS vars (in styles.css); `base`
// (dark/light) drives the terminal + editor syntax themes. Accent is separate.
const THEMES = {
  midnight: { label: 'Midnight', base: 'dark', bg: '#0d0f14' },
  ink: { label: 'Ink', base: 'dark', bg: '#000000' },
  muted: { label: 'Muted', base: 'dark', bg: '#1a1c20' },
  grape: { label: 'Grape', base: 'dark', bg: '#16121f' },
  nord: { label: 'Nord', base: 'dark', bg: '#2e3440' },
  day: { label: 'Day', base: 'light', bg: '#f6f7f9' },
  claude: { label: 'Claude', base: 'light', bg: '#f4efe7' },
};
// Colour helpers — for the fully-custom theme/accent (hex pickers).
function hexToRgb(h) { h = (h || '').replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h || '0', 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function clampByte(n) { return Math.max(0, Math.min(255, Math.round(n))); }
function rgbToHex(r, g, b) { return '#' + [r, g, b].map((x) => clampByte(x).toString(16).padStart(2, '0')).join(''); }
function mix(hex, target, amt) { const a = hexToRgb(hex), b = hexToRgb(target); return rgbToHex(a[0] + (b[0] - a[0]) * amt, a[1] + (b[1] - a[1]) * amt, a[2] + (b[2] - a[2]) * amt); }
function luminance(hex) { const [r, g, b] = hexToRgb(hex).map((v) => v / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
function isHex(h) { return /^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test((h || '').trim()); }
function normHex(h) { h = (h || '').trim(); if (!h.startsWith('#')) h = '#' + h; if (h.length === 4) h = '#' + h.slice(1).split('').map((c) => c + c).join(''); return h.toLowerCase(); }
// Derive a coherent surface palette from a single background colour.
function customPalette(bg) {
  const dark = luminance(bg) <= 0.5;
  if (dark) return {
    '--bg': bg, '--panel': mix(bg, '#ffffff', 0.05), '--panel-2': mix(bg, '#ffffff', 0.09),
    '--panel-3': mix(bg, '#ffffff', 0.14), '--line': mix(bg, '#ffffff', 0.20),
    '--text': '#e9ebef', '--muted': mix('#e9ebef', bg, 0.45), '--term-bg': mix(bg, '#000000', 0.25),
  };
  return {
    '--bg': bg, '--panel': mix(bg, '#ffffff', 0.55), '--panel-2': mix(bg, '#000000', 0.04),
    '--panel-3': mix(bg, '#000000', 0.09), '--line': mix(bg, '#000000', 0.16),
    '--text': '#1b1f27', '--muted': mix('#1b1f27', bg, 0.45), '--term-bg': mix(bg, '#ffffff', 0.5),
  };
}
const CUSTOM_VARS = ['--bg', '--panel', '--panel-2', '--panel-3', '--line', '--text', '--muted', '--term-bg'];

function themeBase() {
  if (settings.theme === 'custom' && settings.bgHex) return luminance(settings.bgHex) > 0.5 ? 'light' : 'dark';
  return (THEMES[settings.theme] || THEMES.midnight).base;
}
function termTheme() {
  const base = themeBase() === 'light' ? TERM_THEME_LIGHT : TERM_THEME;
  if (settings.theme === 'custom' && settings.bgHex) {
    const pal = customPalette(settings.bgHex);
    return Object.assign({}, base, { background: pal['--term-bg'], foreground: pal['--text'] });
  }
  return base;
}
const IS_MAC = window.gits.platform === 'darwin';
function cmTheme() { return themeBase() === 'light' ? 'eclipse' : 'material-darker'; }

// ---------------------------------------------------------------------------
// Tiny DOM helper
// ---------------------------------------------------------------------------
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'style') node.style.cssText = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function basename(p) { return p.replace(/\/+$/, '').split('/').pop(); }

// Encode bytes to base64 without blowing the call stack on large images.
function bytesToBase64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

// Minimal right-click context menu.
let ctxMenuEl = null;
function hideContextMenu() { if (ctxMenuEl) { ctxMenuEl.remove(); ctxMenuEl = null; } }
function showContextMenu(x, y, items) {
  hideContextMenu();
  ctxMenuEl = el('div', { class: 'ctx-menu' });
  for (const it of items) {
    const mi = el('div', { class: 'ctx-item', text: it.label });
    mi.addEventListener('click', () => { hideContextMenu(); it.onClick(); });
    ctxMenuEl.appendChild(mi);
  }
  document.body.appendChild(ctxMenuEl);
  ctxMenuEl.style.left = Math.min(x, window.innerWidth - 220) + 'px';
  ctxMenuEl.style.top = Math.min(y, window.innerHeight - (items.length * 32 + 12)) + 'px';
}
document.addEventListener('click', hideContextMenu);
window.addEventListener('blur', hideContextMenu);

// In-app text prompt (Electron's renderer doesn't support window.prompt()).
// Resolves to the entered string, or null if cancelled.
function uiPrompt(message, defaultValue = '', placeholder = '') {
  return new Promise((resolve) => {
    const input = el('input', { type: 'text', class: 'prompt-input', value: defaultValue || '', placeholder, spellcheck: 'false', autocapitalize: 'off' });
    const okBtn = el('button', { class: 'block-btn primary', text: 'OK' });
    const cancelBtn = el('button', { class: 'block-btn', text: 'Cancel' });
    const overlay = el('div', { class: 'modal prompt-modal' },
      el('div', { class: 'modal-card' },
        el('p', { class: 'prompt-msg', text: message }),
        input,
        el('div', { class: 'modal-actions' }, cancelBtn, okBtn)));
    document.body.appendChild(overlay);
    const done = (val) => { overlay.remove(); resolve(val); };
    okBtn.addEventListener('click', () => done(input.value));
    cancelBtn.addEventListener('click', () => done(null));
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) done(null); });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); done(input.value); }
      else if (e.key === 'Escape') { e.preventDefault(); done(null); }
    });
    setTimeout(() => { input.focus(); input.select(); }, 0);
  });
}

// In-app confirm. opts: { okLabel, danger, extraLabel } — when extraLabel is set
// a third button resolves to 'extra' (used here for "Download backup").
// Resolves true (confirmed), false (cancelled), or 'extra'.
function uiConfirm(message, opts = {}) {
  return new Promise((resolve) => {
    const okBtn = el('button', { class: `block-btn ${opts.danger ? 'danger' : 'primary'}`, text: opts.okLabel || 'OK' });
    const cancelBtn = el('button', { class: 'block-btn', text: 'Cancel' });
    const actions = [cancelBtn];
    let extraBtn = null;
    if (opts.extraLabel) { extraBtn = el('button', { class: 'block-btn', text: opts.extraLabel }); actions.push(extraBtn); }
    actions.push(okBtn);
    const overlay = el('div', { class: 'modal prompt-modal' },
      el('div', { class: 'modal-card' },
        el('p', { class: 'prompt-msg', html: message }),
        el('div', { class: 'modal-actions' }, ...actions)));
    document.body.appendChild(overlay);
    const done = (val) => { overlay.remove(); resolve(val); };
    okBtn.addEventListener('click', () => done(true));
    cancelBtn.addEventListener('click', () => done(false));
    if (extraBtn) extraBtn.addEventListener('click', () => done('extra'));
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) done(false); });
    setTimeout(() => okBtn.focus(), 0);
  });
}

// ---------------------------------------------------------------------------
// Settings (personalization) — persisted in localStorage, applied live
// ---------------------------------------------------------------------------
const ACCENTS = {
  crimson: ['#c0264b', '#e23a63'],
  blue: ['#2563eb', '#3b82f6'],
  green: ['#15a34a', '#22c55e'],
  purple: ['#7c3aed', '#a855f7'],
  amber: ['#d97706', '#f59e0b'],
  pink: ['#db2777', '#ec4899'],
  teal: ['#0d9488', '#14b8a6'],
};
function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem('gits-settings') || '{}'); } catch {}
  return {
    accent: (s.accent === 'custom' || ACCENTS[s.accent]) ? s.accent : 'crimson',
    accentHex: isHex(s.accentHex) ? normHex(s.accentHex) : '#c0264b',
    bgHex: isHex(s.bgHex) ? normHex(s.bgHex) : '#0d0f14',
    fontSize: typeof s.fontSize === 'number' ? s.fontSize : 12.5,
    scrollback: typeof s.scrollback === 'number' ? s.scrollback : 5000,
    bold: !!s.bold,
    italic: !!s.italic,
    hideTabLabels: !!s.hideTabLabels, // hide the tab name (title)
    hideTabTags: !!s.hideTabTags,     // hide the type tag (Terminal/Claude/…)
    defaultAi: s.defaultAi || null,
    autoUpdate: s.autoUpdate !== false, // opt-out; checks on launch by default
    restoreTabs: s.restoreTabs !== false, // opt-out; reopen tabs on relaunch
    allowChatCommands: !!s.allowChatCommands, // opt-IN; off by default (safety)
    composerHeight: typeof s.composerHeight === 'number' ? Math.max(40, Math.min(480, s.composerHeight)) : 0, // 0 = auto
    theme: (s.theme === 'custom' || THEMES[s.theme]) ? s.theme : (s.theme === 'light' ? 'day' : 'midnight'), // migrate old dark/light
    sidebarWidth: typeof s.sidebarWidth === 'number' ? Math.max(200, Math.min(520, s.sidebarWidth)) : 280,
    splitRatio: typeof s.splitRatio === 'number' ? Math.max(20, Math.min(80, s.splitRatio)) : 50,
  };
}
let settings = loadSettings();
function saveSettings() { localStorage.setItem('gits-settings', JSON.stringify(settings)); }
function applyAccent() {
  let a, b;
  if (settings.accent === 'custom' && isHex(settings.accentHex)) { a = settings.accentHex; b = mix(settings.accentHex, '#ffffff', 0.18); }
  else { [a, b] = ACCENTS[settings.accent] || ACCENTS.crimson; }
  document.documentElement.style.setProperty('--accent', a);
  document.documentElement.style.setProperty('--accent-2', b);
}
function applyFontSize() {
  for (const s of sessions.values()) {
    if (s.term) {
      try { s.term.options.fontSize = settings.fontSize; s.fit.fit(); window.gits.ptyResize(s.id, s.term.cols, s.term.rows); } catch {}
    }
    if (s.cm) {
      try { s.cm.getWrapperElement().style.fontSize = settings.fontSize + 'px'; s.cm.refresh(); } catch {}
    }
  }
}
function applyFontStyle() {
  for (const s of sessions.values()) {
    if (!s.term) continue;
    try {
      s.term.options.fontWeight = settings.bold ? 'bold' : 'normal';
      s.host.classList.toggle('term-italic', settings.italic);
      s.fit.fit();
    } catch {}
  }
}
function applyTheme() {
  const root = document.documentElement;
  if (settings.theme === 'custom' && settings.bgHex) {
    root.setAttribute('data-theme', 'custom');
    const pal = customPalette(settings.bgHex);
    for (const [k, v] of Object.entries(pal)) root.style.setProperty(k, v);
  } else {
    for (const k of CUSTOM_VARS) root.style.removeProperty(k); // drop any prior custom overrides
    root.setAttribute('data-theme', THEMES[settings.theme] ? settings.theme : 'midnight');
  }
  const t = termTheme(), cm = cmTheme();
  for (const s of sessions.values()) {
    if (s.term) { try { s.term.options.theme = t; } catch {} }
    if (s.cm) { try { s.cm.setOption('theme', cm); } catch {} }
  }
}
function applySidebarWidth() {
  document.documentElement.style.setProperty('--sidebar-w', settings.sidebarWidth + 'px');
}
function applyTabLabels() {
  document.body.classList.toggle('tabs-no-name', settings.hideTabLabels);
  document.body.classList.toggle('tabs-no-tag', settings.hideTabTags);
}
// Refit the visible terminal(s) — used after a resize drag.
function refitTerminals() {
  const g = activeGroupId ? groups.find((x) => x.id === activeGroupId) : null;
  if (g) for (const id of g.members) refreshPane(sessions.get(id));
  else refreshPane(sessions.get(activeId));
}
applyAccent();
applyTheme();
applySidebarWidth();
applyTabLabels();

// ---------------------------------------------------------------------------
// AI picker
// ---------------------------------------------------------------------------
let lastAi = null;
async function loadAis(selectId) {
  ais = await window.gits.listAis();
  aiSelect.innerHTML = '';
  // Smart detect: only show AIs actually installed on this machine (+ shell).
  const installed = ais.filter((a) => a.installed);
  for (const ai of installed) {
    aiSelect.appendChild(el('option', { value: ai.id }, ai.name));
  }
  // Escape hatch for anything not auto-detected (model variants, new tools).
  aiSelect.appendChild(el('option', { value: '__add__' }, '+ Add a command…'));

  const prefer = (selectId && installed.find((a) => a.id === selectId))
    || (settings.defaultAi && installed.find((a) => a.id === settings.defaultAi))
    || installed.find((a) => a.id !== 'shell' && !a.custom)
    || installed[0];
  if (prefer) aiSelect.value = prefer.id;
  lastAi = aiSelect.value;
}

// Selecting "Add a command…" opens the dialog and reverts the picker.
aiSelect.addEventListener('change', () => {
  if (aiSelect.value === '__add__') {
    aiSelect.value = lastAi;
    openAddAi();
  } else {
    lastAi = aiSelect.value;
    settings.defaultAi = aiSelect.value; // remember across launches
    saveSettings();
  }
});

// ---------------------------------------------------------------------------
// Sidebar: projects + lazy file tree
// ---------------------------------------------------------------------------
function projectBadge(git) {
  if (!git || git.missing) return { cls: 'err', text: 'missing', actions: [] };
  // "On GitHub" = a repo with an upstream tracking branch. Everything else
  // (no git at all, or local-only commits) collapses to a single Publish action.
  const onGitHub = git.isRepo && git.hasUpstream;
  if (!onGitHub) return { cls: 'publish', text: '↥ Publish', actions: ['publish'] };
  const edits = (n) => `${n} edit${n === 1 ? '' : 's'}`;
  const canPull = git.behind > 0;
  const canPush = git.dirty || git.ahead > 0;
  if (canPull && canPush) {
    const right = git.dirty ? edits(git.changedCount) : `${git.ahead}↑`;
    return { cls: 'warn', text: `${git.behind}↓ · ${right}`, actions: ['pull', 'push'] };
  }
  if (canPush) {
    if (git.dirty) return { cls: 'warn', text: edits(git.changedCount), actions: ['push'] };
    return { cls: 'info', text: `${git.ahead}↑ to push`, actions: ['push'] };
  }
  if (canPull) return { cls: 'info', text: `${git.behind}↓ get latest`, actions: ['pull'] };
  return { cls: 'ok', text: 'synced', actions: [] };
}

function badgeTitle(actions) {
  if (actions.includes('publish')) return 'Publish this project to GitHub';
  if (actions.includes('pull') && actions.includes('push')) return 'Behind GitHub and has local changes — pull and/or push';
  if (actions.includes('pull')) return 'Pull the latest from GitHub into this folder';
  return 'Commit & push changes to GitHub';
}

// Route a badge click. A single pull is a quick direct action; anything
// involving a push (or both) opens the Sync dialog where you can do either.
function handleBadge(p, actions) {
  if (actions.includes('publish')) return openPublish(p);
  if (actions.length === 1 && actions[0] === 'pull') return openPullPreview(p);
  return openSync(p);
}

// Branch switcher — list branches in a context menu; switch or create.
// Compact per-project actions menu (replaces the old button row).
function openProjectMenu(e, p) {
  const items = [{ label: 'Open in Finder', onClick: () => window.gits.openFinder(p.path) }];
  if (p.git && p.git.isRepo) {
    items.push({ label: 'Review changes…', onClick: () => openReview(p) });
    items.push({ label: 'Commit history', onClick: () => openHistory(p) });
    items.push({ label: `Branch: ${p.git.branch || '?'} — switch…`, onClick: () => openBranchMenu(e, p) });
    items.push({ label: 'Pull request…', onClick: () => openPrFlow(p) });
    items.push({ label: 'Open on GitHub ↗', onClick: async () => {
      const url = await window.gits.webUrl(p.path);
      if (url) window.gits.openUrl(url); else showToast('This project has no GitHub remote yet — publish it first.');
    } });
  }
  items.push({ label: 'Open in Obsidian ↗', onClick: () => openObsidianDialog(p) });
  showContextMenu(e.clientX, e.clientY, items);
}

async function openBranchMenu(e, p) {
  const res = await window.gits.branches(p.path);
  if (!res.ok) { showToast(res.error || 'Could not list branches.'); return; }
  const items = res.branches.map((b) => ({
    label: (b === res.current ? '✓ ' : '    ') + b,
    onClick: () => { if (b !== res.current) switchBranch(p, b); },
  }));
  items.push({ label: '+ New branch…', onClick: () => createBranch(p) });
  items.push({ label: 'Pull request…', onClick: () => openPrFlow(p) });
  showContextMenu(e.clientX, e.clientY, items);
}

// Open the existing PR for this branch, or prompt to create one.
async function openPrFlow(p) {
  showToast('Checking for a pull request…');
  const view = await window.gits.prView(p.path);
  if (view.exists && view.url) {
    window.gits.openUrl(view.url);
    showToast(`Opened PR #${view.number} (${(view.state || '').toLowerCase()}).`);
    return;
  }
  // Prefill the title from the latest commit subject.
  let suggested = '';
  try { const lg = await window.gits.log({ repo: p.path, limit: 1 }); suggested = (lg.commits && lg.commits[0] && lg.commits[0].subject) || ''; } catch {}
  const title = await uiPrompt('Pull request title:', suggested);
  if (title === null) return;
  const body = await uiPrompt('Description (optional):', '');
  if (body === null) return;
  showToast('Creating pull request…');
  const r = await window.gits.prCreate({ repo: p.path, title: title.trim() || 'Update', body: body.trim() });
  if (r.ok && r.url) {
    window.gits.openUrl(r.url);
    showToast(r.existed ? 'A PR already existed — opened it.' : 'Pull request created.');
  } else {
    showToast(r.error || 'Could not create the pull request.');
  }
}
async function switchBranch(p, branch) {
  const r = await window.gits.checkout({ repo: p.path, branch });
  if (r.ok) { showToast(`Switched to ${branch}`); await loadProjects({ fetch: false }); }
  else showToast(r.error || 'Could not switch branch.');
}
async function createBranch(p) {
  const name = await uiPrompt('New branch name:', '');
  if (!name) return;
  const r = await window.gits.checkout({ repo: p.path, branch: name.trim(), create: true });
  if (r.ok) { showToast(`Created and switched to ${name.trim()}`); await loadProjects({ fetch: false }); }
  else showToast(r.error || 'Could not create branch.');
}

// A "launch agent here" button shared by project roots and tree folders.
function runHereButton(dirPath, label) {
  const b = el('span', { class: 'run-hint', title: `Open ${aiSelect.value} here`, text: '▸ run' });
  b.addEventListener('click', (e) => { e.stopPropagation(); openSession(dirPath, label); });
  return b;
}

// --- Sidebar layout state (groups, ordering, hidden) — persisted in userData ---
let layout = { groups: [], ungrouped: [], hidden: [] };
let projectIndex = new Map(); // path -> project object
let groupSeq = 0;
let draggedPath = null;
let draggedGroupId = null;
let treeDrag = null; // { path, el } while dragging a file/folder within the tree
let treeClipboard = null; // { path, cut } for Copy/Cut → Paste

const dirOf = (p) => p.replace(/\/+$/, '').replace(/\/[^/]+$/, '');
// Reload the tree container that holds the row for `p` (used after move/cut).
async function refreshTreePath(p) {
  const row = document.querySelector(`.tree-row[data-path="${(window.CSS ? CSS.escape(p) : p)}"]`);
  if (!row) return;
  const container = row.closest('.tree-children') || row.closest('.tree');
  if (container) await refreshContainer(container);
}

// Always clear drag-highlight marks when a drag ends (or drops anywhere) — fixes
// stuck red borders when a drag is cancelled, dropped on a child, or leaves the
// window (incl. external file drags from Finder, which fire no in-app dragend).
const DRAG_MARKS = ['drag-over', 'drop-before', 'group-drop', 'group-drop-after', 'dragging', 'group-dragging', 'drop', 'tree-drop'];
function clearDragMarks() {
  document.querySelectorAll('.' + DRAG_MARKS.join(', .'))
    .forEach((e) => e.classList.remove(...DRAG_MARKS));
}
document.addEventListener('dragend', clearDragMarks);
document.addEventListener('drop', clearDragMarks);
// When the drag pointer leaves the window entirely, relatedTarget is null.
window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) clearDragMarks(); });

function saveLayout() { window.gits.setLayout(layout); }

// Reconcile saved layout against the projects that actually exist right now:
// drop hidden ones, prune stale paths, and append any newly-discovered projects.
function normalizeLayout(saved, projects) {
  const l = {
    groups: Array.isArray(saved && saved.groups) ? saved.groups.map((g) => ({
      id: g.id || `g${++groupSeq}`,
      name: g.name || 'Group',
      collapsed: !!g.collapsed,
      paths: Array.isArray(g.paths) ? g.paths.slice() : [],
    })) : [],
    ungrouped: Array.isArray(saved && saved.ungrouped) ? saved.ungrouped.slice() : [],
    hidden: Array.isArray(saved && saved.hidden) ? saved.hidden.slice() : [],
  };
  const visible = projects.map((p) => p.path).filter((p) => !l.hidden.includes(p));
  const placed = new Set();
  for (const g of l.groups) {
    g.paths = g.paths.filter((p) => visible.includes(p));
    g.paths.forEach((p) => placed.add(p));
  }
  l.ungrouped = l.ungrouped.filter((p) => visible.includes(p) && !placed.has(p));
  l.ungrouped.forEach((p) => placed.add(p));
  for (const p of visible) if (!placed.has(p)) { l.ungrouped.push(p); placed.add(p); }
  return l;
}

function findGroupOf(path) {
  const g = layout.groups.find((x) => x.paths.includes(path));
  return g ? g.id : null;
}
function removePathEverywhere(p) {
  layout.ungrouped = layout.ungrouped.filter((x) => x !== p);
  for (const g of layout.groups) g.paths = g.paths.filter((x) => x !== p);
}
// Move a project into a group (or ungrouped if groupId is null), before
// `beforePath` if given, else to the end.
function movePath(p, groupId, beforePath) {
  if (!p || p === beforePath) { draggedPath = null; return; }
  removePathEverywhere(p);
  const list = groupId ? (layout.groups.find((g) => g.id === groupId) || {}).paths : layout.ungrouped;
  if (list) {
    const idx = beforePath ? list.indexOf(beforePath) : -1;
    if (idx >= 0) list.splice(idx, 0, p); else list.push(p);
  }
  draggedPath = null;
  saveLayout();
  renderSidebar();
}

async function removeProject(p) {
  if (p.source === 'added') await window.gits.removeVault(p.path);   // forget the folder entirely
  else if (!layout.hidden.includes(p.path)) layout.hidden.push(p.path); // hide discovered vaults
  removePathEverywhere(p.path);
  saveLayout();
  await loadProjects();
}

function addGroup() {
  layout.groups.push({ id: `g${++groupSeq}-${Date.now()}`, name: 'New group', collapsed: false, paths: [] });
  saveLayout();
  renderSidebar();
}
function deleteGroup(id) {
  const g = layout.groups.find((x) => x.id === id);
  if (!g) return;
  layout.ungrouped.push(...g.paths); // projects fall back to ungrouped, never lost
  layout.groups = layout.groups.filter((x) => x.id !== id);
  saveLayout();
  renderSidebar();
}
// Reorder groups: move group `id` to sit before `beforeId` (or to the end).
function moveGroup(id, beforeId) {
  if (id === beforeId) { draggedGroupId = null; return; }
  const idx = layout.groups.findIndex((g) => g.id === id);
  if (idx < 0) return;
  const [g] = layout.groups.splice(idx, 1);
  const bidx = layout.groups.findIndex((x) => x.id === beforeId);
  if (bidx >= 0) layout.groups.splice(bidx, 0, g); else layout.groups.push(g);
  draggedGroupId = null;
  saveLayout();
  renderSidebar();
}

// A container that accepts a dropped project at its end.
function makeDropZone(elm, groupId) {
  elm.addEventListener('dragover', (e) => { e.preventDefault(); elm.classList.add('drag-over'); });
  elm.addEventListener('dragleave', (e) => { if (!elm.contains(e.relatedTarget)) elm.classList.remove('drag-over'); });
  elm.addEventListener('drop', (e) => {
    e.preventDefault();
    elm.classList.remove('drag-over');
    if (draggedPath) movePath(draggedPath, groupId, null);
  });
  return elm;
}

function projectCard(p) {
  const badge = projectBadge(p.git);
  const wrap = el('div', { class: 'vault' });

  const badgeEl = el('span', { class: `vault-badge ${badge.cls}`, text: badge.text });
  const badgeActions = badge.actions || [];
  if (badgeActions.length) {
    badgeEl.classList.add('clickable');
    badgeEl.title = badgeTitle(badgeActions);
    badgeEl.addEventListener('click', (e) => { e.stopPropagation(); handleBadge(p, badgeActions); });
  }
  const removeBtn = el('span', { class: 'proj-remove', title: 'Remove from sidebar', text: '×' });
  removeBtn.addEventListener('click', (e) => { e.stopPropagation(); removeProject(p); });

  const header = el('div', { class: 'vault-row', title: p.path, draggable: 'true' },
    el('span', { class: 'twisty', text: '▶' }),
    el('span', { class: 'vault-name', text: p.name }),
    runHereButton(p.path, p.name),
    badgeEl,
    removeBtn
  );

  // Drag to reorganize
  header.addEventListener('dragstart', (e) => {
    draggedPath = p.path;
    wrap.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', p.path); } catch {}
  });
  header.addEventListener('dragend', () => { wrap.classList.remove('dragging'); });
  // Drop onto a card inserts the dragged project before it (same list).
  wrap.addEventListener('dragover', (e) => { e.preventDefault(); if (draggedPath && draggedPath !== p.path) wrap.classList.add('drop-before'); });
  wrap.addEventListener('dragleave', (e) => { if (!wrap.contains(e.relatedTarget)) wrap.classList.remove('drop-before'); });
  wrap.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    wrap.classList.remove('drop-before');
    if (draggedPath) movePath(draggedPath, findGroupOf(p.path), p.path);
  });

  const meta = el('div', { class: 'vault-meta' });
  const actions = el('div', { class: 'vault-actions' });
  // A single compact menu replaces the old row of buttons (much cleaner).
  if (p.git && p.git.isRepo) {
    const reviewBtn = el('button', { class: 'tiny-btn', title: 'Review changes, stage, commit & push', text: 'Review' });
    reviewBtn.addEventListener('click', (e) => { e.stopPropagation(); openReview(p); });
    actions.appendChild(reviewBtn);
  }
  const menuBtn = el('button', { class: 'tiny-btn actions-btn', title: 'Project actions', text: 'Actions ▾' });
  menuBtn.addEventListener('click', (e) => { e.stopPropagation(); openProjectMenu(e, p); });
  actions.appendChild(menuBtn);
  meta.appendChild(actions);

  const treeRoot = el('div', { class: 'tree', 'data-loaded': '0', 'data-path': p.path, 'data-depth': '0' });
  meta.appendChild(treeRoot);
  // Dropping a tree item onto empty tree space moves it to the project root.
  treeRoot.addEventListener('dragover', (e) => { if (treeDrag) e.preventDefault(); });
  treeRoot.addEventListener('drop', async (e) => {
    if (!treeDrag) return;
    e.preventDefault(); e.stopPropagation();
    const { path: src, el: srcEl } = treeDrag; treeDrag = null;
    const r = await window.gits.moveEntry({ src, destDir: p.path });
    if (!r.ok) { showToast(r.error || 'Could not move.'); return; }
    await refreshContainer(treeRoot);
    const sc = srcEl.closest('.tree-children');
    if (sc) await refreshContainer(sc);
  });
  // Right-click empty tree space → new file/folder at the project root, or paste.
  treeRoot.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.tree-row')) return; // a row handles its own menu
    e.preventDefault(); e.stopPropagation();
    const items = [
      { label: 'New file…', onClick: async () => {
        const name = await uiPrompt(`New file in "${p.name}":`, ''); if (!name) return;
        const r = await window.gits.createEntry({ parent: p.path, name, isDir: false });
        if (!r.ok) { showToast(r.error || 'Could not create.'); return; }
        await refreshContainer(treeRoot); openEditor(r.path);
      } },
      { label: 'New folder…', onClick: async () => {
        const name = await uiPrompt(`New folder in "${p.name}":`, ''); if (!name) return;
        const r = await window.gits.createEntry({ parent: p.path, name, isDir: true });
        if (!r.ok) { showToast(r.error || 'Could not create.'); return; }
        await refreshContainer(treeRoot);
      } },
    ];
    if (treeClipboard) {
      const clip = treeClipboard;
      items.push({ label: `Paste${clip.cut ? ' (move)' : ''} into "${p.name}"`, onClick: async () => {
        const r = await window.gits.pasteEntry({ src: clip.path, destDir: p.path, cut: clip.cut });
        if (!r.ok) { showToast(r.error || 'Could not paste.'); return; }
        const srcPath = clip.path; if (clip.cut) treeClipboard = null;
        await refreshContainer(treeRoot);
        if (clip.cut) await refreshTreePath(srcPath);
      } });
    }
    showContextMenu(e.clientX, e.clientY, items);
  });

  header.addEventListener('click', async () => {
    const opening = !wrap.classList.contains('open');
    wrap.classList.toggle('open');
    if (opening && treeRoot.dataset.loaded === '0') {
      let changes = null;
      if (p.git && p.git.isRepo) {
        const c = await window.gits.changes(p.path);
        changes = { files: c.files || {}, dirSet: new Set(c.dirs || []) };
      }
      await loadChildren(treeRoot, p.path, 0, changes);
    }
  });

  wrap.append(header, meta);
  return wrap;
}

function groupEl(g) {
  const wrap = el('div', { class: `group${g.collapsed ? '' : ' open'}` });
  const nameEl = el('span', { class: 'group-name', text: g.name, title: 'Double-click to rename' });
  nameEl.addEventListener('dblclick', (e) => { e.stopPropagation(); renameGroup(nameEl, g); });
  const del = el('span', { class: 'group-del', title: 'Delete group (projects move out)', text: '×' });
  del.addEventListener('click', (e) => { e.stopPropagation(); deleteGroup(g.id); });

  const header = el('div', { class: 'group-head', draggable: 'true' },
    el('span', { class: 'twisty', text: '▶' }),
    nameEl,
    el('span', { class: 'group-count', text: String(g.paths.length) }),
    del
  );
  header.addEventListener('click', () => { g.collapsed = !g.collapsed; saveLayout(); wrap.classList.toggle('open'); });

  // Drag the header to reorder groups; dropping a project here adds it here.
  header.addEventListener('dragstart', (e) => {
    draggedGroupId = g.id;
    wrap.classList.add('group-dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', g.id); } catch {}
  });
  header.addEventListener('dragend', () => wrap.classList.remove('group-dragging'));
  const dropAfter = (e) => {
    const rect = header.getBoundingClientRect();
    return (e.clientY - rect.top) > rect.height / 2;
  };
  header.addEventListener('dragover', (e) => {
    e.preventDefault();
    header.classList.remove('group-drop', 'group-drop-after');
    if (draggedGroupId && draggedGroupId !== g.id) {
      header.classList.add(dropAfter(e) ? 'group-drop-after' : 'group-drop');
    } else if (draggedPath) {
      header.classList.add('group-drop');
    }
  });
  header.addEventListener('dragleave', () => header.classList.remove('group-drop', 'group-drop-after'));
  header.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    header.classList.remove('group-drop', 'group-drop-after');
    if (draggedGroupId) {
      const idx = layout.groups.findIndex((x) => x.id === g.id);
      const after = dropAfter(e);
      const next = layout.groups[idx + 1];
      const beforeId = after ? (next ? next.id : null) : g.id; // null => append to end
      moveGroup(draggedGroupId, beforeId);
    } else if (draggedPath) {
      movePath(draggedPath, g.id, null);
    }
  });

  const body = makeDropZone(el('div', { class: 'group-body' }), g.id);
  for (const path of g.paths) { const p = projectIndex.get(path); if (p) body.appendChild(projectCard(p)); }
  if (!g.paths.length) body.appendChild(el('div', { class: 'group-empty' }, 'Drag projects here'));

  wrap.append(header, body);
  return wrap;
}

function renameGroup(nameEl, g) {
  nameEl.contentEditable = 'true';
  nameEl.classList.add('editing');
  nameEl.focus();
  const range = document.createRange(); range.selectNodeContents(nameEl);
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
  const finish = (commit) => {
    nameEl.contentEditable = 'false';
    nameEl.classList.remove('editing');
    const val = nameEl.textContent.trim();
    if (commit && val) { g.name = val; saveLayout(); }
    nameEl.textContent = g.name;
    nameEl.removeEventListener('keydown', onKey);
    nameEl.removeEventListener('blur', onBlur);
  };
  const onKey = (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  };
  const onBlur = () => finish(true);
  nameEl.addEventListener('keydown', onKey);
  nameEl.addEventListener('blur', onBlur);
}

function renderSidebar() {
  vaultListEl.innerHTML = '';
  const total = layout.ungrouped.length + layout.groups.reduce((n, g) => n + g.paths.length, 0);
  if (total === 0 && !layout.groups.length) {
    vaultListEl.appendChild(el('div', { class: 'empty' },
      'No projects yet. Click "Open Folder…" below, or import a repo.'));
    return;
  }
  const ung = makeDropZone(el('div', { class: 'ungrouped' }), null);
  for (const path of layout.ungrouped) { const p = projectIndex.get(path); if (p) ung.appendChild(projectCard(p)); }
  vaultListEl.appendChild(ung);
  for (const g of layout.groups) vaultListEl.appendChild(groupEl(g));
}

// Load + render a directory's immediate children into a container.
async function loadChildren(container, dirPath, depth, changes) {
  container.dataset.loaded = '1';
  const entries = await window.gits.listDir(dirPath);
  if (!entries.length) {
    container.appendChild(el('div', { class: 'tree-empty', style: `padding-left:${depth * 14 + 24}px` }, 'empty'));
    return;
  }
  for (const entry of entries) container.appendChild(treeNode(entry, depth, changes));
}

// Map a path's git change state to a CSS class for tinting the tree.
function changeClass(p, isDir, changes) {
  if (!changes) return '';
  const t = changes.files[p];
  if (t === 'new') return ' chg-new';
  if (t === 'deleted') return ' chg-del';
  if (t === 'modified') return ' chg-mod';
  if (isDir && changes.dirSet && changes.dirSet.has(p)) return ' chg-contains';
  return '';
}

// Reload a tree container (a project root .tree or a folder's .tree-children)
// in place, re-fetching git tint — used after create / rename / delete.
async function refreshContainer(container) {
  if (!container || container.dataset.path == null) return;
  const dirPath = container.dataset.path;
  const depth = parseInt(container.dataset.depth || '0', 10);
  const treeRoot = container.classList.contains('tree') ? container : container.closest('.tree');
  const repo = treeRoot && treeRoot.dataset.path;
  let changes = null;
  if (repo && projectIndex.get(repo) && projectIndex.get(repo).git && projectIndex.get(repo).git.isRepo) {
    const c = await window.gits.changes(repo);
    changes = { files: c.files || {}, dirSet: new Set(c.dirs || []) };
  }
  container.innerHTML = '';
  container.dataset.loaded = '0';
  await loadChildren(container, dirPath, depth, changes);
}

// Right-click menu for a tree row: open, file management, ignore, diff, reveal.
function treeContextMenu(row, entry, depth) {
  row.addEventListener('contextmenu', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const treeRoot = row.closest('.tree');
    const root = treeRoot && treeRoot.dataset.path;
    const parentContainer = row.closest('.tree-children') || treeRoot;
    const items = [];

    if (entry.isDir) {
      const kids = row.nextElementSibling; // this folder's .tree-children
      const item = row.parentElement;
      const createInside = async (isDir) => {
        const name = await uiPrompt(`New ${isDir ? 'folder' : 'file'} in "${entry.name}":`, '');
        if (!name) return;
        const r = await window.gits.createEntry({ parent: entry.path, name, isDir });
        if (!r.ok) { showToast(r.error || 'Could not create.'); return; }
        item.classList.add('open');
        await refreshContainer(kids);
        if (!isDir) openEditor(r.path);
      };
      items.push({ label: 'New file…', onClick: () => createInside(false) });
      items.push({ label: 'New folder…', onClick: () => createInside(true) });
    } else {
      items.push({ label: 'Open in editor', onClick: () => openEditor(entry.path) });
      items.push({ label: 'Open in default app', onClick: () => window.gits.openItem(entry.path) });
      if (root) items.push({ label: 'View changes (diff)', onClick: () => openDiff(root, entry.path) });
    }

    items.push({ label: 'Rename…', onClick: async () => {
      const name = await uiPrompt('Rename to:', entry.name);
      if (!name || name === entry.name) return;
      const r = await window.gits.renameEntry({ path: entry.path, newName: name });
      if (!r.ok) { showToast(r.error || 'Could not rename.'); return; }
      await refreshContainer(parentContainer);
    } });
    items.push({ label: 'Delete (to Trash)', onClick: async () => {
      if (!confirm(`Move "${entry.name}" to the Trash?`)) return;
      const r = await window.gits.deleteEntry(entry.path);
      if (!r.ok) { showToast(r.error || 'Could not delete.'); return; }
      await refreshContainer(parentContainer);
    } });

    // Clipboard / file-management ops.
    items.push({ label: 'Copy', onClick: () => { treeClipboard = { path: entry.path, cut: false }; showToast(`Copied "${entry.name}"`); } });
    items.push({ label: 'Cut', onClick: () => { treeClipboard = { path: entry.path, cut: true }; showToast(`Cut "${entry.name}"`); } });
    items.push({ label: 'Duplicate', onClick: async () => {
      const r = await window.gits.pasteEntry({ src: entry.path, destDir: dirOf(entry.path), cut: false });
      if (!r.ok) { showToast(r.error || 'Could not duplicate.'); return; }
      await refreshContainer(parentContainer);
    } });
    if (entry.isDir && treeClipboard) {
      const clip = treeClipboard;
      items.push({ label: `Paste${clip.cut ? ' (move)' : ''} into "${entry.name}"`, onClick: async () => {
        const r = await window.gits.pasteEntry({ src: clip.path, destDir: entry.path, cut: clip.cut });
        if (!r.ok) { showToast(r.error || 'Could not paste.'); return; }
        const srcPath = clip.path;
        if (clip.cut) treeClipboard = null;
        row.parentElement.classList.add('open');
        await refreshContainer(row.nextElementSibling); // dest folder's children
        if (clip.cut) await refreshTreePath(srcPath);   // source removed
      } });
    }
    items.push({ label: 'Move to…', onClick: async () => {
      const dest = await window.gits.pickFolder(`Move "${entry.name}" to…`);
      if (!dest) return;
      const r = await window.gits.pasteEntry({ src: entry.path, destDir: dest, cut: true });
      if (!r.ok) { showToast(r.error || 'Could not move.'); return; }
      await refreshContainer(parentContainer);
      showToast(`Moved "${entry.name}"`);
    } });

    if (root) items.push({
      label: 'Add to .gitignore',
      onClick: async () => {
        const r = await window.gits.ignore({ repo: root, target: entry.path });
        showToast(r.ok ? `Added "${entry.name}" to .gitignore` : (r.error || 'Could not ignore.'));
      },
    });
    items.push({ label: 'Reveal in Finder', onClick: () => window.gits.reveal(entry.path) });
    showContextMenu(e.clientX, e.clientY, items);
  });
}

// Move the dragged tree item into destDir, then refresh the affected containers.
async function dropIntoDir(destDir, destRow) {
  if (!treeDrag) return;
  const { path: src, el: srcEl } = treeDrag;
  treeDrag = null;
  const r = await window.gits.moveEntry({ src, destDir });
  if (!r.ok) { showToast(r.error || 'Could not move.'); return; }
  const destKids = destRow ? destRow.nextElementSibling : null; // dir's .tree-children
  if (destRow && destRow.parentElement) destRow.parentElement.classList.add('open');
  const srcContainer = srcEl.closest('.tree-children') || srcEl.closest('.tree');
  if (destKids) await refreshContainer(destKids);
  if (srcContainer && srcContainer !== destKids) await refreshContainer(srcContainer);
}

// Make a tree row draggable; directory rows also accept drops (move into folder).
function wireTreeDnd(row, entry, isDir) {
  row.setAttribute('draggable', 'true');
  row.addEventListener('dragstart', (e) => {
    e.stopPropagation();
    treeDrag = { path: entry.path, el: row };
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', entry.path); } catch {}
  });
  row.addEventListener('dragend', (e) => { e.stopPropagation(); treeDrag = null; document.querySelectorAll('.tree-drop').forEach((x) => x.classList.remove('tree-drop')); });
  if (isDir) {
    row.addEventListener('dragover', (e) => { if (!treeDrag) return; e.preventDefault(); e.stopPropagation(); row.classList.add('tree-drop'); });
    row.addEventListener('dragleave', () => row.classList.remove('tree-drop'));
    row.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); row.classList.remove('tree-drop'); dropIntoDir(entry.path, row); });
  }
}

function treeNode(entry, depth, changes) {
  const pad = depth * 14 + 8;
  const cc = changeClass(entry.path, entry.isDir, changes);
  if (entry.isDir) {
    const item = el('div', { class: 'tree-item' });
    const row = el('div', { class: `tree-row dir${cc}`, style: `padding-left:${pad}px`, title: entry.path, 'data-path': entry.path },
      el('span', { class: 'twisty', text: '▶' }),
      el('span', { class: 'tree-name', text: entry.name }),
      runHereButton(entry.path, entry.name)
    );
    const kids = el('div', { class: 'tree-children', 'data-loaded': '0', 'data-path': entry.path, 'data-depth': String(depth + 1) });
    row.addEventListener('click', async () => {
      const opening = !item.classList.contains('open');
      item.classList.toggle('open');
      if (opening && kids.dataset.loaded === '0') await loadChildren(kids, entry.path, depth + 1, changes);
    });
    treeContextMenu(row, entry, depth);
    wireTreeDnd(row, entry, true);
    item.append(row, kids);
    return item;
  }

  // File row — left-click opens in the built-in editor; changed files get a diff button.
  const row = el('div', { class: `tree-row file${cc}`, style: `padding-left:${pad + 16}px`, title: entry.path, 'data-path': entry.path },
    el('span', { class: 'file-icon', text: '·' }),
    el('span', { class: 'tree-name', text: entry.name })
  );
  const changed = !!(changes && changes.files[entry.path]);
  if (changed) {
    const diffBtn = el('span', { class: 'run-hint diffbtn', title: 'View changes (diff)', text: '±' });
    diffBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tr = row.closest('.tree');
      if (tr) openDiff(tr.dataset.path, entry.path);
    });
    row.appendChild(diffBtn);
  }
  row.appendChild(el('span', { class: 'run-hint reveal', title: 'Reveal in Finder', text: '⤴' }));
  row.addEventListener('click', () => (IMAGE_EXTS.test(entry.name) ? openImagePreview(entry.path) : openEditor(entry.path)));
  row.querySelector('.reveal').addEventListener('click', (e) => { e.stopPropagation(); window.gits.reveal(entry.path); });
  treeContextMenu(row, entry, depth);
  wireTreeDnd(row, entry, false);
  return row;
}

async function loadProjects({ fetch = false } = {}) {
  if (fetch) refreshBtn.classList.add('spinning');
  try {
    const [projects, savedLayout] = await Promise.all([
      window.gits.listProjects({ fetch }),
      window.gits.getLayout(),
    ]);
    projectIndex = new Map(projects.map((p) => [p.path, p]));
    layout = normalizeLayout(savedLayout, projects);
    renderSidebar();
  } finally {
    refreshBtn.classList.remove('spinning');
  }
}

// ---------------------------------------------------------------------------
// Sessions / tabs / terminals
// ---------------------------------------------------------------------------

// Size a message textarea: auto-grows with content; if the user has dragged the
// resize handle (settings.composerHeight), that becomes the minimum height so
// long inputs stay visible. Caps at ~half the window, then scrolls.
function composerGrow(ta) {
  ta.style.height = 'auto';
  const hardMax = Math.min(480, Math.round(window.innerHeight * 0.5));
  const fixed = settings.composerHeight || 0;
  const h = fixed ? Math.max(fixed, Math.min(ta.scrollHeight, hardMax)) : Math.min(ta.scrollHeight, 120);
  ta.style.height = h + 'px';
}
// On newline inside a list, continue it: repeat the bullet, or increment the
// number. An empty item ends the list instead. Returns true if it handled the key.
function maybeContinueList(ta) {
  if (ta.selectionStart !== ta.selectionEnd) return false;
  const pos = ta.selectionStart;
  const lineStart = ta.value.lastIndexOf('\n', pos - 1) + 1;
  const line = ta.value.slice(lineStart, pos);
  const mBullet = line.match(/^(\s*)([-*+])\s+(.*)$/);
  const mNum = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
  const m = mBullet || mNum;
  if (!m) return false;
  if (!m[3].trim()) { // empty item — exit the list
    ta.value = ta.value.slice(0, lineStart) + ta.value.slice(pos);
    ta.setSelectionRange(lineStart, lineStart);
    ta.dispatchEvent(new Event('input'));
    return true;
  }
  const prefix = mBullet ? `${m[1]}${m[2]} ` : `${m[1]}${parseInt(m[2], 10) + 1}. `;
  const ins = '\n' + prefix;
  ta.value = ta.value.slice(0, pos) + ins + ta.value.slice(pos);
  const np = pos + ins.length;
  ta.setSelectionRange(np, np);
  ta.dispatchEvent(new Event('input'));
  return true;
}
// A drag-to-resize grip for a message box (shared by terminal + chat composers).
function makeComposerResizer(ta, grow) {
  const handle = el('div', { class: 'composer-resize', title: 'Drag to resize the message box' });
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = settings.composerHeight || ta.offsetHeight || 40;
    document.body.classList.add('row-resizing');
    const hardMax = Math.min(480, Math.round(window.innerHeight * 0.5));
    const move = (ev) => { settings.composerHeight = Math.max(40, Math.min(hardMax, startH + (startY - ev.clientY))); grow(); };
    const up = () => { document.body.classList.remove('row-resizing'); document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); saveSettings(); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
  return handle;
}

// A friendly input bar for a session: a normal multi-line text box (full
// modern editing, scoped Cmd+A) plus quick-command buttons. Enter sends the
// text to the PTY; Shift+Enter inserts a newline. The xterm above stays fully
// interactive for power users and TUI prompts.
function buildComposer(id, term) {
  const textarea = el('textarea', {
    class: 'composer-text',
    rows: '1',
    // Off: macOS autocorrect/suggestions can swallow the Enter key (accepting a
    // suggestion instead of submitting) — the cause of "Enter sometimes doesn't run".
    spellcheck: 'false',
    autocorrect: 'off',
    autocapitalize: 'off',
    autocomplete: 'off',
    placeholder: 'Type a message · Enter sends · Shift+Enter newline · ↑↓ history · Ctrl+C/L',
  });

  // Per-session command history (like a shell): Up/Down recall what you sent.
  const history = [];
  let histIdx = 0;   // index into history; === length means "new line"
  let draft = '';    // stashes the in-progress line while browsing history

  const autoGrow = () => composerGrow(textarea);

  const caretToEnd = () => {
    const n = textarea.value.length;
    textarea.selectionStart = textarea.selectionEnd = n;
  };
  const caretOnFirstLine = () => textarea.value.lastIndexOf('\n', textarea.selectionStart - 1) === -1;
  const caretOnLastLine = () => textarea.value.indexOf('\n', textarea.selectionEnd) === -1;

  const send = () => {
    const text = textarea.value;
    if (text.length) {
      // Send the text and the Enter as two separate writes, so full-screen TUIs
      // (e.g. Claude Code) register Enter as a discrete *submit* keypress instead
      // of folding it into the input as a literal newline — the "typed but didn't
      // run" bug. A small gap guarantees they arrive as two reads.
      window.gits.ptyInput(id, text);
      setTimeout(() => window.gits.ptyInput(id, '\r'), 12);
    } else {
      window.gits.ptyInput(id, '\r');
    }
    if (text.trim() && history[history.length - 1] !== text) history.push(text);
    histIdx = history.length;
    draft = '';
    textarea.value = '';
    autoGrow();
  };

  const recallUp = () => {
    if (!history.length || histIdx === 0) return;
    if (histIdx === history.length) draft = textarea.value;
    histIdx--;
    textarea.value = history[histIdx];
    caretToEnd(); autoGrow();
  };
  const recallDown = () => {
    if (histIdx >= history.length) return;
    histIdx++;
    textarea.value = histIdx === history.length ? draft : history[histIdx];
    caretToEnd(); autoGrow();
  };

  const doClear = () => {
    textarea.value = '';
    autoGrow();
    window.gits.ptyInput(id, '\x15\x0c'); // Ctrl+U (kill line) + Ctrl+L (clear screen)
    textarea.focus();
  };

  textarea.addEventListener('input', autoGrow);
  textarea.addEventListener('keydown', (e) => {
    // Ignore keys that arrive mid-composition (IME / macOS suggestion popup),
    // so an Enter that's accepting a suggestion doesn't get mis-handled.
    if (e.isComposing || e.keyCode === 229) return;
    // Enter sends; Shift+Enter inserts a newline.
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); return; }
    // Up/Down browse history (only when the caret is on the first/last line,
    // so multi-line editing still works normally).
    if (e.key === 'ArrowUp' && caretOnFirstLine()) { e.preventDefault(); recallUp(); return; }
    if (e.key === 'ArrowDown' && caretOnLastLine()) { e.preventDefault(); recallDown(); return; }
    // Ctrl+L clears (line + screen + box), like a real terminal.
    if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); doClear(); return; }
    // Ctrl+C interrupts the process when nothing is selected (else native copy).
    if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
      if (textarea.selectionStart === textarea.selectionEnd) { e.preventDefault(); window.gits.ptyInput(id, '\x03'); }
      return;
    }
    // Ctrl+A / Ctrl+E (start/end of line) and Ctrl+U (kill to start) are handled
    // natively by macOS text fields, so they already feel like a terminal.
  });

  // Paste an image from the clipboard → save it as a file in the session's
  // folder and drop its path into the composer (great for screenshots).
  textarea.addEventListener('paste', async (e) => {
    const items = (e.clipboardData && e.clipboardData.items) || [];
    for (const it of items) {
      if (it.kind === 'file' && it.type && it.type.startsWith('image/')) {
        e.preventDefault();
        const file = it.getAsFile();
        if (!file) return;
        const bytes = new Uint8Array(await file.arrayBuffer());
        const ext = (it.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg');
        const sess = sessions.get(id);
        const r = await window.gits.saveImage({ dir: sess ? sess.cwd : undefined, base64: bytesToBase64(bytes), ext });
        if (r.ok) {
          insert((/\s/.test(r.path) ? `"${r.path}"` : r.path) + ' ');
          showToast(`Saved image → ${basename(r.path)}`);
        } else {
          showToast(r.error || 'Could not save the image.');
        }
        return;
      }
    }
  });

  // Insert text (e.g. a dropped file path) at the cursor.
  const insert = (text) => {
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? textarea.value.length;
    textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
    const pos = start + text.length;
    textarea.selectionStart = textarea.selectionEnd = pos;
    autoGrow();
    textarea.focus();
  };

  const sendBtn = el('button', { class: 'send-btn', title: 'Send (Enter)', text: 'Send ▸' });
  sendBtn.addEventListener('click', () => { send(); textarea.focus(); });

  // Quick commands — the awkward-in-a-bare-terminal essentials.
  const quickDefs = [
    { label: 'Esc', seq: '\x1b', title: 'Escape — cancel / back out (e.g. in Claude)' },
    { label: 'Stop', seq: '\x03', title: 'Ctrl+C — interrupt what is running' },
    { label: '↑ History', seq: '\x1b[A', title: 'Previous command' },
  ];
  const quick = el('div', { class: 'quick-row' });
  for (const q of quickDefs) {
    const b = el('button', { class: 'quick-btn', text: q.label, title: q.title });
    b.addEventListener('click', () => { window.gits.ptyInput(id, q.seq); term.focus(); });
    quick.appendChild(b);
  }
  // Clear: wipe the composer box AND clear the terminal's current input line
  // (Ctrl+U) and screen (Ctrl+L) — fixes "stacked" text on the prompt.
  const clearBtn = el('button', { class: 'quick-btn', text: 'Clear', title: 'Clear the input line, screen, and this box (Ctrl+L)' });
  clearBtn.addEventListener('click', () => { doClear(); });
  quick.appendChild(clearBtn);

  const inputRow = el('div', { class: 'composer-input' }, textarea, sendBtn);
  const root = el('div', { class: 'composer' }, makeComposerResizer(textarea, autoGrow), quick, inputRow);
  return { el: root, textarea, insert };
}

// Cap concurrent sessions so the app stays responsive. Each session is a real
// process + terminal; this keeps memory/CPU bounded. Configurable.
const MAX_SESSIONS = 24;

async function openSession(cwd, label, aiOverride) {
  if (sessions.size >= MAX_SESSIONS) {
    showToast(`Session limit reached (${MAX_SESSIONS}). Close a tab to open another — this keeps Gitsidian stable.`);
    return;
  }
  const ai = aiOverride || aiSelect.value || 'shell';
  const info = await window.gits.ptyCreate({ cwd, ai });
  const { id, aiName } = info;

  const host = el('div', { class: `term-host${settings.italic ? ' term-italic' : ''}` });

  const term = new Terminal({
    theme: termTheme(),
    fontFamily: 'SF Mono, ui-monospace, Menlo, Monaco, monospace',
    fontSize: settings.fontSize,
    fontWeight: settings.bold ? 'bold' : 'normal',
    cursorBlink: true,
    allowProposedApi: true,
    scrollback: settings.scrollback,
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open(host);
  term.onData((d) => window.gits.ptyInput(id, d));

  const composer = buildComposer(id, term);
  const pane = el('div', { class: 'term-pane', 'data-id': id }, host, composer.el);
  terminalsEl.appendChild(pane);

  // Drop a folder here to open a terminal there; drop a file to insert its path.
  pane.addEventListener('dragover', (e) => { if (isExternalDrag(e)) { e.preventDefault(); pane.classList.add('drop'); } });
  pane.addEventListener('dragleave', (e) => { if (!pane.contains(e.relatedTarget)) pane.classList.remove('drop'); });
  pane.addEventListener('drop', (e) => {
    if (!isExternalDrag(e)) return;
    e.preventDefault();
    e.stopPropagation(); // we handle it here; don't also fire the document handler
    pane.classList.remove('drop');
    handleExternalDrop(e, session);
  });

  const session = {
    id, kind: 'term', term, fit, host, pane, cwd, ai, aiName, label,
    composerText: composer.textarea, composerInsert: composer.insert,
    status: 'busy', unread: false, tabEl: null,
  };
  sessions.set(id, session);
  // Keep xterm's rows/viewport in sync with the real visible area whenever it
  // changes (tab shown, composer grows, split/sidebar drag, fonts settle). Fixes
  // the "can't scroll to the very bottom until you press Down" dimension desync.
  let roTimer = null;
  const ro = new ResizeObserver(() => {
    if (host.clientHeight <= 4 || host.clientWidth <= 4) return; // skip while hidden
    clearTimeout(roTimer);
    roTimer = setTimeout(() => {
      try { fit.fit(); window.gits.ptyResize(id, term.cols, term.rows); } catch {}
    }, 50);
  });
  ro.observe(host);
  session.ro = ro;
  attachTab(session, { tag: shortAi(aiName), tagClass: 'tab-ai', tabTitle: cwd });

  welcomeEl.classList.add('hidden');
  activate(id);
  fitAndResize(session);
  persistSession();
  return id;
}

// Build the tab for a session (terminal, editor, or diff) and wire click /
// close / double-click-rename. Shared so every pane gets identical behaviour.
function attachTab(session, { tag, tagClass = 'tab-ai', tabTitle = '' } = {}) {
  const tab = el('div', { class: `tab${session.kind !== 'term' ? ' ' + session.kind : ''}`, 'data-id': session.id, title: tabTitle },
    el('span', { class: 'tab-status' }),
    el('span', { class: 'tab-title', text: session.label }),
    el('span', { class: tagClass, text: tag }),
    el('span', { class: 'tab-close', text: '×' })
  );
  tab.addEventListener('click', (e) => {
    if (e.target.classList.contains('tab-close')) { closeSession(session.id); return; }
    // Shift-click holds tabs in a selection (not a group yet).
    if (e.shiftKey) { toggleSelect(session.id); return; }
    clearSelection();
    activate(session.id);
  });
  // Right-click a tab → grouping options (or act on the held selection).
  tab.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (selectedIds.has(session.id) && selectedIds.size >= 2) {
      showContextMenu(e.clientX, e.clientY, [
        { label: `Create group from ${selectedIds.size} tabs…`, onClick: () => createGroupFromSelection() },
        { label: 'Clear selection', onClick: () => clearSelection() },
      ]);
    } else {
      showContextMenu(e.clientX, e.clientY, tabMenuItems(session));
    }
  });
  const titleEl = tab.querySelector('.tab-title');
  titleEl.title = 'Double-click to rename · Shift-click to select · drag to reorder';
  titleEl.addEventListener('dblclick', (e) => { e.stopPropagation(); startRename(titleEl, session); });
  // Drag to reorder tabs in the strip (or drag a held selection together to group).
  tab.draggable = true;
  tab.addEventListener('dragstart', (e) => {
    if (titleEl.classList.contains('editing')) { e.preventDefault(); return; }
    tabDragId = session.id;
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', 'tab:' + session.id); } catch {}
    tab.classList.add('tab-dragging');
  });
  tab.addEventListener('dragend', () => { tabDragId = null; tab.classList.remove('tab-dragging'); clearTabDropMarks(); });
  // Left/right edge → reorder; centre → group the two together.
  const dropZone = (e, r) => { const x = e.clientX - r.left; return x < r.width * 0.32 ? 'before' : x > r.width * 0.68 ? 'after' : 'group'; };
  tab.addEventListener('dragover', (e) => {
    if (!tabDragId || tabDragId === session.id) return;
    e.preventDefault();
    const z = dropZone(e, tab.getBoundingClientRect());
    clearTabDropMarks();
    tab.classList.add(z === 'group' ? 'drop-group' : z === 'after' ? 'drop-after' : 'drop-before');
  });
  tab.addEventListener('drop', (e) => {
    if (!tabDragId) return;
    e.preventDefault(); e.stopPropagation();
    // Dragging a held selection (2+) anywhere → make a group from it.
    if (selectionDragging()) { tabDragId = null; clearTabDropMarks(); createGroupFromSelection(); return; }
    if (tabDragId === session.id) { tabDragId = null; clearTabDropMarks(); return; }
    const draggedId = tabDragId; tabDragId = null;
    const z = dropZone(e, tab.getBoundingClientRect());
    clearTabDropMarks();
    if (z === 'group') { groupDragWith(draggedId, session.id); return; }
    const dragged = sessions.get(draggedId);
    if (dragged && dragged.tabEl) {
      tabbar.insertBefore(dragged.tabEl, z === 'after' ? tab.nextSibling : tab);
      appendTabControls();   // keep +/group at the end
      syncSessionsOrder();   // make ⌘1–9 + restore follow the new visual order
    }
  });
  session.tabEl = tab;
  tabbar.appendChild(tab);
  appendTabControls(); // keep "+" and group controls at the end of the strip
  return tab;
}

function clearTabDropMarks() {
  for (const t of tabbar.querySelectorAll('.drop-before, .drop-after, .drop-group, .chip-drop')) {
    t.classList.remove('drop-before', 'drop-after', 'drop-group', 'chip-drop');
  }
}
// Rebuild the sessions Map to match the tab strip's visual order.
function syncSessionsOrder() {
  const ordered = [...tabbar.querySelectorAll('.tab[data-id]')]
    .map((t) => t.getAttribute('data-id')).filter((id) => sessions.has(id));
  const merged = new Map();
  for (const id of ordered) merged.set(id, sessions.get(id));
  for (const [id, s] of sessions) if (!merged.has(id)) merged.set(id, s); // safety net
  sessions.clear();
  for (const [id, s] of merged) sessions.set(id, s);
  persistSession();
}

function shortAi(name) {
  return name.replace(' Code', '').replace(' (OpenAI)', '').replace(' CLI', '').replace(' (shell)', '');
}

function activate(id) {
  if (!sessions.has(id)) return;
  activeId = id;
  const g = groupOf(id);
  activeGroupId = g ? g.id : null;
  applyLayout();
  const s = sessions.get(id);
  if (s) {
    s.unread = false; if (s.tabEl) s.tabEl.classList.remove('unread');
    if (s.kind === 'chat' && !teamAdding) markSeen(); // clear the unread badge when you look at chat
    focusSession(s);
    refreshGroupBadges();
  }
}

// Show a whole group's grid; focus its first live member.
function activateGroup(gid) {
  const g = groups.find((x) => x.id === gid);
  if (!g) return;
  g.members = g.members.filter((id) => sessions.has(id));
  if (g.members.length < 2) { dissolveGroup(g); return; }
  activeId = g.members.includes(activeId) ? activeId : g.members[0];
  activeGroupId = gid;
  applyLayout();
  focusSession(sessions.get(activeId));
}

function focusSession(s) {
  if (!s) return;
  if (s.cm) { requestAnimationFrame(() => { try { s.cm.refresh(); s.cm.focus(); } catch {} }); }
  else if (s.composerText) s.composerText.focus();
  else if (s.focusEl) s.focusEl.focus();
}

function paneKindLabel(s) {
  if (!s) return '';
  if (s.kind === 'term') return 'terminal';
  if (s.kind === 'editor') return 'editor';
  return s.kind;
}
// Refit/refresh a pane after a layout change, by kind.
function refreshPane(s) {
  if (!s) return;
  if (s.fit) fitAndResize(s);                                   // terminal (xterm)
  else if (s.cm) requestAnimationFrame(() => { try { s.cm.refresh(); } catch {} }); // editor (CodeMirror)
}

// THE layout authority: show either a single active pane, or the active group's
// 2–4 panes in a grid. Keeps tab/chip active+hidden states in sync.
function applyLayout() {
  const group = activeGroupId ? groups.find((g) => g.id === activeGroupId) : null;
  const members = group ? group.members.filter((id) => sessions.has(id)) : [];
  if (group && members.length < 2) { dissolveGroup(group); return; }

  for (const s of sessions.values()) {
    s.pane.classList.remove('active', 'grid-cell', 'focused');
    s.pane.style.gridArea = '';
    if (s.cellTag) s.cellTag.classList.add('hidden');
  }
  terminalsEl.classList.remove('grouped');
  terminalsEl.removeAttribute('data-count');
  terminalsEl.style.gridTemplateColumns = '';
  terminalsEl.style.gridTemplateRows = '';

  if (group) {
    terminalsEl.classList.add('grouped');
    const n = members.length;
    const cols = group.cols ?? 50, rows = group.rows ?? 50;
    terminalsEl.dataset.count = String(n);
    terminalsEl.style.gridTemplateColumns = `${cols}% ${100 - cols}%`;
    terminalsEl.style.gridTemplateRows = n <= 2 ? '1fr' : `${rows}% ${100 - rows}%`;
    members.forEach((id, i) => {
      const s = sessions.get(id);
      s.pane.classList.add('grid-cell');
      s.pane.style.gridArea = GRID_AREAS[n][i];
      ensureCellTag(s);
      s.cellTag.classList.remove('hidden');
      if (id === activeId) s.pane.classList.add('focused');
      refreshPane(s);
    });
    positionDividers(group, n);
  } else {
    positionDividers(null);
    const s = sessions.get(activeId);
    if (s) { s.pane.classList.add('active'); refreshPane(s); }
  }
  updateTabActive();
  renderGroupChips();
  refreshGroupBadges();
}

// Draggable dividers between grid cells (resize X / Y inside the quadrant).
function positionDividers(group, n) {
  if (!group) { gridVDivider.classList.add('hidden'); gridHDivider.classList.add('hidden'); return; }
  const cols = group.cols ?? 50, rows = group.rows ?? 50;
  gridVDivider.classList.remove('hidden');
  gridVDivider.style.left = cols + '%';
  gridVDivider.style.height = (n === 3 ? rows + '%' : '100%'); // 3-pane: bottom spans, so only top row
  if (n >= 3) { gridHDivider.classList.remove('hidden'); gridHDivider.style.top = rows + '%'; }
  else gridHDivider.classList.add('hidden');
}

function updateTabActive() {
  for (const [sid, s] of sessions) {
    if (!s.tabEl) continue;
    const g = groupOf(sid);
    // Grouped tabs hide inside the chip unless the group is expanded.
    s.tabEl.classList.toggle('hidden', !!g && !g.expanded);
    s.tabEl.classList.toggle('in-group', !!g);
    s.tabEl.classList.toggle('active', sid === activeId && (!activeGroupId || (g && g.id === activeGroupId)));
  }
  for (const [gid, chip] of groupChipEls) chip.classList.toggle('active', gid === activeGroupId);
}

// Small overlay on each grid cell: label + close; click to focus; drag to rearrange.
function ensureCellTag(s) {
  if (s.cellTag) { s.cellTag.querySelector('.cell-tag-label').textContent = s.label; return; }
  const label = el('span', { class: 'cell-tag-label', text: s.label });
  const close = el('span', { class: 'cell-tag-close', text: '×', title: 'Close this tab' });
  const tag = el('div', { class: 'cell-tag hidden', draggable: 'true', title: 'Drag to another quadrant to swap' }, label, close);
  tag.addEventListener('mousedown', (e) => {
    if (e.target === close) { e.stopPropagation(); closeSession(s.id); return; }
    activate(s.id);
  });
  tag.addEventListener('dragstart', (e) => {
    cellDragId = s.id; e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', 'cell:' + s.id); } catch {}
    s.pane.classList.add('cell-dragging');
  });
  tag.addEventListener('dragend', () => { cellDragId = null; s.pane.classList.remove('cell-dragging'); s.pane.classList.remove('cell-drop'); });
  // A quadrant accepts EITHER a dragged cell (swap) OR a strip tab (place it here).
  const incoming = () => (cellDragId && cellDragId !== s.id) || (tabDragId && tabDragId !== s.id);
  s.pane.addEventListener('dragover', (e) => { if (activeGroupId && incoming()) { e.preventDefault(); s.pane.classList.add('cell-drop'); } });
  s.pane.addEventListener('dragleave', (e) => { if (!s.pane.contains(e.relatedTarget)) s.pane.classList.remove('cell-drop'); });
  s.pane.addEventListener('drop', (e) => {
    if (!activeGroupId || !incoming()) return;
    e.preventDefault(); e.stopPropagation();
    s.pane.classList.remove('cell-drop');
    if (cellDragId && cellDragId !== s.id) { const d = cellDragId; cellDragId = null; swapMembers(d, s.id); return; }
    if (tabDragId && tabDragId !== s.id) { const d = tabDragId; tabDragId = null; clearTabDropMarks(); placeTabInQuadrant(d, s.id); }
  });
  s.pane.appendChild(tag);
  s.cellTag = tag;
}
// Drop a strip tab onto a quadrant → it lives in that slot. In-group tabs swap;
// outside tabs join the group at that position (respecting the 4-cap).
function placeTabInQuadrant(tabId, targetId) {
  const g = activeGroupId ? groups.find((x) => x.id === activeGroupId) : null;
  if (!g || tabId === targetId || g.members.indexOf(targetId) < 0) return;
  const dg = groupOf(tabId);
  if (dg && dg.id === g.id) { swapMembers(tabId, targetId); return; } // already here → swap slots
  if (g.members.filter((m) => sessions.has(m)).length >= MAX_GROUP) { showToast(`A group holds up to ${MAX_GROUP} tabs.`); return; }
  if (dg) dg.members = dg.members.filter((m) => m !== tabId);
  const arr = g.members.slice();
  arr.splice(arr.indexOf(targetId), 0, tabId); // insert at the dropped slot
  g.members = arr;
  cleanupEmptyGroup(dg);
  activeId = tabId;
  activeGroupId = g.id;
  applyLayout();
  persistSession();
}
// Swap two members' positions within the active group (drag-arrange quadrants).
function swapMembers(aId, bId) {
  const g = activeGroupId ? groups.find((x) => x.id === activeGroupId) : null;
  if (!g) return;
  const ai = g.members.indexOf(aId), bi = g.members.indexOf(bId);
  if (ai < 0 || bi < 0) return;
  [g.members[ai], g.members[bi]] = [g.members[bi], g.members[ai]];
  applyLayout();
  persistSession();
}

// ---- Multi-select (shift-click) → create a group ----
// Shift-click tabs to hold 2–4, then right-click → Create group, click the group
// button, or drag the held tabs together. It's a selection, not a group, until then.
function clearSelection() { if (selectedIds.size) { selectedIds.clear(); updateSelectionUI(); } }
function updateSelectionUI() {
  for (const [sid, s] of sessions) s.tabEl && s.tabEl.classList.toggle('selected', selectedIds.has(sid));
  groupBtn.classList.toggle('on', selectedIds.size >= 2);
}
function toggleSelect(id) {
  if (groupOf(id)) { showToast('That tab is already in a group.'); return; }
  // Seed with the active tab so "active tab + shift-click another" holds both.
  if (selectedIds.size === 0 && activeId && activeId !== id && !groupOf(activeId)) selectedIds.add(activeId);
  if (selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id);
  updateSelectionUI();
}
const selectionDragging = () => selectedIds.size >= 2 && tabDragId && selectedIds.has(tabDragId);
async function createGroupFromSelection() {
  const ids = [...selectedIds].filter((id) => sessions.has(id) && !groupOf(id));
  if (ids.length < 2) { showToast('Shift-click 2–4 tabs to hold them, then group.'); return; }
  if (ids.length > MAX_GROUP) { showToast(`A group holds up to ${MAX_GROUP} tabs.`); return; }
  const name = await uiPrompt('Name this group:', `Group ${groups.length + 1}`, 'e.g. Cockpit');
  if (name === null) return;
  clearSelection();
  createGroup(ids, name.trim() || `Group ${groups.length + 1}`);
}
function createGroup(ids, name) {
  const g = { id: `tg${++paneGroupSeq}`, name, members: ids.slice(0, MAX_GROUP), cols: 50, rows: 50, expanded: false };
  groups.push(g);
  activeGroupId = g.id;
  activeId = g.members[0];
  applyLayout();
  focusSession(sessions.get(activeId));
  persistSession();
}
// Shift-click path: pair two tabs, or add a tab to the active group.
function dissolveGroup(g) {
  const survivor = g.members.filter((id) => sessions.has(id))[0] || null;
  groups = groups.filter((x) => x.id !== g.id);
  const chip = groupChipEls.get(g.id); if (chip) { chip.remove(); groupChipEls.delete(g.id); }
  if (activeGroupId === g.id) {
    activeGroupId = null;
    if (survivor) activate(survivor);
    else { const next = [...sessions.keys()].pop(); if (next) activate(next); else { activeId = null; welcomeEl.classList.remove('hidden'); applyLayout(); } }
  } else applyLayout();
  persistSession();
}
function ungroup(gid) {
  const g = groups.find((x) => x.id === gid); if (!g) return;
  const first = g.members.filter((id) => sessions.has(id))[0];
  groups = groups.filter((x) => x.id !== gid);
  const chip = groupChipEls.get(gid); if (chip) { chip.remove(); groupChipEls.delete(gid); }
  if (activeGroupId === gid) activeGroupId = null;
  if (first) activate(first); else applyLayout();
  persistSession();
}
function removeFromGroup(id) {
  const g = groupOf(id); if (!g) return;
  g.members = g.members.filter((m) => m !== id);
  if (g.members.filter((m) => sessions.has(m)).length < 2) dissolveGroup(g);
  else { if (activeGroupId === g.id && activeId === id) activeId = g.members[0]; applyLayout(); }
  persistSession();
}
// Quietly remove a group that dropped below 2 members (no re-activation).
function cleanupEmptyGroup(g) {
  if (!g || g.members.filter((m) => sessions.has(m)).length >= 2) return;
  groups = groups.filter((x) => x.id !== g.id);
  const chip = groupChipEls.get(g.id); if (chip) { chip.remove(); groupChipEls.delete(g.id); }
  if (activeGroupId === g.id) activeGroupId = null;
}
// Add a tab to an existing group (drag-to-group / drop-on-chip).
function addToGroup(draggedId, g) {
  if (!g || !sessions.has(draggedId)) return;
  const dg = groupOf(draggedId);
  if (dg && dg.id === g.id) { activateGroup(g.id); return; }
  if (g.members.filter((m) => sessions.has(m)).length >= MAX_GROUP) { showToast(`A group holds up to ${MAX_GROUP} tabs.`); return; }
  if (dg) dg.members = dg.members.filter((m) => m !== draggedId);
  g.members.push(draggedId);
  cleanupEmptyGroup(dg);
  activateGroup(g.id);
  persistSession();
}
// Drop one tab onto another's centre → group them (join target's group or make a new pair).
function groupDragWith(draggedId, targetId) {
  if (draggedId === targetId || !sessions.has(targetId)) return;
  const tg = groupOf(targetId);
  if (tg) { addToGroup(draggedId, tg); return; }
  const dg = groupOf(draggedId);
  if (dg) dg.members = dg.members.filter((m) => m !== draggedId);
  cleanupEmptyGroup(dg);
  createGroup([targetId, draggedId], `Group ${groups.length + 1}`);
}
async function renameGroup(gid) {
  const g = groups.find((x) => x.id === gid); if (!g) return;
  const name = await uiPrompt('Rename group:', g.name);
  if (name === null) return;
  g.name = name.trim() || g.name;
  renderGroupChips(); persistSession();
}
// Group chips at the start of the tab strip.
function renderGroupChips() {
  for (const [gid, chip] of [...groupChipEls]) {
    if (!groups.find((g) => g.id === gid)) { chip.remove(); groupChipEls.delete(gid); }
  }
  for (const g of groups) {
    const n = g.members.filter((id) => sessions.has(id)).length;
    let chip = groupChipEls.get(g.id);
    if (!chip) {
      chip = el('div', { class: 'group-chip' },
        el('span', { class: 'group-chip-icon', html: GRID_SVG, title: 'Show/hide this group’s tabs' }),
        el('span', { class: 'group-chip-name' }),
        el('span', { class: 'group-chip-count' }),
        el('span', { class: 'group-chip-dot' }),
        el('span', { class: 'tab-close group-chip-close', text: '×', title: 'Ungroup (keeps the tabs)' }));
      const toggleExpand = () => { g.expanded = !g.expanded; updateTabActive(); renderGroupChips(); };
      chip.addEventListener('click', (e) => {
        if (e.target.closest('.group-chip-close')) { ungroup(g.id); return; }
        if (e.target.closest('.group-chip-icon')) { e.stopPropagation(); toggleExpand(); return; } // SVG = expand/collapse
        activateGroup(g.id); // body = open the quadrant grid
      });
      chip.addEventListener('dblclick', (e) => { e.stopPropagation(); renameGroup(g.id); });
      // Drag a tab onto a group chip → add it to that group.
      chip.addEventListener('dragover', (e) => { if (tabDragId && !g.members.includes(tabDragId)) { e.preventDefault(); clearTabDropMarks(); chip.classList.add('chip-drop'); } });
      chip.addEventListener('dragleave', () => chip.classList.remove('chip-drop'));
      chip.addEventListener('drop', (e) => {
        if (!tabDragId) return;
        e.preventDefault(); e.stopPropagation();
        if (selectionDragging()) { tabDragId = null; clearTabDropMarks(); createGroupFromSelection(); return; }
        const id = tabDragId; tabDragId = null; clearTabDropMarks();
        addToGroup(id, g);
      });
      chip.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        showContextMenu(e.clientX, e.clientY, [
          { label: g.expanded ? 'Collapse group tabs' : 'Expand group tabs', onClick: () => { g.expanded = !g.expanded; updateTabActive(); renderGroupChips(); } },
          { label: 'Rename group…', onClick: () => renameGroup(g.id) },
          { label: 'Ungroup (keep tabs)', onClick: () => ungroup(g.id) },
        ]);
      });
      groupChipEls.set(g.id, chip);
    }
    chip.querySelector('.group-chip-name').textContent = g.name;
    chip.querySelector('.group-chip-count').textContent = String(n);
    chip.querySelector('.group-chip-icon').title = g.expanded ? 'Hide this group’s tabs' : 'Show this group’s tabs';
    chip.classList.toggle('active', g.id === activeGroupId);
    chip.classList.toggle('expanded', !!g.expanded);
  }
  layoutTabStrip();
  refreshGroupBadges();
}
// Sensible strip order: each group's chip (+ its tabs when expanded), then the
// ungrouped tabs, then the +/group controls. Collapsed groups show only the chip.
function layoutTabStrip() {
  for (const g of groups) {
    const chip = groupChipEls.get(g.id);
    if (chip) tabbar.appendChild(chip);
    // Members sit right after their chip; collapsed ones are display:none via .hidden.
    for (const id of g.members) { const s = sessions.get(id); if (s && s.tabEl) tabbar.appendChild(s.tabEl); }
  }
  for (const [id, s] of sessions) { if (s.tabEl && !groupOf(id)) tabbar.appendChild(s.tabEl); }
  appendTabControls();
}
// Right-click menu for an individual tab (grouping actions).
function tabMenuItems(session) {
  const items = [];
  const g = groupOf(session.id);
  if (g) {
    items.push({ label: `Show group "${g.name}"`, onClick: () => activateGroup(g.id) });
    items.push({ label: 'Remove from group', onClick: () => removeFromGroup(session.id) });
    items.push({ label: 'Rename group…', onClick: () => renameGroup(g.id) });
    return items;
  }
  const ag = groupOf(activeId);
  if (activeId && activeId !== session.id && ag && ag.members.length < MAX_GROUP) {
    items.push({ label: `Add to group "${ag.name}"`, onClick: () => { ag.members.push(session.id); activateGroup(ag.id); persistSession(); } });
  }
  if (activeId && activeId !== session.id && !ag) {
    items.push({ label: `Group with "${(sessions.get(activeId) || {}).label || 'current tab'}"`, onClick: () => createGroup([activeId, session.id], `Group ${groups.length + 1}`) });
  }
  items.push({ label: 'Tip: Shift-click tabs to select, then group', onClick: () => showToast('Shift-click 2–4 tabs to hold them, then right-click → Create group (or click the grid button).') });
  return items;
}

function fitAndResize(s) {
  requestAnimationFrame(() => {
    try {
      s.fit.fit();
      window.gits.ptyResize(s.id, s.term.cols, s.term.rows);
    } catch {}
  });
}

function closeSession(id) {
  const s = sessions.get(id);
  if (!s) return;
  // Guard against losing work: a running process, or an editor with unsaved edits.
  if (s.kind === 'term' && s.status === 'busy' && !confirm(`"${s.label}" is still running. Close it and stop the process?`)) return;
  if (s.kind === 'editor' && s.dirty && !confirm(`"${s.label}" has unsaved changes. Close without saving?`)) return;
  if (s.ro) { try { s.ro.disconnect(); } catch {} }
  if (s.kind === 'term') { window.gits.ptyKill(id); if (s.term) s.term.dispose(); }
  if (s.kind === 'editor') window.gits.watchRemove(s.filePath);
  if (s.kind === 'chat') { teamListEl = null; teamChatId = null; teamChannelsEl = null; teamMainEl = null; teamAdding = false; } // bg poller keeps the badge live
  s.pane.remove();
  s.tabEl.remove();
  sessions.delete(id);
  if (selectedIds.delete(id)) updateSelectionUI();
  // If it was in a group, drop it; a group below 2 members dissolves.
  const g = groupOf(id);
  if (g) {
    g.members = g.members.filter((m) => m !== id);
    if (g.members.filter((m) => sessions.has(m)).length < 2) {
      groups = groups.filter((x) => x.id !== g.id);
      const chip = groupChipEls.get(g.id); if (chip) { chip.remove(); groupChipEls.delete(g.id); }
      if (activeGroupId === g.id) activeGroupId = null;
    }
  }
  if (activeId === id || (activeGroupId && !groups.find((x) => x.id === activeGroupId))) {
    if (activeGroupId) activeGroupId = null;
    const next = (g && g.members.filter((m) => sessions.has(m))[0]) || [...sessions.keys()].pop();
    if (next) activate(next);
    else { activeId = null; welcomeEl.classList.remove('hidden'); applyLayout(); }
  } else {
    applyLayout();
  }
  persistSession();
}

// Inline-rename a tab: double-click the title to edit, Enter to save, Esc to cancel.
function startRename(titleEl, session) {
  const old = session.label;
  titleEl.contentEditable = 'true';
  titleEl.classList.add('editing');
  titleEl.focus();
  const range = document.createRange();
  range.selectNodeContents(titleEl);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  const finish = (commit) => {
    titleEl.contentEditable = 'false';
    titleEl.classList.remove('editing');
    const val = titleEl.textContent.trim();
    if (commit && val) { session.label = val; titleEl.textContent = val; }
    else { titleEl.textContent = old; }
    titleEl.removeEventListener('keydown', onKey);
    titleEl.removeEventListener('blur', onBlur);
  };
  const onKey = (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  };
  const onBlur = () => finish(true);
  titleEl.addEventListener('keydown', onKey);
  titleEl.addEventListener('blur', onBlur);
}

function setStatus(id, status) {
  const s = sessions.get(id);
  if (!s) return;
  s.status = status;
  s.tabEl.classList.remove('busy', 'idle', 'dead');
  s.tabEl.classList.add(status);
}

// File types we preview as images rather than opening in the text editor.
const IMAGE_EXTS = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i;
const MD_EXTS = /\.(md|markdown|mdx)$/i;

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// A compact, safe Markdown → HTML renderer (escapes first, then formats). Covers
// headings, bold/italic/code, fenced code, links, images (as labels), lists,
// blockquotes, and rules — enough for a readable preview, esp. Obsidian notes.
function renderMarkdown(src) {
  const lines = escapeHtml(src || '').replace(/\r\n?/g, '\n').split('\n');
  const inline = (t) => t
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<span class="md-img">[image: $1]</span>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    // Autolink bare URLs (skip ones already inside a markdown link's href/text).
    .replace(/(^|[^"(>])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2">$2</a>');
  let html = '', i = 0, list = null;
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      closeList(); i++; let code = '';
      while (i < lines.length && !/^```/.test(lines[i])) { code += lines[i] + '\n'; i++; }
      i++; html += `<pre class="md-code">${code}</pre>`; continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { closeList(); html += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`; i++; continue; }
    if (/^\s*[-*+]\s+/.test(line)) { if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(line.replace(/^\s*[-*+]\s+/, ''))}</li>`; i++; continue; }
    if (/^\s*\d+\.\s+/.test(line)) { if (list !== 'ol') { closeList(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(line.replace(/^\s*\d+\.\s+/, ''))}</li>`; i++; continue; }
    // Blockquote — note the source is already HTML-escaped, so '>' is '&gt;'.
    if (/^\s*&gt;\s?/.test(line)) {
      closeList();
      const q = [];
      while (i < lines.length && /^\s*&gt;\s?/.test(lines[i])) { q.push(inline(lines[i].replace(/^\s*&gt;\s?/, ''))); i++; }
      html += `<blockquote>${q.join('<br>')}</blockquote>`;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { closeList(); html += '<hr/>'; i++; continue; }
    if (!line.trim()) { closeList(); i++; continue; }
    closeList(); html += `<p>${inline(line)}</p>`; i++;
  }
  closeList();
  return html;
}

// ---------------------------------------------------------------------------
// Image preview — open an image file in a read-only pane (via a data URL).
// ---------------------------------------------------------------------------
let imageSeq = 0;
async function openImagePreview(filePath) {
  for (const [sid, s] of sessions) {
    if (s.kind === 'image' && s.filePath === filePath) { activate(sid); return sid; }
  }
  const r = await window.gits.readImage(filePath);
  if (!r.ok) { showToast(r.error || 'Could not open the image.'); return null; }
  const id = `img${++imageSeq}`;
  const img = el('img', { class: 'image-view', src: r.dataUrl, alt: basename(filePath) });
  const pane = el('div', { class: 'term-pane image-pane', 'data-id': id, tabindex: '-1' }, el('div', { class: 'image-wrap' }, img));
  terminalsEl.appendChild(pane);
  const session = { id, kind: 'image', filePath, pane, focusEl: pane, label: basename(filePath), tabEl: null };
  sessions.set(id, session);
  attachTab(session, { tag: 'image', tagClass: 'tab-ai image', tabTitle: filePath });
  welcomeEl.classList.add('hidden');
  activate(id);
  return id;
}

// ---------------------------------------------------------------------------
// Built-in editor — CodeMirror: syntax highlighting, line numbers, save (⌘S),
// find/replace (⌘F), go-to-line (Alt+G).
// ---------------------------------------------------------------------------
let editorSeq = 0;
async function openEditor(filePath, opts = {}) {
  // Already open? Just focus that tab.
  for (const [sid, s] of sessions) {
    if (s.kind === 'editor' && s.filePath === filePath) { activate(sid); return sid; }
  }
  const res = await window.gits.readFile(filePath);
  if (!res.ok) {
    if (res.tooLarge || res.binary) { window.gits.openItem(filePath); showToast(`${res.error} Opened in your default app.`); }
    else showToast(res.error || 'Could not open the file.');
    return null;
  }
  const id = `e${++editorSeq}`;
  const label = basename(filePath);

  const cmHost = el('div', { class: 'editor-cm' });
  const saveBtn = el('button', { class: 'send-btn', text: 'Save', disabled: 'true' });
  const bar = el('div', { class: 'editor-bar' }, el('span', { class: 'editor-info', text: filePath }), saveBtn);
  const pane = el('div', { class: 'term-pane editor-pane', 'data-id': id }, cmHost, bar);
  terminalsEl.appendChild(pane);

  // Pick a syntax mode from the filename; unknown types fall back to plain text.
  const modeInfo = (window.CodeMirror.findModeByFileName && window.CodeMirror.findModeByFileName(label)) || null;
  const cm = window.CodeMirror(cmHost, {
    value: res.content,
    mode: modeInfo ? (modeInfo.mime || modeInfo.mode) : null,
    theme: cmTheme(),
    lineNumbers: true,
    autoCloseBrackets: true,
    matchBrackets: true,
    styleActiveLine: true,
    tabSize: 2,
    indentUnit: 2,
  });
  cm.getWrapperElement().style.fontSize = settings.fontSize + 'px';

  const session = { id, kind: 'editor', filePath, label, pane, cm, dirty: false, reloading: false, savedContent: res.content, tabEl: null };
  sessions.set(id, session);
  window.gits.watchAdd(filePath); // reload if it changes on disk (e.g. an AI edits it)

  const markDirty = (d) => {
    session.dirty = d;
    if (session.tabEl) session.tabEl.classList.toggle('dirty', d);
    saveBtn.disabled = !d;
  };
  const save = async () => {
    const content = cm.getValue();
    const r = await window.gits.writeFile({ path: filePath, content });
    if (r.ok) { session.savedContent = content; markDirty(false); showToast(`Saved ${label}`); }
    else showToast(r.error || 'Could not save.');
  };
  session.save = save;
  cm.on('change', () => { if (session.reloading) return; if (!session.dirty) markDirty(true); });
  // Editing keys: save, find/replace, go-to-line (CodeMirror search addons).
  cm.setOption('extraKeys', {
    [IS_MAC ? 'Cmd-S' : 'Ctrl-S']: () => save(),
    [IS_MAC ? 'Cmd-F' : 'Ctrl-F']: 'findPersistent',
    [IS_MAC ? 'Cmd-Alt-F' : 'Ctrl-H']: 'replace',
    'Alt-G': 'jumpToLine',
  });
  saveBtn.addEventListener('click', save);

  // Markdown files get a Preview toggle (rendered HTML ↔ editable code).
  if (MD_EXTS.test(filePath)) {
    const previewEl = el('div', { class: 'md-preview hidden' });
    previewEl.addEventListener('click', (e) => {
      const a = e.target.closest('a');
      if (a) { e.preventDefault(); const href = a.getAttribute('href'); if (/^https?:\/\//.test(href)) window.gits.openUrl(href); }
    });
    pane.insertBefore(previewEl, bar);
    const prevBtn = el('button', { class: 'send-btn ghost', text: 'Preview' });
    bar.insertBefore(prevBtn, saveBtn);
    let previewing = false;
    prevBtn.addEventListener('click', () => {
      previewing = !previewing;
      if (previewing) previewEl.innerHTML = renderMarkdown(cm.getValue());
      previewEl.classList.toggle('hidden', !previewing);
      cmHost.classList.toggle('hidden', previewing);
      prevBtn.textContent = previewing ? 'Edit' : 'Preview';
      if (!previewing) requestAnimationFrame(() => cm.refresh());
    });
    if (opts.preview) prevBtn.click(); // open straight into the rendered view
  }

  attachTab(session, { tag: 'edit', tagClass: 'tab-ai edit', tabTitle: filePath });
  welcomeEl.classList.add('hidden');
  activate(id);
  requestAnimationFrame(() => cm.refresh());
  persistSession();
  return id;
}

// Colourize a unified diff into a container (shared by the diff tab + review).
function renderDiffInto(container, text) {
  container.innerHTML = '';
  for (const line of (text || '').split('\n')) {
    let cls = 'd-ctx';
    const c = line[0];
    if (/^(diff |index |new file|deleted file|similarity|rename |\+\+\+|---)/.test(line)) cls = 'd-meta';
    else if (line.startsWith('@@')) cls = 'd-hunk';
    else if (c === '+') cls = 'd-add';
    else if (c === '-') cls = 'd-del';
    container.appendChild(el('div', { class: `d-line ${cls}`, text: line || ' ' }));
  }
}

// Split a unified diff into its header (the diff --git / index / --- / +++ lines)
// and individual @@ hunks — so a single hunk can be staged on its own.
function splitUnifiedDiff(text) {
  if (!text || !text.trim()) return null;
  const at = text.indexOf('@@');
  if (at === -1) return { header: text, hunks: [] };
  const header = text.slice(0, at);
  const hunks = [];
  let cur = null;
  for (const ln of text.slice(at).split('\n')) {
    if (ln.startsWith('@@')) { if (cur !== null) hunks.push(cur); cur = ln + '\n'; }
    else if (cur !== null) cur += ln + '\n';
  }
  if (cur !== null) hunks.push(cur);
  return { header, hunks };
}

// ---------------------------------------------------------------------------
// Inline diff — open a read-only unified diff for a changed file in a tab.
// ---------------------------------------------------------------------------
let diffSeq = 0;
async function openDiff(repo, filePath) {
  const res = await window.gits.diff({ repo, file: filePath });
  if (!res.ok) { showToast(res.error || 'Could not get the diff.'); return; }
  if (res.empty) { showToast('No changes in this file.'); return; }
  const id = `d${++diffSeq}`;
  const pre = el('div', { class: 'diff-view', tabindex: '-1' });
  renderDiffInto(pre, res.diff);
  const pane = el('div', { class: 'term-pane diff-pane', 'data-id': id }, pre);
  terminalsEl.appendChild(pane);
  const session = { id, kind: 'diff', pane, focusEl: pre, label: basename(filePath), tabTitle: filePath, tabEl: null };
  sessions.set(id, session);
  attachTab(session, { tag: 'diff', tagClass: 'tab-ai diff', tabTitle: filePath });
  welcomeEl.classList.add('hidden');
  activate(id);
  return id;
}

// ---------------------------------------------------------------------------
// Review & stage — per-project tab: file list with staging, per-file diff,
// commit (staged-only) and push.
// ---------------------------------------------------------------------------
let reviewSeq = 0;
async function openReview(p) {
  const repo = p.path;
  for (const [sid, s] of sessions) {
    if (s.kind === 'review' && s.repo === repo) { activate(sid); s.refresh(); return sid; }
  }
  const id = `r${++reviewSeq}`;

  const filesEl = el('div', { class: 'review-files' });
  const diffEl = el('div', { class: 'review-diff diff-view', tabindex: '-1' });
  const stageAllBtn = el('button', { class: 'tiny-btn', text: 'Stage all' });
  const unstageAllBtn = el('button', { class: 'tiny-btn', text: 'Unstage all' });
  const refreshR = el('button', { class: 'tiny-btn', title: 'Refresh', text: '⟳' });
  const head = el('div', { class: 'review-head' },
    el('span', { class: 'review-title', text: p.name }),
    el('div', { class: 'review-head-btns' }, stageAllBtn, unstageAllBtn, refreshR));

  const msg = el('input', { class: 'review-msg', type: 'text', placeholder: 'Commit message', spellcheck: 'false', autocapitalize: 'off' });
  const suggestBtn = el('button', { class: 'link-btn', type: 'button', text: '✦ Suggest' });
  const commitBtn = el('button', { class: 'block-btn primary', text: 'Commit staged' });
  const pushBtn = el('button', { class: 'block-btn', text: 'Push' });
  const statusEl = el('div', { class: 'import-status' });
  const foot = el('div', { class: 'review-foot' },
    el('div', { class: 'label-row' }, el('label', { class: 'mini-label', text: 'Commit message' }), suggestBtn),
    msg,
    el('div', { class: 'review-actions' }, commitBtn, pushBtn),
    statusEl);

  const pane = el('div', { class: 'term-pane review-pane', 'data-id': id },
    head, el('div', { class: 'review-body' }, filesEl, diffEl), foot);
  terminalsEl.appendChild(pane);

  let selected = null;
  const setStatusMsg = (text, cls) => { statusEl.textContent = text || ''; statusEl.className = 'import-status' + (cls ? ' ' + cls : ''); };

  // Render the file's diff with per-hunk Stage/Unstage buttons. Falls back to a
  // plain diff for untracked/binary files (which stage as a whole via the checkbox).
  const renderReviewDiff = (unstagedText, stagedText) => {
    diffEl.innerHTML = '';
    const u = splitUnifiedDiff(unstagedText);
    const s = splitUnifiedDiff(stagedText);
    if ((!u || !u.hunks.length) && (!s || !s.hunks.length)) {
      window.gits.diff({ repo, file: repo + '/' + selected }).then((d) => {
        renderDiffInto(diffEl, d.ok ? (d.empty ? '(no textual changes — use the checkbox to stage)' : d.diff) : 'No diff available.');
      });
      return;
    }
    const section = (title, parsed, label, reverse) => {
      if (!parsed || !parsed.hunks.length) return;
      diffEl.appendChild(el('div', { class: 'hunk-title', text: title }));
      parsed.hunks.forEach((hunk) => {
        const btn = el('button', { class: 'hunk-btn', text: label });
        btn.addEventListener('click', async () => {
          const r = await window.gits.applyHunk({ repo, patch: parsed.header + hunk, reverse });
          if (!r.ok) setStatusMsg(r.error, 'err'); else refresh();
        });
        diffEl.appendChild(el('div', { class: 'hunk-head' }, btn));
        const body = el('div', { class: 'diff-view hunk-body' });
        renderDiffInto(body, hunk.replace(/\n$/, ''));
        diffEl.appendChild(body);
      });
    };
    section('Unstaged — stage a hunk', u, 'Stage hunk →', false);
    section('Staged — unstage a hunk', s, '← Unstage hunk', true);
  };

  const showDiff = async (file) => {
    selected = file;
    [...filesEl.children].forEach((c) => c.classList && c.classList.toggle('sel', c.dataset.file === file));
    const [u, s] = await Promise.all([
      window.gits.fileDiff({ repo, file, staged: false }),
      window.gits.fileDiff({ repo, file, staged: true }),
    ]);
    renderReviewDiff(u.diff || '', s.diff || '');
  };

  const refresh = async () => {
    const r = await window.gits.statusFiles(repo);
    filesEl.innerHTML = '';
    if (!r.ok) { filesEl.appendChild(el('div', { class: 'review-empty', text: r.error || 'Not a git repo.' })); return; }
    if (!r.files.length) {
      filesEl.appendChild(el('div', { class: 'review-empty', text: 'No changes — working tree clean.' }));
      diffEl.innerHTML = ''; selected = null; return;
    }
    for (const f of r.files) {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = f.staged;
      cb.indeterminate = f.staged && f.unstaged; // staged, with further unstaged edits
      cb.addEventListener('click', async (e) => {
        e.stopPropagation();
        const res = cb.checked ? await window.gits.stage({ repo, file: f.file })
                               : await window.gits.unstage({ repo, file: f.file });
        if (!res.ok) setStatusMsg(res.error, 'err');
        refresh();
      });
      const row = el('div', { class: `review-file${f.file === selected ? ' sel' : ''}`, 'data-file': f.file, title: f.file },
        cb,
        el('span', { class: `chg-dot chg-${f.type}` }),
        el('span', { class: 'review-fname', text: f.file }));
      row.addEventListener('click', () => showDiff(f.file));
      filesEl.appendChild(row);
    }
    if (selected && r.files.some((f) => f.file === selected)) await showDiff(selected);
    else await showDiff(r.files[0].file);
  };

  stageAllBtn.addEventListener('click', async () => { const r = await window.gits.stageAll(repo); if (!r.ok) setStatusMsg(r.error, 'err'); refresh(); });
  unstageAllBtn.addEventListener('click', async () => { const r = await window.gits.unstageAll(repo); if (!r.ok) setStatusMsg(r.error, 'err'); refresh(); });
  refreshR.addEventListener('click', refresh);

  suggestBtn.addEventListener('click', async () => {
    suggestBtn.disabled = true; const o = suggestBtn.textContent; suggestBtn.textContent = 'Thinking…';
    const r = await window.gits.commitMessage({ repo, staged: true });
    suggestBtn.textContent = o; suggestBtn.disabled = false;
    if (r.ok) { msg.value = r.message; if (r.source === 'summary') setStatusMsg('Suggested from staged files (no AI CLI detected).'); }
    else setStatusMsg(r.error || 'Could not suggest a message.', 'err');
  });

  commitBtn.addEventListener('click', async () => {
    commitBtn.disabled = true;
    const r = await window.gits.commitStaged({ repo, message: msg.value.trim() || 'Update via Gitsidian' });
    commitBtn.disabled = false;
    if (r.ok) { setStatusMsg('Committed. Push when ready.', 'ok'); msg.value = ''; refresh(); loadProjects({ fetch: false }); }
    else setStatusMsg(r.error || 'Commit failed.', 'err');
  });
  pushBtn.addEventListener('click', async () => {
    pushBtn.disabled = true; setStatusMsg('Pushing…');
    const r = await window.gits.push(repo);
    pushBtn.disabled = false;
    if (r.ok) { setStatusMsg('Pushed to GitHub.', 'ok'); loadProjects({ fetch: false }); }
    else setStatusMsg(r.error || 'Push failed.', 'err');
  });

  const session = { id, kind: 'review', repo, pane, focusEl: filesEl, label: p.name, refresh, tabEl: null };
  sessions.set(id, session);
  attachTab(session, { tag: 'review', tagClass: 'tab-ai review', tabTitle: repo });
  welcomeEl.classList.add('hidden');
  activate(id);
  await refresh();
  return id;
}

// ---------------------------------------------------------------------------
// Commit history — per-project log; click a commit to see its diff.
// ---------------------------------------------------------------------------
let historySeq = 0;
async function openHistory(p) {
  const repo = p.path;
  for (const [sid, s] of sessions) {
    if (s.kind === 'history' && s.repo === repo) { activate(sid); return sid; }
  }
  const id = `h${++historySeq}`;
  const listEl = el('div', { class: 'history-list' });
  const diffEl = el('div', { class: 'history-diff diff-view', tabindex: '-1' });
  const pane = el('div', { class: 'term-pane history-pane', 'data-id': id },
    el('div', { class: 'review-body' }, listEl, diffEl));
  terminalsEl.appendChild(pane);

  const r = await window.gits.log({ repo, limit: 200 });
  if (!r.ok) {
    listEl.appendChild(el('div', { class: 'review-empty', text: r.error || 'Not a git repo.' }));
  } else if (!r.commits.length) {
    listEl.appendChild(el('div', { class: 'review-empty', text: 'No commits yet.' }));
  } else {
    const show = async (c, row) => {
      [...listEl.children].forEach((x) => x.classList && x.classList.remove('sel'));
      row.classList.add('sel');
      const d = await window.gits.commitDiff({ repo, hash: c.hash });
      renderDiffInto(diffEl, d.ok ? d.diff : (d.error || 'Could not load commit.'));
    };
    r.commits.forEach((c, i) => {
      const row = el('div', { class: 'history-item', title: c.hash },
        el('span', { class: 'history-hash', text: c.short }),
        el('span', { class: 'history-subject', text: c.subject }),
        el('span', { class: 'history-meta', text: `${c.author} · ${c.date}` }));
      row.addEventListener('click', () => show(c, row));
      listEl.appendChild(row);
      if (i === 0) show(c, row); // preview the newest commit
    });
  }

  const session = { id, kind: 'history', repo, pane, focusEl: listEl, label: `${p.name} · log`, tabEl: null };
  sessions.set(id, session);
  attachTab(session, { tag: 'log', tagClass: 'tab-ai history', tabTitle: repo });
  welcomeEl.classList.add('hidden');
  activate(id);
  return id;
}

// Open a file in the editor and jump to a line (used by search results).
async function openEditorAt(filePath, line) {
  if (IMAGE_EXTS.test(filePath)) return openImagePreview(filePath);
  const id = await openEditor(filePath);
  const s = id && sessions.get(id);
  if (s && s.cm) {
    const ln = Math.max(0, (line || 1) - 1);
    requestAnimationFrame(() => {
      s.cm.refresh();
      s.cm.setCursor({ line: ln, ch: 0 });
      s.cm.scrollIntoView({ line: ln, ch: 0 }, 120);
      s.cm.focus();
    });
  }
  return id;
}

// ---------------------------------------------------------------------------
// Multi-file search — a per-project tab; click a match to open it at that line.
// ---------------------------------------------------------------------------
let searchSeq = 0;
async function openSearch(root) {
  root = root || activeProjectRoot();
  if (!root) { showToast('Open a project first.'); return; }
  for (const [sid, s] of sessions) {
    if (s.kind === 'search' && s.root === root) { activate(sid); s.focusInput(); return sid; }
  }
  const id = `f${++searchSeq}`;
  const proj = projectIndex.get(root);
  const input = el('input', { class: 'search-input', type: 'text', placeholder: `Search in ${proj ? proj.name : basename(root)}…`, spellcheck: 'false', autocapitalize: 'off' });
  const info = el('span', { class: 'search-info' });
  const resultsEl = el('div', { class: 'search-results' });
  const pane = el('div', { class: 'term-pane search-pane', 'data-id': id },
    el('div', { class: 'search-head' }, input, info), resultsEl);
  terminalsEl.appendChild(pane);

  let timer = null;
  const doSearch = async () => {
    const q = input.value.trim();
    resultsEl.innerHTML = '';
    if (!q) { info.textContent = ''; return; }
    info.textContent = 'Searching…';
    const r = await window.gits.search({ root, query: q });
    if (!r.ok) { info.textContent = 'Search failed.'; return; }
    info.textContent = `${r.results.length}${r.truncated ? '+' : ''} match${r.results.length === 1 ? '' : 'es'}`;
    const byFile = new Map();
    for (const m of r.results) { if (!byFile.has(m.file)) byFile.set(m.file, []); byFile.get(m.file).push(m); }
    for (const [file, ms] of byFile) {
      resultsEl.appendChild(el('div', { class: 'search-file', text: `${file}  (${ms.length})` }));
      for (const m of ms) {
        const row = el('div', { class: 'search-match' },
          el('span', { class: 'search-ln', text: String(m.line) }),
          el('span', { class: 'search-text', text: m.text.trim() }));
        row.addEventListener('click', () => openEditorAt(root + '/' + file, m.line));
        resultsEl.appendChild(row);
      }
    }
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(doSearch, 250); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(timer); doSearch(); } });

  const session = { id, kind: 'search', root, pane, focusEl: input, focusInput: () => input.focus(), label: `Search · ${proj ? proj.name : basename(root)}`, tabEl: null };
  sessions.set(id, session);
  attachTab(session, { tag: 'search', tagClass: 'tab-ai search', tabTitle: root });
  welcomeEl.classList.add('hidden');
  activate(id);
  input.focus();
  return id;
}

// ---------------------------------------------------------------------------
// Team chat — messages are comments on one issue in a private hub repo; the
// signed-in GitHub account is the identity. Once a team is configured, the chat
// runs automatically from launch: a background poller keeps an unread badge on
// the sidebar chat button, and opening the tab shows messages already loaded.
// ---------------------------------------------------------------------------
// A "channel" is one repo's chat (the "Gitsidian Team Chat" issue in that repo).
// Config: { channels: [{repo, issue, visibility}], active: repo, seen: {repo: id} }.
let chatSeq = 0;
let teamMe = null;            // your GitHub login
let teamChannels = [];        // [{ repo, issue, visibility }]
let teamActive = null;        // active channel repo (owner/name)
let teamSeen = {};            // { repo: lastSeenId }
let teamMsgs = [];            // active channel messages (deduped, oldest-first)
let teamFetchedIds = new Set();
let teamPollTimer = null;
let teamChatId = null;        // chat tab session id
let teamListEl = null;        // active channel's message list DOM
let teamChannelsEl = null;    // channel list DOM
let teamMainEl = null;        // conversation/setup area DOM
let teamAdding = false;       // showing the add-channel form?
let teamProfiles = {};        // { login: { alias, avatar } } from the hub's members.json

function relTime(iso) {
  const t = new Date(iso).getTime();
  if (!t) return '';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

// Detect a command proposal embedded in a chat message (a ```gitsidian-run``` block).
function parseCommand(body) {
  const m = (body || '').match(/```gitsidian-run\s*\n([\s\S]*?)\n```/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[1]);
    if (o && o.v === 1 && o.repo && o.ai && typeof o.prompt === 'string') return o;
  } catch {}
  return null;
}

// Flag AI prompts that try to smuggle in dangerous shell-style actions.
function riskyReason(text) {
  const t = (text || '').toLowerCase();
  const checks = [
    [/rm\s+-[rf]{1,2}\b/, 'recursive delete (rm -rf)'],
    [/\bsudo\b/, 'sudo'],
    [/(curl|wget)[^\n]*\|\s*(sh|bash|zsh)/, 'pipe-to-shell'],
    [/\bmkfs\b|dd\s+if=|>\s*\/dev\/sd/, 'disk write'],
    [/:\(\)\s*\{.*\};/, 'fork bomb'],
    [/chmod\s+-?r?\s*777/, 'chmod 777'],
    [/\.ssh\/|id_rsa|id_ed25519|\.aws\/|\.env\b|credentials/, 'secrets/keys access'],
    [/base64\s+-d|eval\s+\$\(|\$\(curl/, 'obfuscated execution'],
    [/git\s+push[^\n]*--force|reset\s+--hard|git\s+clean\s+-[a-z]*f/, 'destructive git'],
  ];
  for (const [re, reason] of checks) if (re.test(t)) return reason;
  return null;
}

// Find a locally-cloned project whose GitHub remote matches owner/name.
async function findLocalProjectForRepo(nameWithOwner) {
  const want = (nameWithOwner || '').toLowerCase();
  for (const p of projectIndex.values()) {
    const url = await window.gits.webUrl(p.path);
    const mm = url && url.toLowerCase().match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/);
    if (mm && mm[1] === want) return p;
  }
  return null;
}
async function repoNameWithOwner(p) {
  const url = await window.gits.webUrl(p);
  const m = url && url.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/i);
  return m ? m[1] : null;
}

// Approve a proposed command: stage its prompt in the matching repo's session
// (the human presses Enter to actually run it — the final gate).
async function runProposedCommand(cmd) {
  if (!settings.allowChatCommands) {
    showToast('Turn on “Allow approved chat commands” in Settings to run this.');
    return false;
  }
  const proj = await findLocalProjectForRepo(cmd.repo);
  if (!proj) { showToast(`You don't have ${cmd.repo} cloned locally — can't run this here.`); return false; }
  const risk = riskyReason(cmd.prompt);
  if (risk && !confirm(`This proposed prompt looks risky (${risk}).\n\nIt will be placed in a ${cmd.ai} session in "${proj.name}" for you to review before it runs. Continue?`)) {
    return false;
  }
  // Reuse a live session for this repo+AI if one exists, else open a new one.
  let id = ([...sessions.values()].find((s) => s.kind === 'term' && s.cwd === proj.path && s.ai === cmd.ai && s.status !== 'dead') || {}).id;
  if (!id) id = await openSession(proj.path, proj.name, cmd.ai);
  const s = sessions.get(id);
  if (s && s.composerText) {
    s.composerText.value = cmd.prompt;
    s.composerText.dispatchEvent(new Event('input'));
    activate(id);
    s.composerText.focus();
    showToast(`Prompt staged in ${proj.name} (${cmd.ai}) — review and press Enter to run.`);
    return true;
  }
  showToast('Could not open a session for that repo.');
  return false;
}

// Propose an AI command: pick a repo (from your projects) + AI + prompt, post it.
function openProposeModal(channel) {
  const projects = [...projectIndex.values()].filter((p) => p.git && p.git.isRepo);
  if (!projects.length) { showToast('Open a git project first — a command targets a repo.'); return; }
  const repoSel = el('select', { class: 'prompt-input' });
  for (const p of projects) repoSel.appendChild(el('option', { value: p.path }, p.name));
  const aiSel = el('select', { class: 'prompt-input' });
  for (const a of ais.filter((a) => a.installed && a.id !== 'shell')) aiSel.appendChild(el('option', { value: a.id }, a.name));
  if (!aiSel.children.length) aiSel.appendChild(el('option', { value: 'claude' }, 'Claude Code'));
  const promptTa = el('textarea', { class: 'prompt-input', rows: '4', placeholder: 'Prompt for the AI — e.g. “add unit tests for the auth module”', spellcheck: 'false' });
  const okBtn = el('button', { class: 'block-btn primary', text: 'Propose' });
  const cancelBtn = el('button', { class: 'block-btn', text: 'Cancel' });
  const overlay = el('div', { class: 'modal prompt-modal' },
    el('div', { class: 'modal-card' },
      el('p', { class: 'prompt-msg', text: 'Propose an AI command for a teammate to approve & run. (AI prompts only — no shell.)' }),
      el('label', { class: 'mini-label', text: 'Repo' }), repoSel,
      el('label', { class: 'mini-label', text: 'AI' }), aiSel,
      el('label', { class: 'mini-label', text: 'Prompt' }), promptTa,
      el('div', { class: 'modal-actions' }, cancelBtn, okBtn)));
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  setTimeout(() => promptTa.focus(), 0);
  okBtn.addEventListener('click', async () => {
    const prompt = promptTa.value.trim();
    if (!prompt) { promptTa.focus(); return; }
    okBtn.disabled = true;
    const nwo = await repoNameWithOwner(repoSel.value);
    if (!nwo) { showToast('That project has no GitHub remote — publish it so teammates can match it.'); okBtn.disabled = false; return; }
    const name = (projectIndex.get(repoSel.value) || {}).name || nwo.split('/')[1];
    const payload = { v: 1, repo: nwo, name, ai: aiSel.value, prompt };
    const body = `**Command proposal** — run in \`${nwo}\` with \`${aiSel.value}\`:\n\n\`\`\`gitsidian-run\n${JSON.stringify(payload)}\n\`\`\``;
    const r = await window.gits.chatPost({ repo: channel.repo, issue: channel.issue, body });
    okBtn.disabled = false;
    if (!r.ok) { showToast(r.error || 'Could not post the proposal.'); return; }
    close();
    teamFetch({});
  });
}

// A command-proposal card (replaces the normal message bubble).
function chatCommandCard(m, me, cmd) {
  const mine = m.login === me;
  const risk = riskyReason(cmd.prompt);
  const card = el('div', { class: `cmd-card${risk ? ' risky' : ''}` });
  const copyBtn = el('button', { class: 'chat-copy cmd-copy', title: 'Copy prompt', html: COPY_SVG, type: 'button' });
  copyBtn.addEventListener('click', (e) => { e.stopPropagation(); copyToClipboard(cmd.prompt || '', 'Prompt'); });
  const delBtn = el('button', { class: 'chat-del cmd-copy', title: 'Delete message', html: TRASH_SVG, type: 'button' });
  card.appendChild(el('div', { class: 'cmd-head' },
    el('span', { class: 'cmd-zap', html: ZAP_SVG }),
    el('span', { class: 'cmd-who', text: mine ? 'You proposed a command' : `${m.login} proposes a command` }),
    el('span', { class: 'chat-time', text: relTime(m.at) }),
    copyBtn, delBtn));
  card.appendChild(el('div', { class: 'cmd-target', text: `Run in ${cmd.repo} · ${cmd.ai}` }));
  card.appendChild(el('pre', { class: 'cmd-prompt', text: cmd.prompt }));
  if (risk) card.appendChild(el('div', { class: 'cmd-risk', text: `⚠ Looks risky: ${risk}. Review carefully.` }));
  const approve = el('button', { class: 'block-btn primary', text: mine ? 'Run here' : 'Approve & open' });
  const dismiss = el('button', { class: 'block-btn', text: 'Dismiss' });
  approve.addEventListener('click', async () => {
    approve.disabled = true;
    const ok = await runProposedCommand(cmd);
    if (ok) { card.classList.add('done'); approve.textContent = 'Staged ✓'; dismiss.textContent = 'Close'; }
    else approve.disabled = false;
  });
  dismiss.addEventListener('click', () => card.remove());
  card.appendChild(el('div', { class: 'cmd-actions' }, dismiss, approve));
  const row = el('div', { class: `chat-msg${mine ? ' me' : ''}` }, el('div', { class: 'chat-bubble cmd-bubble' }, card));
  delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteMessage(m, row); });
  return row;
}

// Clean filled lightning bolt (Feather "zap" shape) — used for AI command dispatch.
const ZAP_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
const COPY_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const SMILE_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>';
const TRASH_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';

// Copy text to the clipboard with a confirmation toast.
function copyToClipboard(text, label) {
  window.gits.copyText(text || '');
  showToast(`${label || 'Copied'} to clipboard`);
}

// Delete a single chat message (with confirm). Removes it from the view on success.
async function deleteMessage(m, rowEl) {
  const ch = activeChannel();
  if (!ch || !m || !m.id) return;
  const ok = await uiConfirm('Delete this message? This removes it from GitHub for everyone.', { okLabel: 'Delete', danger: true });
  if (!ok) return;
  const r = await window.gits.chatDelete({ repo: ch.repo, id: m.id });
  if (!r.ok) { showToast(r.error || 'Could not delete the message.'); return; }
  teamMsgs = teamMsgs.filter((x) => x.id !== m.id);
  if (teamFetchedIds) teamFetchedIds.delete(m.id);
  if (rowEl) rowEl.remove(); else rerenderMessages();
  showToast('Message deleted');
}

// Build a Markdown transcript of a channel for the backup download.
function buildChatMarkdown(ch, msgs) {
  const lines = [`# Gitsidian chat — ${ch.repo}`, '', `_Exported ${new Date().toLocaleString()} · ${msgs.length} message(s)._`, ''];
  for (const m of msgs) {
    const prof = teamProfiles[m.login] || {};
    const who = prof.alias ? `${prof.alias} (@${m.login})` : m.login;
    lines.push(`### ${who} · ${new Date(m.at).toLocaleString()}`, '', (m.body || '').trim(), '');
  }
  return lines.join('\n');
}

function chatMsgEl(m, me) {
  const cmd = parseCommand(m.body);
  if (cmd) return chatCommandCard(m, me, cmd);
  // Overlay the team profile (custom avatar / display name) when one is set.
  const prof = teamProfiles[m.login] || {};
  const displayName = prof.alias ? `${prof.alias}` : m.login;
  const av = el('img', { class: 'chat-avatar', src: prof.avatar || m.avatar || '', alt: m.login, referrerpolicy: 'no-referrer' });
  const bodyHtml = renderMarkdown(m.body || '')
    .replace(/(^|[\s(>])@([a-zA-Z0-9-]+)/g, '$1<span class="mention">@$2</span>');
  const mentionsMe = me && new RegExp('@' + me + '\\b', 'i').test(m.body || '');
  const copyBtn = el('button', { class: 'chat-copy', title: 'Copy message', html: COPY_SVG, type: 'button' });
  copyBtn.addEventListener('click', (e) => { e.stopPropagation(); copyToClipboard(m.body || '', 'Message'); });
  const delBtn = el('button', { class: 'chat-del', title: 'Delete message', html: TRASH_SVG, type: 'button' });
  const loginSpan = el('span', { class: 'chat-login', text: displayName });
  if (prof.alias) loginSpan.title = `@${m.login}`; // still the GitHub account underneath
  const row = el('div', { class: `chat-msg${m.login === me ? ' me' : ''}${mentionsMe ? ' mention-me' : ''}` }, av,
    el('div', { class: 'chat-bubble' },
      el('div', { class: 'chat-meta' }, loginSpan, el('span', { class: 'chat-time', text: relTime(m.at) })),
      el('div', { class: 'chat-body', html: bodyHtml }),
      el('div', { class: 'chat-tools' }, copyBtn, delBtn)));
  delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteMessage(m, row); });
  return row;
}

const activeChannel = () => teamChannels.find((c) => c.repo === teamActive) || null;

// Load config, migrating the old single-channel shape to the channels model.
async function loadTeam() {
  const cfg = await window.gits.teamConfig();
  if (Array.isArray(cfg.channels)) {
    teamChannels = cfg.channels;
    teamActive = cfg.active || (cfg.channels[0] && cfg.channels[0].repo) || null;
    teamSeen = cfg.seen || {};
  } else if (cfg.repo && cfg.issue) {
    teamChannels = [{ repo: cfg.repo, issue: cfg.issue, visibility: cfg.visibility || null }];
    teamActive = cfg.repo;
    teamSeen = { [cfg.repo]: cfg.lastSeenId || 0 };
    await saveTeam();
  } else {
    teamChannels = []; teamActive = null; teamSeen = {};
  }
}
function saveTeam() {
  return window.gits.teamConfig({ channels: teamChannels, active: teamActive, seen: teamSeen, repo: null, issue: null, lastSeenId: null, visibility: null });
}

function setChatBadge(n) {
  const btn = document.getElementById('open-team');
  if (!btn) return;
  let b = btn.querySelector('.chat-badge');
  if (!b) { b = el('span', { class: 'chat-badge' }); btn.appendChild(b); }
  if (n > 0) { b.textContent = n > 99 ? '99+' : String(n); b.classList.add('on'); }
  else b.classList.remove('on');
}
function refreshChatBadge() {
  const last = (teamActive && teamSeen[teamActive]) || 0;
  setChatBadge(teamMsgs.filter((m) => m.id > last && m.login !== teamMe).length);
}
function markSeen() {
  if (!teamActive) return;
  teamSeen[teamActive] = teamMsgs.reduce((mx, m) => Math.max(mx, m.id), teamSeen[teamActive] || 0);
  saveTeam();
  refreshChatBadge();
}
function notifyChat(m) {
  try {
    const n = new Notification(`Gitsidian — ${m.login}`, { body: (m.body || '').slice(0, 140) });
    n.onclick = () => { openTeamChat(); window.focus(); };
  } catch {}
}

// Poll the active channel for new messages.
async function teamFetch({ initial = false } = {}) {
  const ch = activeChannel();
  if (!ch) return;
  const r = await window.gits.chatList({ repo: ch.repo, issue: ch.issue });
  if (!r.ok) return;
  const fresh = [];
  for (const m of r.messages || []) {
    if (teamFetchedIds.has(m.id)) continue;
    teamFetchedIds.add(m.id); teamMsgs.push(m); fresh.push(m);
  }
  if (teamListEl) {
    for (const m of fresh) teamListEl.appendChild(chatMsgEl(m, teamMe));
    if (fresh.length) teamListEl.scrollTop = teamListEl.scrollHeight;
  }
  const chatVisible = teamChatId && activeId === teamChatId && !document.hidden && !teamAdding;
  if (initial && teamSeen[teamActive] == null) { markSeen(); }      // first connect — don't flag all history
  else if (chatVisible) { markSeen(); }
  else {
    refreshChatBadge();
    const incoming = fresh.filter((m) => m.login !== teamMe);
    if (!initial && incoming.length) notifyChat(incoming[incoming.length - 1]);
    // If the chat lives in a group and isn't the focused cell, light its chip.
    const chatS = teamChatId && sessions.get(teamChatId);
    if (chatS && incoming.length && !(activeId === teamChatId && activeGroupId)) {
      chatS.unread = true; refreshGroupBadges();
    }
  }
}

function ensureTeamPolling() {
  if (!teamPollTimer && teamChannels.length) teamPollTimer = setInterval(() => teamFetch({}), 15000);
}

// Load the active channel's messages (cache first, then live).
// Re-render the open message list (after profiles/avatars change).
function rerenderMessages() {
  if (!teamListEl) return;
  teamListEl.innerHTML = '';
  for (const m of teamMsgs) teamListEl.appendChild(chatMsgEl(m, teamMe));
  teamListEl.scrollTop = teamListEl.scrollHeight;
}

async function loadActiveChannel() {
  teamMsgs = []; teamFetchedIds = new Set();
  const ch = activeChannel();
  if (!ch) return;
  teamProfiles = await window.gits.teamProfiles(ch.repo) || {}; // display names + avatars
  const cache = await window.gits.chatCache({ repo: ch.repo, issue: ch.issue });
  for (const m of (cache.messages || [])) if (!teamFetchedIds.has(m.id)) { teamFetchedIds.add(m.id); teamMsgs.push(m); }
  rerenderMessages();
  await teamFetch({ initial: true });
}

function switchChannel(repo) {
  if (repo === teamActive && !teamAdding) return;
  teamAdding = false;
  teamActive = repo;
  saveTeam();
  renderChannels();
  renderChatMain();
  loadActiveChannel();
}

// Add a channel for `repo` (creating the chat issue); warns if the repo is public.
async function addChannel(repo) {
  repo = (repo || '').trim();
  if (!repo.includes('/')) { showToast('Enter the repo as owner/name.'); return; }
  if (teamChannels.some((c) => c.repo === repo)) { switchChannel(repo); return; }
  showToast('Setting up channel…');
  const init = await window.gits.chatInit(repo);
  if (!init.ok) { showToast(init.error || 'Could not set up that channel.'); return; }
  if (init.visibility === 'PUBLIC' &&
      !confirm(`"${repo}" is PUBLIC — anyone on the internet can read these messages.\n\nAdd it anyway? (For private chat, use a private repo instead.)`)) {
    return;
  }
  teamChannels.push({ repo, issue: init.issue, visibility: init.visibility || null });
  teamActive = repo;
  teamAdding = false;
  if (!(repo in teamSeen)) teamSeen[repo] = null;
  await saveTeam();
  ensureTeamPolling();
  renderChannels();
  renderChatMain();
  loadActiveChannel();
}

// The setup / add-a-channel form (clear visible options — no native dialogs).
function chatSetupForm() {
  const wrap = el('div', { class: 'chat-setup' });
  wrap.appendChild(el('p', { class: 'chat-setup-intro', text: 'A channel is one private GitHub repo (your GitHub account is your identity). Pick one:' }));

  const newName = el('input', { class: 'prompt-input', value: 'gitsidian-team', placeholder: 'new repo name' });
  const createBtn = el('button', { class: 'block-btn primary', text: 'Create private repo' });
  createBtn.addEventListener('click', async () => {
    const name = newName.value.trim(); if (!name) return;
    createBtn.disabled = true; showToast('Creating private team repo…');
    const c = await window.gits.teamCreateRepo(name);
    createBtn.disabled = false;
    if (!c.ok) { showToast(c.error || 'Could not create the repo.'); return; }
    addChannel(c.repo);
  });
  wrap.appendChild(el('div', { class: 'chat-setup-row' },
    el('label', { class: 'mini-label', text: 'Create a new private repo' }),
    el('div', { class: 'chat-setup-line' }, newName, createBtn)));

  wrap.appendChild(el('div', { class: 'chat-setup-or', text: 'or' }));

  const exRepo = el('input', { class: 'prompt-input', placeholder: 'owner/name of an existing repo' });
  const connectBtn = el('button', { class: 'block-btn', text: 'Connect' });
  connectBtn.addEventListener('click', () => addChannel(exRepo.value));
  exRepo.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addChannel(exRepo.value); } });
  wrap.appendChild(el('div', { class: 'chat-setup-row' },
    el('label', { class: 'mini-label', text: 'Use an existing repo you own (private recommended)' }),
    el('div', { class: 'chat-setup-line' }, exRepo, connectBtn)));

  if (teamChannels.length) {
    const cancel = el('button', { class: 'link-btn', text: 'Cancel' });
    cancel.addEventListener('click', () => { teamAdding = false; renderChannels(); renderChatMain(); });
    wrap.appendChild(cancel);
  }
  return wrap;
}

// Left column: the list of channels + "Add channel".
function renderChannels() {
  if (!teamChannelsEl) return;
  teamChannelsEl.innerHTML = '';
  teamChannelsEl.appendChild(el('div', { class: 'chat-channels-head', text: 'Channels' }));
  for (const c of teamChannels) {
    const last = teamSeen[c.repo] || 0;
    const unread = (c.repo === teamActive ? teamMsgs : []).filter((m) => m.id > last && m.login !== teamMe).length;
    const row = el('div', { class: `chat-channel${c.repo === teamActive && !teamAdding ? ' active' : ''}`, title: c.repo },
      el('span', { class: 'chat-channel-name', text: c.repo.split('/')[1] || c.repo }),
      c.visibility === 'PUBLIC' ? el('span', { class: 'chat-channel-tag', text: 'public', title: 'Public — world-readable' }) : null,
      unread ? el('span', { class: 'chat-channel-dot' }) : null);
    row.addEventListener('click', () => switchChannel(c.repo));
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, [
        { label: 'Download backup (.md)', onClick: () => exportChannel(c) },
        { label: 'Delete channel…', onClick: () => deleteChannelFlow(c) },
      ]);
    });
    teamChannelsEl.appendChild(row);
  }
  const add = el('button', { class: `chat-channel-add${teamAdding ? ' active' : ''}`, text: '+ Add channel' });
  add.addEventListener('click', () => { teamAdding = true; renderChannels(); renderChatMain(); });
  teamChannelsEl.appendChild(add);
}

// Save a channel's full transcript as a .md file (fetches fresh so it's complete).
async function exportChannel(ch) {
  showToast('Preparing backup…');
  let msgs = (ch.repo === teamActive) ? teamMsgs.slice() : [];
  const r = await window.gits.chatList({ repo: ch.repo, issue: ch.issue });
  if (r.ok && Array.isArray(r.messages)) msgs = r.messages;
  if (!msgs.length) { showToast('No messages to back up.'); return; }
  const name = (ch.repo.replace('/', '-')) + '-chat';
  const res = await window.gits.chatExportMd({ markdown: buildChatMarkdown(ch, msgs), name });
  if (res.ok) showToast('Backup saved'); else if (!res.canceled) showToast(res.error || 'Could not save the backup.');
  return res.ok;
}

// Delete a whole channel, with a warning + the chance to download a backup first.
async function deleteChannelFlow(ch) {
  const shortName = ch.repo.split('/')[1] || ch.repo;
  const choice = await uiConfirm(
    `Delete the <b>${escapeHtml(shortName)}</b> channel?<br><br>This deletes the chat thread on GitHub for <b>everyone</b> and removes it here. ` +
    `It can't be undone — download a backup first if you want to keep the history.`,
    { okLabel: 'Delete channel', danger: true, extraLabel: 'Download backup (.md)' });
  if (choice === false) return;
  if (choice === 'extra') {
    const saved = await exportChannel(ch);
    if (!saved) return; // cancelled the save — abort the delete too, give them another shot
    const confirm2 = await uiConfirm(`Backup saved. Now delete the <b>${escapeHtml(shortName)}</b> channel?`, { okLabel: 'Delete channel', danger: true });
    if (!confirm2) return;
  }
  const r = await window.gits.chatDeleteChannel({ repo: ch.repo, issue: ch.issue });
  if (!r.ok) { showToast(r.error || 'Could not delete the channel.'); return; }
  // Drop it from local config and switch to another channel (or the setup form).
  teamChannels = teamChannels.filter((c) => c.repo !== ch.repo);
  delete teamSeen[ch.repo];
  if (teamActive === ch.repo) {
    teamActive = teamChannels[0] ? teamChannels[0].repo : null;
    teamMsgs = []; teamFetchedIds = new Set();
  }
  await saveTeam();
  renderChannels();
  if (teamActive) loadActiveChannel(); else { teamAdding = false; renderChatMain(); }
  showToast(r.mode === 'closed' ? 'Channel closed (no admin rights to fully delete)' : 'Channel deleted');
}

// Right column: the conversation for the active channel, or the setup form.
// A small markdown formatting toolbar (bold/italic/code/list/link) over a chat input.
function richToolbar(ta) {
  const fire = () => ta.dispatchEvent(new Event('input'));
  const wrap = (before, after, placeholder) => {
    const s = ta.selectionStart, e = ta.selectionEnd;
    const sel = ta.value.slice(s, e) || placeholder || '';
    ta.value = ta.value.slice(0, s) + before + sel + after + ta.value.slice(e);
    ta.focus();
    ta.setSelectionRange(s + before.length, s + before.length + sel.length);
    fire();
  };
  const prefixLines = (pfx) => {
    const s = ta.selectionStart, e = ta.selectionEnd;
    const start = ta.value.lastIndexOf('\n', s - 1) + 1;
    const block = ta.value.slice(start, e) || 'item';
    const out = block.split('\n').map((l) => pfx + l).join('\n');
    ta.value = ta.value.slice(0, start) + out + ta.value.slice(e);
    ta.focus();
    ta.setSelectionRange(start, start + out.length);
    fire();
  };
  const insertAt = (str) => {
    const s = ta.selectionStart, e = ta.selectionEnd;
    ta.value = ta.value.slice(0, s) + str + ta.value.slice(e);
    ta.focus();
    ta.setSelectionRange(s + str.length, s + str.length);
    fire();
  };
  const numberLines = () => {
    const s = ta.selectionStart, e = ta.selectionEnd;
    const start = ta.value.lastIndexOf('\n', s - 1) + 1;
    const block = ta.value.slice(start, e) || 'item';
    const out = block.split('\n').map((l, idx) => `${idx + 1}. ${l}`).join('\n');
    ta.value = ta.value.slice(0, start) + out + ta.value.slice(e);
    ta.focus(); ta.setSelectionRange(start, start + out.length); fire();
  };
  const codeBlock = () => {
    const s = ta.selectionStart, e = ta.selectionEnd;
    const sel = ta.value.slice(s, e) || 'code';
    const ins = '```\n' + sel + '\n```';
    ta.value = ta.value.slice(0, s) + ins + ta.value.slice(e);
    ta.focus(); ta.setSelectionRange(s + 4, s + 4 + sel.length); fire();
  };
  const btn = (icon, title, fn) => {
    const b = el('button', { class: 'fmt-btn', title, html: icon, type: 'button' });
    b.addEventListener('mousedown', (ev) => ev.preventDefault()); // keep textarea selection
    b.addEventListener('click', (ev) => { ev.preventDefault(); fn(); });
    return b;
  };
  const sep = () => el('span', { class: 'fmt-sep' });

  // Emoji picker — inserts an emoji into the message (chat content, not UI chrome).
  const EMOJI = ['👍', '👎', '🎉', '🙏', '🔥', '✅', '❌', '👀', '🚀', '💡', '❤️', '😀', '😂', '😅', '🤔', '👌', '💯', '🙌', '😎', '🐛'];
  const panel = el('div', { class: 'emoji-panel hidden' });
  EMOJI.forEach((em) => {
    const b = el('button', { class: 'emoji-pick', text: em, type: 'button' });
    b.addEventListener('click', (ev) => { ev.preventDefault(); insertAt(em); panel.classList.add('hidden'); });
    panel.appendChild(b);
  });
  const emojiBtn = btn(SMILE_SVG, 'Emoji', () => panel.classList.toggle('hidden'));
  emojiBtn.classList.add('fmt-emoji');

  return el('div', { class: 'chat-toolbar' },
    btn(FMT.bold, 'Bold', () => wrap('**', '**', 'bold')),
    btn(FMT.italic, 'Italic', () => wrap('*', '*', 'italic')),
    btn(FMT.strike, 'Strikethrough', () => wrap('~~', '~~', 'text')),
    sep(),
    btn(FMT.code, 'Inline code', () => wrap('`', '`', 'code')),
    btn(FMT.codeblock, 'Code block', codeBlock),
    sep(),
    btn(FMT.bullet, 'Bulleted list', () => prefixLines('- ')),
    btn(FMT.number, 'Numbered list', numberLines),
    btn(FMT.quote, 'Quote', () => prefixLines('> ')),
    sep(),
    btn(FMT.link, 'Link', () => wrap('[', '](url)', 'text')),
    emojiBtn, panel);
}

// Formatting toolbar icons (Feather-style, currentColor, 15px).
const FMT_ICON = (paths) => `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const FMT = {
  bold: FMT_ICON('<path d="M7 5h7a3.5 3.5 0 0 1 0 7H7z"/><path d="M7 12h8a3.5 3.5 0 0 1 0 7H7z"/>'),
  italic: FMT_ICON('<line x1="19" y1="5" x2="11" y2="5"/><line x1="13" y1="19" x2="5" y2="19"/><line x1="15" y1="5" x2="9" y2="19"/>'),
  strike: FMT_ICON('<line x1="4" y1="12" x2="20" y2="12"/><path d="M7.5 8.5a4 3 0 0 1 7-1.2"/><path d="M16.5 15.5a4 3 0 0 1-7 1.2"/>'),
  code: FMT_ICON('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>'),
  codeblock: FMT_ICON('<rect x="2.5" y="5" width="19" height="14" rx="2"/><polyline points="9 10 7 12 9 14"/><polyline points="15 10 17 12 15 14"/>'),
  bullet: FMT_ICON('<line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4.5" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r="1.3" fill="currentColor" stroke="none"/>'),
  number: FMT_ICON('<line x1="10" y1="6" x2="20" y2="6"/><line x1="10" y1="12" x2="20" y2="12"/><line x1="10" y1="18" x2="20" y2="18"/><path d="M4 5.5h1.3V10"/><path d="M3.4 14.4a1.1 1.1 0 0 1 2.2.1c0 1-2.2 1.3-2.2 2.6h2.3"/>'),
  quote: FMT_ICON('<line x1="5" y1="5" x2="5" y2="19"/><line x1="9" y1="7" x2="20" y2="7"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="17" x2="16" y2="17"/>'),
  link: FMT_ICON('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'),
};

function renderChatMain() {
  if (!teamMainEl) return;
  teamMainEl.innerHTML = '';
  teamListEl = null;
  if (teamAdding || !teamChannels.length) { teamMainEl.appendChild(chatSetupForm()); return; }
  const ch = activeChannel();
  if (!ch) { teamMainEl.appendChild(el('div', { class: 'chat-empty', text: 'Pick a channel on the left.' })); return; }

  const inviteBtn = el('button', { class: 'tiny-btn', title: 'Invite by GitHub username or email', text: '+ Invite' });
  inviteBtn.addEventListener('click', async () => {
    const v = await uiPrompt('Invite by GitHub username — or an email (for someone without a GitHub account):', '');
    if (!v) return;
    const val = v.trim();
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)) {
      window.gits.openUrl(`https://github.com/${ch.repo}/settings/access`);
      showToast(`Opened GitHub access — add ${val} there. No account? GitHub emails them and walks them through sign-up.`);
      return;
    }
    const r = await window.gits.teamInvite({ repo: ch.repo, username: val });
    showToast(r.ok ? `Invited ${r.user}.` : (r.error || 'Could not invite.'));
  });
  teamMainEl.appendChild(el('div', { class: 'chat-main-head' },
    el('span', { class: 'chat-title', text: ch.repo }), inviteBtn));
  if (ch.visibility === 'PUBLIC') {
    teamMainEl.appendChild(el('div', { class: 'chat-warn', text: 'Public repo — these messages are visible to anyone on the internet.' }));
  }

  const list = el('div', { class: 'chat-list' });
  teamListEl = list;
  list.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (a) { e.preventDefault(); const h = a.getAttribute('href'); if (/^https?:\/\//.test(h)) window.gits.openUrl(h); }
  });
  const input = el('textarea', { class: 'chat-input', rows: '1', placeholder: 'Message · Enter sends · Shift+Enter newline · @mention, **markdown** ok', spellcheck: 'false', autocapitalize: 'off' });
  const sendBtn = el('button', { class: 'send-btn', text: 'Send ▸' });
  const autoGrow = () => composerGrow(input);
  const send = async () => {
    const body = input.value.trim(); if (!body) return;
    input.value = ''; autoGrow();
    sendBtn.disabled = true;
    const r = await window.gits.chatPost({ repo: ch.repo, issue: ch.issue, body });
    sendBtn.disabled = false;
    if (!r.ok) { showToast(r.error || 'Could not send.'); input.value = body; autoGrow(); return; }
    teamFetch({});
    input.focus();
  };
  input.addEventListener('input', autoGrow);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); return; }
    if (e.key === 'Enter' && e.shiftKey) { if (maybeContinueList(input)) { e.preventDefault(); autoGrow(); } }
  });
  sendBtn.addEventListener('click', send);
  const proposeBtn = el('button', { class: 'cmd-propose', title: 'Propose an AI command for a teammate to approve & run', html: ZAP_SVG });
  proposeBtn.addEventListener('click', () => openProposeModal(ch));
  // One cohesive composer card: resize grip · format toolbar · text · footer (AI-propose + Send).
  const composer = el('div', { class: 'chat-composer' },
    makeComposerResizer(input, autoGrow),
    richToolbar(input),
    el('div', { class: 'chat-foot' }, proposeBtn, input, sendBtn));
  teamMainEl.append(list, composer);

  for (const m of teamMsgs) list.appendChild(chatMsgEl(m, teamMe));
  list.scrollTop = list.scrollHeight;
  setTimeout(() => input.focus(), 0);
}

// Runs at launch: if channels are configured, connect the active one in the background.
async function startTeamBackground() {
  await loadTeam();
  if (!teamChannels.length || !teamActive) return;
  const who = await window.gits.teamWhoami();
  teamMe = who.ok ? who.login : null;
  const ch = activeChannel();
  if (ch) {
    teamProfiles = await window.gits.teamProfiles(ch.repo) || {};
    const cache = await window.gits.chatCache({ repo: ch.repo, issue: ch.issue });
    for (const m of (cache.messages || [])) if (!teamFetchedIds.has(m.id)) { teamFetchedIds.add(m.id); teamMsgs.push(m); }
    refreshChatBadge();
    await teamFetch({ initial: true });
  }
  ensureTeamPolling();
}

async function openTeamChat() {
  if (!teamChannels.length && !teamActive) await loadTeam();
  if (!teamMe) { const who = await window.gits.teamWhoami(); teamMe = who.ok ? who.login : null; }
  for (const [sid, s] of sessions) if (s.kind === 'chat') { activate(sid); return sid; }

  const id = `c${++chatSeq}`;
  teamChatId = id;
  teamChannelsEl = el('div', { class: 'chat-channels' });
  teamMainEl = el('div', { class: 'chat-main' });
  const avatarBtn = el('button', { class: 'tiny-btn', title: 'Set your avatar for this team', text: 'Set avatar' });
  avatarBtn.addEventListener('click', async () => {
    const ch = activeChannel();
    if (!ch) { showToast('Open a channel first.'); return; }
    const p = await window.gits.teamPickImage();
    if (!p) return;
    showToast('Updating your avatar…');
    const r = await window.gits.teamSetProfile({ repo: ch.repo, login: teamMe, avatarPath: p });
    if (!r.ok) { showToast(r.error || 'Could not set avatar.'); return; }
    teamProfiles = r.profiles || teamProfiles;
    rerenderMessages();
    showToast('Avatar updated.');
  });
  const pane = el('div', { class: 'term-pane chat-pane', 'data-id': id },
    el('div', { class: 'chat-head' },
      el('span', { class: 'chat-title', text: 'Team chat' }),
      el('div', { class: 'chat-head-right' }, el('span', { class: 'chat-sub', text: teamMe ? `you: ${teamMe}` : '' }), avatarBtn)),
    el('div', { class: 'chat-body2' }, teamChannelsEl, teamMainEl));
  terminalsEl.appendChild(pane);

  const session = { id, kind: 'chat', pane, focusEl: teamMainEl, label: 'Team chat', tabEl: null };
  sessions.set(id, session);
  attachTab(session, { tag: 'chat', tagClass: 'tab-ai chat', tabTitle: 'Team chat' });
  welcomeEl.classList.add('hidden');
  activate(id);

  teamAdding = false;
  renderChannels();
  renderChatMain();
  if (teamActive) loadActiveChannel();
  ensureTeamPolling();
  return id;
}

// ---------------------------------------------------------------------------
// Session persistence — remember terminal + editor tabs across relaunches.
// ---------------------------------------------------------------------------
let persistTimer = null;
let restoringSession = false;
// Saved-session payload: open tabs + group definitions (members referenced by
// their index in `tabs`, so they remap to the right sessions on restore).
function sessionPayload() {
  const tabs = [];
  const idxOf = new Map();
  for (const s of sessions.values()) {
    if (s.kind === 'term') { idxOf.set(s.id, tabs.length); tabs.push({ kind: 'term', cwd: s.cwd, ai: s.ai, label: s.label }); }
    else if (s.kind === 'editor') { idxOf.set(s.id, tabs.length); tabs.push({ kind: 'editor', filePath: s.filePath }); }
  }
  const savedGroups = [];
  let activeGroupIdx = -1;
  for (const g of groups) {
    const members = g.members.map((id) => idxOf.get(id)).filter((i) => i !== undefined);
    if (members.length >= 2) { // only groups whose members survive a restore
      if (g.id === activeGroupId) activeGroupIdx = savedGroups.length;
      savedGroups.push({ name: g.name, cols: g.cols, rows: g.rows, expanded: g.expanded, members });
    }
  }
  return { tabs, groups: savedGroups, activeGroupIdx };
}
function persistSession() {
  if (!settings.restoreTabs || restoringSession) return;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => window.gits.saveSession(sessionPayload()), 400);
}

async function restoreSession() {
  if (!settings.restoreTabs) return;
  const data = await window.gits.loadSession();
  const tabs = (data && Array.isArray(data.tabs)) ? data.tabs : [];
  restoringSession = true; // don't let the per-tab saves clobber the saved groups mid-restore
  const restoredIds = [];
  for (const t of tabs) {
    let id = null;
    try {
      if (t.kind === 'term') id = await openSession(t.cwd, t.label || 'terminal', t.ai);
      else if (t.kind === 'editor') id = await openEditor(t.filePath);
    } catch {}
    restoredIds.push(id);
  }
  // Rebuild the groups from saved tab indices.
  let activeRebuiltId = null;
  const savedGroups = (data && Array.isArray(data.groups)) ? data.groups : [];
  savedGroups.forEach((sg, si) => {
    const members = (sg.members || []).map((i) => restoredIds[i]).filter((id) => id && sessions.has(id));
    if (members.length < 2) return;
    const ng = { id: `tg${++paneGroupSeq}`, name: sg.name || `Group ${groups.length + 1}`, members: members.slice(0, MAX_GROUP), cols: sg.cols ?? 50, rows: sg.rows ?? 50, expanded: !!sg.expanded };
    groups.push(ng);
    if (si === data.activeGroupIdx) activeRebuiltId = ng.id;
  });
  restoringSession = false;
  if (groups.length) {
    renderGroupChips();
    if (activeRebuiltId) activateGroup(activeRebuiltId); else applyLayout();
    persistSession(); // re-save now that the groups are back
  }
}

// ---------------------------------------------------------------------------
// Streams from main
// ---------------------------------------------------------------------------
window.gits.onPtyData(({ id, data }) => {
  const s = sessions.get(id);
  if (!s) return;
  s.term.write(data);
  if (id !== activeId) { s.unread = true; s.tabEl.classList.add('unread'); refreshGroupBadges(); }
});

window.gits.onPtyStatus(({ id, busy, alive }) => {
  const s = sessions.get(id);
  if (!s) return;
  if (!alive) { setStatus(id, 'dead'); return; }
  const wasBusy = s.status === 'busy';
  if (busy) {
    if (!wasBusy) s.busyStart = Date.now();
    setStatus(id, 'busy');
  } else {
    setStatus(id, 'idle');
    // Notify when a *background* session finishes a sustained task (not quick
    // shell commands — only if it was busy for a few seconds).
    if (wasBusy && id !== activeId && s.busyStart && Date.now() - s.busyStart > 4000) {
      notifyFinished(s);
    }
    s.busyStart = null;
  }
});

// A watched file changed on disk (e.g. an AI agent edited it). Reload the editor
// if there are no unsaved edits; otherwise keep the user's edits and warn.
window.gits.onFileChanged(async ({ path }) => {
  for (const s of sessions.values()) {
    if (s.kind !== 'editor' || s.filePath !== path || !s.cm) continue;
    const r = await window.gits.readFile(path);
    if (!r.ok) continue;
    if (r.content === s.cm.getValue()) { s.savedContent = r.content; continue; } // our own save / no real change
    if (s.dirty) { showToast(`"${s.label}" changed on disk — your unsaved edits are kept.`); continue; }
    const cur = s.cm.getCursor();
    s.reloading = true;
    s.cm.setValue(r.content);
    s.reloading = false;
    s.savedContent = r.content;
    try { s.cm.setCursor(cur); } catch {}
    s.dirty = false;
    if (s.tabEl) s.tabEl.classList.remove('dirty');
    showToast(`Reloaded "${s.label}" (changed on disk).`);
  }
});

// System notification when a background agent goes idle after real work.
function notifyFinished(s) {
  try {
    const n = new Notification('Gitsidian — ' + s.label, { body: 'Finished and waiting for you.' });
    n.onclick = () => { activate(s.id); window.focus(); };
  } catch {}
}

// ---------------------------------------------------------------------------
// Keyboard shortcuts (from main: ⌘T/⌘W/⌘K/⌘1-9 on macOS; Ctrl+Shift on others)
// ---------------------------------------------------------------------------
// Opened from the OS (Gitsidian as the file handler, e.g. double-clicked .md).
// Markdown lands in the rendered preview; images in the image pane; the rest in
// the editor. Binary/oversized files fall back to the system default app.
function openExternalFile(filePath) {
  if (!filePath) return;
  welcomeEl.classList.add('hidden');
  if (IMAGE_EXTS.test(filePath)) { openImagePreview(filePath); return; }
  openEditor(filePath, { preview: MD_EXTS.test(filePath) });
}
// From the OS / a deep link: { path, kind: 'terminal' | 'file' }.
window.gits.onOpenItem((item) => {
  if (!item || !item.path) return;
  if (item.kind === 'terminal') { openTerminalAt(item.path); noteTerminalDrop(); }
  else openExternalFile(item.path);
});

// Open a terminal tab rooted at a folder (drag-drop, "Open With", gitsidian://).
function openTerminalAt(dir) {
  welcomeEl.classList.add('hidden');
  openSession(dir, basename(dir) || 'terminal', undefined);
}
// A one-time, honest heads-up: we open a *fresh* terminal here — we can't adopt,
// mirror, or close your existing Terminal/iTerm window (the OS owns that session).
function noteTerminalDrop() {
  if (localStorage.getItem('gits-termdrop-note')) return;
  localStorage.setItem('gits-termdrop-note', '1');
  uiConfirm(
    "Opened a terminal here. <br><br>Heads-up: Gitsidian starts a <b>fresh</b> shell in that folder — it can't take over, mirror, or close your existing Terminal/iTerm window, which stays under your operating system's control. Close that window yourself once you've moved over, and follow any prompts macOS shows.",
    { okLabel: 'Got it' });
}

// Collect real filesystem paths from a drop (Finder files + file:// URIs, e.g. a
// Terminal window's proxy icon, which carries its working directory).
function collectDropPaths(e) {
  const out = [];
  for (const f of (e.dataTransfer.files || [])) { const p = window.gits.pathForFile(f); if (p) out.push(p); }
  if (!out.length) {
    const raw = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || '';
    raw.split(/\r?\n/).forEach((line) => {
      line = line.trim(); if (!line || line.startsWith('#')) return;
      if (/^file:\/\//i.test(line)) { try { out.push(decodeURIComponent(new URL(line).pathname)); } catch {} }
      else if (line.startsWith('/')) out.push(line);
    });
  }
  return [...new Set(out)];
}
// Is this an external (Finder/Terminal) drag, not an internal tree/sidebar one?
function isExternalDrag(e) {
  const t = [...(e.dataTransfer.types || [])];
  return t.includes('Files') || t.includes('public.file-url') || t.includes('text/uri-list');
}
// Shared drop logic: folders open terminals; files insert into the composer (if
// dropped on a terminal) or open in the editor.
async function handleExternalDrop(e, session) {
  const paths = collectDropPaths(e);
  if (!paths.length) return;
  const kinds = await window.gits.pathKinds(paths);
  const dirs = kinds.filter((k) => k.dir).map((k) => k.path);
  const files = kinds.filter((k) => !k.dir && !k.missing).map((k) => k.path);
  for (const d of dirs.slice(0, 6)) await openTerminalAt(d);
  if (dirs.length) noteTerminalDrop();
  if (files.length) {
    if (session && session.composerInsert) session.composerInsert(files.map((p) => (/\s/.test(p) ? `"${p}"` : p)).join(' ') + ' ');
    else openExternalFile(files[0]);
  }
}
// Allow external drops anywhere; open terminals for folders dropped on chrome.
document.addEventListener('dragover', (e) => { if (isExternalDrag(e)) e.preventDefault(); });
document.addEventListener('drop', (e) => { if (isExternalDrag(e)) { e.preventDefault(); handleExternalDrop(e, null); } });

window.gits.onShortcut((action) => {
  if (action === 'new-terminal') {
    openSession(undefined, 'terminal', 'shell');
  } else if (action === 'close-tab') {
    if (activeId) closeSession(activeId);
  } else if (action === 'clear') {
    const s = sessions.get(activeId);
    if (s) { window.gits.ptyInput(s.id, '\x15\x0c'); if (s.composerText) s.composerText.value = ''; }
  } else if (action.startsWith('switch:')) {
    const i = parseInt(action.split(':')[1], 10) - 1;
    const ids = [...sessions.keys()];
    if (ids[i]) activate(ids[i]);
  }
});

// ---------------------------------------------------------------------------
// Window resize -> refit active terminal
// ---------------------------------------------------------------------------
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const s = sessions.get(activeId);
    if (s) fitAndResize(s);
  }, 80);
});

// ---------------------------------------------------------------------------
// Resizable layout — drag the sidebar edge, and the split divider.
// ---------------------------------------------------------------------------
function startDrag(handle, onMove) {
  document.body.classList.add('resizing');
  if (handle) handle.classList.add('dragging');
  const move = (ev) => onMove(ev);
  const up = () => {
    document.body.classList.remove('resizing');
    if (handle) handle.classList.remove('dragging');
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
    saveSettings();      // persist the new width / ratio
    refitTerminals();
  };
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
}

const sidebarResizer = document.getElementById('sidebar-resizer');
sidebarResizer.addEventListener('mousedown', (e) => {
  e.preventDefault();
  startDrag(sidebarResizer, (ev) => {
    // The sidebar starts at the window's left edge, so its width === clientX.
    settings.sidebarWidth = Math.max(200, Math.min(520, Math.round(ev.clientX)));
    applySidebarWidth();
    refitTerminals();
  });
});

// Draggable dividers between quadrant cells (X = columns, Y = rows).
const gridVDivider = el('div', { class: 'grid-divider grid-divider-v hidden', title: 'Drag to resize' });
const gridHDivider = el('div', { class: 'grid-divider grid-divider-h hidden', title: 'Drag to resize' });
terminalsEl.appendChild(gridVDivider);
terminalsEl.appendChild(gridHDivider);
function setupGridDivider(divEl, axis) {
  divEl.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const g = activeGroupId ? groups.find((x) => x.id === activeGroupId) : null;
    if (!g) return;
    const rect = terminalsEl.getBoundingClientRect();
    startDrag(divEl, (ev) => {
      if (axis === 'x') g.cols = Math.max(15, Math.min(85, ((ev.clientX - rect.left) / rect.width) * 100));
      else g.rows = Math.max(15, Math.min(85, ((ev.clientY - rect.top) / rect.height) * 100));
      const n = g.members.filter((id) => sessions.has(id)).length;
      const cols = g.cols ?? 50, rows = g.rows ?? 50;
      terminalsEl.style.gridTemplateColumns = `${cols}% ${100 - cols}%`;
      terminalsEl.style.gridTemplateRows = n <= 2 ? '1fr' : `${rows}% ${100 - rows}%`;
      positionDividers(g, n);
      refitTerminals();
    });
  });
}
setupGridDivider(gridVDivider, 'x');
setupGridDivider(gridHDivider, 'y');

// Light up a group chip when one of its (unfocused) members has new activity.
function refreshGroupBadges() {
  for (const [gid, chip] of groupChipEls) {
    const g = groups.find((x) => x.id === gid);
    if (!g) continue;
    const hot = g.members.some((id) => {
      const s = sessions.get(id);
      if (!s) return false;
      if (gid === activeGroupId && id === activeId) return false; // you're looking at it
      return !!s.unread;
    });
    chip.classList.toggle('has-unread', hot);
  }
}

// ---------------------------------------------------------------------------
// Sidebar buttons + modal
// ---------------------------------------------------------------------------
refreshBtn.addEventListener('click', () => loadProjects({ fetch: true }));
document.getElementById('new-group').addEventListener('click', () => addGroup());
document.getElementById('open-team').addEventListener('click', () => openTeamChat());

addFolderBtn.addEventListener('click', async () => {
  const res = await window.gits.addFolder();
  if (!res.canceled) loadProjects();
});

importBtn.addEventListener('click', () => {
  importStatus.textContent = '';
  importStatus.className = 'import-status';
  importUrl.value = '';
  importName.value = '';
  importModal.classList.remove('hidden');
  importUrl.focus();
});
document.getElementById('import-cancel').addEventListener('click', () => importModal.classList.add('hidden'));
document.getElementById('import-go').addEventListener('click', async () => {
  const url = importUrl.value.trim();
  if (!url) { importStatus.textContent = 'Enter a repository URL.'; importStatus.className = 'import-status err'; return; }
  importStatus.textContent = 'Cloning… this can take a minute for large repos.';
  importStatus.className = 'import-status';
  const res = await window.gits.cloneVault({ url, name: importName.value.trim() || null });
  if (res.canceled) { importStatus.textContent = 'Cancelled.'; return; }
  if (res.ok) {
    importStatus.textContent = `Cloned to ${res.path}`;
    importStatus.className = 'import-status ok';
    await loadProjects();
    setTimeout(() => importModal.classList.add('hidden'), 1200);
  } else {
    importStatus.textContent = res.error || 'Clone failed.';
    importStatus.className = 'import-status err';
  }
});

// ---------------------------------------------------------------------------
// Publish to GitHub
// ---------------------------------------------------------------------------
function openPublish(p) {
  publishCtx = p;
  publishName.value = p.name;
  publishIntro.textContent = p.git && p.git.isRepo
    ? `"${p.name}" is tracked by git locally but isn't on GitHub. This creates a GitHub repo and pushes your history to it.`
    : `"${p.name}" isn't version-controlled yet. This will initialise git, make an initial commit, then create a GitHub repo and push.`;
  publishStatus.textContent = '';
  publishStatus.className = 'import-status';
  document.querySelector('input[name=vis][value=private]').checked = true;
  publishModal.classList.remove('hidden');
  publishName.focus();
}

document.getElementById('publish-cancel').addEventListener('click', () => publishModal.classList.add('hidden'));
document.getElementById('publish-go').addEventListener('click', async () => {
  const name = publishName.value.trim();
  if (!name) { publishStatus.textContent = 'Enter a repository name.'; publishStatus.className = 'import-status err'; return; }
  const isPrivate = document.querySelector('input[name=vis]:checked').value === 'private';
  publishStatus.textContent = 'Publishing… initialising (if needed), creating the repo, and pushing.';
  publishStatus.className = 'import-status';
  const res = await window.gits.publish({ path: publishCtx.path, name, isPrivate });
  if (res.ok) {
    publishStatus.innerHTML = '';
    const link = el('a', { text: res.url });
    link.addEventListener('click', () => window.gits.openUrl(res.url));
    publishStatus.append(document.createTextNode('Published ✓  '), link);
    publishStatus.className = 'import-status ok';
    await loadProjects({ fetch: true });
    setTimeout(() => publishModal.classList.add('hidden'), 3000);
  } else {
    publishStatus.textContent = res.error || 'Publish failed.';
    publishStatus.className = 'import-status err';
  }
});

// ---------------------------------------------------------------------------
// Push changes (sync) — with public-repo / permission safety warnings
// ---------------------------------------------------------------------------
const syncModal = document.getElementById('sync-modal');
const syncBanner = document.getElementById('sync-banner');
const syncRepo = document.getElementById('sync-repo');
const syncState = document.getElementById('sync-state');
const syncPushSection = document.getElementById('sync-push-section');
const syncMessage = document.getElementById('sync-message');
const syncFiles = document.getElementById('sync-files');
const syncPull = document.getElementById('sync-pull');
const syncGo = document.getElementById('sync-go');
const syncStatus = document.getElementById('sync-status');
const syncSuggest = document.getElementById('sync-suggest');
let syncCtx = null;

// Suggest a commit message from the pending changes (uses a local AI CLI if
// present, else a name-based summary).
syncSuggest.addEventListener('click', async () => {
  if (!syncCtx) return;
  syncSuggest.disabled = true;
  const old = syncSuggest.textContent;
  syncSuggest.textContent = 'Thinking…';
  const r = await window.gits.commitMessage(syncCtx.path);
  syncSuggest.textContent = old;
  syncSuggest.disabled = false;
  if (r.ok && r.message) {
    syncMessage.value = r.message;
    if (r.source === 'summary') showToast('Suggested from your changed files (no AI CLI detected).');
  } else {
    showToast(r.error || 'Could not suggest a message.');
  }
});

async function openSync(p) {
  syncCtx = p;
  syncModal.classList.remove('hidden');
  syncRepo.textContent = p.path;
  syncMessage.value = 'Update via Gitsidian';
  syncStatus.textContent = '';
  syncStatus.className = 'import-status';
  syncFiles.textContent = '';
  syncBanner.className = 'risk-banner';
  syncBanner.textContent = 'Checking repository…';
  syncGo.disabled = true;
  syncGo.classList.remove('danger', 'hidden');
  syncGo.textContent = 'Commit & Push';
  syncPushSection.classList.remove('hidden');

  // State line + Pull button come from the project's git status — so pull is
  // always available when behind, regardless of push permission.
  const g = p.git || {};
  const parts = [];
  if (g.behind > 0) parts.push(`${g.behind} behind`);
  if (g.ahead > 0) parts.push(`${g.ahead} ahead`);
  if (g.dirty) parts.push(`${g.changedCount} local change${g.changedCount === 1 ? '' : 's'}`);
  syncState.textContent = parts.join('  ·  ');
  if (g.behind > 0) {
    syncPull.classList.remove('hidden');
    syncPull.textContent = `⬇ Pull latest (${g.behind})`;
  } else {
    syncPull.classList.add('hidden');
  }

  const info = await window.gits.repoInfo(p.path);
  if (info.changedFiles && info.changedFiles.length) {
    const shown = info.changedFiles.slice(0, 12).join('\n');
    const more = info.changedFiles.length > 12 ? `\n…and ${info.changedFiles.length - 12} more` : '';
    syncFiles.textContent = shown + more;
  }

  // Hide the push controls when pushing isn't possible — pull stays usable.
  const disablePush = (html) => {
    syncBanner.className = 'risk-banner danger';
    syncBanner.innerHTML = html;
    syncPushSection.classList.add('hidden');
    syncGo.classList.add('hidden');
  };

  if (!info.hasOrigin) { disablePush('This repo has no GitHub remote — publish it first.'); return; }
  if (info.viewerPermission && !info.canPush) {
    disablePush(`You only have <b>read</b> access to <b>${info.nameWithOwner || 'this repo'}</b>, so pushing is disabled. You can still <b>pull</b> the latest below.`);
    return;
  }
  if (info.visibility === 'PUBLIC') {
    syncBanner.className = 'risk-banner danger';
    const notOwner = info.isOwn ? '' : ' You are <b>not the owner</b> — only push if you are certain these changes belong here.';
    syncBanner.innerHTML = `<b>${info.nameWithOwner || p.name}</b> is a <b>PUBLIC</b> repository. Committing &amp; pushing makes your changes public immediately and may affect anyone using it.${notOwner}`;
    syncGo.textContent = 'I understand — push to PUBLIC repo';
    syncGo.classList.add('danger');
    syncGo.disabled = false;
    return;
  }
  // Private (or internal) and you can write — the easy, friendly path.
  syncBanner.className = 'risk-banner ok';
  syncBanner.innerHTML = `Private repo${info.nameWithOwner ? ` <b>${info.nameWithOwner}</b>` : ''} — safe to update. Your changes will be committed and pushed.`;
  syncGo.disabled = false;
}

// Pull latest into a project's folder (fast-forward only — safe even for
// public repos you only have read access to).
async function doPull(p) {
  showToast(`Getting latest for ${p.name}…`);
  const res = await window.gits.pull(p.path);
  if (res.ok) {
    showToast(res.upToDate ? `${p.name} is already up to date.` : `${p.name} updated to latest ✓`);
    await loadProjects({ fetch: true });
  } else {
    showToast(res.error || 'Pull failed.');
  }
}

// Pull preview: show incoming files + size before pulling.
function humanBytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}
const pullModal = document.getElementById('pull-modal');
const pullSummary = document.getElementById('pull-summary');
const pullFiles = document.getElementById('pull-files');
const pullStatus = document.getElementById('pull-status');
const pullGo = document.getElementById('pull-go');
let pullCtx = null;

async function openPullPreview(p) {
  pullCtx = p;
  pullModal.classList.remove('hidden');
  pullSummary.textContent = 'Checking GitHub for changes…';
  pullFiles.textContent = '';
  pullStatus.textContent = '';
  pullStatus.className = 'import-status';
  pullGo.disabled = true;
  const pre = await window.gits.pullPreview(p.path);
  if (!pre.ok) { pullSummary.textContent = pre.error || 'Could not check.'; return; }
  if (!pre.behind) { pullSummary.textContent = `"${p.name}" is already up to date.`; return; }
  const icon = (s) => (s === 'A' ? '+' : s === 'D' ? '−' : s === 'R' ? '→' : '~');
  const shown = pre.files.slice(0, 60).map((f) => `${icon(f.status)} ${f.file}${f.size ? `  (${humanBytes(f.size)})` : ''}`).join('\n');
  const more = pre.truncated || pre.files.length > 60 ? `\n…and more` : '';
  pullFiles.textContent = shown + more;
  pullSummary.innerHTML = `<b>${pre.behind}</b> commit${pre.behind === 1 ? '' : 's'} · <b>${pre.files.length}</b> file${pre.files.length === 1 ? '' : 's'} · about <b>${humanBytes(pre.bytes)}</b> will update in this folder.`;
  pullGo.disabled = false;
}

document.getElementById('pull-cancel').addEventListener('click', () => pullModal.classList.add('hidden'));
pullGo.addEventListener('click', async () => {
  pullGo.disabled = true;
  pullStatus.textContent = 'Pulling…';
  pullStatus.className = 'import-status';
  const res = await window.gits.pull(pullCtx.path);
  if (res.ok) {
    pullStatus.textContent = 'Pulled ✓';
    pullStatus.className = 'import-status ok';
    await loadProjects({ fetch: true });
    setTimeout(() => pullModal.classList.add('hidden'), 1000);
  } else {
    pullStatus.textContent = res.error || 'Pull failed.';
    pullStatus.className = 'import-status err';
  }
});

document.getElementById('sync-cancel').addEventListener('click', () => syncModal.classList.add('hidden'));
syncPull.addEventListener('click', async () => {
  syncPull.disabled = true;
  syncStatus.textContent = 'Pulling latest…';
  syncStatus.className = 'import-status';
  const res = await window.gits.pull(syncCtx.path);
  if (res.ok) {
    syncStatus.textContent = res.upToDate ? 'Already up to date.' : 'Pulled latest ✓';
    syncStatus.className = 'import-status ok';
    await loadProjects({ fetch: true });
    setTimeout(() => syncModal.classList.add('hidden'), 1200);
  } else {
    syncStatus.textContent = res.error || 'Pull failed.';
    syncStatus.className = 'import-status err';
  }
  syncPull.disabled = false;
});
syncGo.addEventListener('click', async () => {
  const message = syncMessage.value.trim() || 'Update via Gitsidian';
  syncGo.disabled = true;
  syncStatus.textContent = 'Committing and pushing…';
  syncStatus.className = 'import-status';
  const res = await window.gits.sync({ path: syncCtx.path, message });
  if (res.ok) {
    syncStatus.textContent = res.committed ? 'Committed & pushed ✓' : 'Pushed ✓';
    syncStatus.className = 'import-status ok';
    await loadProjects({ fetch: true });
    setTimeout(() => syncModal.classList.add('hidden'), 1500);
  } else {
    syncStatus.textContent = res.error || 'Push failed.';
    syncStatus.className = 'import-status err';
    syncGo.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Open in Obsidian (with explanation + options)
// ---------------------------------------------------------------------------
const obsidianModal = document.getElementById('obsidian-modal');
const obsIntro = document.getElementById('obs-intro');
const obsOptions = document.getElementById('obs-options');
const obsExclude = document.getElementById('obs-exclude');
let obsCtx = null;

const obsGoBtn = document.getElementById('obs-go');
let obsMode = 'open'; // 'open' | 'restart'

function openObsidianDialog(p) {
  obsCtx = p;
  obsMode = 'open';
  obsGoBtn.textContent = 'Open in Obsidian';
  const isVault = p.source === 'obsidian';
  obsIntro.textContent = isVault
    ? `"${p.name}" is already an Obsidian vault — this opens it in Obsidian.`
    : `This adds "${p.name}" to Obsidian as a vault so you can browse and link its notes. It won't change any of your files.`;
  obsOptions.style.display = isVault ? 'none' : '';
  obsExclude.checked = true;
  obsidianModal.classList.remove('hidden');
}

document.getElementById('obs-cancel').addEventListener('click', () => obsidianModal.classList.add('hidden'));
obsGoBtn.addEventListener('click', async () => {
  if (obsMode === 'restart') {
    obsidianModal.classList.add('hidden');
    showToast(`Reopening Obsidian with ${obsCtx.name}…`);
    await window.gits.obsidianRestartOpen(obsCtx.path);
    return;
  }
  const excludeNoise = obsCtx.source !== 'obsidian' && obsExclude.checked;
  const res = await window.gits.openObsidian({ path: obsCtx.path, excludeNoise });
  if (res && res.reason === 'restart-needed') {
    // Obsidian is open and won't see a new vault until it restarts.
    obsIntro.textContent = `Obsidian is already open, and it only picks up new vaults when it starts. Reopen Obsidian to open "${obsCtx.name}" now — or add it later from Obsidian's vault switcher.`;
    obsOptions.style.display = 'none';
    obsGoBtn.textContent = 'Quit & reopen Obsidian';
    obsMode = 'restart';
    return;
  }
  obsidianModal.classList.add('hidden');
  showToast(`Opening ${obsCtx.name} in Obsidian…`);
});

// ---------------------------------------------------------------------------
// Find repos (auto-discovery)
// ---------------------------------------------------------------------------
const discoverModal = document.getElementById('discover-modal');
const discoverList = document.getElementById('discover-list');
const discoverIntro = document.getElementById('discover-intro');
const discoverAll = document.getElementById('discover-all');

function prettyPath(p) { return p.replace(/^\/Users\/[^/]+/, '~'); }

document.getElementById('find-repos').addEventListener('click', async () => {
  discoverModal.classList.remove('hidden');
  discoverList.innerHTML = '';
  discoverIntro.textContent = 'Scanning your home folder for git repos and Obsidian vaults…';
  discoverAll.checked = false;
  const repos = await window.gits.scanRepos();
  renderDiscover(repos);
});

function renderDiscover(repos) {
  discoverList.innerHTML = '';
  if (!repos.length) {
    discoverIntro.textContent = 'No git repos or Obsidian vaults found in the usual places.';
    return;
  }
  const loaded = new Set([...projectIndex.keys()].filter((p) => !layout.hidden.includes(p)));
  let newCount = 0;
  for (const r of repos) {
    const already = loaded.has(r.path);
    if (!already) newCount++;
    const cb = el('input', { type: 'checkbox' });
    cb.dataset.path = r.path;
    cb.checked = !already;
    cb.disabled = already;
    const badges = el('span', { class: 'repo-badges' });
    if (r.git) badges.appendChild(el('span', { class: 'repo-badge git', text: 'git' }));
    if (r.obsidian) badges.appendChild(el('span', { class: 'repo-badge obs', text: 'obsidian' }));
    const row = el('label', { class: `repo-row${already ? ' loaded' : ''}`, title: r.path },
      cb,
      el('span', { class: 'repo-name', text: r.name }),
      badges,
      el('span', { class: 'repo-path', text: prettyPath(r.path) }),
      already ? el('span', { class: 'repo-added', text: 'added' }) : null
    );
    discoverList.appendChild(row);
  }
  discoverIntro.textContent = `Found ${repos.length} — ${newCount} new, ${repos.length - newCount} already added.`;
}

discoverAll.addEventListener('change', () => {
  discoverList.querySelectorAll('input[type=checkbox]:not(:disabled)')
    .forEach((cb) => { cb.checked = discoverAll.checked; });
});
document.getElementById('discover-cancel').addEventListener('click', () => discoverModal.classList.add('hidden'));
document.getElementById('discover-add').addEventListener('click', async () => {
  const selected = [...discoverList.querySelectorAll('input[type=checkbox]:checked')].map((cb) => cb.dataset.path);
  discoverModal.classList.add('hidden');
  if (!selected.length) return;
  await window.gits.addPaths(selected);
  // Re-adding a previously-hidden project should bring it back.
  layout.hidden = layout.hidden.filter((p) => !selected.includes(p));
  saveLayout();
  await loadProjects();
  showToast(`Added ${selected.length} project${selected.length === 1 ? '' : 's'}.`);
});

// ---------------------------------------------------------------------------
// GitHub account switcher (title-bar chip)
// ---------------------------------------------------------------------------
const accountChip = document.getElementById('account-chip');
const acctName = document.getElementById('acct-name');
const accountMenu = document.getElementById('account-menu');
let ghAccounts = [];

async function loadAccounts() {
  const res = await window.gits.ghAccounts();
  if (!res.installed) {
    acctName.textContent = 'gh not installed';
    accountChip.classList.add('disabled');
    ghAccounts = [];
    return;
  }
  ghAccounts = res.accounts || [];
  const active = ghAccounts.find((a) => a.active);
  acctName.textContent = active ? active.login : (ghAccounts.length ? ghAccounts[0].login : 'Sign in');
}

function renderAccountMenu() {
  accountMenu.innerHTML = '';
  if (!ghAccounts.length) {
    accountMenu.appendChild(el('div', { class: 'acct-empty' }, 'No GitHub accounts signed in.'));
  }
  for (const a of ghAccounts) {
    const item = el('div', { class: `acct-item${a.active ? ' active' : ''}` },
      el('span', { class: 'acct-check', text: a.active ? '✓' : '' }),
      el('span', { class: 'acct-login', text: a.login })
    );
    if (!a.active) item.addEventListener('click', () => switchAccount(a.login));
    accountMenu.appendChild(item);
  }
  const active = ghAccounts.find((a) => a.active);
  if (active) {
    const prof = el('div', { class: 'acct-item' },
      el('span', { class: 'acct-check', text: '↗' }), el('span', {}, `Open ${active.login} on GitHub`));
    prof.addEventListener('click', () => { accountMenu.classList.add('hidden'); window.gits.openUrl(`https://github.com/${active.login}`); });
    accountMenu.appendChild(prof);
  }
  const add = el('div', { class: 'acct-item add' },
    el('span', { class: 'acct-check', text: '+' }), el('span', {}, 'Add account…'));
  add.addEventListener('click', addAccount);
  accountMenu.appendChild(add);
  const refresh = el('div', { class: 'acct-item' },
    el('span', { class: 'acct-check', text: '⟳' }), el('span', {}, 'Refresh'));
  refresh.addEventListener('click', async () => { await loadAccounts(); renderAccountMenu(); });
  accountMenu.appendChild(refresh);
}

function positionAccountMenu() {
  const r = accountChip.getBoundingClientRect();
  accountMenu.style.top = `${r.bottom + 4}px`;
  accountMenu.style.right = `${window.innerWidth - r.right}px`;
}

accountChip.addEventListener('click', (e) => {
  e.stopPropagation();
  if (accountChip.classList.contains('disabled')) return;
  const opening = accountMenu.classList.contains('hidden');
  if (opening) { renderAccountMenu(); positionAccountMenu(); }
  accountMenu.classList.toggle('hidden');
});
accountMenu.addEventListener('click', (e) => e.stopPropagation());
document.addEventListener('click', () => accountMenu.classList.add('hidden'));

async function switchAccount(login) {
  accountMenu.classList.add('hidden');
  showToast(`Switching GitHub account to ${login}…`);
  const res = await window.gits.ghSwitch(login);
  if (res.ok) {
    await loadAccounts();
    showToast(`GitHub account: ${login}`);
    await loadProjects({ fetch: true }); // permissions/visibility may have changed
  } else {
    showToast(res.error || 'Switch failed.');
  }
}

async function addAccount() {
  accountMenu.classList.add('hidden');
  const id = await openSession(undefined, 'gh login', 'shell');
  if (id) setTimeout(() => window.gits.ptyInput(id, 'gh auth login\r'), 400);
  showToast('Follow the prompts in the new terminal, then click your account chip → Refresh.');
}

// ---------------------------------------------------------------------------
// Add a custom AI command
// ---------------------------------------------------------------------------
const addaiModal = document.getElementById('addai-modal');
const addaiName = document.getElementById('addai-name');
const addaiCmd = document.getElementById('addai-cmd');
const addaiStatus = document.getElementById('addai-status');

function openAddAi() {
  addaiName.value = '';
  addaiCmd.value = '';
  addaiStatus.textContent = '';
  addaiStatus.className = 'import-status';
  addaiModal.classList.remove('hidden');
  addaiName.focus();
}
document.getElementById('addai-cancel').addEventListener('click', () => addaiModal.classList.add('hidden'));
document.getElementById('addai-go').addEventListener('click', async () => {
  const name = addaiName.value.trim();
  const command = addaiCmd.value.trim();
  if (!name || !command) { addaiStatus.textContent = 'Enter a name and a command.'; addaiStatus.className = 'import-status err'; return; }
  addaiStatus.textContent = 'Checking…';
  addaiStatus.className = 'import-status';
  const res = await window.gits.addAi({ name, command });
  if (res.ok) {
    addaiModal.classList.add('hidden');
    await loadAis(res.id); // refresh + select the new one
    showToast(`Added "${name}". New sessions can use it now.`);
  } else {
    addaiStatus.textContent = res.error || 'Could not add command.';
    addaiStatus.className = 'import-status err';
  }
});

// ---------------------------------------------------------------------------
// Auto-update — surface a new release and (on approval) download + hand off to
// the installer. Nothing is downloaded or installed without an explicit click.
// ---------------------------------------------------------------------------
const updateModal = document.getElementById('update-modal');
const updateTitle = document.getElementById('update-title');
const updateSub = document.getElementById('update-sub');
const updateNotes = document.getElementById('update-notes');
const updateProgressWrap = document.getElementById('update-progress-wrap');
const updateProgressBar = document.getElementById('update-progress-bar');
const updateStatus = document.getElementById('update-status');
const updateGo = document.getElementById('update-go');
const updateLater = document.getElementById('update-later');
let updateCtx = null;
let updatePhase = 'offer'; // 'offer' (download/install) → 'finish' (quit to apply)
// Release-note links open in the browser, not navigate the app window.
updateNotes.addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (a) { e.preventDefault(); const h = a.getAttribute('href'); if (/^https?:\/\//.test(h)) window.gits.openUrl(h); }
});
let updateChecking = false;

// Always-visible version label in the sidebar footer. Click → check for updates.
const versionLine = document.getElementById('app-version');
window.gits.appVersion().then((v) => { versionLine.textContent = `Gitsidian ${v}`; });
versionLine.addEventListener('click', () => checkForUpdates({ silent: false }));

window.gits.onUpdateProgress(({ frac }) => {
  updateProgressWrap.classList.remove('hidden');
  updateProgressBar.style.width = `${Math.round((frac || 0) * 100)}%`;
});

// Check for a newer release. `silent` suppresses the "you're up to date" toast
// (used by the automatic on-launch check).
async function checkForUpdates({ silent = false } = {}) {
  if (updateChecking) return;
  updateChecking = true;
  try {
    const res = await window.gits.checkUpdate();
    if (!res.ok) { if (!silent) showToast(res.error || 'Update check failed.'); return; }
    if (!res.updateAvailable) {
      versionLine.classList.remove('update');
      versionLine.textContent = `Gitsidian ${res.current}`;
      versionLine.title = 'Click to check for updates';
      if (!silent) showToast(`You're on the latest version (${res.current}).`);
      return;
    }
    // Flag the always-visible version line so a new release is noticeable.
    versionLine.classList.add('update');
    versionLine.textContent = `Update to ${res.latest} →`;
    versionLine.title = `Version ${res.latest} is available (you have ${res.current})`;
    updateCtx = res;
    updateTitle.textContent = `Update available — ${res.latest}`;
    updateSub.textContent = res.asset
      ? `You have ${res.current}. Download and install ${res.latest}?`
      : `You have ${res.current}. Open the releases page to download ${res.latest}.`;
    updateNotes.innerHTML = renderMarkdown((res.notes || '').trim().slice(0, 4000));
    updateProgressWrap.classList.add('hidden');
    updateProgressBar.style.width = '0%';
    updateStatus.textContent = '';
    updateStatus.className = 'import-status';
    updatePhase = 'offer';
    updateGo.textContent = res.asset ? 'Update now' : 'Open releases page';
    updateGo.disabled = false;
    updateLater.textContent = 'Later';
    updateLater.disabled = false;
    settingsModal.classList.add('hidden'); // don't stack over the Settings dialog
    updateModal.classList.remove('hidden');
  } finally {
    updateChecking = false;
  }
}

updateLater.addEventListener('click', () => updateModal.classList.add('hidden'));
updateGo.addEventListener('click', async () => {
  if (updatePhase === 'finish') { window.gits.quitApp(); return; } // after install: quit to apply
  if (!updateCtx) return;
  // No installer for this platform → just open the releases page.
  if (!updateCtx.asset) {
    window.gits.openUrl(updateCtx.htmlUrl);
    updateModal.classList.add('hidden');
    return;
  }
  updateGo.disabled = true;
  updateLater.disabled = true;
  updateStatus.textContent = 'Downloading…';
  updateStatus.className = 'import-status';
  const dl = await window.gits.downloadUpdate(updateCtx.asset, updateCtx.latest);
  if (!dl.ok) {
    updateStatus.textContent = dl.error || 'Download failed.';
    updateStatus.className = 'import-status err';
    updateGo.disabled = false;
    updateLater.disabled = false;
    return;
  }
  const ins = await window.gits.installUpdate(dl.path);
  if (!ins.ok) {
    updateStatus.textContent = ins.error || 'Could not open the installer.';
    updateStatus.className = 'import-status err';
    updateGo.disabled = false;
    updateLater.disabled = false;
    return;
  }
  // Manual install (unsigned build): guide the user through the drag + relaunch.
  const isMac = window.gits.platform === 'darwin';
  updateNotes.innerHTML = renderMarkdown(isMac
    ? `**Installer opened** (and revealed in your Downloads):\n\n1. Drag **Gitsidian** onto the **Applications** folder and replace the old version.\n2. Quit Gitsidian (button below), then reopen it from Applications.\n\nThe downloaded file is in **Downloads** — Gitsidian removes the previous one automatically, and offers to delete this one after you update.`
    : `**Installer opened** (and revealed in your Downloads). Run it to finish, then reopen Gitsidian. The previous download is removed automatically.`);
  updateStatus.textContent = '';
  updateSub.textContent = `Finishing update to ${updateCtx.latest}…`;
  updateGo.textContent = 'Quit Gitsidian to finish';
  updateGo.disabled = false;
  updateLater.textContent = 'Close';
  updateLater.disabled = false;
  updatePhase = 'finish';
});

// ---------------------------------------------------------------------------
// Settings modal
// ---------------------------------------------------------------------------
const settingsModal = document.getElementById('settings-modal');
document.getElementById('open-settings').addEventListener('click', () => {
  const wrap = document.getElementById('settings-accents');
  const themeGrid = document.getElementById('settings-themes');
  const accentColor = document.getElementById('settings-accent-hex');
  const accentText = document.getElementById('settings-accent-hexin');
  const bgColor = document.getElementById('settings-bg-hex');
  const bgText = document.getElementById('settings-bg-hexin');
  // Keep the custom-colour fields mirroring whatever is active (preset or custom).
  const syncCustomFields = () => {
    const ah = settings.accent === 'custom' ? settings.accentHex : (ACCENTS[settings.accent] || ACCENTS.crimson)[0];
    const bh = settings.theme === 'custom' ? settings.bgHex : (THEMES[settings.theme] || THEMES.midnight).bg;
    accentColor.value = ah; accentText.value = ah; bgColor.value = bh; bgText.value = bh;
  };
  const markAccent = () => [...wrap.children].forEach((c) => c.classList.toggle('active', settings.accent !== 'custom' && c.title === settings.accent));
  const markTheme = () => [...themeGrid.children].forEach((c) => c.classList.toggle('active', c.dataset.themeKey === settings.theme));

  wrap.innerHTML = '';
  for (const [key, [a]] of Object.entries(ACCENTS)) {
    const sw = el('div', { class: `swatch${key === settings.accent ? ' active' : ''}`, title: key });
    sw.style.background = a;
    sw.addEventListener('click', () => {
      settings.accent = key; saveSettings(); applyAccent();
      markAccent(); syncCustomFields();
    });
    wrap.appendChild(sw);
  }
  const font = document.getElementById('settings-font');
  const fontVal = document.getElementById('settings-font-val');
  font.value = settings.fontSize;
  fontVal.textContent = `${settings.fontSize}px`;
  font.oninput = () => {
    settings.fontSize = parseFloat(font.value);
    fontVal.textContent = `${settings.fontSize}px`;
    saveSettings(); applyFontSize();
  };
  const bold = document.getElementById('settings-bold');
  bold.checked = settings.bold;
  bold.onchange = () => { settings.bold = bold.checked; saveSettings(); applyFontStyle(); };
  const italic = document.getElementById('settings-italic');
  italic.checked = settings.italic;
  italic.onchange = () => { settings.italic = italic.checked; saveSettings(); applyFontStyle(); };
  const compactTabs = document.getElementById('settings-compact-tabs');
  if (compactTabs) { compactTabs.checked = settings.hideTabLabels; compactTabs.onchange = () => { settings.hideTabLabels = compactTabs.checked; saveSettings(); applyTabLabels(); }; }
  const hideTags = document.getElementById('settings-hide-tags');
  if (hideTags) { hideTags.checked = settings.hideTabTags; hideTags.onchange = () => { settings.hideTabTags = hideTags.checked; saveSettings(); applyTabLabels(); }; }
  const sb = document.getElementById('settings-scrollback');
  sb.value = String(settings.scrollback);
  sb.onchange = () => { settings.scrollback = parseInt(sb.value, 10); saveSettings(); }; // applies to new terminals
  themeGrid.innerHTML = '';
  const dotColor = settings.accent === 'custom' ? settings.accentHex : (ACCENTS[settings.accent] || ACCENTS.crimson)[1];
  for (const [key, t] of Object.entries(THEMES)) {
    const sw = el('div', { class: `theme-swatch${key === settings.theme ? ' active' : ''}`, title: t.label, 'data-theme-key': key });
    sw.appendChild(el('div', { class: 'theme-chip', style: `background:${t.bg}` },
      el('span', { class: 'theme-dot', style: `background:${dotColor}` })));
    sw.appendChild(el('div', { class: 'theme-name', text: t.label }));
    sw.addEventListener('click', () => {
      settings.theme = key; saveSettings(); applyTheme();
      markTheme(); syncCustomFields();
    });
    themeGrid.appendChild(sw);
  }
  // Custom hex pickers — picking a colour switches accent/theme to "custom".
  const applyCustomAccent = (hex) => {
    if (!isHex(hex)) { syncCustomFields(); return; }
    settings.accent = 'custom'; settings.accentHex = normHex(hex); saveSettings(); applyAccent();
    markAccent(); syncCustomFields();
  };
  const applyCustomBg = (hex) => {
    if (!isHex(hex)) { syncCustomFields(); return; }
    settings.theme = 'custom'; settings.bgHex = normHex(hex); saveSettings(); applyTheme();
    markTheme(); syncCustomFields();
  };
  syncCustomFields();
  accentColor.oninput = () => applyCustomAccent(accentColor.value);
  accentText.onchange = () => applyCustomAccent(accentText.value);
  bgColor.oninput = () => applyCustomBg(bgColor.value);
  bgText.onchange = () => applyCustomBg(bgText.value);
  const restore = document.getElementById('settings-restore');
  restore.checked = settings.restoreTabs;
  restore.onchange = () => { settings.restoreTabs = restore.checked; saveSettings(); if (restore.checked) persistSession(); };

  // Files — default Markdown app.
  const mdBtn = document.getElementById('settings-md-default');
  const mdStatus = document.getElementById('settings-md-status');
  if (mdBtn) {
    const refreshMd = async () => {
      const info = await window.gits.markdownDefaultInfo();
      if (info.platform !== 'darwin') {
        mdBtn.disabled = true;
        mdStatus.textContent = info.platform === 'win32'
          ? 'On Windows, set this in Settings → Apps → Default apps.'
          : 'On Linux, use xdg-mime / your file manager.';
        return;
      }
      mdBtn.disabled = false;
      if (info.isDefault) { mdBtn.textContent = 'Gitsidian is your Markdown app ✓'; mdBtn.disabled = true; mdStatus.textContent = ''; }
      else { mdBtn.textContent = 'Make Gitsidian my Markdown app'; mdStatus.textContent = ''; }
    };
    refreshMd();
    mdBtn.onclick = async () => {
      mdBtn.disabled = true; mdStatus.textContent = 'Setting…';
      const r = await window.gits.setMarkdownDefault();
      if (r.ok) { mdStatus.textContent = ''; showToast('Gitsidian is now your default for Markdown.'); refreshMd(); return; }
      mdBtn.disabled = false;
      if (r.needsDuti) {
        mdStatus.textContent = '';
        const go = await uiConfirm(
          "macOS has no built-in switch for this, so Gitsidian uses the small <b>duti</b> tool — which isn't installed.<br><br>" +
          "Install it with <code>brew install duti</code> then try again, or set it manually: in Finder, right-click any <code>.md</code> file → " +
          "<b>Get Info</b> → <b>Open with</b> → choose <b>Gitsidian</b> → <b>Change All…</b>",
          { okLabel: 'Copy brew command' });
        if (go === true) { window.gits.copyText('brew install duti'); showToast('Copied: brew install duti'); }
      } else {
        mdStatus.textContent = r.error || 'Could not set the default.';
      }
    };
  }
  const gitsBtn = document.getElementById('settings-gits-cmd');
  if (gitsBtn) {
    gitsBtn.onclick = () => {
      window.gits.copyText('gits() { open "gitsidian://terminal?cwd=$(pwd)"; }');
      const st = document.getElementById('settings-gits-status');
      if (st) st.textContent = 'Copied — paste into ~/.zshrc, then run: gits';
      showToast("Copied. Add it to ~/.zshrc, reload, and run 'gits' in any folder.");
    };
  }
  const auto = document.getElementById('settings-autoupdate');
  auto.checked = settings.autoUpdate;
  auto.onchange = () => { settings.autoUpdate = auto.checked; saveSettings(); };
  const cmds = document.getElementById('settings-chatcommands');
  if (cmds) { cmds.checked = settings.allowChatCommands; cmds.onchange = () => { settings.allowChatCommands = cmds.checked; saveSettings(); }; }
  const ver = document.getElementById('settings-version');
  window.gits.appVersion().then((v) => { ver.textContent = `Current version ${v}`; });
  const checkBtn = document.getElementById('settings-check-update');
  checkBtn.onclick = async () => {
    checkBtn.disabled = true;
    const old = checkBtn.textContent;
    checkBtn.textContent = 'Checking…';
    await checkForUpdates({ silent: false });
    checkBtn.textContent = old;
    checkBtn.disabled = false;
  };

  // Team — display-name alias (stored in the hub's members.json, same as avatars).
  const aliasInput = document.getElementById('settings-alias');
  const aliasSave = document.getElementById('settings-alias-save');
  const aliasHint = document.getElementById('settings-alias-hint');
  const aliasRepo = (activeChannel() && activeChannel().repo) || (teamChannels[0] && teamChannels[0].repo) || null;
  aliasInput.value = (teamMe && teamProfiles[teamMe] && teamProfiles[teamMe].alias) || '';
  const noTeam = !aliasRepo || !teamMe;
  aliasInput.disabled = noTeam;
  aliasSave.disabled = noTeam;
  if (noTeam) aliasHint.textContent = 'Set up Team chat first (chat icon in the sidebar), then choose a display name here.';
  aliasSave.onclick = async () => {
    aliasSave.disabled = true;
    const r = await window.gits.teamSetProfile({ repo: aliasRepo, login: teamMe, alias: aliasInput.value.trim() });
    aliasSave.disabled = false;
    if (!r.ok) { showToast(r.error || 'Could not save your name.'); return; }
    teamProfiles = r.profiles || teamProfiles;
    rerenderMessages();
    showToast('Display name saved.');
  };

  // Section tabs.
  const tabs = [...document.querySelectorAll('.settings-tab')];
  const secs = [...document.querySelectorAll('.settings-sec')];
  tabs.forEach((tab) => { tab.onclick = () => {
    tabs.forEach((t) => t.classList.toggle('active', t === tab));
    secs.forEach((s) => s.classList.toggle('hidden', s.dataset.sec !== tab.dataset.sec));
  }; });
  tabs[0].click(); // default to Appearance each open

  settingsModal.classList.remove('hidden');
});
document.getElementById('settings-close').addEventListener('click', () => settingsModal.classList.add('hidden'));

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Command palette (Cmd/Ctrl+P) — fuzzy-open files in the active project + actions.
// ---------------------------------------------------------------------------
let paletteEl = null, paletteInput = null, paletteListEl = null;
let paletteFiles = [], paletteRoot = null, paletteRows = [], paletteSel = 0;

// Which project the palette searches: the active tab's repo/cwd/file, else the first.
function activeProjectRoot() {
  const roots = [...projectIndex.keys()];
  const under = (p) => roots.find((r) => p === r || p.startsWith(r + '/'));
  const s = sessions.get(activeId);
  if (s) {
    if (s.repo) return s.repo;
    if (s.cwd) return under(s.cwd) || s.cwd;
    if (s.filePath) return under(s.filePath) || null;
  }
  return roots[0] || null;
}

// Subsequence fuzzy score; -1 when q isn't a subsequence of s. Adjacent hits score higher.
function fuzzyScore(q, s) {
  if (!q) return 0;
  q = q.toLowerCase(); s = s.toLowerCase();
  let qi = 0, score = 0, prev = -2;
  for (let i = 0; i < s.length && qi < q.length; i++) {
    if (s[i] === q[qi]) { score += (i === prev + 1 ? 3 : 1); prev = i; qi++; }
  }
  return qi === q.length ? score : -1;
}

function paletteActions() {
  const proj = paletteRoot ? projectIndex.get(paletteRoot) : null;
  const acts = [
    { label: 'New terminal here', run: () => openSession(paletteRoot || undefined, proj ? proj.name : 'terminal') },
    { label: 'Search in project…', run: () => openSearch(paletteRoot) },
    { label: 'Team chat', run: () => openTeamChat() },
    { label: 'Settings…', run: () => document.getElementById('open-settings').click() },
    { label: `Switch to ${settings.theme === 'light' ? 'dark' : 'light'} theme`, run: () => { settings.theme = settings.theme === 'light' ? 'dark' : 'light'; saveSettings(); applyTheme(); } },
    { label: 'Check for updates', run: () => checkForUpdates({ silent: false }) },
  ];
  if (proj && proj.git && proj.git.isRepo) {
    acts.push({ label: `Review changes — ${proj.name}`, run: () => openReview(proj) });
    acts.push({ label: `Commit history — ${proj.name}`, run: () => openHistory(proj) });
    acts.push({ label: `Pull request — ${proj.name}`, run: () => openPrFlow(proj) });
  }
  return acts.map((a) => ({ ...a, kind: 'action' }));
}

function buildPaletteDom() {
  paletteInput = el('input', { class: 'palette-input', type: 'text', placeholder: 'Go to file…  (or type a command)', spellcheck: 'false', autocapitalize: 'off' });
  paletteListEl = el('div', { class: 'palette-list' });
  paletteEl = el('div', { class: 'palette hidden' }, el('div', { class: 'palette-card' }, paletteInput, paletteListEl));
  document.body.appendChild(paletteEl);
  paletteEl.addEventListener('click', (e) => { if (e.target === paletteEl) closePalette(); });
  paletteInput.addEventListener('input', () => renderPalette(paletteInput.value));
  paletteInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); moveSel(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveSel(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(paletteSel); }
  });
}

function moveSel(d) {
  if (!paletteRows.length) return;
  paletteSel = (paletteSel + d + paletteRows.length) % paletteRows.length;
  [...paletteListEl.children].forEach((c, i) => c.classList.toggle('sel', i === paletteSel));
  const sel = paletteListEl.children[paletteSel];
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}

function renderPalette(query) {
  const q = query.trim();
  const acts = paletteActions().map((a) => ({ ...a, score: fuzzyScore(q, a.label) })).filter((a) => a.score >= 0);
  const files = [];
  for (const f of paletteFiles) {
    const score = fuzzyScore(q, f);
    if (score >= 0) files.push({ label: f, kind: 'file', path: paletteRoot + '/' + f, score });
  }
  files.sort((a, b) => b.score - a.score);
  acts.sort((a, b) => b.score - a.score);
  paletteRows = [...acts, ...files].slice(0, 60);
  paletteSel = 0;
  paletteListEl.innerHTML = '';
  if (!paletteRows.length) { paletteListEl.appendChild(el('div', { class: 'palette-empty', text: 'No matches' })); return; }
  paletteRows.forEach((r, i) => {
    const row = el('div', { class: `palette-row${i === 0 ? ' sel' : ''}` },
      el('span', { class: `palette-kind ${r.kind}`, text: r.kind === 'action' ? '▸' : '·' }),
      el('span', { class: 'palette-label', text: r.label }));
    row.addEventListener('click', () => choose(i));
    paletteListEl.appendChild(row);
  });
}

function choose(i) {
  const r = paletteRows[i];
  if (!r) return;
  closePalette();
  if (r.kind === 'action') r.run();
  else if (IMAGE_EXTS.test(r.label)) openImagePreview(r.path);
  else openEditor(r.path);
}

function closePalette() { if (paletteEl) paletteEl.classList.add('hidden'); }

async function openPalette() {
  paletteRoot = activeProjectRoot();
  if (!paletteEl) buildPaletteDom();
  paletteEl.classList.remove('hidden');
  paletteInput.value = '';
  paletteInput.focus();
  paletteFiles = [];
  renderPalette('');
  if (paletteRoot) {
    const r = await window.gits.projFiles(paletteRoot);
    if (r.ok && !paletteEl.classList.contains('hidden')) { paletteFiles = r.files; renderPalette(paletteInput.value); }
  }
}

// Global shortcuts (capture phase so the terminal/editor don't eat them):
// Cmd/Ctrl+P → command palette; Shift+Cmd/Ctrl+F → multi-file search.
document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && !e.altKey && !e.shiftKey && (e.key === 'p' || e.key === 'P')) {
    e.preventDefault();
    e.stopPropagation();
    if (paletteEl && !paletteEl.classList.contains('hidden')) closePalette();
    else openPalette();
  } else if (mod && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
    e.preventDefault();
    e.stopPropagation();
    openSearch();
  }
}, true);

(async function boot() {
  // Platform class drives OS-specific chrome (e.g. macOS traffic-light padding).
  const plat = window.gits.platform;
  document.body.classList.add(plat === 'darwin' ? 'plat-mac' : plat === 'win32' ? 'plat-win' : 'plat-other');
  appendTabControls(); // "+" and split, always present even with no sessions
  await loadAis();
  await loadAccounts();
  await loadProjects({ fetch: false });
  await restoreSession(); // reopen the tabs from last time (opt-out in Settings)
  startTeamBackground();  // if a team is configured, connect chat + show unread badge
  // If a previous update was applied, offer to delete the leftover installer.
  try {
    const rec = await window.gits.pendingUpdateCleanup();
    if (rec && rec.path) {
      const ver = await window.gits.appVersion();
      // Only prompt once the update actually applied (running version matches).
      if (rec.version && ver === rec.version) {
        const name = rec.path.split('/').pop();
        if (confirm(`You're now on ${ver}. Delete the downloaded installer "${name}" to free space?`)) {
          await window.gits.deleteUpdateFile(rec.path);
        } else {
          await window.gits.deleteUpdateFile(null); // forget it so we don't ask again
        }
      }
    }
  } catch {}
  // Quietly check for a newer release shortly after launch (opt-out in Settings).
  if (settings.autoUpdate) setTimeout(() => checkForUpdates({ silent: true }), 4000);
})();

// Persist open tabs as the window closes (a final flush on top of the
// debounced saves that run on every open/close).
window.addEventListener('beforeunload', () => {
  if (!settings.restoreTabs) return;
  window.gits.saveSession(sessionPayload());
});

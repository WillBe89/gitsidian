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

// Split view: show a second terminal alongside the active one.
let splitId = null;
const splitBtn = el('button', { class: 'new-tab split-toggle', title: 'Split view with another terminal', text: '⊟' });
splitBtn.addEventListener('click', () => toggleSplit());

// Keep the persistent "+" and split controls at the end of the tab strip.
function appendTabControls() {
  tabbar.appendChild(newTermBtn);
  tabbar.appendChild(splitBtn);
}

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
function termTheme() { return settings.theme === 'light' ? TERM_THEME_LIGHT : TERM_THEME; }

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
    accent: ACCENTS[s.accent] ? s.accent : 'crimson',
    fontSize: typeof s.fontSize === 'number' ? s.fontSize : 12.5,
    scrollback: typeof s.scrollback === 'number' ? s.scrollback : 5000,
    bold: !!s.bold,
    italic: !!s.italic,
    defaultAi: s.defaultAi || null,
    autoUpdate: s.autoUpdate !== false, // opt-out; checks on launch by default
    restoreTabs: s.restoreTabs !== false, // opt-out; reopen tabs on relaunch
    theme: s.theme === 'light' ? 'light' : 'dark',
    sidebarWidth: typeof s.sidebarWidth === 'number' ? Math.max(200, Math.min(520, s.sidebarWidth)) : 280,
    splitRatio: typeof s.splitRatio === 'number' ? Math.max(20, Math.min(80, s.splitRatio)) : 50,
  };
}
let settings = loadSettings();
function saveSettings() { localStorage.setItem('gits-settings', JSON.stringify(settings)); }
function applyAccent() {
  const [a, b] = ACCENTS[settings.accent] || ACCENTS.crimson;
  document.documentElement.style.setProperty('--accent', a);
  document.documentElement.style.setProperty('--accent-2', b);
}
function applyFontSize() {
  for (const s of sessions.values()) {
    if (!s.term) continue;
    try { s.term.options.fontSize = settings.fontSize; s.fit.fit(); window.gits.ptyResize(s.id, s.term.cols, s.term.rows); } catch {}
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
  document.documentElement.setAttribute('data-theme', settings.theme === 'light' ? 'light' : 'dark');
  const t = termTheme();
  for (const s of sessions.values()) {
    if (!s.term) continue;
    try { s.term.options.theme = t; } catch {}
  }
}
function applySidebarWidth() {
  document.documentElement.style.setProperty('--sidebar-w', settings.sidebarWidth + 'px');
}
// Refit the visible terminal(s) — used after a resize drag.
function refitTerminals() {
  const a = sessions.get(activeId);
  if (a && a.fit) fitAndResize(a);
  const sec = splitId && sessions.get(splitId);
  if (sec && sec.fit) fitAndResize(sec);
}
applyAccent();
applyTheme();
applySidebarWidth();

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
async function openBranchMenu(e, p) {
  const res = await window.gits.branches(p.path);
  if (!res.ok) { showToast(res.error || 'Could not list branches.'); return; }
  const items = res.branches.map((b) => ({
    label: (b === res.current ? '✓ ' : '    ') + b,
    onClick: () => { if (b !== res.current) switchBranch(p, b); },
  }));
  items.push({ label: '+ New branch…', onClick: () => createBranch(p) });
  showContextMenu(e.clientX, e.clientY, items);
}
async function switchBranch(p, branch) {
  const r = await window.gits.checkout({ repo: p.path, branch });
  if (r.ok) { showToast(`Switched to ${branch}`); await loadProjects({ fetch: false }); }
  else showToast(r.error || 'Could not switch branch.');
}
async function createBranch(p) {
  const name = prompt('New branch name:', '');
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

// Always clear drag-highlight marks when a drag ends (or drops anywhere) — fixes
// stuck red borders when a drag is cancelled or dropped on a child element.
function clearDragMarks() {
  document.querySelectorAll('.drag-over, .drop-before, .group-drop, .group-drop-after, .dragging, .group-dragging')
    .forEach((e) => e.classList.remove('drag-over', 'drop-before', 'group-drop', 'group-drop-after', 'dragging', 'group-dragging'));
}
document.addEventListener('dragend', clearDragMarks);
document.addEventListener('drop', clearDragMarks);

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
  elm.addEventListener('dragleave', (e) => { if (e.target === elm) elm.classList.remove('drag-over'); });
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
  wrap.addEventListener('dragleave', (e) => { if (e.target === wrap) wrap.classList.remove('drop-before'); });
  wrap.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    wrap.classList.remove('drop-before');
    if (draggedPath) movePath(draggedPath, findGroupOf(p.path), p.path);
  });

  const meta = el('div', { class: 'vault-meta' });
  const actions = el('div', { class: 'vault-actions' });
  const finderBtn = el('button', { class: 'tiny-btn', text: 'Finder' });
  finderBtn.addEventListener('click', (e) => { e.stopPropagation(); window.gits.openFinder(p.path); });
  actions.appendChild(finderBtn);
  if (p.git && p.git.isRepo) {
    const branchBtn = el('button', { class: 'tiny-btn branch-btn', title: 'Switch / create branch', text: `⎇ ${p.git.branch || '?'}` });
    branchBtn.addEventListener('click', (e) => { e.stopPropagation(); openBranchMenu(e, p); });
    actions.appendChild(branchBtn);

    const ghBtn = el('button', { class: 'tiny-btn', text: 'GitHub ↗' });
    ghBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const url = await window.gits.webUrl(p.path);
      if (url) window.gits.openUrl(url);
      else showToast('This project has no GitHub remote yet — publish it first.');
    });
    actions.appendChild(ghBtn);
  }
  // Open in Obsidian for ANY project — opens a dialog explaining what happens
  // (registers it as a local Obsidian vault) with options.
  const obsBtn = el('button', { class: 'tiny-btn', text: 'Obsidian ↗' });
  obsBtn.addEventListener('click', (e) => { e.stopPropagation(); openObsidianDialog(p); });
  actions.appendChild(obsBtn);
  meta.appendChild(actions);

  const treeRoot = el('div', { class: 'tree', 'data-loaded': '0', 'data-path': p.path });
  meta.appendChild(treeRoot);

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
        const name = prompt(`New ${isDir ? 'folder' : 'file'} in "${entry.name}":`, '');
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
      const name = prompt('Rename to:', entry.name);
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

function treeNode(entry, depth, changes) {
  const pad = depth * 14 + 8;
  const cc = changeClass(entry.path, entry.isDir, changes);
  if (entry.isDir) {
    const item = el('div', { class: 'tree-item' });
    const row = el('div', { class: `tree-row dir${cc}`, style: `padding-left:${pad}px`, title: entry.path },
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
    item.append(row, kids);
    return item;
  }

  // File row — left-click opens in the built-in editor; changed files get a diff button.
  const row = el('div', { class: `tree-row file${cc}`, style: `padding-left:${pad + 16}px`, title: entry.path },
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
  row.addEventListener('click', () => openEditor(entry.path));
  row.querySelector('.reveal').addEventListener('click', (e) => { e.stopPropagation(); window.gits.reveal(entry.path); });
  treeContextMenu(row, entry, depth);
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

  const autoGrow = () => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  };

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
  const root = el('div', { class: 'composer' }, quick, inputRow);
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

  // Drag a file/folder onto this session to drop its path into the composer.
  pane.addEventListener('dragover', (e) => { e.preventDefault(); pane.classList.add('drop'); });
  pane.addEventListener('dragleave', (e) => { if (e.target === pane) pane.classList.remove('drop'); });
  pane.addEventListener('drop', (e) => {
    e.preventDefault();
    pane.classList.remove('drop');
    const paths = [...(e.dataTransfer.files || [])]
      .map((f) => window.gits.pathForFile(f))
      .filter(Boolean)
      .map((p) => (/\s/.test(p) ? `"${p}"` : p));
    if (paths.length) composer.insert(paths.join(' ') + ' ');
  });

  const session = {
    id, kind: 'term', term, fit, host, pane, cwd, ai, aiName, label,
    composerText: composer.textarea,
    status: 'busy', unread: false, tabEl: null,
  };
  sessions.set(id, session);
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
    activate(session.id);
  });
  const titleEl = tab.querySelector('.tab-title');
  titleEl.title = 'Double-click to rename';
  titleEl.addEventListener('dblclick', (e) => { e.stopPropagation(); startRename(titleEl, session); });
  session.tabEl = tab;
  tabbar.appendChild(tab);
  appendTabControls(); // keep "+" and split at the end of the strip
  return tab;
}

function shortAi(name) {
  return name.replace(' Code', '').replace(' (OpenAI)', '').replace(' CLI', '').replace(' (shell)', '');
}

function activate(id) {
  // In split view, clicking the secondary's tab swaps it to the primary side.
  if (splitId && id === splitId) splitId = activeId;
  activeId = id;
  for (const [sid, s] of sessions) {
    const on = sid === id;
    s.pane.classList.toggle('active', on);
    s.tabEl.classList.toggle('active', on);
    if (on) { s.unread = false; s.tabEl.classList.remove('unread'); }
  }
  applySplitClasses();
  const s = sessions.get(id);
  if (s) {
    if (s.composerText) s.composerText.focus();
    else if (s.focusEl) s.focusEl.focus();
  }
}

// Toggle split with the most-recently-used other terminal.
function toggleSplit() {
  if (splitId) { splitId = null; applySplitClasses(); return; }
  const other = [...sessions.keys()].filter((sid) => sid !== activeId && sessions.get(sid).kind === 'term').pop();
  if (!other) { showToast('Open another terminal to split the view.'); return; }
  splitId = other;
  applySplitClasses();
}

// Apply/clear the side-by-side layout classes and refit both panes.
function applySplitClasses() {
  for (const s of sessions.values()) s.pane.classList.remove('split-2');
  const valid = splitId && sessions.has(splitId) && splitId !== activeId;
  if (!valid) { splitId = null; terminalsEl.classList.remove('split'); }
  else {
    terminalsEl.classList.add('split');
    terminalsEl.style.setProperty('--split', settings.splitRatio + '%');
    const sec = sessions.get(splitId);
    sec.pane.classList.add('split-2');
    if (sec.fit) fitAndResize(sec);
  }
  splitBtn.classList.toggle('on', !!splitId);
  const a = sessions.get(activeId);
  if (a && a.fit) fitAndResize(a);
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
  if (s.kind === 'term') { window.gits.ptyKill(id); if (s.term) s.term.dispose(); }
  s.pane.remove();
  s.tabEl.remove();
  sessions.delete(id);
  if (id === splitId) { splitId = null; terminalsEl.classList.remove('split'); }
  if (activeId === id) {
    const next = [...sessions.keys()].pop();
    if (next) activate(next);
    else { activeId = null; welcomeEl.classList.remove('hidden'); }
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

// ---------------------------------------------------------------------------
// Built-in editor — open a text file in a tab, edit, save (Cmd/Ctrl+S).
// ---------------------------------------------------------------------------
let editorSeq = 0;
async function openEditor(filePath) {
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

  const ta = el('textarea', { class: 'editor-text', spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off', autocomplete: 'off' });
  ta.value = res.content;
  const saveBtn = el('button', { class: 'send-btn', text: 'Save', disabled: 'true' });
  const bar = el('div', { class: 'editor-bar' }, el('span', { class: 'editor-info', text: filePath }), saveBtn);
  const pane = el('div', { class: 'term-pane editor-pane', 'data-id': id }, ta, bar);
  terminalsEl.appendChild(pane);

  const session = { id, kind: 'editor', filePath, label, pane, focusEl: ta, textarea: ta, dirty: false, tabEl: null };
  sessions.set(id, session);

  const markDirty = (d) => {
    session.dirty = d;
    if (session.tabEl) session.tabEl.classList.toggle('dirty', d);
    saveBtn.disabled = !d;
  };
  const save = async () => {
    const r = await window.gits.writeFile({ path: filePath, content: ta.value });
    if (r.ok) { markDirty(false); showToast(`Saved ${label}`); }
    else showToast(r.error || 'Could not save.');
  };
  ta.addEventListener('input', () => { if (!session.dirty) markDirty(true); });
  ta.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); save(); }
  });
  saveBtn.addEventListener('click', save);

  attachTab(session, { tag: 'edit', tagClass: 'tab-ai edit', tabTitle: filePath });
  welcomeEl.classList.add('hidden');
  activate(id);
  persistSession();
  return id;
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
  for (const line of res.diff.split('\n')) {
    let cls = 'd-ctx';
    const c = line[0];
    if (/^(diff |index |new file|deleted file|similarity|rename |\+\+\+|---)/.test(line)) cls = 'd-meta';
    else if (line.startsWith('@@')) cls = 'd-hunk';
    else if (c === '+') cls = 'd-add';
    else if (c === '-') cls = 'd-del';
    pre.appendChild(el('div', { class: `d-line ${cls}`, text: line || ' ' }));
  }
  const pane = el('div', { class: 'term-pane diff-pane', 'data-id': id }, pre);
  terminalsEl.appendChild(pane);
  const session = { id, kind: 'diff', pane, focusEl: pre, label: basename(filePath), tabEl: null };
  sessions.set(id, session);
  attachTab(session, { tag: 'diff', tagClass: 'tab-ai diff', tabTitle: filePath });
  welcomeEl.classList.add('hidden');
  activate(id);
  return id;
}

// ---------------------------------------------------------------------------
// Session persistence — remember terminal + editor tabs across relaunches.
// ---------------------------------------------------------------------------
let persistTimer = null;
function persistSession() {
  if (!settings.restoreTabs) return;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const tabs = [];
    for (const s of sessions.values()) {
      if (s.kind === 'term') tabs.push({ kind: 'term', cwd: s.cwd, ai: s.ai, label: s.label });
      else if (s.kind === 'editor') tabs.push({ kind: 'editor', filePath: s.filePath });
    }
    window.gits.saveSession({ tabs });
  }, 400);
}

async function restoreSession() {
  if (!settings.restoreTabs) return;
  const data = await window.gits.loadSession();
  const tabs = (data && Array.isArray(data.tabs)) ? data.tabs : [];
  for (const t of tabs) {
    if (t.kind === 'term') await openSession(t.cwd, t.label || 'terminal', t.ai);
    else if (t.kind === 'editor') await openEditor(t.filePath);
  }
}

// ---------------------------------------------------------------------------
// Streams from main
// ---------------------------------------------------------------------------
window.gits.onPtyData(({ id, data }) => {
  const s = sessions.get(id);
  if (!s) return;
  s.term.write(data);
  if (id !== activeId) { s.unread = true; s.tabEl.classList.add('unread'); }
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

// Divider between the two split panes.
const splitDivider = el('div', { class: 'split-divider', title: 'Drag to resize the split' });
terminalsEl.appendChild(splitDivider);
splitDivider.addEventListener('mousedown', (e) => {
  e.preventDefault();
  const rect = terminalsEl.getBoundingClientRect();
  startDrag(splitDivider, (ev) => {
    const pct = Math.max(20, Math.min(80, ((ev.clientX - rect.left) / rect.width) * 100));
    settings.splitRatio = Math.round(pct);
    terminalsEl.style.setProperty('--split', pct + '%');
    refitTerminals();
  });
});

// ---------------------------------------------------------------------------
// Sidebar buttons + modal
// ---------------------------------------------------------------------------
refreshBtn.addEventListener('click', () => loadProjects({ fetch: true }));
document.getElementById('new-group').addEventListener('click', () => addGroup());

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
    updateNotes.textContent = (res.notes || '').trim().slice(0, 1500);
    updateProgressWrap.classList.add('hidden');
    updateProgressBar.style.width = '0%';
    updateStatus.textContent = '';
    updateStatus.className = 'import-status';
    updateGo.textContent = res.asset ? 'Update now' : 'Open releases page';
    updateGo.disabled = false;
    updateLater.disabled = false;
    settingsModal.classList.add('hidden'); // don't stack over the Settings dialog
    updateModal.classList.remove('hidden');
  } finally {
    updateChecking = false;
  }
}

updateLater.addEventListener('click', () => updateModal.classList.add('hidden'));
updateGo.addEventListener('click', async () => {
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
  const dl = await window.gits.downloadUpdate(updateCtx.asset);
  if (!dl.ok) {
    updateStatus.textContent = dl.error || 'Download failed.';
    updateStatus.className = 'import-status err';
    updateGo.disabled = false;
    updateLater.disabled = false;
    return;
  }
  updateStatus.textContent = 'Opening the installer — Gitsidian will close so you can finish updating.';
  updateStatus.className = 'import-status ok';
  const ins = await window.gits.installUpdate(dl.path);
  if (!ins.ok) {
    updateStatus.textContent = ins.error || 'Could not open the installer.';
    updateStatus.className = 'import-status err';
    updateGo.disabled = false;
    updateLater.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Settings modal
// ---------------------------------------------------------------------------
const settingsModal = document.getElementById('settings-modal');
document.getElementById('open-settings').addEventListener('click', () => {
  const wrap = document.getElementById('settings-accents');
  wrap.innerHTML = '';
  for (const [key, [a]] of Object.entries(ACCENTS)) {
    const sw = el('div', { class: `swatch${key === settings.accent ? ' active' : ''}`, title: key });
    sw.style.background = a;
    sw.addEventListener('click', () => {
      settings.accent = key; saveSettings(); applyAccent();
      [...wrap.children].forEach((c) => c.classList.remove('active'));
      sw.classList.add('active');
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
  const sb = document.getElementById('settings-scrollback');
  sb.value = String(settings.scrollback);
  sb.onchange = () => { settings.scrollback = parseInt(sb.value, 10); saveSettings(); }; // applies to new terminals
  for (const r of document.getElementsByName('theme')) {
    r.checked = r.value === settings.theme;
    r.onchange = () => { if (r.checked) { settings.theme = r.value; saveSettings(); applyTheme(); } };
  }
  const restore = document.getElementById('settings-restore');
  restore.checked = settings.restoreTabs;
  restore.onchange = () => { settings.restoreTabs = restore.checked; saveSettings(); if (restore.checked) persistSession(); };
  const auto = document.getElementById('settings-autoupdate');
  auto.checked = settings.autoUpdate;
  auto.onchange = () => { settings.autoUpdate = auto.checked; saveSettings(); };
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
  settingsModal.classList.remove('hidden');
});
document.getElementById('settings-close').addEventListener('click', () => settingsModal.classList.add('hidden'));

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
(async function boot() {
  // Platform class drives OS-specific chrome (e.g. macOS traffic-light padding).
  const plat = window.gits.platform;
  document.body.classList.add(plat === 'darwin' ? 'plat-mac' : plat === 'win32' ? 'plat-win' : 'plat-other');
  appendTabControls(); // "+" and split, always present even with no sessions
  await loadAis();
  await loadAccounts();
  await loadProjects({ fetch: false });
  await restoreSession(); // reopen the tabs from last time (opt-out in Settings)
  // Quietly check for a newer release shortly after launch (opt-out in Settings).
  if (settings.autoUpdate) setTimeout(() => checkForUpdates({ silent: true }), 4000);
})();

// Persist open tabs as the window closes (a final flush on top of the
// debounced saves that run on every open/close).
window.addEventListener('beforeunload', () => {
  if (!settings.restoreTabs) return;
  const tabs = [];
  for (const s of sessions.values()) {
    if (s.kind === 'term') tabs.push({ kind: 'term', cwd: s.cwd, ai: s.ai, label: s.label });
    else if (s.kind === 'editor') tabs.push({ kind: 'editor', filePath: s.filePath });
  }
  window.gits.saveSession({ tabs });
});

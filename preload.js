// Gitsidian — preload bridge. Authored by will.be.
'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('gits', {
  platform: process.platform,

  // Discovery
  listProjects: (opts) => ipcRenderer.invoke('projects:list', opts),
  listAis: () => ipcRenderer.invoke('ai:list'),
  addAi: (opts) => ipcRenderer.invoke('ai:add', opts),
  listDir: (p) => ipcRenderer.invoke('fs:list', p),
  changes: (p) => ipcRenderer.invoke('git:changes', p),

  // Project management
  addFolder: () => ipcRenderer.invoke('vault:addFolder'),
  addPaths: (paths) => ipcRenderer.invoke('vault:addPaths', paths),
  scanRepos: (opts) => ipcRenderer.invoke('repos:scan', opts),
  cloneVault: (opts) => ipcRenderer.invoke('vault:clone', opts),
  removeVault: (p) => ipcRenderer.invoke('vault:remove', p),
  publish: (opts) => ipcRenderer.invoke('git:publish', opts),
  repoInfo: (p) => ipcRenderer.invoke('git:repoInfo', p),
  sync: (opts) => ipcRenderer.invoke('git:sync', opts),
  pull: (p) => ipcRenderer.invoke('git:pull', p),

  // GitHub accounts
  ghAccounts: () => ipcRenderer.invoke('gh:accounts'),
  ghSwitch: (login) => ipcRenderer.invoke('gh:switch', login),
  getLayout: () => ipcRenderer.invoke('layout:get'),
  setLayout: (data) => ipcRenderer.invoke('layout:set', data),

  // External openers
  openObsidian: (opts) => ipcRenderer.invoke('open:obsidian', opts),
  obsidianRestartOpen: (p) => ipcRenderer.invoke('obsidian:restartOpen', p),
  openFinder: (p) => ipcRenderer.invoke('open:finder', p),
  openItem: (p) => ipcRenderer.invoke('open:item', p),
  reveal: (p) => ipcRenderer.invoke('open:reveal', p),
  openUrl: (u) => ipcRenderer.invoke('open:url', u),
  webUrl: (p) => ipcRenderer.invoke('git:webUrl', p),

  // Terminal sessions
  ptyCreate: (opts) => ipcRenderer.invoke('pty:create', opts),
  ptyInput: (id, data) => ipcRenderer.send('pty:input', { id, data }),
  ptyResize: (id, cols, rows) => ipcRenderer.send('pty:resize', { id, cols, rows }),
  ptyKill: (id) => ipcRenderer.send('pty:kill', { id }),

  // Streams from main
  onPtyData: (cb) => ipcRenderer.on('pty:data', (_e, payload) => cb(payload)),
  onPtyStatus: (cb) => ipcRenderer.on('pty:status', (_e, payload) => cb(payload)),
  onShortcut: (cb) => ipcRenderer.on('shortcut', (_e, action) => cb(action)),

  // Resolve the absolute path of a dropped File (Electron 33: File.path is gone).
  pathForFile: (file) => { try { return webUtils.getPathForFile(file); } catch { return null; } },
});

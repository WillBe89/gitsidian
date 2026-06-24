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
  projFiles: (p) => ipcRenderer.invoke('proj:files', p),
  search: (opts) => ipcRenderer.invoke('proj:search', opts),
  changes: (p) => ipcRenderer.invoke('git:changes', p),
  ignore: (opts) => ipcRenderer.invoke('git:ignore', opts),

  // File operations (editor + tree management)
  readFile: (p) => ipcRenderer.invoke('fs:read', p),
  readImage: (p) => ipcRenderer.invoke('fs:readImage', p),
  writeFile: (opts) => ipcRenderer.invoke('fs:write', opts),
  createEntry: (opts) => ipcRenderer.invoke('fs:create', opts),
  renameEntry: (opts) => ipcRenderer.invoke('fs:rename', opts),
  deleteEntry: (p) => ipcRenderer.invoke('fs:delete', p),
  saveImage: (opts) => ipcRenderer.invoke('fs:saveImage', opts),

  // Git: diff / branches / AI commit message
  diff: (opts) => ipcRenderer.invoke('git:diff', opts),
  branches: (p) => ipcRenderer.invoke('git:branches', p),
  checkout: (opts) => ipcRenderer.invoke('git:checkout', opts),
  commitMessage: (p) => ipcRenderer.invoke('ai:commitMessage', p),

  // Git: review & stage
  statusFiles: (p) => ipcRenderer.invoke('git:statusFiles', p),
  stage: (opts) => ipcRenderer.invoke('git:stage', opts),
  unstage: (opts) => ipcRenderer.invoke('git:unstage', opts),
  stageAll: (p) => ipcRenderer.invoke('git:stageAll', p),
  unstageAll: (p) => ipcRenderer.invoke('git:unstageAll', p),
  commitStaged: (opts) => ipcRenderer.invoke('git:commitStaged', opts),
  push: (p) => ipcRenderer.invoke('git:push', p),
  fileDiff: (opts) => ipcRenderer.invoke('git:fileDiff', opts),
  applyHunk: (opts) => ipcRenderer.invoke('git:applyHunk', opts),

  // File move (drag-and-drop in the tree) + file-change watching
  moveEntry: (opts) => ipcRenderer.invoke('fs:move', opts),
  pasteEntry: (opts) => ipcRenderer.invoke('fs:paste', opts),
  pickFolder: (title) => ipcRenderer.invoke('fs:pickFolder', title),
  watchAdd: (p) => ipcRenderer.invoke('watch:add', p),
  watchRemove: (p) => ipcRenderer.invoke('watch:remove', p),
  onFileChanged: (cb) => ipcRenderer.on('file:changed', (_e, payload) => cb(payload)),

  // Git: commit history
  log: (opts) => ipcRenderer.invoke('git:log', opts),
  commitDiff: (opts) => ipcRenderer.invoke('git:commitDiff', opts),

  // Pull requests
  prView: (p) => ipcRenderer.invoke('gh:prView', p),
  prCreate: (opts) => ipcRenderer.invoke('gh:prCreate', opts),

  // Session persistence
  saveSession: (data) => ipcRenderer.invoke('session:save', data),
  loadSession: () => ipcRenderer.invoke('session:load'),

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
  pullPreview: (p) => ipcRenderer.invoke('git:pullPreview', p),

  // Team chat (GitHub-issue based, gh identity)
  teamConfig: (patch) => ipcRenderer.invoke('team:config', patch),
  teamWhoami: () => ipcRenderer.invoke('team:whoami'),
  teamCreateRepo: (name) => ipcRenderer.invoke('team:createRepo', name),
  chatInit: (repo) => ipcRenderer.invoke('team:chatInit', repo),
  chatList: (opts) => ipcRenderer.invoke('team:chatList', opts),
  chatCache: (opts) => ipcRenderer.invoke('team:chatCache', opts),
  chatPost: (opts) => ipcRenderer.invoke('team:chatPost', opts),
  chatDelete: (opts) => ipcRenderer.invoke('team:chatDelete', opts),
  chatDeleteChannel: (opts) => ipcRenderer.invoke('team:channelDelete', opts),
  chatExportMd: (opts) => ipcRenderer.invoke('chat:exportMd', opts),
  teamInvite: (opts) => ipcRenderer.invoke('team:invite', opts),
  teamProfiles: (repo) => ipcRenderer.invoke('team:profiles', repo),
  teamPickImage: () => ipcRenderer.invoke('team:pickImage'),
  teamSetProfile: (opts) => ipcRenderer.invoke('team:setProfile', opts),

  // Auto-update
  appVersion: () => ipcRenderer.invoke('app:version'),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: (asset, version) => ipcRenderer.invoke('update:download', asset, version),
  installUpdate: (filePath) => ipcRenderer.invoke('update:install', filePath),
  onUpdateProgress: (cb) => ipcRenderer.on('update:progress', (_e, payload) => cb(payload)),
  quitApp: () => ipcRenderer.invoke('app:quit'),
  onOpenItem: (cb) => ipcRenderer.on('open-external-item', (_e, item) => cb(item)),
  pathKinds: (paths) => ipcRenderer.invoke('path:kinds', paths),
  markdownDefaultInfo: () => ipcRenderer.invoke('app:markdownDefaultInfo'),
  setMarkdownDefault: () => ipcRenderer.invoke('app:setMarkdownDefault'),
  pendingUpdateCleanup: () => ipcRenderer.invoke('update:pendingCleanup'),
  deleteUpdateFile: (p) => ipcRenderer.invoke('update:deleteFile', p),

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

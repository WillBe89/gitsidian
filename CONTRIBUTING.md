# Contributing to Gitsidian

Thanks for your interest! Gitsidian is a small, focused Electron app.

## Getting set up

```sh
git clone https://github.com/WillBe89/gitsidian.git
cd gitsidian
npm install        # also rebuilds node-pty for Electron
npm start
```

If you bump the Electron version, rebuild the native module:

```sh
npm run rebuild
```

## Project layout

- `main.js` — Electron main process (repo/vault detection, AI detection, git ops, PTY manager).
- `preload.js` — the `contextBridge` API surface (`window.gits.*`). Context isolation is **on**; node integration is **off**. All privileged work happens in `main.js`.
- `renderer.js` — UI: sidebar, file tree, tabs, terminals, composer, dialogs.
- `index.html` / `styles.css` — UI shell.

## Conventions

- Keep the security model intact: no `nodeIntegration`, no exposing raw `ipcRenderer`.
- Cross-platform: branch on `process.platform` for anything shell- or path-specific (see how the PTY shell is chosen in `main.js`).
- No build step — plain JS, loaded directly. Run `node --check` on changed files before committing.
- Don't commit AI-assistant artifacts or secrets (see `.gitignore`).

## Building installers

```sh
npm run dist       # installer for the current OS
```
Pushing a `v*` tag triggers CI to build macOS + Windows and attach them to the release.

## Pull requests

Keep PRs focused and describe the user-facing change. Test on at least the platform you're on; note if a change is platform-specific.

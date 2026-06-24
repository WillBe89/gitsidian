# Building & feedback

Gitsidian is a **solo project** by [will.be](https://willbe.dev) — a small, focused
Electron app. It's **not open to outside code contributions / pull requests**, and
that's intentional: it keeps the codebase coherent and the licensing clean. But your
input is genuinely welcome:

- **Bug reports and feature ideas** → please open an [issue](https://github.com/WillBe89/gitsidian/issues). They're read and appreciated.
- **Using it** → free for noncommercial use (see the [LICENSE](LICENSE)). Star/follow to get updates.
- **Commercial use / licensing** → reach out via [willbe.dev](https://willbe.dev).

> License note: Gitsidian is source-available under the **PolyForm Noncommercial
> License 1.0.0** (versions 0.7.4 and earlier were MIT). You're welcome to read,
> run, and modify it for noncommercial purposes; commercial use needs a separate
> license.

## Running from source

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

## Conventions (if you're hacking on your own copy)

- Keep the security model intact: no `nodeIntegration`, no exposing raw `ipcRenderer`.
- Cross-platform: branch on `process.platform` for anything shell- or path-specific (see how the PTY shell is chosen in `main.js`).
- No build step — plain JS, loaded directly. Run `node --check` on changed files.

## Building installers

```sh
npm run dist       # installer for the current OS
```
Pushing a `v*` tag triggers CI to build macOS, Windows, and Linux and attach them to the release.

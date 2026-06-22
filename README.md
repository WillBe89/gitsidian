<div align="center">

<img src="gitsidian3.png" width="110" alt="Gitsidian logo" />

# Gitsidian

**A friendly, multi-tab cockpit for running AI coding assistants inside your projects — no terminal required.**

Open any git repo or Obsidian vault, browse its files, and run Claude Code, Codex, Ollama, or a plain shell — several at once, each in its own tab with a live status light. Publish, push, and pull to GitHub from the sidebar, with guard-rails that stop you damaging public repos.

[![Download for macOS](https://img.shields.io/badge/⬇_Download-macOS-black?style=for-the-badge)](https://github.com/WillBe89/gitsidian/releases/latest)
[![Download for Windows](https://img.shields.io/badge/⬇_Download-Windows-0078D6?style=for-the-badge)](https://github.com/WillBe89/gitsidian/releases/latest)

![license: MIT](https://img.shields.io/badge/license-MIT-blue) ![platforms](https://img.shields.io/badge/platforms-macOS_·_Windows-555)

</div>

---

## Why Gitsidian exists

AI coding assistants (Claude Code, Codex, Ollama and friends) are incredible — but they live in the **terminal**, which is a wall for most people and a juggling act even for developers:

- A blank black window with commands to memorise.
- Running several assistants across different repos means a mess of terminal windows, and no way to tell which one is still thinking.
- Git itself — clone, commit, push, pull — is another set of commands on top.

Gitsidian keeps the terminal's power and aesthetic (each session really *is* a terminal), but wraps it so **anyone can use it**: a sidebar of your projects, real embedded terminals in tabs, one-click git, and clear status everywhere. It was built so a non-technical teammate can drive an AI assistant in the right folder as easily as a developer can run ten of them at once.

## Who it's for

- **Developers** who want to run multiple AI coding sessions side by side, across repos, without terminal sprawl.
- **Non-technical people** (marketing, ops, writers) who need to use an AI assistant on a shared repo or knowledge base but shouldn't have to learn the terminal or git.
- **Obsidian users** whose vaults are git repos — edit notes locally, and pull/push to share with a team, all from one place.

## Features

- ** Find repos automatically** — one click scans your computer for git repos and Obsidian vaults and lets you pick which to load. No digging through your file manager.
- ** Projects + file tree** — browse any project's files; launch an assistant in any sub-folder; click a file to open it in your editor.
- ** Embedded multi-tab terminals** — real terminals (`node-pty` + `xterm.js`) *inside* the app. Rename tabs, watch their status lights, open as many as you need (up to a safe cap).
- ** Any AI CLI** — auto-detects whatever you have installed from a broad list (Claude Code, Codex, Gemini, OpenCode, Aider, Goose, Crush, Cursor Agent, Amazon Q, Cody, Plandex, Open Interpreter, gptme, Mods, llm, aichat, Shell GPT, Ollama) and shows only those, plus a plain shell. **Add a command…** lets you run anything else (e.g. `ollama run deepseek-coder`, `aider --model deepseek`) or future tools.
- ** Friendly composer** — a normal text box per session: command history (↑/↓), Ctrl+C / Ctrl+L, drag-and-drop file paths, quick-command buttons, and reliable Enter-to-send even inside full-screen TUIs.
- ** Live status lights** — each tab shows **busy** (the assistant is working), **idle** (waiting on you), or **exited**, plus an unread dot on background tabs.
- **🔗Git without the terminal** — click a repo's status badge to:
  | Badge | Meaning | Click does |
  |---|---|---|
  | `↥ Publish` | Not on GitHub yet | Create the repo + push |
  | `N edit(s)` | Uncommitted changes | Commit & push |
  | `N↑ to push` | Committed, not pushed | Push |
  | `N↓ get latest` | Behind the remote | Pull (fast-forward, safe) |
  | `synced` | Up to date | — |
- ** Safety guard-rails** — pushing to a **public** repo needs a deliberate confirmation; **read-only** repos block the push (but you can still pull); your private repos stay one-click easy.
- ** GitHub account switcher** — a chip in the title bar shows your active account; switch between accounts (e.g. personal vs work) or add one, without the terminal.
- ** Slack-style organisation** — drag projects into groups, reorder and rename them, remove what you don't want. Your layout persists across restarts.

## Install

### macOS
1. Download the **`.dmg`** from the [latest release](https://github.com/WillBe89/gitsidian/releases/latest) (Apple Silicon and Intel builds are provided).
2. Open it and drag **Gitsidian** to Applications.
3. The build is ad-hoc signed but not notarized, so on first launch macOS asks you to confirm:
   **right-click the app → Open → Open**. If it's still blocked, go to **System Settings → Privacy & Security** and click **Open Anyway**.
   As a last resort: `xattr -dr com.apple.quarantine /Applications/Gitsidian.app`.

### Windows
1. Download **`Gitsidian Setup x.y.z.exe`** from the [latest release](https://github.com/WillBe89/gitsidian/releases/latest).
2. Run it. SmartScreen may warn because the build is unsigned — choose **More info → Run anyway**.

### From source (any platform)
```sh
git clone https://github.com/WillBe89/gitsidian.git
cd gitsidian
npm install      # also rebuilds node-pty for Electron
npm start
```

## Requirements

- **macOS** or **Windows** (Linux runs from source but isn't packaged yet).
- At least one AI CLI on your `PATH` — e.g. [Claude Code](https://claude.com/claude-code). Gitsidian uses whatever you have installed.
- **[GitHub CLI](https://cli.github.com/) (`gh`)**, signed in (`gh auth login`) — powers the publish/push/pull, the public-repo safety checks, and the account switcher.
- **Node.js 18+** only if running from source.

## Using it

1. **Load your projects.** Click **🔍 Find repos on this Mac/PC** and tick the ones to add — or **📂 Open Folder** for a specific folder, or **⤓ Import repo…** to clone a git URL.
2. **Open a session.** Expand a project, hover a folder, and click **▸ run** — a tab opens with your chosen assistant running there. The dropdown at the top picks which assistant new tabs use.
3. **Work in the composer.** Type in the box at the bottom and press **Enter** to send; **Shift+Enter** for a new line; **↑/↓** for history. Drag a file in to drop its path. The terminal above stays fully interactive too.
4. **Run several at once.** Each session is its own tab with a status light, so you can have Claude working in one repo while you review another. Double-click a tab to rename it.
5. **Handle git from the sidebar.** A repo's badge tells you its state — click it to publish, push, or pull, with safety prompts where it matters.
6. **Switch GitHub accounts** from the chip in the top-right.
7. **Organise** by dragging projects into groups you create with the **⊞** button.

## How it works

| File | Role |
|------|------|
| `main.js` | Electron main process: repo/vault detection, AI detection, git operations, and the PTY manager (one terminal per tab). |
| `preload.js` | Secure `contextBridge` API — context isolation on, node integration off. |
| `renderer.js` | Sidebar, file tree, tabs, terminals, composer, git/account dialogs. |
| `index.html` / `styles.css` | The UI shell. |
| `.github/workflows/release.yml` | CI that builds macOS + Windows installers on each version tag. |

Vaults are discovered from Obsidian's own registry plus a home-folder scan; your added projects, groups, and layout are stored in the app's per-user data folder. The "is it still working?" tab light is an output-activity heuristic, so it works for any CLI. Terminals are real pseudo-terminals (`node-pty`), so anything that runs in your shell runs here.

## Building installers

```sh
npm run pack     # quick unpacked .app/.exe in dist/ (for testing)
npm run dist     # installer(s) for the current OS in dist/
```
Or just push a `v*` tag — CI builds **both** macOS and Windows and attaches them to the GitHub Release automatically. Builds are unsigned by default; add your signing credentials to `package.json` → `build` to ship signed/notarised apps.

## Roadmap

- Code-signing / notarisation for both platforms.
- Per-file git status tinting in the tree.
- Paste-an-image-as-file for AI sessions; tab-completion passthrough.
- Linux packaging.

## Author

Built by **will.be** — [willbe.dev](https://willbe.dev) (with AI assistance).

## License

[MIT](LICENSE) © will.be

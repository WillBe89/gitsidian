# Changelog

All notable changes to Gitsidian.

## 0.4.8

- **Mark as ignore** — right-click a file/folder in the tree → Add to .gitignore
  (and Reveal in Finder).
- **Pull preview** — see the incoming commits, files, and approximate download size
  before pulling.
- **Settings panel** — accent colour, terminal font size, scrollback, remembered
  default AI, and bold/italic terminal text. Persisted across restarts.

## 0.4.7

- **Keyboard shortcuts** — ⌘T new terminal, ⌘W close tab, ⌘1–9 switch tabs, ⌘K
  clear (Ctrl+Shift on Windows/Linux).
- **Confirm before closing a running tab** — so you don't kill a session mid-task.
- **"Finished" notification** — a system notification when a *background* session
  completes a sustained task (not quick commands).
- Removed decorative emojis from the UI for a cleaner look.

## 0.4.6

- **Changed files in the tree** — files are tinted by git status (green = new,
  amber = modified, red = deleted), and folders containing changes are highlighted,
  so you can see exactly what differs from GitHub at a glance.
- **Fix sync-status detection** — repos pushed without upstream tracking are now
  correctly shown as *synced* / *edits* / *ahead* / *behind* (previously mislabelled
  as not-published). Push now sets tracking; pull works without it.

## 0.4.5

- **Fix:** drag-highlight borders no longer get stuck on the sidebar when a drag
  is cancelled or dropped onto a card.
- Added Buy Me a Coffee donation link.

## 0.4.4

- **Fix: `gh` / CLIs not found in the packaged app.** A Dock-launched macOS app
  doesn't inherit your shell PATH, so the GitHub account switcher showed "gh not
  installed" and publish/push/pull failed. The app now recovers your real PATH at
  startup, so all git/GitHub features work when launched normally.

## 0.4.3

- **Fix macOS "app is damaged" error** — the build now gets a proper ad-hoc code
  signature, so it opens via right-click → Open instead of being blocked. (Builds
  are still un-notarized; first launch needs the one-time Open confirmation.)

## 0.4.2

- **Publish to Obsidian** — open any project in Obsidian (registers it as a vault),
  with a dialog explaining it's local + an option to hide build/system folders.
  Handles the "Obsidian already open" case gracefully.
- **Comprehensive AI detection** — auto-detects ~18 known AI CLIs and shows only
  the ones installed, plus **Add a command…** to run anything else (model variants,
  niche/new tools).
- **Open on GitHub** for any synced project + your profile from the account menu.

## 0.4.1

- **New app logo & icon** (no longer Obsidian-derived).
- **Open on GitHub** — a button on every synced project opens its repo page in the
  browser; the account menu opens your GitHub profile.
- Fixed repo-discovery checkbox alignment.

## 0.4.0

- **Cross-platform:** Windows support — PowerShell-based sessions, native window
  controls, and an `nsis` installer. CI now builds macOS + Windows on each tag.
- **Git, full loop:** clickable status badges for **publish**, **commit & push**,
  **push**, and **pull** — with public-repo / read-only safety guard-rails.
- **GitHub account switcher** in the title bar (switch / add accounts).
- **Repo discovery:** scan the computer for git repos and Obsidian vaults and pick
  which to load.
- **Sidebar:** Slack-style groups (create / rename / reorder / collapse),
  drag-to-reorganise, and remove-from-sidebar.
- **Composer fixes:** reliable Enter-to-send inside full-screen TUIs (Claude Code),
  autocorrect/suggestions disabled, command history, drag-and-drop file paths.
- Packaged macOS app (Apple Silicon + Intel).

## 0.3.0

- First packaged macOS build (`.dmg` / `.zip`) and download page.

## 0.2.0

- Renamed to **Gitsidian**. Generalised from Obsidian-only to any project folder.
- Embedded multi-tab terminals (`node-pty` + `xterm.js`) with live status lights.
- File tree, AI-CLI detection, friendly composer bar.

## 0.1.0

- Initial launcher prototype.

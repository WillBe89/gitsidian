# Changelog

All notable changes to Gitsidian.

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

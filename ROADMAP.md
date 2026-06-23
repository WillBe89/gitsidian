# Roadmap

Ideas for future releases — roughly in priority order, not firm commitments.
Suggestions and contributions welcome; sponsorship helps fund the signing/notarization
that removes the OS security prompts (see the README's **Support** section).

## 0.7 — the next big themes

### Total file management in the sidebar
Turn the file tree into a proper file manager — manage projects without the Finder
or a terminal. *(Today: create / rename / delete-to-Trash / drag-to-move already work.)*

- **New folder / new file** from a right-click anywhere in the tree.
- **Copy, Cut, Paste, Duplicate, and "Move to…"** via right-click — not just drag.
- **Multi-select** files/folders for bulk move, copy, or delete.
- Drag files **between projects**, and into folders, with clear drop targets.

### Advanced team chat
Make chat feel like a real chat app, not just issue comments.

- **Display name / alias** — choose the name you appear as in Gitsidian while your
  **GitHub account stays the underlying auth**. An alias per GitHub login (or a
  fresh alias per account), shared via the team's hub repo so everyone sees the
  same names.
- **Custom avatar** — override the GitHub avatar with your own image.
- **Rich compose toolbar** — Slack-style formatting buttons (bold, italic, code,
  lists, links) on top of the markdown chat already renders.
- **Reactions, threads, and per-channel unread counts.**
- *(Real-time delivery + presence need a relay server — see 1.0.)*

## 1.0 — when it's signed

- **Code signing & notarization** (macOS + Windows) — removes the first-launch
  security prompt entirely. The build is already wired (`build/notarize.js`,
  hardened-runtime entitlements); it needs a paid Apple Developer ID + a Windows
  certificate. **The single biggest UX win — and what sponsorship funds.**
- **Full in-place auto-update** — once signed, upgrade silently (Squirrel /
  electron-updater) instead of the guided manual install.
- **Real-time chat, presence & shared/pair sessions** — the flagship team
  features, which need a relay; natural to build once the base is signed + stable.

## Smaller / ongoing

- **Editor:** more languages, a code outline, format-on-save.
- **Git:** conflict helper for non-fast-forward pulls, stash management,
  remember-the-AI per project + per-project environment variables.
- **Sessions/UI:** drag tabs to reorder, saved "workspaces", split into >2 panes,
  terminal search (⌘F), follow-system Dark/Light + more theme presets.
- **Distribution:** auto-update the Homebrew cask from CI, more Linux formats
  (`.rpm`, system tray icon).

## Shipped recently

**0.6.2:** split-picker fix + shift/right-click to split any two tabs · resizable
message box · SVG lightning-bolt dispatch icon · markdown release notes + improved
update install flow (downloads to ~/Downloads, prunes old, offers cleanup).

**0.6.1:** split any two tabs (terminal/editor/AI/diff) · update dialog renders
markdown notes · README "Highlights" refresh.

**0.6.0:** CodeMirror code editor (syntax highlighting, find/replace, go-to-line) ·
review & stage changes with per-hunk staging · commit history · open/show a pull
request · multi-file search · command palette · Markdown/image preview ·
drag-and-drop in the tree · auto-reload of files edited on disk · **team chat**
(GitHub-backed, channels-per-repo, invite by username/email) · **AI command
dispatch** (opt-in, guard-railed) · long-terminal scroll fix.

**0.5.0:** built-in editor · file management in the tree (create/rename/delete) ·
inline diff · branch switcher · AI-suggested commit messages · session persistence ·
light theme · paste-image-as-file · split terminals · **resizable sidebar + split
divider** · auto-update · Linux packaging (AppImage / .deb) · sign/notarize
scaffolding.

**Earlier:** close-running-tab confirm · keyboard shortcuts · agent-finished
notifications · changed-file tinting · mark-as-ignore · pull preview · settings panel.

---

Have an idea? Open an issue.

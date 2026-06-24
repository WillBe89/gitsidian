# Roadmap

Ideas for future releases — roughly in priority order, not firm commitments.
Suggestions and contributions welcome; sponsorship helps fund the signing/notarization
that removes the OS security prompts (see the README's **Support** section).

## 0.8 — the next big themes

### Be the default, everywhere
0.7 made Gitsidian openable as a Markdown app and a terminal-anywhere target.
Next, make that seamless and broader.

- **More default file types** — offer to handle other text/code types you open
  often (JSON, YAML, logs), not just Markdown.
- **Multi-select in the tree** — bulk move / copy / delete across files & folders,
  and drag **between projects** with clear drop targets.
- **"Run here" hand-off** — when you drag a project folder in, detect a
  `package.json` / common task and offer a one-click "run `npm start` here" so
  picking up from another terminal is a single click.
- **Reopen-at-folder polish** — remember the last command per folder.

### Multi-pane workspace — up to 4 quadrants
Today's split shows any two tabs side by side. Power users want more: a **grid of
up to four panes** (2×2 quadrants) in one window — e.g. two or three AI sessions
plus a terminal or editor — so you can set up a cockpit and glance across all of it
at once, switching focus without tab-hopping.

- **2×2 quadrant layout** (plus 1×3 / 2×1 presets), each cell any tab type
  (terminal, AI, editor, chat, diff).
- **Drag a tab into a quadrant**; resizable dividers between cells; layout persists.
- Keyboard focus-switching between panes; "maximise this pane" toggle.
- Builds directly on the existing split engine.

### Advanced team chat
Make chat feel like a real chat app, not just issue comments.

- **Reactions, threads, and per-channel unread counts.**
- **Edit a sent message** in place (today: delete + repost).
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
- **Sessions/UI:** drag tabs to reorder, saved "workspaces", terminal search (⌘F),
  follow-system Dark/Light + more theme presets.
- **Distribution:** auto-update the Homebrew cask from CI, more Linux formats
  (`.rpm`, system tray icon).

## Shipped recently

**0.7.0:** opens your **Markdown files** (set Gitsidian as the default `.md` app) ·
**open a terminal anywhere** (drag a folder / Terminal proxy icon, `gits` command,
`gitsidian://` URL scheme) · **full file management** (copy/cut/paste/duplicate/
move-to + drag) · **polished chat composer** (SVG toolbar, lists auto-continue,
working blockquotes/strikethrough) · **copy/delete messages, delete channel with
.md backup**, alias + custom avatar · **sectioned Settings + theme picker** with
seven themes and fully custom accent/background colours.

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

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

### Quadrant groups — remaining polish
Quadrant grouping landed in 0.7.1 and was polished hard in 0.7.2 (shift-click to
select → create, collapse-to-hide, drag-to-group/ungroup, drag-arrange quadrants,
resizable X/Y dividers, activity dots, compact tabs). Still to do:

- **Persist groups across relaunch** (groups are runtime-only today).
- **Keyboard focus-switching** between cells + a "maximise this cell" toggle.
- **Multiple live chats** — a chat can be a cell today, but only one chat session
  exists; allow several at once (per-session chat state refactor).

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

**0.7.2:** quadrant groups polished — shift-click to select then create a group ·
collapse truly hides a group's tabs · drag-arrange quadrants (tab→quadrant, label
swap) · resizable X/Y cell dividers · drag-to-group / drag-out-to-ungroup · group
activity dots · drag-to-reorder tabs · compact tabs (hide names and/or type tags).

**0.7.1:** **quadrant tab groups** — group 2–4 tabs into a side-by-side / 2×2 grid,
multiple groups at once (24-tab cap still applies), any tab type per cell including
chat; shift-click / select-to-group / right-click actions · composer-bar bleed fix.

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

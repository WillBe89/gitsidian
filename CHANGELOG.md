# Changelog

All notable changes to Gitsidian.

## 0.6.0

A "VSCode-lite" pass **plus team collaboration** — a real code editor, the full
git loop, and team chat with command dispatch, so simple AI jobs never need a
separate editor or a second app.

- **Real code editor (CodeMirror)** — syntax highlighting for many languages,
  line numbers, bracket matching, dark/light themes, find/replace (⌘F), and
  go-to-line (Alt+G).
- **Review & stage changes** — a per-project tab to stage/unstage individual
  files **or individual hunks**, view each file's diff, and commit only what's
  staged, then push.
- **Commit history** — a per-project log; click a commit to see its diff.
- **Open a Pull Request** — from the branch menu or command palette: opens the
  existing PR for the branch (also shown as a chip on the project card), or
  creates one via `gh`.
- **Multi-file search** — Shift+⌘F to search across a project; click a match to
  jump to that line.
- **Command palette** — ⌘P to fuzzy-open files in the active project and run
  quick actions.
- **Markdown & image preview** — a Preview toggle for `.md` files; image files
  open in an image preview pane.
- **Drag-and-drop in the tree** — move files and folders into other folders.
- **Auto-reload** — when a file you have open changes on disk (e.g. an AI agent
  edits it), the editor reloads it — and keeps your unsaved edits if you have any.
- **Team chat** — message your team from inside Gitsidian, using your GitHub
  account as your identity (login + avatar). A channel = one repo (its chat issue);
  switch channels on the left, invite by GitHub username or email, markdown +
  @mentions + autolinks, polls + local cache, public-repo warning.
- **Command dispatch (opt-in)** — propose an AI prompt for a teammate to run in a
  specific repo; they get an Approve card and it's *staged* in that repo's session
  for them to review and send. Guard rails: off by default, AI-prompts-only,
  local-approval + final-send gate, risky-pattern warnings, and it only runs in a
  repo they actually have cloned.
- **Fix:** long terminals now scroll cleanly to the bottom with the wheel/trackpad
  (the viewport stays sized to the visible area as the layout changes).

## 0.5.0

A big release — Gitsidian gains a built-in editor, file management, richer git,
and quality-of-life touches.

- **Built-in editor** — click a text file to open and edit it in a tab; save with
  ⌘S/Ctrl+S. Large or binary files still open in your default app.
- **File management in the tree** — right-click to create files/folders, rename,
  or delete (to the Trash). Plus "Open in default app".
- **Inline diff** — changed files show a `±` button (and a right-click option) to
  view exactly what changed, with added/removed lines highlighted.
- **Branch switcher** — each project shows its current branch; click to switch or
  create a branch.
- **Suggested commit messages** — in the Sync dialog, "✦ Suggest" writes a commit
  message from your changes (uses a local AI CLI if you have one, otherwise a
  tidy file-based summary).
- **Session persistence** — your open terminal and editor tabs reopen on relaunch
  (toggle in Settings).
- **Light theme** — pick Dark or Light in Settings; terminals follow.
- **Paste an image** — paste a screenshot into the composer and it's saved into
  the project folder, with the path inserted for you.
- **Split view** — show two terminals side by side (⊟ in the tab strip).
- **Auto-update** — Gitsidian checks GitHub for new releases and, with your
  approval, downloads and launches the installer. Current version shows in the
  sidebar and Settings.
- **Linux packaging** — AppImage and `.deb` builds now ship alongside macOS and
  Windows.
- **Code signing / notarization scaffolding** — build is ready to sign + notarize
  the moment an Apple Developer ID is configured (still unsigned for now).

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

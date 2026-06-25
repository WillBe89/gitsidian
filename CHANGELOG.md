# Changelog

All notable changes to Gitsidian.

## 0.8.1 — 2026-06-25

- **Fix:** renaming a **project group** in the sidebar (double-click its name) did
  nothing and stayed on "New group" — an internal function-name collision routed the
  click to the wrong handler. Renaming works again, and group headers now also have a
  **right-click menu** (Rename / Delete).

## 0.8.0 — 2026-06-25

**The final free release.** Development continues in **Mephisto**, the commercial
successor (private repo); this build gets critical bug/security fixes only.

- **Team chat moved to a collapsible side rail** — chat now docks as a resizable
  right-hand panel (drag its left edge) with the channel switcher inside, instead of
  taking a tab. A Settings option chooses how it opens: **push** (shrink the main
  area) or **overlay** (float over the right edge). The chat button now sits at the
  far right of the tab strip, next to where the panel opens.
- **Agent orchestration (human-in-the-loop)** — the headline new direction. Label
  your AI panes with **roles** (Coordinator, Research, Writer, Reviewer, Tester,
  Planner, or custom), then **route a selection from one agent into another's
  composer** to hand work off. Roles are backed by **editable Markdown prompt files**
  in each project's `.gitsidian/roles/` (copied from a built-in template package);
  assigning a role points the agent at its own file and asks it to follow it and
  raise any questions. Model-agnostic — works with any AI CLI.
- **Drag to reorder quadrant groups** in the tab strip.
- **Quiet auto-hiding terminal scrollbar** — the thumb stays invisible until you
  hover or scroll, with a reserved gutter so text never sits under it.
- **Relicensed** to the **PolyForm Noncommercial License 1.0.0** going forward
  (versions 0.7.4 and earlier remain MIT).

## 0.7.4 — 2026-06-24

- **Groups persist across relaunch** — your quadrant groups (their names, layout,
  which tabs belong to them, and the active group) come back when you reopen
  Gitsidian, so you don't have to rebuild your cockpit every session. Terminal and
  editor tabs restore as before; a chat pane in a group reopens from the chat icon.

## 0.7.3 — 2026-06-24

- **Fix:** terminals are now properly framed inside their pane — text could bleed
  **under the scrollbar** (and get lost when you selected everything) or over the
  top edge, especially in quadrant groups. The columns now leave a clean gutter for
  the scrollbar.
- Added an animated demo of quadrant groups to the README.

## 0.7.2 — 2026-06-24

Quadrant groups, polished into a real cockpit.

- **Build a group by selecting tabs** — **Shift-click** tabs to hold 2–4 (a
  selection, highlighted, not a group yet), then **right-click → Create group**,
  click the **grid button**, or **drag the held tabs together**. The group chip
  lands on the left of the strip.
- **Collapse truly hides** — a group's member tabs tuck away under its chip;
  click the chip's **grid icon** to expand/collapse them. (Fixes a bug where the
  tabs stayed visible.)
- **Arrange the quadrants by dragging** — drag a **tab into a quadrant** to place
  it there, or drag a **cell's label onto another cell** to swap. Drag a tab onto
  another tab's centre to group them, onto a group chip to add it, or onto empty
  strip space to pull it out of its group.
- **Resize the quadrants** — draggable **X and Y dividers** between cells.
- **Reorder tabs** by dragging them in the strip (⌘1–9 and restore follow the new
  order).
- **Group activity dot** — a chip lights up when one of its unfocused members has
  new output or a new chat message.
- **Compact tabs** — independently **hide tab names** and/or **hide the type tags**
  (Terminal / Claude / …) under Settings → Appearance, to shrink the strip.

## 0.7.1 — 2026-06-24

- **Quadrant tab groups** — select **2–4 open tabs** and group them into a grid
  (side-by-side, or 2×2 quadrants) with a name. Switch between a group and single
  tabs from the strip, and keep **multiple groups** at once — the 24-tab cap still
  applies (e.g. up to six groups of four, or twelve pairs). Any tab can be a cell:
  terminals, editors, diffs, or a **chat** — so you can set up a cockpit of 2–3 AI
  sessions plus a terminal and watch them all at once.
  - **Shift-click** a tab to quick-group it with the current one (or add it to the
    active group); **right-click** a tab or the group chip for grouping actions.
  - Each cell has a label + close; click a cell to focus it. Removing a group's
    second-to-last tab dissolves the group back to normal tabs.
  - *(Replaces the old two-pane split, which is now just "a group of two.")*
- **Fix:** on composer resize, the terminal's black viewport could bleed over the
  top of the message bar — now clipped to its pane.

## 0.7.0 — 2026-06-24

Gitsidian grows into a calm home for your repos, terminals, notes, and team — it
now opens your Markdown files, can be the app you open a terminal *anywhere* with,
and adds full file management, a polished chat composer, custom themes, and more.

- **Open Markdown files in Gitsidian** — Gitsidian can now be a file handler:
  double-click (or "Open With") a `.md`/`.markdown`/`.mdx` file and it opens
  straight into the **rendered preview**, with the editor a click away. There's a
  **"Make Gitsidian my Markdown app"** button under **Settings → Files** (macOS;
  uses `duti` when available, with manual steps otherwise). Other text files open
  in the editor; a single running instance handles every open.
- **Open a terminal anywhere** — **drag a folder** (or a Terminal window's
  title-bar icon, which carries its working directory) onto Gitsidian and it opens
  a **terminal tab rooted there**. Also works via "Open With Gitsidian" on a folder
  and a new **`gitsidian://terminal?cwd=…` URL scheme** — Settings → Files copies a
  one-line **`gits`** shell command so you can run `gits` in any folder to open it
  here. A one-time note is honest about the limits: Gitsidian starts a *fresh*
  shell — it can't adopt, mirror, or close your existing Terminal/iTerm session.

- **Fuller file management in the tree** — right-click any file/folder for
  **Copy, Cut, Duplicate, Paste, and Move to…** (a folder picker), on top of the
  existing new/rename/delete/drag-move. Right-click empty tree space for **New
  file / New folder / Paste** at the project root. Copies auto-rename on collision
  ("a copy.txt"); folders copy recursively.
- **Polished chat composer** — the grip, toolbar, text box, and Send/AI-propose
  buttons are now one clean bordered card (no more floating pieces). The toolbar
  is all **SVG icons with hover tooltips**: Bold, Italic, Strikethrough, Inline
  code, Code block, Bulleted list, Numbered list, Quote, Link, and Emoji.
  - Lists **auto-continue**: press Shift+Enter on a `- ` or `1.` line and the next
    bullet/number is added for you (an empty item ends the list).
  - **Quote** now actually renders as a styled block quote in chat (it was
    previously shown as literal `> ` text), and **strikethrough** (`~~`) renders too.
- **Copy & select chat text** — chat messages and the proposed-command prompt are
  now selectable, with a **copy button on hover** (great for sharing a directory
  or prompt with a teammate).
- **Delete chat messages & channels** — hover a message for a **delete** button
  (removes that comment on GitHub), and **right-click a channel** to **delete the
  whole channel** or **download a `.md` backup** of the transcript first. Deleting
  a channel warns clearly and offers the backup before it removes the GitHub thread
  for everyone. (Copy toasts now appear at the top, clear of the message box.)
- **Custom team avatars** — "Set avatar" in chat picks an image (auto-downscaled),
  stored in the team's hub repo (`.gitsidian/members.json`) so everyone sees it in
  place of the GitHub avatar. The same store carries a display-name **alias** —
  your GitHub account stays the auth.
- **Sectioned settings + theme picker** — Settings is now organised into tabs
  (Appearance / Sessions / Team / Updates). Appearance adds a **theme picker** with
  seven backgrounds beyond plain day/night — **Midnight, Ink** (bold on black),
  **Muted, Grape** (purple), **Nord, Day**, and a warm **Claude** light scheme;
  terminals and the editor follow. Your **display-name alias** is set cleanly under
  the Team tab.
- **Fully custom colours** — alongside the presets, pick **any accent and any
  background** with hex/colour pickers. The app derives a coherent surface palette
  (panels, borders, text, terminal) from your background and follows its
  light/dark automatically. Presets stay one click away.
- **Fix:** a saved **display-name alias** (or avatar) now shows immediately — the
  app uses the just-written profile instead of re-reading GitHub, which could
  briefly return a stale copy and make the change look like it didn't take.
- **Fix:** the drag-and-drop highlight (the red border in the sidebar and around
  a terminal) could get stuck after a cancelled drag or one that left the window —
  now always clears.

- **Fix:** the split (`⊟`) picker opened and closed instantly (a click-bubbling
  bug) and looked broken — it now stays open.
- **Three ways to split now** — click `⊟` and pick a tab, **Shift-click** another
  tab, or **right-click** a tab → "Split: show beside the current tab".
- **Resizable message box** — drag the grip above any composer (terminal or chat)
  to make it taller, so long messages are easy to see. Persists.
- The AI command-dispatch icon is now a crisp **SVG lightning bolt** (bigger and
  cleaner) instead of an emoji.

## 0.6.1

- **Split any two tabs** — the split (`⊟`) button now opens a picker so you can
  put *any* two open tabs side by side (terminal, editor, AI, diff, chat…), not
  just two terminals.
- **Fix:** the auto-update dialog now renders release notes as formatted markdown
  (headings, bold, lists, links) instead of raw text.
- **Better update install flow** — the installer now downloads to **Downloads**
  (and is revealed in Finder, so it's easy to find), shows clear step-by-step
  instructions with a "Quit to finish" button (no more abrupt auto-close), removes
  the **previous** download automatically (no version bloat), and offers to delete
  the leftover installer next launch once the update has applied.
  *(All the above take effect once you're on a build that includes them — 0.6.1+.)*

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

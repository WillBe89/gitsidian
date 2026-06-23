# Roadmap

Ideas for future releases — roughly in priority order, not firm commitments.
Suggestions and contributions welcome; sponsorship helps fund the signing/notarization
that removes the OS security prompts (see the README's **Support** section).

## Team & collaboration

0.6.0 introduced GitHub-backed team chat + command dispatch. Next for teams:

- **Real-time chat** — instant delivery, typing indicators, and presence
  (who's online / which repo they're in), instead of the current ~polling.
- **Shared / pair sessions** — watch a teammate's AI session live (view-only
  first; an edit/drive mode is a much bigger, carefully-guarded step).
- **Reactions, threads, and multiple channels** in chat, plus cross-channel
  unread counts.
- **Shareable team workspace** — one click to load the whole cockpit (the same
  repos, groups, and default AI) a teammate uses.

## Editing & files

- **More languages & a code outline** in the editor; format-on-save hooks.
- **Copy** (not just move) in the tree, and duplicate-file.

## Git & GitHub

- **Conflict helper** for non-fast-forward pulls (clear choices instead of a
  scary error).
- **Stash management** — stash/pop from the UI.
- **Remember the AI per project**, and per-project environment variables for the
  CLIs (API keys, model overrides).

## Sessions & UI

- **Drag tabs to reorder**; save a set of tabs as a named **workspace**.
- **Split into more than two panes**, and split an editor beside a terminal.
- **Terminal search (⌘F)** within scrollback.
- **Follow the system appearance** (auto Dark/Light), plus more theme presets and
  a custom-accent picker.

## Distribution

- **Code signing & notarization** (macOS + Windows) to remove the security
  warnings — the build is already wired for it (`build/notarize.js`,
  hardened-runtime entitlements); it needs a paid Apple Developer ID + a Windows
  certificate. *This is the single biggest UX win and what donations fund.*
- **Full in-place auto-update** — once builds are signed, upgrade silently with
  Squirrel/electron-updater instead of handing off to the installer.
- **Auto-update the Homebrew cask** from CI on each release (today it's a manual
  shasum bump).
- **More Linux formats** — `.rpm` and a system tray icon.

## Shipped recently

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

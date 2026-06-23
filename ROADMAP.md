# Roadmap

Ideas for future releases — roughly in priority order, not firm commitments.
Suggestions and contributions welcome; sponsorship helps fund the signing/notarization
that removes the OS security prompts (see the README's **Support** section).

## Next up — 0.6.0 candidates

The theme for the next release: **make the git + editing loop feel complete**, so
you rarely need to drop to a raw terminal.

- **Review & stage changes** — a "Review changes" view for a whole project: see
  every changed file's diff, and stage/unstage individual files (and hunks) before
  committing, instead of all-or-nothing.
- **Commit history** — a per-project log (messages, author, date); click a commit
  to see its diff. The natural companion to the inline diff we just shipped.
- **Open a Pull Request** — from a branch, create a PR with `gh` (title + body)
  without leaving Gitsidian; show the PR's status on the project card.
- **Editor essentials** — find/replace (⌘F), go-to-line, and basic syntax
  highlighting so the built-in editor is comfortable for real edits.
- **Markdown & image preview** — a preview toggle for `.md` files (great for
  Obsidian vaults) and inline image previews when you open an image.
- **Command palette (⌘P)** — fuzzy-open any file in the active project and run
  common actions from the keyboard.

## Editing & files

- **Multi-file search** across a project (and jump to matches in the editor).
- **Drag-and-drop in the tree** to move/copy files and folders.
- **Auto-reload** an open file when it changes on disk (e.g. an AI edited it),
  with a conflict prompt if you have unsaved changes.

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

**0.5.0:** built-in editor · file management in the tree (create/rename/delete) ·
inline diff · branch switcher · AI-suggested commit messages · session persistence ·
light theme · paste-image-as-file · split terminals · **resizable sidebar + split
divider** · auto-update · Linux packaging (AppImage / .deb) · sign/notarize
scaffolding.

**Earlier:** close-running-tab confirm · keyboard shortcuts · agent-finished
notifications · changed-file tinting · mark-as-ignore · pull preview · settings panel.

---

Have an idea? Open an issue.

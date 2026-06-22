#!/usr/bin/env bash
# Gitsidian one-line installer for macOS.
#   curl -fsSL https://raw.githubusercontent.com/WillBe89/gitsidian/master/install.sh | bash
# Downloads the latest release, installs to /Applications, and clears the
# download-quarantine flag so it opens without the Gatekeeper prompt.
set -euo pipefail

REPO="WillBe89/gitsidian"
APP="Gitsidian"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "→ Finding the latest $APP release…"
ASSETS="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
  | grep -oE 'https://[^"]+\.dmg')"

if [ "$(uname -m)" = "arm64" ]; then
  DMG_URL="$(echo "$ASSETS" | grep 'arm64' | head -1)"
else
  DMG_URL="$(echo "$ASSETS" | grep -v 'arm64' | head -1)"
fi
[ -n "$DMG_URL" ] || { echo "Could not find a .dmg in the latest release."; exit 1; }

echo "→ Downloading $(basename "$DMG_URL")…"
curl -fsSL "$DMG_URL" -o "$TMP/g.dmg"

echo "→ Installing to /Applications…"
MOUNT="$(hdiutil attach -nobrowse -quiet "$TMP/g.dmg" | grep -o '/Volumes/.*')"
rm -rf "/Applications/$APP.app"
cp -R "$MOUNT/$APP.app" /Applications/
hdiutil detach -quiet "$MOUNT"

echo "→ Clearing quarantine…"
xattr -dr com.apple.quarantine "/Applications/$APP.app" || true

echo "✓ $APP installed. Launch it from Applications."

// electron-builder afterSign hook — notarize the macOS build with Apple.
//
// This is a no-op unless Apple credentials are present in the environment, so
// the default unsigned / ad-hoc builds (dev + current CI) keep working exactly
// as before. When the project gets a paid Apple Developer ID, set these in the
// CI secrets (or your shell) and signing + notarization activate automatically:
//
//   APPLE_ID                    your-apple-id@example.com
//   APPLE_APP_SPECIFIC_PASSWORD an app-specific password (appleid.apple.com)
//   APPLE_TEAM_ID               your 10-char Team ID
//
// You'll also need a Developer ID Application certificate available to
// electron-builder (CSC_LINK / CSC_KEY_PASSWORD, or the login keychain).
'use strict';

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env;
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.log('[notarize] Apple credentials not set — skipping (build stays unsigned/ad-hoc).');
    return;
  }

  // Lazy-require so a credential-less build never needs the dependency present.
  const { notarize } = require('@electron/notarize');
  const appName = context.packager.appInfo.productFilename;
  console.log(`[notarize] Submitting ${appName}.app to Apple — this can take a few minutes…`);
  await notarize({
    appPath: `${appOutDir}/${appName}.app`,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID,
  });
  console.log('[notarize] Notarization complete.');
};

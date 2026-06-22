// electron-builder afterPack hook: ad-hoc code-sign the macOS .app so the whole
// bundle has a *valid* signature. Without a real Apple cert, electron-builder
// skips signing, which leaves a broken signature and macOS reports the app as
// "damaged". A proper ad-hoc sign fixes that (users still bypass Gatekeeper once
// via right-click → Open, since it isn't notarized).
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  console.log(`  • ad-hoc signed ${appPath}`);
};

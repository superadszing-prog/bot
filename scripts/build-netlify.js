/**
 * Build script for Netlify deploys.
 *
 * Copies the browser-compatible core modules from src/ into
 * public/vendor/ so the static demo site in public/ is fully
 * self-contained and can be published as-is (Netlify's publish
 * directory). This avoids duplicating the command parser / video
 * processor / AI vision logic between the browser extension and the
 * web demo — both consume the exact same files.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VENDOR_DIR = path.join(ROOT, 'public', 'vendor');

const FILES_TO_COPY = [
  'src/utils/logger.js',
  'src/core/commandParser.js',
  'src/core/frameExtractor.js',
  'src/core/videoProcessor.js',
  'src/core/aiVision.js',
  'src/core/permissions.js'
];

function main() {
  fs.mkdirSync(VENDOR_DIR, { recursive: true });

  for (const relativePath of FILES_TO_COPY) {
    const source = path.join(ROOT, relativePath);
    const destination = path.join(VENDOR_DIR, path.basename(relativePath));
    fs.copyFileSync(source, destination);
    console.log(`[build-netlify] Copied ${relativePath} -> public/vendor/${path.basename(relativePath)}`);
  }

  console.log('[build-netlify] Done. public/ is ready to publish to Netlify.');
}

main();

/**
 * After `expo export --platform web`, guarantee PWA files exist in dist/
 * (some Metro/Expo versions omit them from the export summary; dist should still contain them).
 * Fails the build if service-worker.js is missing — without it Web Push cannot register.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const pub = path.join(root, 'public');

const required = ['service-worker.js', 'manifest.json', 'icon.png'];

function copyIfMissing(name) {
  const dest = path.join(dist, name);
  const src = path.join(pub, name);
  if (fs.existsSync(dest)) return;
  if (!fs.existsSync(src)) {
    console.error(`[pwa] missing source file: public/${name}`);
    return;
  }
  fs.copyFileSync(src, dest);
  console.log(`[pwa] copied public/${name} → dist/${name}`);
}

if (!fs.existsSync(dist)) {
  console.error('[pwa] dist/ does not exist. Run expo export --platform web first.');
  process.exit(1);
}

for (const f of required) {
  copyIfMissing(f);
}

const sw = path.join(dist, 'service-worker.js');
if (!fs.existsSync(sw)) {
  console.error('[pwa] dist/service-worker.js is required for Web Push. Add public/service-worker.js and rebuild.');
  process.exit(1);
}

console.log('[pwa] static assets OK');

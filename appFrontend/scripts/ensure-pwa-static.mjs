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

function writeWellKnown() {
  const destDir = path.join(dist, '.well-known');
  fs.mkdirSync(destDir, { recursive: true });

  const srcDir = path.join(pub, '.well-known');
  if (fs.existsSync(srcDir)) {
    for (const name of fs.readdirSync(srcDir)) {
      fs.copyFileSync(path.join(srcDir, name), path.join(destDir, name));
    }
  }

  const teamId = String(process.env.APPLE_TEAM_ID || '').trim();
  if (teamId) {
    const aasa = {
      applinks: {
        apps: [],
        details: [
          {
            appID: `${teamId}.com.sevenaside.app`,
            paths: ['/join/*', '/challenge/*', '/squad/*'],
          },
        ],
      },
    };
    fs.writeFileSync(path.join(destDir, 'apple-app-site-association'), JSON.stringify(aasa));
    console.log('[pwa] wrote dist/.well-known/apple-app-site-association');
  }

  const fingerprints = String(process.env.ANDROID_CERT_SHA256 || '')
    .split(',')
    .map((s) => s.trim().replace(/:/g, '').toUpperCase())
    .filter(Boolean)
    .map((sha256) => (sha256.includes(':') ? sha256 : sha256.match(/.{1,2}/g)?.join(':') || sha256));
  if (fingerprints.length) {
    const assetlinks = [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'com.sevenaside.app',
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ];
    fs.writeFileSync(path.join(destDir, 'assetlinks.json'), JSON.stringify(assetlinks));
    console.log('[pwa] wrote dist/.well-known/assetlinks.json');
  }
}

writeWellKnown();

const sw = path.join(dist, 'service-worker.js');
if (!fs.existsSync(sw)) {
  console.error('[pwa] dist/service-worker.js is required for Web Push. Add public/service-worker.js and rebuild.');
  process.exit(1);
}

console.log('[pwa] static assets OK');

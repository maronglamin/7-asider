const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const inputPath = path.join(root, 'assets', 'icon.png');
const assetsOut = path.join(root, 'assets', 'icon.png');
const publicOut = path.join(root, 'public', 'icon.png');

(async () => {
  const buffer = await sharp(inputPath)
    .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
    .png({
      compressionLevel: 9,
      palette: true,
      quality: 80,
      colors: 160,
      effort: 10,
      adaptiveFiltering: true,
    })
    .toBuffer();

  fs.writeFileSync(assetsOut, buffer);
  fs.writeFileSync(publicOut, buffer);

  console.log('Final byte size:', buffer.length);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

import sharp from 'sharp';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const svgPath = resolve(__dir, '../public/app-icon.svg');
const svg = readFileSync(svgPath);

const sizes = [
  { size: 192, name: 'icon-192.png' },
  { size: 512, name: 'icon-512.png' },
  { size: 180, name: 'icon-180.png' },
];

for (const { size, name } of sizes) {
  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile(resolve(__dir, `../public/icons/${name}`));
  console.log(`Generated ${name}`);
}

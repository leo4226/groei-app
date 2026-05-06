import sharp from 'sharp';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const iconsDir = resolve(__dir, '../../icons');

// Read the monstera SVG content (just the inner paths, no outer svg tag)
const monsteraSvg = readFileSync(resolve(iconsDir, 'monstera.svg'), 'utf8');

// Extract inner content from the monstera SVG (everything inside the <svg> tag)
const innerMatch = monsteraSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
const monsteraInner = innerMatch ? innerMatch[1] : '';

// Composite SVG: green rounded-square background + monstera centered and scaled
// The monstera viewBox is 0 0 100 100, we place it scaled to ~72% and shifted up slightly
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <!-- Background: dark green rounded square -->
  <rect x="0" y="0" width="100" height="100" rx="22" ry="22" fill="#2D6A4F"/>
  <!-- Monstera plant, scaled to 80% and centered (shift: x=-10, y=-10 then scale 0.8) -->
  <g transform="translate(10, 6) scale(0.82)">
    ${monsteraInner}
  </g>
</svg>`;

for (const size of [192, 512]) {
  await sharp(Buffer.from(iconSvg))
    .resize(size, size)
    .png()
    .toFile(resolve(__dir, `../public/icons/icon-${size}.png`));
  console.log(`Generated icon-${size}.png`);
}

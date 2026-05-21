import sharp from 'sharp';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve, basename } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const iconsDir = resolve(__dir, '../../icons');

function innerSvg(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const m = raw.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  return m ? m[1] : '';
}

function buildIconSvg(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect x="0" y="0" width="100" height="100" rx="22" ry="22" fill="#2D6A4F"/>
  <g transform="translate(10, 6) scale(0.82)">
    ${inner}
  </g>
</svg>`;
}

async function generate(name, inner) {
  const svg = buildIconSvg(inner);
  for (const size of [192, 512]) {
    await sharp(Buffer.from(svg))
      .resize(size, size)
      .png()
      .toFile(resolve(__dir, `../public/icons/icon-${size}-${name}.png`));
    console.log(`Generated icon-${size}-${name}.png`);
  }
}

// ── Monstera (always) + legacy manifest filenames ──
const monsteraInner = innerSvg(resolve(iconsDir, 'monstera.svg'));
await generate('monstera', monsteraInner);
// Also write the old names so manifest.json keeps working
const monsteraSvg = buildIconSvg(monsteraInner);
for (const size of [192, 512]) {
  await sharp(Buffer.from(monsteraSvg))
    .resize(size, size).png()
    .toFile(resolve(__dir, `../public/icons/icon-${size}.png`));
  console.log(`Generated icon-${size}.png`);
}

// ── Two random unpotted plants ──
const allIcons = readdirSync(iconsDir).filter(f => f.endsWith('.svg'));
const unpotted = allIcons.filter(f => f.includes('_bare') || f.includes('_nopot'));
const shuffled = unpotted.sort(() => Math.random() - 0.5);
const picks = shuffled.slice(0, 2);

for (const file of picks) {
  const name = basename(file, '.svg');
  await generate(name, innerSvg(resolve(iconsDir, file)));
}

console.log(`Picked: ${picks.join(', ')}`);

// Downloads monster token art from the 5etools image mirror into
// uploads/monster-tokens/<monster index>.webp, which the battle map draws for monster tokens.
// Personal-use art: the output folder is gitignored, so re-run this on a fresh checkout.
//
// Each monster's own source book decides which 5etools token folders are tried, in order — 2024
// art first wherever a 2024 version exists. A monster with no token in any of them gets a plain
// generated token from a game-icons.net icon (CC BY 3.0, by Lorc) if one is listed below.
//
// Usage: node scripts/download-monster-tokens.mjs [--force]
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const BASE_URL = 'https://raw.githubusercontent.com/5etools-mirror-3/5etools-img/main/bestiary/tokens';
const TOKEN_FOLDERS = {
  // The 2024 Monster Manual dropped a few 2014 monsters (Orc) — fall back to the 2014 art.
  XMM: ['XMM', 'MM'],
  // Tasha's summon spirits were reprinted in the 2024 Player's Handbook with new art.
  TCE: ['XPHB', 'TCE'],
  EFA: ['EFA'],
};
const ICON_FALLBACKS = {
  'eldritch-cannon': 'lorc/cannon',
};
// Big enough for a Gargantuan token zoomed in, small enough to send over the tunnel.
const SIZE = 280;
const CONCURRENCY = 8;

const force = process.argv.includes('--force');
const monstersDir = resolve('content', 'monsters');
const outDir = resolve('uploads', 'monster-tokens');
mkdirSync(outDir, { recursive: true });

const monsters = readdirSync(monstersDir)
  .filter((file) => file.endsWith('.json'))
  .map((file) => JSON.parse(readFileSync(resolve(monstersDir, file), 'utf8')));

const saved = {};
let skipped = 0;
const missing = [];

async function fetchToken(monster) {
  const code = monster.source?.code;
  for (const folder of TOKEN_FOLDERS[code] ?? [code]) {
    const res = await fetch(`${BASE_URL}/${folder}/${encodeURIComponent(monster.name)}.webp`);
    if (res.ok) return { from: folder, buffer: Buffer.from(await res.arrayBuffer()) };
  }
  return null;
}

// A dark disc with a gold rim and the icon in white, sized like the 5etools tokens.
async function iconToken(icon) {
  const res = await fetch(`https://game-icons.net/icons/ffffff/transparent/1x1/${icon}.svg`);
  if (!res.ok) return null;
  const inner = (await res.text()).replace(/^<svg[^>]*>|<\/svg>\s*$/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <circle cx="256" cy="256" r="240" fill="#2a2620" stroke="#b8933f" stroke-width="22"/>
    <g transform="translate(106 106) scale(0.586)">${inner}</g>
  </svg>`;
  return { from: 'game-icons', buffer: Buffer.from(svg) };
}

async function download(monster) {
  const target = resolve(outDir, `${monster.index}.webp`);
  if (!force && existsSync(target)) {
    skipped++;
    return;
  }
  const icon = ICON_FALLBACKS[monster.index];
  const token = (await fetchToken(monster)) ?? (icon ? await iconToken(icon) : null);
  if (!token) {
    missing.push(`${monster.name} (${monster.source?.code ?? 'no source'})`);
    return;
  }
  await sharp(token.buffer).resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 85 })
    .toFile(target);
  saved[token.from] = (saved[token.from] ?? 0) + 1;
}

const queue = [...monsters];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let monster = queue.shift(); monster; monster = queue.shift()) {
      try {
        await download(monster);
      } catch (err) {
        missing.push(`${monster.name} (${err.message})`);
      }
    }
  }),
);

const savedSummary = Object.entries(saved).map(([from, n]) => `${n} ${from}`).join(', ') || 'none';
console.log(`${monsters.length} monsters — saved ${savedSummary}; already present ${skipped}; missing ${missing.length}`);
if (missing.length) console.log(`Missing:\n  ${missing.sort().join('\n  ')}`);

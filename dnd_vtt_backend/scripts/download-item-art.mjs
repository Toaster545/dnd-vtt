// Downloads item illustrations from the 5etools image mirror into
// uploads/item-art/<item index>.webp, which the backend serves as each SRD item's `art_url`.
// Personal-use art: the output folder is gitignored, so re-run this on a fresh checkout.
//
// Each item's own source book is tried first, then the 2024 books, then the 2014 DMG (not the 2014
// PHB, whose gear art is line sketches on white). Only about a third of the items have art there
// (mostly weapons, armor and named magic items) — the rest keep their game-icons.net `image_url`.
//
// Usage: node scripts/download-item-art.mjs [--force]
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const BASE_URL = 'https://raw.githubusercontent.com/5etools-mirror-3/5etools-img/main/items';
const FALLBACK_FOLDERS = ['XPHB', 'XDMG', 'DMG'];
// Items whose 5etools art is a character scene rather than the item itself.
const SKIP = new Set(['pole-of-collapsing', 'prosthetic-limb', 'unbreakable-arrow']);
// Big enough for the item detail header and printed cards, small enough to send over the tunnel.
const SIZE = 400;
const CONCURRENCY = 8;

const force = process.argv.includes('--force');
const itemsDir = resolve('content', 'items');
const outDir = resolve('uploads', 'item-art');
mkdirSync(outDir, { recursive: true });

const items = readdirSync(itemsDir)
  .filter((file) => file.endsWith('.json'))
  .map((file) => JSON.parse(readFileSync(resolve(itemsDir, file), 'utf8')));

const saved = {};
let skipped = 0;
const missing = [];

// 5etools names gear without our pack-size suffixes: "Arrows (20)" is just "Arrows".
function namesFor(item) {
  return [...new Set([item.name, item.name.replace(/\s*\(.*\)$/, '')])];
}

async function fetchArt(item) {
  const folders = [...new Set([item.source?.code, ...FALLBACK_FOLDERS].filter(Boolean))];
  for (const name of namesFor(item)) {
    for (const folder of folders) {
      const res = await fetch(`${BASE_URL}/${folder}/${encodeURIComponent(name)}.webp`);
      if (res.ok) return { from: folder, buffer: Buffer.from(await res.arrayBuffer()) };
    }
  }
  return null;
}

async function download(item) {
  const target = resolve(outDir, `${item.index}.webp`);
  if (!force && existsSync(target)) {
    skipped++;
    return;
  }
  const art = SKIP.has(item.index) ? null : await fetchArt(item);
  if (!art) {
    missing.push(`${item.name} (${item.source?.code ?? 'no source'})`);
    return;
  }
  await sharp(art.buffer)
    .resize(SIZE, SIZE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toFile(target);
  saved[art.from] = (saved[art.from] ?? 0) + 1;
}

const queue = [...items];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      try {
        await download(item);
      } catch (err) {
        missing.push(`${item.name} (${err.message})`);
      }
    }
  }),
);

const savedSummary = Object.entries(saved).map(([from, n]) => `${n} ${from}`).join(', ') || 'none';
console.log(`${items.length} items — saved ${savedSummary}; already present ${skipped}; no art ${missing.length}`);
if (missing.length) console.log(`No art (keeps its icon):\n  ${missing.sort().join('\n  ')}`);

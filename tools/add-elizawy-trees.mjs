// Replaces the OGA "LPC Trees" (which read poorly) with ElizaWy/LPC's far
// nicer seasonal tree billboards (Terrain/trees_{summer,autumn,winter}.png,
// CC-BY-SA 3.0). Trees are upright billboards, so they drop into our iso world
// unchanged. Each crop is trimmed to its content bbox and merged into
// media.trees; the old tree_*.png stay only as unreferenced files.
// Usage: node tools/add-elizawy-trees.mjs <dir-with-elizawy-repo>
import fs from 'node:fs';
import path from 'node:path';
import { decode, encode, makeImage, blit } from './png.mjs';

const SRC = path.join(process.argv[2] || '.', 'elizawy/Terrain');
const OUT = path.resolve('client/assets/env');
fs.mkdirSync(OUT, { recursive: true });
const MEDIA = path.resolve('client/assets/media.json');
const media = JSON.parse(fs.readFileSync(MEDIA, 'utf8'));
media.trees = {};

const atlas = {};
const load = (season) => (atlas[season] ??= decode(fs.readFileSync(path.join(SRC, `trees_${season}.png`))));

// trim a cropped image to its non-transparent bounding box
function trim(img) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++)
    if (img.data[(y * img.w + x) * 4 + 3] > 12) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (x1 < 0) return img;
  const o = makeImage(x1 - x0 + 1, y1 - y0 + 1);
  blit(o, 0, 0, img, x0, y0, o.w, o.h);
  return o;
}
function crop(season, x, y, w, h) {
  const src = load(season), o = makeImage(w, h);
  blit(o, 0, 0, src, x, y, w, h);
  return trim(o);
}

// [type, season, x, y, w, h] — hand-picked from the atlases
const PICKS = [
  ['tree', 'summer', 320, 172, 96, 84],       // Ash: small airy round crown
  ['oak_tree', 'summer', 126, 14, 98, 138],   // Oak: big round broadleaf
  ['elm_tree', 'summer', 318, 14, 98, 138],   // Great elm: big broadleaf
  ['willow_tree', 'summer', 222, 14, 98, 138],// Willow: broadleaf
  ['yew_tree', 'summer', 418, 354, 92, 144],  // Yew: dark dense evergreen
  ['maple_tree', 'autumn', 126, 14, 98, 138], // Maple: autumn crown
  ['frostpine_tree', 'winter', 414, 384, 98, 168], // Frostpine: tall snow-laden conifer (bottom row)
];
for (const [type, season, x, y, w, h] of PICKS) {
  const t = crop(season, x, y, w, h);
  const name = `tree_${type}.png`;
  fs.writeFileSync(path.join(OUT, name), encode(t.w, t.h, t.data));
  media.trees[type] = { file: `env/${name}`, w: t.w, h: t.h };
  console.log(type, '<-', season, t.w + 'x' + t.h);
}

// preview montage
const per = 7, cw = 110, ch = 150;
const M = makeImage(per * cw, ch);
PICKS.forEach(([type], i) => {
  const im = decode(fs.readFileSync(path.join(OUT, `tree_${type}.png`)));
  blit(M, i * cw + ((cw - im.w) >> 1), ch - im.h, im);
});
fs.writeFileSync(path.join(process.argv[2] || '.', 'tree_final.png'), encode(M.w, M.h, M.data));
fs.writeFileSync(MEDIA, JSON.stringify(media, null, 1));
console.log('media.json merged');

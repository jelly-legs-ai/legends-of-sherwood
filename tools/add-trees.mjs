// Imports "LPC Trees" by bluecarrot16 (https://opengameart.org/content/lpc-trees,
// CC-BY-SA 3.0 / GPL 3.0) — auto-extracts individual trees from the 1024x1024
// atlases via connected-component detection, downsizes the giants, and maps
// our wood types onto fitting palettes: ash + oak + elm from the green atlas,
// willow from the pale, maple from the autumn orange, yew from the brown.
// (Frostpine keeps its procedural snow-capped conifer — the pack is broadleaf.)
// Usage: node tools/add-trees.mjs <dir-with-extracted-lpc-trees>
import fs from 'node:fs';
import path from 'node:path';
import { decode, encode, makeImage, blit, downscale } from './png.mjs';

const SRC = path.join(process.argv[2] || '.', 'lpc-trees/lpc-trees');
const OUT = path.resolve('client/assets/env');
fs.mkdirSync(OUT, { recursive: true });
const MEDIA = path.resolve('client/assets/media.json');
const media = JSON.parse(fs.readFileSync(MEDIA, 'utf8'));

// Connected components over the alpha mask (4-neighbour flood fill on a
// coarse 4px grid for speed, then exact bbox from the fine mask).
function components(img) {
  const G = 4, gw = Math.ceil(img.w / G), gh = Math.ceil(img.h / G);
  const solid = new Uint8Array(gw * gh);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++)
    if (img.data[(y * img.w + x) * 4 + 3] > 16) solid[((y / G) | 0) * gw + ((x / G) | 0)] = 1;
  const seen = new Uint8Array(gw * gh), comps = [];
  for (let i = 0; i < solid.length; i++) {
    if (!solid[i] || seen[i]) continue;
    const q = [i]; seen[i] = 1;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, area = 0;
    while (q.length) {
      const c = q.pop(), cyy = (c / gw) | 0, cxx = c % gw;
      x0 = Math.min(x0, cxx); y0 = Math.min(y0, cyy); x1 = Math.max(x1, cxx); y1 = Math.max(y1, cyy); area++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cxx + dx, ny = cyy + dy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const n = ny * gw + nx;
        if (solid[n] && !seen[n]) { seen[n] = 1; q.push(n); }
      }
    }
    comps.push({ x: x0 * G, y: y0 * G, w: (x1 - x0 + 1) * G, h: (y1 - y0 + 1) * G, area });
  }
  return comps.sort((a, b) => b.area - a.area);
}

function extract(img, c) {
  const out = makeImage(Math.min(c.w, img.w - c.x), Math.min(c.h, img.h - c.y));
  blit(out, 0, 0, img, c.x, c.y, out.w, out.h);
  return out;
}

// [our node type, atlas, which component (by size rank)]
const PICKS = [
  ['tree', 'trees-green.png', 1],        // Ash: a slimmer green
  ['oak_tree', 'trees-green.png', 0],    // Oak: the broadest crown
  ['elm_tree', 'trees-green.png', 2],    // Great elm
  ['willow_tree', 'trees-pale.png', 0],  // Willow: silvery pale
  ['maple_tree', 'trees-orange.png', 0], // Maple: autumn orange
  ['yew_tree', 'trees-brown.png', 0],    // Yew: dark and ancient
];
const atlases = {};
media.trees = media.trees || {};
for (const [type, file, rank] of PICKS) {
  if (!atlases[file]) {
    const img = decode(fs.readFileSync(path.join(SRC, file)));
    atlases[file] = { img, comps: components(img) };
  }
  const { img, comps } = atlases[file];
  const c = comps[rank];
  if (!c) { console.log(type, 'MISSING component', rank); continue; }
  let tree = extract(img, c);
  while (tree.h > 176 || tree.w > 144) tree = downscale(tree, 2);   // fit the world scale
  const name = `tree_${type}.png`;
  fs.writeFileSync(path.join(OUT, name), encode(tree.w, tree.h, tree.data));
  media.trees[type] = { file: `env/${name}`, w: tree.w, h: tree.h };
  console.log(type, '<-', file, `#${rank}`, tree.w + 'x' + tree.h);
}
fs.writeFileSync(MEDIA, JSON.stringify(media, null, 1));
console.log('media.json merged');

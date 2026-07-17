// Trees Mega Pack import: replace the seven wood-species models with
// height128 trees from the mega pack (opengameart.org trees-mega-pack).
// Each species is one tree flood-extracted from the sheet at a seed point
// (shadow included), then hue-mapped toward the species' canopy palette —
// greens shift, trunks and snow stay.
// Usage: node tools/add-mega-trees.mjs <scratchpad/oga dir> [--preview]
import fs from 'node:fs';
import path from 'node:path';
import { decode, encode, makeImage } from './png.mjs';

const O = process.argv[2];
const PREVIEW = process.argv.includes('--preview');
const ENV = path.resolve('client/assets/env');
const MEDIA = path.resolve('client/assets/media.json');
const media = JSON.parse(fs.readFileSync(MEDIA, 'utf8'));

const sheet = decode(fs.readFileSync(path.join(O, 'trees-mega-pack/height128.png')));

// species -> [seedX, seedY, hueShift°, satMul, lumMul] (hue only moves greens)
const SPECIES = {
  tree: [140, 60, 0, 1, 1],              // bushy mid broadleaf, as-is
  oak_tree: [650, 570, -10, 1.05, 0.92], // broad domed canopy, deepened green
  elm_tree: [450, 190, 18, 1.0, 1.06],   // tall broadleaf, lighter yellow-green
  willow_tree: [720, 190, 8, 0.9, 1.0],  // weeping willow, soft sage
  yew_tree: [640, 440, -8, 1.1, 0.62],   // dark column conifer, near-black green
  maple_tree: [1310, 300, 0, 1, 1],      // autumn crimson tree, as-is
  frostpine_tree: [555, 320, 0, 1, 1],   // snow-clad pine, as-is
};

const A = (x, y) => (x >= 0 && y >= 0 && x < sheet.w && y < sheet.h) ? sheet.data[(y * sheet.w + x) * 4 + 3] : 0;

function extract(seedX, seedY) {
  if (A(seedX, seedY) <= 10) throw new Error(`seed (${seedX},${seedY}) is transparent`);
  const seen = new Set();
  const stack = [seedY * sheet.w + seedX];
  seen.add(stack[0]);
  let x0 = 1e9, y0 = 1e9, x1 = 0, y1 = 0;
  while (stack.length) {
    const i = stack.pop();
    const x = i % sheet.w, y = (i / sheet.w) | 0;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const nx = x + dx, ny = y + dy;
      if (A(nx, ny) <= 10) continue;
      const ni = ny * sheet.w + nx;
      if (!seen.has(ni)) { seen.add(ni); stack.push(ni); }
    }
  }
  const o = makeImage(x1 - x0 + 1, y1 - y0 + 1);
  for (const i of seen) {
    const x = i % sheet.w, y = (i / sheet.w) | 0;
    for (let k = 0; k < 4; k++) o.data[((y - y0) * o.w + x - x0) * 4 + k] = sheet.data[i * 4 + k];
  }
  return o;
}

// shift the hue of green-dominant (canopy) pixels; trunks, snow and shadow keep
function recolor(im, hueDeg, satMul, lumMul) {
  if (!hueDeg && satMul === 1 && lumMul === 1) return im;
  for (let p = 0; p < im.data.length; p += 4) {
    if (im.data[p + 3] <= 10) continue;
    let [r, g, b] = [im.data[p] / 255, im.data[p + 1] / 255, im.data[p + 2] / 255];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d < 0.04 || mx !== g) continue;                  // not a green canopy pixel
    let h = 60 * (((b - r) / d) + 2);                    // hue with green as max
    let l = (mx + mn) / 2, s = d / (1 - Math.abs(2 * l - 1) || 1);
    h = (h + hueDeg + 360) % 360;
    s = Math.min(1, s * satMul); l = Math.min(1, l * lumMul);
    const c = (1 - Math.abs(2 * l - 1)) * s, x2 = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
    let rr, gg, bb;
    if (h < 60) [rr, gg, bb] = [c, x2, 0]; else if (h < 120) [rr, gg, bb] = [x2, c, 0];
    else if (h < 180) [rr, gg, bb] = [0, c, x2]; else if (h < 240) [rr, gg, bb] = [0, x2, c];
    else if (h < 300) [rr, gg, bb] = [x2, 0, c]; else [rr, gg, bb] = [c, 0, x2];
    im.data[p] = Math.round((rr + m) * 255); im.data[p + 1] = Math.round((gg + m) * 255); im.data[p + 2] = Math.round((bb + m) * 255);
  }
  return im;
}

const previews = [];
for (const [name, [sx, sy, hue, sat, lum]] of Object.entries(SPECIES)) {
  const im = recolor(extract(sx, sy), hue, sat, lum);
  previews.push([name, im]);
  if (!PREVIEW) {
    fs.writeFileSync(path.join(ENV, `mp_${name}.png`), encode(im.w, im.h, im.data));
    media.trees[name] = { file: `env/mp_${name}.png`, w: im.w, h: im.h };
  }
  console.log(name.padEnd(16), im.w + 'x' + im.h);
}

// contact sheet for eyeballing
{
  const W = previews.reduce((s, [, im]) => s + im.w + 6, 4);
  const H = Math.max(...previews.map(([, im]) => im.h)) + 8;
  const cs = makeImage(W, H);
  let ox = 4;
  for (const [, im] of previews) {
    for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++)
      for (let k = 0; k < 4; k++) cs.data[((H - 4 - im.h + y) * W + ox + x) * 4 + k] = im.data[(y * im.w + x) * 4 + k];
    ox += im.w + 6;
  }
  fs.writeFileSync(path.join(O, 'trees-mega-pack/species_preview.png'), encode(cs.w, cs.h, cs.data));
}

if (!PREVIEW) fs.writeFileSync(MEDIA, JSON.stringify(media, null, 1));
console.log(PREVIEW ? 'preview only' : 'media.json updated');

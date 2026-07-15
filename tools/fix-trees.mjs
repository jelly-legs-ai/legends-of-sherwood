// Post-processes the ElizaWy tree billboards so they read well in our iso world:
//  1. keeps only the largest connected blob (drops atlas-bleed fragments that
//     otherwise float at ground level like a canopy poking through the floor);
//  2. gives every broadleaf a tall, clean tapered trunk (they sat too low to the
//     ground) so the canopy stands up ~2–2.5× higher on a proper stem, and the
//     trunkless "ash" bush finally gets a real stem.
// Conifers already stand tall, so they're only de-fragmented.
// Rewrites client/assets/env/tree_*.png in place and refreshes media.json dims.
// Idempotent when preceded by `node tools/add-elizawy-trees.mjs <dir>`.
import fs from 'node:fs';
import path from 'node:path';
import { decode, encode, makeImage } from './png.mjs';

const ENV = path.resolve('client/assets/env');
const MEDIA = path.resolve('client/assets/media.json');
const media = JSON.parse(fs.readFileSync(MEDIA, 'utf8'));

// broadleaves get a synthesized trunk `trunk` px tall; conifers are kept as-is.
const CFG = {
  tree: { trunk: 60, bark: ['#6b4a2a', '#875f34', '#49301a'] },   // ash (was a trunkless bush)
  oak_tree: { trunk: 62, bark: ['#6e4a28', '#8a6236', '#4a2f18'] },
  elm_tree: { trunk: 66, bark: ['#6a4726', '#856035', '#472d17'] },
  willow_tree: { trunk: 54, bark: ['#6b4c2c', '#87643a', '#48321c'] },
  maple_tree: { trunk: 62, bark: ['#6e4a28', '#8a6236', '#4a2f18'] },
  yew_tree: { conifer: true },
  frostpine_tree: { conifer: true },
};
const hex = (s) => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
const A = (im, x, y) => im.data[(y * im.w + x) * 4 + 3];
const copyRow = (dst, dy, src, sy) => { for (let x = 0; x < src.w; x++) for (let c = 0; c < 4; c++) dst.data[(dy * dst.w + x) * 4 + c] = src.data[(sy * src.w + x) * 4 + c]; };

function largestBlob(im) {
  const { w, h } = im, seen = new Uint8Array(w * h);
  let best = null, bestN = 0; const stack = [];
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || im.data[i * 4 + 3] <= 25) continue;
    const comp = []; stack.push(i); seen[i] = 1;
    while (stack.length) {
      const p = stack.pop(); comp.push(p); const px = p % w, py = (p / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = px + dx, ny = py + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx; if (seen[ni] || im.data[ni * 4 + 3] <= 25) continue;
        seen[ni] = 1; stack.push(ni);
      }
    }
    if (comp.length > bestN) { bestN = comp.length; best = comp; }
  }
  const out = makeImage(w, h);
  if (best) for (const p of best) for (let c = 0; c < 4; c++) out.data[p * 4 + c] = im.data[p * 4 + c];
  return out;
}

function trim(im) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (A(im, x, y) > 20) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (x1 < 0) return im;
  const o = makeImage(x1 - x0 + 1, y1 - y0 + 1);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) for (let c = 0; c < 4; c++) o.data[(y * o.w + x) * 4 + c] = im.data[((y + y0) * im.w + (x + x0)) * 4 + c];
  return o;
}

// paint a tapered bark trunk from yTop..yBot centred on cx (roots flare at base)
function drawTrunk(im, yTop, yBot, cx, cfg) {
  const [base, lite, dark] = cfg.bark.map(hex);
  const H = yBot - yTop, topW = 13, baseW = 20;
  for (let y = yTop; y <= yBot; y++) {
    const f = (y - yTop) / H;                       // 0 top .. 1 base
    const flare = f > 0.8 ? (f - 0.8) / 0.2 : 0;    // root flare in the bottom fifth
    const wth = topW + (baseW - topW) * (0.35 * f + 0.65 * flare);
    const half = wth / 2;
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
      if (x < 0 || x >= im.w) continue;
      const t = (x - (cx - half)) / wth;            // 0 left .. 1 right
      const streak = (Math.abs(((x * 7 + 3) % 5) - 2) < 0.6) ? -14 : 0;   // faint vertical bark lines
      const col = t < 0.30 ? lite : t > 0.74 ? dark : base;
      const j = (y * im.w + x) * 4;
      im.data[j] = Math.max(0, col[0] + streak); im.data[j + 1] = Math.max(0, col[1] + streak); im.data[j + 2] = Math.max(0, col[2] + streak); im.data[j + 3] = 255;
    }
  }
}

function process(name) {
  const file = `tree_${name}.png`;
  const cfg = CFG[name];
  let img = trim(largestBlob(decode(fs.readFileSync(path.join(ENV, file)))));
  if (!cfg.conifer) {
    const { w, h } = img;
    const cnt = new Array(h).fill(0), mnx = new Array(h).fill(1e9), mxx = new Array(h).fill(-1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (A(img, x, y) > 40) { cnt[y]++; if (x < mnx[y]) mnx[y] = x; if (x > mxx[y]) mxx[y] = x; }
    const maxC = Math.max(...cnt);
    // canopy bottom = lowest broad row; anything narrower below is a stub we drop
    let canopyBot = 0; for (let y = 0; y < h; y++) if (cnt[y] >= 0.42 * maxC) canopyBot = y;
    // trunk sits under the canopy's lower centre of mass
    let sx = 0, n = 0; for (let y = Math.max(0, canopyBot - 8); y <= canopyBot; y++) if (cnt[y]) { sx += (mnx[y] + mxx[y]) / 2; n++; }
    const cx = n ? Math.round(sx / n) : (w >> 1);
    const T = cfg.trunk;
    const out = makeImage(w, canopyBot + 1 + T);
    for (let y = 0; y <= canopyBot; y++) copyRow(out, y, img, y);
    drawTrunk(out, canopyBot - 4, canopyBot + T, cx, cfg);
    img = trim(out);
  }
  fs.writeFileSync(path.join(ENV, file), encode(img.w, img.h, img.data));
  media.trees[name] = { file: `env/${file}`, w: img.w, h: img.h };
  console.log(name.padEnd(16), `-> ${img.w}x${img.h}`, cfg.conifer ? '(conifer, cleaned)' : '(fresh stem)');
}

for (const name of Object.keys(CFG)) process(name);
fs.writeFileSync(MEDIA, JSON.stringify(media, null, 1));
console.log('media.json updated');

// Imports the OGA "Flying Dragon Rework" sheets (CC-BY 3.0 —
// https://opengameart.org/content/flying-dragon-rework, reworked from
// https://opengameart.org/content/red-dragon) and builds our dragon family:
// re-packs the 3x4 directional flap sheets into square-cell grids in our
// [S,N,W,E] row order, dyes blue/green/aethereal variants per-pixel, computes
// content bounding boxes, and merges creature entries into media.json.
// Usage: node tools/add-dragons.mjs <dir-with-downloaded-pngs>
import fs from 'node:fs';
import path from 'node:path';
import { decode, encode, makeImage, blit } from './png.mjs';

const SRC = process.argv[2] || '.';
const OUT = path.resolve('client/assets/creatures');
const MEDIA = path.resolve('client/assets/media.json');
const media = JSON.parse(fs.readFileSync(MEDIA, 'utf8'));

// RGB<->HSL hue rotation that preserves luminance + alpha, for dyeing scales.
function rotateHue(data, deg, desat = 0, lift = 0) {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    let r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h /= 6;
    }
    h = (h + deg / 360 + 1) % 1;
    s = Math.max(0, s * (1 - desat));
    const l2 = Math.min(1, l + lift * (1 - l));
    const q = l2 < 0.5 ? l2 * (1 + s) : l2 + s - l2 * s, p = 2 * l2 - q;
    const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    out[i] = f(h + 1 / 3) * 255 | 0; out[i + 1] = f(h) * 255 | 0; out[i + 2] = f(h - 1 / 3) * 255 | 0; out[i + 3] = a;
  }
  return out;
}

// Re-pack an LPC-ordered (N,W,S,E rows) cols x 4 sheet into square cells in
// our renderer's [S,N,W,E] row order, bottom-aligned in each cell.
function repack(img, cw, chh, cols, cell) {
  const dst = makeImage(cols * cell, 4 * cell);
  const ROW_FROM_LPC = [2, 0, 1, 3];                 // our row r takes LPC row ROW_FROM_LPC[r]
  for (let r = 0; r < 4; r++) for (let c = 0; c < cols; c++) {
    const cellImg = makeImage(cw, chh);
    blit(cellImg, 0, 0, img, c * cw, ROW_FROM_LPC[r] * chh, cw, chh);
    blit(dst, c * cell + ((cell - cw) >> 1), r * cell + (cell - chh), cellImg);
  }
  return dst;
}
// Content bbox across the whole sheet -> art fractions for the renderer.
function artOf(img, cell) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  // measure within cells (all cells share alignment, scan the first column)
  for (let cyy = 0; cyy < 4; cyy++)
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
      if (img.data[((cyy * cell + y) * img.w + x) * 4 + 3] > 16) {
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
    }
  return { h: +(((y1 - y0 + 1) / cell).toFixed(3)), b: +(((cell - 1 - y1) / cell).toFixed(3)), w: +(((x1 - x0 + 1) / cell).toFixed(3)) };
}

// [outPrefix, srcFile, cw, ch, cols, cell, baseHue, dyes {name: [deg, desat, lift]}]
const JOBS = [
  ['dragon', 'flying_dragon-red-RGB.png', 191, 161, 3, 192, 'red', {
    red: null, blue: [215, 0, 0], green: [125, 0.05, 0], aethereal: [185, 0.72, 0.30],
  }],
  ['twin_dragon', 'flying_twin_headed_dragon-blue.png', 144, 128, 3, 160, 'blue', {
    blue: null, red: [145, 0, 0], green: [-95, 0.05, 0], aethereal: [-30, 0.72, 0.30],
  }],
];
for (const [prefix, file, cw, chh, cols, cell, , dyes] of JOBS) {
  const img = decode(fs.readFileSync(path.join(SRC, file)));
  const packed = repack(img, cw, chh, cols, cell);
  const art = artOf(packed, cell);
  for (const [color, dye] of Object.entries(dyes)) {
    const data = dye ? rotateHue(packed.data, dye[0], dye[1], dye[2]) : packed.data;
    const name = `${prefix}_${color}.png`;
    fs.writeFileSync(path.join(OUT, name), encode(packed.w, packed.h, data));
    media.creatures[`${prefix}_${color}`] = {
      frame: cell, kind: 'grid',
      anims: {
        idle: { file: `creatures/${name}`, w: packed.w, h: packed.h, frames: cols, rows: 4 },
        walk: { file: `creatures/${name}`, w: packed.w, h: packed.h, frames: cols, rows: 4 },
      },
      art,
    };
    console.log(`${prefix}_${color}: ${packed.w}x${packed.h} cell ${cell} art`, art);
  }
}
fs.writeFileSync(MEDIA, JSON.stringify(media, null, 1));
console.log('media.json merged');

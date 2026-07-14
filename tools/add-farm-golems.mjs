// Imports the OGA LPC farm animals (https://opengameart.org/node/11629,
// CC-BY 3.0 / GPL) and the LPC golem (https://opengameart.org/content/lpc-golem)
// into media.json. Farm animals: walk sheet + eat sheet (grazing = idle), 4x4
// directional grids re-ordered to our [S,N,W,E] rows. The golem is built in
// two finishes: frosted ICE (white gradient + blue cast; frost aura applied at
// render time) and plain STONE (desaturated grey).
// Usage: node tools/add-farm-golems.mjs <dir-with-downloaded-pngs>
import fs from 'node:fs';
import path from 'node:path';
import { decode, encode, makeImage, blit } from './png.mjs';

const SRC = process.argv[2] || '.';
const OUT = path.resolve('client/assets/creatures');
const MEDIA = path.resolve('client/assets/media.json');
const media = JSON.parse(fs.readFileSync(MEDIA, 'utf8'));

const ROW_FROM_LPC = [2, 0, 1, 3];   // our [S,N,W,E] row <- LPC [N,W,S,E] row
function reorderRows(img, cw, chh, cols) {
  const dst = makeImage(cols * cw, 4 * chh);
  for (let r = 0; r < 4; r++) for (let c = 0; c < cols; c++) {
    const cell = makeImage(cw, chh);
    blit(cell, 0, 0, img, c * cw, ROW_FROM_LPC[r] * chh, cw, chh);
    blit(dst, c * cw, r * chh, cell);
  }
  return dst;
}
function artOf(img, cellW, cellH) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < cellH * 4; y++) for (let x = 0; x < cellW; x++) {
    if (img.data[(y * img.w + x) * 4 + 3] > 16) {
      const cy = y % cellH;
      x0 = Math.min(x0, x); y0 = Math.min(y0, cy); x1 = Math.max(x1, x); y1 = Math.max(y1, cy);
    }
  }
  return { h: +(((y1 - y0 + 1) / cellH).toFixed(3)), b: +(((cellH - 1 - y1) / cellH).toFixed(3)), w: +(((x1 - x0 + 1) / cellW).toFixed(3)) };
}

// ---- farm animals: walk + eat(-> idle), 4 cols x 4 dirs ---------------------
const FARM = [
  ['farm_chicken', 'chicken', 32], ['farm_cow', 'cow', 128], ['farm_pig', 'pig', 128],
  ['farm_sheep', 'sheep', 128], ['farm_llama', 'llama', 128],
];
for (const [key, src, cell] of FARM) {
  const suffix = src === 'llama' ? '_0' : '';
  const entry = { frame: cell, kind: 'grid', anims: {} };
  for (const [anim, file] of [['walk', `${src}_walk${suffix}.png`], ['idle', `${src}_eat${suffix}.png`]]) {
    const img = reorderRows(decode(fs.readFileSync(path.join(SRC, file))), cell, cell, 4);
    const name = `${key}_${anim}.png`;
    fs.writeFileSync(path.join(OUT, name), encode(img.w, img.h, img.data));
    entry.anims[anim] = { file: `creatures/${name}`, w: img.w, h: img.h, frames: 4, rows: 4 };
    if (anim === 'walk') entry.art = artOf(img, cell, cell);
  }
  media.creatures[key] = entry;
  console.log(key, 'art', entry.art);
}

// ---- the LPC golem: repack to 96px cells, dye ice + stone -------------------
function tone(data, { desat = 0, lift = 0, blue = 0, whiteTop = 0 }, cellH) {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2];
    const l = (r * 0.3 + g * 0.59 + b * 0.11);
    r = r + (l - r) * desat; g = g + (l - g) * desat; b = b + (l - b) * desat;
    r += (255 - r) * lift; g += (255 - g) * lift; b += (255 - b) * lift;
    out[i] = Math.min(255, r) | 0; out[i + 1] = Math.min(255, g) | 0; out[i + 2] = Math.min(255, b + blue) | 0;
    out[i + 3] = data[i + 3];
  }
  return out;
}
// vertical white gradient within each cell row (rime heaviest on the crown)
function rime(img, cellH, strength) {
  for (let y = 0; y < img.h; y++) {
    const t = 1 - (y % cellH) / cellH;                 // 1 at cell top -> 0 at feet
    const k = strength * t * t;
    for (let x = 0; x < img.w; x++) {
      const i = (y * img.w + x) * 4;
      if (img.data[i + 3] < 16) continue;
      img.data[i] = Math.min(255, img.data[i] + (255 - img.data[i]) * k) | 0;
      img.data[i + 1] = Math.min(255, img.data[i + 1] + (255 - img.data[i + 1]) * k) | 0;
      img.data[i + 2] = Math.min(255, img.data[i + 2] + (255 - img.data[i + 2]) * k * 1.15) | 0;
    }
  }
}
const CELL = 96;
// [anim, file, cw, ch, cols, directional]
const GOLEM_ANIMS = [
  ['walk', 'golem-walk.png', 64, 64, 7, true],
  ['attack', 'golem-atk.png', 64, 96, 7, true],
  ['death', 'golem-die.png', 64, 64, 7, false],   // 7x2 sequential crumble
];
const golemSheets = {};
for (const [anim, file, cw, chh, cols, dir] of GOLEM_ANIMS) {
  const img = decode(fs.readFileSync(path.join(SRC, file)));
  const rows = dir ? 4 : img.h / chh;
  const src2 = dir ? reorderRows(img, cw, chh, cols) : img;
  const dst = makeImage(cols * CELL, rows * CELL);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const cell = makeImage(cw, chh);
    blit(cell, 0, 0, src2, c * cw, r * chh, cw, chh);
    blit(dst, c * CELL + ((CELL - cw) >> 1), r * CELL + (CELL - chh), cell);
  }
  golemSheets[anim] = { img: dst, cols, rows, dir };
}
for (const [variant, opts, aura] of [
  ['golem_ice', { desat: 0.45, lift: 0.22, blue: 26, rime: 0.5 }, 'frost'],
  ['golem_stone', { desat: 0.9, lift: 0.04, blue: 0, rime: 0 }, null],
]) {
  const entry = { frame: CELL, kind: 'grid', anims: {} };
  for (const [anim, s] of Object.entries(golemSheets)) {
    const copy = makeImage(s.img.w, s.img.h);
    copy.data.set(tone(s.img.data, opts, CELL));
    if (opts.rime) rime(copy, CELL, opts.rime);
    const name = `${variant}_${anim}.png`;
    fs.writeFileSync(path.join(OUT, name), encode(copy.w, copy.h, copy.data));
    entry.anims[anim] = s.dir
      ? { file: `creatures/${name}`, w: copy.w, h: copy.h, frames: s.cols, rows: 4 }
      : { file: `creatures/${name}`, w: copy.w, h: copy.h, frames: s.cols * s.rows, cols: s.cols };
    if (anim === 'walk') entry.art = artOf(copy, CELL, CELL);
  }
  entry.anims.idle = entry.anims.walk;   // stand = walk frame 0 via renderer
  media.creatures[variant] = entry;
  console.log(variant, 'art', entry.art);
}

fs.writeFileSync(MEDIA, JSON.stringify(media, null, 1));
console.log('media.json merged');

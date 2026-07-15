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

// ---- farm animals ------------------------------------------------------------
// From the pack's two sheets (walk cycle + eat cycle) we derive the full set:
// IDLE   = standing (walk frame 0) with an occasional graze dip, not the old
//          endless grazing loop;
// WALK   = the walk cycle with every step doubled (the raw cycle read as a run);
// ATTACK = a synthesized headbutt/peck — head-down eat frames lunged along the
//          facing direction;
// DEATH  = keel over: sink and fade.
function cellCopy(img, cell, frame, row) {
  const c = makeImage(cell, cell);
  blit(c, 0, 0, img, frame * cell, row * cell, cell, cell);
  return c;
}
function putFrame(dst, cellImg, cell, col, row, dx = 0, dy = 0, alpha = 1) {
  const c = makeImage(cell, cell);
  blit(c, 0, 0, cellImg);
  if (alpha < 1) for (let i = 3; i < c.data.length; i += 4) c.data[i] = c.data[i] * alpha | 0;
  blit(dst, col * cell + Math.max(0, dx), row * cell + Math.max(0, dy), c,
    Math.max(0, -dx), Math.max(0, -dy), cell - Math.abs(dx), cell - Math.abs(dy));
}
const ROW_FWD = [[0, 1], [0, -1], [-1, 0], [1, 0]];   // our [S,N,W,E] rows
const FARM = [
  ['farm_chicken', 'chicken', 32], ['farm_cow', 'cow', 128], ['farm_pig', 'pig', 128],
  ['farm_sheep', 'sheep', 128], ['farm_llama', 'llama', 128],
];
for (const [key, src, cell] of FARM) {
  const suffix = src === 'llama' ? '_0' : '';
  const walkImg = reorderRows(decode(fs.readFileSync(path.join(SRC, `${src}_walk${suffix}.png`))), cell, cell, 4);
  const eatImg = reorderRows(decode(fs.readFileSync(path.join(SRC, `${src}_eat${suffix}.png`))), cell, cell, 4);
  const lunge = Math.max(2, Math.round(cell * 0.06));
  const sheets = {
    idle: makeImage(12 * cell, 4 * cell), walk: makeImage(8 * cell, 4 * cell),
    attack: makeImage(4 * cell, 4 * cell), death: makeImage(4 * cell, 4 * cell),
  };
  for (let row = 0; row < 4; row++) {
    const [fx, fy] = ROW_FWD[row];
    const stand = cellCopy(walkImg, cell, 0, row);
    const w = (f) => cellCopy(walkImg, cell, f, row);
    const e = (f) => cellCopy(eatImg, cell, f, row);
    // idle: stand 8 beats, then one graze dip (eat 0-1-1-0)
    [stand, stand, stand, stand, stand, stand, stand, stand, e(0), e(1), e(1), e(0)]
      .forEach((c, i) => putFrame(sheets.idle, c, cell, i, row));
    // walk: each step doubled — the raw 4-frame cycle read as a sprint
    [w(0), w(0), w(1), w(1), w(2), w(2), w(3), w(3)]
      .forEach((c, i) => putFrame(sheets.walk, c, cell, i, row));
    // attack: rear back, then a head-down lunge along the facing
    putFrame(sheets.attack, stand, cell, 0, row, -fx * (lunge >> 1), -fy * (lunge >> 1));
    putFrame(sheets.attack, e(0), cell, 1, row, fx * lunge, fy * lunge);
    putFrame(sheets.attack, e(1), cell, 2, row, fx * lunge * 2, fy * lunge * 2);
    putFrame(sheets.attack, stand, cell, 3, row);
    // death: keel over — sink and fade
    putFrame(sheets.death, stand, cell, 0, row, 0, Math.round(cell * 0.02), 1);
    putFrame(sheets.death, e(1), cell, 1, row, 0, Math.round(cell * 0.06), 0.85);
    putFrame(sheets.death, e(1), cell, 2, row, 0, Math.round(cell * 0.11), 0.6);
    putFrame(sheets.death, e(1), cell, 3, row, 0, Math.round(cell * 0.16), 0.35);
  }
  const entry = { frame: cell, kind: 'grid', anims: {}, art: artOf(walkImg, cell, cell) };
  for (const [anim, sheet] of Object.entries(sheets)) {
    const name = `${key}_${anim}.png`;
    fs.writeFileSync(path.join(OUT, name), encode(sheet.w, sheet.h, sheet.data));
    entry.anims[anim] = { file: `creatures/${name}`, w: sheet.w, h: sheet.h, frames: sheet.w / cell, rows: 4 };
  }
  media.creatures[key] = entry;
  console.log(key, Object.keys(entry.anims).join(','), 'art', entry.art);
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

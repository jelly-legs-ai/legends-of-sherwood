// Skill-mastery capes (#209): one gold-trimmed cape per skill, tinted to that
// skill's assigned colour, with the skill's emblem crested on the cape back.
// Awarded when a player reaches level 99 in the skill (a Legend of Sherwood).
//
// Pipeline, per skill, from the plain white LPC cape:
//   1. TINT   — recolour by luminance × the skill colour (keeps the fabric folds).
//   2. TRIM   — gold-edge the cape (opaque pixels touching transparent → gold),
//               the classic "trimmed cape" border.
//   3. CREST  — stamp the skill's emblem (from the skills icon sheet) at the
//               centre-back of the drape, tracked to each south frame's centroid
//               so it rides the cape as it sways.
//   4. BAKE   — behind + front sheets exactly like tools/fix-capes.mjs: south is
//               the wide drape, west/east are shoulder-anchored sheared side
//               profiles, north is synthesised onto the front so the crest shows
//               when facing away, plus a collar band over the chest.
//   Usage: node tools/build-skillcapes.mjs
import fs from 'node:fs';
import path from 'node:path';
import { decode, encode, makeImage, blit, blend, crop, downscale } from './png.mjs';

const LPC = path.resolve('client/assets/lpc');
const MANIFEST = path.join(LPC, 'manifest.json');
// Skill emblems = the SAME icons the skills tab shows (each skill's representative
// item icon), rendered to a 5x5 grid of 40px cells by tools/gen-skillcape-emblems
// (see the crest cells below, in the SKILLCAPES order).
const EMBLEMS = decode(fs.readFileSync(path.resolve('client/assets/icons/skillcape_emblems.png')));
const EM_CELL = 40, EM_COLS = 5;
const FS = 64;
const BASES = [0, 4, 8, 12, 16];    // LPC anim blocks; within each +0 N, +1 W, +2 S, +3 E
const HURT = 20;
const ANCHOR_Y = 20, BOT_Y = 60, SWEEP = 20;   // side-profile shear (matches fix-capes)
const TRIM = [232, 194, 64];        // gold trim colour

// skill -> cape colour. The emblem is the skill's own tab icon: cell N of
// skillcape_emblems.png, in THIS declaration order (0-indexed, row-major 5x5).
const SKILLCAPES = {
  attack: '#a51e26', strength: '#c0592a', defence: '#4d6b96', constitution: '#d04545',
  ranged: '#2b6b30', magic: '#3560d8', prayer: '#e6d38a', summoning: '#2aa090',
  mining: '#8a8f96', fishing: '#3aa6c8', woodcutting: '#43a043', farming: '#8fae3a',
  hunter: '#9a6a3a', archaeology: '#b08a4a', smithing: '#6f6f78', cooking: '#c24a2a',
  crafting: '#a05fb0', firemaking: '#e08030', fletching: '#a89a6a', runecrafting: '#6a3aa0',
  herblore: '#3a9a4a', construction: '#8a5a2a', agility: '#5ab0d0', thieving: '#40404e',
  dungeoneering: '#b8863a',
};

const src = decode(fs.readFileSync(path.join(LPC, 'cape_normal_white.png')));
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// Recolour the white cape by luminance × colour (fabric folds survive), then
// gold-edge every opaque pixel that borders transparency.
function tintTrim([r, g, b]) {
  const out = makeImage(src.w, src.h); out.data.set(src.data);
  const d = out.data, W = src.w, H = src.h;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    const l = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255 * 1.15;
    d[i] = Math.min(255, r * l); d[i + 1] = Math.min(255, g * l); d[i + 2] = Math.min(255, b * l);
  }
  const a = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : d[(y * W + x) * 4 + 3];
  const edge = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (d[i + 3] < 40) continue;
    if (a(x - 1, y) < 40 || a(x + 1, y) < 40 || a(x, y - 1) < 40 || a(x, y + 1) < 40) edge.push(i);
  }
  for (const i of edge) { d[i] = TRIM[0]; d[i + 1] = TRIM[1]; d[i + 2] = TRIM[2]; d[i + 3] = 255; }
  return out;
}

// Stamp the skill emblem at the centre-back of each SOUTH drape frame, tracked to
// that frame's opaque centroid so the crest rides the cape as it sways.
function crest(img, idx) {
  const em = downscale(crop(EMBLEMS, (idx % EM_COLS) * EM_CELL, Math.floor(idx / EM_COLS) * EM_CELL, EM_CELL, EM_CELL), 2);   // 20px emblem
  for (const base of BASES) {
    const sy = (base + 2) * FS;
    for (let c = 0; c < img.w / FS; c++) {
      const ox = c * FS;
      let n = 0, sx = 0, sYacc = 0, minY = FS, maxY = 0;
      for (let y = 0; y < FS; y++) for (let x = 0; x < FS; x++) {
        if (img.data[((sy + y) * img.w + ox + x) * 4 + 3] > 60) { n++; sx += x; sYacc += y; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      }
      if (n < 40) continue;
      const cx = sx / n, cyTop = minY + (maxY - minY) * 0.42;          // upper-centre of the drape
      blend(img, ox + Math.round(cx - em.w / 2), sy + Math.round(cyTop - em.h / 2), em);
    }
  }
}

function shearedSide(img, colX, southY, dir, frame) {
  const sf = crop(img, colX, southY, FS, FS);
  const out = makeImage(FS, FS);
  const flutter = 1 + 0.14 * Math.sin(frame * 0.9);
  for (let y = 0; y < FS; y++) {
    const fr = Math.max(0, Math.min(1, (y - ANCHOR_Y) / (BOT_Y - ANCHOR_Y)));
    const dx = Math.round(dir * SWEEP * flutter * fr * fr);
    blit(out, dx, y, sf, 0, y, FS, 1);
  }
  return out;
}

function bake(coloured, behindFile, frontFile) {
  const COLLAR_Y = 16, COLLAR_H = 15;
  const behind = makeImage(coloured.w, coloured.h), front = makeImage(coloured.w, coloured.h);
  for (const base of BASES) {
    const sy = (base + 2) * FS;
    blit(behind, 0, sy, crop(coloured, 0, sy, coloured.w, FS));                // south: wide drape
    for (let c = 0; c < coloured.w / FS; c++) {
      blit(behind, c * FS, (base + 1) * FS, shearedSide(coloured, c * FS, sy, +1, c));   // west
      blit(behind, c * FS, (base + 3) * FS, shearedSide(coloured, c * FS, sy, -1, c));   // east
    }
    blit(front, 0, base * FS, crop(coloured, 0, sy, coloured.w, FS));          // north synth (carries the crest)
    blit(front, 0, sy + COLLAR_Y, crop(coloured, 0, sy + COLLAR_Y, coloured.w, COLLAR_H));  // collar
  }
  blit(behind, 0, HURT * FS, crop(coloured, 0, HURT * FS, coloured.w, FS));
  fs.writeFileSync(path.join(LPC, behindFile), encode(behind.w, behind.h, behind.data));
  fs.writeFileSync(path.join(LPC, frontFile), encode(front.w, front.h, front.data));
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const reg = (cat, key, color, file) => {
  const k = cat + '/' + key;
  manifest.gear[k] = manifest.gear[k] || { male: {}, female: {} };
  manifest.gear[k].male[color] = file; manifest.gear[k].female[color] = file;
};

let n = 0;
for (const [skill, color] of Object.entries(SKILLCAPES)) {
  const coloured = tintTrim(hex(color));
  crest(coloured, n);                       // emblem cell n, matching the sheet's order
  const key = `cape_skill_${skill}`, col = 'gold';
  bake(coloured, `${key}_behind.png`, `${key}_front.png`);
  reg('behind', key, col, `${key}_behind.png`);
  reg('capefront', key, col, `${key}_front.png`);
  n++;
}
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
console.log(`baked ${n} skill-mastery capes (tint + gold trim + crest) × behind/front`);

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
const ICONS = decode(fs.readFileSync(path.resolve('client/assets/icons/freebies_skills.png')));
const FS = 64;
const BASES = [0, 4, 8, 12, 16];    // LPC anim blocks; within each +0 N, +1 W, +2 S, +3 E
const HURT = 20;
const ANCHOR_Y = 20, BOT_Y = 60, SWEEP = 20;   // side-profile shear (matches fix-capes)
const TRIM = [232, 194, 64];        // gold trim colour

// skill -> [cape colour, emblem cell [col,row] in the skills icon sheet (32px)]
const SKILLCAPES = {
  attack: ['#a51e26', [6, 3]], strength: ['#c0592a', [3, 5]], defence: ['#4d6b96', [5, 3]],
  constitution: ['#d04545', [0, 3]], ranged: ['#2b6b30', [7, 3]], magic: ['#3560d8', [3, 2]],
  prayer: ['#e6d38a', [1, 6]], summoning: ['#2aa090', [6, 0]],
  mining: ['#8a8f96', [3, 1]], fishing: ['#3aa6c8', [0, 2]], woodcutting: ['#43a043', [6, 1]],
  farming: ['#8fae3a', [5, 1]], hunter: ['#9a6a3a', [4, 1]], archaeology: ['#b08a4a', [7, 1]],
  smithing: ['#6f6f78', [4, 0]], cooking: ['#c24a2a', [0, 1]], crafting: ['#a05fb0', [7, 2]],
  firemaking: ['#e08030', [5, 0]], fletching: ['#a89a6a', [1, 7]], runecrafting: ['#6a3aa0', [2, 2]],
  herblore: ['#3a9a4a', [3, 6]], construction: ['#8a5a2a', [3, 3]],
  agility: ['#5ab0d0', [2, 6]], thieving: ['#40404e', [0, 6]], dungeoneering: ['#b8863a', [0, 0]],
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
function crest(img, cell) {
  const em = downscale(crop(ICONS, cell[0] * 32, cell[1] * 32, 32, 32), 2);   // 16px emblem
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
for (const [skill, [color, cell]] of Object.entries(SKILLCAPES)) {
  const coloured = tintTrim(hex(color));
  crest(coloured, cell);
  const key = `cape_skill_${skill}`, col = 'gold';
  bake(coloured, `${key}_behind.png`, `${key}_front.png`);
  reg('behind', key, col, `${key}_behind.png`);
  reg('capefront', key, col, `${key}_front.png`);
  n++;
}
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
console.log(`baked ${n} skill-mastery capes (tint + gold trim + crest) × behind/front`);

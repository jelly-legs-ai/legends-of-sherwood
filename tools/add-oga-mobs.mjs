// OGA mob import pass: mumu wolves (6 colours + white-dyed arctic), reorganised
// rabbit, turkey, LPC birds, LPC imps (5 kits x 4 tints) and the LPC monsters
// pack (bat/bee/ghost/slime/snake/eyeball/pumpking/man-eater/worms). Slices each
// source sheet into per-anim files in our media.json creature formats:
//   grid  — per-anim file, rows are facings in [S,N,W,E] order (DIR_ROW)
//   strips— side-view strips facing LEFT (renderer mirrors when heading east)
// Usage: node tools/add-oga-mobs.mjs <scratchpad/oga dir>
import fs from 'node:fs';
import path from 'node:path';
import { decode, encode, makeImage, blit } from './png.mjs';

const O = process.argv[2];
if (!O) { console.error('usage: node tools/add-oga-mobs.mjs <oga dir>'); process.exit(1); }
const OUT = path.resolve('client/assets/creatures');
fs.mkdirSync(OUT, { recursive: true });
const MEDIA = path.resolve('client/assets/media.json');
const media = JSON.parse(fs.readFileSync(MEDIA, 'utf8'));

const save = (name, im) => { fs.writeFileSync(path.join(OUT, name), encode(im.w, im.h, im.data)); return `creatures/${name}`; };
const cell = (im, x, y, w, h) => { const o = makeImage(w, h); blit(o, 0, 0, im, x, y, w, h); return o; };
const flipX = (im) => { const o = makeImage(im.w, im.h);
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) for (let c = 0; c < 4; c++)
    o.data[(y * im.w + (im.w - 1 - x)) * 4 + c] = im.data[(y * im.w + x) * 4 + c];
  return o; };
const rot90 = (im) => { const o = makeImage(im.h, im.w);
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) for (let c = 0; c < 4; c++)
    o.data[(x * o.w + (o.w - 1 - y)) * 4 + c] = im.data[(y * im.w + x) * 4 + c];
  return o; };
// naive HSL-ish tint: shift hue by rotating RGB towards a target colour while
// keeping per-pixel luminance — enough to recolour imp skins / wolf pelts
function dye(im, [tr, tg, tb], strength = 0.75) {
  const o = makeImage(im.w, im.h);
  for (let p = 0; p < im.data.length; p += 4) {
    const a = im.data[p + 3];
    if (!a) { continue; }
    const r = im.data[p], g = im.data[p + 1], b = im.data[p + 2];
    const lum = (r * 0.3 + g * 0.59 + b * 0.11) / 255;
    o.data[p] = Math.round(r * (1 - strength) + tr * lum * strength);
    o.data[p + 1] = Math.round(g * (1 - strength) + tg * lum * strength);
    o.data[p + 2] = Math.round(b * (1 - strength) + tb * lum * strength);
    o.data[p + 3] = a;
  }
  return o;
}
// lighten-dye for the arctic pelt: gamma-lift the luminance then colour toward
// the target so a dark pelt reads as snow-white while shading survives
function dyeLight(im, [tr, tg, tb]) {
  const o = makeImage(im.w, im.h);
  for (let p = 0; p < im.data.length; p += 4) {
    const a = im.data[p + 3];
    if (!a) continue;
    const lum = Math.pow((im.data[p] * 0.3 + im.data[p + 1] * 0.59 + im.data[p + 2] * 0.11) / 255, 0.45);
    o.data[p] = Math.round(tr * lum); o.data[p + 1] = Math.round(tg * lum); o.data[p + 2] = Math.round(tb * lum);
    o.data[p + 3] = a;
  }
  return o;
}
// several packs ship an opaque near-white background (tRNS our decoder skips):
// key out pure-white pixels so sprites sit on transparency
function keyWhite(im, thr = 250) {
  const o = makeImage(im.w, im.h);
  o.data.set(im.data);
  for (let p = 0; p < o.data.length; p += 4)
    if (o.data[p] >= thr && o.data[p + 1] >= thr && o.data[p + 2] >= thr) o.data[p + 3] = 0;
  return o;
}

// assemble a horizontal strip from a list of frames
function strip(frames) {
  const w = frames[0].w, h = frames[0].h;
  const o = makeImage(w * frames.length, h);
  frames.forEach((f, i) => blit(o, i * w, 0, f));
  return o;
}
// assemble a [S,N,W,E] 4-row grid from rows of frames (each row same length)
function dirGrid(rows) {
  const n = rows[0].length, fw = rows[0][0].w, fh = rows[0][0].h;
  const o = makeImage(n * fw, 4 * fh);
  rows.forEach((row, r) => row.forEach((f, i) => blit(o, i * fw, r * fh, f)));
  return o;
}

// ---------------------------------------------------------------------------
// 1. Wolves — side-view strips (face LEFT; source faces right, so flip).
//    Side block lives at x=320, rows of 64x32: 0 liedown, 2 howl, 3 walk,
//    4 run, 5 bite, 6 collapse(death).
const WOLF_COLORS = { timber: 1, shadow: 2, grey: 3, dusk: 4, gold: 5, blood: 6 };
function wolfRows(sheet, row, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(flipX(cell(sheet, 320 + i * 64, row * 32, 64, 32)));
  return out;
}
function importWolf(key, sheet) {
  const anims = {};
  const rows = { special: [2, 4], walk: [3, 5], sprint: [4, 5], attack: [5, 5], death: [6, 4], lie: [0, 4] };
  const idle = strip([wolfRows(sheet, 3, 1)[0], wolfRows(sheet, 2, 1)[0]]);       // stand + head-raise sniff
  anims.idle = { file: save(`${key}_idle.png`, idle), w: idle.w, h: 32, frames: 2 };
  for (const [an, [row, n]] of Object.entries(rows)) {
    if (an === 'lie') continue;
    const s = strip(wolfRows(sheet, row, n));
    anims[an] = { file: save(`${key}_${an}.png`, s), w: s.w, h: 32, frames: n };
  }
  media.creatures[key] = { frame: 64, kind: 'strips', anims, art: { h: 0.719, b: 0, w: 0.938 } };
  console.log('wolf', key);
}
for (const [color, i] of Object.entries(WOLF_COLORS)) {
  const sheet = decode(fs.readFileSync(path.join(O, `lpc-wolf-animation/wolfsheet${i}.png`)));
  importWolf(`wolf_${color}`, sheet);
}
{ // arctic: lighten-dye the grey sheet to a snow pelt
  const sheet = dyeLight(decode(fs.readFileSync(path.join(O, 'lpc-wolf-animation/wolfsheet3.png'))), [238, 243, 250]);
  importWolf('wolf_arctic', sheet);
}

// ---------------------------------------------------------------------------
// 2. Rabbit — 72px grid, rows 0-3 hop [N,W,S,E], rows 4-7 idle-ish poses.
{
  const im = keyWhite(decode(fs.readFileSync(path.join(O, 'reorganised-lpc-rabbit/rabbit_2.png'))), 252);
  const F = 72, fr = (r, i) => cell(im, i * F, r * F, F, F);
  const rowOf = (r, n) => Array.from({ length: n }, (_, i) => fr(r, i));
  const walk = dirGrid([rowOf(2, 4), rowOf(0, 4), rowOf(1, 4), rowOf(3, 4)]);   // [S,N,W,E]
  const idle = dirGrid([rowOf(4, 4), rowOf(6, 4), rowOf(5, 4), rowOf(7, 4)]);
  media.creatures.rabbit = { frame: F, kind: 'grid', anims: {
    idle: { file: save('rabbit_idle.png', idle), w: idle.w, h: idle.h, frames: 4, rows: 4 },
    walk: { file: save('rabbit_walk.png', walk), w: walk.w, h: walk.h, frames: 4, rows: 4 },
  }, art: { h: 0.5, b: 0.1, w: 0.42 } };
  console.log('rabbit');
}

// ---------------------------------------------------------------------------
// 3. Turkey — 128px grid, rows 0-3 walk [N,W,S,E], rows 4-7 idle/peck.
{
  const im = keyWhite(decode(fs.readFileSync(path.join(O, 'lpc-turkey/turkey.png'))), 252);
  const F = 128, fr = (r, i) => cell(im, i * F, r * F, F, F);
  const rowOf = (r, n) => Array.from({ length: n }, (_, i) => fr(r, i));
  const walk = dirGrid([rowOf(2, 4), rowOf(0, 4), rowOf(1, 4), rowOf(3, 4)]);
  const idle = dirGrid([rowOf(6, 4), rowOf(4, 4), rowOf(5, 4), rowOf(7, 4)]);
  media.creatures.farm_turkey = { frame: F, kind: 'grid', anims: {
    idle: { file: save('farm_turkey_idle.png', idle), w: idle.w, h: idle.h, frames: 4, rows: 4 },
    walk: { file: save('farm_turkey_walk.png', walk), w: walk.w, h: walk.h, frames: 4, rows: 4 },
  }, art: { h: 0.44, b: 0.2, w: 0.4 } };
  console.log('turkey');
}

// ---------------------------------------------------------------------------
// 4. Birds — 32px grid; rows 0-3 fly [side,S,N,side], rows 4-7 ground.
const BIRDS = {
  robin: 'bird_3_robin.png', sparrow: 'bird_3_sparrow.png', bluejay: 'bird_1_bluejay.png',
  cardinal: 'bird_2_cardinal.png', crow: 'bird_2_black.png', dove: 'bird_2_white.png',
  eagle: 'bird_2_eagle.png', wren: 'bird_1_brown.png',
};
for (const [name, file] of Object.entries(BIRDS)) {
  const p = path.join(O, 'lpc-birds', file);
  if (!fs.existsSync(p)) { console.log('bird missing', file); continue; }
  const im = keyWhite(decode(fs.readFileSync(p)), 253);
  const F = 32, fr = (r, i) => cell(im, i * F, r * F, F, F);
  const rowOf = (r, n) => Array.from({ length: n }, (_, i) => fr(r, i));
  const rowFlip = (r, n) => rowOf(r, n).map(flipX);
  // ground rows: 4=side(W), 5=front(S), 6=back(N), 7=side peck; fly rows: 0=side(W),1=S,2=N,3=side
  const walk = dirGrid([rowOf(5, 3), rowOf(6, 3), rowOf(4, 3), rowFlip(4, 3)]);
  const fly = dirGrid([rowOf(1, 3), rowOf(2, 3), rowOf(0, 3), rowFlip(0, 3)]);
  const idle = dirGrid([rowOf(5, 3), rowOf(6, 3), rowOf(7, 3), rowFlip(7, 3)]);
  media.creatures[`bird_${name}`] = { frame: F, kind: 'grid', anims: {
    idle: { file: save(`bird_${name}_idle.png`, idle), w: idle.w, h: idle.h, frames: 3, rows: 4 },
    walk: { file: save(`bird_${name}_walk.png`, walk), w: walk.w, h: walk.h, frames: 3, rows: 4 },
    sprint: { file: save(`bird_${name}_fly.png`, fly), w: fly.w, h: fly.h, frames: 3, rows: 4 },
  }, art: { h: 0.55, b: 0.06, w: 0.55 } };
  console.log('bird', name);
}

// ---------------------------------------------------------------------------
// 5. Imps — 64px LPC grids (walk 4x4, attack 4x4), rows [N,W,S,E] -> [S,N,W,E].
//    5 weapon kits; the vanilla kit also ships in 4 dyed skins.
const IMP_KITS = { imp: 'vanilla', imp_sword: 'sword', imp_guard: 'sword shield', imp_pike: 'pitchfork', imp_warlord: 'pitchfork shield' };
const IMP_TINTS = { crimson: null, ember: [240, 140, 40], venom: [90, 200, 80], gloom: [120, 90, 200] };
function importImp(key, walk, attack) {
  const F = 64, fr = (im, r, i) => cell(im, i * F, r * F, F, F);
  const rowOf = (im, r, n) => Array.from({ length: n }, (_, i) => fr(im, r, i));
  const g = (im) => dirGrid([rowOf(im, 2, 4), rowOf(im, 0, 4), rowOf(im, 1, 4), rowOf(im, 3, 4)]);
  const W = g(walk), A = g(attack);
  // death: south walk frame toppled sideways, sinking (2 frames)
  const s0 = fr(walk, 2, 0), lay = rot90(s0);
  const death = strip([lay, lay]);
  const anims = {
    idle: { file: save(`${key}_idle.png`, W), w: W.w, h: W.h, frames: 1, rows: 4 },
    walk: { file: save(`${key}_walk.png`, W), w: W.w, h: W.h, frames: 4, rows: 4 },
    attack: { file: save(`${key}_attack.png`, A), w: A.w, h: A.h, frames: 4, rows: 4 },
    death: { file: save(`${key}_death.png`, death), w: death.w, h: death.h, frames: 2 },
  };
  media.creatures[key] = { frame: F, kind: 'grid', anims, art: { h: 0.62, b: 0.11, w: 0.5 } };
  console.log('imp', key);
}
{
  const dir = path.join(O, 'lpc-imp/unz_LPC_imp_0/LPC imp');
  for (const [key, kit] of Object.entries(IMP_KITS)) {
    const walk = keyWhite(decode(fs.readFileSync(path.join(dir, `walk - ${kit}.png`))));
    const attack = keyWhite(decode(fs.readFileSync(path.join(dir, `attack - ${kit}.png`))));
    importImp(key, walk, attack);
  }
  // dyed vanilla skins for variety packs
  const walk = keyWhite(decode(fs.readFileSync(path.join(dir, 'walk - vanilla.png'))));
  const attack = keyWhite(decode(fs.readFileSync(path.join(dir, 'attack - vanilla.png'))));
  for (const [tint, rgb] of Object.entries(IMP_TINTS)) {
    if (!rgb) continue;
    importImp(`imp_${tint}`, dye(walk, rgb, 0.6), dye(attack, rgb, 0.6));
  }
}

// ---------------------------------------------------------------------------
// 6. LPC monsters — 4-row [N,W,S,E] walk grids (cell = h/4), all columns = walk.
const MONSTERS = { bat: 'bat', bee: 'bee', ghost: 'ghost', slime: 'slime', snake: 'snake',
  eyeball: 'eyeball', pumpking: 'pumpking', maneater: 'man_eater_flower', big_worm: 'big_worm', small_worm: 'small_worm' };
for (const [key, file] of Object.entries(MONSTERS)) {
  const p = path.join(O, `lpc-monsters/unz_lpc-monsters/lpc-monsters/${file}_rgba.png`);
  if (!fs.existsSync(p)) { console.log('monster missing', file); continue; }
  const im = keyWhite(decode(fs.readFileSync(p)));
  const F = im.h / 4, cols = Math.floor(im.w / F);
  const fr = (r, i) => cell(im, i * F, r * F, F, F);
  const rowOf = (r) => Array.from({ length: cols }, (_, i) => fr(r, i));
  const walk = dirGrid([rowOf(2), rowOf(0), rowOf(1), rowOf(3)]);
  const name = `mob_${key}`;
  media.creatures[name] = { frame: F, kind: 'grid', anims: {
    idle: { file: save(`${name}_walk.png`, walk), w: walk.w, h: walk.h, frames: cols, rows: 4 },
    walk: { file: `creatures/${name}_walk.png`, w: walk.w, h: walk.h, frames: cols, rows: 4 },
  }, art: { h: 0.55, b: 0.15, w: 0.55 } };
  console.log('monster', key, `${F}px x${cols}`);
}

// ---------------------------------------------------------------------------
// 7. Barbarian — LPC walk sheet (grid walk-only, rows [N,W,S,E]).
{
  const p = path.join(O, 'lpc-barbarian-sprite-base/lpc_barbarian_walk_0.png');
  if (fs.existsSync(p)) {
    const im = keyWhite(decode(fs.readFileSync(p)));
    const F = im.h / 4, cols = Math.floor(im.w / F);
    const fr = (r, i) => cell(im, i * F, r * F, F, F);
    const rowOf = (r) => Array.from({ length: cols }, (_, i) => fr(r, i));
    const walk = dirGrid([rowOf(2), rowOf(0), rowOf(1), rowOf(3)]);
    media.creatures.barbarian = { frame: F, kind: 'grid', anims: {
      idle: { file: save('barbarian_walk.png', walk), w: walk.w, h: walk.h, frames: 1, rows: 4 },
      walk: { file: 'creatures/barbarian_walk.png', w: walk.w, h: walk.h, frames: cols, rows: 4 },
    }, art: { h: 0.78, b: 0.05, w: 0.4 } };
    console.log('barbarian', `${F}px x${cols}`);
  } else console.log('barbarian sheet missing');
}

fs.writeFileSync(MEDIA, JSON.stringify(media, null, 1));
console.log('media.json updated');

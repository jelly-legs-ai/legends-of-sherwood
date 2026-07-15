// Stations import: LPC ore-and-forge (vein rocks dyed per metal, ore-chunk +
// ingot icons, the animated forge), the blacksmith workshop (kiln, anvil,
// quench trough, toolbench), LPC animated doors and the bazaar stall tables
// (dyed per stall trade). Registers billboards in media.trees, icon file-lists
// in media.sheets, and animation strips for the forge fire + doors.
// Usage: node tools/add-oga-stations.mjs <scratchpad/oga dir>
import fs from 'node:fs';
import path from 'node:path';
import { decode, encode, makeImage, blit } from './png.mjs';

const O = process.argv[2];
const ENV = path.resolve('client/assets/env');
const MEDIA = path.resolve('client/assets/media.json');
const media = JSON.parse(fs.readFileSync(MEDIA, 'utf8'));
media.sheets = media.sheets || {};

const A = (im, x, y) => im.data[(y * im.w + x) * 4 + 3];
function crop(im, x, y, w, h) { const o = makeImage(w, h); blit(o, 0, 0, im, x, y, w, h); return o; }
function trim(im) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (A(im, x, y) > 20) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (x1 < 0) return im;
  const o = makeImage(x1 - x0 + 1, y1 - y0 + 1);
  blit(o, 0, 0, im, x0, y0, o.w, o.h);
  return o;
}
function dye(im, [tr, tg, tb], strength = 0.45) {
  const o = makeImage(im.w, im.h);
  for (let p = 0; p < im.data.length; p += 4) {
    const a = im.data[p + 3];
    if (!a) continue;
    const r = im.data[p], g = im.data[p + 1], b = im.data[p + 2];
    const lum = (r * 0.3 + g * 0.59 + b * 0.11) / 255;
    o.data[p] = Math.round(r * (1 - strength) + tr * lum * strength);
    o.data[p + 1] = Math.round(g * (1 - strength) + tg * lum * strength);
    o.data[p + 2] = Math.round(b * (1 - strength) + tb * lum * strength);
    o.data[p + 3] = a;
  }
  return o;
}
const hex = (s) => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
const saveTree = (name, im) => {
  const t = trim(im);
  fs.writeFileSync(path.join(ENV, `st_${name}.png`), encode(t.w, t.h, t.data));
  media.trees[name] = { file: `env/st_${name}.png`, w: t.w, h: t.h };
  console.log(name.padEnd(20), t.w + 'x' + t.h);
};
const saveIcon = (name, im) => {
  const t = trim(im);
  fs.writeFileSync(path.join(ENV, `ic_${name}.png`), encode(t.w, t.h, t.data));
  return `env/ic_${name}.png`;
};

// --- ore vein rocks: one strong base rock, dyed to every metal ---------------
const ore = decode(fs.readFileSync(path.join(O, 'lpc-ore-and-forge/ore.png')));
const veinBase = crop(ore, 64, 160, 64, 64);
const VEIN_TINT = {
  copper_rock: '#b87333', tin_rock: '#a8a8b0', iron_rock: '#8d6a5a', coal_rock: '#2e2e34',
  silver_rock: '#dfe4ec', mithril_rock: '#4a62a8', gold_rock: '#e8c84e', sylvanite_rock: '#7fe07f', essence_rock: '#b09fe0',
};
for (const [node, tint] of Object.entries(VEIN_TINT)) saveTree(node, dye(veinBase, hex(tint), node === 'coal_rock' ? 0.7 : 0.5));

// --- ore-chunk + ingot icons (file lists, indexed in items.js) ----------------
// chunks at y288 (32px): coal, rust, grey, orange, silver, gold
const chunk = (x) => crop(ore, x, 288, 32, 32);
const ORE_ICONS = [   // order shared with items.js ORE_ICON_IDX
  ['copper_ore', chunk(96)], ['tin_ore', chunk(64)], ['iron_ore', chunk(32)],
  ['coal', chunk(0)], ['silver_ore', chunk(128)], ['mithril_ore', dye(chunk(128), hex('#4a62a8'), 0.6)],
  ['gold_ore', chunk(160)], ['sylvanite_ore', dye(chunk(160), hex('#7fe07f'), 0.6)],
  ['rune_essence', dye(chunk(128), hex('#b09fe0'), 0.6)],
];
media.sheets.oreIcons = ORE_ICONS.map(([n, im]) => saveIcon(`ore_${n}`, im));
// ingots at y352 (32px): x32 silver, x64 grey, x96 copper, x128 pale gold, x160 gold, x192 dark
const bar = (x) => crop(ore, x, 352, 32, 32);
const BAR_ICONS = [   // METALS order: copper bronze iron steel mithril damasked silversteel sylvan
  ['copper', bar(96)], ['bronze', dye(bar(96), hex('#c98f57'), 0.5)], ['iron', bar(192)],
  ['steel', bar(64)], ['mithril', dye(bar(32), hex('#4a62a8'), 0.6)], ['damasked', bar(128)],
  ['silversteel', bar(32)], ['sylvan', dye(bar(160), hex('#9fe06a'), 0.5)],
];
media.sheets.barIcons = BAR_ICONS.map(([n, im]) => saveIcon(`bar_${n}`, im));
console.log('ore + bar icon lists registered');

// --- the animated forge fire (4 frames, 96px) --------------------------------
{
  const frames = [0, 96, 192, 288].map(x => trim(crop(ore, x, 416, 96, 96)));
  const fw = Math.max(...frames.map(f => f.w)), fh = Math.max(...frames.map(f => f.h));
  const strip = makeImage(fw * 4, fh);
  frames.forEach((f, i) => blit(strip, i * fw + ((fw - f.w) >> 1), fh - f.h, f));
  fs.writeFileSync(path.join(ENV, 'st_forge.png'), encode(strip.w, strip.h, strip.data));
  media.sheets.forge = { file: 'env/st_forge.png', cell: fw, cellW: fw, cellH: fh, cols: 4, frames: 4 };
  console.log('forge anim', fw + 'x' + fh, 'x4');
}

// --- blacksmith workshop: kiln (3-frame fire), anvil, quench, toolbench ------
{
  const bs = decode(fs.readFileSync(path.join(O, 'lpc-blacksmith/unz_lpc-blacksmith/lpc-blacksmith/blacksmith-smelter.png')));
  const kilns = [256, 512, 768].map(x => trim(crop(bs, x, 0, 256, 256)));
  const kw = Math.max(...kilns.map(f => f.w)), kh = Math.max(...kilns.map(f => f.h));
  const strip = makeImage(kw * 3, kh);
  kilns.forEach((f, i) => blit(strip, i * kw + ((kw - f.w) >> 1), kh - f.h, f));
  fs.writeFileSync(path.join(ENV, 'st_kiln.png'), encode(strip.w, strip.h, strip.data));
  media.sheets.kiln = { file: 'env/st_kiln.png', cell: kw, cellW: kw, cellH: kh, cols: 3, frames: 3 };
  console.log('kiln anim', kw + 'x' + kh, 'x3');
  saveTree('smith_anvil', crop(bs, 512, 400, 96, 64));
  saveTree('quench_trough', crop(bs, 448, 416, 128, 64));
  saveTree('toolbench', crop(bs, 256, 480, 128, 72));
}

// --- animated doors: oak style, closed -> open (4 frames, 64x68) -------------
{
  const d = decode(fs.readFileSync(path.join(O, 'lpc-animated-doors/lpc-doors-animated-1.png')));
  const rows = [204, 136, 68, 0];   // closed, ajar, wide, fully open
  const strip = makeImage(64 * 4, 68);
  rows.forEach((y, i) => blit(strip, i * 64, 0, d, 0, y, 64, 68));
  fs.writeFileSync(path.join(ENV, 'st_door.png'), encode(strip.w, strip.h, strip.data));
  media.sheets.door = { file: 'env/st_door.png', cell: 64, cellW: 64, cellH: 68, cols: 4, frames: 4 };
  console.log('door anim 64x68 x4');
}

// --- bazaar tables dyed per stall trade ---------------------------------------
{
  const ew = decode(fs.readFileSync(path.join(O, 'lpc-bazaar-rework/unz_lpc_bazaar_rework-1.0-1/PNG/32x32/bazaar_table-ew-red.png')));
  const STALLS = {
    bakery_stall: '#d8b45e', cloth_stall: '#4a72c8', spice_stall: '#e07a2a',
    fur_stall: '#8a5f36', silver_stall: '#c8d0dc', gem_stall: '#9a5ce0',
  };
  for (const [node, tint] of Object.entries(STALLS)) saveTree(node, dye(ew, hex(tint), 0.5));
}

fs.writeFileSync(MEDIA, JSON.stringify(media, null, 1));
console.log('media.json updated');

// World-decor import: LPC signposts/graves/washing-line/scarecrow + LPC rocks
// (+ the hanging shop signs sheet staged for the building renderer). Each decor
// is sliced from its sheet, trimmed to content, written to client/assets/env/
// and registered in media.trees so the node renderer draws it as a billboard.
// Usage: node tools/add-oga-decor.mjs <scratchpad/oga dir>
import fs from 'node:fs';
import path from 'node:path';
import { decode, encode, makeImage, blit } from './png.mjs';

const O = process.argv[2];
const ENV = path.resolve('client/assets/env');
const MEDIA = path.resolve('client/assets/media.json');
const media = JSON.parse(fs.readFileSync(MEDIA, 'utf8'));

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
function add(name, im) {
  const t = trim(im);
  const file = `decor_${name}.png`;
  fs.writeFileSync(path.join(ENV, file), encode(t.w, t.h, t.data));
  media.trees[name] = { file: `env/${file}`, w: t.w, h: t.h };
  console.log(name.padEnd(18), t.w + 'x' + t.h);
}

// --- signposts / graves / washing line / scarecrow (128x128 sheet) ----------
{
  const im = decode(fs.readFileSync(path.join(O, 'lpc-signposts-graves-line-cloths-and-scare-crow/signpost-outsidestuff.png')));
  add('signpost_arrow', crop(im, 0, 0, 32, 32));
  add('signpost_board', crop(im, 32, 0, 32, 32));
  add('signpost_cross', crop(im, 64, 0, 32, 32));
  add('scarecrow', crop(im, 96, 0, 32, 64));
  add('grave_board', crop(im, 0, 32, 32, 32));
  add('grave_slab', crop(im, 32, 32, 32, 32));
  add('grave_cross', crop(im, 64, 32, 32, 32));
  add('wash_line', crop(im, 0, 64, 96, 40));
  add('wash_line_full', crop(im, 0, 96, 96, 32));
}
// --- rocks: 4 colour bands (grey/dark/black/sand), a few decors each --------
{
  const im = decode(fs.readFileSync(path.join(O, 'lpc-rocks/unz_rocks/rocks/rocks.png')));
  const bands = { grey: 0, dark: 256, black: 512, sand: 768 };
  for (const [col, y0] of Object.entries(bands)) {
    add(`rocks_${col}`, crop(im, 0, y0 + 64, 128, 96));        // boulder cluster
    add(`spire_${col}`, crop(im, 0, y0 + 160, 96, 96));        // stone spires
    add(`dolmen_${col}`, crop(im, 288, y0, 192, 128));         // dolmen arch landmark
    add(`crag_${col}`, crop(im, 640, y0, 192, 256));           // big crag formation
  }
}
// --- hanging shop signs: slice each 32px sign for door-lintel mounting ------
{
  const im = decode(fs.readFileSync(path.join(O, 'lpc-hanging-signs/lpc-hanging-signs.png')));
  const SIGNS = { arms: [0, 0], bank: [1, 0], jeweler: [2, 0], apothecary: [3, 0],
    tavern: [0, 1], inn: [1, 1], fletcher: [2, 1], smith: [3, 1], blank: [0, 2] };
  for (const [name, [cx, cy]] of Object.entries(SIGNS)) add(`sign_${name}`, crop(im, cx * 32, cy * 32, 32, 32));
}

fs.writeFileSync(MEDIA, JSON.stringify(media, null, 1));
console.log('media.json updated');

// LPC crops import: growth-stage sprites for the house-garden farming rework.
// Each crop gets 4 stage billboards (seedling -> mature) sliced from the
// crops-v2 sheet (32px cells, one column per crop, stages down the rows),
// registered as media.sheets.crops[id] = [stage files].
// Usage: node tools/add-oga-crops.mjs <scratchpad/oga dir>
import fs from 'node:fs';
import path from 'node:path';
import { decode, encode, makeImage, blit } from './png.mjs';

const O = process.argv[2];
const ENV = path.resolve('client/assets/env');
const MEDIA = path.resolve('client/assets/media.json');
const media = JSON.parse(fs.readFileSync(MEDIA, 'utf8'));
media.sheets = media.sheets || {};

const im = decode(fs.readFileSync(path.join(O, 'lpc-crops/unz_crops-v2.1/crops-v2/crops.png')));
const cell = (x, y) => { const o = makeImage(32, 32); blit(o, 0, 0, im, x, y, 32, 32); return o; };
function dye(img, [tr, tg, tb], s = 0.5) {
  const o = makeImage(img.w, img.h);
  for (let p = 0; p < img.data.length; p += 4) {
    const a = img.data[p + 3]; if (!a) continue;
    const lum = (img.data[p] * 0.3 + img.data[p + 1] * 0.59 + img.data[p + 2] * 0.11) / 255;
    o.data[p] = Math.round(img.data[p] * (1 - s) + tr * lum * s);
    o.data[p + 1] = Math.round(img.data[p + 1] * (1 - s) + tg * lum * s);
    o.data[p + 2] = Math.round(img.data[p + 2] * (1 - s) + tb * lum * s);
    o.data[p + 3] = a;
  }
  return o;
}
const hex = (s) => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));

// [crop id, column x, stage rows (top->mature), optional herb tint]
const PICKS = [
  ['potato', 864, [32, 96, 160, 224]],
  ['cabbage', 96, [352, 416, 480, 544]],
  ['barley', 960, [32, 96, 160, 224]],
  ['flax', 416, [352, 416, 480, 544]],
  ['yarrow_seed_crop', 32, [352, 416, 480, 544], '#e8e0a0'],
  ['wolfsbane_crop', 32, [352, 416, 480, 544], '#8a6ae0'],
  ['mandrake_crop', 32, [352, 416, 480, 544], '#b08a4a'],
  ['kingsfoil_crop', 32, [352, 416, 480, 544], '#7fe0b0'],
];
media.sheets.crops = {};
for (const [id, cx, rows, tint] of PICKS) {
  const files = rows.map((ry, s) => {
    let c = cell(cx, ry);
    if (tint) c = dye(c, hex(tint), 0.45);
    const name = `crop_${id}_${s}.png`;
    fs.writeFileSync(path.join(ENV, name), encode(c.w, c.h, c.data));
    return `env/${name}`;
  });
  media.sheets.crops[id] = files;
  console.log(id, files.length, 'stages');
}
fs.writeFileSync(MEDIA, JSON.stringify(media, null, 1));
console.log('media.json updated');

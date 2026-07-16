// Character creation expansion (#110): four new hair/beard colours dyed from
// the existing classic-format LPC sheets (white & ash from gray, red & copper
// from ginger) — the universal 64px layout is untouched so every gear sheet
// still maps. New files land in client/assets/lpc/ and manifest.json gains
// the colour entries under each style/sex (and beard).
// Usage: node tools/add-hair-colors.mjs
import fs from 'node:fs';
import path from 'node:path';
import { decode, encode, makeImage } from './png.mjs';

const LPC = path.resolve('client/assets/lpc');
const MANIFEST = path.join(LPC, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

// [new colour, source colour, tint rgb, gamma] — gamma <1 lifts (white),
// >1 deepens (red); the tint colourises the luminance like the pelt dyer
const COLORS = [
  ['white', 'gray', [246, 246, 242], 0.55],
  ['ash', 'blonde', [196, 188, 168], 0.9],
  ['red', 'ginger', [168, 44, 38], 1.15],
  ['copper', 'ginger', [214, 108, 40], 0.9],
];

function dyeHair(im, [tr, tg, tb], gamma) {
  const o = makeImage(im.w, im.h);
  for (let p = 0; p < im.data.length; p += 4) {
    const a = im.data[p + 3];
    if (!a) continue;
    const lum = Math.pow((im.data[p] * 0.3 + im.data[p + 1] * 0.59 + im.data[p + 2] * 0.11) / 255, gamma);
    o.data[p] = Math.min(255, Math.round(tr * lum));
    o.data[p + 1] = Math.min(255, Math.round(tg * lum));
    o.data[p + 2] = Math.min(255, Math.round(tb * lum));
    o.data[p + 3] = a;
  }
  return o;
}

let made = 0;
for (const [color, src, tint, gamma] of COLORS) {
  for (const [style, sexes] of Object.entries(manifest.hair)) {
    for (const [sex, colors] of Object.entries(sexes)) {
      const srcFile = colors[src];
      if (!srcFile) continue;
      const im = decode(fs.readFileSync(path.join(LPC, srcFile)));
      const out = `hair_${style}_${sex}_${color}.png`;
      fs.writeFileSync(path.join(LPC, out), encode(im.w, im.h, dyeHair(im, tint, gamma).data));
      colors[color] = out;
      manifest.files[`hair_${style}_${sex}_${color}`] = out;
      made++;
    }
  }
  const beardSrc = manifest.beard[src];
  if (beardSrc) {
    const im = decode(fs.readFileSync(path.join(LPC, beardSrc)));
    const out = `beard_${color}.png`;
    fs.writeFileSync(path.join(LPC, out), encode(im.w, im.h, dyeHair(im, tint, gamma).data));
    manifest.beard[color] = out;
    manifest.files[`beard_${color}`] = out;
    made++;
  }
  console.log(color, 'from', src, 'done');
}

fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
console.log(made, 'sheets dyed; manifest updated');

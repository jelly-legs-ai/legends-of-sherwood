// Megakit building materials → placeable tiles (#182). The Medieval Village
// MegaKit ships as 3D models, but its PBR base-colour textures are tileable
// material swatches. We sample one 64px tile from each (a centred crop, then an
// 8x downscale) and pack them into a single sheet the Map Studio can place as
// building-material tiles.
//   Usage: node tools/add-megakit-tiles.mjs
import fs from 'node:fs';
import path from 'node:path';
import { decode, encode, makeImage, blit, crop, downscale } from './png.mjs';

const KIT = path.resolve('model assets/Buildings/Medieval Village MegaKit[Standard]/glTF');
const OUT = path.resolve('client/assets/env/megakit_materials.png');
const MEDIA = path.resolve('client/assets/media.json');

// id, source texture, human label — order defines the cell index
const MATS = [
  ['brick', 'T_Brick_BaseColor.png', 'Brick'],
  ['red_brick', 'T_RedBrick_BaseColor.png', 'Red brick'],
  ['uneven_brick', 'T_UnevenBrick_BaseColor.png', 'Uneven brick'],
  ['plaster', 'T_Plaster_BaseColor.png', 'Plaster'],
  ['rock_trim', 'T_RockTrim_BaseColor.png', 'Rock trim'],
  ['wood_trim', 'T_WoodTrim_BaseColor.png', 'Wood trim'],
  ['roof_tiles', 'T_RoundTiles_BaseColor.png', 'Roof tiles'],
  ['metal', 'T_MetalOrnaments_BaseColor.png', 'Metal ornament'],
];

const sheet = makeImage(MATS.length * 64, 64);
const labels = [];
MATS.forEach(([id, file, label], i) => {
  const src = decode(fs.readFileSync(path.join(KIT, file)));
  // centre-crop a 512px window (dodges any UV seams at the texture edges), 8x down to 64
  const win = Math.min(512, src.w, src.h);
  const region = crop(src, (src.w - win) >> 1, (src.h - win) >> 1, win, win);
  const tile = downscale(region, win / 64);
  blit(sheet, i * 64, 0, tile);
  labels.push(label);
});
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, encode(sheet.w, sheet.h, sheet.data));

const media = JSON.parse(fs.readFileSync(MEDIA, 'utf8'));
media.sheets.megakit_materials = {
  file: 'env/megakit_materials.png', w: sheet.w, h: sheet.h,
  cellW: 64, cellH: 64, cols: MATS.length, rows: 1, labels,
};
fs.writeFileSync(MEDIA, JSON.stringify(media, null, 1));
console.log(`packed ${MATS.length} building-material tiles → ${OUT} (${sheet.w}x${sheet.h})`);
console.log('labels:', labels.join(', '));

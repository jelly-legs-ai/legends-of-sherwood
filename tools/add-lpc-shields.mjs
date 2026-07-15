// Imports the LPC kite shield (Universal LPC generator, CC-BY-SA/GPL) as a
// baked character layer: stitches its per-animation strips (walk/slash/thrust)
// into the universal 21-row sheet so the shield rides the off-hand, correctly
// positioned and animated, and merges it into the manifest. One neutral (gray)
// design tinted per metal tier at bake time.
// Usage: node tools/add-lpc-shields.mjs <path-to-lpc-repo>
import fs from 'node:fs';
import path from 'node:path';
import { decode, encode, makeImage, blit } from './png.mjs';

const SRC = path.join(process.argv[2] || '../lpc-repo', 'spritesheets/shield/kite');
const OUT = path.resolve('client/assets/lpc');
const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));

// classic universal row bands (top row of each anim block)
const ROWS = { thrust: 4, walk: 8, slash: 12 };
let made = 0;
manifest.gear['shield/kite'] = {};
for (const sex of ['male', 'female']) {
  const sheet = makeImage(832, 21 * 64);
  let any = false;
  for (const [anim, row] of Object.entries(ROWS)) {
    const p = path.join(SRC, sex, anim, 'kite_gray.png');
    if (!fs.existsSync(p)) continue;
    const img = decode(fs.readFileSync(p));
    blit(sheet, 0, row * 64, img, 0, 0, Math.min(img.w, 832), Math.min(img.h, (21 - row) * 64));
    any = true;
  }
  if (!any) { console.log('no kite art for', sex); continue; }
  const flat = `gear_shield_kite_${sex}.png`;
  fs.writeFileSync(path.join(OUT, flat), encode(sheet.w, sheet.h, sheet.data));
  manifest.files[`shield_kite_${sex}`] = flat;
  manifest.gear['shield/kite'][sex] = { steel: flat };
  made++;
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`stitched ${made} kite shield sheets`);

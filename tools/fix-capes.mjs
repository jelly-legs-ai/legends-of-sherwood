// Two-layer capes (#190). ULPC "behind_body" capes only carry the cape for the
// W/S/E facings (drape behind the body); the north/away facing is empty, so a
// cape vanishes when the character turns their back — and the collar/necktie,
// living on the behind layer, is hidden by the torso from the front.
//
// This bakes a FRONT companion sheet for every cape: the away-facing (north)
// frames are synthesized from the cape's own south-facing drape (a hanging cape
// reads the same from front or back), and a thin collar band from each W/S/E
// frame is lifted to the front so the necktie shows over the shoulders. The
// composite draws behind (drape) + this front sheet, so capes read in all four
// directions.  Usage: node tools/fix-capes.mjs
import fs from 'node:fs';
import path from 'node:path';
import { decode, encode, makeImage, blit, crop } from './png.mjs';

const LPC = path.resolve('client/assets/lpc');
const MANIFEST = path.join(LPC, 'manifest.json');
const COLORS = ['black', 'blue', 'brown', 'gray', 'green', 'lavender', 'maroon', 'pink', 'red', 'white', 'yellow'];
const BASES = [0, 4, 8, 12, 16];     // LPC anim blocks; within each: +0 N, +1 W, +2 S, +3 E
const COLLAR_Y = 16, COLLAR_H = 15;  // the shoulder/clasp band lifted to the front

function bakeFront(srcFile, outFile) {
  const src = decode(fs.readFileSync(path.join(LPC, srcFile)));
  const front = makeImage(src.w, src.h);
  for (const base of BASES) {
    // north (away): borrow the south-facing drape so the cape shows on the back
    blit(front, 0, base * 64, crop(src, 0, (base + 2) * 64, src.w, 64));
    // W / S / E: lift the collar band forward so the necktie sits over the chest
    for (const dd of [1, 2, 3]) {
      const y = (base + dd) * 64 + COLLAR_Y;
      blit(front, 0, y, crop(src, 0, y, src.w, COLLAR_H));
    }
  }
  fs.writeFileSync(path.join(LPC, outFile), encode(front.w, front.h, front.data));
  return outFile;
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const reg = (sheet, color, file) => {
  const key = 'capefront/' + sheet;
  manifest.gear[key] = manifest.gear[key] || { male: {}, female: {} };
  manifest.gear[key].male[color] = file;
  manifest.gear[key].female[color] = file;
};

let n = 0;
for (const c of COLORS) {
  reg('cape_normal', c, bakeFront(`cape_normal_${c}.png`, `cape_normal_${c}_front.png`)); n++;
  reg('cape_tattered', c, bakeFront(`cape_tattered_${c}.png`, `cape_tattered_${c}_front.png`)); n++;
}
// the blue-trim cape is already front-oriented (its away frames carry the cape),
// so its front layer IS itself — draw it behind AND in front.
reg('cape_bluetrim', 'whiteblue', 'cape_bluetrim.png');

fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
console.log(`baked ${n} cape-front sheets + wired blue-trim front`);

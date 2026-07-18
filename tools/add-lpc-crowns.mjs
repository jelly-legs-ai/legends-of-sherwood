// LPC Crown (OGA, bluecarrot16-style universal head layer) import:
// - registers gold/iron/fire/water crowns as composite head gear
//   (gear head/crown) for humanoid kings and the Sheriff
// - extracts a trimmed front-facing crown sprite so sheet/critter kings
//   (King slime, Pumpking, the Troll King...) can wear it as an overlay
// Usage: node tools/add-lpc-crowns.mjs <scratchpad/oga dir>
import fs from 'node:fs';
import path from 'node:path';
import { decode, encode, makeImage } from './png.mjs';

const O = process.argv[2];
const SRC = path.join(O, 'lpc-crown');
const LPC = path.resolve('client/assets/lpc');
const ENV = path.resolve('client/assets/env');
const MANIFEST = path.join(LPC, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

const CROWNS = { gold: 'Crown_Gold.png', iron: 'Crown_Iron.png', fire: 'Crown_Fire.png', water: 'Crown_Water.png' };
const reg = {};
for (const [color, file] of Object.entries(CROWNS)) {
  const out = `gear_head_crown_male_${color}.png`;
  fs.copyFileSync(path.join(SRC, file), path.join(LPC, out));
  reg[color] = out;
  console.log(' ', out);
}
manifest.gear['head/crown'] = { male: reg, female: reg };

// trimmed front crown (walkcycle down row = universal row 10, frame 0) for the
// overlay worn by non-humanoid kings
const sheet = decode(fs.readFileSync(path.join(SRC, CROWNS.gold)));
const cx0 = 0, cy0 = 10 * 64;
let x0 = 64, y0 = 64, x1 = 0, y1 = 0;
for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
  if (sheet.data[((cy0 + y) * sheet.w + cx0 + x) * 4 + 3] > 10) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
}
const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
const crown = makeImage(cw, ch);
for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++)
  for (let k = 0; k < 4; k++) crown.data[(y * cw + x) * 4 + k] = sheet.data[((cy0 + y0 + y) * sheet.w + cx0 + x0 + x) * 4 + k];
fs.writeFileSync(path.join(ENV, 'crown_gold.png'), encode(cw, ch, crown.data));
console.log('  env/crown_gold.png', cw + 'x' + ch);

fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
console.log('manifest updated');

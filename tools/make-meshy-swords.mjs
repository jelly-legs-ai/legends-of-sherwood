// Meshy input package (#131): compose all 40 unique rare-sword icons into ONE
// universal reference sheet (8x5 grid, 4x upscaled, numbered) for MeshyAI to
// generate matching LPC weapon sprite sheets. The grid order IS the weapon
// index (row-major, 1-40) so the returned sheet maps back automatically.
// Output: model assets/meshy/unique-swords-input.png (+ the spec alongside).
// Usage: node tools/make-meshy-swords.mjs
import fs from 'node:fs';
import path from 'node:path';
import { decode, encode, makeImage, blit } from './png.mjs';

const OUT = path.resolve('model assets/meshy');
fs.mkdirSync(OUT, { recursive: true });

const COLS = 8, ROWS = 5, ICON = 32, SCALE = 4, PAD = 12, LABEL = 10;
const CELL = ICON * SCALE + PAD * 2 + LABEL;
const sheet = makeImage(COLS * CELL, ROWS * CELL);

// tiny 3x5 pixel digits for the index labels
const DIGITS = {
  0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'],
};
function drawDigit(im, d, x0, y0, s = 2) {
  const rows = DIGITS[d];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
    if (rows[r][c] !== '1') continue;
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
      const o = ((y0 + r * s + dy) * im.w + x0 + c * s + dx) * 4;
      im.data[o] = 255; im.data[o + 1] = 235; im.data[o + 2] = 160; im.data[o + 3] = 255;
    }
  }
}

for (let i = 0; i < 40; i++) {
  const file = `client/assets/icons/swords/Icon28_${String(i + 1).padStart(2, '0')}.png`;
  const ic = decode(fs.readFileSync(path.resolve(file)));
  const cx = (i % COLS) * CELL, cy = ((i / COLS) | 0) * CELL;
  // nearest-neighbour 4x upscale into the cell
  for (let y = 0; y < ICON * SCALE; y++) for (let x = 0; x < ICON * SCALE; x++) {
    const so = (((y / SCALE) | 0) * ic.w + ((x / SCALE) | 0)) * 4;
    const dof = ((cy + PAD + y) * sheet.w + cx + PAD + x) * 4;
    for (let k = 0; k < 4; k++) sheet.data[dof + k] = ic.data[so + k];
  }
  // index label under the icon
  const label = String(i + 1);
  let lx = cx + PAD;
  for (const ch of label) { drawDigit(sheet, +ch, lx, cy + PAD + ICON * SCALE + 2); lx += 8; }
}

fs.writeFileSync(path.join(OUT, 'unique-swords-input.png'), encode(sheet.w, sheet.h, sheet.data));
console.log('model assets/meshy/unique-swords-input.png', sheet.w + 'x' + sheet.h);

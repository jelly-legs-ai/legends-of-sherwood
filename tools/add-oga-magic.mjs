// Magic & UI import (#128): extended LPC magic pack animation sheets copied
// into the FX pipeline (grid sheets for spell impacts), plus the daneeklu
// parchment scroll sliced as the skill-guide window background.
// Usage: node tools/add-oga-magic.mjs <scratchpad/oga dir>
import fs from 'node:fs';
import path from 'node:path';
import { decode, encode, makeImage, blit } from './png.mjs';

const O = process.argv[2];
const FX = path.resolve('client/assets/fx');
const UI = path.resolve('client/assets/ui');
const MEDIA = path.resolve('client/assets/media.json');
const media = JSON.parse(fs.readFileSync(MEDIA, 'utf8'));
fs.mkdirSync(UI, { recursive: true });

// ---- magic sheets -> media.fx grid entries ----------------------------------
const SHEETS = path.join(O, 'extended-lpc-magic-pack/unz_magic_pack/magic_pack/sheets');
const PACK = [
  // [fx key, file, cols, frames]  (all cells are 128px)
  ['magic_tornado', 'tornado.png', 4, 16],
  ['magic_spikes', 'spikes.png', 5, 10],
  ['magic_iceshield', 'iceshield.png', 4, 16],
  ['magic_lightningclaw', 'lightningclaw.png', 4, 16],
  ['magic_torrentacle', 'torrentacle.png', 4, 16],
  ['magic_icetacle', 'icetacle.png', 4, 16],
  ['magic_firelion', 'firelion_right.png', 4, 16],
  ['magic_snakebite', 'snakebite_side.png', 4, 16],
  ['magic_turtleshell', 'turtleshell_side.png', 4, 16],
];
for (const [key, file, cols, frames] of PACK) {
  const buf = fs.readFileSync(path.join(SHEETS, file));
  const im = decode(buf);
  fs.writeFileSync(path.join(FX, `${key}.png`), buf);
  media.fx[key] = { file: `fx/${key}.png`, w: im.w, h: im.h, frame: 128, kind: 'grid', cols, frames };
  console.log(key.padEnd(22), `${im.w}x${im.h} ${cols}c ${frames}f`);
}

// ---- parchment scroll -> skill-guide background ------------------------------
{
  const im = decode(fs.readFileSync(path.join(O, 'lpc-farming-tilesets-magic-animations-and-ui-elements/unz_submission_daneeklu/submission_daneeklu/ui/scrollsandblocks.png')));
  const A = (x, y) => im.data[(y * im.w + x) * 4 + 3];
  // the large unrolled scroll occupies the sheet's bottom-right quadrant
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 120; y < im.h; y++) for (let x = 350; x < im.w; x++)
    if (A(x, y) > 20) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const o = makeImage(x1 - x0 + 1, y1 - y0 + 1);
  blit(o, 0, 0, im, x0, y0, o.w, o.h);
  fs.writeFileSync(path.join(UI, 'scroll_bg.png'), encode(o.w, o.h, o.data));
  console.log('ui/scroll_bg.png', o.w + 'x' + o.h);
  // cap/middle/cap slices so scrollable windows tile the parchment cleanly
  const cut = (name, sy, sh) => {
    const s = makeImage(o.w, sh);
    blit(s, 0, 0, o, 0, sy, o.w, sh);
    fs.writeFileSync(path.join(UI, `${name}.png`), encode(s.w, s.h, s.data));
    console.log(`ui/${name}.png`, s.w + 'x' + s.h);
  };
  cut('scroll_top', 0, 62);
  cut('scroll_mid', 64, 70);
  cut('scroll_bot', o.h - 58, 58);
}

fs.writeFileSync(MEDIA, JSON.stringify(media, null, 1));
console.log('media.json updated');

// Jungle import (#127): LPC jungle v2 giant trees/plants + jungle-ruins pieces
// sliced into billboards for the Elderglade Wildwood — giant hollow trunks,
// stumps, fallen logs, undergrowth, harvestable pitcher plants & heliconia,
// and overgrown temple ruins (gate compositions flagged for future dungeons).
// Usage: node tools/add-oga-jungle.mjs <scratchpad/oga dir>
import fs from 'node:fs';
import path from 'node:path';
import { decode, encode, makeImage, blit, blend } from './png.mjs';

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
function save(name, im) {
  const t = trim(im);
  fs.writeFileSync(path.join(ENV, `${name}.png`), encode(t.w, t.h, t.data));
  media.trees[name] = { file: `env/${name}.png`, w: t.w, h: t.h };
  console.log(name.padEnd(20), t.w + 'x' + t.h);
}

const J = decode(fs.readFileSync(path.join(O, 'lpc-jungle/unz_lpc-jungle-v2/lpc-jungle-v2/giant-trees.png')));
const P = decode(fs.readFileSync(path.join(O, 'lpc-jungle/unz_lpc-jungle-v2/lpc-jungle-v2/giant-plants.png')));
const R = decode(fs.readFileSync(path.join(O, 'lpc-jungle-ruins/unz_lpc-jungle-ruins/lpc-jungle-ruins/jungle-ruins.png')));

// giant trees: hollow trunks, stumps, fallen timber
save('jungle_tree_great', crop(J, 440, 630, 300, 390));   // vast hollow-door trunk
save('jungle_tree_stump', crop(J, 5, 720, 335, 300));     // giant stump with hollow
save('jungle_tree_barrel', crop(J, 195, 25, 230, 285));   // rooted barrel trunk
save('jungle_log_arch', crop(J, 765, 10, 255, 100));      // fallen log arched over
save('jungle_log', crop(J, 840, 495, 184, 80));           // mossy fallen log

// undergrowth
save('jungle_fern', crop(P, 0, 350, 108, 125));
save('jungle_monstera', crop(P, 0, 480, 105, 95));
save('jungle_palm', crop(P, 0, 580, 100, 155));
save('jungle_leaves', crop(P, 220, 220, 130, 100));

// harvestables
save('pitcher_plant', crop(P, 445, 80, 82, 88));
save('heliconia', crop(P, 625, 165, 78, 105));

// ruins
save('ruin_totem', crop(R, 695, 350, 52, 195));           // carved totem column
save('ruin_statue', crop(R, 20, 920, 55, 100));           // moss-eaten idol
save('ruin_rubble', crop(R, 285, 945, 125, 78));          // tumbled temple stones
// gate composition: two idols flanking a black-void arch — a sealed way down
{
  const arch = trim(crop(R, 925, 365, 55, 85));
  const idolL = trim(crop(R, 20, 920, 30, 100));
  const idolR = trim(crop(R, 108, 920, 30, 100));
  const gate = makeImage(arch.w + idolL.w + idolR.w + 8, Math.max(arch.h, idolL.h) + 8);
  blend(gate, 0, gate.h - idolL.h, idolL);
  blend(gate, idolL.w + 4, gate.h - arch.h, arch);
  blend(gate, idolL.w + arch.w + 8, gate.h - idolR.h, idolR);
  save('ruin_gate', gate);
}

fs.writeFileSync(MEDIA, JSON.stringify(media, null, 1));
console.log('media.json updated');

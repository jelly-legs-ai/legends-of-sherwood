// Two-layer, all-direction capes (#190, #196, #206). LPC "behind_body" capes
// carry a wide drape for the south facing, a thin near-invisible profile for
// west/east, and nothing at all for the away (north) facing.
//
// This bakes, per cape, a BEHIND sheet and a FRONT sheet:
//   BEHIND — south kept as-is (wide drape behind the body); west/east given their
//            OWN side-profile pose: the drape is anchored at the shoulders and
//            SHEARED so the fabric sweeps back and down behind the body, flaring
//            out past the silhouette into a flowing cape seen from the side (a
//            per-frame flutter animates the billow). North left empty.
//   FRONT  — north synthesized from the south drape (a hanging cape reads the same
//            from front or back) so the cape shows when facing away; a collar band
//            lifted from the south frame so the necktie sits over the chest.
// The composite draws behind + front, so capes read well in all four directions.
//   Usage: node tools/fix-capes.mjs
import fs from 'node:fs';
import path from 'node:path';
import { decode, encode, makeImage, blit, crop } from './png.mjs';

const LPC = path.resolve('client/assets/lpc');
const MANIFEST = path.join(LPC, 'manifest.json');
const COLORS = ['black', 'blue', 'brown', 'gray', 'green', 'lavender', 'maroon', 'pink', 'red', 'white', 'yellow'];
const BASES = [0, 4, 8, 12, 16];    // LPC anim blocks; within each: +0 N, +1 W, +2 S, +3 E
const HURT = 20;                    // single-direction hurt row
const COLLAR_Y = 16, COLLAR_H = 15; // shoulder/clasp band lifted to the front (south only)
const FS = 64;
const ANCHOR_Y = 20;                // shoulders: rows above hang from here, unswept
const BOT_Y = 60;                   // hem
const SWEEP = 20;                   // px the hem sweeps back behind the profile body

// The south drape reshaped into a side profile: anchored at the shoulders, the
// fabric sweeps back and down behind the body so it flares past the silhouette
// (dir=+1 trails right for west, -1 trails left for east). The sweep eases in
// quadratically (top stays put, hem swings out) and a per-frame flutter animates
// the billow so the profile has its own walk cadence, not a static offset.
function shearedSide(src, colX, southY, dir, frame) {
  const sf = crop(src, colX, southY, FS, FS);
  const out = makeImage(FS, FS);
  const flutter = 1 + 0.14 * Math.sin(frame * 0.9);
  for (let y = 0; y < FS; y++) {
    const fr = Math.max(0, Math.min(1, (y - ANCHOR_Y) / (BOT_Y - ANCHOR_Y)));
    const dx = Math.round(dir * SWEEP * flutter * fr * fr);
    blit(out, dx, y, sf, 0, y, FS, 1);
  }
  return out;
}

function bake(srcFile, behindFile, frontFile) {
  const src = decode(fs.readFileSync(path.join(LPC, srcFile)));
  const behind = makeImage(src.w, src.h), front = makeImage(src.w, src.h);
  for (const base of BASES) {
    const sy = (base + 2) * FS;                                   // south row
    blit(behind, 0, sy, crop(src, 0, sy, src.w, FS));            // south: keep the wide drape
    // per column (frame), a shoulder-anchored side-profile sheared from that frame
    for (let c = 0; c < src.w / FS; c++) {
      blit(behind, c * FS, (base + 1) * FS, shearedSide(src, c * FS, sy, +1, c));  // west → sweeps right
      blit(behind, c * FS, (base + 3) * FS, shearedSide(src, c * FS, sy, -1, c));  // east → sweeps left
    }
    // front: north synthesized from the south drape; collar band over the chest (south)
    blit(front, 0, base * FS, crop(src, 0, sy, src.w, FS));
    blit(front, 0, sy + COLLAR_Y, crop(src, 0, sy + COLLAR_Y, src.w, COLLAR_H));
  }
  blit(behind, 0, HURT * FS, crop(src, 0, HURT * FS, src.w, FS));  // hurt: leave as-is
  fs.writeFileSync(path.join(LPC, behindFile), encode(behind.w, behind.h, behind.data));
  fs.writeFileSync(path.join(LPC, frontFile), encode(front.w, front.h, front.data));
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const reg = (cat, sheet, color, file) => {
  const key = cat + '/' + sheet;
  manifest.gear[key] = manifest.gear[key] || { male: {}, female: {} };
  manifest.gear[key].male[color] = file; manifest.gear[key].female[color] = file;
};

let n = 0;
for (const c of COLORS) {
  for (const kind of ['normal', 'tattered']) {
    bake(`cape_${kind}_${c}.png`, `cape_${kind}_${c}_behind.png`, `cape_${kind}_${c}_front.png`);
    reg('behind', `cape_${kind}`, c, `cape_${kind}_${c}_behind.png`);   // repoint behind → enhanced drape
    reg('capefront', `cape_${kind}`, c, `cape_${kind}_${c}_front.png`);
    n++;
  }
}
// the blue-trim cape is already front-oriented (its away frames carry the cape)
reg('capefront', 'cape_bluetrim', 'whiteblue', 'cape_bluetrim.png');

fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
console.log(`baked ${n} capes × (behind + front); west/east reshaped into sheared flowing side profiles`);

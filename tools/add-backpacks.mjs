// Worn backpack visuals (#184). Bakes a BEHIND sheet (the pack, drawn behind the
// body) and a FRONT sheet (straps / basket rim, drawn over the torso) for every
// backpack item, from the LPC Backpacks pack (bluecarrot16, CC-BY-SA/GPL) and the
// "more backpacks" material baskets (bluecarrot16, CC0 + daneeklu wood). The
// material baskets are collapsed here: basket + its contents + straps flattened
// into the two sheets so the runtime only ever draws pack-behind + pack-front.
//   Usage: node tools/add-backpacks.mjs
import fs from 'node:fs';
import path from 'node:path';
import { decode, encode, makeImage, blend } from './png.mjs';

const SRC = path.resolve('model assets/LPC Backpacks');
const OUT = path.resolve('client/assets/lpc');
const MANIFEST = path.resolve('client/assets/lpc/manifest.json');
const SEXES = ['male', 'female'];
const cap = (s) => s[0].toUpperCase() + s.slice(1);

// key → source. Colored packs use a whole Backpack sheet (behind) + Straps
// (front); material baskets bake basket+contents (bg=behind, fg=front) + straps.
const COLORED = { leather: 'Leather', walnut: 'Walnut', purple: 'Purple', teal: 'Teal', forest: 'Forest' };
const BASKETS = { ore_iron: { kind: 'ore', mat: 'iron' }, wood: { kind: 'wood', mat: '9_logs' }, ore_silver: { kind: 'ore', mat: 'silver' } };
const BASKET_STRAP = 'Tan';   // strap colour blended onto the material baskets

const load = (p) => decode(fs.readFileSync(p));
const baseSheet = (kind, color, sex) => load(path.join(SRC, 'base', cap(sex), kind, `${color} ${kind} ${cap(sex)}.png`));
const moreSheet = (...rel) => load(path.join(SRC, 'more', ...rel));

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
manifest.gear['behind/pack'] = { male: {}, female: {} };
manifest.gear['packfront/pack'] = { male: {}, female: {} };
manifest.files = manifest.files || {};

function write(key, sex, which, img) {
  const file = `pack_${key}_${which}_${sex}.png`;
  fs.writeFileSync(path.join(OUT, file), encode(img.w, img.h, img.data));
  manifest.gear[which === 'behind' ? 'behind/pack' : 'packfront/pack'][sex][key] = file;
  return file;
}

let n = 0;
for (const sex of SEXES) {
  // Colored packs: the lpc-backpacks "Backpack" sheet holds the pack in its
  // away-facing frames (front-facing frames are empty), i.e. it's drawn OVER the
  // body — the pack shows on the back when the character faces away, and hides
  // behind the body when they face you. So pack + straps both go in the FRONT
  // layer; the behind layer is unused for these.
  for (const [key, color] of Object.entries(COLORED)) {
    const front = makeImage(832, 1344);
    blend(front, 0, 0, baseSheet('Backpack', color, sex));
    blend(front, 0, 0, baseSheet('Straps', color, sex));
    write(key, sex, 'front', front);
    n++;
  }
  // Material baskets ship a proper bg (behind body) + fg (in front) split, plus
  // the corresponding contents; straps from lpc-backpacks ride the front.
  for (const [key, { kind, mat }] of Object.entries(BASKETS)) {
    const behind = makeImage(832, 1344);
    blend(behind, 0, 0, moreSheet('basket', 'bg', 'round.png'));
    blend(behind, 0, 0, moreSheet('basket_contents', kind, 'bg', `${mat}.png`));
    write(key, sex, 'behind', behind);
    const front = makeImage(832, 1344);
    blend(front, 0, 0, moreSheet('basket', 'fg', 'round.png'));
    blend(front, 0, 0, moreSheet('basket_contents', kind, 'fg', `${mat}.png`));
    blend(front, 0, 0, baseSheet('Straps', BASKET_STRAP, sex));   // the lpc-backpacks straps
    write(key, sex, 'front', front);
    n++;
  }
}
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
console.log(`baked ${n * 2} pack sheets (behind+front) for ${n / SEXES.length} packs × ${SEXES.length} sexes`);
console.log('keys:', [...Object.keys(COLORED), ...Object.keys(BASKETS)].join(', '));

// Additive LPC gear import (pass 2): the new generator repo splits every item
// into per-animation PNGs, so this stitches them back into the 21-row
// universal sheets our compositor expects (spellcast/thrust/walk/slash/shoot/
// hurt) and merges the results into client/assets/lpc/manifest.json.
// Usage: node tools/add-lpc-gear.mjs <path-to-lpc-repo>
import fs from 'node:fs';
import path from 'node:path';
import { decode, encode, makeImage, blit } from './png.mjs';

const SRC = path.join(process.argv[2] || '../lpc-repo', 'spritesheets');
const OUT = path.resolve('client/assets/lpc');
const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));
let made = 0; const missing = [];

// classic universal row layout: anim -> sheet y row offset
const ROWS = { spellcast: 0, thrust: 4, walk: 8, slash: 12, shoot: 16, hurt: 20 };

// Stitch one universal sheet from a directory of per-anim pngs. `pick` maps an
// anim name to a candidate file list (first hit wins); returns flat file name.
function stitch(key, pick) {
  const sheet = makeImage(832, 21 * 64);
  let any = false;
  for (const [anim, row] of Object.entries(ROWS)) {
    const cands = pick(anim);
    const src = cands.find(p => fs.existsSync(path.join(SRC, p)));
    if (!src) continue;
    const img = decode(fs.readFileSync(path.join(SRC, src)));
    blit(sheet, 0, row * 64, img, 0, 0, Math.min(img.w, 832), Math.min(img.h, (21 - row) * 64));
    any = true;
  }
  if (!any) { missing.push(key); return null; }
  const flat = key.replace(/[^a-z0-9_]+/gi, '_') + '.png';
  fs.writeFileSync(path.join(OUT, flat), encode(sheet.w, sheet.h, sheet.data));
  made++;
  manifest.files[key] = flat;
  return flat;
}

// ---- metal helmets (single finish; the client tints per metal tier) --------
for (const h of ['armet', 'bascinet', 'horned', 'legion']) {
  const f = stitch(`gear_head_${h}`, a => [
    `hat/helmet/${h}/adult/${a}.png`, `hat/helmet/${h}/male/${a}.png`, `hat/helmet/${h}/female/${a}.png`,
  ]);
  if (f) manifest.gear[`head/${h}`] = { male: { steel: f }, female: { steel: f } };
}
// ---- cloth headwear (default finish) ---------------------------------------
for (const h of [['bandana', 'hat/cloth/bandana/adult'], ['leather_cap', 'hat/cloth/leather_cap/adult']]) {
  const f = stitch(`gear_head_${h[0]}`, a => [`${h[1]}/${a}.png`]);
  if (f) manifest.gear[`head/${h[0]}`] = { male: { brown: f }, female: { brown: f } };
}
// ---- wings & tails: behind-the-body layers, per colour ---------------------
const WING_COLORS = ['black', 'white', 'blue', 'green', 'red', 'gold', 'purple'];
for (const w of ['feathered', 'bat', 'monarch', 'pixie', 'dragonfly', 'lunar']) {
  const dict = {};
  for (const c of WING_COLORS) {
    const f = stitch(`gear_behind_wings_${w}_${c}`, a => [
      `body/wings/${w}/adult/bg/${a}/${c}.png`, `body/wings/${w}/adult/${a}/${c}.png`,
    ]);
    if (f) dict[c] = f;
  }
  if (Object.keys(dict).length) manifest.gear[`behind/wings_${w}`] = { male: dict, female: dict };
}
const TAIL_COLORS = ['black', 'white', 'gray', 'brown', 'chestnut', 'blue', 'green'];
for (const t of ['cat', 'fluffy', 'lizard', 'wolf']) {
  const dict = {};
  for (const c of TAIL_COLORS) {
    const f = stitch(`gear_behind_tail_${t}_${c}`, a => [
      `body/tail/${t}/adult/bg/${a}/${c}.png`, `body/tail/${t}/adult/${a}/${c}.png`,
    ]);
    if (f) dict[c] = f;
  }
  if (Object.keys(dict).length) manifest.gear[`behind/tail_${t}`] = { male: dict, female: dict };
}
// ---- shoulders & bracers (single finish; tint-dyed per metal at runtime) ----
for (const s of ['pauldrons', 'bauldron', 'epaulets', 'mantal']) {
  const f = stitch(`gear_shoulders_${s}`, a => [
    `shoulders/${s}/male/${a}.png`, `shoulders/${s}/adult/${a}.png`, `shoulders/${s}/thin/${a}.png`,
  ]);
  if (f) manifest.gear[`shoulders/${s}`] = { male: { steel: f }, female: { steel: f } };
}
{
  const f = stitch('gear_wrists_bracers', a => [`arms/bracers/male/${a}.png`, `arms/bracers/adult/${a}.png`]);
  if (f) manifest.gear['wrists/bracers'] = { male: { steel: f }, female: { steel: f } };
}
// ---- wounds: overlay sheets (hurt/shoot/slash rows only), staged for later --
manifest.wounds = manifest.wounds || {};
for (const w of ['arm', 'ribs', 'brain', 'mouth', 'eye_left', 'eye_right']) {
  const f = stitch(`wound_${w}`, a => [`body/wound/${w}/${a}.png`]);
  if (f) manifest.wounds[w] = f;
}

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`stitched ${made} sheets (merged into manifest)`);
if (missing.length) console.log('missing:', missing.join(', '));

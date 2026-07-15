// Gear pass 3: the LPC helmets mega-pack (8 new helm lines in all 8 metal
// finishes), the gilded winged open-visor helm (ranger 50+, helmet + wings
// accessory baked into one sheet), LPC pointed mage hats (6 colours x buckle),
// the two celestial wizard hats, and the more-weapons staves (diamond / loop /
// gnarled woods + the three crystal staves). All sources are 832x1344
// universal sheets, so files copy straight through with manifest entries.
// Usage: node tools/add-oga-gear2.mjs <scratchpad/oga dir>
import fs from 'node:fs';
import path from 'node:path';
import { decode, encode, makeImage, blit, blend } from './png.mjs';

const O = process.argv[2];
const LPC = path.resolve('client/assets/lpc');
const MANIFEST = path.join(LPC, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

const HP = path.join(O, 'lpc-helmets-mega-pack/unz_lpc-helmets-mega-pack/lpc-helmets-mega-pack/hat');
const copy = (src, name) => { fs.copyFileSync(src, path.join(LPC, name)); return name; };

// --- 8 new helm lines, every colour the pack ships -------------------------
const HELMS = ['barbuta', 'norman', 'nasal', 'spangenhelm_viking', 'sugarloaf', 'flattop', 'morion', 'close'];
const COLORS = ['brass', 'bronze', 'copper', 'gold', 'iron', 'silver', 'steel'];
for (const h of HELMS) {
  const key = `head/${h}`;
  manifest.gear[key] = {};
  for (const sex of ['male', 'female']) {
    manifest.gear[key][sex] = {};
    for (const c of COLORS) {
      const src = path.join(HP, 'helmet', h, sex, `${c}.png`);
      if (!fs.existsSync(src)) continue;
      manifest.gear[key][sex][c] = copy(src, `gear_head_${h}_${sex}_${c}.png`);
    }
  }
  console.log('helm', h, Object.keys(manifest.gear[key].male || {}).length, 'colours');
}

// --- the gilded winged helm: raised-visor bascinet + gold wings ------------
{
  manifest.gear['head/winged'] = {};
  for (const sex of ['male', 'female']) {
    const helm = decode(fs.readFileSync(path.join(HP, 'helmet/bascinet_round_raised', sex, 'gold.png')));
    const sheet = makeImage(helm.w, helm.h);
    const layer = (p) => { if (fs.existsSync(p)) blend(sheet, 0, 0, decode(fs.readFileSync(p))); };
    layer(path.join(HP, 'accessory/wings/bg', sex, 'gold.png'));   // far wing behind the helm
    blend(sheet, 0, 0, helm);
    layer(path.join(HP, 'accessory/wings/fg', sex, 'gold.png'));   // near wing over it
    const name = `gear_head_winged_${sex}.png`;
    fs.writeFileSync(path.join(LPC, name), encode(sheet.w, sheet.h, sheet.data));
    manifest.gear['head/winged'][sex] = { gold: name };
  }
  console.log('winged gold visor helm baked');
}

// --- pointed mage hats (6 colours, plain + buckled) -------------------------
{
  const MH = path.join(O, 'lpc-pointed-hats/unz_LPC_magic_hats/LPC_magic_hats');
  for (const [key, sub] of [['head/pointed_hat', 'nobuckle'], ['head/pointed_hat_buckle', 'buckle']]) {
    manifest.gear[key] = {};
    for (const sex of ['male', 'female']) {
      manifest.gear[key][sex] = {};
      for (const c of ['black', 'brown', 'gray', 'red', 'teal', 'yellow']) {
        const src = path.join(MH, sex, sub, `${c}.png`);
        if (fs.existsSync(src)) manifest.gear[key][sex][c] = copy(src, `gear_${key.replace('/', '_')}_${sex}_${c}.png`);
      }
    }
  }
  console.log('pointed hats copied');
}
// --- celestial wizard hats ---------------------------------------------------
{
  const CH = path.join(O, 'lpc-celestial-wizard-hats/unz_LPC_starhat/LPC_starhat');
  manifest.gear['head/celestial'] = {}; manifest.gear['head/celestial_moon'] = {};
  for (const sex of ['male', 'female']) {
    manifest.gear['head/celestial'][sex] = { default: copy(path.join(CH, `nomoon-${sex}.png`), `gear_head_celestial_${sex}.png`) };
    manifest.gear['head/celestial_moon'][sex] = { default: copy(path.join(CH, `moon-${sex}.png`), `gear_head_celestial_moon_${sex}.png`) };
  }
  console.log('celestial hats copied');
}

// --- more-weapons staves: three carved woods + the crystal staves ------------
// The universal sheets carry only the walk/held rows; the cast swing lives in
// thrust_oversized (192px overlays), mirroring how weapons.staff is wired.
{
  const MW = path.join(O, 'lpc-more-weapons/unz_lpc-more-weapons_1/lpc-more-weapons/universal');
  const TO = path.join(O, 'lpc-more-weapons/unz_lpc-more-weapons_1/lpc-more-weapons/thrust_oversized');
  for (const st of ['staff_diamond', 'staff_loop', 'staff_gnarled']) {
    manifest.weapons[st] = {
      fg: { default: copy(path.join(MW, `${st}_fg.png`), `wep_${st}_fg.png`) },
      bg: { default: copy(path.join(MW, `${st}_bg.png`), `wep_${st}_bg.png`) },
      perAnim: { thrust: {
        fg: { default: copy(path.join(TO, `${st}_fg.png`), `wep_${st}_thrust_fg.png`) },
        bg: { default: copy(path.join(TO, `${st}_bg.png`), `wep_${st}_thrust_bg.png`) },
      } },
    };
  }
  manifest.weapons.crystal_staff = { fg: {}, bg: {}, perAnim: { thrust: { fg: {}, bg: {} } } };
  for (const c of ['blue', 'green', 'red']) {
    manifest.weapons.crystal_staff.fg[c] = copy(path.join(MW, `crystal_${c}_fg.png`), `wep_crystal_${c}_fg.png`);
    manifest.weapons.crystal_staff.bg[c] = copy(path.join(MW, `crystal_${c}_bg.png`), `wep_crystal_${c}_bg.png`);
    manifest.weapons.crystal_staff.perAnim.thrust.fg[c] = copy(path.join(TO, `crystal_${c}_fg.png`), `wep_crystal_${c}_thrust_fg.png`);
    manifest.weapons.crystal_staff.perAnim.thrust.bg[c] = copy(path.join(TO, `crystal_${c}_bg.png`), `wep_crystal_${c}_thrust_bg.png`);
  }
  console.log('staves + crystal staves copied (walk + oversized cast)');
}

fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
console.log('manifest updated');

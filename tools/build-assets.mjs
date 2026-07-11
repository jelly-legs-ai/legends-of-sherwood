// Resolves the LPC (Liberated Pixel Cup) sheets our game uses from a local
// sparse checkout of sanderfrenken/Universal-LPC-Spritesheet-Character-Generator,
// copies them into client/assets/lpc/ with flat names, and writes manifest.json.
// Usage: node tools/build-assets.mjs <path-to-lpc-repo>
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.join(process.argv[2] || '../lpc-repo', 'spritesheets');
const OUT = path.resolve('client/assets/lpc');
fs.mkdirSync(OUT, { recursive: true });

const SKINS = ['light', 'olive', 'taupe', 'brown', 'black'];
const HAIRC = ['black', 'dark_brown', 'light_brown', 'blonde', 'ginger', 'gray'];
const HAIRS = ['plain', 'bangs', 'bedhead', 'braid', 'buzzcut', 'curly_long'];
const METALS = ['copper', 'bronze', 'iron', 'steel', 'brass', 'silver', 'gold'];
const CLOTH = ['white', 'black', 'blue', 'brown', 'forest', 'green', 'charcoal', 'walnut', 'tan', 'red'];
const WOODS = ['normal', 'light', 'medium', 'dark', 'gnarled', 'gold', 'walnut'];
const SEXES = ['male', 'female'];

const manifest = { frame: 64, files: {}, gear: {}, weapons: {}, bodies: {}, heads: {}, hair: {}, beard: {}, misc: {} };
let copied = 0, missing = [];

function tryFile(cands) { for (const c of cands) { const p = path.join(SRC, c); if (fs.existsSync(p) && fs.statSync(p).isFile()) return p; } return null; }
function emit(key, cands) {
  const src = tryFile(cands);
  if (!src) { missing.push(key + ' <= ' + cands[0]); return null; }
  const flat = key.replace(/[^a-z0-9_]+/gi, '_') + '.png';
  fs.copyFileSync(src, path.join(OUT, flat));
  copied++;
  manifest.files[key] = flat;
  return flat;
}

// Shadow
manifest.misc.shadow = emit('shadow', ['shadow/adult/shadow.png']);
manifest.misc.arrow = emit('arrow_overlay', ['weapon/ranged/bow/arrow/arrow.png']);

// Bodies & heads (skin tones), hair, beard
for (const sex of SEXES) {
  manifest.bodies[sex] = {}; manifest.heads[sex] = {};
  for (const s of SKINS) {
    manifest.bodies[sex][s] = emit(`body_${sex}_${s}`, [`body/bodies/${sex}/${s}.png`]);
    manifest.heads[sex][s] = emit(`head_${sex}_${s}`, [`head/heads/human/${sex}/${s}.png`, `head/heads/human/${sex === 'male' ? 'female' : 'male'}/${s}.png`]);
  }
  for (const st of HAIRS) {
    manifest.hair[st] = manifest.hair[st] || {};
    manifest.hair[st][sex] = manifest.hair[st][sex] || {};
    for (const c of HAIRC)
      manifest.hair[st][sex][c] = emit(`hair_${st}_${sex}_${c}`, [`hair/${st}/${sex}/${c}.png`, `hair/${st}/adult/${c}.png`, `hair/${st}/${sex === 'male' ? 'female' : 'male'}/${c}.png`]);
  }
}
for (const c of HAIRC) manifest.beard[c] = emit(`beard_${c}`, [`beards/beard/basic/${c}.png`]);

// Gear layers: key = "<slotSheet>", per sex, per color, with fallbacks across cuts
const ALIAS = { forest: ['forest_green'], green: ['forest_green'], charcoal: ['dark_gray'], walnut: ['dark_brown'], tan: ['brown'], white: ['light_gray'] };
const GEAR = [
  ['torso/plate', METALS, s => [`torso/armour/plate/${s}/{c}.png`, `torso/armour/plate/${other(s)}/{c}.png`]],
  ['torso/chainmail', METALS, s => [`torso/chainmail/${s}/{c}.png`, `torso/chainmail/${other(s)}/{c}.png`, `torso/chainmail/${s}/gray.png`]],
  ['torso/leather', CLOTH, s => [`torso/armour/leather/${s}/{c}.png`, `torso/armour/leather/${other(s)}/{c}.png`]],
  ['torso/robe', CLOTH, s => [`torso/clothes/robe/${s}/{c}.png`, `torso/clothes/robe/female/{c}.png`]],
  ['torso/longsleeve', CLOTH, s => [`torso/clothes/longsleeve/longsleeve/${s}/{c}.png`, `torso/clothes/longsleeve/longsleeve/female/{c}.png`, `torso/clothes/shortsleeve/shortsleeve/${s}/{c}.png`, `torso/clothes/shortsleeve/shortsleeve/female/{c}.png`]],
  ['torso/tunic', CLOTH, s => [`torso/clothes/tunic/${s}/{c}.png`, `torso/clothes/tunic/female/{c}.png`]],
  ['legs/plate', METALS, s => [`legs/armour/plate/${s}/{c}.png`, `legs/armour/plate/${other(s)}/{c}.png`]],
  ['legs/pants', CLOTH, s => [`legs/pants/${s}/{c}.png`, `legs/pants/thin/{c}.png`]],
  ['feet/armour', METALS, s => [`feet/armour/plate/${s}/{c}.png`, `feet/armour/plate/${other(s)}/{c}.png`]],
  ['feet/boots', CLOTH, s => [`feet/boots/${s}/{c}.png`, `feet/boots/thin/{c}.png`, `feet/boots/${other(s)}/{c}.png`]],
  ['hands/gloves', [...METALS, ...CLOTH], s => [`arms/gloves/${s}/{c}.png`, `arms/gloves/${other(s)}/{c}.png`]],
  ['head/kettle', METALS, s => [`hat/helmet/kettle/adult/{c}.png`, `hat/helmet/kettle/adult/steel.png`]],
  ['head/mail', METALS, s => [`hat/helmet/mail/adult/{c}.png`, `hat/helmet/mail/${s}/{c}.png`, `hat/helmet/mail/adult/steel.png`, `hat/helmet/mail/${s}.png`]],
  ['head/greathelm', METALS, s => [`hat/helmet/greathelm/${s}/{c}.png`, `hat/helmet/greathelm/${other(s)}/{c}.png`, `hat/helmet/greathelm/${s}.png`]],
  ['head/hood', CLOTH, s => [`hat/cloth/hood/adult/{c}.png`]],
  ['shield/heater', METALS, s => [`shield/heater/revised/paint/bg/{c}.png`]],
  ['behind/quiver', ['brown'], s => [`quiver/quiver.png`]],
];
function other(s) { return s === 'male' ? 'female' : 'male'; }
// Heater shields use the heraldic paint palette; map metal names to paints.
const KEY_ALIAS = { 'shield/heater': { copper: 'ochre', iron: 'charcoal', steel: 'gray', brass: 'honey', gold: 'mustard' } };
for (const [key, colors, cands] of GEAR) {
  manifest.gear[key] = {};
  for (const sex of SEXES) {
    manifest.gear[key][sex] = {};
    for (const c of colors) {
      const keyAlias = (KEY_ALIAS[key] || {})[c];
      const tries = [...(keyAlias ? [keyAlias] : []), c, ...(ALIAS[c] || [])];
      const list = tries.flatMap(cc => cands(sex).map(t => t.replace('{c}', cc)));
      manifest.gear[key][sex][c] = emit(`gear_${key}_${sex}_${c}`, list);
    }
  }
}

// Weapons: universal sheets (64px grid, first 21 rows classic) and/or per-anim oversize
function weaponUniversal(name, base, colors, fgbg = ['fg', 'bg']) {
  const w = { grid: 64, fg: {}, bg: {} };
  for (const c of colors) {
    w.fg[c] = emit(`wep_${name}_fg_${c}`, [`${base}/universal/${fgbg[0]}/${c}.png`]);
    w.bg[c] = emit(`wep_${name}_bg_${c}`, [`${base}/universal/${fgbg[1]}/${c}.png`]);
  }
  return w;
}
manifest.weapons.sword = weaponUniversal('sword', 'weapon/sword/arming', METALS);
manifest.weapons.bow = weaponUniversal('bow', 'weapon/ranged/bow/normal', WOODS, ['foreground', 'background']);
manifest.weapons.recurve = weaponUniversal('recurve', 'weapon/ranged/bow/recurve', WOODS, ['foreground', 'background']);
manifest.weapons.great = weaponUniversal('great', 'weapon/ranged/bow/great', WOODS, ['foreground', 'background']);
manifest.weapons.staff = weaponUniversal('staff', 'weapon/magic/gnarled', WOODS, ['foreground', 'background']);
// Longspear: oversize per-anim overlays (frame = sheetHeight/4)
manifest.weapons.spear = { perAnim: {} };
for (const anim of ['thrust', 'walk']) {
  const a = { fg: {}, bg: {} };
  for (const c of METALS) {
    a.fg[c] = emit(`wep_spear_${anim}_fg_${c}`, [`weapon/polearm/longspear/${anim}/foreground/${c}.png`]);
    a.bg[c] = emit(`wep_spear_${anim}_bg_${c}`, [`weapon/polearm/longspear/${anim}/background/${c}.png`]);
  }
  manifest.weapons.spear.perAnim[anim] = a;
}

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
// License + credits travel with the assets
for (const f of ['CREDITS.csv', 'LICENSE', 'cc-by-sa-3_0.txt', 'gpl-3_0.txt']) {
  const p = path.join(SRC, '..', f);
  if (fs.existsSync(p)) fs.copyFileSync(p, path.join(OUT, f));
}
console.log(`copied ${copied} sheets -> ${OUT}`);
if (missing.length) { console.log(`MISSING ${missing.length}:`); for (const m of missing) console.log('  ' + m); }

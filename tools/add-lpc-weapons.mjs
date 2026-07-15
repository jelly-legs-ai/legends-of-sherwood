// Additive LPC import: copies NEW weapon sheets from a checkout of
// LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator into
// client/assets/lpc and MERGES them into the existing manifest.json —
// never touching entries that already work.
// Usage: node tools/add-lpc-weapons.mjs <path-to-lpc-repo>
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.join(process.argv[2] || '../lpc-repo', 'spritesheets');
const OUT = path.resolve('client/assets/lpc');
const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));
let copied = 0; const missing = [];

function emit(key, rel) {
  const p = path.join(SRC, rel);
  if (!fs.existsSync(p)) { missing.push(key + ' <= ' + rel); return null; }
  const flat = key.replace(/[^a-z0-9_]+/gi, '_') + '.png';
  fs.copyFileSync(p, path.join(OUT, flat));
  copied++;
  manifest.files[key] = flat;
  return flat;
}

// Single-finish per-anim melee lines — the client tints these per metal tier
// (keyed 'steel' so the tint fallback engages, exactly like mace/waraxe).
const NEWW = [
  ['dagger', 'weapon/sword/dagger', { walk: ['walk/dagger.png', 'behind/walk/dagger.png'], thrust: ['thrust/dagger.png', 'behind/thrust/dagger.png'], slash: ['slash/dagger.png', 'behind/slash/dagger.png'] }],
  ['rapier', 'weapon/sword/rapier', { walk: ['walk/rapier.png', 'universal_behind/walk/rapier.png'], slash: ['attack_slash/rapier.png', 'attack_slash/behind/rapier.png'] }],
  ['longsword', 'weapon/sword/longsword', { walk: ['walk/longsword.png', 'universal_behind/walk/longsword.png'], slash: ['attack_slash/longsword.png', 'attack_slash/behind/longsword.png'], thrust: ['attack_thrust/longsword.png', 'attack_thrust/behind/longsword.png'] }],
  ['flail', 'weapon/blunt/flail', { walk: ['walk/flail.png', 'behind/walk/flail.png'], slash: ['attack_slash/flail.png', 'attack_slash/behind/flail.png'] }],
  ['halberd', 'weapon/polearm/halberd', { walk: ['walk/halberd.png', 'behind/walk/halberd.png'], slash: ['attack_slash/halberd.png', 'attack_slash/behind/halberd.png'], thrust: ['attack_thrust/halberd.png', 'attack_thrust/behind/halberd.png'] }],
  ['scythe', 'weapon/polearm/scythe', { walk: ['walk/scythe.png', 'universal_behind/walk/scythe.png'], slash: ['attack_slash/scythe.png', 'attack_slash/behind/scythe.png'] }],
];
for (const [name, base, anims] of NEWW) {
  const w = { perAnim: {} };
  for (const [anim, [fgp, bgp]] of Object.entries(anims)) {
    const fg = emit(`wep_${name}_${anim}_fg`, `${base}/${fgp}`);
    const bg = bgp ? emit(`wep_${name}_${anim}_bg`, `${base}/${bgp}`) : null;
    w.perAnim[anim] = { fg: { steel: fg }, bg: { steel: bg } };
  }
  manifest.weapons[name] = w;
}

// Sword VARIANTS for the unique blades — each rare sword gets the LPC model
// its icon depicts (single finish; the client tints to the blade's colour).
const VARIANTS = [
  ['katana', 'weapon/sword/katana', { walk: ['walk/katana.png', 'walk/behind/katana.png'], slash: ['slash/katana.png', 'slash/behind/katana.png'] }],
  ['scimitar', 'weapon/sword/scimitar', { walk: ['walk/scimitar.png', 'walk/behind/scimitar.png'], slash: ['slash/scimitar.png', 'slash/behind/scimitar.png'] }],
  ['saber', 'weapon/sword/saber', { walk: ['walk/saber.png', 'universal_behind/walk/saber.png'], slash: ['attack_slash/saber.png', 'attack_slash/behind/saber.png'] }],
  ['longsword_alt', 'weapon/sword/longsword_alt', { walk: ['walk/longsword_alt.png', 'walk/behind/longsword_alt.png'], slash: ['slash/longsword_alt.png', 'slash/behind/longsword_alt.png'] }],
];
for (const [name, base, anims] of VARIANTS) {
  const w = { perAnim: {} };
  for (const [anim, [fgp, bgp]] of Object.entries(anims)) {
    const fg = emit(`wep_${name}_${anim}_fg`, `${base}/${fgp}`);
    const bg = bgp ? emit(`wep_${name}_${anim}_bg`, `${base}/${bgp}`) : null;
    w.perAnim[anim] = { fg: { steel: fg }, bg: { steel: bg } };
  }
  manifest.weapons[name] = w;
}
// The glowsword ships two native finishes (blue + red energy blades)
manifest.weapons.glowsword = { perAnim: {} };
for (const anim of ['walk', 'slash']) {
  const src = anim === 'walk' ? 'walk' : 'attack_slash';
  const a = { fg: {}, bg: {} };
  for (const c of ['blue', 'red']) {
    a.fg[c] = emit(`wep_glowsword_${anim}_fg_${c}`, `weapon/sword/glowsword/${src}/${c}.png`);
    a.bg[c] = emit(`wep_glowsword_${anim}_bg_${c}`,
      anim === 'walk' ? `weapon/sword/glowsword/universal_behind/walk/${c}.png` : `weapon/sword/glowsword/attack_slash/behind/${c}.png`);
  }
  manifest.weapons.glowsword.perAnim[anim] = a;
}

// Trident: fully metal-palettes fore/background, like the longspear
const METALS = ['copper', 'bronze', 'iron', 'steel', 'brass', 'silver', 'gold'];
manifest.weapons.trident = { perAnim: {} };
for (const anim of ['thrust', 'walk']) {
  const a = { fg: {}, bg: {} };
  for (const c of METALS) {
    a.fg[c] = emit(`wep_trident_${anim}_fg_${c}`, `weapon/polearm/trident/foreground/${anim}/${c}.png`);
    a.bg[c] = emit(`wep_trident_${anim}_bg_${c}`, `weapon/polearm/trident/background/${anim}/${c}.png`);
  }
  manifest.weapons.trident.perAnim[anim] = a;
}

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`copied ${copied} sheets (merged into manifest)`);
if (missing.length) { console.log(`MISSING ${missing.length}:`); for (const m of missing) console.log('  ' + m); }

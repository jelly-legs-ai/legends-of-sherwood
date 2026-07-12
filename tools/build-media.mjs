// Copies game-ready sheets from the raw "model assets" packs into client/assets
// and writes client/assets/media.json describing layouts. Frame-folder packs
// (spell FX, 256px bosses, crystal downscales) are packed separately in the
// browser via tools/pack jobs (/rawassets + /debug/save) and merged into the
// same manifest.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode, encode, makeImage, blit, blend, downscale } from './png.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'model assets');
const OUT = path.join(ROOT, 'client', 'assets');
const media = { creatures: {}, fx: {}, sheets: {}, packed: {} };
let copied = 0;
const dims = (p) => { const b = Buffer.alloc(24); const fd = fs.openSync(p, 'r'); fs.readSync(fd, b, 0, 24, 0); fs.closeSync(fd); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
function cp(src, destRel) {
  const s = path.join(RAW, src);
  if (!fs.existsSync(s)) { console.log('MISSING', src); return null; }
  const d = path.join(OUT, destRel);
  fs.mkdirSync(path.dirname(d), { recursive: true });
  fs.copyFileSync(s, d);
  copied++;
  const [w, h] = dims(d);
  return { file: destRel.replace(/\\/g, '/'), w, h };
}

// ---------------------------------------------------------------------------
// Strip-format bosses (horizontal strips, 128px frames). anims: name -> file
function stripBoss(key, dir, prefix, anims) {
  const out = { frame: 128, kind: 'strips', anims: {} };
  for (const [anim, fname] of Object.entries(anims)) {
    const e = cp(`${dir}/${prefix}${fname}.png`, `creatures/${key}_${anim}.png`);
    if (e) out.anims[anim] = { ...e, frames: Math.floor(e.w / 128) };
  }
  media.creatures[key] = out;
}
stripBoss('gollux', 'bosses/Bosses_Gollux/Gollux', 'gollux_', { idle: 'idle', walk: 'move', attack: 'attack_A', special: 'attack_B', hit: 'hit', heal: 'healing' });
stripBoss('pengu', 'bosses/Bosses_Pengu/Pengu', 'pengu_', { idle: 'idle', walk: 'move', attack: 'attack_peck', special: 'attack_ray', ice: 'attack_ice', hit: 'hurt' });
stripBoss('dino_rex', 'bosses/Bosses_Dino_Rex/Dino Rex', 'dino_rex_', { idle: 'idle', walk: 'move', attack: 'attack_A', special: 'stomp', hit: 'hurt' });
stripBoss('dino_tri', 'bosses/Bosses_Dino_Tri/Dino Tri', 'dino_tri_', { idle: 'idle', walk: 'move', attack: 'attack_A', special: 'attack_B' });
stripBoss('frogger', 'bosses/Bosses_Frogger/Frogger', 'frogger_', { idle: 'idle', walk: 'move', attack: 'tongue', special: 'spit', hit: 'hurt', heal: 'heal' });
stripBoss('badger_king', 'bosses/Bosses_Badger/Badger', 'badger_', { idle: 'idle', walk: 'move', attack: 'attack_A', hit: 'hurt' });

// Enemy Galore mobs: 64px-frame strips with per-creature file names
function galore(key, dir, anims, frame = 64) {
  const out = { frame, kind: 'strips', anims: {} };
  for (const [anim, fname] of Object.entries(anims)) {
    const e = cp(`mobs/Enemy_Galore_I/${dir}/${fname}.png`, `creatures/${key}_${anim}.png`);
    if (e) out.anims[anim] = { ...e, frames: Math.floor(e.w / frame), rows: Math.floor(e.h / frame) };
  }
  media.creatures[key] = out;
}
galore('cave_bat', 'Bat', { idle: 'Bat_Fly', walk: 'Bat_Fly', attack: 'Bat_Attack', hit: 'Bat_Hit', death: 'Bat_Death' });
galore('shore_crab', 'Crab', { idle: 'Crab_Idle', walk: 'Crab_Run', attack: 'Crab_AttackA', hit: 'Crab_Hit', death: 'Crab_Death' });
galore('spiked_slime', 'Slime', { idle: 'Slime_Spiked_Idle', walk: 'Slime_Spiked_Run', attack: 'Slime_Spiked_Ability', hit: 'Slime_Spiked_Hit', death: 'Slime_Spiked_Death' });
galore('stone_golem', 'Golem/No Armor', { idle: 'Golem_IdleA', walk: 'Golem_Run', attack: 'Golem_AttackA', hit: 'Golem_HitA', death: 'Golem_DeathA' });
galore('pebble_imp', 'Pebble', { idle: 'Pebble_Idle', walk: 'Pebble_Run', hit: 'Pebble_Hit', death: 'Pebble_Death' });
galore('cursed_skull', 'Skull', { idle: 'Bones_SingleSkull_Idle', walk: 'Bones_SingleSkull_Fly', attack: 'Bones_SingleSkull_Fly', hit: 'Bones_SingleSkull_Hit', death: 'Bones_SingleSkull_Death' });

// Bovine pack: 128px grid sheets (rows = directions)
function bovine(key, dir) {
  const out = { frame: 128, kind: 'grid', anims: {} };
  for (const [anim, fname] of [['idle', 'Idle'], ['walk', 'Move'], ['attack', 'Attack']]) {
    const e = cp(`mobs/Monster Pack 21 (Bovine)/Spritesheets/${dir}/${dir.split(' ').pop()}_${fname}.png`, `creatures/${key}_${anim}.png`);
    if (e) out.anims[anim] = { ...e, frames: Math.floor(e.w / 128), rows: Math.floor(e.h / 128) };
  }
  media.creatures[key] = out;
}
bovine('tusked_boar', 'Updated Boar');
bovine('wild_pig', 'Updated Pig');

// Skeleton pack
function pack40(key, dir) {
  const base = `mobs/Monster_Pack_40/Monster Pack 40 (Skeletons)/Spritesheets/${dir}`;
  const out = { frame: 128, kind: 'grid', anims: {} };
  const src = path.join(RAW, base);
  if (fs.existsSync(src)) {
    for (const f of fs.readdirSync(src)) {
      if (!f.endsWith('.png')) continue;
      const anim = f.toLowerCase().includes('idle') ? 'idle' : f.toLowerCase().includes('move') || f.toLowerCase().includes('walk') ? 'walk'
        : f.toLowerCase().includes('attack') ? 'attack' : f.toLowerCase().includes('hit') || f.toLowerCase().includes('hurt') ? 'hit'
        : f.toLowerCase().includes('death') ? 'death' : null;
      if (!anim || out.anims[anim]) continue;
      const e = cp(`${base}/${f}`, `creatures/${key}_${anim}.png`);
      if (e) out.anims[anim] = { ...e, frames: Math.floor(e.w / 128), rows: Math.floor(e.h / 128) };
    }
  }
  if (Object.keys(out.anims).length) media.creatures[key] = out;
}
pack40('skeleton_warrior', 'Skeleton');
pack40('witch_doctor', 'Witch Doctor');

// Ice Beast + hellbeast: pre-assembled 256p sheets (row-major grids)
function bigBeast(key, dir, picks, frame = 256) {
  const out = { frame, kind: 'grid', anims: {} };
  const src = path.join(RAW, dir);
  if (!fs.existsSync(src)) { console.log('MISSING', dir); return; }
  const files = fs.readdirSync(src);
  for (const [anim, match] of Object.entries(picks)) {
    const f = files.find(n => n.toLowerCase().startsWith(match.toLowerCase()) && n.endsWith('.png'));
    if (!f) { console.log('  no', match, 'in', dir); continue; }
    const e = cp(`${dir}/${f}`, `creatures/${key}_${anim}.png`);
    if (e) out.anims[anim] = { ...e, frames: Math.floor(e.w / frame) * Math.floor(e.h / frame), cols: Math.floor(e.w / frame) };
  }
  if (Object.keys(out.anims).length) media.creatures[key] = out;
}
bigBeast('ice_beast', 'bosses/Animated Isometric Ice Beast/Front_View/x256p_Spritesheets', { idle: 'Idle_Body', attack: 'Attack1_Body', special: 'Attack4_Body' });
// hellbeast: per-anim folders of per-rotation sheets; use the 180° (camera-facing) view
function hellbeast() {
  const base = 'bosses/animated hellbeast/Assembled_Shadow_Optimized_Spritesheets/x256p_Spritesheets';
  const out = { frame: 256, kind: 'grid', anims: {} };
  for (const [anim, dir] of [['idle', 'Idle'], ['walk', 'Walk'], ['attack', 'Attack_Swipe'], ['special', 'Roar'], ['death', 'Death']]) {
    const e = cp(`${base}/${dir}/${dir}_Body_180.png`, `creatures/hellbeast_${anim}.png`);
    if (e) out.anims[anim] = { ...e, frames: Math.floor(e.w / 256) * Math.floor(e.h / 256), cols: Math.floor(e.w / 256) };
  }
  if (Object.keys(out.anims).length) media.creatures.hellbeast = out;
}
hellbeast();

// Same-format packs (per-anim folders of per-rotation grid sheets; use 180°)
function rotBeast(key, base, frame, picks) {
  const out = { frame, kind: 'grid', anims: {} };
  for (const [anim, spec] of Object.entries(picks)) {
    const [dir, fbase] = Array.isArray(spec) ? spec : [spec, spec];
    const e = cp(`${base}/${dir}/${fbase}_Body_180.png`, `creatures/${key}_${anim}.png`);
    if (e) out.anims[anim] = { ...e, frames: Math.floor(e.w / frame) * Math.floor(e.h / frame), cols: Math.floor(e.w / frame) };
  }
  if (Object.keys(out.anims).length) media.creatures[key] = out;
}
rotBeast('fen_horror', 'mobs/animated serpant/Optimized_Spritesheets/x180p_Spritesheets', 180,
  { idle: 'Idle_Standing', walk: 'Move_Low', attack: 'Attack', hit: 'Hit', death: 'Death' });
rotBeast('web_stalker', 'bosses/animated Spider/x256_Spritesheets/x256_Spritesheets', 256,
  { idle: 'Idle_Nervous', walk: 'Walk', attack: 'Attack1', special: ['Attack_Capture (Heavy)', 'Attack_Capture'], death: 'Die1' });
rotBeast('queen_aracnyx', 'bosses/animated queen Aracnyx/x256_Spritesheets/x256_Spritesheets', 256,
  { idle: 'Idle_Nervous', walk: 'Walk', attack: 'Attack1', special: ['Attack_Capture (Heavy)', 'Attack_Capture'], death: 'Die1' });
rotBeast('dragon_tyrant', 'bosses/animated Three-head dragon/x256 Spritesheets/x256 Spritesheets', 256,
  { idle: 'Idle1', walk: 'Walk', attack: 'Attack1', special: 'FireBreath', hit: 'Hit', death: 'Death' });
rotBeast('archeopteryx', 'mobs/animated Archeopteryx/Assembled_Shadow_Spritesheets/x180p_Spritesheets', 180,
  { idle: 'Ground_Idle', walk: 'Ground_Run', attack: 'Ground_Attack_Bite', special: 'Ground_Roar', hit: 'Fly_Hit' });
rotBeast('gloom_moth', 'mobs/animated butterfly/x320_Spritesheets/x320_Spritesheets', 320,
  { idle: 'Idle', walk: 'Fly', attack: 'Attack', hit: 'Hit', death: 'Death' });
rotBeast('royal_moth', 'mobs/animated butterfly/Skin2_x320_Spritesheets/x320_Spritesheets', 320,
  { idle: 'Idle', walk: 'Fly', attack: 'Attack', hit: 'Hit', death: 'Death' });
bigBeast('abyssal_sentinel', 'mobs/animated halbard warrior/Front_View_SPRITESHEETS/x320p_Spritesheets',
  { idle: 'Idle_Body', walk: 'Walk_Body', attack: 'Attack1_Body', special: 'Attack3_Body', hit: 'Hit_Body', death: 'Death_Body' }, 320);

// Monster-Pack-style 128px grids (rows = 4 directions) given explicit file names
function grid128(key, base, anims) {
  const out = { frame: 128, kind: 'grid', anims: {} };
  for (const [anim, rel] of Object.entries(anims)) {
    const e = cp(`${base}/${rel}.png`, `creatures/${key}_${anim}.png`);
    if (e) out.anims[anim] = { ...e, frames: Math.floor(e.w / 128), rows: Math.floor(e.h / 128) };
  }
  if (Object.keys(out.anims).length) media.creatures[key] = out;
}
grid128('frost_wight', 'mobs/Monster_Pack_82/Monster Pack 82 (Event)/Snowmen',
  { idle: 'Christmas_Snowman_C_Idle', walk: 'Christmas_Snowman_C_Move' });
grid128('lost_spirit', 'mobs/Monster_Pack_83/Monster Pack 83 (Event 2)/Humans',
  { idle: 'Christmas_Kid_Ghost_Idle', walk: 'Christmas_Kid_Ghost_Move' });
grid128('wild_reindeer', 'mobs/Monster_Pack_83/Monster Pack 83 (Event 2)/Reindeer',
  { idle: 'Christmas_Reindeer_Idle', walk: 'Christmas_Reindeer_Move' });
grid128('meadow_hare', 'mobs/Monster_Pack_Free/Monster Pack (Free)/Spritesheets/Updated Rabbit',
  { idle: 'Rabbit_Brown_Idle', walk: 'Rabbit_Brown_Move' });
grid128('horned_hare', 'mobs/Monster_Pack_Free/Monster Pack (Free)/Spritesheets/Updated Rabbit Horned',
  { idle: 'Rabbit_Horned_Idle', walk: 'Rabbit_Horned_Move', attack: 'Rabbit_Horned_Attack' });

// Winter canines: 64px-wide strip frames (heights vary per anim: 32 idle, 64 attack)
function canine(key, color) {
  const out = { frame: 64, kind: 'strips', anims: {} };
  for (const [anim, f] of [['idle', 'Idle'], ['walk', 'Run'], ['attack', 'Attack'], ['hit', 'Hit'], ['death', 'Death']]) {
    const e = cp(`mobs/Enemy_Single_Winter_Canines/Canines/Canine_${color}_${f}.png`, `creatures/${key}_${anim}.png`);
    if (e) out.anims[anim] = { ...e, frames: Math.floor(e.w / 64) };
  }
  if (Object.keys(out.anims).length) media.creatures[key] = out;
}
canine('winter_wolf', 'White');
canine('dire_wolf', 'Black');

// Brigand: free character pack composited with its armor + sword equipment layers
function brigand() {
  const base = 'mobs/Monster_Pack_Free_Character/Monster Pack Character (Free)';
  const out = { frame: 128, kind: 'grid', anims: {} };
  for (const [anim, dir, f] of [['idle', 'Idle', 'Character_Idle'], ['walk', 'Move', 'Character_Move'], ['attack', 'Attack', 'Character_Attack'], ['death', 'Death', 'Character_Death']]) {
    const bp = path.join(RAW, base, dir, `${f}.png`);
    if (!fs.existsSync(bp)) continue;
    const img = decode(fs.readFileSync(bp));
    for (const layer of ['Leggings', 'Boots', 'Chestplate', 'Gloves', 'Hat', 'Sword']) {
      const lp = path.join(RAW, base, dir, 'Equipment', `${f}_${layer}.png`);
      if (fs.existsSync(lp)) blend(img, 0, 0, decode(fs.readFileSync(lp)));
    }
    const rel = `creatures/brigand_${anim}.png`;
    fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true });
    fs.writeFileSync(path.join(OUT, rel), encode(img.w, img.h, img.data));
    copied++;
    out.anims[anim] = { file: rel, w: img.w, h: img.h, frames: Math.floor(img.w / 128), rows: Math.floor(img.h / 128) };
  }
  if (Object.keys(out.anims).length) media.creatures.brigand = out;
}
brigand();

// Twisted elemental FX: already-assembled 8x8 grids of 100px frames
for (let v = 1; v <= 6; v++) {
  const e = cp(`Combat/twisted elemental spell projctile animation/${v}_100x100px.png`, `fx/twisted_${v}.png`);
  if (e) media.fx[`twisted_${v}`] = { ...e, frame: 100, kind: 'grid', cols: 8, frames: 64 };
}

// Frame-folder FX packs: each variant subfolder becomes one row of a grid sheet
function fxPack(key, dir, frame) {
  const src = path.join(RAW, dir);
  if (!fs.existsSync(src)) { console.log('MISSING', dir); return; }
  const num = (s) => parseInt(String(s).match(/(\d+)\.?p?n?g?$/)?.[1] ?? s.replace(/\D/g, '')) || 0;
  const variants = fs.readdirSync(src, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
    .sort((a, b) => num(a) - num(b));
  const rows = variants.map(v => fs.readdirSync(path.join(src, v)).filter(f => f.endsWith('.png'))
    .sort((a, b) => num(a) - num(b)).map(f => path.join(src, v, f)));
  const cols = Math.max(...rows.map(r => r.length));
  const sheet = makeImage(cols * frame, rows.length * frame);
  rows.forEach((files, r) => files.forEach((f, c) => blit(sheet, c * frame, r * frame, decode(fs.readFileSync(f)))));
  const rel = `fx/${key}.png`;
  fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true });
  fs.writeFileSync(path.join(OUT, rel), encode(sheet.w, sheet.h, sheet.data));
  copied++;
  media.fx[key] = { file: rel, w: sheet.w, h: sheet.h, frame, kind: 'vargrid', frames: cols, variants: rows.length };
  console.log('  fx', key, `${rows.length}v x ${cols}f @${frame}`);
}
fxPack('hitmarker', 'Combat/blood hitmarker effect', 16);
fxPack('orb', 'Combat/large elemental orb spell fx', 32);
fxPack('bolt', 'Combat/medium elemental bolt spell fx', 32);
fxPack('bomb', 'Combat/medium elemental bomb projectil animation', 16);
fxPack('stave', 'Combat/mid lvl stave projectile animation fx', 32);
fxPack('cosmic', 'Combat/low, mid and high lvl cosmic spell animations', 32);
fxPack('staffhi', 'Combat/high lvl elemental, blood,cursed,poison,and cosmic staff projectile animation', 16);

// VFX Free Pack: pre-packed spritesheets (frame size encoded in the filename,
// grids of 30/42 frames). Downscaled so frames land ~<=80px for the client.
function vfxPack(key, effName) {
  const dir = path.join(RAW, 'effects/Aura effects/VFX Free Pack', effName, '30fps/Spritesheets');
  if (!fs.existsSync(dir)) { console.log('MISSING vfx', effName); return; }
  const file = fs.readdirSync(dir).find(f => f.endsWith('.png'));
  if (!file) { console.log('no sheet', effName); return; }
  const m = file.match(/_(\d+)x(\d+)\.png$/);
  const fw = m ? +m[1] : 0, fh = m ? +m[2] : 0;
  if (!fw) { console.log('no frame size', file); return; }
  const img = decode(fs.readFileSync(path.join(dir, file)));
  const cols = Math.floor(img.w / fw), rows = Math.floor(img.h / fh);
  const factor = Math.max(1, Math.round(Math.max(fw, fh) / 72));
  const out = downscale(img, factor);
  const rel = `fx/${key}.png`;
  fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true });
  fs.writeFileSync(path.join(OUT, rel), encode(out.w, out.h, out.data));
  copied++;
  media.fx[key] = { file: rel, w: out.w, h: out.h, frame: Math.round(fw / factor), fh: Math.round(fh / factor), kind: 'grid', cols, frames: cols * rows };
  console.log('  vfx', key, `${cols}x${rows}=${cols * rows}f @${Math.round(fw / factor)}x${Math.round(fh / factor)}`);
}
// auras / channels (looping)
for (const [k, e] of [['anima', 'Effect_Anima'], ['aura_charged', 'Effect_Charged'], ['aura_constellation', 'Effect_Constellation'],
  ['aura_shield', 'Effect_ElectricShield'], ['aura_ring', 'Effect_EldenRing'], ['aura_vortex', 'Effect_TheVortex'],
  ['aura_wheel', 'Effect_Wheel'], ['aura_worm', 'Effect_Worm'], ['aura_tentacles', 'Effect_Tentacles']])
  vfxPack(k, e);
// impacts / bursts (one-shot)
for (const [k, e] of [['vfx_bighit', 'Effect_BigHit'], ['vfx_smallhit', 'Effect_SmallHit'], ['vfx_impact', 'Effect_Impact'],
  ['vfx_blood', 'Effect_BloodImpact'], ['vfx_explosion', 'Effect_Explosion'], ['vfx_explosion2', 'Effect_Explosion2'],
  ['vfx_kaboom', 'Effect_Kabooms'], ['vfx_magma', 'Effect_Magma'], ['vfx_fire', 'Effect_DitheredFire'],
  ['vfx_pixfire', 'Effect_FastPixelFire'], ['vfx_puffstars', 'Effect_PuffAndStars'], ['vfx_powerchords', 'Effect_PowerChords'],
  ['vfx_hyperspeed', 'Effect_Hyperspeed']])
  vfxPack(k, e);

// Numbered-loose-file icon folders packed into fixed-cell atlases (icon = index)
function atlas(key, dir, prefix, cell = 16, cols = 16) {
  const src = path.join(RAW, dir);
  if (!fs.existsSync(src)) { console.log('MISSING', dir); return; }
  const files = fs.readdirSync(src).filter(f => f.startsWith(prefix) && f.endsWith('.png'))
    .sort((a, b) => parseInt(a.slice(prefix.length)) - parseInt(b.slice(prefix.length)));
  const sheet = makeImage(cols * cell, Math.ceil(files.length / cols) * cell);
  files.forEach((f, i) => {
    const img = decode(fs.readFileSync(path.join(src, f)));
    blit(sheet, (i % cols) * cell + ((cell - img.w) >> 1), Math.floor(i / cols) * cell + ((cell - img.h) >> 1), img);
  });
  const rel = `icons/${key}.png`;
  fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true });
  fs.writeFileSync(path.join(OUT, rel), encode(sheet.w, sheet.h, sheet.data));
  copied++;
  media.sheets[key] = { file: rel, w: sheet.w, h: sheet.h, cell, cols, count: files.length };
  console.log('  atlas', key, files.length, 'cells');
}
atlas('potions_atlas', 'potions', 'potion', 16, 16);
atlas('items_atlas', 'items', 'item', 16, 36);

// Chests (grid sheets), icon packs, item/potion sheets, UI kit, sword icons, geo tiles
media.sheets.chests = cp('Animated Chests/Animated Chests/Chests.png', 'chests/chests.png');
media.sheets.chests_snow = cp('Animated Chests/Animated Chests/Chests_Snow.png', 'chests/chests_snow.png');
media.sheets.items = cp('items/items_sheet.png', 'icons/items_sheet.png');
media.sheets.potions = cp('potions/potions-Sheet.png', 'icons/potions_sheet.png');
media.sheets.icons_full = cp('Icons/Freebies_Full_Icons.png', 'icons/freebies_full.png');
media.sheets.icons_armory = cp('Icons/Freebies_Icons_Armory.png', 'icons/freebies_armory.png');
media.sheets.icons_fishing = cp('Icons/Freebies_Icons_Fishing.png', 'icons/freebies_fishing.png');
media.sheets.icons_botany = cp('Icons/Freebies_Icons_Botany.png', 'icons/freebies_botany.png');
media.sheets.ui_gold = cp('UI Packs/UI Packs/Gold/UI_Gold.png', 'ui/ui_gold.png');
media.sheets.ui_gold_icons = cp('UI Packs/UI Packs/Gold/UI_Gold_Icons_Free.png', 'ui/ui_gold_icons.png');
for (const [k, f] of [['icons_general', 'General'], ['icons_potions', 'Potions'], ['icons_skills', 'Skills'], ['icons_emoticons', 'Emoticons'], ['icons_halloween', 'Halloween'], ['icons_insects', 'Insects'], ['icons_misc', 'Miscellaneous'], ['icons_steampunk', 'Steampunk']])
  media.sheets[k] = { ...cp(`Icons/Freebies_Icons_${f}.png`, `icons/freebies_${f.toLowerCase()}.png`), cell: 32 };

// Geo gem pack: huge 512px-cell sheets — box-downscale so the client ships small
function geoScale(key, rel, factor, cellW, cellH, dest) {
  const p = path.join(RAW, rel);
  if (!fs.existsSync(p)) { console.log('MISSING', rel); return; }
  const img = downscale(decode(fs.readFileSync(p)), factor);
  const out = `dungeon/${dest}.png`;
  fs.mkdirSync(path.dirname(path.join(OUT, out)), { recursive: true });
  fs.writeFileSync(path.join(OUT, out), encode(img.w, img.h, img.data));
  copied++;
  media.sheets[key] = { file: out, w: img.w, h: img.h, cellW: cellW / factor, cellH: cellH / factor, cols: Math.floor(img.w / (cellW / factor)), rows: Math.floor(img.h / (cellH / factor)) };
  console.log('  geo', key, `${img.w}x${img.h} cell ${cellW / factor}x${cellH / factor}`);
}
geoScale('gems', 'Geo node gem pack/512x512 Crystals Transparent.png', 4, 512, 512, 'gems');
geoScale('geo_rocks', 'Geo node gem pack/512x512 Rocks.png', 4, 512, 512, 'geo_rocks');
geoScale('geo_tiles', 'Geo node gem pack/256x192 Tiles.png', 2, 256, 192, 'geo_tiles');
media.sheets.iso_tiles = { ...cp('isometric tileset/spritesheet.png', 'dungeon/iso_tiles.png'), cell: 32 };
media.sheets.raou_tiles = cp('raou_isometric_fantasy/isometric tiles.png', 'dungeon/raou_tiles.png');
// Abyssal undead decor: shadow-baked top-down props scattered in dungeon floors
{
  const usep = 'Abyssal dungeon map assests and tiles/Free-Undead-Tileset-Top-Down-Pixel-Art/PNG/Objects_separately';
  media.sheets.undeadDecor = [];
  for (const [file, tag] of [['Grave_shadow1_1', 'grave'], ['Bones_shadow1_1', 'bones'], ['Dead_tree_shadow1_1', 'dead_tree'], ['Thorn_plant_shadow1_1', 'thorn'], ['Ruin_shadow1_1', 'ruin'], ['Broken_tree_shadow1_1', 'broken_tree'], ['Dead_arm_shadow1_1', 'dead_arm'], ['Rock_shadow1_1', 'rock']]) {
    const e = cp(`${usep}/${file}.png`, `dungeon/undead/${tag}.png`);
    if (e) media.sheets.undeadDecor.push({ ...e, tag });
  }
}
geoScale('geo_objects', 'Geo node gem pack/1024x512 Objects01.png', 4, 1024, 512, 'geo_objects');
// rare sword icons: 40 numbered 32px icons
{
  const dir = path.join(RAW, 'Weapons/Rare swords/1 Icons');
  media.sheets.rareSwords = [];
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort()) {
      const e = cp(`Weapons/Rare swords/1 Icons/${f}`, `icons/swords/${f}`);
      if (e) media.sheets.rareSwords.push(e.file);
    }
  }
  // skill/spell book icons for the UI (painterly 512px icons; without background).
  // All 50 imported; array is 0-based so skillBooks[n-1] is source file n.png.
  media.sheets.skillBooks = [];
  for (let i = 1; i <= 50; i++) {
    const e = cp(`UI Packs/skill book icons/PNG/without background/${i}.png`, `ui/books/${i}.png`);
    media.sheets.skillBooks.push(e ? e.file : null);
  }
}

// ---------------------------------------------------------------------------
// Content metrics: many packs centre a small sprite in a large cell (the bovine
// boar is ~20px of art in a 128px cell). Measure the opaque bbox of the first
// frame so the client can auto-boost tiny sprites and anchor to the real feet.
for (const [key, def] of Object.entries(media.creatures)) {
  const anim = def.anims.idle || Object.values(def.anims)[0];
  if (!anim) continue;
  try {
    const img = decode(fs.readFileSync(path.join(OUT, anim.file)));
    const fw = def.frame;
    const fh = def.kind === 'strips' && !(anim.rows > 1) ? anim.h : fw;
    let x0 = fw, y0 = fh, x1 = -1, y1 = -1;
    for (let y = 0; y < Math.min(fh, img.h); y++) for (let x = 0; x < Math.min(fw, img.w); x++) {
      if (img.data[(y * img.w + x) * 4 + 3] > 40) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (y1 >= 0) def.art = { h: +((y1 - y0 + 1) / fh).toFixed(3), b: +((fh - 1 - y1) / fh).toFixed(3), w: +((x1 - x0 + 1) / fw).toFixed(3) };
  } catch { /* metrics are best-effort */ }
}
console.log('content metrics:', Object.entries(media.creatures).filter(([, d]) => d.art && d.art.h < 0.45).map(([k, d]) => `${k}:${d.art.h}`).join(' '));

fs.mkdirSync(path.join(OUT), { recursive: true });
fs.writeFileSync(path.join(OUT, 'media.json'), JSON.stringify(media, null, 1));
console.log(`copied ${copied} assets; creatures: ${Object.keys(media.creatures).length}; fx: ${Object.keys(media.fx).length}`);
for (const [k, v] of Object.entries(media.creatures)) console.log(' ', k, Object.entries(v.anims).map(([a, m]) => `${a}:${m.frames}f${m.rows > 1 ? '/' + m.rows + 'r' : ''}`).join(' '));

// Item database. Tiered equipment is generated programmatically so stats,
// requirements and paperdoll visuals stay consistent across the ladder.
// vis: { layer, sheet, color } drives the client's LPC sprite compositor.

export const ITEMS = {};
function def(id, o) { ITEMS[id] = { id, stack: false, value: 1, tradeable: true, ...o }; return ITEMS[id]; }

// ---------------------------------------------------------------------------
// Melee metal tiers: level, LPC palette color, value scale
export const METALS = [
  { id: 'copper', name: 'Copper', lvl: 1, color: 'copper', val: 8 },
  { id: 'bronze', name: 'Bronze', lvl: 5, color: 'bronze', val: 20 },
  { id: 'iron', name: 'Iron', lvl: 10, color: 'iron', val: 55 },
  { id: 'steel', name: 'Steel', lvl: 20, color: 'steel', val: 150 },
  { id: 'mithril', name: 'Mithril', lvl: 30, color: 'mithril', val: 380 },   // the navy-blue metal of the deep seams
  { id: 'damasked', name: 'Damasked', lvl: 40, color: 'brass', val: 900 },
  { id: 'silversteel', name: 'Silversteel', lvl: 60, color: 'silver', val: 3800 },
  { id: 'sylvan', name: 'Sylvan-tempered', lvl: 80, color: 'gold', val: 16000 },
];
const T = (lvl) => 4 + lvl; // generic tier stat scale

for (const m of METALS) {
  const s = T(m.lvl);
  // Sylvan-tempered gear carries a living verdant sheen so it can never be
  // mistaken for damasked brass on the battlefield.
  const gl = m.id === 'sylvan' ? '#b8f06a' : undefined;
  // Daggers are rapid stabbing blades: three strikes for every sword swing,
  // lighter base damage and no slash weight, but their point slips armour —
  // `pen` shears a fraction off the target's defence roll.
  def(`${m.id}_dagger`, { name: `${m.name} dagger`, slot: 'weapon', kind: 'dagger', style: 'melee', anim: 'thrust',
    speed: 800, req: { attack: m.lvl }, bonus: { acc: s * 0.55 | 0, str: s * 0.3 | 0, pen: 0.35 }, value: m.val,
    vis: { layer: 'weapon', type: 'dagger', color: m.color, glow: gl } });
  def(`${m.id}_sword`, { name: `${m.name} sword`, slot: 'weapon', kind: 'sword', style: 'melee', anim: 'slash',
    speed: 2400, req: { attack: m.lvl }, bonus: { acc: s, str: s * 0.9 | 0 }, value: m.val * 2,
    vis: { layer: 'weapon', type: 'sword', color: m.color, glow: gl } });
  def(`${m.id}_spear`, { name: `${m.name} spear`, slot: 'weapon', kind: 'spear', style: 'melee', anim: 'thrust',
    speed: 3000, req: { attack: m.lvl, strength: Math.max(1, m.lvl - 2) }, twoHand: true,
    bonus: { acc: s * 1.1 | 0, str: s * 1.25 | 0 }, value: m.val * 2.4 | 0,
    vis: { layer: 'weapon', type: 'spear', color: m.color, glow: gl } });
  // --- PLATE line: the sylvan-style full plate, dyed to every metal tier.
  // Heavier defence than chainmail, and costs more bars at the anvil.
  def(`${m.id}_helm`, { name: `${m.name} full helm`, slot: 'head', req: { defence: m.lvl },
    bonus: { def: s * 0.55 | 0 }, value: m.val * 1.6 | 0,
    vis: { layer: 'head', sheet: 'greathelm', color: m.color, glow: gl } });
  def(`${m.id}_platebody`, { name: `${m.name} platebody`, slot: 'torso', req: { defence: m.lvl },
    bonus: { def: s * 1.25 | 0 }, value: m.val * 3.2 | 0,
    vis: { layer: 'torso', sheet: 'plate', color: m.color, glow: gl } });
  def(`${m.id}_platelegs`, { name: `${m.name} platelegs`, slot: 'legs', req: { defence: m.lvl },
    bonus: { def: s * 0.95 | 0 }, value: m.val * 2.4 | 0,
    vis: { layer: 'legs', sheet: 'plate', color: m.color, glow: gl } });
  def(`${m.id}_boots`, { name: `${m.name} plate boots`, slot: 'feet', req: { defence: m.lvl },
    bonus: { def: s * 0.32 | 0 }, value: m.val,
    vis: { layer: 'feet', sheet: 'armour', color: m.color, glow: gl } });
  def(`${m.id}_gauntlets`, { name: `${m.name} gauntlets`, slot: 'hands', req: { defence: m.lvl },
    bonus: { def: s * 0.28 | 0, str: 1 }, value: m.val,
    vis: { layer: 'hands', sheet: 'gloves', color: m.color, glow: gl } });
  def(`${m.id}_shield`, { name: `${m.name} kite shield`, slot: 'shield', req: { defence: m.lvl },
    bonus: { def: s * 0.8 | 0 }, value: m.val * 1.8 | 0,
    vis: { layer: 'shield', sheet: 'kite', color: m.color, glow: gl } });
  // --- the LPC helmet racks: four further head lines, tint-dyed per tier ---
  def(`${m.id}_armet`, { name: `${m.name} armet`, slot: 'head', req: { defence: m.lvl },
    bonus: { def: s * 0.5 | 0 }, value: m.val * 1.5 | 0,
    vis: { layer: 'head', sheet: 'armet', color: m.color, glow: gl } });
  def(`${m.id}_bascinet`, { name: `${m.name} bascinet`, slot: 'head', req: { defence: m.lvl },
    bonus: { def: s * 0.48 | 0 }, value: m.val * 1.4 | 0,
    vis: { layer: 'head', sheet: 'bascinet', color: m.color, glow: gl } });
  def(`${m.id}_horned_helm`, { name: `${m.name} horned helm`, slot: 'head', req: { defence: m.lvl },
    bonus: { def: s * 0.45 | 0, str: 1 + (s * 0.06 | 0) }, value: m.val * 1.7 | 0,
    vis: { layer: 'head', sheet: 'horned', color: m.color, glow: gl } });
  def(`${m.id}_legion_helm`, { name: `${m.name} legion helm`, slot: 'head', req: { defence: m.lvl },
    bonus: { def: s * 0.5 | 0, acc: 1 + (s * 0.05 | 0) }, value: m.val * 1.7 | 0,
    vis: { layer: 'head', sheet: 'legion', color: m.color, glow: gl } });
  // --- CHAINMAIL line: the mail models, dyed per tier at the compositor (the
  // sheet tints to the metal when no exact palette exists). Lighter, cheaper
  // to craft, a touch less defensive than plate.
  def(`${m.id}_coif`, { name: `${m.name} chainmail hood`, slot: 'head', req: { defence: m.lvl },
    bonus: { def: s * 0.42 | 0 }, value: m.val * 1.1 | 0,
    vis: { layer: 'head', sheet: 'mail', color: m.color, glow: gl } });
  def(`${m.id}_chainbody`, { name: `${m.name} chainmail`, slot: 'torso', req: { defence: m.lvl },
    bonus: { def: s * 1.0 | 0 }, value: m.val * 2.4 | 0,
    vis: { layer: 'torso', sheet: 'chainmail', color: m.color, glow: gl } });
  def(`${m.id}_arrow`, { name: `${m.name} arrow`, slot: 'ammo', stack: true, req: {},
    bonus: { rstr: s * 0.8 | 0 }, value: Math.max(1, m.val / 8 | 0), ammoTier: m.lvl, ammoKind: 'arrow', color: m.color });
  def(`${m.id}_bar`, { name: `${m.name} bar`, stack: false, value: m.val, material: true });
  def(`${m.id}_pickaxe`, { name: `${m.name} pickaxe`, slot: 'weapon', kind: 'pickaxe', style: 'melee', anim: 'slash',
    speed: 3000, req: { attack: Math.max(1, m.lvl - 4) }, tool: 'pickaxe', toolTier: m.lvl,
    bonus: { acc: s * 0.4 | 0, str: s * 0.3 | 0 }, value: m.val * 1.5 | 0,
    vis: { layer: 'weapon', type: 'pickaxe', color: m.color } });
  def(`${m.id}_hatchet`, { name: `${m.name} hatchet`, slot: 'weapon', kind: 'hatchet', style: 'melee', anim: 'slash',
    speed: 2400, req: { attack: Math.max(1, m.lvl - 4) }, tool: 'hatchet', toolTier: m.lvl,
    bonus: { acc: s * 0.45 | 0, str: s * 0.35 | 0 }, value: m.val * 1.5 | 0,
    vis: { layer: 'weapon', type: 'axe', color: m.color } });
}

// ---------------------------------------------------------------------------
// Ranged: bows + leather ladder
export const BOWS = [
  { id: 'shortbow', name: 'Shortbow', lvl: 1, type: 'bow', color: 'normal', val: 12 },
  { id: 'ash_bow', name: 'Ash bow', lvl: 10, type: 'bow', color: 'medium', val: 70 },
  { id: 'yew_bow', name: 'Yew recurve bow', lvl: 40, type: 'recurve', color: 'dark', val: 1000 },
  { id: 'elm_warbow', name: 'Elm warbow', lvl: 60, type: 'great', color: 'medium', val: 4200 },
  { id: 'sherwood_longbow', name: 'Sherwood longbow', lvl: 80, type: 'great', color: 'gold', val: 18000 },
];
for (const b of BOWS) {
  const s = T(b.lvl);
  def(b.id, { name: b.name, slot: 'weapon', kind: 'bow', style: 'ranged', anim: 'shoot', speed: 3000,
    twoHand: true, req: { ranged: b.lvl }, bonus: { racc: s * 1.1 | 0 }, value: b.val, usesAmmo: true, ammoKind: 'arrow',
    vis: { layer: 'weapon', type: b.type, color: b.color } });
}
// Crossbows: slower than bows but hit harder; they fire BOLTS, not arrows.
export const CROSSBOWS = [
  { id: 'crossbow', name: 'Crossbow', lvl: 20, val: 320 },
  { id: 'arbalest', name: 'Arbalest', lvl: 50, val: 2600 },
  { id: 'siege_arbalest', name: 'Siege arbalest', lvl: 75, val: 11000 },
];
for (const cb of CROSSBOWS) {
  const s = T(cb.lvl);
  // Crossbows aim-fire with the thrust pose — the LPC crossbow art lives on the
  // thrust rows, not the (empty) bow-shoot rows, so this keeps it in-hand.
  def(cb.id, { name: cb.name, slot: 'weapon', kind: 'crossbow', style: 'ranged', anim: 'thrust', speed: 3600,
    twoHand: true, req: { ranged: cb.lvl }, bonus: { racc: s * 1.25 | 0, rstr: s * 0.25 | 0 }, value: cb.val,
    usesAmmo: true, ammoKind: 'bolt', vis: { layer: 'weapon', type: 'crossbow', color: 'wood' } });
}
def('crossbow_stock', { name: 'Crossbow stock', value: 40, material: true });
// Maces: crushing melee — hits harder than a sword, a touch less accurate.
// Waraxes: massive two-handed cleavers for the strongest smiths.
for (const m of METALS) {
  const s = T(m.lvl);
  const gl = m.id === 'sylvan' ? '#b8f06a' : undefined;
  def(`${m.id}_mace`, { name: `${m.name} mace`, slot: 'weapon', kind: 'mace', style: 'melee', anim: 'slash',
    speed: 2600, req: { attack: m.lvl }, bonus: { acc: s * 0.85 | 0, str: s * 1.1 | 0 }, value: m.val * 2.2 | 0,
    vis: { layer: 'weapon', type: 'mace', color: m.color, glow: gl } });
  def(`${m.id}_bolts`, { name: `${m.name} bolts`, slot: 'ammo', stack: true, req: {},
    bonus: { rstr: s * 1.05 | 0 }, value: Math.max(1, m.val / 6 | 0), ammoTier: m.lvl, ammoKind: 'bolt', color: m.color });
  if (m.lvl >= 20) def(`${m.id}_waraxe`, { name: `${m.name} waraxe`, slot: 'weapon', kind: 'waraxe', style: 'melee', anim: 'slash',
    speed: 3400, twoHand: true, req: { attack: m.lvl, strength: m.lvl }, bonus: { acc: s * 0.9 | 0, str: s * 1.45 | 0 }, value: m.val * 3.2 | 0,
    vis: { layer: 'weapon', type: 'waraxe', color: m.color, glow: gl } });
  // --- the LPC armoury expansion: six further lines, all metal-tiered ---
  def(`${m.id}_rapier`, { name: `${m.name} rapier`, slot: 'weapon', kind: 'rapier', style: 'melee', anim: 'slash',
    speed: 1600, req: { attack: m.lvl }, bonus: { acc: s * 1.2 | 0, str: s * 0.55 | 0 }, value: m.val * 2.1 | 0,
    vis: { layer: 'weapon', type: 'rapier', color: m.color, glow: gl } });
  def(`${m.id}_longsword`, { name: `${m.name} longsword`, slot: 'weapon', kind: 'longsword', style: 'melee', anim: 'slash',
    speed: 2600, req: { attack: m.lvl }, bonus: { acc: s * 0.95 | 0, str: s * 1.15 | 0 }, value: m.val * 2.6 | 0,
    vis: { layer: 'weapon', type: 'longsword', color: m.color, glow: gl } });
  def(`${m.id}_flail`, { name: `${m.name} flail`, slot: 'weapon', kind: 'flail', style: 'melee', anim: 'slash',
    speed: 2800, req: { attack: m.lvl, strength: Math.max(1, m.lvl - 3) }, bonus: { acc: s * 0.7 | 0, str: s * 1.3 | 0 }, value: m.val * 2.4 | 0,
    vis: { layer: 'weapon', type: 'flail', color: m.color, glow: gl } });
  def(`${m.id}_halberd`, { name: `${m.name} halberd`, slot: 'weapon', kind: 'halberd', style: 'melee', anim: 'thrust',
    speed: 3200, twoHand: true, req: { attack: m.lvl, strength: m.lvl }, bonus: { acc: s * 1.05 | 0, str: s * 1.35 | 0 }, value: m.val * 3 | 0,
    vis: { layer: 'weapon', type: 'halberd', color: m.color, glow: gl } });
  def(`${m.id}_scythe`, { name: `${m.name} scythe`, slot: 'weapon', kind: 'scythe', style: 'melee', anim: 'slash',
    speed: 3000, twoHand: true, req: { attack: m.lvl, strength: Math.max(1, m.lvl - 2) }, bonus: { acc: s * 0.85 | 0, str: s * 1.4 | 0 }, value: m.val * 2.8 | 0,
    vis: { layer: 'weapon', type: 'scythe', color: m.color, glow: gl } });
  def(`${m.id}_trident`, { name: `${m.name} trident`, slot: 'weapon', kind: 'trident', style: 'melee', anim: 'thrust',
    speed: 3000, twoHand: true, req: { attack: m.lvl, strength: Math.max(1, m.lvl - 2) }, bonus: { acc: s * 1.15 | 0, str: s * 1.2 | 0 }, value: m.val * 2.5 | 0,
    vis: { layer: 'weapon', type: 'trident', color: m.color, glow: gl } });
  // --- bladed swords: the former "rare" models, now full metal-tiered lines
  // (glowswords stay unique). Each dyes its LPC model to the tier's colour. ---
  def(`${m.id}_scimitar`, { name: `${m.name} scimitar`, slot: 'weapon', kind: 'scimitar', style: 'melee', anim: 'slash',
    speed: 2000, req: { attack: m.lvl }, bonus: { acc: s * 1.05 | 0, str: s * 0.85 | 0 }, value: m.val * 2.2 | 0,
    vis: { layer: 'weapon', type: 'scimitar', color: m.color, glow: gl } });
  def(`${m.id}_saber`, { name: `${m.name} saber`, slot: 'weapon', kind: 'saber', style: 'melee', anim: 'slash',
    speed: 1700, req: { attack: m.lvl }, bonus: { acc: s * 1.2 | 0, str: s * 0.6 | 0 }, value: m.val * 2.1 | 0,
    vis: { layer: 'weapon', type: 'saber', color: m.color, glow: gl } });
  def(`${m.id}_katana`, { name: `${m.name} katana`, slot: 'weapon', kind: 'katana', style: 'melee', anim: 'slash',
    speed: 2300, req: { attack: m.lvl }, bonus: { acc: s * 1.0 | 0, str: s * 1.05 | 0 }, value: m.val * 2.5 | 0,
    vis: { layer: 'weapon', type: 'katana', color: m.color, glow: gl } });
  def(`${m.id}_broadsword`, { name: `${m.name} broadsword`, slot: 'weapon', kind: 'broadsword', style: 'melee', anim: 'slash',
    speed: 2700, req: { attack: m.lvl }, bonus: { acc: s * 0.9 | 0, str: s * 1.2 | 0 }, value: m.val * 2.7 | 0,
    vis: { layer: 'weapon', type: 'longsword_alt', color: m.color, glow: gl } });
  // the greatsword: a huge two-hander — slow to swing but devastating. Reuses
  // the broad alt-longsword blade scaled up a size (see WEAPON_ALIAS 'greatsword').
  def(`${m.id}_greatsword`, { name: `${m.name} greatsword`, slot: 'weapon', kind: 'greatsword', style: 'melee', anim: 'slash',
    speed: 4200, twoHand: true, req: { attack: m.lvl, strength: m.lvl }, bonus: { acc: s * 1.0 | 0, str: s * 1.75 | 0 }, value: m.val * 3.8 | 0,
    vis: { layer: 'weapon', type: 'greatsword', color: m.color, glow: gl } });
}
// ---------------------------------------------------------------------------
// Wood-and-metal crossbow variants. The stock wood is fixed by the frame —
// ash crossbows, elm arbalests, yew siege arbalests — and the limb metal
// varies: Ash crossbow (I) has iron limbs, Elm arbalest (M) mithril, and so
// on. Each frame draws a size up from the last (crossbow < arbalest < siege).
export const XBOW_FRAMES = [
  { frame: 'crossbow', label: 'crossbow', wood: 'ash', woodColor: 'ashwood', base: 20, size: 'crossbow', stocks: 1 },
  { frame: 'arbalest', label: 'arbalest', wood: 'elm', woodColor: 'elmwood', base: 45, size: 'arbalest', stocks: 1 },
  { frame: 'siege_arbalest', label: 'siege arbalest', wood: 'yew', woodColor: 'yewwood', base: 68, size: 'siege', stocks: 2 },
];
export const XBOW_METALS = [
  { id: 'iron', tag: 'I', lvl: 0, val: 1 }, { id: 'steel', tag: 'S', lvl: 5, val: 2.2 },
  { id: 'mithril', tag: 'M', lvl: 12, val: 5 }, { id: 'silversteel', tag: 'V', lvl: 20, val: 11 },
  { id: 'sylvan', tag: 'Y', lvl: 28, val: 24 },
];
for (const f of XBOW_FRAMES) for (const mm of XBOW_METALS) {
  const lvl = f.base + mm.lvl;
  if (lvl > 96) continue;
  const s = T(lvl);
  def(`${f.wood}_${f.frame}_${mm.tag.toLowerCase()}`, {
    name: `${f.wood[0].toUpperCase() + f.wood.slice(1)} ${f.label} (${mm.tag})`,
    slot: 'weapon', kind: 'crossbow', style: 'ranged', anim: 'thrust', speed: 3600, twoHand: true,
    req: { ranged: lvl }, bonus: { racc: s * 1.25 | 0, rstr: s * 0.3 | 0 }, usesAmmo: true, ammoKind: 'bolt',
    value: Math.round(120 * mm.val * (f.stocks + lvl / 25)),
    vis: { layer: 'weapon', type: f.size, color: f.woodColor, metal: mm.id, glow: mm.id === 'sylvan' ? '#b8f06a' : undefined },
  });
}

export const LEATHERS = [
  { id: 'leather', name: 'Leather', lvl: 1, color: 'brown', val: 10 },
  { id: 'studded', name: 'Studded leather', lvl: 20, color: 'charcoal', val: 160, fx: 'studs' },  // riveted studs show in-world
  { id: 'ranger', name: 'Ranger', lvl: 45, color: 'forest', val: 1300 },
  { id: 'lincoln', name: 'Lincoln green', lvl: 70, color: 'green', val: 7000 },
];
for (const L of LEATHERS) {
  const s = T(L.lvl);
  def(`${L.id}_coif`, { name: `${L.name} coif`, slot: 'head', req: { ranged: L.lvl, defence: Math.max(1, L.lvl - 5) },
    bonus: { def: s * 0.3 | 0, racc: s * 0.2 | 0 }, value: L.val,
    vis: { layer: 'head', sheet: 'hood', color: L.color, fx: L.fx } });
  def(`${L.id}_body`, { name: `${L.name} body`, slot: 'torso', req: { ranged: L.lvl, defence: Math.max(1, L.lvl - 5) },
    bonus: { def: s * 0.7 | 0, racc: s * 0.4 | 0 }, value: L.val * 2.6 | 0,
    vis: { layer: 'torso', sheet: 'leather', color: L.color, fx: L.fx } });
  def(`${L.id}_chaps`, { name: `${L.name} chaps`, slot: 'legs', req: { ranged: L.lvl, defence: Math.max(1, L.lvl - 5) },
    bonus: { def: s * 0.5 | 0, racc: s * 0.25 | 0 }, value: L.val * 2,
    vis: { layer: 'legs', sheet: 'pants', color: L.color, fx: L.fx } });
}
// ---------------------------------------------------------------------------
// Premium ranger armour — the end-game kit an archer grinds for. A gold-trimmed
// studded set, then the dragonhide line: dyed hide with an in-world glow and
// vambraces that push ranged accuracy hard (the ranger's signature bonus).
// Each set is coif + body + chaps + vambraces.
// Dragonhide reads as SCALES in-world (fx pattern stitched over the hide);
// the aethereal set adds a spectral aura on top of its glow.
export const DHIDES = [
  { id: 'sylvan_trimmed', name: 'Sylvan-trimmed', lvl: 40, color: 'charcoal', glow: '#e8c84e', val: 3200, fx: 'studs' },
  { id: 'blue_dragonhide', name: 'Blue dragonhide', lvl: 50, color: 'blue', glow: '#4aa0e0', val: 9000, hide: 'blue_dragon_leather', fx: 'scales' },
  { id: 'green_dragonhide', name: 'Green dragonhide', lvl: 60, color: 'forest', glow: '#3fbf6a', val: 17000, hide: 'green_dragon_leather', fx: 'scales' },
  { id: 'red_dragonhide', name: 'Red dragonhide', lvl: 72, color: 'red', glow: '#e0503a', val: 30000, hide: 'red_dragon_leather', fx: 'scales' },
  { id: 'aethereal_dragonhide', name: 'Aethereal dragonhide', lvl: 85, color: 'white', glow: '#bfeaff', val: 68000, hide: 'aethereal_dragon_leather', unique: true, fx: 'scales', aura: true },
];
for (const D of DHIDES) {
  const s = T(D.lvl), req = { ranged: D.lvl, defence: Math.max(1, D.lvl - 8) };
  const gl = D.glow, u = D.unique, fx = D.fx;
  def(`${D.id}_coif`, { name: `${D.name} coif`, slot: 'head', req, unique: u,
    bonus: { def: s * 0.35 | 0, racc: s * 0.4 | 0 }, value: D.val,
    vis: { layer: 'head', sheet: 'hood', color: D.color, glow: gl, fx, aura: D.aura } });
  def(`${D.id}_body`, { name: `${D.name} body`, slot: 'torso', req, unique: u,
    bonus: { def: s * 0.8 | 0, racc: s | 0 }, value: D.val * 3 | 0,
    vis: { layer: 'torso', sheet: 'leather', color: D.color, glow: gl, fx, aura: D.aura } });
  def(`${D.id}_chaps`, { name: `${D.name} chaps`, slot: 'legs', req, unique: u,
    bonus: { def: s * 0.5 | 0, racc: s * 0.6 | 0 }, value: D.val * 2 | 0,
    vis: { layer: 'legs', sheet: 'pants', color: D.color, glow: gl, fx, aura: D.aura } });
  def(`${D.id}_vambraces`, { name: `${D.name} vambraces`, slot: 'hands', req, unique: u,
    bonus: { def: s * 0.22 | 0, racc: s * 0.75 | 0 }, value: D.val * 0.8 | 0,
    vis: { layer: 'hands', sheet: 'gloves', color: D.color, glow: gl, fx, aura: D.aura } });
}
// Dragon leathers: tanned into hide only the mightiest beasts yield.
def('blue_dragon_leather', { name: 'Blue dragon leather', value: 1500, material: true });
def('green_dragon_leather', { name: 'Green dragon leather', value: 2800, material: true });
def('red_dragon_leather', { name: 'Red dragon leather', value: 5200, material: true });
def('aethereal_dragon_leather', { name: 'Aethereal dragon leather', value: 11000, material: true, unique: true });

def('leather_boots', { name: 'Leather boots', slot: 'feet', req: {}, bonus: { def: 1 }, value: 8,
  vis: { layer: 'feet', sheet: 'boots', color: 'brown' } });
def('quiver', { name: 'Quiver', slot: 'cape', req: {}, bonus: { racc: 2 }, value: 30,
  vis: { layer: 'behind', sheet: 'quiver', color: 'brown' } });
// Cloth headwear from the LPC racks
def('bandana', { name: 'Bandana', slot: 'head', req: {}, bonus: { def: 1 }, value: 6,
  vis: { layer: 'head', sheet: 'bandana', color: 'brown' } });
def('leather_cap', { name: 'Leather cap', slot: 'head', req: {}, bonus: { def: 2 }, value: 12,
  vis: { layer: 'head', sheet: 'leather_cap', color: 'brown' } });
// ---------------------------------------------------------------------------
// Cosmetic wings & tails — cape-slot vanity that rides the behind layer.
export const COSMETIC_BACKS = [
  ['angelic_wings', 'Angelic wings', 'wings_feathered', 'white', 5200],
  ['raven_wings', 'Raven wings', 'wings_feathered', 'black', 5200],
  ['azure_wings', 'Azure wings', 'wings_feathered', 'blue', 5200],
  ['bat_wings', 'Bat wings', 'wings_bat', 'black', 4200],
  ['blood_bat_wings', 'Blood-bat wings', 'wings_bat', 'red', 4600],
  ['wolf_tail', 'Wolf tail', 'tail_wolf', 'gray', 900],
  ['cat_tail', 'Cat tail', 'tail_cat', 'black', 900],
  ['fox_tail', 'Fox brush', 'tail_fluffy', 'chestnut', 1100],
];
for (const [id, name, sheet, color, val] of COSMETIC_BACKS)
  def(id, { name, slot: 'cape', req: {}, bonus: {}, value: val,
    vis: { layer: 'behind', sheet, color } });

// ---------------------------------------------------------------------------
// Magic: staves + robe sets + runes
// Each staff is crowned with its focus crystal (gem) — shown in the icon AND
// on the in-world model as a glowing orb at the staff head.
export const STAVES = [
  { id: 'apprentice_staff', name: 'Apprentice staff', lvl: 1, color: 'light', val: 15, gem: '#7ac8f0' },
  { id: 'friar_staff', name: "Friar's staff", lvl: 20, color: 'medium', val: 220, gem: '#ffd75e' },
  { id: 'druid_staff', name: 'Druidic staff', lvl: 50, color: 'gnarled', val: 2200, gem: '#5aa03c' },
  { id: 'archdruid_staff', name: 'Archdruid staff', lvl: 75, color: 'gold', val: 12000, gem: '#c77ce7' },
];
for (const st of STAVES) {
  const s = T(st.lvl);
  def(st.id, { name: st.name, slot: 'weapon', kind: 'staff', style: 'magic', anim: 'spellcast', speed: 3000,
    twoHand: true, req: { magic: st.lvl }, bonus: { macc: s * 1.1 | 0, mdmg: s * 0.3 | 0 }, value: st.val,
    vis: { layer: 'weapon', type: 'staff', color: st.color, glow: st.gem } });
}
// Mage vestments, reworked: each order dresses distinctly — novice in plain
// blue cloth, friars in humble walnut wool, druids in rune-stitched forest
// green, and the archdruid in white silk shot through with living runes and
// an arcane shimmer. Runes render as a stitched fx pattern on the cloth.
export const ROBES = [
  { id: 'novice', name: 'Novice', lvl: 1, color: 'blue', val: 12 },
  { id: 'friar', name: "Friar's", lvl: 20, color: 'walnut', val: 200, prayerReq: 10 },
  { id: 'druidic', name: 'Druidic', lvl: 50, color: 'forest', val: 2000, prayerReq: 30, fx: 'runes' },
  { id: 'archdruid', name: 'Archdruid', lvl: 75, color: 'white', val: 11000, prayerReq: 50, fx: 'runes', glow: '#c77ce7' },
];
for (const R of ROBES) {
  const s = T(R.lvl); const req = { magic: R.lvl }; if (R.prayerReq) req.prayer = R.prayerReq;
  def(`${R.id}_hood`, { name: `${R.name} hood`, slot: 'head', req, bonus: { macc: s * 0.25 | 0 }, value: R.val,
    vis: { layer: 'head', sheet: 'hood', color: R.color, fx: R.fx, glow: R.glow } });
  def(`${R.id}_robe_top`, { name: `${R.name} robe top`, slot: 'torso', req, bonus: { macc: s * 0.5 | 0, def: s * 0.15 | 0 }, value: R.val * 2.5 | 0,
    vis: { layer: 'torso', sheet: 'robe', color: R.color, fx: R.fx, glow: R.glow } });
  def(`${R.id}_robe_skirt`, { name: `${R.name} robe skirt`, slot: 'legs', req, bonus: { macc: s * 0.35 | 0 }, value: R.val * 2,
    vis: { layer: 'legs', sheet: 'pants', color: R.color, fx: R.fx, glow: R.glow } });
}
export const RUNES = ['air', 'earth', 'water', 'fire', 'nature', 'cosmic', 'blood'];
for (const r of RUNES) def(`${r}_rune`, { name: `${r[0].toUpperCase() + r.slice(1)} rune`, stack: true, value: { air: 4, earth: 4, water: 4, fire: 5, nature: 12, cosmic: 20, blood: 35 }[r] });
def('rune_essence', { name: 'Rune essence', stack: true, value: 2 });

// ---------------------------------------------------------------------------
// Peasant / starter clothes (visual only)
def('peasant_shirt', { name: 'Peasant shirt', slot: 'torso', req: {}, bonus: {}, value: 2,
  vis: { layer: 'torso', sheet: 'longsleeve', color: 'white' } });
def('outlaw_tunic', { name: 'Outlaw tunic', slot: 'torso', req: {}, bonus: { def: 1 }, value: 5,
  vis: { layer: 'torso', sheet: 'tunic', color: 'green' } });
def('peasant_trousers', { name: 'Peasant trousers', slot: 'legs', req: {}, bonus: {}, value: 2,
  vis: { layer: 'legs', sheet: 'pants', color: 'brown' } });

// ---------------------------------------------------------------------------
// Gathering resources
export const ORES = [
  { id: 'copper_ore', lvl: 1, xp: 18, val: 4 }, { id: 'tin_ore', lvl: 1, xp: 18, val: 4 },
  { id: 'iron_ore', lvl: 15, xp: 35, val: 18 }, { id: 'coal', lvl: 30, xp: 50, val: 45 },
  { id: 'silver_ore', lvl: 40, xp: 65, val: 90 }, { id: 'mithril_ore', lvl: 45, xp: 72, val: 120 },
  { id: 'gold_ore', lvl: 55, xp: 85, val: 160 },
  { id: 'sylvanite_ore', lvl: 80, xp: 140, val: 700 },
];
for (const o of ORES) def(o.id, { name: o.id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), stack: false, value: o.val, material: true });
export const GEMS = [
  { id: 'sapphire', lvl: 20, val: 120 }, { id: 'emerald', lvl: 35, val: 260 },
  { id: 'ruby', lvl: 50, val: 550 }, { id: 'diamond', lvl: 70, val: 1500 },
];
for (const g of GEMS) def(g.id, { name: g.id[0].toUpperCase() + g.id.slice(1), value: g.val, material: true });
// Geode-node gems (mined from wandering gem geodes) + icon cells on the gem sheet
def('citrine', { name: 'Citrine', value: 350, material: true, micon: ['gems', 12, 2] });
def('amethyst', { name: 'Amethyst', value: 800, material: true, micon: ['gems', 12, 1] });
ITEMS.sapphire.micon = ['gems', 12, 3]; ITEMS.emerald.micon = ['gems', 12, 0];
ITEMS.ruby.micon = ['gems', 12, 5]; ITEMS.diamond.micon = ['gems', 12, 4];
def('abyssal_pearl', { name: 'Abyssal pearl', value: 5200, material: true, micon: ['gems', 6, 6] });

export const LOGS = [
  { id: 'logs', tree: 'Ash tree', lvl: 1, xp: 25, val: 3, fm: 1, fmxp: 40 },
  { id: 'oak_logs', tree: 'Oak', lvl: 15, xp: 38, val: 12, fm: 15, fmxp: 60 },
  { id: 'willow_logs', tree: 'Willow', lvl: 30, xp: 68, val: 25, fm: 30, fmxp: 90 },
  { id: 'maple_logs', tree: 'Maple', lvl: 45, xp: 100, val: 55, fm: 45, fmxp: 135 },
  { id: 'yew_logs', tree: 'Yew', lvl: 60, xp: 175, val: 160, fm: 60, fmxp: 200 },
  { id: 'elm_logs', tree: 'Great elm', lvl: 75, xp: 250, val: 380, fm: 75, fmxp: 300 },
  { id: 'frostpine_logs', tree: 'Frostpine', lvl: 90, xp: 380, val: 900, fm: 90, fmxp: 450 },
];
for (const l of LOGS) def(l.id, { name: l.id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), value: l.val, material: true });

export const FISH = [
  { id: 'perch', lvl: 1, xp: 20, cookLvl: 1, cookXp: 30, heal: 3, val: 4, spot: 'net' },
  { id: 'trout', lvl: 15, xp: 45, cookLvl: 15, cookXp: 60, heal: 7, val: 15, spot: 'rod' },
  { id: 'salmon', lvl: 30, xp: 70, cookLvl: 25, cookXp: 90, heal: 11, val: 38, spot: 'rod' },
  { id: 'pike', lvl: 40, xp: 90, cookLvl: 35, cookXp: 110, heal: 14, val: 70, spot: 'rod' },
  { id: 'eel', lvl: 55, xp: 120, cookLvl: 50, cookXp: 150, heal: 18, val: 140, spot: 'net' },
  { id: 'sturgeon', lvl: 70, xp: 180, cookLvl: 65, cookXp: 210, heal: 23, val: 330, spot: 'harpoon' },
  { id: 'frost_cod', lvl: 85, xp: 260, cookLvl: 80, cookXp: 300, heal: 28, val: 720, spot: 'harpoon' },
];
for (const f of FISH) {
  const nm = f.id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  def(`raw_${f.id}`, { name: `Raw ${nm.toLowerCase()}`, value: f.val, material: true });
  def(`cooked_${f.id}`, { name: nm, value: f.val * 1.6 | 0, food: true, heal: f.heal });
  def(`burnt_${f.id}`, { name: `Burnt ${nm.toLowerCase()}`, value: 1 });
}
def('bread', { name: 'Bread', value: 6, food: true, heal: 4 });
def('venison', { name: 'Roast venison', value: 60, food: true, heal: 12 });
def('hearty_stew', { name: 'Hearty stew', value: 120, food: true, heal: 16 });

// Herblore
export const HERBS = [
  { id: 'nettle', lvl: 1, cleanXp: 10, val: 5 }, { id: 'yarrow', lvl: 10, cleanXp: 15, val: 12 },
  { id: 'comfrey', lvl: 25, cleanXp: 25, val: 30 }, { id: 'wolfsbane', lvl: 40, cleanXp: 40, val: 75 },
  { id: 'mandrake', lvl: 55, cleanXp: 60, val: 160 }, { id: 'frostwort', lvl: 70, cleanXp: 85, val: 340 },
  { id: 'kingsfoil', lvl: 85, cleanXp: 120, val: 800 },
];
for (const h of HERBS) {
  const nm = h.id[0].toUpperCase() + h.id.slice(1);
  def(`grimy_${h.id}`, { name: `Grimy ${h.id}`, value: h.val * 0.6 | 0, material: true });
  def(`clean_${h.id}`, { name: nm, value: h.val, material: true });
}
def('vial_water', { name: 'Vial of water', stack: true, value: 2 });
export const POTIONS = [
  { id: 'attack_potion', name: 'Attack potion', lvl: 3, herb: 'nettle', xp: 25, boost: { attack: 3 }, val: 20, icon: 1 },
  { id: 'strength_potion', name: 'Strength potion', lvl: 12, herb: 'yarrow', xp: 40, boost: { strength: 3 }, val: 40, icon: 4 },
  { id: 'defence_potion', name: 'Defence potion', lvl: 27, herb: 'comfrey', xp: 65, boost: { defence: 4 }, val: 80, icon: 7 },
  { id: 'ranging_potion', name: 'Ranging potion', lvl: 42, herb: 'wolfsbane', xp: 95, boost: { ranged: 4 }, val: 150, icon: 10 },
  { id: 'magic_potion', name: 'Magic potion', lvl: 57, herb: 'mandrake', xp: 130, boost: { magic: 4 }, val: 280, icon: 13 },
  { id: 'prayer_restore', name: 'Prayer restore', lvl: 68, herb: 'frostwort', xp: 170, restore: 'prayer', val: 450, icon: 16 },
  { id: 'kings_elixir', name: "King's elixir", lvl: 85, herb: 'kingsfoil', xp: 260, boost: { attack: 5, strength: 5, defence: 5 }, val: 1200, icon: 19 },
  { id: 'titan_brew', name: 'Titan brew', lvl: 78, herb: 'frostwort', xp: 210, boost: { attack: 6, strength: 6 }, val: 800, icon: 100 },
  { id: 'sage_elixir', name: 'Sage elixir', lvl: 90, herb: 'kingsfoil', xp: 320, boost: { magic: 7 }, restore: 'prayer', val: 1600, icon: 25 },
];
for (const p of POTIONS) def(p.id, { name: p.name, value: p.val, potion: true, boost: p.boost, restore: p.restore, micon: ['potions_atlas', p.icon] });

// Farming
export const CROPS = [
  { id: 'potato', lvl: 1, xp: 30, growMs: 60000, yield: 3, val: 3 },
  { id: 'cabbage', lvl: 8, xp: 45, growMs: 80000, yield: 3, val: 6 },
  { id: 'barley', lvl: 18, xp: 70, growMs: 100000, yield: 4, val: 12 },
  { id: 'flax', lvl: 30, xp: 100, growMs: 120000, yield: 4, val: 20 },
  { id: 'yarrow_seed_crop', lvl: 40, xp: 140, growMs: 150000, yield: 2, val: 0, herb: 'yarrow' },
  { id: 'wolfsbane_crop', lvl: 55, xp: 200, growMs: 180000, yield: 2, val: 0, herb: 'wolfsbane' },
  { id: 'mandrake_crop', lvl: 70, xp: 290, growMs: 220000, yield: 2, val: 0, herb: 'mandrake' },
  { id: 'kingsfoil_crop', lvl: 85, xp: 420, growMs: 260000, yield: 2, val: 0, herb: 'kingsfoil' },
];
for (const c of CROPS) {
  c.seed = `${c.herb || c.id}_seed`;
  def(c.seed, { name: `${(c.herb || c.id).replace(/\b\w/g, s => s.toUpperCase())} seed`, stack: true, value: Math.max(2, c.val) });
  if (!c.herb) def(c.id, { name: c.id[0].toUpperCase() + c.id.slice(1), value: c.val, food: c.id !== 'flax', heal: 2, material: true });
}
def('flax', { name: 'Flax', value: 20, material: true });
def('bowstring', { name: 'Bowstring', value: 30, material: true });

// Crafting / leather
def('cow_hide', { name: 'Cow hide', value: 10, material: true });
def('soft_leather', { name: 'Soft leather', value: 18, material: true });
def('gold_amulet', { name: 'Gold amulet', slot: 'neck', req: {}, bonus: { acc: 2, racc: 2, macc: 2 }, value: 350 });
for (const g of GEMS) def(`${g.id}_amulet`, { name: `${g.id[0].toUpperCase() + g.id.slice(1)} amulet`, slot: 'neck', req: {},
  bonus: { acc: 3 + g.lvl / 10 | 0, str: 2 + g.lvl / 14 | 0, macc: 3 + g.lvl / 10 | 0, racc: 3 + g.lvl / 10 | 0 }, value: g.val * 3 });

// Fletching
def('arrow_shafts', { name: 'Arrow shafts', stack: true, value: 1 });
def('feathers', { name: 'Feathers', stack: true, value: 2 });
// hunter plumes + fowl (LPC birds/turkey pass)
def('songbird_plume', { name: 'Songbird plume', stack: true, value: 14 });
def('raven_plume', { name: 'Raven plume', stack: true, value: 36 });
def('eagle_plume', { name: 'Eagle plume', stack: true, value: 90 });
def('raw_fowl', { name: 'Raw fowl', value: 6 });
def('cooked_fowl', { name: 'Roast fowl', value: 14, heals: 6 });
def('headless_arrows', { name: 'Headless arrows', stack: true, value: 2 });

// Prayer
def('bones', { name: 'Bones', value: 2, bones: true, prayerXp: 15 });
def('big_bones', { name: 'Big bones', value: 20, bones: true, prayerXp: 45 });
def('ancient_bones', { name: 'Ancient bones', value: 200, bones: true, prayerXp: 140 });

// Summoning
def('spirit_shard', { name: 'Spirit shards', stack: true, value: 6 });
export const CHARMS = ['verdant_charm', 'amber_charm', 'cobalt_charm', 'crimson_charm'];
for (const c of CHARMS) def(c, { name: c.replace(/_/g, ' ').replace(/\b\w/g, s => s.toUpperCase()), stack: true, value: 40 });

// Pets — tradable on the Grand Exchange until claimed; claiming binds them to
// the player forever (they move into the pet roster and leave the item world).
import { PETS } from './pets.js';
for (const [pid, p] of Object.entries(PETS))
  def(`pet_${pid}`, { name: `Pet: ${p.name}`, pet: pid, tradeable: true, value: 800 * p.tier * p.tier, unique: p.tier >= 5 });

// Summoning pouches (usable: summons the familiar)
for (const p of ['wolf_pup', 'hawk', 'boar', 'bear', 'stag', 'dire_wolf', 'guardian'])
  def(`${p}_pouch`, { name: `${p.replace(/_/g, ' ').replace(/\b\w/g, s => s.toUpperCase())} pouch`, value: 150, pouch: true });

// Hunter
def('box_trap', { name: 'Box trap', value: 12 });
def('rabbit_fur', { name: 'Rabbit fur', value: 8, material: true });
def('fox_fur', { name: 'Fox fur', value: 45, material: true });
def('wolf_pelt', { name: 'Wolf pelt', value: 130, material: true });
def('sable_pelt', { name: 'Sable pelt', value: 420, material: true });
def('raw_venison', { name: 'Raw venison', value: 25, material: true });

// Archaeology
export const ARTEFACTS = [
  { id: 'roman_coin', lvl: 1, xp: 60, val: 30 }, { id: 'saxon_brooch', lvl: 20, xp: 140, val: 120 },
  { id: 'druid_idol', lvl: 40, xp: 260, val: 400 }, { id: 'norman_seal', lvl: 60, xp: 420, val: 1100 },
  { id: 'grail_fragment', lvl: 80, xp: 700, val: 4000 },
];
for (const a of ARTEFACTS) {
  def(`damaged_${a.id}`, { name: `Damaged ${a.id.replace(/_/g, ' ')}`, value: a.val / 3 | 0, material: true });
  def(a.id, { name: a.id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), value: a.val, material: true });
}

// Tools (non-weapon)
for (const t of ['small_fishing_net', 'fishing_rod', 'harpoon', 'tinderbox', 'knife', 'hammer', 'chisel', 'needle', 'spade', 'trowel', 'secateurs', 'bucket', 'shears'])
  def(t, { name: t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), value: 5, tool: t });

// Farm produce (from milking cows/sheep and shearing sheep/alpacas)
def('milk', { name: 'Bucket of milk', value: 12, material: true });
def('wool', { name: 'Wool', stack: true, value: 8, material: true });
def('alpaca_wool', { name: 'Llama wool', stack: true, value: 22, material: true });   // id kept for saves; the herd is llamas now
def('cheese', { name: 'Cheese', value: 30, food: true, heal: 6 });
def('ball_of_wool', { name: 'Ball of wool', stack: true, value: 14, material: true });
def('fishing_bait', { name: 'Fishing bait', stack: true, value: 1 });

// Currency & tokens
def('coins', { name: 'Copper coins', stack: true, value: 1, tradeable: true, examine: 'Shiny copper coins — spend them, or trade them for $LoS on the Exchange.' });
// $LoS never exists in inventory — ground pickups credit the ledger directly.

// Keys & misc
def('dungeon_key', { name: 'Abyssal key', value: 0, tradeable: false });
def('marians_letter', { name: "Marian's letter", value: 0, tradeable: false, quest: true });
def('johns_whistle', { name: "John's carved whistle", value: 0, tradeable: false, quest: true, examine: 'A boy\'s whittling — the note still carries.' });
def('scarlet_cloak', { name: 'Scarlet cloak', value: 0, tradeable: false, quest: true, examine: 'Dyed madder-red by Maud of Blidworth.' });
def('aldwins_letter', { name: "Aldwin's letter", value: 0, tradeable: false, quest: true, examine: 'Flour-dusted words from uncle to nephew.' });
def('convoy_strongbox', { name: 'Convoy strongbox', value: 0, tradeable: false, quest: true });

// ---------------------------------------------------------------------------
// Rare swords: named boss-drop blades with painted icons (Weapons/Rare swords).
// [id, name, attack lvl, icon idx, 2H?, LPC model, model colour]
// Every rare blade wields the LPC model its ICON depicts: scimitars, sabers,
// katanas, alt-longsword greatblades and native blue/red energy glowswords —
// single-finish models tint to the blade's colour, glowswords use theirs.
export const RARE_SWORDS = [
  ['blade_of_the_burrow', 'Blade of the Burrow', 20, 1, 0, 'saber', 'tide'],
  ['tidebreaker_cutlass', 'Tidebreaker cutlass', 30, 6, 0, 'longsword', 'tide'],
  ['fanged_ripper', 'Fanged ripper', 40, 11, 0, 'scimitar', 'venom'],
  ['gollux_greatblade', 'Gollux greatblade', 50, 14, 1, 'longsword_alt', 'steel'],
  ['glacier_edge', 'Glacier edge', 55, 25, 0, 'glowsword', 'blue'],
  ['tyrants_cleaver', "Tyrant's cleaver", 65, 39, 1, 'scimitar', 'ember'],
  ['rexfang_saber', 'Rexfang saber', 72, 27, 0, 'longsword', 'ember'],
  ['abyssal_edge', 'Abyssal edge', 78, 34, 0, 'glowsword', 'abyss'],
  ['aracnyx_talon', 'Aracnyx talon', 82, 4, 0, 'katana', 'venom'],
  ['glacial_reaver', 'Glacial reaver', 86, 29, 1, 'glowsword', 'blue'],
  ['hellrender', 'Hellrender', 92, 8, 1, 'glowsword', 'red'],
  ['dragonbane_greatsword', 'Dragonbane greatsword', 95, 20, 1, 'greatsword', 'gold'],
];
// A signature aura colour per rare blade so each reads as its own weapon.
const SWORD_GLOW = {
  blade_of_the_burrow: '#5fa8dc', tidebreaker_cutlass: '#5fa8dc', fanged_ripper: '#7fe07f',
  gollux_greatblade: '#dfe6f0', glacier_edge: '#8fe0ff', tyrants_cleaver: '#ff8a3a',
  rexfang_saber: '#ffb14a', abyssal_edge: '#c05aff', aracnyx_talon: '#7fe07f',
  glacial_reaver: '#9fe8ff', hellrender: '#ff4a2a', dragonbane_greatsword: '#ffd75e',
};
for (const [id, name, lvl, icon, twoHand, model, color] of RARE_SWORDS) {
  const s = T(lvl);
  def(id, { name, slot: 'weapon', kind: 'sword', style: 'melee', anim: 'slash',
    speed: twoHand ? 2800 : 2200, twoHand: !!twoHand, req: { attack: lvl },
    bonus: { acc: Math.round(s * (twoHand ? 1.15 : 1.25)), str: Math.round(s * (twoHand ? 1.5 : 1.1)) },
    value: 900 + lvl * lvl * 6, unique: lvl >= 78, micon: ['rareSwords', icon],
    vis: { layer: 'weapon', type: model, color, glow: SWORD_GLOW[id] } });
}

// Skill tomes: rare boss/chest drops; reading one grants a burst of XP.
export const TOME_SKILLS = ['attack', 'strength', 'defence', 'constitution', 'ranged', 'magic', 'prayer', 'summoning',
  'mining', 'fishing', 'woodcutting', 'farming', 'hunter', 'archaeology', 'smithing', 'cooking', 'crafting', 'herblore'];
TOME_SKILLS.forEach((sk, i) => def(`tome_${sk}`, {
  name: `Tome of ${sk[0].toUpperCase() + sk.slice(1)}`, value: 2600, tome: sk, micon: ['skillBooks', i],
}));

// ---------------------------------------------------------------------------
// Auras: purely cosmetic equipment — a looping elemental FX around the wearer.
// Auras now use the VFX Free Pack looping effects, tinted to their element.
// aura field: { fx: media.fx key, tint: recolour }.
export const AURAS = [
  ['aura_ember', 'Ember Aura', 'vfx_fire', '#ff7a2a', 4000],
  ['aura_frost', 'Frost Aura', 'aura_shield', '#7ac8f0', 4000],
  ['aura_verdant', 'Verdant Aura', 'aura_charged', '#6fc04a', 6500],
  ['aura_royal', 'Royal Aura', 'aura_ring', '#e8c84e', 14000],
  ['aura_blood', 'Blood Aura', 'aura_vortex', '#e0304a', 14000],
  ['aura_spectral', 'Spectral Aura', 'aura_constellation', '#c08aff', 24000],
  ['aura_storm', 'Storm Aura', 'aura_wheel', '#9fd8ef', 20000],
  ['aura_void', 'Void Aura', 'aura_tentacles', '#8a5cff', 30000],
];
for (const [id, name, fx, tint, val] of AURAS) def(id, { name, slot: 'aura', aura: { fx, tint }, value: val, req: {} });

// Mounts: +travel speed scaling with rarity. Flyers cross water and low
// obstructions but give up a little pace versus ground mounts of their tier.
export const MOUNTS = [
  ['war_boar', 'War boar', 0.5, 0, 'tusked_boar', 3200],
  ['swift_stag', 'Swift stag', 0.65, 0, 'wild_reindeer', 12000],
  ['gilded_stag', 'Gilded stag', 0.8, 0, 'wild_reindeer', 42000, 'gold'],
  ['gloom_glider', 'Gloom glider', 0.4, 1, 'gloom_moth', 8000],
  ['royal_skywing', 'Royal skywing', 0.55, 1, 'royal_moth', 26000],
  ['sky_screecher', 'Sky screecher', 0.7, 1, 'archeopteryx', 48000],
];
for (const [id, name, speed, fly, sheet, val, tint] of MOUNTS)
  def(id, { name, slot: 'mount', mount: { speed, fly: !!fly, sheet, tint }, value: val, req: {} });

// Unique boss drops
def('sheriffs_blade', { name: "The Sheriff's blade", slot: 'weapon', kind: 'sword', style: 'melee', anim: 'slash',
  speed: 2200, req: { attack: 70 }, bonus: { acc: 92, str: 88 }, value: 45000, unique: true,
  vis: { layer: 'weapon', type: 'rapier', color: 'gold', glow: '#ffe27a' } });   // the Sheriff duels with a gilded rapier
def('gisbornes_cowl', { name: "Gisborne's cowl", slot: 'head', req: { ranged: 70 }, bonus: { def: 30, racc: 34 }, value: 38000, unique: true,
  vis: { layer: 'head', sheet: 'hood', color: 'black' } });
def('fenwyrm_scale', { name: 'Fenwyrm scale', value: 9000, material: true, unique: true });
def('trollkings_crown', { name: "Troll King's crown", slot: 'head', req: { defence: 75 }, bonus: { def: 40, str: 6 }, value: 52000, unique: true,
  vis: { layer: 'head', sheet: 'greathelm', color: 'gold' } });
def('frostgiant_heart', { name: 'Frost giant heart', value: 15000, material: true, unique: true });
def('elder_heartwood', { name: 'Elder heartwood', value: 12000, material: true, unique: true });

export function itemName(id) { return ITEMS[id] ? ITEMS[id].name : id; }

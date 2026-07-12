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
  { id: 'damasked', name: 'Damasked', lvl: 40, color: 'brass', val: 900 },
  { id: 'silversteel', name: 'Silversteel', lvl: 60, color: 'silver', val: 3800 },
  { id: 'sylvan', name: 'Sylvan-tempered', lvl: 80, color: 'gold', val: 16000 },
];
const T = (lvl) => 4 + lvl; // generic tier stat scale

for (const m of METALS) {
  const s = T(m.lvl);
  def(`${m.id}_dagger`, { name: `${m.name} dagger`, slot: 'weapon', kind: 'dagger', style: 'melee', anim: 'slash',
    speed: 1800, req: { attack: m.lvl }, bonus: { acc: s * 0.7 | 0, str: s * 0.55 | 0 }, value: m.val,
    vis: { layer: 'weapon', type: 'sword', color: m.color } });
  def(`${m.id}_sword`, { name: `${m.name} sword`, slot: 'weapon', kind: 'sword', style: 'melee', anim: 'slash',
    speed: 2400, req: { attack: m.lvl }, bonus: { acc: s, str: s * 0.9 | 0 }, value: m.val * 2,
    vis: { layer: 'weapon', type: 'sword', color: m.color } });
  def(`${m.id}_spear`, { name: `${m.name} spear`, slot: 'weapon', kind: 'spear', style: 'melee', anim: 'thrust',
    speed: 3000, req: { attack: m.lvl, strength: Math.max(1, m.lvl - 2) }, twoHand: true,
    bonus: { acc: s * 1.1 | 0, str: s * 1.25 | 0 }, value: m.val * 2.4 | 0,
    vis: { layer: 'weapon', type: 'spear', color: m.color } });
  def(`${m.id}_helm`, { name: `${m.name} helm`, slot: 'head', req: { defence: m.lvl },
    bonus: { def: s * 0.5 | 0 }, value: m.val * 1.4 | 0,
    vis: { layer: 'head', sheet: m.lvl >= 60 ? 'greathelm' : m.lvl >= 20 ? 'kettle' : 'mail', color: m.color } });
  def(`${m.id}_platebody`, { name: `${m.name} platebody`, slot: 'torso', req: { defence: m.lvl },
    bonus: { def: s * 1.2 | 0 }, value: m.val * 3,
    vis: { layer: 'torso', sheet: m.lvl >= 20 ? 'plate' : 'chainmail', color: m.color } });
  def(`${m.id}_platelegs`, { name: `${m.name} platelegs`, slot: 'legs', req: { defence: m.lvl },
    bonus: { def: s * 0.9 | 0 }, value: m.val * 2.2 | 0,
    vis: { layer: 'legs', sheet: 'plate', color: m.color } });
  def(`${m.id}_boots`, { name: `${m.name} boots`, slot: 'feet', req: { defence: m.lvl },
    bonus: { def: s * 0.3 | 0 }, value: m.val,
    vis: { layer: 'feet', sheet: 'armour', color: m.color } });
  def(`${m.id}_gauntlets`, { name: `${m.name} gauntlets`, slot: 'hands', req: { defence: m.lvl },
    bonus: { def: s * 0.25 | 0, str: 1 }, value: m.val,
    vis: { layer: 'hands', sheet: 'gloves', color: m.color } });
  def(`${m.id}_shield`, { name: `${m.name} heater shield`, slot: 'shield', req: { defence: m.lvl },
    bonus: { def: s * 0.8 | 0 }, value: m.val * 1.8 | 0,
    vis: { layer: 'shield', sheet: 'heater', color: m.color } });
  def(`${m.id}_arrow`, { name: `${m.name} arrow`, slot: 'ammo', stack: true, req: {},
    bonus: { rstr: s * 0.8 | 0 }, value: Math.max(1, m.val / 8 | 0), ammoTier: m.lvl, ammoKind: 'arrow' });
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
  def(cb.id, { name: cb.name, slot: 'weapon', kind: 'crossbow', style: 'ranged', anim: 'shoot', speed: 3600,
    twoHand: true, req: { ranged: cb.lvl }, bonus: { racc: s * 1.25 | 0, rstr: s * 0.25 | 0 }, value: cb.val,
    usesAmmo: true, ammoKind: 'bolt', vis: { layer: 'weapon', type: 'crossbow', color: 'wood' } });
}
def('crossbow_stock', { name: 'Crossbow stock', value: 40, material: true });
// Maces: crushing melee — hits harder than a sword, a touch less accurate.
// Waraxes: massive two-handed cleavers for the strongest smiths.
for (const m of METALS) {
  const s = T(m.lvl);
  def(`${m.id}_mace`, { name: `${m.name} mace`, slot: 'weapon', kind: 'mace', style: 'melee', anim: 'slash',
    speed: 2600, req: { attack: m.lvl }, bonus: { acc: s * 0.85 | 0, str: s * 1.1 | 0 }, value: m.val * 2.2 | 0,
    vis: { layer: 'weapon', type: 'mace', color: 'steel' } });
  def(`${m.id}_bolts`, { name: `${m.name} bolts`, slot: 'ammo', stack: true, req: {},
    bonus: { rstr: s * 1.05 | 0 }, value: Math.max(1, m.val / 6 | 0), ammoTier: m.lvl, ammoKind: 'bolt' });
  if (m.lvl >= 20) def(`${m.id}_waraxe`, { name: `${m.name} waraxe`, slot: 'weapon', kind: 'waraxe', style: 'melee', anim: 'slash',
    speed: 3400, twoHand: true, req: { attack: m.lvl, strength: m.lvl }, bonus: { acc: s * 0.9 | 0, str: s * 1.45 | 0 }, value: m.val * 3.2 | 0,
    vis: { layer: 'weapon', type: 'waraxe', color: 'steel' } });
}

export const LEATHERS = [
  { id: 'leather', name: 'Leather', lvl: 1, color: 'brown', val: 10 },
  { id: 'studded', name: 'Studded leather', lvl: 20, color: 'charcoal', val: 160 },
  { id: 'ranger', name: 'Ranger', lvl: 45, color: 'forest', val: 1300 },
  { id: 'lincoln', name: 'Lincoln green', lvl: 70, color: 'green', val: 7000 },
];
for (const L of LEATHERS) {
  const s = T(L.lvl);
  def(`${L.id}_coif`, { name: `${L.name} coif`, slot: 'head', req: { ranged: L.lvl, defence: Math.max(1, L.lvl - 5) },
    bonus: { def: s * 0.3 | 0, racc: s * 0.2 | 0 }, value: L.val,
    vis: { layer: 'head', sheet: 'hood', color: L.color } });
  def(`${L.id}_body`, { name: `${L.name} body`, slot: 'torso', req: { ranged: L.lvl, defence: Math.max(1, L.lvl - 5) },
    bonus: { def: s * 0.7 | 0, racc: s * 0.4 | 0 }, value: L.val * 2.6 | 0,
    vis: { layer: 'torso', sheet: 'leather', color: L.color } });
  def(`${L.id}_chaps`, { name: `${L.name} chaps`, slot: 'legs', req: { ranged: L.lvl, defence: Math.max(1, L.lvl - 5) },
    bonus: { def: s * 0.5 | 0, racc: s * 0.25 | 0 }, value: L.val * 2,
    vis: { layer: 'legs', sheet: 'pants', color: L.color } });
}
def('leather_boots', { name: 'Leather boots', slot: 'feet', req: {}, bonus: { def: 1 }, value: 8,
  vis: { layer: 'feet', sheet: 'boots', color: 'brown' } });
def('quiver', { name: 'Quiver', slot: 'cape', req: {}, bonus: { racc: 2 }, value: 30,
  vis: { layer: 'behind', sheet: 'quiver', color: 'brown' } });

// ---------------------------------------------------------------------------
// Magic: staves + robe sets + runes
export const STAVES = [
  { id: 'apprentice_staff', name: 'Apprentice staff', lvl: 1, color: 'light', val: 15 },
  { id: 'friar_staff', name: "Friar's staff", lvl: 20, color: 'medium', val: 220 },
  { id: 'druid_staff', name: 'Druidic staff', lvl: 50, color: 'gnarled', val: 2200 },
  { id: 'archdruid_staff', name: 'Archdruid staff', lvl: 75, color: 'gold', val: 12000 },
];
for (const st of STAVES) {
  const s = T(st.lvl);
  def(st.id, { name: st.name, slot: 'weapon', kind: 'staff', style: 'magic', anim: 'spellcast', speed: 3000,
    twoHand: true, req: { magic: st.lvl }, bonus: { macc: s * 1.1 | 0, mdmg: s * 0.3 | 0 }, value: st.val,
    vis: { layer: 'weapon', type: 'staff', color: st.color } });
}
export const ROBES = [
  { id: 'novice', name: 'Novice', lvl: 1, color: 'blue', val: 12 },
  { id: 'friar', name: "Friar's", lvl: 20, color: 'brown', val: 200, prayerReq: 10 },
  { id: 'druidic', name: 'Druidic', lvl: 50, color: 'forest', val: 2000, prayerReq: 30 },
  { id: 'archdruid', name: 'Archdruid', lvl: 75, color: 'white', val: 11000, prayerReq: 50 },
];
for (const R of ROBES) {
  const s = T(R.lvl); const req = { magic: R.lvl }; if (R.prayerReq) req.prayer = R.prayerReq;
  def(`${R.id}_hood`, { name: `${R.name} hood`, slot: 'head', req, bonus: { macc: s * 0.25 | 0 }, value: R.val,
    vis: { layer: 'head', sheet: 'hood', color: R.color } });
  def(`${R.id}_robe_top`, { name: `${R.name} robe top`, slot: 'torso', req, bonus: { macc: s * 0.5 | 0, def: s * 0.15 | 0 }, value: R.val * 2.5 | 0,
    vis: { layer: 'torso', sheet: 'robe', color: R.color } });
  def(`${R.id}_robe_skirt`, { name: `${R.name} robe skirt`, slot: 'legs', req, bonus: { macc: s * 0.35 | 0 }, value: R.val * 2,
    vis: { layer: 'legs', sheet: 'pants', color: R.color } });
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
  { id: 'silver_ore', lvl: 40, xp: 65, val: 90 }, { id: 'gold_ore', lvl: 55, xp: 85, val: 160 },
  { id: 'sylvanite_ore', lvl: 80, xp: 140, val: 700 },
];
for (const o of ORES) def(o.id, { name: o.id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), stack: false, value: o.val, material: true });
export const GEMS = [
  { id: 'sapphire', lvl: 20, val: 120 }, { id: 'emerald', lvl: 35, val: 260 },
  { id: 'ruby', lvl: 50, val: 550 }, { id: 'diamond', lvl: 70, val: 1500 },
];
for (const g of GEMS) def(g.id, { name: g.id[0].toUpperCase() + g.id.slice(1), value: g.val, material: true });

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
  { id: 'attack_potion', name: 'Attack potion', lvl: 3, herb: 'nettle', xp: 25, boost: { attack: 3 }, val: 20 },
  { id: 'strength_potion', name: 'Strength potion', lvl: 12, herb: 'yarrow', xp: 40, boost: { strength: 3 }, val: 40 },
  { id: 'defence_potion', name: 'Defence potion', lvl: 27, herb: 'comfrey', xp: 65, boost: { defence: 4 }, val: 80 },
  { id: 'ranging_potion', name: 'Ranging potion', lvl: 42, herb: 'wolfsbane', xp: 95, boost: { ranged: 4 }, val: 150 },
  { id: 'magic_potion', name: 'Magic potion', lvl: 57, herb: 'mandrake', xp: 130, boost: { magic: 4 }, val: 280 },
  { id: 'prayer_restore', name: 'Prayer restore', lvl: 68, herb: 'frostwort', xp: 170, restore: 'prayer', val: 450 },
  { id: 'kings_elixir', name: "King's elixir", lvl: 85, herb: 'kingsfoil', xp: 260, boost: { attack: 5, strength: 5, defence: 5 }, val: 1200 },
];
for (const p of POTIONS) def(p.id, { name: p.name, value: p.val, potion: true, boost: p.boost, restore: p.restore });

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
for (const t of ['small_fishing_net', 'fishing_rod', 'harpoon', 'tinderbox', 'knife', 'hammer', 'chisel', 'needle', 'spade', 'trowel', 'secateurs'])
  def(t, { name: t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), value: 5, tool: t });
def('fishing_bait', { name: 'Fishing bait', stack: true, value: 1 });

// Currency & tokens
def('coins', { name: 'Copper coins', stack: true, value: 1 });
// $Shilling never exists in inventory — ground pickups credit the ledger directly.

// Keys & misc
def('dungeon_key', { name: 'Abyssal key', value: 0, tradeable: false });
def('marians_letter', { name: "Marian's letter", value: 0, tradeable: false, quest: true });
def('convoy_strongbox', { name: 'Convoy strongbox', value: 0, tradeable: false, quest: true });

// Unique boss drops
def('sheriffs_blade', { name: "The Sheriff's blade", slot: 'weapon', kind: 'sword', style: 'melee', anim: 'slash',
  speed: 2200, req: { attack: 70 }, bonus: { acc: 92, str: 88 }, value: 45000, unique: true,
  vis: { layer: 'weapon', type: 'sword', color: 'gold' } });
def('gisbornes_cowl', { name: "Gisborne's cowl", slot: 'head', req: { ranged: 70 }, bonus: { def: 30, racc: 34 }, value: 38000, unique: true,
  vis: { layer: 'head', sheet: 'hood', color: 'black' } });
def('fenwyrm_scale', { name: 'Fenwyrm scale', value: 9000, material: true, unique: true });
def('trollkings_crown', { name: "Troll King's crown", slot: 'head', req: { defence: 75 }, bonus: { def: 40, str: 6 }, value: 52000, unique: true,
  vis: { layer: 'head', sheet: 'greathelm', color: 'gold' } });
def('frostgiant_heart', { name: 'Frost giant heart', value: 15000, material: true, unique: true });
def('elder_heartwood', { name: 'Elder heartwood', value: 12000, material: true, unique: true });

export function itemName(id) { return ITEMS[id] ? ITEMS[id].name : id; }

// Content tables for all 25 skills. The server implements generic handlers
// (gather, make, cast, pray, etc.) driven entirely by these tables, so every
// skill has trainable content from level 1 to 99.

// ---------------------------------------------------------------------------
// GATHER NODES — placed by mapgen per region; server tracks depletion.
export const NODES = {
  // Mining (pickaxe)
  copper_rock: { skill: 'mining', lvl: 1, xp: 18, tool: 'pickaxe', yield: 'copper_ore', respawnMs: 3000, name: 'Copper rock', anim: 'slash', fx: 'MINE' },
  tin_rock: { skill: 'mining', lvl: 1, xp: 18, tool: 'pickaxe', yield: 'tin_ore', respawnMs: 3000, name: 'Tin rock', anim: 'slash', fx: 'MINE' },
  essence_rock: { skill: 'mining', lvl: 1, xp: 8, tool: 'pickaxe', yield: 'rune_essence', respawnMs: 1, name: 'Essence rock', anim: 'slash', fx: 'MINE' },
  iron_rock: { skill: 'mining', lvl: 15, xp: 35, tool: 'pickaxe', yield: 'iron_ore', respawnMs: 6000, name: 'Iron rock', anim: 'slash', fx: 'MINE' },
  coal_rock: { skill: 'mining', lvl: 30, xp: 50, tool: 'pickaxe', yield: 'coal', respawnMs: 12000, name: 'Coal seam', anim: 'slash', fx: 'MINE' },
  silver_rock: { skill: 'mining', lvl: 40, xp: 65, tool: 'pickaxe', yield: 'silver_ore', respawnMs: 20000, name: 'Silver vein', anim: 'slash', fx: 'MINE' },
  mithril_rock: { skill: 'mining', lvl: 45, xp: 72, tool: 'pickaxe', yield: 'mithril_ore', respawnMs: 24000, name: 'Mithril vein', anim: 'slash', fx: 'MINE' },
  gold_rock: { skill: 'mining', lvl: 55, xp: 85, tool: 'pickaxe', yield: 'gold_ore', respawnMs: 30000, name: 'Gold vein', anim: 'slash', fx: 'MINE', gem: 1 / 40 },
  sylvanite_rock: { skill: 'mining', lvl: 80, xp: 140, tool: 'pickaxe', yield: 'sylvanite_ore', respawnMs: 60000, name: 'Sylvanite vein', anim: 'slash', fx: 'MINE', gem: 1 / 25 },

  // Woodcutting (hatchet)
  tree: { skill: 'woodcutting', lvl: 1, xp: 25, tool: 'hatchet', yield: 'logs', respawnMs: 4000, name: 'Ash tree', anim: 'slash', fx: 'CHOP' },
  oak_tree: { skill: 'woodcutting', lvl: 15, xp: 38, tool: 'hatchet', yield: 'oak_logs', respawnMs: 9000, name: 'Oak', anim: 'slash', fx: 'CHOP', multi: 0.5 },
  willow_tree: { skill: 'woodcutting', lvl: 30, xp: 68, tool: 'hatchet', yield: 'willow_logs', respawnMs: 14000, name: 'Willow', anim: 'slash', fx: 'CHOP', multi: 0.6 },
  maple_tree: { skill: 'woodcutting', lvl: 45, xp: 100, tool: 'hatchet', yield: 'maple_logs', respawnMs: 22000, name: 'Maple', anim: 'slash', fx: 'CHOP', multi: 0.6 },
  yew_tree: { skill: 'woodcutting', lvl: 60, xp: 175, tool: 'hatchet', yield: 'yew_logs', respawnMs: 40000, name: 'Yew', anim: 'slash', fx: 'CHOP', multi: 0.7 },
  elm_tree: { skill: 'woodcutting', lvl: 75, xp: 250, tool: 'hatchet', yield: 'elm_logs', respawnMs: 60000, name: 'Great elm', anim: 'slash', fx: 'CHOP', multi: 0.7 },
  frostpine_tree: { skill: 'woodcutting', lvl: 90, xp: 380, tool: 'hatchet', yield: 'frostpine_logs', respawnMs: 90000, name: 'Frostpine', anim: 'slash', fx: 'CHOP', multi: 0.8 },

  // Fishing
  net_spot: { skill: 'fishing', lvl: 1, xp: 20, tool: 'small_fishing_net', yield: 'raw_perch', respawnMs: 1, name: 'Fishing spot (net)', anim: 'thrust', fx: 'SPLASH', table: [['raw_perch', 1, 20], ['raw_eel', 55, 120]] },
  rod_spot: { skill: 'fishing', lvl: 15, xp: 45, tool: 'fishing_rod', yield: 'raw_trout', respawnMs: 1, name: 'Fishing spot (rod)', anim: 'thrust', fx: 'SPLASH', table: [['raw_trout', 15, 45], ['raw_salmon', 30, 70], ['raw_pike', 40, 90]] },
  harpoon_spot: { skill: 'fishing', lvl: 70, xp: 180, tool: 'harpoon', yield: 'raw_sturgeon', respawnMs: 1, name: 'Fishing spot (harpoon)', anim: 'thrust', fx: 'SPLASH', table: [['raw_sturgeon', 70, 180], ['raw_frost_cod', 85, 260]], rare: ['sheriffs_blade', 1 / 30000] },

  // Hunter (requires a box_trap in inventory)
  rabbit_run: { skill: 'hunter', lvl: 1, xp: 30, tool: 'box_trap', yield: 'rabbit_fur', respawnMs: 5000, name: 'Rabbit run', anim: 'spellcast', fx: 'TRAP' },
  fox_trail: { skill: 'hunter', lvl: 25, xp: 75, tool: 'box_trap', yield: 'fox_fur', respawnMs: 10000, name: 'Fox trail', anim: 'spellcast', fx: 'TRAP' },
  deer_track: { skill: 'hunter', lvl: 45, xp: 130, tool: 'box_trap', yield: 'raw_venison', respawnMs: 15000, name: 'Deer track', anim: 'spellcast', fx: 'TRAP' },
  sable_run: { skill: 'hunter', lvl: 70, xp: 230, tool: 'box_trap', yield: 'sable_pelt', respawnMs: 25000, name: 'Sable run', anim: 'spellcast', fx: 'TRAP' },

  // Archaeology (trowel)
  roman_ruin: { skill: 'archaeology', lvl: 1, xp: 40, tool: 'trowel', yield: 'damaged_roman_coin', respawnMs: 6000, name: 'Roman ruin', anim: 'thrust', fx: 'DIG' },
  saxon_barrow: { skill: 'archaeology', lvl: 20, xp: 90, tool: 'trowel', yield: 'damaged_saxon_brooch', respawnMs: 12000, name: 'Saxon barrow', anim: 'thrust', fx: 'DIG' },
  druid_circle: { skill: 'archaeology', lvl: 40, xp: 170, tool: 'trowel', yield: 'damaged_druid_idol', respawnMs: 20000, name: 'Druid circle', anim: 'thrust', fx: 'DIG' },
  norman_keep: { skill: 'archaeology', lvl: 60, xp: 280, tool: 'trowel', yield: 'damaged_norman_seal', respawnMs: 30000, name: 'Norman keep dig', anim: 'thrust', fx: 'DIG' },
  grail_shrine: { skill: 'archaeology', lvl: 80, xp: 460, tool: 'trowel', yield: 'damaged_grail_fragment', respawnMs: 50000, name: 'Grail shrine', anim: 'thrust', fx: 'DIG' },

  // Thieving stalls
  bakery_stall: { skill: 'thieving', lvl: 5, xp: 25, yield: 'bread', respawnMs: 6000, name: 'Bakery stall', anim: 'spellcast', fx: 'SPARK', stall: true },
  cloth_stall: { skill: 'thieving', lvl: 15, xp: 40, yield: 'ball_of_wool', respawnMs: 8000, name: 'Cloth stall', anim: 'spellcast', fx: 'SPARK', stall: true },
  spice_stall: { skill: 'thieving', lvl: 20, xp: 50, yield: 'cheese', respawnMs: 9000, name: 'Spice stall', anim: 'spellcast', fx: 'SPARK', stall: true },
  fur_stall: { skill: 'thieving', lvl: 30, xp: 70, yield: 'fox_fur', respawnMs: 12000, name: 'Fur stall', anim: 'spellcast', fx: 'SPARK', stall: true },
  silver_stall: { skill: 'thieving', lvl: 50, xp: 130, yield: 'silver_ore', respawnMs: 20000, name: 'Silver stall', anim: 'spellcast', fx: 'SPARK', stall: true },
  gem_stall: { skill: 'thieving', lvl: 75, xp: 240, yield: 'sapphire', respawnMs: 40000, name: 'Gem stall', anim: 'spellcast', fx: 'SPARK', stall: true, table: [['sapphire', 75, 240], ['emerald', 80, 280], ['ruby', 88, 340]] },

  // Runecrafting altars (consume all rune essence)
  air_altar: { skill: 'runecrafting', lvl: 1, xp: 9, rune: 'air_rune', name: 'Air altar', anim: 'spellcast', fx: 'RUNE' },
  earth_altar: { skill: 'runecrafting', lvl: 10, xp: 11, rune: 'earth_rune', name: 'Earth altar', anim: 'spellcast', fx: 'RUNE' },
  water_altar: { skill: 'runecrafting', lvl: 20, xp: 13, rune: 'water_rune', name: 'Water altar', anim: 'spellcast', fx: 'RUNE' },
  fire_altar: { skill: 'runecrafting', lvl: 35, xp: 16, rune: 'fire_rune', name: 'Fire altar', anim: 'spellcast', fx: 'RUNE' },
  nature_altar: { skill: 'runecrafting', lvl: 50, xp: 20, rune: 'nature_rune', name: 'Nature altar', anim: 'spellcast', fx: 'RUNE' },
  cosmic_altar: { skill: 'runecrafting', lvl: 65, xp: 26, rune: 'cosmic_rune', name: 'Cosmic altar', anim: 'spellcast', fx: 'RUNE' },
  blood_altar: { skill: 'runecrafting', lvl: 80, xp: 34, rune: 'blood_rune', name: 'Blood altar', anim: 'spellcast', fx: 'RUNE' },

  // Prayer altar (recharge + bonus xp on bone burial)
  chapel_altar: { skill: 'prayer', lvl: 1, xp: 0, name: 'Chapel altar', anim: 'spellcast', fx: 'HOLYBOLT', altar: true },

  // Farming patches
  allotment: { skill: 'farming', lvl: 1, xp: 0, name: 'Allotment patch', patch: 'allotment', anim: 'thrust', fx: 'NATURE' },
  herb_patch: { skill: 'farming', lvl: 20, xp: 0, name: 'Herb patch', patch: 'herb', anim: 'thrust', fx: 'NATURE' },

  // Agility obstacles (shortcut pairs get coords from mapgen)
  log_balance: { skill: 'agility', lvl: 1, xp: 20, name: 'Log balance', anim: 'walk', fx: 'SPARK', shortcut: true },
  stepping_stones: { skill: 'agility', lvl: 20, xp: 45, name: 'Stepping stones', anim: 'walk', fx: 'SPLASH', shortcut: true },
  cliff_scramble: { skill: 'agility', lvl: 40, xp: 90, name: 'Cliff scramble', anim: 'walk', fx: 'SPARK', shortcut: true },
  rope_swing: { skill: 'agility', lvl: 60, xp: 150, name: 'Rope swing', anim: 'walk', fx: 'SPARK', shortcut: true },
  ice_traverse: { skill: 'agility', lvl: 80, xp: 260, name: 'Ice traverse', anim: 'walk', fx: 'SPARK', shortcut: true },

  // Dungeoneering entrance
  dungeon_entrance: { skill: 'dungeoneering', lvl: 1, xp: 0, name: 'Abyssal Depths entrance', anim: 'walk', fx: 'TELEPORT', dungeon: true },
  // Summoning obelisk
  obelisk: { skill: 'summoning', lvl: 1, xp: 0, name: 'Spirit obelisk', anim: 'spellcast', fx: 'SUMMON', obelisk: true },
  // Archaeology restoration bench
  museum_bench: { skill: 'archaeology', lvl: 1, xp: 0, name: 'Restoration bench', anim: 'spellcast', fx: 'ARCH', bench: true },
  // Cooking / smithing stations
  campfire: { skill: 'cooking', lvl: 1, xp: 0, name: 'Campfire', station: 'fire' },
  range: { skill: 'cooking', lvl: 1, xp: 0, name: 'Cooking range', station: 'range' },
  furnace: { skill: 'smithing', lvl: 1, xp: 0, name: 'Furnace', station: 'furnace' },
  anvil: { skill: 'smithing', lvl: 1, xp: 0, name: 'Anvil', station: 'anvil' },
  loom: { skill: 'crafting', lvl: 1, xp: 0, name: 'Loom', station: 'loom' },
  tanning_rack: { skill: 'crafting', lvl: 1, xp: 0, name: 'Tanning rack', station: 'tanning_rack' },
  bank_booth: { skill: null, lvl: 1, xp: 0, name: 'Bank booth', bank: true },
  ge_booth: { skill: null, lvl: 1, xp: 0, name: 'Grand Exchange', ge: true },
  ge_window: { skill: null, lvl: 1, xp: 0, name: 'Exchange teller window', ge: true },
  house_portal: { skill: 'construction', lvl: 1, xp: 0, name: 'House portal', house: true },
};

// ---------------------------------------------------------------------------
// RECIPES — generic "make" actions. station: null = anywhere (with tool in inv)
export const RECIPES = [
  // Smithing: smelting
  { id: 'smelt_copper', skill: 'smithing', lvl: 1, xp: 15, station: 'furnace', inputs: { copper_ore: 1 }, output: { copper_bar: 1 }, name: 'Copper bar' },
  { id: 'smelt_bronze', skill: 'smithing', lvl: 5, xp: 25, station: 'furnace', inputs: { copper_ore: 1, tin_ore: 1 }, output: { bronze_bar: 1 }, name: 'Bronze bar' },
  { id: 'smelt_iron', skill: 'smithing', lvl: 15, xp: 40, station: 'furnace', inputs: { iron_ore: 1 }, output: { iron_bar: 1 }, name: 'Iron bar' },
  { id: 'smelt_steel', skill: 'smithing', lvl: 30, xp: 60, station: 'furnace', inputs: { iron_ore: 1, coal: 2 }, output: { steel_bar: 1 }, name: 'Steel bar' },
  { id: 'smelt_mithril', skill: 'smithing', lvl: 40, xp: 75, station: 'furnace', inputs: { mithril_ore: 2, coal: 1 }, output: { mithril_bar: 1 }, name: 'Mithril bar' },
  { id: 'smelt_damasked', skill: 'smithing', lvl: 45, xp: 90, station: 'furnace', inputs: { steel_bar: 1, coal: 2 }, output: { damasked_bar: 1 }, name: 'Damasked bar' },
  { id: 'smelt_silversteel', skill: 'smithing', lvl: 60, xp: 130, station: 'furnace', inputs: { silver_ore: 2, coal: 3 }, output: { silversteel_bar: 1 }, name: 'Silversteel bar' },
  { id: 'smelt_sylvan', skill: 'smithing', lvl: 85, xp: 220, station: 'furnace', inputs: { sylvanite_ore: 2, coal: 4 }, output: { sylvan_bar: 1 }, name: 'Sylvan bar' },
];
// Smithing: forging (generated per metal — offsets from the metal's base level)
import { METALS, DHIDES } from './items.js';
// [item, level offset, bars, xp]. Plate pieces cost more bars than the chain
// equivalents (a full helm 2 vs a coif 1; a platebody 3 vs a chainmail 2).
const FORGE = [
  ['dagger', 0, 1, 30], ['sword', 2, 1, 50], ['spear', 3, 1, 55],
  ['coif', 3, 1, 40], ['chainbody', 6, 2, 85],
  ['helm', 4, 2, 55], ['boots', 1, 1, 35], ['gauntlets', 1, 1, 35], ['platelegs', 6, 2, 75], ['platebody', 8, 3, 110],
  ['shield', 5, 2, 70], ['pickaxe', 2, 1, 50], ['hatchet', 2, 1, 50], ['mace', 2, 2, 60],
  ['rapier', 2, 1, 50], ['longsword', 4, 2, 70], ['flail', 3, 2, 65],
  ['halberd', 6, 3, 95], ['scythe', 5, 2, 80], ['trident', 5, 2, 75],
];
for (const m of METALS) {
  for (const [what, dl, bars, xp] of FORGE) {
    RECIPES.push({
      id: `forge_${m.id}_${what}`, skill: 'smithing', lvl: Math.min(99, m.lvl + dl), xp: xp * (1 + m.lvl / 12) | 0,
      station: 'anvil', inputs: { [`${m.id}_bar`]: bars, hammer: 0 }, output: { [`${m.id}_${what}`]: 1 }, name: `${m.name} ${what}`,
    });
  }
  RECIPES.push({
    id: `forge_${m.id}_arrows`, skill: 'smithing', lvl: Math.min(99, m.lvl + 1), xp: 35 * (1 + m.lvl / 12) | 0,
    station: 'anvil', inputs: { [`${m.id}_bar`]: 1, headless_arrows: 30 }, output: { [`${m.id}_arrow`]: 30 }, name: `${m.name} arrows`,
  });
  RECIPES.push({
    id: `forge_${m.id}_bolts`, skill: 'smithing', lvl: Math.min(99, m.lvl + 2), xp: 40 * (1 + m.lvl / 12) | 0,
    station: 'anvil', inputs: { [`${m.id}_bar`]: 1, arrow_shafts: 20 }, output: { [`${m.id}_bolts`]: 25 }, name: `${m.name} bolts`,
  });
  if (m.lvl >= 20) RECIPES.push({
    id: `forge_${m.id}_waraxe`, skill: 'smithing', lvl: Math.min(99, m.lvl + 6), xp: 130 * (1 + m.lvl / 12) | 0,
    station: 'anvil', inputs: { [`${m.id}_bar`]: 3 }, output: { [`${m.id}_waraxe`]: 1 }, name: `${m.name} waraxe`,
  });
}
// Crossbows: fletch the stock, then smith the metal limbs onto it
RECIPES.push(
  { id: 'fletch_crossbow_stock', skill: 'fletching', lvl: 30, xp: 90, station: null, tool: 'knife', inputs: { willow_logs: 1 }, output: { crossbow_stock: 1 }, name: 'Crossbow stock' },
  { id: 'forge_crossbow', skill: 'smithing', lvl: 25, xp: 120, station: 'anvil', inputs: { crossbow_stock: 1, iron_bar: 2 }, output: { crossbow: 1 }, name: 'Crossbow' },
  { id: 'forge_arbalest', skill: 'smithing', lvl: 52, xp: 260, station: 'anvil', inputs: { crossbow_stock: 1, damasked_bar: 2 }, output: { arbalest: 1 }, name: 'Arbalest' },
  { id: 'forge_siege_arbalest', skill: 'smithing', lvl: 77, xp: 520, station: 'anvil', inputs: { crossbow_stock: 2, silversteel_bar: 3 }, output: { siege_arbalest: 1 }, name: 'Siege arbalest' },
);
// Wood-and-metal crossbow variants: the frame's stock + two bars of the limb metal.
import { XBOW_FRAMES, XBOW_METALS } from './items.js';
for (const f of XBOW_FRAMES) for (const mm of XBOW_METALS) {
  const lvl = f.base + mm.lvl;
  if (lvl > 96) continue;
  const wood = f.wood[0].toUpperCase() + f.wood.slice(1);
  RECIPES.push({
    id: `forge_${f.wood}_${f.frame}_${mm.tag.toLowerCase()}`, skill: 'smithing', lvl: Math.min(99, lvl + 6),
    xp: 120 * (1 + lvl / 14) | 0, station: 'anvil',
    inputs: { crossbow_stock: f.stocks, [`${mm.id}_bar`]: 2 },
    output: { [`${f.wood}_${f.frame}_${mm.tag.toLowerCase()}`]: 1 },
    name: `${wood} ${f.label} (${mm.tag})`,
  });
}
// Cooking (fire or range; burn chance handled server-side)
import { FISH } from './items.js';
for (const f of FISH) RECIPES.push({
  id: `cook_${f.id}`, skill: 'cooking', lvl: f.cookLvl, xp: f.cookXp, station: 'fire',
  inputs: { [`raw_${f.id}`]: 1 }, output: { [`cooked_${f.id}`]: 1 }, name: `Cook ${f.id.replace('_', ' ')}`, burnable: `burnt_${f.id}`,
});
RECIPES.push(
  { id: 'bake_bread', skill: 'cooking', lvl: 1, xp: 40, station: 'range', inputs: { barley: 1 }, output: { bread: 1 }, name: 'Bake bread' },
  { id: 'roast_venison', skill: 'cooking', lvl: 30, xp: 120, station: 'fire', inputs: { raw_venison: 1 }, output: { venison: 1 }, name: 'Roast venison' },
  { id: 'hearty_stew', skill: 'cooking', lvl: 45, xp: 180, station: 'range', inputs: { potato: 1, cabbage: 1, raw_venison: 1 }, output: { hearty_stew: 1 }, name: 'Hearty stew' },
);
// Crafting
import { GEMS } from './items.js';
RECIPES.push(
  { id: 'craft_leather', skill: 'crafting', lvl: 1, xp: 25, station: null, tool: 'needle', inputs: { cow_hide: 1 }, output: { soft_leather: 1 }, name: 'Cure leather' },
  { id: 'craft_leather_coif', skill: 'crafting', lvl: 3, xp: 35, station: null, tool: 'needle', inputs: { soft_leather: 1 }, output: { leather_coif: 1 }, name: 'Leather coif' },
  { id: 'craft_leather_chaps', skill: 'crafting', lvl: 8, xp: 50, station: 'tanning_rack', tool: 'needle', inputs: { soft_leather: 2 }, output: { leather_chaps: 1 }, name: 'Leather chaps' },
  { id: 'craft_leather_body', skill: 'crafting', lvl: 14, xp: 70, station: 'tanning_rack', tool: 'needle', inputs: { soft_leather: 3 }, output: { leather_body: 1 }, name: 'Leather body' },
  { id: 'craft_studded_body', skill: 'crafting', lvl: 28, xp: 110, station: 'tanning_rack', tool: 'needle', inputs: { soft_leather: 3, iron_bar: 1 }, output: { studded_body: 1 }, name: 'Studded body' },
  { id: 'craft_ranger_body', skill: 'crafting', lvl: 52, xp: 190, station: 'tanning_rack', tool: 'needle', inputs: { soft_leather: 4, wolf_pelt: 2 }, output: { ranger_body: 1 }, name: 'Ranger body' },
  { id: 'craft_lincoln_body', skill: 'crafting', lvl: 76, xp: 320, station: 'tanning_rack', tool: 'needle', inputs: { soft_leather: 5, sable_pelt: 2 }, output: { lincoln_body: 1 }, name: 'Lincoln green body' },
  { id: 'craft_bowstring', skill: 'crafting', lvl: 10, xp: 15, station: 'loom', inputs: { flax: 1 }, output: { bowstring: 1 }, name: 'Spin bowstring' },
  { id: 'spin_wool', skill: 'crafting', lvl: 5, xp: 20, station: 'loom', inputs: { wool: 1 }, output: { ball_of_wool: 1 }, name: 'Spin wool' },
  { id: 'spin_alpaca', skill: 'crafting', lvl: 25, xp: 55, station: 'loom', inputs: { alpaca_wool: 1 }, output: { ball_of_wool: 2 }, name: 'Spin alpaca wool' },
  { id: 'make_cheese', skill: 'cooking', lvl: 8, xp: 40, station: 'range', inputs: { milk: 1 }, output: { cheese: 1 }, name: 'Cheese' },
  { id: 'craft_vial', skill: 'crafting', lvl: 5, xp: 12, station: 'furnace', inputs: { coins: 2 }, output: { vial_water: 3 }, name: 'Blow vials' },
);
// Premium ranger armour: gold-trim the studded set, or stitch dragonhide from
// the leathers that only the mightiest beasts yield.
const DHIDE_PIECE = [['coif', 1], ['vambraces', 1], ['chaps', 2], ['body', 3]];
for (const D of DHIDES) for (const [piece, n] of DHIDE_PIECE) {
  const out = `${D.id}_${piece}`;
  const inputs = D.hide ? { [D.hide]: n * 2 } : { soft_leather: n + 1, gold_ore: n };
  RECIPES.push({ id: `craft_${out}`, skill: 'crafting', lvl: Math.min(99, D.lvl), xp: 80 + n * 60 + D.lvl * 2,
    station: 'tanning_rack', tool: 'needle', inputs, output: { [out]: 1 }, name: `${D.name} ${piece}` });
}
for (const g of GEMS) RECIPES.push({
  id: `craft_${g.id}_amulet`, skill: 'crafting', lvl: g.lvl, xp: 40 + g.lvl * 2, station: 'furnace',
  inputs: { gold_ore: 1, [g.id]: 1 }, output: { [`${g.id}_amulet`]: 1 }, name: `${g.id} amulet`,
});
// Fletching
import { LOGS } from './items.js';
for (const l of LOGS) RECIPES.push({
  id: `fletch_shafts_${l.id}`, skill: 'fletching', lvl: l.lvl, xp: 10 + l.lvl, station: null, tool: 'knife',
  inputs: { [l.id]: 1 }, output: { arrow_shafts: 15 + (l.lvl / 3 | 0) }, name: `Shafts (${l.id.replace('_logs', '') || 'ash'})`,
});
RECIPES.push(
  { id: 'fletch_headless', skill: 'fletching', lvl: 1, xp: 15, station: null, inputs: { arrow_shafts: 15, feathers: 15 }, output: { headless_arrows: 15 }, name: 'Headless arrows' },
  { id: 'fletch_shortbow', skill: 'fletching', lvl: 5, xp: 40, station: null, tool: 'knife', inputs: { logs: 1, bowstring: 1 }, output: { shortbow: 1 }, name: 'Shortbow' },
  { id: 'fletch_ash_bow', skill: 'fletching', lvl: 18, xp: 80, station: null, tool: 'knife', inputs: { oak_logs: 1, bowstring: 1 }, output: { ash_bow: 1 }, name: 'Ash bow' },
  { id: 'fletch_yew_bow', skill: 'fletching', lvl: 47, xp: 180, station: null, tool: 'knife', inputs: { yew_logs: 1, bowstring: 1 }, output: { yew_bow: 1 }, name: 'Yew recurve bow' },
  { id: 'fletch_elm_warbow', skill: 'fletching', lvl: 66, xp: 300, station: null, tool: 'knife', inputs: { elm_logs: 1, bowstring: 2 }, output: { elm_warbow: 1 }, name: 'Elm warbow' },
  { id: 'fletch_sherwood', skill: 'fletching', lvl: 88, xp: 600, station: null, tool: 'knife', inputs: { frostpine_logs: 2, bowstring: 2, elder_heartwood: 1 }, output: { sherwood_longbow: 1 }, name: 'Sherwood longbow' },
);
// Herblore
import { HERBS, POTIONS } from './items.js';
for (const h of HERBS) RECIPES.push({
  id: `clean_${h.id}`, skill: 'herblore', lvl: h.lvl, xp: h.cleanXp, station: null,
  inputs: { [`grimy_${h.id}`]: 1 }, output: { [`clean_${h.id}`]: 1 }, name: `Clean ${h.id}`,
});
for (const p of POTIONS) RECIPES.push({
  id: `brew_${p.id}`, skill: 'herblore', lvl: p.lvl, xp: p.xp, station: null,
  inputs: { [`clean_${p.herb}`]: 1, vial_water: 1 }, output: { [p.id]: 1 }, name: p.name,
});
// Archaeology restoration
import { ARTEFACTS } from './items.js';
for (const a of ARTEFACTS) RECIPES.push({
  id: `restore_${a.id}`, skill: 'archaeology', lvl: a.lvl, xp: a.xp, station: 'bench',
  inputs: { [`damaged_${a.id}`]: 1 }, output: { [a.id]: 1 }, name: `Restore ${a.id.replace(/_/g, ' ')}`,
});
// Summoning pouches (at obelisk)
RECIPES.push(
  { id: 'pouch_wolf_pup', skill: 'summoning', lvl: 1, xp: 30, station: 'obelisk', inputs: { verdant_charm: 1, spirit_shard: 7, wolf_pelt: 0, bones: 1 }, output: { wolf_pup_pouch: 1 }, name: 'Wolf pup pouch' },
  { id: 'pouch_hawk', skill: 'summoning', lvl: 20, xp: 75, station: 'obelisk', inputs: { amber_charm: 1, spirit_shard: 12, feathers: 10 }, output: { hawk_pouch: 1 }, name: 'Hawk pouch' },
  { id: 'pouch_boar', skill: 'summoning', lvl: 35, xp: 120, station: 'obelisk', inputs: { verdant_charm: 1, spirit_shard: 20, raw_venison: 1 }, output: { boar_pouch: 1 }, name: 'Boar pouch' },
  { id: 'pouch_bear', skill: 'summoning', lvl: 50, xp: 190, station: 'obelisk', inputs: { crimson_charm: 1, spirit_shard: 30, big_bones: 1 }, output: { bear_pouch: 1 }, name: 'Bear pouch' },
  { id: 'pouch_stag', skill: 'summoning', lvl: 65, xp: 280, station: 'obelisk', inputs: { verdant_charm: 2, spirit_shard: 45, raw_venison: 2 }, output: { stag_pouch: 1 }, name: 'Spirit stag pouch' },
  { id: 'pouch_dire_wolf', skill: 'summoning', lvl: 80, xp: 400, station: 'obelisk', inputs: { cobalt_charm: 2, spirit_shard: 60, wolf_pelt: 2 }, output: { dire_wolf_pouch: 1 }, name: 'Dire wolf pouch' },
  { id: 'pouch_guardian', skill: 'summoning', lvl: 92, xp: 600, station: 'obelisk', inputs: { crimson_charm: 3, spirit_shard: 90, elder_heartwood: 0, ancient_bones: 1 }, output: { guardian_pouch: 1 }, name: 'Forest guardian pouch' },
);
// Construction (in your house, at hotspots; consumes materials)
export const FURNITURE = [
  { id: 'wooden_chair', lvl: 1, xp: 60, inputs: { logs: 3 }, name: 'Wooden chair' },
  { id: 'oak_table', lvl: 12, xp: 130, inputs: { oak_logs: 4 }, name: 'Oak table' },
  { id: 'bed', lvl: 22, xp: 220, inputs: { oak_logs: 3, soft_leather: 2 }, name: 'Bed' },
  { id: 'bookcase', lvl: 33, xp: 320, inputs: { willow_logs: 4 }, name: 'Bookcase' },
  { id: 'house_altar', lvl: 45, xp: 450, inputs: { maple_logs: 4, silver_ore: 2 }, name: 'House altar' },
  { id: 'stone_range', lvl: 55, xp: 560, inputs: { maple_logs: 2, coal: 6 }, name: 'Stone range' },
  { id: 'workbench', lvl: 65, xp: 700, inputs: { yew_logs: 4, steel_bar: 2 }, name: 'Master workbench' },
  { id: 'trophy_hall', lvl: 78, xp: 900, inputs: { elm_logs: 4, gold_ore: 3 }, name: 'Trophy hall' },
  { id: 'greenwood_throne', lvl: 92, xp: 1400, inputs: { frostpine_logs: 6, sylvan_bar: 1 }, name: 'Greenwood throne' },
];
for (const f of FURNITURE) RECIPES.push({
  id: `build_${f.id}`, skill: 'construction', lvl: f.lvl, xp: f.xp, station: 'house', tool: 'hammer',
  inputs: f.inputs, output: {}, furniture: f.id, name: f.name,
});

// Craftable gear ids referenced above exist as leather-line items:
// leather_coif/chaps/body, studded_body, ranger_body, lincoln_body — defined in items.js LEATHERS
// (ids there are `${tier}_coif|body|chaps`), so alias the recipe outputs:
export const RECIPE_OUTPUT_ALIAS = {
  leather_coif: 'leather_coif', leather_chaps: 'leather_chaps', leather_body: 'leather_body',
  studded_body: 'studded_body', ranger_body: 'ranger_body', lincoln_body: 'lincoln_body',
};

// ---------------------------------------------------------------------------
// MAGIC spellbook
export const SPELLS = {
  wind_gust: { name: 'Wind gust', lvl: 1, dmg: 4, xp: 8, runes: { air_rune: 1 }, fx: 'ICEBOLT', proj: 'air' },
  earth_spike: { name: 'Earth spike', lvl: 10, dmg: 7, xp: 12, runes: { air_rune: 1, earth_rune: 1 }, fx: 'THORNS', proj: 'earth' },
  heal_wounds: { name: 'Heal wounds', lvl: 15, heal: 0.2, xp: 15, runes: { air_rune: 1, water_rune: 1 }, fx: 'HEAL', self: true },
  water_lance: { name: 'Water lance', lvl: 20, dmg: 10, xp: 16, runes: { air_rune: 1, water_rune: 2 }, fx: 'ICEBOLT', proj: 'water' },
  loxley_call: { name: 'Call of Loxley', lvl: 25, teleport: 'loxley', xp: 30, runes: { air_rune: 3 }, fx: 'TELEPORT' },
  firebolt: { name: 'Firebolt', lvl: 30, dmg: 13, xp: 22, runes: { air_rune: 2, fire_rune: 2 }, fx: 'FIREBOLT', proj: 'fire' },
  nottingham_call: { name: 'Call of Nottingham', lvl: 40, teleport: 'nottingham', xp: 38, runes: { air_rune: 3, earth_rune: 1 }, fx: 'TELEPORT' },
  natures_wrath: { name: "Nature's wrath", lvl: 45, dmg: 17, xp: 30, runes: { earth_rune: 2, nature_rune: 2 }, fx: 'NATURE', proj: 'nature' },
  bay_call: { name: 'Call of the Bay', lvl: 52, teleport: 'bay', xp: 45, runes: { air_rune: 3, water_rune: 2 }, fx: 'TELEPORT' },
  holy_smite: { name: 'Holy smite', lvl: 60, dmg: 21, xp: 42, runes: { air_rune: 2, cosmic_rune: 2 }, fx: 'HOLYBOLT', proj: 'holy' },
  frosthollow_call: { name: 'Call of Frosthollow', lvl: 68, teleport: 'frosthollow', xp: 60, runes: { air_rune: 4, water_rune: 3 }, fx: 'TELEPORT' },
  blood_ray: { name: 'Blood ray', lvl: 75, dmg: 26, xp: 55, runes: { fire_rune: 2, blood_rune: 2 }, fx: 'FIREBOLT', proj: 'sheet:staffhi:3', leech: 0.25 },
  wrath_of_sherwood: { name: 'Wrath of Sherwood', lvl: 90, dmg: 32, xp: 75, runes: { nature_rune: 3, blood_rune: 2, cosmic_rune: 1 }, fx: 'NATURE', proj: 'sheet:twisted_3', aoe: 1 },
  // ---- animated-FX spell line (sheet projectiles from the new Combat packs) ----
  cosmic_bolt: { name: 'Cosmic bolt', lvl: 48, dmg: 18, xp: 33, runes: { air_rune: 2, cosmic_rune: 1 }, fx: 'HOLYBOLT', proj: 'sheet:cosmic:1' },
  emberstorm_orb: { name: 'Emberstorm orb', lvl: 63, dmg: 22, xp: 46, runes: { fire_rune: 3, cosmic_rune: 1 }, fx: 'FIREBOLT', proj: 'sheet:orb:3' },
  venom_surge: { name: 'Venom surge', lvl: 70, dmg: 24, xp: 50, runes: { nature_rune: 2, blood_rune: 1 }, fx: 'NATURE', proj: 'sheet:staffhi:2' },
  abyssal_orb: { name: 'Abyssal orb', lvl: 82, dmg: 29, xp: 62, runes: { cosmic_rune: 2, blood_rune: 2 }, fx: 'HOLYBOLT', proj: 'sheet:orb:2', leech: 0.1 },
  twisted_cataclysm: { name: 'Twisted cataclysm', lvl: 95, dmg: 36, xp: 90, runes: { blood_rune: 3, cosmic_rune: 2, fire_rune: 2 }, fx: 'FIREBOLT', proj: 'sheet:twisted_4', aoe: 1 },
};

// PRAYER book
export const PRAYERS = {
  thick_skin: { name: 'Thick Skin', lvl: 1, boost: { defence: 0.05 }, drain: 1 },
  clarity: { name: 'Clarity of Thought', lvl: 7, boost: { attack: 0.05 }, drain: 1 },
  sharp_eye: { name: 'Sharp Eye', lvl: 8, boost: { ranged: 0.05 }, drain: 1 },
  mystic_will: { name: 'Mystic Will', lvl: 9, boost: { magic: 0.05 }, drain: 1 },
  burst_strength: { name: 'Burst of Strength', lvl: 13, boost: { strength: 0.05 }, drain: 1 },
  rock_skin: { name: 'Rock Skin', lvl: 20, boost: { defence: 0.1 }, drain: 2 },
  rapid_heal: { name: 'Rapid Heal', lvl: 22, regen: 2, drain: 2 },
  hawk_eye: { name: 'Hawk Eye', lvl: 26, boost: { ranged: 0.1 }, drain: 2 },
  mystic_lore: { name: 'Mystic Lore', lvl: 27, boost: { magic: 0.1 }, drain: 2 },
  superhuman_strength: { name: 'Superhuman Strength', lvl: 31, boost: { strength: 0.1 }, drain: 2 },
  improved_reflexes: { name: 'Improved Reflexes', lvl: 34, boost: { attack: 0.1 }, drain: 2 },
  protect_magic: { name: 'Protect from Magic', lvl: 37, protect: 'magic', drain: 3 },
  protect_missiles: { name: 'Protect from Missiles', lvl: 40, protect: 'ranged', drain: 3 },
  protect_melee: { name: 'Protect from Melee', lvl: 43, protect: 'melee', drain: 3 },
  eagle_eye: { name: 'Eagle Eye', lvl: 44, boost: { ranged: 0.15 }, drain: 3 },
  mystic_might: { name: 'Mystic Might', lvl: 45, boost: { magic: 0.15 }, drain: 3 },
  piety: { name: 'Piety', lvl: 70, boost: { attack: 0.2, strength: 0.23, defence: 0.25 }, drain: 4 },
  rigour: { name: 'Rigour', lvl: 74, boost: { ranged: 0.23, defence: 0.25 }, drain: 4 },
  augury: { name: 'Augury', lvl: 77, boost: { magic: 0.25, defence: 0.25 }, drain: 4 },
};

// Combat ABILITIES (active, cooldown-based)
export const ABILITIES = {
  precise_strike: { name: 'Precise Strike', skill: 'attack', lvl: 5, cd: 15000, effect: 'accBoost', mult: 1.4, desc: 'Next 3 attacks cannot miss lightly.' },
  cleave: { name: 'Cleave', skill: 'strength', lvl: 15, cd: 20000, effect: 'aoe', mult: 1.2, desc: 'Strike all adjacent enemies.' },
  brace: { name: 'Brace', skill: 'defence', lvl: 25, cd: 30000, effect: 'shield', mult: 0.5, dur: 6000, desc: 'Halve damage taken for 6s.' },
  second_wind: { name: 'Second Wind', skill: 'constitution', lvl: 35, cd: 60000, effect: 'heal', mult: 0.3, desc: 'Recover 30% life points.' },
  snipe: { name: 'Snipe', skill: 'ranged', lvl: 20, cd: 18000, effect: 'bigshot', mult: 1.8, desc: 'A single deadly arrow.' },
  volley: { name: 'Volley', skill: 'ranged', lvl: 45, cd: 30000, effect: 'aoe', mult: 1.1, desc: 'Arrows rain on all nearby foes.' },
  surge: { name: 'Surge', skill: 'magic', lvl: 30, cd: 25000, effect: 'bigshot', mult: 1.7, desc: 'Overcharge your next spell.' },
  berserk: { name: 'Berserk', skill: 'strength', lvl: 50, cd: 45000, effect: 'strBoost', mult: 1.3, dur: 10000, desc: '+30% melee damage for 10s.' },
  deadeye: { name: 'Deadeye', skill: 'ranged', lvl: 75, cd: 45000, effect: 'bigshot', mult: 2.4, desc: 'The legendary splitting shot.' },
  smite_burst: { name: 'Smiting Burst', skill: 'magic', lvl: 70, cd: 45000, effect: 'aoe', mult: 1.5, desc: 'Detonate holy energy around you.' },
  guardian_call: { name: "Guardian's Call", skill: 'summoning', lvl: 40, cd: 60000, effect: 'famHeal', mult: 0.5, desc: 'Your familiar restores your wounds.' },
  last_stand: { name: 'Last Stand', skill: 'attack', lvl: 90, cd: 90000, effect: 'strBoost', mult: 1.5, dur: 8000, desc: '+50% damage for 8s.' },
};

// Summoning familiars
export const FAMILIARS = {
  wolf_pup_pouch: { name: 'Wolf pup', lvl: 1, atk: 4, life: 20, bonus: {}, mins: 10 },
  hawk_pouch: { name: 'Hawk', lvl: 20, atk: 9, life: 30, bonus: { ranged: 2 }, mins: 15 },
  boar_pouch: { name: 'Boar', lvl: 35, atk: 14, life: 55, bonus: { strength: 2 }, mins: 15 },
  bear_pouch: { name: 'Bear', lvl: 50, atk: 20, life: 90, bonus: { defence: 3 }, mins: 20 },
  stag_pouch: { name: 'Spirit stag', lvl: 65, atk: 26, life: 120, bonus: { agility: 4 }, mins: 20 },
  dire_wolf_pouch: { name: 'Dire wolf', lvl: 80, atk: 34, life: 170, bonus: { attack: 4 }, mins: 25 },
  guardian_pouch: { name: 'Forest guardian', lvl: 92, atk: 44, life: 260, bonus: { defence: 6, strength: 4 }, mins: 30 },
};

// Dungeoneering
export const DUNGEON = {
  MAX_FLOOR: 25,
  floorReq: f => Math.max(1, (f - 1) * 4),           // dungeoneering level required
  tokenReward: f => 2 + Math.floor(f * 1.5),          // $LoS per floor clear
  xpReward: f => 150 + f * 90,
};

// Relic powers (Archaeology passives, unlocked by restoring artefact sets)
export const RELICS = {
  roman_coin: { name: 'Trade Routes', desc: '+5% copper coins from drops' },
  saxon_brooch: { name: 'Elder Ward', desc: '+2 defence in the Wild Lands' },
  druid_idol: { name: 'Herbal Insight', desc: '+5% Herblore xp' },
  norman_seal: { name: "Taxman's Cut", desc: '1% cheaper Grand Exchange fees' },
  grail_fragment: { name: 'Grail Light', desc: '+1 prayer point regen per minute' },
};

// Bestiary. Humanoids render via LPC composites (vis), beasts via the
// procedural critter renderer (critter). Drop tables: [itemId, qty|[min,max], chance].
// Every mob also rolls the global very-rare $Shilling drop (scaled by level and
// SHILLING.MOB_DROP_CHANCE_BASE); shil field multiplies that rate.

export const MOBS = {};
function mob(id, o) { MOBS[id] = { id, aggro: false, speed: 2.2, respawnMs: 8000, shil: 1, ...o }; return MOBS[id]; }

// ---- Loxley / Meadows / Bay (1-20) ----------------------------------------
mob('rat', { name: 'Field rat', lvl: 2, life: 8, atk: 1, def: 1, style: 'melee', critter: 'rat',
  drops: [['bones', 1, 1], ['coins', [1, 4], 0.8]] });
mob('rabbit', { name: 'Rabbit', lvl: 1, life: 5, atk: 0, def: 1, critter: 'rabbit', style: 'melee',
  drops: [['bones', 1, 1], ['rabbit_fur', 1, 0.9]] });
mob('boar', { name: 'Wild boar', lvl: 8, life: 22, atk: 4, def: 4, critter: 'boar', style: 'melee', aggro: true,
  drops: [['bones', 1, 1], ['raw_venison', 1, 0.4], ['coins', [2, 9], 0.7]] });
mob('bandit', { name: 'Bandit', lvl: 12, life: 30, atk: 7, def: 6, style: 'melee',
  vis: { skin: 'light', hair: ['bedhead', 'black'], torso: ['longsleeve', 'charcoal'], legs: ['pants', 'brown'], weapon: ['sword', 'copper'] },
  drops: [['bones', 1, 1], ['coins', [4, 15], 0.9], ['copper_sword', 1, 0.05], ['bread', 1, 0.2], ['grimy_nettle', 1, 0.25]] });
mob('gull_harpy', { name: 'Gull harpy', lvl: 14, life: 34, atk: 8, def: 5, critter: 'hawk', style: 'ranged', aggro: true,
  drops: [['bones', 1, 1], ['feathers', [5, 15], 1], ['coins', [3, 12], 0.6]] });
mob('smuggler', { name: 'Smuggler', lvl: 16, life: 38, atk: 9, def: 8, style: 'ranged',
  vis: { skin: 'taupe', hair: ['bangs', 'dark_brown'], torso: ['leather', 'brown'], legs: ['pants', 'black'], weapon: ['bow', 'normal'] },
  drops: [['bones', 1, 1], ['coins', [6, 20], 0.9], ['copper_arrow', [4, 12], 0.5], ['raw_trout', 1, 0.3], ['shortbow', 1, 0.04]] });

// ---- Sherwood (10-40) -------------------------------------------------------
mob('sherwood_wolf', { name: 'Sherwood wolf', lvl: 18, life: 44, atk: 11, def: 9, critter: 'wolf', style: 'melee', aggro: true,
  drops: [['bones', 1, 1], ['wolf_pelt', 1, 0.35], ['verdant_charm', 1, 0.12]] });
mob('outlaw', { name: 'Outlaw', lvl: 22, life: 52, atk: 13, def: 11, style: 'melee',
  vis: { skin: 'light', hair: ['plain', 'light_brown'], torso: ['tunic', 'green'], legs: ['pants', 'brown'], head: ['hood', 'green'], weapon: ['sword', 'bronze'] },
  drops: [['bones', 1, 1], ['coins', [8, 28], 0.9], ['bronze_sword', 1, 0.05], ['grimy_yarrow', 1, 0.2], ['spirit_shard', [2, 6], 0.3]] });
mob('sheriffs_guard', { name: "Sheriff's guard", lvl: 28, life: 66, atk: 16, def: 16, style: 'melee', aggro: true,
  vis: { skin: 'light', torso: ['chainmail', 'steel'], legs: ['plate', 'iron'], head: ['mail', 'iron'], weapon: ['spear', 'iron'] },
  drops: [['bones', 1, 1], ['coins', [12, 40], 0.95], ['iron_spear', 1, 0.04], ['iron_platebody', 1, 0.02], ['bread', 1, 0.2], ['amber_charm', 1, 0.1]] });
mob('poacher', { name: 'Poacher', lvl: 25, life: 58, atk: 14, def: 12, style: 'ranged',
  vis: { skin: 'brown', hair: ['buzzcut', 'black'], torso: ['leather', 'forest'], legs: ['pants', 'charcoal'], weapon: ['bow', 'medium'] },
  drops: [['bones', 1, 1], ['coins', [10, 30], 0.9], ['bronze_arrow', [5, 15], 0.5], ['rabbit_fur', 1, 0.4], ['ash_bow', 1, 0.03]] });
mob('elder_treant_sapling', { name: 'Treant sapling', lvl: 34, life: 90, atk: 18, def: 20, critter: 'treant', style: 'melee',
  drops: [['logs', [1, 3], 1], ['oak_logs', 1, 0.5], ['verdant_charm', 1, 0.2], ['grimy_comfrey', 1, 0.25]] });

// ---- Fenwold swamp (25-50) --------------------------------------------------
mob('marsh_leech', { name: 'Marsh leech', lvl: 26, life: 60, atk: 15, def: 10, critter: 'leech', style: 'melee', aggro: true,
  drops: [['grimy_comfrey', 1, 0.35], ['vial_water', 1, 0.3], ['cobalt_charm', 1, 0.08]] });
mob('bog_wraith', { name: 'Bog wraith', lvl: 38, life: 96, atk: 22, def: 18, style: 'magic', aggro: true,
  vis: { skin: 'black', torso: ['robe', 'charcoal'], head: ['hood', 'black'], weapon: ['staff', 'gnarled'] },
  drops: [['bones', 1, 1], ['water_rune', [3, 10], 0.6], ['earth_rune', [3, 10], 0.5], ['grimy_wolfsbane', 1, 0.25], ['cobalt_charm', 1, 0.15]] });
mob('fen_serpent', { name: 'Fen serpent', lvl: 44, life: 120, atk: 26, def: 20, critter: 'serpent', style: 'melee', aggro: true,
  drops: [['big_bones', 1, 1], ['coins', [20, 60], 0.8], ['grimy_wolfsbane', 1, 0.3], ['crimson_charm', 1, 0.12]] });

// ---- Elderglade (35-60) -----------------------------------------------------
mob('wildwood_panther', { name: 'Wildwood panther', lvl: 48, life: 130, atk: 30, def: 24, critter: 'panther', style: 'melee', aggro: true, speed: 3.2,
  drops: [['big_bones', 1, 1], ['sable_pelt', 1, 0.15], ['crimson_charm', 1, 0.15]] });
mob('druid_shade', { name: 'Druid shade', lvl: 52, life: 140, atk: 32, def: 26, style: 'magic', aggro: true,
  vis: { skin: 'olive', torso: ['robe', 'forest'], head: ['hood', 'forest'], weapon: ['staff', 'gnarled'] },
  drops: [['bones', 1, 1], ['nature_rune', [2, 8], 0.6], ['grimy_mandrake', 1, 0.25], ['druid_staff', 1, 0.01], ['damaged_druid_idol', 1, 0.1]] });
mob('vine_horror', { name: 'Vine horror', lvl: 56, life: 160, atk: 34, def: 30, critter: 'treant', style: 'melee', aggro: true,
  drops: [['big_bones', 1, 1], ['willow_logs', [1, 2], 0.5], ['grimy_mandrake', 1, 0.3], ['verdant_charm', 1, 0.2]] });

// ---- Grey Peaks (40-70) -------------------------------------------------------
mob('mountain_goat', { name: 'Mountain goat', lvl: 40, life: 100, atk: 22, def: 22, critter: 'goat', style: 'melee',
  drops: [['big_bones', 1, 1], ['raw_venison', 1, 0.4]] });
mob('crag_troll', { name: 'Crag troll', lvl: 58, life: 180, atk: 36, def: 34, critter: 'troll', style: 'melee', aggro: true,
  drops: [['big_bones', 1, 1], ['coins', [30, 90], 0.85], ['iron_ore', [1, 3], 0.5], ['coal', [1, 3], 0.4], ['silver_ore', 1, 0.2], ['steel_platebody', 1, 0.015]] });
mob('eyrie_hawk', { name: 'Eyrie hawk', lvl: 50, life: 120, atk: 30, def: 22, critter: 'hawk', style: 'ranged', aggro: true,
  drops: [['bones', 1, 1], ['feathers', [10, 25], 1], ['amber_charm', 1, 0.2]] });

// ---- Northmoor (55-80) --------------------------------------------------------
mob('moor_brigand', { name: 'Moor brigand', lvl: 62, life: 190, atk: 38, def: 34, style: 'melee', aggro: true,
  vis: { skin: 'light', hair: ['bedhead', 'ginger'], torso: ['chainmail', 'iron'], legs: ['plate', 'iron'], head: ['kettle', 'iron'], weapon: ['sword', 'steel'] },
  drops: [['bones', 1, 1], ['coins', [40, 120], 0.9], ['steel_sword', 1, 0.03], ['damasked_sword', 1, 0.008], ['hearty_stew', 1, 0.15], ['cobalt_charm', 1, 0.15]] });
mob('ice_wolf', { name: 'Ice wolf', lvl: 66, life: 210, atk: 42, def: 36, critter: 'icewolf', style: 'melee', aggro: true, speed: 3.4,
  drops: [['big_bones', 1, 1], ['wolf_pelt', 1, 0.5], ['sable_pelt', 1, 0.2], ['cobalt_charm', 1, 0.2]] });
mob('frost_sprite', { name: 'Frost sprite', lvl: 60, life: 160, atk: 40, def: 28, style: 'magic', aggro: true, critter: 'sprite',
  drops: [['water_rune', [5, 14], 0.7], ['air_rune', [5, 14], 0.7], ['cosmic_rune', [1, 4], 0.3]] });

// ---- Wild Lands (70+, PvP zone; higher shilling rates) ------------------------
mob('revenant_knight', { name: 'Revenant knight', lvl: 78, life: 300, atk: 52, def: 48, style: 'melee', aggro: true, shil: 3,
  vis: { skin: 'taupe', torso: ['plate', 'silver'], legs: ['plate', 'silver'], head: ['greathelm', 'silver'], weapon: ['sword', 'silver'] },
  drops: [['ancient_bones', 1, 1], ['coins', [80, 240], 0.95], ['silversteel_sword', 1, 0.01], ['silversteel_platebody', 1, 0.006], ['kings_elixir', 1, 0.05], ['crimson_charm', 1, 0.3]] });
mob('wight_archer', { name: 'Wight archer', lvl: 74, life: 260, atk: 48, def: 42, style: 'ranged', aggro: true, shil: 3,
  vis: { skin: 'black', hair: ['plain', 'gray'], torso: ['leather', 'black'], head: ['hood', 'black'], weapon: ['great', 'medium'] },
  drops: [['ancient_bones', 1, 1], ['silversteel_arrow', [8, 24], 0.5], ['elm_warbow', 1, 0.01], ['coins', [60, 200], 0.9]] });
mob('frost_revenant', { name: 'Frost revenant', lvl: 84, life: 360, atk: 58, def: 52, style: 'magic', aggro: true, shil: 4,
  vis: { skin: 'black', torso: ['robe', 'white'], head: ['hood', 'white'], weapon: ['staff', 'gold'] },
  drops: [['ancient_bones', 1, 1], ['blood_rune', [2, 8], 0.5], ['cosmic_rune', [3, 10], 0.5], ['archdruid_staff', 1, 0.005], ['coins', [90, 260], 0.9]] });

// ---- Abyssal Depths (dungeon-only, scaled by floor at spawn time) -------------
mob('abyssal_crawler', { name: 'Abyssal crawler', lvl: 20, life: 60, atk: 14, def: 12, critter: 'spider', style: 'melee', aggro: true, dungeon: true,
  drops: [['coins', [10, 40], 0.8], ['spirit_shard', [3, 9], 0.4], ['dungeon_key', 1, 0.18]] });
mob('depth_keeper', { name: 'Depth keeper', lvl: 40, life: 130, atk: 28, def: 26, style: 'magic', aggro: true, dungeon: true,
  vis: { skin: 'olive', torso: ['robe', 'blue'], head: ['hood', 'blue'], weapon: ['staff', 'medium'] },
  drops: [['coins', [30, 80], 0.8], ['cosmic_rune', [2, 6], 0.4], ['dungeon_key', 1, 0.25]] });

// Event creature: the Golden Stag (flees, never fights; all damagers share the blessing)
mob('golden_stag', { name: 'The Golden Stag', lvl: 30, life: 400, atk: 0, def: 25, critter: 'stag', style: 'melee', speed: 3.0, shil: 0,
  drops: [['big_bones', 1, 1], ['raw_venison', [2, 4], 1]] });

// ---- BOSSES -------------------------------------------------------------------
function boss(id, o) { return mob(id, { boss: true, aggro: true, respawnMs: 120000, shil: 5, scale: 1.6, ...o }); }

boss('elder_treant', { name: 'The Elder Treant', lvl: 45, life: 700, atk: 34, def: 30, critter: 'treant', style: 'melee', tier: 1,
  region: 'SHERWOOD', drops: [['big_bones', 1, 1], ['elder_heartwood', 1, 0.15], ['yew_logs', [2, 6], 0.8], ['verdant_charm', [2, 5], 0.8], ['maple_logs', [2, 8], 1]] });
boss('fenwyrm', { name: 'The Fenwyrm', lvl: 55, life: 950, atk: 42, def: 36, critter: 'serpent', style: 'magic', tier: 2, scale: 2.2,
  region: 'FENWOLD', drops: [['big_bones', 1, 1], ['fenwyrm_scale', 1, 0.2], ['grimy_frostwort', [1, 3], 0.7], ['water_rune', [10, 30], 1], ['cobalt_charm', [2, 5], 0.8]] });
boss('guy_of_gisborne', { name: 'Guy of Gisborne', lvl: 68, life: 1200, atk: 52, def: 46, style: 'ranged', tier: 3,
  vis: { skin: 'light', hair: ['plain', 'black'], torso: ['leather', 'black'], legs: ['pants', 'black'], head: ['hood', 'black'], weapon: ['great', 'dark'] },
  region: 'NORTHMOOR', drops: [['bones', 1, 1], ['gisbornes_cowl', 1, 0.05], ['elm_warbow', 1, 0.08], ['silversteel_arrow', [20, 60], 1], ['coins', [200, 600], 1]] });
boss('sheriff_of_nottingham', { name: 'The Sheriff of Nottingham', lvl: 75, life: 1500, atk: 56, def: 52, style: 'melee', tier: 3,
  vis: { skin: 'light', hair: ['plain', 'black'], torso: ['plate', 'gold'], legs: ['plate', 'gold'], head: ['greathelm', 'gold'], weapon: ['sword', 'gold'] },
  region: 'NOTTINGHAM', drops: [['bones', 1, 1], ['sheriffs_blade', 1, 0.04], ['damasked_platebody', 1, 0.1], ['coins', [300, 900], 1], ['kings_elixir', 1, 0.3]] });
boss('troll_king', { name: 'The Stone Troll King', lvl: 82, life: 1900, atk: 62, def: 60, critter: 'troll', style: 'melee', tier: 4, scale: 2.4,
  region: 'PEAKS', drops: [['ancient_bones', 1, 1], ['trollkings_crown', 1, 0.04], ['sylvanite_ore', [1, 3], 0.5], ['gold_ore', [2, 6], 0.8], ['coins', [400, 1000], 1]] });
boss('frost_giant', { name: 'The Frost Giant', lvl: 92, life: 2600, atk: 72, def: 66, critter: 'giant', style: 'melee', tier: 5, scale: 2.6,
  region: 'WILDLANDS', drops: [['ancient_bones', 1, 1], ['frostgiant_heart', 1, 0.12], ['sylvan_sword', 1, 0.02], ['sylvan_platebody', 1, 0.012], ['coins', [600, 1600], 1], ['kings_elixir', [1, 2], 0.5]] });
boss('abyssal_horror', { name: 'The Abyssal Horror', lvl: 60, life: 1000, atk: 46, def: 40, critter: 'spider', style: 'magic', tier: 3, scale: 2.0, dungeon: true,
  drops: [['ancient_bones', 1, 1], ['coins', [200, 500], 1], ['blood_rune', [5, 15], 0.6], ['diamond', 1, 0.2]] });

// Vis for hair may be absent (helmets); critters are drawn by client code.
export const CRITTERS = ['rat', 'rabbit', 'boar', 'wolf', 'icewolf', 'hawk', 'leech', 'serpent', 'panther', 'treant', 'goat', 'troll', 'sprite', 'spider', 'giant'];

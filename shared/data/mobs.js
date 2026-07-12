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
mob('boar', { name: 'Wild boar', lvl: 8, life: 22, atk: 4, def: 4, sheet: 'tusked_boar', style: 'melee', aggro: true,
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
  drops: [['bones', 1, 1], ['coins', [12, 40], 0.95], ['iron_spear', 1, 0.04], ['crossbow', 1, 0.015], ['iron_bolts', [5, 15], 0.2], ['iron_platebody', 1, 0.02], ['bread', 1, 0.2], ['amber_charm', 1, 0.1]] });
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
  drops: [['ancient_bones', 1, 1], ['silversteel_arrow', [8, 24], 0.5], ['arbalest', 1, 0.008], ['silversteel_bolts', [6, 18], 0.3], ['elm_warbow', 1, 0.01], ['coins', [60, 200], 0.9]] });
mob('frost_revenant', { name: 'Frost revenant', lvl: 84, life: 360, atk: 58, def: 52, style: 'magic', aggro: true, shil: 4,
  vis: { skin: 'black', torso: ['robe', 'white'], head: ['hood', 'white'], weapon: ['staff', 'gold'] },
  drops: [['ancient_bones', 1, 1], ['blood_rune', [2, 8], 0.5], ['cosmic_rune', [3, 10], 0.5], ['archdruid_staff', 1, 0.005], ['coins', [90, 260], 0.9]] });

// ---- Abyssal Depths (dungeon-only, scaled by floor at spawn time) -------------
mob('abyssal_crawler', { name: 'Abyssal crawler', lvl: 20, life: 60, atk: 14, def: 12, critter: 'spider', style: 'melee', aggro: true, dungeon: true,
  drops: [['coins', [10, 40], 0.8], ['spirit_shard', [3, 9], 0.4], ['dungeon_key', 1, 0.18]] });
mob('depth_keeper', { name: 'Depth keeper', lvl: 40, life: 130, atk: 28, def: 26, style: 'magic', aggro: true, dungeon: true,
  vis: { skin: 'olive', torso: ['robe', 'blue'], head: ['hood', 'blue'], weapon: ['staff', 'medium'] },
  drops: [['coins', [30, 80], 0.8], ['cosmic_rune', [2, 6], 0.4], ['dungeon_key', 1, 0.25]] });

// ---- Beast-folk (LPC monster heads on humanoid bodies — fully animated) --------
mob('goblin', { name: 'Goblin scavenger', lvl: 6, life: 16, atk: 3, def: 3, style: 'melee', aggro: true,
  vis: { skin: 'green', monster: 'goblin', torso: ['longsleeve', 'brown'], legs: ['pants', 'charcoal'], weapon: ['sword', 'copper'] },
  drops: [['bones', 1, 1], ['coins', [2, 8], 0.85], ['copper_dagger', 1, 0.05], ['grimy_nettle', 1, 0.2], ['spirit_shard', [1, 3], 0.2]] });
mob('goblin_archer', { name: 'Goblin skirmisher', lvl: 10, life: 24, atk: 6, def: 5, style: 'ranged', aggro: true,
  vis: { skin: 'dark_green', monster: 'goblin', torso: ['leather', 'brown'], legs: ['pants', 'brown'], weapon: ['bow', 'normal'] },
  drops: [['bones', 1, 1], ['coins', [4, 12], 0.85], ['copper_arrow', [3, 10], 0.5], ['feathers', [2, 8], 0.4]] });
mob('goblin_raider', { name: 'Goblin raider', lvl: 15, life: 36, atk: 9, def: 8, style: 'melee', aggro: true,
  vis: { skin: 'green', monster: 'goblin', torso: ['chainmail', 'iron'], legs: ['pants', 'black'], weapon: ['axe', 'iron'] },
  drops: [['bones', 1, 1], ['coins', [6, 18], 0.9], ['iron_hatchet', 1, 0.04], ['bronze_bar', 1, 0.12], ['verdant_charm', 1, 0.1]] });
mob('lizardfolk', { name: 'Lizardfolk hunter', lvl: 36, life: 92, atk: 21, def: 18, style: 'melee', aggro: true,
  vis: { skin: 'bright_green', monster: 'lizard', torso: ['leather', 'forest'], legs: ['pants', 'forest'], weapon: ['spear', 'bronze'] },
  drops: [['bones', 1, 1], ['coins', [14, 40], 0.9], ['bronze_spear', 1, 0.04], ['grimy_comfrey', 1, 0.3], ['cobalt_charm', 1, 0.12], ['raw_pike', 1, 0.25]] });
mob('lizardfolk_shaman', { name: 'Lizardfolk shaman', lvl: 48, life: 120, atk: 28, def: 22, style: 'magic', aggro: true,
  vis: { skin: 'dark_green', monster: 'lizard', torso: ['robe', 'forest'], legs: ['pants', 'forest'], weapon: ['staff', 'gnarled'] },
  drops: [['bones', 1, 1], ['water_rune', [3, 9], 0.6], ['nature_rune', [2, 6], 0.5], ['grimy_wolfsbane', 1, 0.3], ['crimson_charm', 1, 0.12]] });
mob('orc_raider', { name: 'Orc raider', lvl: 62, life: 200, atk: 40, def: 34, style: 'melee', aggro: true,
  vis: { skin: 'dark_green', monster: 'orc', torso: ['chainmail', 'steel'], legs: ['plate', 'iron'], weapon: ['axe', 'steel'] },
  drops: [['big_bones', 1, 1], ['coins', [40, 110], 0.9], ['steel_hatchet', 1, 0.03], ['steel_mace', 1, 0.025], ['steel_bar', 1, 0.15], ['crimson_charm', 1, 0.18]] });
mob('orc_warlord', { name: 'Orc warlord', lvl: 74, life: 280, atk: 50, def: 44, style: 'melee', aggro: true, shil: 2,
  vis: { skin: 'dark_green', monster: 'orc', torso: ['plate', 'iron'], legs: ['plate', 'iron'], head: ['greathelm', 'iron'], weapon: ['sword', 'silversteel'] },
  drops: [['big_bones', 1, 1], ['coins', [70, 190], 0.95], ['silversteel_sword', 1, 0.008], ['silversteel_waraxe', 1, 0.006], ['damasked_platebody', 1, 0.02], ['kings_elixir', 1, 0.06]] });
mob('minotaur', { name: 'Minotaur', lvl: 66, life: 320, atk: 46, def: 40, style: 'melee', aggro: true, shil: 2, scale: 1.35,
  vis: { skin: 'fur_brown', monster: 'minotaur', legs: ['pants', 'brown'], weapon: ['axe', 'steel'] },
  drops: [['big_bones', 1, 1], ['coins', [60, 160], 0.95], ['steel_platebody', 1, 0.03], ['steel_waraxe', 1, 0.03], ['big_bones', 1, 0.5], ['crimson_charm', [1, 2], 0.25]] });
mob('brown_bear', { name: 'Brown bear', lvl: 30, life: 90, atk: 18, def: 16, critter: 'bear', style: 'melee', aggro: true,
  drops: [['big_bones', 1, 1], ['raw_venison', 1, 0.5], ['wolf_pelt', 1, 0.2], ['verdant_charm', 1, 0.15]] });

// Event creature: the Golden Stag (flees, never fights; all damagers share the blessing)
mob('golden_stag', { name: 'The Golden Stag', lvl: 30, life: 400, atk: 0, def: 25, sheet: 'wild_reindeer', tint: 'gold', scale: 1.3, style: 'melee', speed: 3.0, shil: 0,
  drops: [['big_bones', 1, 1], ['raw_venison', [2, 4], 1], ['swift_stag', 1, 0.04], ['gilded_stag', 1, 0.006]] });

// ---- Sheet-animated mobs (media.json packs; drawn by client/js/media.js) ------
// Meadows / Bay starters
mob('meadow_hare', { name: 'Meadow hare', lvl: 2, life: 7, atk: 0, def: 1, sheet: 'meadow_hare', style: 'melee', speed: 3.0,
  drops: [['bones', 1, 1], ['rabbit_fur', 1, 0.9]] });
mob('horned_hare', { name: 'Horned hare', lvl: 7, life: 20, atk: 4, def: 3, sheet: 'horned_hare', style: 'melee', aggro: true, speed: 3.2,
  drops: [['bones', 1, 1], ['rabbit_fur', 1, 0.8], ['coins', [2, 8], 0.6]] });
mob('wild_hog', { name: 'Wild hog', lvl: 4, life: 14, atk: 2, def: 2, sheet: 'wild_pig', style: 'melee',
  drops: [['bones', 1, 1], ['raw_venison', 1, 0.35]] });
mob('shore_crab', { name: 'Shore crab', lvl: 6, life: 18, atk: 3, def: 5, sheet: 'shore_crab', style: 'melee',
  drops: [['bones', 1, 1], ['coins', [1, 6], 0.6], ['raw_perch', 1, 0.3]] });
mob('spiked_slime', { name: 'Spiked slime', lvl: 10, life: 26, atk: 5, def: 4, sheet: 'spiked_slime', style: 'melee', aggro: true,
  drops: [['coins', [3, 10], 0.8], ['grimy_nettle', 1, 0.3], ['spirit_shard', [1, 4], 0.25]] });
// Sherwood & roads
mob('tusked_boar', { name: 'Tusked boar', lvl: 24, life: 58, atk: 14, def: 12, sheet: 'tusked_boar', scale: 1.3, style: 'melee', aggro: true,
  drops: [['big_bones', 1, 1], ['raw_venison', 1, 0.5], ['coins', [6, 20], 0.6]] });
mob('marauder', { name: 'Marauder', lvl: 30, life: 74, atk: 17, def: 15, sheet: 'brigand', style: 'melee', aggro: true,
  drops: [['bones', 1, 1], ['coins', [10, 34], 0.9], ['steel_sword', 1, 0.02], ['attack_potion', 1, 0.1], ['blade_of_the_burrow', 1, 0.003]] });
mob('dire_wolf', { name: 'Dire wolf', lvl: 35, life: 88, atk: 20, def: 16, sheet: 'dire_wolf', style: 'melee', aggro: true, speed: 3.4,
  drops: [['big_bones', 1, 1], ['wolf_pelt', 1, 0.45], ['crimson_charm', 1, 0.12]] });
mob('barrow_skeleton', { name: 'Barrow skeleton', lvl: 38, life: 92, atk: 22, def: 18, sheet: 'skeleton_warrior', style: 'melee', aggro: true,
  drops: [['bones', 1, 1], ['coins', [12, 40], 0.8], ['iron_sword', 1, 0.04], ['damaged_saxon_brooch', 1, 0.12], ['tome_attack', 1, 0.004]] });
// Fenwold
mob('witch_doctor', { name: 'Witch doctor', lvl: 42, life: 104, atk: 25, def: 19, sheet: 'witch_doctor', style: 'magic', aggro: true,
  drops: [['bones', 1, 1], ['water_rune', [4, 10], 0.6], ['nature_rune', [2, 7], 0.5], ['grimy_wolfsbane', 1, 0.3], ['magic_potion', 1, 0.06], ['tome_magic', 1, 0.004]] });
mob('fen_horror', { name: 'Fen horror', lvl: 52, life: 150, atk: 31, def: 24, sheet: 'fen_horror', style: 'melee', aggro: true, scale: 0.85,
  drops: [['big_bones', 1, 1], ['coins', [24, 70], 0.85], ['grimy_mandrake', 1, 0.3], ['cobalt_charm', 1, 0.2], ['fanged_ripper', 1, 0.004]] });
// Peaks & caves
mob('pebble_imp', { name: 'Pebble imp', lvl: 16, life: 36, atk: 8, def: 9, sheet: 'pebble_imp', style: 'melee',
  drops: [['coins', [4, 14], 0.8], ['copper_ore', 1, 0.4], ['tin_ore', 1, 0.4], ['iron_ore', 1, 0.2]] });
mob('cave_bat', { name: 'Cave bat', lvl: 14, life: 30, atk: 8, def: 6, sheet: 'cave_bat', style: 'melee', aggro: true, speed: 3.6,
  drops: [['bones', 1, 1], ['coins', [3, 12], 0.6]] });
mob('stone_golem', { name: 'Stone golem', lvl: 55, life: 170, atk: 32, def: 34, sheet: 'stone_golem', style: 'melee', aggro: true, speed: 1.8,
  drops: [['big_bones', 1, 1], ['coal', [1, 3], 0.5], ['silver_ore', 1, 0.3], ['gold_ore', 1, 0.15], ['sapphire', 1, 0.08], ['emerald', 1, 0.04], ['tome_mining', 1, 0.005]] });
mob('crag_raptor', { name: 'Crag raptor', lvl: 60, life: 176, atk: 37, def: 28, sheet: 'archeopteryx', style: 'melee', aggro: true, speed: 3.6, scale: 0.9,
  drops: [['big_bones', 1, 1], ['feathers', [8, 20], 1], ['raw_venison', 1, 0.4], ['amber_charm', 1, 0.2]] });
// Northmoor / winter
mob('winter_wolf', { name: 'Winter wolf', lvl: 58, life: 168, atk: 36, def: 30, sheet: 'winter_wolf', style: 'melee', aggro: true, speed: 3.5, scale: 1.15,
  drops: [['big_bones', 1, 1], ['wolf_pelt', 1, 0.5], ['sable_pelt', 1, 0.15], ['cobalt_charm', 1, 0.18]] });
mob('wild_reindeer', { name: 'Wild reindeer', lvl: 22, life: 60, atk: 8, def: 14, sheet: 'wild_reindeer', style: 'melee', speed: 3.2,
  drops: [['big_bones', 1, 1], ['raw_venison', [1, 2], 0.8]] });
mob('frost_wight', { name: 'Frost wight', lvl: 70, life: 230, atk: 44, def: 38, sheet: 'frost_wight', style: 'magic', aggro: true,
  drops: [['ancient_bones', 1, 1], ['water_rune', [6, 16], 0.7], ['cosmic_rune', [2, 7], 0.4], ['sage_elixir', 1, 0.02], ['tome_defence', 1, 0.005]] });
mob('lost_spirit', { name: 'Lost spirit', lvl: 66, life: 190, atk: 40, def: 30, sheet: 'lost_spirit', style: 'magic', aggro: true, shil: 2,
  drops: [['spirit_shard', [6, 16], 1], ['cosmic_rune', [2, 6], 0.5], ['crimson_charm', 1, 0.2], ['tome_summoning', 1, 0.006]] });
// Elderglade deep & Wild Lands
mob('gloom_moth', { name: 'Gloom moth', lvl: 64, life: 186, atk: 40, def: 30, sheet: 'gloom_moth', style: 'magic', aggro: true, speed: 3.0, scale: 0.55,
  drops: [['big_bones', 1, 1], ['nature_rune', [3, 9], 0.6], ['grimy_frostwort', 1, 0.25], ['verdant_charm', [1, 2], 0.3], ['tome_herblore', 1, 0.005]] });
mob('royal_moth', { name: 'Royal moth', lvl: 74, life: 250, atk: 48, def: 38, sheet: 'royal_moth', style: 'magic', aggro: true, speed: 3.1, scale: 0.55, shil: 2,
  drops: [['big_bones', 1, 1], ['cosmic_rune', [3, 9], 0.6], ['blood_rune', [1, 5], 0.4], ['amethyst', 1, 0.05], ['titan_brew', 1, 0.05]] });
mob('web_stalker', { name: 'Web stalker', lvl: 66, life: 240, atk: 42, def: 34, sheet: 'web_stalker', style: 'melee', aggro: true, scale: 0.8, shil: 2,
  drops: [['big_bones', 1, 1], ['coins', [40, 120], 0.9], ['fanged_ripper', 1, 0.006], ['crimson_charm', [1, 2], 0.3]] });
// Abyssal Depths
mob('cursed_skull', { name: 'Cursed skull', lvl: 45, life: 110, atk: 28, def: 20, sheet: 'cursed_skull', style: 'magic', aggro: true, dungeon: true, speed: 3.2,
  drops: [['coins', [20, 60], 0.8], ['blood_rune', [1, 4], 0.3], ['dungeon_key', 1, 0.2], ['tome_prayer', 1, 0.006]] });
mob('abyssal_sentinel', { name: 'Abyssal sentinel', lvl: 76, life: 300, atk: 50, def: 46, sheet: 'abyssal_sentinel', style: 'melee', aggro: true, dungeon: true, scale: 0.72, shil: 3,
  drops: [['ancient_bones', 1, 1], ['coins', [60, 180], 0.9], ['abyssal_edge', 1, 0.005], ['dungeon_key', 1, 0.3], ['abyssal_pearl', 1, 0.02]] });

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

// ---- Sheet-animated bosses ------------------------------------------------------
boss('badger_king', { name: 'The Badger King', lvl: 38, life: 560, atk: 28, def: 26, sheet: 'badger_king', style: 'melee', tier: 1, scale: 1.4,
  region: 'MEADOWS', drops: [['big_bones', 1, 1], ['blade_of_the_burrow', 1, 0.06], ['coins', [80, 240], 1], ['strength_potion', [1, 2], 0.5], ['tome_strength', 1, 0.03], ['war_boar', 1, 0.015], ['rabbit_fur', [4, 10], 1]] });
boss('frogger', { name: 'Frogger, Terror of the Fen', lvl: 48, life: 800, atk: 36, def: 30, sheet: 'frogger', style: 'magic', tier: 2, scale: 1.4,
  region: 'FENWOLD', drops: [['big_bones', 1, 1], ['tidebreaker_cutlass', 1, 0.05], ['water_rune', [12, 30], 1], ['coins', [120, 340], 1], ['tome_fishing', 1, 0.03], ['sapphire', 1, 0.3]] });
boss('pengu', { name: 'Pengu the Frozen Tyrant', lvl: 58, life: 980, atk: 44, def: 38, sheet: 'pengu', style: 'magic', tier: 2, scale: 1.5,
  region: 'FROSTHOLLOW', drops: [['big_bones', 1, 1], ['glacier_edge', 1, 0.045], ['water_rune', [15, 40], 1], ['coins', [160, 420], 1], ['tome_cooking', 1, 0.03], ['raw_frost_cod', [2, 6], 0.7]] });
boss('gollux', { name: 'Gollux the Cave Father', lvl: 65, life: 1250, atk: 50, def: 48, sheet: 'gollux', style: 'melee', tier: 3, scale: 1.5,
  region: 'PEAKS', drops: [['ancient_bones', 1, 1], ['gollux_greatblade', 1, 0.04], ['gold_ore', [3, 8], 0.9], ['emerald', 1, 0.35], ['ruby', 1, 0.2], ['coins', [220, 560], 1], ['tome_smithing', 1, 0.035]] });
boss('dino_tri', { name: 'Old Threehorn', lvl: 70, life: 1500, atk: 54, def: 52, sheet: 'dino_tri', style: 'melee', tier: 3, scale: 1.55,
  region: 'PEAKS', drops: [['ancient_bones', 1, 1], ['tyrants_cleaver', 1, 0.04], ['big_bones', [2, 4], 1], ['coins', [260, 640], 1], ['ruby', 1, 0.3], ['tome_constitution', 1, 0.035]] });
boss('dino_rex', { name: 'The Rex of the Wastes', lvl: 78, life: 1900, atk: 60, def: 54, sheet: 'dino_rex', style: 'melee', tier: 4, scale: 1.65,
  region: 'WILDLANDS', drops: [['ancient_bones', 1, 1], ['rexfang_saber', 1, 0.04], ['coins', [340, 820], 1], ['diamond', 1, 0.25], ['titan_brew', [1, 2], 0.4], ['tome_hunter', 1, 0.04]] });
boss('queen_aracnyx', { name: 'Queen Aracnyx', lvl: 85, life: 2300, atk: 66, def: 58, sheet: 'queen_aracnyx', style: 'melee', tier: 4, scale: 1.1, dungeon: true,
  drops: [['ancient_bones', 1, 1], ['aracnyx_talon', 1, 0.035], ['coins', [400, 950], 1], ['blood_rune', [8, 20], 0.8], ['amethyst', 1, 0.3], ['abyssal_pearl', 1, 0.08], ['tome_crafting', 1, 0.04]] });
boss('ice_beast', { name: 'The Ice Beast', lvl: 88, life: 2700, atk: 70, def: 62, sheet: 'ice_beast', style: 'magic', tier: 5, scale: 1.15,
  region: 'WILDLANDS', drops: [['ancient_bones', 1, 1], ['glacial_reaver', 1, 0.03], ['coins', [500, 1200], 1], ['diamond', 1, 0.4], ['sage_elixir', 1, 0.25], ['tome_ranged', 1, 0.04], ['royal_skywing', 1, 0.012]] });
boss('hellbeast', { name: 'The Hellbeast', lvl: 95, life: 3400, atk: 78, def: 68, sheet: 'hellbeast', style: 'melee', tier: 5, scale: 1.2, dungeon: true,
  drops: [['ancient_bones', 1, 1], ['hellrender', 1, 0.03], ['coins', [700, 1600], 1], ['blood_rune', [12, 30], 1], ['abyssal_pearl', 1, 0.2], ['kings_elixir', [1, 2], 0.6], ['tome_woodcutting', 1, 0.05]] });
boss('dragon_tyrant', { name: 'Vermithrax, the Three-Headed Tyrant', lvl: 99, life: 4500, atk: 86, def: 74, sheet: 'dragon_tyrant', style: 'magic', tier: 6, scale: 1.2, shil: 8, respawnMs: 300000,
  region: 'WILDLANDS', drops: [['ancient_bones', [2, 3], 1], ['dragonbane_greatsword', 1, 0.03], ['coins', [1000, 2400], 1], ['diamond', [1, 2], 0.5], ['abyssal_pearl', 1, 0.3], ['tome_farming', 1, 0.05], ['sylvanite_ore', [2, 5], 0.7], ['sky_screecher', 1, 0.012], ['aura_spectral', 1, 0.02]] });

// Vis for hair may be absent (helmets); critters are drawn by client code.
export const CRITTERS = ['rat', 'rabbit', 'boar', 'wolf', 'icewolf', 'hawk', 'leech', 'serpent', 'panther', 'treant', 'goat', 'troll', 'sprite', 'spider', 'giant'];

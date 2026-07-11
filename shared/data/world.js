// Authored world layout: region shapes are analytic rules in mapgen.js; this
// file pins down towns, buildings, stations, altars, patches, shortcuts,
// boss lairs, portals and mob spawn zones. Coordinates are tiles (576x576).
// North = low y (it gets colder as y shrinks); the Wild Lands (y<96) are PvP.

export const TOWNS = {
  loxley: {
    name: 'Loxley Village', cx: 252, cy: 332, r: 14,
    buildings: [
      { x: 243, y: 322, w: 6, h: 5, door: 'S', name: 'Bank of Loxley' },
      { x: 256, y: 321, w: 7, h: 5, door: 'S', name: "Much's Mill Kitchen" },
      { x: 242, y: 336, w: 5, h: 5, door: 'E', name: 'Forge' },
      { x: 259, y: 336, w: 6, h: 5, door: 'W', name: 'Chapel of St Dunstan' },
    ],
  },
  nottingham: {
    name: 'Nottingham', cx: 330, cy: 330, r: 22, walled: true,
    buildings: [
      { x: 318, y: 316, w: 7, h: 6, door: 'S', name: 'Bank of Nottingham' },
      { x: 336, y: 316, w: 8, h: 6, door: 'S', name: 'Grand Exchange' },
      { x: 318, y: 340, w: 6, h: 5, door: 'N', name: 'The Trip to Jerusalem Inn' },
      { x: 337, y: 340, w: 7, h: 5, door: 'N', name: 'Museum of Antiquities' },
      { x: 326, y: 302, w: 9, h: 7, door: 'S', name: 'Nottingham Castle', castle: true },
    ],
  },
  bay: {
    name: "Robin Hood's Bay", cx: 48, cy: 420, r: 13,
    buildings: [
      { x: 42, y: 410, w: 6, h: 5, door: 'S', name: 'Harbour Bank' },
      { x: 52, y: 410, w: 6, h: 5, door: 'S', name: 'Smokehouse' },
      { x: 42, y: 426, w: 7, h: 5, door: 'N', name: "The Mermaid's Rest" },
    ],
  },
  frosthollow: {
    name: 'Frosthollow', cx: 300, cy: 130, r: 13,
    buildings: [
      { x: 292, y: 121, w: 6, h: 5, door: 'S', name: 'Frosthollow Bank' },
      { x: 303, y: 121, w: 6, h: 5, door: 'S', name: 'Alpine Lodge' },
      { x: 292, y: 136, w: 7, h: 5, door: 'N', name: 'The Frozen Flagon' },
    ],
  },
};

// Stations / interactables placed at exact tiles: [nodeType, x, y]
export const POIS = [
  // --- Loxley (tutorial hub) ---
  ['bank_booth', 245, 326], ['range', 259, 323], ['furnace', 243, 337], ['anvil', 243, 339],
  ['chapel_altar', 262, 338], ['campfire', 250, 330],
  ['allotment', 244, 348], ['allotment', 247, 348], ['herb_patch', 250, 348],
  ['essence_rock', 271, 340], ['copper_rock', 268, 338], ['copper_rock', 269, 341], ['tin_rock', 270, 336], ['tin_rock', 272, 342],
  ['net_spot', 248, 358], ['rod_spot', 256, 358], ['rod_spot', 262, 358],
  ['house_portal', 240, 330],
  // --- Nottingham ---
  ['bank_booth', 320, 318], ['ge_booth', 339, 318], ['museum_bench', 339, 342],
  ['bakery_stall', 328, 330], ['fur_stall', 331, 330], ['silver_stall', 334, 330], ['gem_stall', 337, 330],
  ['range', 320, 342], ['chapel_altar', 322, 334], ['furnace', 344, 330], ['anvil', 345, 332],
  // --- Bay ---
  ['bank_booth', 44, 412], ['range', 54, 412],
  ['net_spot', 40, 434], ['net_spot', 44, 436], ['rod_spot', 50, 436], ['harpoon_spot', 56, 438],
  ['allotment', 60, 424], ['essence_rock', 62, 415],
  // --- Frosthollow ---
  ['bank_booth', 294, 123], ['range', 305, 123], ['furnace', 296, 138], ['anvil', 294, 138],
  ['harpoon_spot', 316, 128], ['harpoon_spot', 318, 132],
  // --- Sherwood interior ---
  ['obelisk', 276, 296], ['earth_altar', 320, 280], ['campfire', 262, 300],
  ['fox_trail', 282, 316], ['fox_trail', 300, 290], ['deer_track', 266, 282], ['deer_track', 290, 270],
  ['saxon_barrow', 340, 370], ['iron_rock', 356, 296], ['iron_rock', 358, 298], ['coal_rock', 360, 300],
  ['dungeon_entrance', 362, 288],
  // --- Meadows ---
  ['air_altar', 150, 300], ['roman_ruin', 120, 360], ['rabbit_run', 200, 330], ['rabbit_run', 210, 344],
  ['rabbit_run', 190, 320], ['herb_patch', 160, 320], ['allotment', 158, 316], ['allotment', 162, 316],
  // --- Fenwold ---
  ['water_altar', 420, 430], ['fen_totem', 0, 0],
  // --- Elderglade ---
  ['nature_altar', 270, 480], ['druid_circle', 250, 470], ['rope_swing', 300, 460],
  ['deer_track', 280, 465], ['deer_track', 310, 490],
  // --- Peaks ---
  ['fire_altar', 450, 300], ['dungeon_entrance', 470, 250], ['cliff_scramble', 440, 300],
  ['iron_rock', 455, 280], ['iron_rock', 457, 282], ['coal_rock', 460, 284], ['coal_rock', 462, 286],
  ['silver_rock', 468, 270], ['silver_rock', 470, 272], ['gold_rock', 480, 250], ['gold_rock', 484, 254],
  ['sylvanite_rock', 500, 230],
  // --- Northmoor ---
  ['cosmic_altar', 250, 150], ['norman_keep', 350, 170], ['sable_run', 260, 170], ['sable_run', 320, 180],
  ['frostpine_dummy', 0, 0],
  // --- Wild Lands (PvP) ---
  ['blood_altar', 300, 60], ['grail_shrine', 250, 70], ['ice_traverse', 200, 84],
  ['sylvanite_rock', 340, 70], ['sylvanite_rock', 344, 74], ['gold_rock', 352, 66],
].filter(p => p[1] > 0);

// Agility shortcuts: [type, x1, y1, x2, y2] — usable both directions.
export const SHORTCUTS = [
  ['log_balance', 240, 353, 240, 367],       // river crossing west of Loxley
  ['stepping_stones', 150, 353, 150, 367],   // river crossing in the meadows
  ['cliff_scramble', 438, 300, 452, 300],    // into the high Peaks
  ['rope_swing', 300, 458, 300, 472],        // over an Elderglade gorge
  ['ice_traverse', 200, 96, 200, 80],        // into the deep Wild Lands
];

// Mob spawn zones: { mob, x, y, r, n } — n concurrent spawns in radius r.
export const SPAWNS = [
  // Loxley / Meadows / Bay
  { mob: 'rat', x: 262, y: 344, r: 8, n: 6 }, { mob: 'rabbit', x: 205, y: 335, r: 14, n: 8 },
  { mob: 'boar', x: 180, y: 300, r: 16, n: 6 }, { mob: 'bandit', x: 140, y: 340, r: 16, n: 6 },
  { mob: 'bandit', x: 100, y: 380, r: 14, n: 5 }, { mob: 'gull_harpy', x: 70, y: 450, r: 16, n: 6 },
  { mob: 'smuggler', x: 84, y: 470, r: 14, n: 5 }, { mob: 'rat', x: 240, y: 320, r: 6, n: 3 },
  // Sherwood
  { mob: 'sherwood_wolf', x: 280, y: 280, r: 18, n: 7 }, { mob: 'outlaw', x: 300, y: 300, r: 20, n: 8 },
  { mob: 'poacher', x: 260, y: 300, r: 16, n: 6 }, { mob: 'sheriffs_guard', x: 340, y: 310, r: 14, n: 6 },
  { mob: 'elder_treant_sapling', x: 258, y: 268, r: 10, n: 4 },
  // Fenwold
  { mob: 'marsh_leech', x: 430, y: 440, r: 20, n: 8 }, { mob: 'bog_wraith', x: 460, y: 460, r: 18, n: 6 },
  { mob: 'fen_serpent', x: 490, y: 480, r: 18, n: 5 },
  // Elderglade
  { mob: 'wildwood_panther', x: 260, y: 490, r: 20, n: 6 }, { mob: 'druid_shade', x: 240, y: 470, r: 16, n: 5 },
  { mob: 'vine_horror', x: 300, y: 500, r: 18, n: 5 },
  // Peaks
  { mob: 'mountain_goat', x: 450, y: 320, r: 20, n: 7 }, { mob: 'eyrie_hawk', x: 480, y: 280, r: 18, n: 5 },
  { mob: 'crag_troll', x: 500, y: 250, r: 18, n: 5 },
  // Northmoor
  { mob: 'moor_brigand', x: 340, y: 160, r: 20, n: 6 }, { mob: 'ice_wolf', x: 260, y: 140, r: 20, n: 6 },
  { mob: 'frost_sprite', x: 300, y: 170, r: 16, n: 5 },
  // Wild Lands (PvP)
  { mob: 'revenant_knight', x: 300, y: 50, r: 24, n: 6 }, { mob: 'wight_archer', x: 240, y: 60, r: 20, n: 5 },
  { mob: 'frost_revenant', x: 360, y: 40, r: 20, n: 4 },
];

// Boss lairs: fixed single spawns
export const BOSS_SPAWNS = [
  { mob: 'elder_treant', x: 255, y: 262 },
  { mob: 'fenwyrm', x: 470, y: 475 },
  { mob: 'guy_of_gisborne', x: 385, y: 150 },
  { mob: 'sheriff_of_nottingham', x: 330, y: 305 },
  { mob: 'troll_king', x: 505, y: 220 },
  { mob: 'frost_giant', x: 300, y: 38 },
];

// Teleport anchors (magic spells + respawn)
export const ANCHORS = {
  loxley: { x: 252, y: 332 }, nottingham: { x: 330, y: 332 },
  bay: { x: 48, y: 420 }, frosthollow: { x: 300, y: 130 },
  colosseum_lobby: { x: 322, y: 336 },
};

// The Colosseum arena lives on its own plane; simple square arena.
export const ARENA = { plane: 1, x1: 4, y1: 4, x2: 27, y2: 27, spawnA: { x: 8, y: 15 }, spawnB: { x: 23, y: 15 }, size: 32 };

// Player houses: 24x24 plot per player on plane HOUSE_BASE + idx
export const HOUSE = { size: 24, door: { x: 12, y: 20 }, hotspots: [
  { id: 'wooden_chair', x: 9, y: 9 }, { id: 'oak_table', x: 12, y: 9 }, { id: 'bed', x: 15, y: 9 },
  { id: 'bookcase', x: 9, y: 12 }, { id: 'house_altar', x: 12, y: 12 }, { id: 'stone_range', x: 15, y: 12 },
  { id: 'workbench', x: 9, y: 15 }, { id: 'trophy_hall', x: 12, y: 15 }, { id: 'greenwood_throne', x: 15, y: 15 },
] };

// Dungeon floors: 48x48 seeded layouts on planes DUNGEON_BASE + floor
export const DUNGEON_MAP = { size: 48 };

// World events
export const EVENTS = [
  { id: 'convoy', name: "The Sheriff's Convoy", desc: 'A tax convoy rolls north! Raid the strongbox on the North Road.', x: 318, y: 240, everyMin: 22, durMin: 6 },
  { id: 'golden_stag', name: 'The Golden Stag', desc: 'A golden stag has been sighted — first hunters to fell it share its blessing.', x: 220, y: 290, everyMin: 31, durMin: 8 },
  { id: 'archery_contest', name: 'Nottingham Archery Contest', desc: 'Hit the butts! Most hits before the horn wins $Shillings.', x: 348, y: 336, everyMin: 45, durMin: 5 },
];

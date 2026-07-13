// Authored world layout: region shapes are analytic rules in mapgen.js; this
// file pins down towns, buildings, stations, altars, patches, shortcuts,
// boss lairs, portals and mob spawn zones.
// NOTE: coordinates below are authored on the original 576x576 grid and are
// scaled by WORLD.SCALE (1.5 -> 864x864) at the bottom of this file.
// North = low y (it gets colder as y shrinks); the Wild Lands are PvP.
import { WORLD } from '../constants.js';

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
    name: 'Nottingham', cx: 330, cy: 330, r: 30, walled: true,
    buildings: [
      { x: 303, y: 322, w: 7, h: 6, door: 'S', name: 'Bank of Nottingham' },
      // The Grand Exchange: a single vast, heavily fortified stone hall in the
      // grounds of Nottingham Castle — high player traffic, and the only place
      // $LoS is cashed out to chain. Four tellers work a circular desk at centre.
      { x: 316, y: 311, w: 28, h: 18, door: 'S', name: 'Grand Exchange', ge: true, fortified: true },
      { x: 305, y: 340, w: 6, h: 5, door: 'N', name: 'The Trip to Jerusalem Inn' },
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
  // --- settlements of the wider realm ---
  edwinstowe: {
    name: 'Edwinstowe Hamlet', cx: 196, cy: 358, r: 10,
    buildings: [
      { x: 190, y: 350, w: 5, h: 4, door: 'S', name: 'Hodge Farmhouse' },
      { x: 200, y: 352, w: 5, h: 4, door: 'S', name: 'The Granary' },
    ],
  },
  wyckham: {
    name: 'Wyckham-on-Fen', cx: 400, cy: 410, r: 9,
    buildings: [
      { x: 394, y: 404, w: 5, h: 4, door: 'S', name: 'The Eelhouse' },
      { x: 403, y: 405, w: 5, h: 4, door: 'S', name: 'Fenside Rest' },
    ],
  },
  peveril: {
    name: 'Peveril Stronghold', cx: 352, cy: 168, r: 12, walled: true,
    buildings: [
      { x: 346, y: 160, w: 8, h: 6, door: 'S', name: 'Peveril Keep', castle: true },
      { x: 357, y: 170, w: 5, h: 4, door: 'W', name: 'The Barracks' },
    ],
  },
  greywatch: {
    name: 'Greywatch Outpost', cx: 434, cy: 296, r: 7,
    buildings: [
      { x: 431, y: 291, w: 5, h: 4, door: 'S', name: 'Greywatch Tower', castle: true },
    ],
  },
};

// The Grand Exchange teller room laid out like a bank floor: a full-width wooden
// desk divide across the hall (blocking counter segments + glazed teller windows)
// with the clerks working behind it, and rope-stanchion queue lanes out front
// (purely decorative — any number of players can be served at once).
function geFurniture() {
  const out = [], windows = new Set([320, 324, 328, 332, 336]);   // teller window columns
  for (let x = 317; x <= 342; x++) out.push([windows.has(x) ? 'ge_window' : 'ge_counter', x, 316]);
  for (const y of [319, 321, 323]) for (const x of [318, 322, 326, 330, 334, 338, 341]) out.push(['ge_rope', x, y]);
  return out;
}

// Stations / interactables placed at exact tiles: [nodeType, x, y]
export const POIS = [
  // --- Loxley (tutorial hub) ---
  ['bank_booth', 245, 326], ['range', 259, 323], ['furnace', 243, 337], ['anvil', 243, 339],
  ['chapel_altar', 262, 338], ['campfire', 250, 330],
  ['allotment', 244, 348], ['allotment', 247, 348], ['herb_patch', 250, 348],
  ['essence_rock', 271, 340], ['copper_rock', 268, 338], ['copper_rock', 269, 341], ['tin_rock', 270, 336], ['tin_rock', 272, 342],
  ['net_spot', 248, 358], ['rod_spot', 256, 358], ['rod_spot', 262, 358],
  ['house_portal', 240, 330], ['loom', 258, 327], ['tanning_rack', 246, 341],
  // --- Nottingham ---
  ['bank_booth', 305, 324], ...geFurniture(), ['museum_bench', 339, 342],
  ['bakery_stall', 328, 330], ['fur_stall', 331, 330], ['silver_stall', 334, 330], ['gem_stall', 337, 330],
  ['range', 320, 342], ['chapel_altar', 322, 334], ['furnace', 344, 330], ['anvil', 345, 332], ['loom', 342, 334], ['tanning_rack', 347, 334],
  // --- Bay ---
  ['bank_booth', 44, 412], ['range', 54, 412],
  ['net_spot', 26, 436], ['net_spot', 24, 442], ['rod_spot', 22, 448], ['harpoon_spot', 24, 455],
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
  ['air_altar', 150, 300], ['roman_ruin', 178, 386], ['rabbit_run', 200, 330], ['rabbit_run', 210, 344],
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
  // --- Edwinstowe (farm hamlet) ---
  ['allotment', 192, 361], ['allotment', 195, 361], ['allotment', 198, 361], ['allotment', 201, 361],
  ['herb_patch', 192, 364], ['herb_patch', 196, 364], ['range', 202, 355], ['loom', 190, 355],
  // --- Wyckham-on-Fen (fishing village) ---
  ['rod_spot', 396, 416], ['rod_spot', 400, 417], ['net_spot', 404, 416],
  ['range', 398, 407], ['tanning_rack', 405, 410],
  // --- Peveril Stronghold ---
  ['bank_booth', 348, 167], ['anvil', 356, 175], ['furnace', 353, 175], ['chapel_altar', 347, 172],
  // --- Greywatch Outpost ---
  ['campfire', 434, 298],
  // --- bandit camps (fires mark the camps; the company around them is hostile) ---
  ['campfire', 120, 320], ['campfire', 300, 236], ['campfire', 240, 120],
  // --- river & pool fisheries (snapped onto open water at generation; the
  //     spot tier climbs with the region's level band) ---
  ['net_spot', 168, 328], ['rod_spot', 171, 332],          // Barnsdale pond
  ['net_spot', 120, 299],                                  // west meadows pool
  ['rod_spot', 237, 304], ['rod_spot', 240, 308],          // west Sherwood pool
  ['rod_spot', 300, 361],                                  // a deep bend of the Trent
  ['rod_spot', 280, 205], ['harpoon_spot', 271, 211],      // Northmoor river & pool
  ['harpoon_spot', 452, 179],                              // Grey Peaks tarn
  ['harpoon_spot', 491, 107], ['harpoon_spot', 494, 110],  // alpine tarn (top tier)
  ['rod_spot', 485, 410], ['rod_spot', 488, 414],          // Fenwold broadwater
  ['harpoon_spot', 470, 506],                              // the deep fen river
  ['rod_spot', 261, 473], ['rod_spot', 264, 476],          // Elderglade pool
  ['harpoon_spot', 329, 73], ['harpoon_spot', 332, 76],    // Wild Lands frozen pool
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
// Zones are ordered by region and tuned so each region's mobs sit inside its
// intended level band (see REGIONS in constants.js).
export const SPAWNS = [
  // Loxley outskirts / Barnsdale Meadows / Bay (levels 1-20)
  { mob: 'rat', x: 262, y: 344, r: 8, n: 6 }, { mob: 'rat', x: 240, y: 320, r: 6, n: 4 },
  { mob: 'rat', x: 270, y: 360, r: 10, n: 5 },
  { mob: 'rabbit', x: 205, y: 335, r: 14, n: 8 }, { mob: 'rabbit', x: 175, y: 360, r: 14, n: 6 },
  { mob: 'goblin', x: 222, y: 300, r: 12, n: 6 }, { mob: 'goblin', x: 195, y: 385, r: 14, n: 6 },
  { mob: 'boar', x: 180, y: 300, r: 16, n: 6 }, { mob: 'boar', x: 150, y: 270, r: 16, n: 6 },
  { mob: 'bandit', x: 140, y: 340, r: 16, n: 6 }, { mob: 'bandit', x: 185, y: 398, r: 10, n: 5 },
  { mob: 'goblin_archer', x: 120, y: 300, r: 14, n: 5 }, { mob: 'bandit', x: 165, y: 420, r: 14, n: 5 },
  { mob: 'gull_harpy', x: 70, y: 450, r: 16, n: 6 }, { mob: 'gull_harpy', x: 45, y: 490, r: 14, n: 5 },
  { mob: 'smuggler', x: 84, y: 470, r: 14, n: 5 }, { mob: 'smuggler', x: 60, y: 510, r: 14, n: 5 },
  { mob: 'boar', x: 120, y: 440, r: 14, n: 5 },
  // Sherwood Forest (levels 10-40)
  { mob: 'sherwood_wolf', x: 280, y: 280, r: 18, n: 7 }, { mob: 'sherwood_wolf', x: 310, y: 262, r: 16, n: 6 },
  { mob: 'outlaw', x: 300, y: 300, r: 20, n: 8 }, { mob: 'outlaw', x: 262, y: 322, r: 12, n: 5 },
  { mob: 'poacher', x: 260, y: 300, r: 16, n: 6 }, { mob: 'poacher', x: 322, y: 288, r: 14, n: 5 },
  { mob: 'goblin_raider', x: 246, y: 282, r: 14, n: 6 }, { mob: 'brown_bear', x: 292, y: 252, r: 16, n: 4 },
  { mob: 'sheriffs_guard', x: 340, y: 310, r: 14, n: 6 }, { mob: 'sheriffs_guard', x: 352, y: 336, r: 12, n: 5 },
  // Grand Exchange garrison — elite guards ring the fortified hall (passive unless attacked)
  { mob: 'ge_guard', x: 330, y: 331, r: 3, n: 4 },   // south approach & doors
  { mob: 'ge_guard', x: 313, y: 319, r: 2, n: 2 }, { mob: 'ge_guard', x: 346, y: 319, r: 2, n: 2 }, // flanks
  { mob: 'elder_treant_sapling', x: 258, y: 268, r: 10, n: 4 }, { mob: 'brown_bear', x: 330, y: 270, r: 14, n: 4 },
  // Fenwold swamp (levels 25-50)
  { mob: 'marsh_leech', x: 430, y: 440, r: 20, n: 8 }, { mob: 'marsh_leech', x: 405, y: 470, r: 16, n: 6 },
  { mob: 'lizardfolk', x: 445, y: 415, r: 16, n: 6 }, { mob: 'lizardfolk', x: 478, y: 445, r: 16, n: 6 },
  { mob: 'bog_wraith', x: 460, y: 460, r: 18, n: 6 }, { mob: 'bog_wraith', x: 500, y: 430, r: 14, n: 5 },
  { mob: 'fen_serpent', x: 490, y: 480, r: 18, n: 5 }, { mob: 'lizardfolk_shaman', x: 512, y: 466, r: 14, n: 4 },
  { mob: 'fen_serpent', x: 440, y: 505, r: 16, n: 5 },
  // Elderglade Wildwood (levels 35-60)
  { mob: 'wildwood_panther', x: 260, y: 490, r: 20, n: 6 }, { mob: 'wildwood_panther', x: 300, y: 470, r: 16, n: 5 },
  { mob: 'druid_shade', x: 240, y: 470, r: 16, n: 5 }, { mob: 'druid_shade', x: 215, y: 500, r: 14, n: 5 },
  { mob: 'vine_horror', x: 300, y: 500, r: 18, n: 5 }, { mob: 'vine_horror', x: 330, y: 516, r: 12, n: 4 },
  { mob: 'minotaur', x: 275, y: 518, r: 10, n: 2 },
  // Grey Peaks (levels 40-70)
  { mob: 'mountain_goat', x: 450, y: 320, r: 20, n: 7 }, { mob: 'mountain_goat', x: 470, y: 350, r: 16, n: 6 },
  { mob: 'eyrie_hawk', x: 480, y: 280, r: 18, n: 5 }, { mob: 'eyrie_hawk', x: 512, y: 300, r: 16, n: 5 },
  { mob: 'orc_raider', x: 462, y: 240, r: 16, n: 6 }, { mob: 'orc_raider', x: 495, y: 330, r: 14, n: 5 },
  { mob: 'crag_troll', x: 500, y: 250, r: 18, n: 5 }, { mob: 'crag_troll', x: 525, y: 280, r: 14, n: 4 },
  { mob: 'minotaur', x: 535, y: 240, r: 12, n: 2 },
  // Northmoor (levels 55-80)
  { mob: 'moor_brigand', x: 340, y: 160, r: 20, n: 6 }, { mob: 'moor_brigand', x: 290, y: 185, r: 16, n: 5 },
  { mob: 'ice_wolf', x: 260, y: 140, r: 20, n: 6 }, { mob: 'ice_wolf', x: 210, y: 165, r: 16, n: 5 },
  { mob: 'frost_sprite', x: 300, y: 170, r: 16, n: 5 }, { mob: 'frost_sprite', x: 380, y: 175, r: 14, n: 5 },
  { mob: 'orc_warlord', x: 405, y: 155, r: 14, n: 3 }, { mob: 'orc_raider', x: 240, y: 185, r: 14, n: 5 },
  // Wild Lands (PvP, levels 70+)
  { mob: 'revenant_knight', x: 300, y: 50, r: 24, n: 6 }, { mob: 'revenant_knight', x: 210, y: 70, r: 18, n: 5 },
  { mob: 'wight_archer', x: 240, y: 60, r: 20, n: 5 }, { mob: 'wight_archer', x: 350, y: 75, r: 16, n: 5 },
  { mob: 'frost_revenant', x: 360, y: 40, r: 20, n: 4 }, { mob: 'frost_revenant', x: 150, y: 55, r: 16, n: 4 },
  { mob: 'orc_warlord', x: 420, y: 60, r: 16, n: 4 },
  // ---- farm animals: pastures by the hamlets (passive; milk/shear, not fight) ----
  { mob: 'cow', x: 200, y: 366, r: 6, n: 4 }, { mob: 'sheep', x: 194, y: 370, r: 6, n: 5 },
  { mob: 'pig_farm', x: 189, y: 364, r: 4, n: 3 }, { mob: 'horse', x: 204, y: 362, r: 5, n: 2 },
  { mob: 'farm_dog', x: 196, y: 360, r: 4, n: 1 }, { mob: 'alpaca', x: 190, y: 372, r: 4, n: 3 },
  { mob: 'cow', x: 250, y: 350, r: 6, n: 3 }, { mob: 'sheep', x: 256, y: 352, r: 6, n: 4 },   // Loxley allotments
  { mob: 'sheep', x: 62, y: 426, r: 5, n: 3 }, { mob: 'pig_farm', x: 58, y: 424, r: 4, n: 2 }, // Bay
  // ---- bandit camps & outposts (tight clusters around their campfires) ----
  { mob: 'bandit', x: 120, y: 320, r: 4, n: 5 }, { mob: 'marauder', x: 122, y: 322, r: 4, n: 3 },
  { mob: 'outlaw', x: 300, y: 236, r: 4, n: 5 }, { mob: 'marauder', x: 302, y: 238, r: 4, n: 3 },
  { mob: 'moor_brigand', x: 240, y: 120, r: 5, n: 5 },
  { mob: 'sheriffs_guard', x: 434, y: 300, r: 4, n: 4 },     // Greywatch garrison
  { mob: 'sheriffs_guard', x: 352, y: 176, r: 5, n: 4 },     // Peveril gate watch
  // ---- Sheet-animated mobs (new packs) ----
  // Meadows / Loxley / Bay starters
  { mob: 'meadow_hare', x: 195, y: 345, r: 14, n: 7 }, { mob: 'meadow_hare', x: 168, y: 310, r: 12, n: 5 },
  { mob: 'horned_hare', x: 150, y: 330, r: 12, n: 4 }, { mob: 'wild_hog', x: 235, y: 350, r: 10, n: 5 },
  { mob: 'shore_crab', x: 56, y: 442, r: 12, n: 6 }, { mob: 'shore_crab', x: 38, y: 470, r: 12, n: 5 },
  { mob: 'spiked_slime', x: 210, y: 372, r: 12, n: 5 }, { mob: 'spiked_slime', x: 246, y: 306, r: 10, n: 4 },
  // Sherwood & roads
  { mob: 'tusked_boar', x: 268, y: 258, r: 14, n: 5 }, { mob: 'tusked_boar', x: 318, y: 246, r: 12, n: 4 },
  { mob: 'marauder', x: 296, y: 320, r: 14, n: 5 }, { mob: 'marauder', x: 232, y: 262, r: 12, n: 4 },
  { mob: 'dire_wolf', x: 252, y: 240, r: 14, n: 5 }, { mob: 'dire_wolf', x: 286, y: 508, r: 14, n: 4 },
  { mob: 'barrow_skeleton', x: 340, y: 372, r: 8, n: 5 }, { mob: 'cave_bat', x: 360, y: 292, r: 8, n: 5 },
  // Fenwold
  { mob: 'witch_doctor', x: 470, y: 440, r: 14, n: 5 }, { mob: 'witch_doctor', x: 508, y: 484, r: 12, n: 4 },
  { mob: 'fen_horror', x: 452, y: 492, r: 14, n: 4 }, { mob: 'fen_horror', x: 500, y: 452, r: 12, n: 3 },
  // Peaks foothills & high crags
  { mob: 'pebble_imp', x: 436, y: 336, r: 12, n: 6 }, { mob: 'pebble_imp', x: 452, y: 302, r: 10, n: 4 },
  { mob: 'stone_golem', x: 490, y: 262, r: 14, n: 4 }, { mob: 'stone_golem', x: 520, y: 300, r: 12, n: 3 },
  { mob: 'crag_raptor', x: 502, y: 236, r: 14, n: 4 }, { mob: 'crag_raptor', x: 468, y: 214, r: 12, n: 3 },
  // Northmoor & winter reaches
  { mob: 'winter_wolf', x: 236, y: 152, r: 16, n: 5 }, { mob: 'winter_wolf', x: 316, y: 142, r: 14, n: 4 },
  { mob: 'wild_reindeer', x: 276, y: 168, r: 16, n: 5 }, { mob: 'wild_reindeer', x: 330, y: 190, r: 12, n: 4 },
  { mob: 'frost_wight', x: 258, y: 120, r: 14, n: 4 }, { mob: 'lost_spirit', x: 352, y: 172, r: 10, n: 3 },
  { mob: 'lost_spirit', x: 342, y: 368, r: 6, n: 2 },
  // Elderglade deep & Wild Lands
  { mob: 'gloom_moth', x: 292, y: 486, r: 14, n: 4 }, { mob: 'gloom_moth', x: 226, y: 508, r: 12, n: 3 },
  { mob: 'web_stalker', x: 316, y: 520, r: 10, n: 2 }, { mob: 'web_stalker', x: 214, y: 78, r: 10, n: 2 },
  { mob: 'royal_moth', x: 262, y: 62, r: 14, n: 3 }, { mob: 'frost_wight', x: 322, y: 66, r: 14, n: 3 },
];

// Boss lairs: fixed single spawns
export const BOSS_SPAWNS = [
  { mob: 'elder_treant', x: 255, y: 262 },
  { mob: 'fenwyrm', x: 470, y: 475 },
  { mob: 'guy_of_gisborne', x: 385, y: 150 },
  { mob: 'sheriff_of_nottingham', x: 330, y: 305 },
  { mob: 'troll_king', x: 505, y: 220 },
  { mob: 'frost_giant', x: 300, y: 38 },
  // Sheet-animated boss lairs
  { mob: 'badger_king', x: 176, y: 386 },      // Barnsdale burrow
  { mob: 'frogger', x: 428, y: 508 },          // Fenwold lily pool
  { mob: 'pengu', x: 328, y: 118 },            // icefloe north of Frosthollow
  { mob: 'gollux', x: 486, y: 244 },           // Grey Peaks cave mouth
  { mob: 'dino_tri', x: 530, y: 266 },         // high crag plateau
  { mob: 'dino_rex', x: 388, y: 52 },          // Wild Lands wastes
  { mob: 'ice_beast', x: 178, y: 40 },         // deep Wild Lands glacier
  { mob: 'dragon_tyrant', x: 300, y: 16 },     // the far northern scar
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
  { id: 'archery_contest', name: 'Nottingham Archery Contest', desc: 'Hit the butts! Most hits before the horn wins $LoS.', x: 348, y: 336, everyMin: 45, durMin: 5 },
];

// ---------------------------------------------------------------------------
// Scale every authored overworld coordinate to the live world size (planes
// like the arena, houses and dungeons keep their own small grids).
// Points that sit inside (or within 2 tiles of) a building are moved WITH that
// building — preserving their exact relative position — so booths, stations
// and NPCs stay correctly placed inside scaled towns.
const K = WORLD.SCALE || 1;
const _origBuildings = [];
if (K !== 1) {
  for (const t of Object.values(TOWNS)) {
    for (const b of t.buildings) _origBuildings.push({ ox: b.x, oy: b.y, w: b.w, h: b.h, ref: b });
    t.cx = Math.round(t.cx * K); t.cy = Math.round(t.cy * K); t.r = Math.round(t.r * K);
    for (const b of t.buildings) { b.x = Math.round(b.x * K); b.y = Math.round(b.y * K); }
  }
}
export function remapPoint(x, y) {
  if (K === 1) return [x, y];
  for (const b of _origBuildings) {
    if (x >= b.ox - 2 && x < b.ox + b.w + 2 && y >= b.oy - 2 && y < b.oy + b.h + 2)
      return [b.ref.x + (x - b.ox), b.ref.y + (y - b.oy)];
  }
  return [Math.round(x * K), Math.round(y * K)];
}
if (K !== 1) {
  for (const p of POIS) { const [nx, ny] = remapPoint(p[1], p[2]); p[1] = nx; p[2] = ny; }
  for (const s of SHORTCUTS) {
    [s[1], s[2]] = remapPoint(s[1], s[2]);
    [s[3], s[4]] = remapPoint(s[3], s[4]);
  }
  for (const s of SPAWNS) { s.x = Math.round(s.x * K); s.y = Math.round(s.y * K); s.r = Math.round(s.r * K); }
  for (const b of BOSS_SPAWNS) { b.x = Math.round(b.x * K); b.y = Math.round(b.y * K); }
  for (const a of Object.values(ANCHORS)) { a.x = Math.round(a.x * K); a.y = Math.round(a.y * K); }
  for (const ev of EVENTS) { ev.x = Math.round(ev.x * K); ev.y = Math.round(ev.y * K); }
}

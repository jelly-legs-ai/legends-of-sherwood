// NPCs: position, LPC visuals, dialogue, shops, quest hooks, pickpocketing.
// Dialogue: array of lines, or keyed stages driven by quest state (server picks).

export const NPCS = {};
function npc(id, o) { NPCS[id] = { id, wander: 0, ...o }; return NPCS[id]; }

// ---------------- Loxley (tutorial hub) ----------------
npc('robin_hood', {
  name: 'Robin Hood', x: 251, y: 328, quest: 'a_legend_begins',
  vis: { skin: 'light', hair: ['plain', 'light_brown'], torso: ['tunic', 'green'], legs: ['pants', 'brown'], head: ['hood', 'green'], weapon: ['bow', 'medium'] },
  lines: ['Welcome to Sherwood, friend. The Sheriff bleeds these lands dry — we could use another pair of hands.'],
});
npc('maid_marian', {
  name: 'Maid Marian', x: 255, y: 330, quest: 'marians_message',
  vis: { skin: 'light', hair: ['braid', 'dark_brown'], torso: ['longsleeve', 'blue'], legs: ['pants', 'white'] },
  lines: ['A word, traveller? I have a letter that must reach Nottingham... discreetly.'],
});
npc('friar_tuck', {
  name: 'Friar Tuck', x: 261, y: 339, quest: 'tucks_faith', tutor: 'prayer',
  vis: { skin: 'light', hair: ['balding_fallback', 'gray'], beard: 'gray', torso: ['robe', 'brown'], legs: ['pants', 'brown'], weapon: ['staff', 'medium'] },
  lines: ['Bless you, child. Bury the bones of the fallen and the saints will lend you strength.', 'The chapel altar restores your prayers.'],
});
npc('much_the_miller', {
  name: "Much the Miller's Son", x: 258, y: 324, quest: 'the_millers_grain', tutor: 'cooking',
  vis: { skin: 'light', hair: ['bedhead', 'blonde'], torso: ['longsleeve', 'white'], legs: ['pants', 'brown'] },
  shop: [['bread', 8], ['raw_perch', 6], ['barley', 10], ['potato_seed', 4], ['cabbage_seed', 6], ['barley_seed', 8], ['vial_water', 4]],
  lines: ['Fresh bread! Well — fresh enough.'],
});
npc('wat_the_smith', {
  name: 'Wat the Smith', x: 244, y: 340, tutor: 'smithing',
  vis: { skin: 'brown', hair: ['buzzcut', 'black'], torso: ['leather', 'brown'], legs: ['pants', 'charcoal'], hands: ['gloves', 'leather'] },
  shop: [['hammer', 12], ['copper_pickaxe', 25], ['copper_hatchet', 25], ['copper_dagger', 15], ['copper_sword', 30], ['knife', 8], ['tinderbox', 10], ['copper_arrow', 2], ['shortbow', 25], ['apprentice_staff', 25]],
  lines: ['A dull blade never fed a family. What do you need?'],
});
npc('old_agnes', {
  name: 'Old Agnes', x: 249, y: 347, tutor: 'farming',
  vis: { skin: 'taupe', hair: ['plain', 'gray'], torso: ['longsleeve', 'green'], legs: ['pants', 'brown'] },
  shop: [['potato_seed', 4], ['cabbage_seed', 6], ['barley_seed', 8], ['flax_seed', 10], ['yarrow_seed', 15], ['secateurs', 10], ['spade', 10]],
  lines: ['Soil remembers kindness. Plant, water, wait — the meadows do the rest.'],
});
npc('loxley_banker', {
  name: 'Banker Odo', x: 246, y: 324, banker: true,
  vis: { skin: 'light', hair: ['plain', 'black'], torso: ['longsleeve', 'charcoal'], legs: ['pants', 'black'] },
  lines: ['Your goods are safe with the Bank of Loxley. Safer than with the Sheriff, at least.'],
});
npc('peasant', {
  name: 'Peasant', x: 253, y: 336, wander: 4, pickpocket: { lvl: 1, xp: 12, loot: [['coins', [1, 5]]] },
  vis: { skin: 'light', hair: ['bedhead', 'light_brown'], torso: ['longsleeve', 'brown'], legs: ['pants', 'walnut'] },
  lines: ['Hard times, friend. Hard times.'],
});

// ---------------- Nottingham ----------------
npc('alan_a_dale', {
  name: 'Alan-a-Dale', x: 321, y: 342, quest: 'marians_message_target',
  vis: { skin: 'light', hair: ['curly_long', 'ginger'], torso: ['longsleeve', 'red'], legs: ['pants', 'charcoal'] },
  lines: ['A song for a shilling? Or news for free — the Colosseum pays fighters in $Shillings, real ones.'],
});
npc('nottingham_banker', {
  name: 'Banker Reginald', x: 321, y: 318, banker: true,
  vis: { skin: 'olive', hair: ['plain', 'black'], torso: ['longsleeve', 'charcoal'], legs: ['pants', 'black'] },
  lines: ['The Bank of Nottingham never sleeps. Mostly because of the rats.'],
});
npc('ge_clerk', {
  name: 'Exchange Clerk Hild', x: 340, y: 318, geClerk: true,
  vis: { skin: 'light', hair: ['bangs', 'blonde'], torso: ['longsleeve', 'white'], legs: ['pants', 'black'] },
  lines: ['Buy low, sell high — all offers settled in $Shillings, the only honest coin left in England.'],
});
npc('colosseum_marshal', {
  name: 'Marshal Brand', x: 323, y: 336, marshal: true,
  vis: { skin: 'brown', hair: ['buzzcut', 'black'], torso: ['plate', 'iron'], legs: ['plate', 'iron'], weapon: ['spear', 'steel'] },
  lines: ['Care to wager your $Shillings on your own blood? Challenge another warrior, agree a stake, and the pot is winner-takes-all. I keep five parts in a hundred for the sand.'],
});
npc('fletcher_ansel', {
  name: 'Fletcher Ansel', x: 336, y: 334, tutor: 'fletching',
  vis: { skin: 'light', hair: ['plain', 'chestnut_fallback'], torso: ['leather', 'forest'], legs: ['pants', 'brown'], weapon: ['bow', 'normal'] },
  shop: [['knife', 8], ['feathers', 2], ['bowstring', 35], ['shortbow', 25], ['ash_bow', 90], ['copper_arrow', 2], ['bronze_arrow', 4], ['iron_arrow', 8], ['iron_bolts', 10], ['crossbow_stock', 60], ['quiver', 40]],
  lines: ['A straight arrow is an honest answer to a crooked law.'],
});
npc('apothecary_edith', {
  name: 'Apothecary Edith', x: 327, y: 334, tutor: 'herblore',
  vis: { skin: 'taupe', hair: ['braid', 'gray'], torso: ['robe', 'forest'], legs: ['pants', 'black'] },
  shop: [['vial_water', 4], ['grimy_nettle', 10], ['secateurs', 10], ['fishing_bait', 1]],
  lines: ['Every weed is a remedy to those who listen.'],
});
npc('curator_bede', {
  name: 'Curator Bede', x: 340, y: 343, tutor: 'archaeology',
  vis: { skin: 'light', hair: ['plain', 'gray'], beard: 'gray', torso: ['robe', 'blue'], legs: ['pants', 'black'] },
  shop: [['trowel', 12], ['spade', 10]],
  lines: ['History sleeps beneath our boots. Bring me what you unearth — restored, it will teach us all.'],
});
npc('taskmaster_gil', {
  name: 'Taskmaster Gil', x: 330, y: 338, taskboard: true,
  vis: { skin: 'light', hair: ['bedhead', 'black'], torso: ['longsleeve', 'charcoal'], legs: ['pants', 'brown'] },
  lines: ['Work for coin, coin for work. Take a task, do it, get paid. Simple as.'],
});
npc('merchant', {
  name: 'Merchant', x: 332, y: 328, wander: 5, pickpocket: { lvl: 20, xp: 45, loot: [['coins', [8, 24]]] },
  vis: { skin: 'olive', hair: ['plain', 'black'], torso: ['longsleeve', 'red'], legs: ['pants', 'black'] },
  lines: ['Finest wares this side of the Trent!'],
});
npc('noble', {
  name: 'Norman noble', x: 328, y: 320, wander: 5, pickpocket: { lvl: 45, xp: 110, loot: [['coins', [25, 70]], ['sapphire', 1, 0.05]] },
  vis: { skin: 'light', hair: ['plain', 'blonde'], torso: ['longsleeve', 'blue'], legs: ['pants', 'white'] },
  lines: ['Out of my way, churl.'],
});
npc('castle_knight', {
  name: 'Castle knight', x: 330, y: 312, wander: 3, pickpocket: { lvl: 70, xp: 230, loot: [['coins', [60, 150]], ['kings_elixir', 1, 0.03]] },
  vis: { skin: 'light', torso: ['plate', 'steel'], legs: ['plate', 'steel'], head: ['greathelm', 'steel'], weapon: ['sword', 'steel'] },
  lines: ['Move along. The castle is no place for outlaws.'],
});

// ---------------- Sherwood camp ----------------
npc('little_john', {
  name: 'Little John', x: 278, y: 298, quest: 'wolves_at_the_door', tutor: 'strength',
  vis: { skin: 'light', hair: ['bedhead', 'dark_brown'], beard: 'dark_brown', torso: ['leather', 'brown'], legs: ['pants', 'forest'], weapon: ['spear', 'iron'] },
  lines: ['Ha! You look like you could barely lift a quarterstaff. Prove me wrong.'],
});
npc('will_scarlet', {
  name: 'Will Scarlet', x: 274, y: 300, quest: 'the_poacher_problem', tutor: 'thieving',
  vis: { skin: 'light', hair: ['plain', 'red'], torso: ['tunic', 'red'], legs: ['pants', 'black'], weapon: ['sword', 'iron'] },
  lines: ['Quick fingers keep you fed. Quicker feet keep you alive.'],
});
npc('elder_druid', {
  name: 'Elder Druid Cathbad', x: 322, y: 282, tutor: 'magic',
  vis: { skin: 'taupe', hair: ['plain', 'gray'], beard: 'gray', torso: ['robe', 'white'], legs: ['pants', 'white'], weapon: ['staff', 'gnarled'] },
  shop: [['air_rune', 6], ['earth_rune', 6], ['water_rune', 6], ['fire_rune', 8], ['apprentice_staff', 25], ['novice_hood', 15], ['novice_robe_top', 30], ['novice_robe_skirt', 25]],
  lines: ['The old magic sleeps in stone and stream. Bring essence to the altars and it will wake for you.'],
});
npc('warden_askel', {
  name: 'Dungeon Warden Askel', x: 360, y: 290, quest: 'depths_of_the_abyss', tutor: 'dungeoneering',
  vis: { skin: 'brown', hair: ['buzzcut', 'black'], torso: ['chainmail', 'iron'], legs: ['plate', 'iron'], weapon: ['sword', 'steel'] },
  lines: ['The Abyssal Depths go down further than any sane man has mapped. Clear a floor, earn true $Shillings — the deeper, the richer.'],
});
npc('ranger_hodd', {
  name: 'Ranger Hodd', x: 284, y: 314, tutor: 'hunter',
  vis: { skin: 'light', hair: ['plain', 'dark_brown'], torso: ['leather', 'forest'], legs: ['pants', 'forest'], head: ['hood', 'forest'], weapon: ['bow', 'medium'] },
  shop: [['box_trap', 12], ['small_fishing_net', 8], ['fishing_rod', 12], ['harpoon', 45], ['fishing_bait', 1]],
  lines: ['Tracks tell true tales. Set your traps along the runs and be patient.'],
});
npc('master_builder', {
  name: 'Master Builder Tom', x: 242, y: 331, tutor: 'construction',
  vis: { skin: 'light', hair: ['buzzcut', 'light_brown'], torso: ['longsleeve', 'brown'], legs: ['pants', 'walnut'], hands: ['gloves', 'leather'] },
  shop: [['hammer', 12], ['knife', 8]],
  lines: ['Every outlaw needs a hideout. Step through the portal and make it yours — bring timber and a hammer.'],
});

// ---------------- Bay ----------------
npc('fisherman_col', {
  name: 'Fisherman Col', x: 47, y: 428, tutor: 'fishing',
  vis: { skin: 'taupe', hair: ['bedhead', 'gray'], beard: 'gray', torso: ['longsleeve', 'blue'], legs: ['pants', 'walnut'] },
  shop: [['small_fishing_net', 8], ['fishing_rod', 12], ['harpoon', 45], ['fishing_bait', 1], ['raw_perch', 6]],
  lines: ['Tide gives and tide takes. Nets for the shallows, rods for the river, harpoons for the deep.'],
});
npc('bay_banker', {
  name: 'Banker Ysolt', x: 45, y: 413, banker: true,
  vis: { skin: 'brown', hair: ['braid', 'black'], torso: ['longsleeve', 'charcoal'], legs: ['pants', 'black'] },
  lines: ['Salt air, safe vaults.'],
});
npc('smuggler_meg', {
  name: 'Smuggler Meg', x: 44, y: 429, quest: 'the_cold_run',
  vis: { skin: 'light', hair: ['bangs', 'black'], torso: ['leather', 'black'], legs: ['pants', 'black'], head: ['hood', 'black'] },
  lines: ["Psst. Cold work up north pays warm coin — if you don't freeze first."],
});

// ---------------- Frosthollow ----------------
npc('elder_sigrid', {
  name: 'Elder Sigrid', x: 301, y: 127, quest: 'the_cold_north', tutor: 'agility',
  vis: { skin: 'light', hair: ['braid', 'gray'], torso: ['longsleeve', 'white'], legs: ['pants', 'charcoal'] },
  lines: ['The north tests every muscle. Learn its crossings — logs, stones, ice — and it will open to you.'],
});
npc('frost_banker', {
  name: 'Banker Njall', x: 295, y: 125, banker: true,
  vis: { skin: 'light', hair: ['plain', 'blonde'], beard: 'blonde', torso: ['longsleeve', 'charcoal'], legs: ['pants', 'black'] },
  lines: ['Even shillings shiver up here.'],
});
npc('trader_ulf', {
  name: 'Trader Ulf', x: 305, y: 127, wander: 3, pickpocket: { lvl: 55, xp: 150, loot: [['coins', [30, 90]], ['fox_fur', 1, 0.2]] },
  vis: { skin: 'light', hair: ['bedhead', 'ginger'], beard: 'ginger', torso: ['longsleeve', 'green'], legs: ['pants', 'walnut'] },
  shop: [['steel_hatchet', 260], ['steel_pickaxe', 260], ['hearty_stew', 150], ['box_trap', 12]],
  lines: ['Furs, steel, stew — everything a frozen soul needs.'],
});

// Positions were authored on the 576 grid — remap to the scaled world,
// keeping NPCs inside buildings glued to their building.
import { remapPoint } from './world.js';
for (const n of Object.values(NPCS)) { const [nx, ny] = remapPoint(n.x, n.y); n.x = nx; n.y = ny; }

// Fix fallback hair colors that don't exist in our copied palette
for (const n of Object.values(NPCS)) {
  if (n.vis && n.vis.hair) {
    if (n.vis.hair[0] === 'balding_fallback') n.vis.hair[0] = 'plain';
    if (n.vis.hair[1] === 'chestnut_fallback') n.vis.hair[1] = 'light_brown';
    if (n.vis.hair[1] === 'red') n.vis.hair[1] = 'ginger';
    if (n.vis.hair[1] === 'raven') n.vis.hair[1] = 'black';
  }
}

// NPCs: position, LPC visuals, dialogue, shops, quest hooks, pickpocketing.
// Dialogue: array of lines, or keyed stages driven by quest state (server picks).

import { ITEMS } from './items.js';

export const NPCS = {};
function npc(id, o) { NPCS[id] = { id, wander: 0, ...o }; return NPCS[id]; }

// Dress a generated character in REAL equipment: each item's paperdoll layer is
// applied over the base look, so unique NPCs wear the very gear players can
// earn — Robin Hood carries an actual Sherwood longbow in Lincoln green.
function gear(base, ...itemIds) {
  const vis = { ...base };
  for (const id of itemIds) {
    const v = ITEMS[id] && ITEMS[id].vis;
    if (!v) continue;
    vis[v.layer] = [v.sheet || v.type, v.color];
  }
  return vis;
}

// ---------------- Loxley (tutorial hub) ----------------
// The legend himself: a generated character in top-end ranger kit — Lincoln
// green from coif to chaps, a quiver at his back, the Sherwood longbow in hand.
npc('robin_hood', {
  name: 'Robin Hood', x: 251, y: 328, quest: 'a_legend_begins',
  vis: gear({ skin: 'light', hair: ['plain', 'light_brown'] },
    'lincoln_coif', 'lincoln_body', 'lincoln_chaps', 'leather_boots', 'quiver', 'sherwood_longbow'),
  lines: ['Welcome to Sherwood, friend. The Sheriff bleeds these lands dry — we could use another pair of hands.'],
});
npc('maid_marian', {
  name: 'Maid Marian', x: 255, y: 330, quest: 'marians_message',
  vis: gear({ skin: 'light', hair: ['braid', 'dark_brown'], torso: ['longsleeve', 'blue'], legs: ['pants', 'white'] },
    'leather_boots'),
  lines: ['A word, traveller? I have a letter that must reach Nottingham... discreetly.'],
});
npc('friar_tuck', {
  name: 'Friar Tuck', x: 261, y: 339, quest: 'tucks_faith', tutor: 'prayer',
  vis: gear({ skin: 'light', hair: ['balding_fallback', 'gray'], beard: 'gray' },
    'friar_robe_top', 'friar_robe_skirt', 'friar_staff'),
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
  vis: gear({ skin: 'brown', hair: ['buzzcut', 'black'], torso: ['leather', 'brown'], legs: ['pants', 'charcoal'] },
    'steel_gauntlets', 'iron_mace'),
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
  lines: ['A song for a $LoS? Or news for free — the Colosseum pays fighters in $LoS, real ones.'],
});
npc('nottingham_banker', {
  name: 'Banker Reginald', x: 305, y: 325, banker: true,
  vis: { skin: 'olive', hair: ['plain', 'black'], torso: ['longsleeve', 'charcoal'], legs: ['pants', 'black'] },
  lines: ['The Bank of Nottingham never sleeps. Mostly because of the rats.'],
});
// Five Exchange tellers work the glazed teller windows along the back of the hall.
npc('ge_clerk', {
  name: 'Exchange Clerk Hild', x: 320, y: 315, geClerk: true,
  vis: { skin: 'light', hair: ['bangs', 'blonde'], torso: ['longsleeve', 'white'], legs: ['pants', 'black'] },
  lines: ['Buy low, sell high — all offers settled in $LoS. And should you wish to cash your $LoS out to the chain, this is the only place it is done — paid straight to the wallet you signed in with.'],
});
npc('ge_clerk_e', {
  name: 'Exchange Clerk Osric', x: 324, y: 315, geClerk: true,
  vis: { skin: 'brown', hair: ['plain', 'black'], torso: ['longsleeve', 'white'], legs: ['pants', 'charcoal'] },
  lines: ['Step up, step up — the book never closes at the Grand Exchange.'],
});
npc('ge_clerk_s', {
  name: 'Exchange Clerk Edith', x: 328, y: 315, geClerk: true,
  vis: { skin: 'light', hair: ['bun', 'brown'], torso: ['longsleeve', 'white'], legs: ['skirt', 'black'] },
  lines: ['Coins, kit, curios — if it can be traded, it trades here.'],
});
npc('ge_clerk_w', {
  name: 'Exchange Clerk Alaric', x: 332, y: 315, geClerk: true,
  vis: { skin: 'olive', hair: ['plain', 'grey'], torso: ['longsleeve', 'white'], legs: ['pants', 'black'] },
  lines: ['Even a sack of coins fetches a fair price on the exchange floor.'],
});
npc('ge_clerk_n', {
  name: 'Exchange Clerk Wystan', x: 336, y: 315, geClerk: true,
  vis: { skin: 'light', hair: ['plain', 'brown'], torso: ['longsleeve', 'white'], legs: ['pants', 'charcoal'] },
  lines: ['Next window along, friend — I can take your order just as well.'],
});
npc('colosseum_marshal', {
  name: 'Marshal Brand', x: 323, y: 336, marshal: true,
  vis: gear({ skin: 'brown', hair: ['buzzcut', 'black'] },
    'steel_platebody', 'steel_platelegs', 'steel_helm', 'steel_gauntlets', 'steel_spear'),
  lines: ['Care to wager your $LoS on your own blood? Challenge another warrior, agree a stake, and the pot is winner-takes-all. I keep five parts in a hundred for the sand.'],
});
npc('fletcher_ansel', {
  name: 'Fletcher Ansel', x: 336, y: 334, tutor: 'fletching',
  vis: gear({ skin: 'light', hair: ['plain', 'chestnut_fallback'] },
    'studded_body', 'studded_chaps', 'leather_boots', 'quiver', 'ash_bow'),
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
  vis: gear({ skin: 'light' },
    'silversteel_platebody', 'silversteel_platelegs', 'silversteel_helm', 'silversteel_gauntlets', 'silversteel_shield', 'silversteel_sword'),
  lines: ['Move along. The castle is no place for outlaws.'],
});

// ---------------- Sherwood camp ----------------
npc('little_john', {
  name: 'Little John', x: 278, y: 298, quest: 'wolves_at_the_door', tutor: 'strength',
  vis: gear({ skin: 'light', hair: ['bedhead', 'dark_brown'], beard: 'dark_brown', legs: ['pants', 'forest'] },
    'leather_body', 'leather_boots', 'steel_spear'),
  lines: ['Ha! You look like you could barely lift a quarterstaff. Prove me wrong.'],
});
npc('will_scarlet', {
  name: 'Will Scarlet', x: 274, y: 300, quest: 'the_poacher_problem', tutor: 'thieving',
  vis: gear({ skin: 'light', hair: ['plain', 'red'], torso: ['tunic', 'red'] },
    'studded_chaps', 'leather_boots', 'steel_sword'),
  lines: ['Quick fingers keep you fed. Quicker feet keep you alive.'],
});
npc('elder_druid', {
  name: 'Elder Druid Cathbad', x: 322, y: 282, tutor: 'magic',
  vis: gear({ skin: 'taupe', hair: ['plain', 'gray'], beard: 'gray' },
    'druidic_robe_top', 'druidic_robe_skirt', 'druid_staff'),
  shop: [['air_rune', 6], ['earth_rune', 6], ['water_rune', 6], ['fire_rune', 8], ['apprentice_staff', 25], ['novice_hood', 15], ['novice_robe_top', 30], ['novice_robe_skirt', 25]],
  lines: ['The old magic sleeps in stone and stream. Bring essence to the altars and it will wake for you.'],
});
npc('warden_askel', {
  name: 'Dungeon Warden Askel', x: 360, y: 290, quest: 'depths_of_the_abyss', tutor: 'dungeoneering',
  vis: gear({ skin: 'brown', hair: ['buzzcut', 'black'] },
    'steel_platebody', 'iron_platelegs', 'steel_gauntlets', 'silversteel_sword'),
  lines: ['The Abyssal Depths go down further than any sane man has mapped. Clear a floor, earn true $LoS — the deeper, the richer.'],
});
npc('ranger_hodd', {
  name: 'Ranger Hodd', x: 284, y: 314, tutor: 'hunter',
  vis: gear({ skin: 'light', hair: ['plain', 'dark_brown'] },
    'ranger_coif', 'ranger_body', 'ranger_chaps', 'leather_boots', 'quiver', 'yew_bow'),
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
  vis: gear({ skin: 'light', hair: ['bangs', 'black'] },
    'studded_coif', 'studded_body', 'studded_chaps', 'leather_boots', 'iron_dagger'),
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
  lines: ['Even $LoS shiver up here.'],
});
npc('trader_ulf', {
  name: 'Trader Ulf', x: 305, y: 127, wander: 3, pickpocket: { lvl: 55, xp: 150, loot: [['coins', [30, 90]], ['fox_fur', 1, 0.2]] },
  vis: { skin: 'light', hair: ['bedhead', 'ginger'], beard: 'ginger', torso: ['longsleeve', 'green'], legs: ['pants', 'walnut'] },
  shop: [['steel_hatchet', 260], ['steel_pickaxe', 260], ['hearty_stew', 150], ['box_trap', 12]],
  lines: ['Furs, steel, stew — everything a frozen soul needs.'],
});

// ---------------- Edwinstowe Hamlet (poor farm folk: patched wool) -----------
npc('gaffer_hodge', {
  name: 'Gaffer Hodge', x: 193, y: 356, wander: 2,
  vis: { skin: 'taupe', hair: ['plain', 'gray'], beard: 'gray', torso: ['longsleeve', 'brown'], legs: ['pants', 'brown'] },
  shop: [['potato_seed', 3], ['cabbage_seed', 5], ['barley_seed', 7], ['bread', 7], ['spade', 5], ['secateurs', 5], ['bucket', 5], ['shears', 8]],
  lines: ['Seeds, spuds, a bucket for the cows an\' shears for the sheep — the Sheriff taxed the rest.', 'Good soil here, if your back can take it.'],
});
npc('peg_the_gooseherd', {
  name: 'Peg the Gooseherd', x: 199, y: 358, wander: 3,
  vis: { skin: 'light', hair: ['braid', 'ginger'], torso: ['longsleeve', 'charcoal'], legs: ['pants', 'brown'] },
  lines: ['Mind the geese. They bite harder than the rats.', 'Rich folk in Nottingham never seen a goose \'til it\'s roasted.'],
});
npc('tom_tiller', {
  name: 'Tom Tiller', x: 196, y: 361, tutor: 'farming', wander: 2,
  vis: { skin: 'brown', hair: ['buzzcut', 'black'], torso: ['longsleeve', 'white'], legs: ['pants', 'walnut'] },
  lines: ['Turn the earth, drop the seed, wait on the rain. Farming\'s honest — that\'s why nobody rich does it.'],
});

// ---------------- Wyckham-on-Fen (weathered fisher folk) ----------------------
npc('eel_meg', {
  name: 'Eel Meg', x: 397, y: 408, wander: 2,
  vis: { skin: 'taupe', hair: ['bangs', 'gray'], torso: ['leather', 'brown'], legs: ['pants', 'charcoal'] },
  shop: [['fishing_rod', 5], ['small_fishing_net', 5], ['fishing_bait', 1], ['raw_pike', 55], ['raw_eel', 110], ['vial_water', 3]],
  lines: ['Eels tonight, eels tomorrow. Fen provides, fen takes.', 'Them witch doctors out in the mire? Keep your distance, dear.'],
});
npc('siltfoot_sam', {
  name: 'Siltfoot Sam', x: 402, y: 411, wander: 3, pickpocket: { lvl: 30, xp: 90, loot: [['coins', [8, 30]], ['raw_eel', 1, 0.3]] },
  vis: { skin: 'olive', hair: ['bedhead', 'black'], torso: ['longsleeve', 'forest'], legs: ['pants', 'brown'] },
  lines: ['The fen horrors sing at night. Don\'t follow the song.', 'Lost me boot to the mud. Lost me brother to the spiders.'],
});

// ---------------- Peveril Stronghold (wealth and steel) -----------------------
npc('castellan_devereux', {
  name: 'Castellan Devereux', x: 351, y: 167,
  vis: gear({ skin: 'light', hair: ['plain', 'black'] },
    'silversteel_platebody', 'silversteel_platelegs', 'silversteel_gauntlets', 'silversteel_sword'),
  shop: [['steel_sword', 380], ['steel_platebody', 520], ['steel_helm', 260], ['steel_shield', 330], ['steel_platelegs', 400], ['arbalest', 3400], ['silversteel_bolts', 40]],
  lines: ['Peveril holds the north road. Coin buys steel here — good steel.', 'The Wild Lands lie beyond the moor. Go armed or go home.'],
});
npc('lady_isolde', {
  name: 'Lady Isolde', x: 349, y: 170, wander: 2, pickpocket: { lvl: 70, xp: 260, loot: [['coins', [60, 180]], ['sapphire', 1, 0.1]] },
  vis: { skin: 'light', hair: ['curly_long', 'blonde'], torso: ['robe', 'white'], legs: ['pants', 'white'] },
  lines: ['Silk from Flanders, sapphires from the Peaks. One learns to want for nothing here.', 'The moor wind ruins one\'s hair, truly.'],
});
npc('serjeant_brock', {
  name: 'Serjeant Brock', x: 355, y: 169, tutor: 'attack',
  vis: gear({ skin: 'brown', hair: ['buzzcut', 'black'] },
    'steel_platebody', 'iron_platelegs', 'steel_helm', 'steel_spear'),
  lines: ['Brigands on the moor, wights past the snowline, and worse past that. Keep your blade oiled.'],
});

// ---------------- Nottingham: wealth rises toward the castle ------------------
npc('ragged_beggar', {
  name: 'Ragged Odo', x: 330, y: 351, wander: 2,
  vis: { skin: 'taupe', hair: ['bedhead', 'gray'], beard: 'gray', torso: ['longsleeve', 'charcoal'], legs: ['pants', 'charcoal'] },
  lines: ['Spare a coin at the gate, friend? The Sheriff took the rest.', 'They eat swan up at the castle. Swan!'],
});
npc('aldous_clothier', {
  name: 'Aldous the Clothier', x: 333, y: 327, wander: 2, pickpocket: { lvl: 45, xp: 130, loot: [['coins', [20, 70]], ['soft_leather', 1, 0.25]] },
  vis: { skin: 'light', hair: ['bangs', 'dark_brown'], torso: ['tunic', 'blue'], legs: ['pants', 'black'] },
  shop: [['peasant_shirt', 4], ['outlaw_tunic', 12], ['leather_boots', 10], ['quiver', 45], ['needle', 5], ['soft_leather', 30]],
  lines: ['Cloth for the street, leather for the road, and silk — silk is for THEM up the hill.'],
});
npc('alderman_fitzwalter', {
  name: 'Alderman Fitzwalter', x: 329, y: 309, pickpocket: { lvl: 60, xp: 200, loot: [['coins', [40, 120]], ['gold_amulet', 1, 0.04]] },
  vis: { skin: 'light', hair: ['plain', 'gray'], beard: 'gray', torso: ['robe', 'white'], legs: ['pants', 'black'] },
  lines: ['Mind your boots on the castle approach. Mud is for the lower town.', 'The Sheriff dines with the Prince\'s men tonight. Heavy purses, heavier locks.'],
});

// ---------------- Hathersage (Little John's home village) ---------------------
npc('mason_gudrun', {
  name: 'Mason Gudrun', x: 146, y: 244, tutor: 'mining',
  shop: [['copper_pickaxe', 25], ['iron_pickaxe', 150], ['hammer', 12], ['tinderbox', 10]],
  vis: gear({ skin: 'light', hair: ['braid', 'ginger'] }, 'leather_body', 'studded_chaps', 'steel_gauntlets', 'leather_boots', 'iron_pickaxe'),
  lines: ['Hathersage stone built half of Nottingham — and the Sheriff still taxes the dust.', 'Big John? Knew him when he was only Little.'],
});
npc('widow_annis', {
  name: 'Widow Annis', x: 155, y: 245, quest: 'johns_keepsake',
  vis: gear({ skin: 'taupe', hair: ['bun', 'gray'], torso: ['longsleeve', 'charcoal'], legs: ['skirt', 'black'] }, 'leather_boots'),
  lines: ['My boy ran to the greenwood years back. They call him Little John now — little!'],
});

// ---------------- Blidworth (Will Scarlet's kin) --------------------------------
npc('tom_blidworth', {
  name: "Tom o'Blidworth", x: 218, y: 293, quest: 'the_scarlet_thread',
  vis: gear({ skin: 'light', hair: ['plain', 'ginger'], torso: ['tunic', 'red'] }, 'studded_chaps', 'leather_boots', 'iron_dagger'),
  lines: ["Will Scarlet's my cousin. Fastest blade in the shire — second-quickest temper."],
});
npc('dyer_maud', {
  name: 'Dyer Maud', x: 226, y: 293,
  shop: [['needle', 5], ['soft_leather', 30], ['peasant_shirt', 4], ['outlaw_tunic', 12]],
  vis: gear({ skin: 'brown', hair: ['bangs', 'black'], torso: ['longsleeve', 'red'], legs: ['skirt', 'charcoal'] }, 'leather_boots'),
  lines: ["Madder root and fox-glove — that's how you get a scarlet worth the name."],
});

// ---------------- Ollerton Crossroads (the Wayfarer Inn) ------------------------
npc('innkeep_osbert', {
  name: 'Innkeeper Osbert', x: 322, y: 263, quest: 'word_on_the_road',
  shop: [['bread', 8], ['hearty_stew', 150], ['cooked_trout', 30]],
  vis: gear({ skin: 'light', hair: ['balding_fallback', 'gray'], beard: 'gray', torso: ['longsleeve', 'white'] }, 'leather_boots'),
  lines: ['Every road in the shire passes my door — and every rumour with it.'],
});
npc('ostler_daw', {
  name: 'Ostler Daw', x: 334, y: 268, wander: 3, pickpocket: { lvl: 15, xp: 35, loot: [['coins', [5, 15]]] },
  vis: gear({ skin: 'brown', hair: ['bedhead', 'black'], torso: ['longsleeve', 'brown'] }, 'leather_boots'),
  lines: ['Horses talk more sense than most travellers.'],
});

// ---------------- Papplewick (the mill of Much's uncle) -------------------------
npc('miller_aldwin', {
  name: 'Miller Aldwin', x: 394, y: 385, quest: 'the_millers_due',
  shop: [['barley', 10], ['bread', 8], ['barley_seed', 8]],
  vis: gear({ skin: 'light', hair: ['plain', 'gray'], beard: 'gray', torso: ['longsleeve', 'white'] }, 'leather_boots'),
  lines: ['Much is my nephew — good lad, dreadful miller.', 'The Sheriff takes a tithe of every sack. The rats take the rest.'],
});

// ---------------- The Hooded Howe (outlaw refuge in the Wild Lands) -------------
npc('quartermaster_wulf', {
  name: 'Quartermaster Wulf', x: 236, y: 82, quest: 'the_long_watch',
  shop: [['iron_arrow', 8], ['hearty_stew', 150], ['harpoon', 45]],
  vis: gear({ skin: 'light', hair: ['buzzcut', 'black'], beard: 'black' }, 'studded_coif', 'studded_body', 'studded_chaps', 'leather_boots', 'steel_spear'),
  lines: ["This far north the King's law freezes solid. Ours keeps us warm."],
});
npc('lookout_edda', {
  name: 'Lookout Edda', x: 247, y: 87,
  vis: gear({ skin: 'light', hair: ['braid', 'blonde'] }, 'ranger_coif', 'ranger_body', 'ranger_chaps', 'leather_boots', 'quiver', 'yew_bow'),
  lines: ['Dragon weather coming off the scar. Keep your fires low and your blades ready.'],
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

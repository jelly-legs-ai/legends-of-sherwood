// Quests: linear step machines evaluated server-side.
// Step types:
//   talk    {npc}                       — speak to an NPC
//   kill    {mob, count}                — slay mobs
//   collect {item, count}               — have items in inventory (consumed on turn-in if consume)
//   node    {node, count}               — perform gather/interact actions on a node type
//   skill   {skill, level}              — reach a skill level
//   equip   {slot}                      — equip anything in a slot
//   cast    {spell}                     — cast a given spell
//   make    {recipe, count}             — craft via a recipe
//   bury    {count}                     — bury bones
//   dungeon {floor}                     — clear a dungeon floor
// Rewards: coins, shillings, items {id: qty}, xp {skill: amount}

export const QUESTS = {
  a_legend_begins: {
    name: 'A Legend Begins', giver: 'robin_hood', level: 1,
    intro: "So you want to run with the Merry Men? Every legend starts small. Let's see what you're made of.",
    steps: [
      { type: 'kill', mob: 'rat', count: 2, hint: 'Robin: "First — steel. Field rats plague the granary east of the village. Deal with two of them. Here\'s a copper sword."', give: { copper_sword: 1, bread: 3 } },
      { type: 'equip', slot: 'weapon', item: 'shortbow', hint: 'Robin: "Good. Now the outlaw\'s true friend — the bow. String this shortbow and knock a rat down with it."', give: { shortbow: 1, copper_arrow: 50 } },
      { type: 'kill', mob: 'rat', count: 1, hint: 'Robin: "Loose your arrows at a rat. Keep your distance and let the wind do the work."' },
      { type: 'cast', spell: 'wind_gust', hint: 'Robin: "Friar Tuck swears by the old magic too. Take these runes and cast Wind Gust at any target."', give: { air_rune: 30, apprentice_staff: 1 } },
      { type: 'node', node: 'tree', count: 1, hint: 'Robin: "A fighter who can\'t feed himself is a corpse waiting. Chop a log from an ash tree."', give: { copper_hatchet: 1, tinderbox: 1 } },
      { type: 'node', node: 'net_spot', count: 1, hint: 'Robin: "Now net a fish from the river south of the village."', give: { small_fishing_net: 1 } },
      { type: 'make', recipe: 'cook_perch', count: 1, hint: 'Robin: "Light a fire with your tinderbox (or use the village campfire) and cook your catch."' },
      { type: 'node', node: 'copper_rock', count: 1, hint: 'Robin: "Wat will teach you the forge. Mine copper at the quarry east of the chapel."', give: { copper_pickaxe: 1 } },
      { type: 'make', recipe: 'smelt_copper', count: 1, hint: 'Robin: "Smelt that ore into a bar at Wat\'s furnace."' },
      { type: 'talk', npc: 'robin_hood', hint: 'Robin: "Report back to me — you\'ve the makings of a Merry One."' },
    ],
    rewards: { shillings: 5, coins: 200, items: { outlaw_tunic: 1, peasant_trousers: 1, leather_boots: 1 }, xp: { constitution: 200 } },
    outro: 'Robin claps your shoulder. "Welcome to the Merry Men. The forest is yours now — and so is its work. Five true $Shillings, as promised."',
  },

  marians_message: {
    name: "Marian's Message", giver: 'maid_marian', level: 2,
    intro: 'This letter must reach Alan-a-Dale at the Trip to Jerusalem Inn in Nottingham. Do not let the guards see it.',
    steps: [
      { type: 'talk', npc: 'alan_a_dale', hint: 'Deliver the letter to Alan-a-Dale in the Nottingham inn.', give: { marians_letter: 1 }, take: { marians_letter: 1 } },
      { type: 'talk', npc: 'maid_marian', hint: 'Return to Marian with his answer.' },
    ],
    rewards: { coins: 150, shillings: 1, xp: { agility: 300 } },
    outro: '"Swift and unseen — you have my thanks."',
  },

  the_millers_grain: {
    name: "The Miller's Grain", giver: 'much_the_miller', level: 3,
    intro: 'The mill is empty and bellies grumble. Grow me barley, then bake bread — Old Agnes will sell you seed.',
    steps: [
      { type: 'collect', item: 'barley', count: 3, consume: true, hint: 'Grow 3 barley at the Loxley allotments (or trade for it).' },
      { type: 'make', recipe: 'bake_bread', count: 3, hint: 'Bake 3 loaves at a cooking range.' },
      { type: 'talk', npc: 'much_the_miller', hint: 'Bring Much the good news.' },
    ],
    rewards: { coins: 120, shillings: 1, xp: { farming: 350, cooking: 350 } },
    outro: '"The ovens sing again! Take these shillings — honest pay for honest bread."',
  },

  wolves_at_the_door: {
    name: 'Wolves at the Door', giver: 'little_john', level: 8,
    intro: 'Wolf packs press the camp every night. Thin them out and I might stop calling you "twig-arms".',
    steps: [
      { type: 'kill', mob: 'sherwood_wolf', count: 5, hint: 'Slay 5 Sherwood wolves around the outlaw camp.' },
      { type: 'talk', npc: 'little_john', hint: 'Report to Little John.' },
    ],
    rewards: { coins: 300, shillings: 2, items: { iron_spear: 1 }, xp: { strength: 800 } },
    outro: '"Not bad, twig-arms. Keep the spear — you\'ve earned the reach."',
  },

  the_poacher_problem: {
    name: 'The Poacher Problem', giver: 'will_scarlet', level: 12,
    intro: "Poachers strip the forest bare and blame us for it. Persuade them to retire — and bring me a wolf pelt for winter.",
    steps: [
      { type: 'kill', mob: 'poacher', count: 3, hint: 'Drive off 3 poachers in Sherwood.' },
      { type: 'collect', item: 'wolf_pelt', count: 1, consume: true, hint: 'Bring Will a wolf pelt.' },
      { type: 'talk', npc: 'will_scarlet', hint: 'Return to Will Scarlet.' },
    ],
    rewards: { coins: 350, shillings: 2, items: { ash_bow: 1, bronze_arrow: 60 }, xp: { ranged: 900, thieving: 300 } },
    outro: '"Warm hands, full quiver. The forest thanks you, in its way."',
  },

  tucks_faith: {
    name: "Tuck's Faith", giver: 'friar_tuck', level: 5,
    intro: 'The dead of these woods lie unblessed. Bury five sets of bones, then kneel at the chapel altar.',
    steps: [
      { type: 'bury', count: 5, hint: 'Bury 5 bones (they drop from most creatures).' },
      { type: 'node', node: 'chapel_altar', count: 1, hint: 'Pray at the chapel altar in Loxley.' },
      { type: 'talk', npc: 'friar_tuck', hint: 'Speak with Friar Tuck.' },
    ],
    rewards: { coins: 100, shillings: 1, xp: { prayer: 600 } },
    outro: '"The saints heard you, child. Walk in their shade."',
  },

  the_sheriffs_taxes: {
    name: "The Sheriff's Taxes", giver: 'robin_hood', level: 25,
    intro: "The Sheriff squeezes silver from starving mouths. We squeeze back. Rob his stalls, rout his guards — give it all to the poor.",
    steps: [
      { type: 'node', node: 'silver_stall', count: 3, hint: "Steal from Nottingham's silver stall 3 times (Thieving 50)." },
      { type: 'kill', mob: 'sheriffs_guard', count: 2, hint: "Rout 2 of the Sheriff's guards." },
      { type: 'talk', npc: 'robin_hood', hint: 'Bring word (and silver) to Robin.' },
    ],
    rewards: { coins: 900, shillings: 10, xp: { thieving: 2500, attack: 1500 } },
    outro: '"Rob from the rich — you know the rest. The poor of Loxley eat tonight because of you."',
  },

  depths_of_the_abyss: {
    name: 'Depths of the Abyss', giver: 'warden_askel', level: 10,
    intro: 'No one pays better than the dark. Clear the first floor of the Abyssal Depths and come back breathing.',
    steps: [
      { type: 'dungeon', floor: 1, hint: 'Clear floor 1 of the Abyssal Depths (entrance east of Sherwood camp).' },
      { type: 'talk', npc: 'warden_askel', hint: 'Report to Warden Askel.' },
    ],
    rewards: { coins: 400, shillings: 4, xp: { dungeoneering: 1200 } },
    outro: '"Breathing AND richer. The Depths will remember you — go deeper when you dare."',
  },

  the_cold_run: {
    name: 'The Cold Run', giver: 'smuggler_meg', level: 20,
    intro: "I move goods the Sheriff would rather tax. Fetch me cured fish from the north and I'll cut you in.",
    steps: [
      { type: 'collect', item: 'cooked_salmon', count: 5, consume: true, hint: 'Bring Meg 5 cooked salmon.' },
      { type: 'talk', npc: 'smuggler_meg', hint: 'Deliver the goods.' },
    ],
    rewards: { coins: 500, shillings: 3, xp: { fishing: 1500, cooking: 1000 } },
    outro: '"Good haul. The Bay remembers its friends."',
  },

  the_cold_north: {
    name: 'The Cold North', giver: 'elder_sigrid', level: 40,
    intro: 'Frosthollow endures because we respect the ice. Prove yourself against wolf and water.',
    steps: [
      { type: 'kill', mob: 'ice_wolf', count: 3, hint: 'Fell 3 ice wolves on the Northmoor.' },
      { type: 'node', node: 'harpoon_spot', count: 5, hint: 'Harpoon 5 catches from the frozen lake.' },
      { type: 'talk', npc: 'elder_sigrid', hint: 'Return to Elder Sigrid.' },
    ],
    rewards: { coins: 1200, shillings: 8, items: { hearty_stew: 3 }, xp: { agility: 3000, fishing: 2000 } },
    outro: '"The north accepts you. May your fires never gutter."',
  },
};

// Repeatable task-board tasks (Taskmaster Gil, Nottingham): rotated by server.
export const TASKS = [
  { id: 'cull_rats', desc: 'Cull 10 field rats', kill: 'rat', count: 10, coins: 60, xp: { attack: 150 } },
  { id: 'cull_bandits', desc: 'Drive off 8 bandits', kill: 'bandit', count: 8, coins: 180, xp: { strength: 400 } },
  { id: 'cull_wolves', desc: 'Thin 8 Sherwood wolves', kill: 'sherwood_wolf', count: 8, coins: 320, xp: { attack: 700 } },
  { id: 'cull_guards', desc: "Rout 6 Sheriff's guards", kill: 'sheriffs_guard', count: 6, coins: 500, shillings: 1, xp: { strength: 900 } },
  { id: 'gather_logs', desc: 'Deliver 15 ash logs', item: 'logs', count: 15, coins: 120, xp: { woodcutting: 350 } },
  { id: 'gather_iron', desc: 'Deliver 10 iron ore', item: 'iron_ore', count: 10, coins: 260, xp: { mining: 500 } },
  { id: 'gather_trout', desc: 'Deliver 10 raw trout', item: 'raw_trout', count: 10, coins: 220, xp: { fishing: 450 } },
  { id: 'cull_leeches', desc: 'Burn out 8 marsh leeches', kill: 'marsh_leech', count: 8, coins: 420, shillings: 1, xp: { attack: 900 } },
  { id: 'cull_trolls', desc: 'Break 5 crag trolls', kill: 'crag_troll', count: 5, coins: 800, shillings: 2, xp: { strength: 1600 } },
  { id: 'cull_revenants', desc: 'Banish 5 revenant knights', kill: 'revenant_knight', count: 5, coins: 1600, shillings: 5, xp: { attack: 2600 } },
];

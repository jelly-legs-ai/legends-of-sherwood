// Player pets. Found as super-rare and ultra-rare drops (each mob's pool lists
// [superRarePet, ultraRarePet]); the best pets come from bosses and endgame
// content. Pets level to the cap by being active while their owner fights.
//
// Classes:
//   defense — protects its owner (damage reduction + outright blocks), never attacks
//   offense — attacks the owner's target, never blocks
//   utility — jack-of-all-trades: feeds its owner from their pack, retrieves
//             their ground drops, and both blocks and attacks (at half strength)

export const PET_MAX_LEVEL = 200;

// Same classic curve as player skills, extended to level 150.
export const PET_XP = (() => {
  const t = [0, 0];
  let points = 0;
  for (let lvl = 1; lvl < PET_MAX_LEVEL + 1; lvl++) {
    points += Math.floor(lvl + 300 * Math.pow(2, lvl / 7));
    t[lvl + 1] = Math.floor(points / 4);
  }
  return t;
})();
export function petLevel(xp) {
  let lvl = 1;
  while (lvl < PET_MAX_LEVEL && xp >= PET_XP[lvl + 1]) lvl++;
  return lvl;
}

export const PETS = {
  // Tier 1 — common wilds
  hedgehog: { name: 'Hedgehog', cls: 'defense', tier: 1, critter: 'hedgehog' },
  hound_pup: { name: 'Hound pup', cls: 'offense', tier: 1, critter: 'wolfpup' },
  squirrel: { name: 'Squirrel', cls: 'utility', tier: 1, critter: 'squirrel' },
  // Tier 2
  badger: { name: 'Badger', cls: 'defense', tier: 2, critter: 'badger' },
  falcon: { name: 'Falcon', cls: 'offense', tier: 2, critter: 'falcon' },
  ferret: { name: 'Ferret', cls: 'utility', tier: 2, critter: 'ferret' },
  // Tier 3
  tortoise: { name: 'Ancient tortoise', cls: 'defense', tier: 3, critter: 'tortoise' },
  lynx: { name: 'Lynx', cls: 'offense', tier: 3, critter: 'lynx' },
  magpie: { name: 'Magpie', cls: 'utility', tier: 3, critter: 'magpie' },
  // Tier 4 — high-level zones
  bear_cub: { name: 'Bear cub', cls: 'defense', tier: 4, critter: 'bearcub' },
  direwolf_pup: { name: 'Direwolf pup', cls: 'offense', tier: 4, critter: 'direwolfpup' },
  imp: { name: 'Imp', cls: 'utility', tier: 4, critter: 'imp' },
  // Tier 5 — boss drops
  golemling: { name: 'Stone golemling', cls: 'defense', tier: 5, critter: 'golemling' },
  gryphon_chick: { name: 'Gryphon chick', cls: 'offense', tier: 5, critter: 'gryphon' },
  fae_sprite: { name: 'Fae sprite', cls: 'utility', tier: 5, critter: 'fae' },
  // Tier 6 — ultra-rare endgame
  dragon_whelp: { name: 'Dragon whelp', cls: 'offense', tier: 6, critter: 'whelp' },
};

// ---------------------------------------------------------------------------
// Evolution. Pets with an `evo` array change form as they level: the stages
// are spaced at equal intervals across the level cap, so 4 stages at cap 200
// means a new form every 50 levels. Stage visuals may be mob sheets — every
// mob-based stage renders at HALF the wild mob's size (MOB_PET_SIZE), at all
// stages, so a grown pet never crowds its owner off the screen.
export const MOB_PET_SIZE = 0.5;
export function petStage(def, lvl) {
  if (!def.evo || def.evo.length < 2) return null;
  const step = PET_MAX_LEVEL / def.evo.length;
  return def.evo[Math.min(def.evo.length - 1, Math.floor(lvl / step))];
}

// Wolf pups — every wolf type's pup grows through THREE stages: pup →
// adolescent → alpha (the full-grown wolf at pack-leader rank). Stage
// visuals reuse the wild pack's sheet (pup 0.3 → adolescent 0.4 → alpha
// 0.8), halved per MOB_PET_SIZE.
const WOLF_PUPS = {
  grey_wolf: ['Grey wolf', 'wolf_grey', 2], sherwood_wolf: ['Sherwood wolf', 'wolf_timber', 2],
  dire_wolf: ['Dire wolf', 'wolf_shadow', 3], moor_wolf: ['Moor wolf', 'wolf_dusk', 4],
  blood_wolf: ['Blood wolf', 'wolf_blood', 5], winter_wolf: ['Winter wolf', 'winter_wolf', 5],
  ice_wolf: ['Arctic wolf', 'wolf_arctic', 5], gilded_wolf: ['Gilded wolf', 'wolf_gold', 6],
};
for (const [w, [nm, sheet, tier]] of Object.entries(WOLF_PUPS)) {
  PETS[`${w}_pup`] = {
    name: `${nm} pup`, cls: 'offense', tier,
    evo: [
      { name: `${nm} pup`, sheet, scale: 0.3 * MOB_PET_SIZE },
      { name: `Adolescent ${nm.toLowerCase()}`, sheet, scale: 0.4 * MOB_PET_SIZE },
      { name: `Alpha ${nm.toLowerCase()}`, sheet, scale: 0.8 * MOB_PET_SIZE },
    ],
  };
}

// Slimeling — the King slime's rare egg. Three stages: slimeling → slime →
// King slime (crowned in gold like its sire).
PETS.slimeling = {
  name: 'Slimeling', cls: 'defense', tier: 4,
  evo: [
    { name: 'Slimeling', sheet: 'mob_slime', scale: 0.12 },
    { name: 'Slime', sheet: 'mob_slime', scale: 0.2 },
    { name: 'King slime', sheet: 'mob_slime', tint: 'gold', scale: 0.88 * MOB_PET_SIZE },
  ],
};

// Tier 7 — the dragonflights. A stolen egg from each flight; the wild mobs'
// four life stages (hatchling 0.55 → young 0.85 → adult 1.2 → elder 1.5)
// become the pet's evolution line, halved per MOB_PET_SIZE.
for (const c of ['blue', 'green', 'red', 'aethereal']) {
  const Nm = c[0].toUpperCase() + c.slice(1);
  const tint = c === 'aethereal' ? 'spectral' : undefined;
  PETS[`baby_${c}_dragon`] = {
    name: `Baby ${c} dragon`, cls: 'offense', tier: 7,
    evo: [
      { name: `Baby ${c} dragon`, sheet: `dragon_${c}`, tint, scale: 0.55 * MOB_PET_SIZE },
      { name: `Young ${c} dragon`, sheet: `dragon_${c}`, tint, scale: 0.85 * MOB_PET_SIZE },
      { name: `${Nm} dragon`, sheet: `dragon_${c}`, tint, scale: 1.2 * MOB_PET_SIZE },
      { name: `Elder ${c} dragon`, sheet: `dragon_${c}`, tint, scale: 1.5 * MOB_PET_SIZE },
    ],
  };
}

// Per-mob pet pools: [superRare, ultraRare?]. Bosses use far better odds.
export const PET_DROPS = {
  // starter zones
  rat: ['hedgehog'], rabbit: ['squirrel'], boar: ['hound_pup', 'badger'],
  goblin: ['hedgehog', 'squirrel'], goblin_archer: ['squirrel'], bandit: ['hound_pup'],
  gull_harpy: ['falcon'], smuggler: ['ferret'],
  // mid zones
  sherwood_wolf: ['hound_pup', 'direwolf_pup'], outlaw: ['ferret'], poacher: ['falcon'],
  goblin_raider: ['badger'], brown_bear: ['bear_cub'], sheriffs_guard: ['hound_pup'],
  marsh_leech: ['ferret'], lizardfolk: ['tortoise'], bog_wraith: ['magpie'],
  fen_serpent: ['tortoise', 'imp'], wildwood_panther: ['lynx'], druid_shade: ['magpie', 'fae_sprite'],
  vine_horror: ['tortoise'],
  // high zones
  mountain_goat: ['badger'], eyrie_hawk: ['falcon', 'gryphon_chick'], crag_troll: ['golemling'],
  orc_raider: ['lynx'], moor_brigand: ['direwolf_pup'], ice_wolf: ['direwolf_pup'],
  frost_sprite: ['fae_sprite'], minotaur: ['bear_cub', 'golemling'], orc_warlord: ['imp'],
  // endgame / wilderness
  revenant_knight: ['imp', 'gryphon_chick'], wight_archer: ['magpie', 'fae_sprite'],
  frost_revenant: ['fae_sprite', 'dragon_whelp'],
  // bosses (much better odds; ultra slot holds the crown jewels)
  elder_treant: ['tortoise', 'fae_sprite'], fenwyrm: ['tortoise', 'dragon_whelp'],
  guy_of_gisborne: ['falcon', 'gryphon_chick'], sheriff_of_nottingham: ['gryphon_chick', 'dragon_whelp'],
  troll_king: ['golemling', 'dragon_whelp'], frost_giant: ['golemling', 'dragon_whelp'],
  abyssal_horror: ['imp', 'dragon_whelp'],
  // Vermithrax hoards the rarest egg of all
  dragon_tyrant: ['dragon_whelp', 'baby_aethereal_dragon'],
};
// The dragonflights guard their own young: grown wyrms carry the flight's baby
// in the ultra slot, twin-headed elites in the super slot, and the elder twin
// bosses roll boss odds on both.
for (const c of ['blue', 'green', 'red', 'aethereal']) {
  PET_DROPS[`${c}_dragon`] = ['dragon_whelp', `baby_${c}_dragon`];
  PET_DROPS[`elder_${c}_dragon`] = ['dragon_whelp', `baby_${c}_dragon`];
  PET_DROPS[`twin_headed_${c}_dragon`] = [`baby_${c}_dragon`];
  PET_DROPS[`elder_twin_headed_${c}_dragon`] = ['dragon_whelp', `baby_${c}_dragon`];
}
// The King slime guards the slimeling egg (alpha-grade odds via its flag)
PET_DROPS.king_slime = ['slimeling'];
// Every wolf carries its own pup in the super slot (any old ultra is kept);
// pack Alphas guard the pup at much better odds (PET_ODDS.alphaSuper).
for (const w of Object.keys(WOLF_PUPS)) {
  const ultra = PET_DROPS[w]?.[1];
  PET_DROPS[w] = ultra ? [`${w}_pup`, ultra] : [`${w}_pup`];
  PET_DROPS[`alpha_${w}`] = ultra ? [`${w}_pup`, ultra] : [`${w}_pup`];
}
export const PET_ODDS = { superRare: 1 / 1500, ultraRare: 1 / 6000, bossSuper: 1 / 120, bossUltra: 1 / 450, alphaSuper: 1 / 250, alphaUltra: 1 / 1500 };

// Combat maths per class (L = pet level)
export const PET_POWER = {
  attackDamage: (cls, L) => cls === 'offense' ? 2 + L * 0.35 : cls === 'utility' ? 1 + L * 0.16 : 0,
  attackSpeedMs: (cls) => cls === 'offense' ? 2400 : 3200,
  damageReduction: (cls, L) => cls === 'defense' ? Math.min(0.30, 0.05 + L * 0.0017) : cls === 'utility' ? Math.min(0.15, 0.02 + L * 0.0009) : 0,
  blockChance: (cls, L) => cls === 'defense' ? Math.min(0.20, 0.04 + L * 0.0011) : cls === 'utility' ? Math.min(0.10, 0.02 + L * 0.0006) : 0,
};

// Player pets. Found as super-rare and ultra-rare drops (each mob's pool lists
// [superRarePet, ultraRarePet]); the best pets come from bosses and endgame
// content. Pets level to 150 by being active while their owner fights.
//
// Classes:
//   defense — protects its owner (damage reduction + outright blocks), never attacks
//   offense — attacks the owner's target, never blocks
//   utility — jack-of-all-trades: feeds its owner from their pack, retrieves
//             their ground drops, and both blocks and attacks (at half strength)

export const PET_MAX_LEVEL = 150;

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
};
export const PET_ODDS = { superRare: 1 / 1500, ultraRare: 1 / 6000, bossSuper: 1 / 120, bossUltra: 1 / 450 };

// Combat maths per class (L = pet level)
export const PET_POWER = {
  attackDamage: (cls, L) => cls === 'offense' ? 2 + L * 0.35 : cls === 'utility' ? 1 + L * 0.16 : 0,
  attackSpeedMs: (cls) => cls === 'offense' ? 2400 : 3200,
  damageReduction: (cls, L) => cls === 'defense' ? Math.min(0.30, 0.05 + L * 0.0017) : cls === 'utility' ? Math.min(0.15, 0.02 + L * 0.0009) : 0,
  blockChance: (cls, L) => cls === 'defense' ? Math.min(0.20, 0.04 + L * 0.0011) : cls === 'utility' ? Math.min(0.10, 0.02 + L * 0.0006) : 0,
};

// Legends of Sherwood — shared constants (imported by both server and browser client)

export const WORLD = {
  SEED: 1189, // Year Richard the Lionheart took the throne
};
WORLD.W = 1152;               // world width in tiles
WORLD.H = 1152;               // world height in tiles
WORLD.SCALE = 2;              // authored layout coordinates are scaled by this
WORLD.CHUNK = 16;             // chunk edge in tiles
WORLD.TICK_MS = 100;          // 10 Hz server simulation
WORLD.AOI_TILES = 26;         // area-of-interest radius (tiles) streamed to each client
WORLD.WALK_SPEED = 3.6;       // tiles / second
WORLD.RUN_SPEED = 4.2;        // was 5.6; tuned down 25%
WORLD.EXHAUSTED_SPEED = WORLD.RUN_SPEED * 0.5;  // out of stamina: half the run speed

// Planes (parallel coordinate spaces sharing the entity system)
export const PLANE = { OVERWORLD: 0, COLOSSEUM: 1, HOUSE_BASE: 1000, DUNGEON_BASE: 2000 };

export const MAX_LEVEL = 99;

// Classic exponential XP curve; xpForLevel(99) === 13,034,431
export const XP_TABLE = (() => {
  const t = [0, 0]; // index by level; level 1 = 0 xp
  let points = 0;
  for (let lvl = 1; lvl < 100; lvl++) {
    points += Math.floor(lvl + 300 * Math.pow(2, lvl / 7));
    t[lvl + 1] = Math.floor(points / 4);
  }
  return t;
})();
export function levelForXp(xp) {
  let lvl = 1;
  while (lvl < MAX_LEVEL && xp >= XP_TABLE[lvl + 1]) lvl++;
  return lvl;
}

// ---- $LoS economy ----------------------------------------------------
// Skill milestones: every skill pays at these levels, gradually increasing,
// with 99 paying a generous lump sum for the dedication to the grind.
export const MILESTONE_LEVELS = [5, 10, 20, 25, 50, 75, 99];
export const MILESTONE_SHILLINGS = { 5: 1, 10: 2, 20: 4, 25: 6, 50: 18, 75: 45, 99: 250 };

// $LoS — the Legends of Sherwood reward token. Symbol is the ticker.
export const SHILLING = {
  SYMBOL: '$LoS',
  DECIMALS: 0,               // whole tokens in-game; contract uses 18
  BOSS_BOUNTY_BASE: 3,       // per contributor, scales with boss tier
  BOSS_JACKPOT_CHANCE: 1 / 50,
  BOSS_JACKPOT: 40,
  MOB_DROP_CHANCE_BASE: 1 / 900,   // very rare; scales with mob level (see mobs.js)
  DUNGEON_FLOOR_BASE: 2,     // + floor depth scaling
  EVENT_PAYOUT_BASE: 5,
  COLOSSEUM_RAKE: 0.05,      // burned from every duel pot (token sink)
  GE_LISTING_FEE: 0.01,      // fraction of proceeds burned as a sink
  GE_TREASURY_TAX: 0.05,     // 5% of every GE p2p sale routed to the protocol treasury
  WILDERNESS_BONUS: 2.0,     // drop-rate multiplier in the Wild Lands (PvP zone)
};
// Reserved ledger account holding protocol treasury funds (GE tax, buybacks,
// creator-wallet transfers). Never a real player name (has a leading $).
export const TREASURY_ACCT = '$treasury';

// ---- Skills ----------------------------------------------------------------
export const SKILLS = [
  'attack', 'strength', 'defence', 'constitution', 'ranged', 'magic', 'prayer', 'summoning',
  'mining', 'fishing', 'woodcutting', 'farming', 'hunter', 'archaeology',
  'smithing', 'cooking', 'crafting', 'firemaking', 'fletching', 'runecrafting', 'herblore', 'construction',
  'agility', 'thieving', 'dungeoneering',
];
export const COMBAT_SKILLS = ['attack', 'strength', 'defence', 'constitution', 'ranged', 'magic', 'prayer', 'summoning'];

export function combatLevel(sk) {
  const base = (sk.defence + sk.constitution + Math.floor(sk.prayer / 2) + Math.floor(sk.summoning / 2)) / 4;
  const melee = (sk.attack + sk.strength) * 0.325;
  const range = sk.ranged * 0.4875;
  const mage = sk.magic * 0.4875;
  return Math.max(3, Math.floor(base + Math.max(melee, range, mage)));
}

// ---- Combat math (server-authoritative; shared so client can preview) ------
export const COMBAT = {
  BASE_ATTACK_MS: 2400,        // weapon speed baseline
  RESPAWN_MS: 4000,
  PLAYER_RESPAWN: { x: 252 * WORLD.SCALE, y: 332 * WORLD.SCALE },  // Loxley village square
  AGGRO_RADIUS: 5,
  MAX_HIT: (strengthLike, bonus) => Math.floor(1.3 + strengthLike / 10 + bonus / 8 + (strengthLike * bonus) / 640),
  ACCURACY: (attRoll, defRoll) => attRoll > defRoll
    ? 1 - (defRoll + 2) / (2 * (attRoll + 1))
    : attRoll / (2 * (defRoll + 1)),
  ROLL: (level, bonus) => (level + 8) * (bonus + 64),
};

// Run energy (Agility raises regen)
export const ENERGY = { MAX: 100, DRAIN_PER_TILE: 0.9, REGEN_BASE: 0.35, REGEN_PER_AGILITY: 0.02 };

// Prayer drain per point per second while any prayer active (scaled by prayer bonus)
export const PRAYER_DRAIN_S = 1 / 6;

// ---- Ground items (Curse-of-Aros style timers) ------------------------------
export const GROUND = { OWNER_MS: 60000, SHARED_MS: 1740000 }; // owner-only 1 min, then anyone; total 30 min before despawn

// ---- Wilderness / PvP -------------------------------------------------------
export const WILDERNESS_Y = 96 * WORLD.SCALE;  // overworld y < this = Wild Lands (PvP on)
export const COLOSSEUM = { MIN_WAGER: 1, MAX_WAGER: 10000 };

// ---- Grand Exchange ---------------------------------------------------------
export const GE = { MAX_OFFERS: 8 };

// ---- Tiles ------------------------------------------------------------------
// id: [name, walkable, color hints are client-side]
export const TILE = {
  OCEAN: 0, WATER: 1, RIVER: 2, SAND: 3, GRASS: 4, MEADOW: 5, DIRT: 6,
  FOREST: 7, DEEPFOREST: 8, SWAMP: 9, JUNGLE: 10, ROCK: 11, SCREE: 12,
  TUNDRA: 13, SNOW: 14, ICE: 15, ROAD: 16, BRIDGE: 17, FLOOR_WOOD: 18,
  FLOOR_STONE: 19, WALL: 20, WALL_WOOD: 21, FARM: 22, CAVE: 23, LAVA_ROCK: 24,
  ARENA: 25, WATER_SWAMP: 26, PATH: 27,
};
export const TILE_WALKABLE = new Set([
  TILE.SAND, TILE.GRASS, TILE.MEADOW, TILE.DIRT, TILE.FOREST, TILE.DEEPFOREST,
  TILE.SWAMP, TILE.JUNGLE, TILE.SCREE, TILE.TUNDRA, TILE.SNOW, TILE.ICE,
  TILE.ROAD, TILE.BRIDGE, TILE.FLOOR_WOOD, TILE.FLOOR_STONE, TILE.FARM,
  TILE.CAVE, TILE.ARENA, TILE.PATH,
]);

// ---- Regions ----------------------------------------------------------------
export const REGIONS = {
  BAY: { id: 'BAY', name: "Robin Hood's Bay", band: [1, 15] },
  MEADOWS: { id: 'MEADOWS', name: 'Barnsdale Meadows', band: [1, 20] },
  LOXLEY: { id: 'LOXLEY', name: 'Loxley Village', band: [1, 10] },
  SHERWOOD: { id: 'SHERWOOD', name: 'Sherwood Forest', band: [10, 40] },
  NOTTINGHAM: { id: 'NOTTINGHAM', name: 'Nottingham', band: [0, 0] },
  FENWOLD: { id: 'FENWOLD', name: 'The Fenwold', band: [25, 50] },
  ELDERGLADE: { id: 'ELDERGLADE', name: 'Elderglade Wildwood', band: [35, 60] },
  PEAKS: { id: 'PEAKS', name: 'The Grey Peaks', band: [40, 70] },
  NORTHMOOR: { id: 'NORTHMOOR', name: 'Northmoor', band: [55, 80] },
  FROSTHOLLOW: { id: 'FROSTHOLLOW', name: 'Frosthollow', band: [0, 0] },
  WILDLANDS: { id: 'WILDLANDS', name: 'The Wild Lands', band: [70, 99], pvp: true },
  DEPTHS: { id: 'DEPTHS', name: 'The Abyssal Depths', band: [1, 99] },
};

// ---- Net protocol -----------------------------------------------------------
export const MSG = {
  // client -> server
  HELLO: 'hello', MOVE: 'move', STOP: 'stop', ACTION: 'action', ATTACK: 'attack',
  TALK: 'talk', DIALOG: 'dialog', CHAT: 'chat', EQUIP: 'equip', UNEQUIP: 'unequip',
  DROP: 'drop', PICKUP: 'pickup', USE_ITEM: 'useItem', CAST: 'cast', PRAYER: 'prayer',
  GE: 'ge', DUEL: 'duel', BANK: 'bank', MAKE: 'make', BURY: 'bury', EAT: 'eat',
  ABILITY: 'ability', STYLE: 'style', QUEST: 'quest', DUNGEON: 'dungeon', SUMMON: 'summon',
  HOUSE: 'house', EMOTE: 'emote', RESPAWN: 'respawn', UNSTUCK: 'unstuck',
  // server -> client
  WELCOME: 'welcome', SNAP: 'snap', ENTER: 'enter', LEAVE: 'leave', SELF: 'self',
  MSGBOX: 'msg', DIALOGUE: 'dialogue', FX: 'fx', HIT: 'hit', LEVELUP: 'levelup',
  TOKEN: 'token', DEATH: 'death', EVENT: 'event', INTERFACE: 'iface', SOUND: 'sound',
};

// FX ids sent from server, rendered by client
export const FX = {
  ARROW: 1, FIREBOLT: 2, ICEBOLT: 3, HOLYBOLT: 4, HEAL: 5, LEVELUP: 6, SHILLING: 7,
  SMOKE: 8, SPLASH: 9, CHOP: 10, MINE: 11, SPARK: 12, POISON: 13, TELEPORT: 14,
  BONES: 15, THORNS: 16, SUMMON: 17, TRAP: 18, DIG: 19, CRIT: 20, BLOCK: 21, STUN: 22,
  NATURE: 23, COOK: 24, FIRE: 25, CRAFT: 26, RUNE: 27, POT: 28, BUILD: 29, ARCH: 30,
  IMPACT: 31, PRAYFX: 32, CASTFX: 33,
};

// Deterministic world generation shared by server and client. Both sides
// compute the identical 576x576 tile grid + node scatter from WORLD.SEED, so
// the map never crosses the network. Region layout is authored; detail is noise.

import { WORLD, TILE, TILE_WALKABLE, PLANE } from './constants.js';
import { TOWNS, POIS, SHORTCUTS, ARENA, HOUSE, DUNGEON_MAP } from './data/world.js';

const W = WORLD.W, H = WORLD.H;

// ---- deterministic hashing / noise -----------------------------------------
function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + (WORLD.SEED + s) * 1442695040888963407) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
function lerp(a, b, t) { return a + (b - a) * t; }
function smooth(t) { return t * t * (3 - 2 * t); }
function vnoise(x, y, scale, s = 0) {
  const gx = x / scale, gy = y / scale;
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const tx = smooth(gx - x0), ty = smooth(gy - y0);
  return lerp(
    lerp(hash2(x0, y0, s), hash2(x0 + 1, y0, s), tx),
    lerp(hash2(x0, y0 + 1, s), hash2(x0 + 1, y0 + 1, s), tx), ty);
}
function fbm(x, y, s = 0) { return vnoise(x, y, 48, s) * 0.55 + vnoise(x, y, 16, s + 7) * 0.3 + vnoise(x, y, 6, s + 13) * 0.15; }

// ---- rivers & roads (authored on the 576 grid, scaled to the live world) ------
const K = WORLD.SCALE || 1;
const S = (n) => Math.round(n * K);
const RIVER = [[430, 338], [380, 352], [300, 362], [240, 360], [150, 360], [28, 368]].map(p => [S(p[0]), S(p[1])]);
const ROADS = [
  [[252, 332], [330, 332]],
  [[330, 316], [330, 240], [300, 150]],
  [[252, 336], [150, 380], [60, 420]],
  [[252, 340], [252, 440], [270, 470]],
  [[344, 336], [420, 420]],
  [[346, 330], [440, 300]],
  [[330, 240], [352, 168]],              // spur to Peveril Keep
  [[210, 352], [196, 358]],              // lane into Edwinstowe
  [[420, 420], [400, 410]],              // causeway to Wyckham-on-Fen
  [[440, 300], [434, 296]],              // track up to Greywatch
].map(line => line.map(p => [S(p[0]), S(p[1])]));
function distToPolyline(px, py, line) {
  let best = 1e9;
  for (let i = 0; i < line.length - 1; i++) {
    const [x1, y1] = line[i], [x2, y2] = line[i + 1];
    const dx = x2 - x1, dy = y2 - y1;
    const L2 = dx * dx + dy * dy || 1;
    let t = ((px - x1) * dx + (py - y1) * dy) / L2;
    t = Math.max(0, Math.min(1, t));
    const ex = x1 + t * dx - px, ey = y1 + t * dy - py;
    best = Math.min(best, Math.sqrt(ex * ex + ey * ey));
  }
  return best;
}

// ---- regions -------------------------------------------------------------------
export function regionAt(x, y) {
  if (y < S(96)) return 'WILDLANDS';
  if (dist(x, y, TOWNS.frosthollow.cx, TOWNS.frosthollow.cy) < TOWNS.frosthollow.r + 2) return 'FROSTHOLLOW';
  if (y < S(200)) return 'NORTHMOOR';
  if (dist(x, y, TOWNS.nottingham.cx, TOWNS.nottingham.cy) < TOWNS.nottingham.r + 2) return 'NOTTINGHAM';
  if (dist(x, y, TOWNS.loxley.cx, TOWNS.loxley.cy) < TOWNS.loxley.r + 2) return 'LOXLEY';
  if (dist(x, y, TOWNS.bay.cx, TOWNS.bay.cy) < TOWNS.bay.r + 2) return 'BAY';
  if (x > S(430) && y > S(140) && y < S(390)) return 'PEAKS';
  if (x > S(370) && y > S(395)) return 'FENWOLD';
  if (y > S(440) && x > S(170) && x <= S(370)) return 'ELDERGLADE';
  if (dist(x, y, S(290), S(308)) < S(72)) return 'SHERWOOD';
  if (x < S(110) && y > S(380)) return 'BAY';
  return 'MEADOWS';
}
function dist(x1, y1, x2, y2) { const dx = x1 - x2, dy = y1 - y2; return Math.sqrt(dx * dx + dy * dy); }

// ---- towns ---------------------------------------------------------------------
function townTile(x, y) {
  for (const key in TOWNS) {
    const t = TOWNS[key];
    if (Math.abs(x - t.cx) > t.r + 12 || Math.abs(y - t.cy) > t.r + 12) continue;
    // buildings
    for (const b of t.buildings) {
      if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) {
        const onEdge = x === b.x || x === b.x + b.w - 1 || y === b.y || y === b.y + b.h - 1;
        if (onEdge) {
          const mid = { S: [b.x + (b.w >> 1), b.y + b.h - 1], N: [b.x + (b.w >> 1), b.y], E: [b.x + b.w - 1, b.y + (b.h >> 1)], W: [b.x, b.y + (b.h >> 1)] }[b.door];
          if (mid && mid[0] === x && mid[1] === y) return b.castle ? TILE.FLOOR_STONE : TILE.FLOOR_WOOD; // door
          return b.castle ? TILE.WALL : TILE.WALL_WOOD;
        }
        return b.castle ? TILE.FLOOR_STONE : TILE.FLOOR_WOOD;
      }
    }
    const d = dist(x, y, t.cx, t.cy);
    if (t.walled && Math.abs(d - t.r) < 0.6) {
      // city wall with 4 gates
      if (Math.abs(x - t.cx) < 2 || Math.abs(y - t.cy) < 2) return TILE.ROAD; // gates on axes
      return TILE.WALL;
    }
    if (d < t.r) return key === 'frosthollow' ? TILE.SNOW : TILE.DIRT;
  }
  return -1;
}

// ---- main tile function ----------------------------------------------------------
export function tileAt(x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) return TILE.OCEAN;
  // coast: west + south ocean with noisy shoreline
  const coastW = S(18) + fbm(0, y, 3) * 12, coastS = H - S(18) - fbm(x, 0, 4) * 12;
  if (x < coastW - 6 || y > coastS + 6) return TILE.OCEAN;

  const tt = townTile(x, y);
  if (tt >= 0) return tt;

  const river = distToPolyline(x, y, RIVER);
  let road = 1e9;
  for (const r of ROADS) road = Math.min(road, distToPolyline(x, y, r));
  if (river < 1.6 && road < 1.2) return TILE.BRIDGE;
  if (river < 1.6) return TILE.RIVER;

  if (x < coastW) return TILE.SAND;
  if (y > coastS) return TILE.SAND;

  if (road < 1.1) return TILE.ROAD;

  const reg = regionAt(x, y);
  const n = fbm(x, y), n2 = fbm(x, y, 31);
  switch (reg) {
    case 'WILDLANDS': return n < 0.35 ? TILE.ICE : TILE.SNOW;
    case 'NORTHMOOR': {
      const coldness = 1 - (y - S(96)) / S(104); // 1 at the Wild Lands edge -> 0 southward
      if (n < coldness * 0.75) return TILE.SNOW;
      return TILE.TUNDRA;
    }
    case 'FROSTHOLLOW': {
      // frozen lake east of town
      if (x > S(312) && x < S(324) && y > S(124) && y < S(136)) return TILE.WATER;
      return TILE.SNOW;
    }
    case 'PEAKS': {
      if (n > 0.62) return TILE.ROCK;
      if (n > 0.45) return TILE.SCREE;
      return TILE.TUNDRA;
    }
    case 'FENWOLD': return n2 < 0.42 ? TILE.WATER_SWAMP : TILE.SWAMP;
    case 'ELDERGLADE': return n2 < 0.25 ? TILE.WATER_SWAMP : TILE.JUNGLE;
    case 'SHERWOOD': return n > 0.55 ? TILE.DEEPFOREST : TILE.FOREST;
    case 'BAY': return n > 0.6 ? TILE.MEADOW : TILE.GRASS;
    case 'LOXLEY': case 'MEADOWS': default:
      if (n > 0.64) return TILE.FOREST;
      return n2 > 0.5 ? TILE.MEADOW : TILE.GRASS;
  }
}

// ---- elevation ------------------------------------------------------------------
// Undulating ground: 0 at sea level along the coasts, gentle hills inland,
// serious elevation in the Grey Peaks and the frozen north. Quantized to
// integer block levels; low-frequency so slopes stay gentle and walkable.
const ELEV = {
  WILDLANDS: [3, 3], NORTHMOOR: [2, 3], FROSTHOLLOW: [3, 1], PEAKS: [3, 5],
  SHERWOOD: [1, 2], NOTTINGHAM: [1, 0], LOXLEY: [1, 1], MEADOWS: [0, 2],
  BAY: [0, 1], FENWOLD: [0, 1], ELDERGLADE: [1, 2],
};
export const MAX_ELEV = 8;

export function heightAt(x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) return 0;
  const t = worldTile(x, y);
  if (t === TILE.OCEAN || t === TILE.SAND) return 0;
  const reg = regionAt(x, y);
  // towns sit on a levelled terrace
  for (const key in TOWNS) {
    const tw = TOWNS[key];
    if (dist(x, y, tw.cx, tw.cy) < tw.r + 6) return ELEV[reg] ? ELEV[reg][0] : 1;
  }
  const [base, amp] = ELEV[reg] || [0, 1];
  // low-frequency field keeps gradients ~<=1 per tile
  const n = vnoise(x, y, 26, 77) * 0.7 + vnoise(x, y, 9, 78) * 0.3;
  let h = base + n * amp;
  // shoreline falls smoothly to sea level
  const coastW = S(18) + 12, coastS = H - S(18) - 12;
  const shore = Math.min(1, Math.max(0, Math.min(x - coastW, coastS - y) / 26 + 0.4));
  h *= Math.max(0, shore);
  // rivers cut a shallow channel; roads ride the land as-is
  if (t === TILE.RIVER || t === TILE.WATER_SWAMP || t === TILE.WATER || t === TILE.BRIDGE) h = Math.max(0, h - 0.8);
  return Math.max(0, Math.min(MAX_ELEV, Math.round(h)));
}

// ---- scattered gather nodes --------------------------------------------------------
const SCATTER = {
  LOXLEY: [['tree', 0.02], ['oak_tree', 0.005]],
  MEADOWS: [['tree', 0.016], ['oak_tree', 0.004]],
  BAY: [['tree', 0.012]],
  SHERWOOD: [['tree', 0.045], ['oak_tree', 0.02], ['willow_tree', 0.008], ['maple_tree', 0.006], ['yew_tree', 0.0025]],
  ELDERGLADE: [['maple_tree', 0.02], ['yew_tree', 0.006], ['elm_tree', 0.003], ['willow_tree', 0.012]],
  FENWOLD: [['willow_tree', 0.02], ['tree', 0.008]],
  NORTHMOOR: [['frostpine_tree', 0.006], ['tree', 0.004]],
  PEAKS: [['iron_rock', 0.007], ['coal_rock', 0.007], ['silver_rock', 0.0022], ['gold_rock', 0.0015]],
  WILDLANDS: [['sylvanite_rock', 0.0015], ['frostpine_tree', 0.005]],
};
const NODE_OK_TILES = new Set([TILE.GRASS, TILE.MEADOW, TILE.FOREST, TILE.DEEPFOREST, TILE.JUNGLE, TILE.SWAMP, TILE.TUNDRA, TILE.SNOW, TILE.SCREE, TILE.DIRT]);

export function scatterNodeAt(x, y) {
  const t = tileAt(x, y);
  if (!NODE_OK_TILES.has(t)) return null;
  const reg = regionAt(x, y);
  const list = SCATTER[reg];
  if (!list) return null;
  const r = hash2(x * 3 + 1, y * 5 + 2, 999);
  let acc = 0;
  for (const [type, dens] of list) {
    acc += dens;
    if (r < acc) return type;
  }
  return null;
}

// ---- full map computation (cached) ---------------------------------------------------
let _tiles = null, _nodes = null;
export function computeWorld() {
  if (_tiles) return { tiles: _tiles, nodes: _nodes };
  _tiles = new Uint8Array(W * H);
  _nodes = new Map(); // "x,y" -> nodeType
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      _tiles[y * W + x] = tileAt(x, y);
  for (let y = 2; y < H - 2; y++)
    for (let x = 2; x < W - 2; x++) {
      const n = scatterNodeAt(x, y);
      if (n) _nodes.set(x + ',' + y, n);
    }
  for (const [type, x, y] of POIS) _nodes.set(x + ',' + y, type); // authored POIs win
  return { tiles: _tiles, nodes: _nodes };
}

export function worldTile(x, y) {
  const { tiles } = computeWorld();
  if (x < 0 || y < 0 || x >= W || y >= H) return TILE.OCEAN;
  return tiles[(y | 0) * W + (x | 0)];
}

// Blocking: unwalkable tile, or a gather node occupies it (except flat stations)
const FLAT_NODES = new Set(['net_spot', 'rod_spot', 'harpoon_spot', 'allotment', 'herb_patch', 'rabbit_run', 'fox_trail', 'deer_track', 'sable_run', 'campfire', 'log_balance', 'stepping_stones', 'cliff_scramble', 'rope_swing', 'ice_traverse', 'roman_ruin', 'saxon_barrow', 'druid_circle', 'norman_keep', 'grail_shrine', 'dungeon_entrance', 'house_portal']);
export function isBlockedOverworld(x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) return true;
  if (!TILE_WALKABLE.has(worldTile(x, y))) return true;
  const n = computeWorld().nodes.get((x | 0) + ',' + (y | 0));
  if (n && !FLAT_NODES.has(n)) return true;
  return false;
}

// ---- other planes ----------------------------------------------------------------------
export function arenaTile(x, y) {
  if (x < 0 || y < 0 || x >= ARENA.size || y >= ARENA.size) return TILE.OCEAN;
  if (x <= ARENA.x1 - 1 || y <= ARENA.y1 - 1 || x >= ARENA.x2 + 1 || y >= ARENA.y2 + 1) return TILE.WALL;
  return TILE.ARENA;
}
export function houseTile(x, y) {
  const S = HOUSE.size;
  if (x < 0 || y < 0 || x >= S || y >= S) return TILE.OCEAN;
  if (x >= 6 && x <= 18 && y >= 6 && y <= 18) {
    const edge = x === 6 || x === 18 || y === 6 || y === 18;
    if (edge && !(x === HOUSE.door.x && y === 18)) return TILE.WALL_WOOD;
    return TILE.FLOOR_WOOD;
  }
  return TILE.GRASS;
}

// Seeded dungeon floor: drunken-walk carving. Returns {tiles, entrance, exit, size}
const _dungeons = new Map();
export function dungeonFloor(floor) {
  if (_dungeons.has(floor)) return _dungeons.get(floor);
  const S = DUNGEON_MAP.size;
  const g = new Uint8Array(S * S).fill(TILE.WALL);
  let x = S >> 1, y = S - 8;
  const entrance = { x, y };
  let rngState = WORLD.SEED * 7919 + floor * 104729;
  const rnd = () => { rngState = (rngState * 1103515245 + 12345) & 0x7fffffff; return rngState / 0x7fffffff; };
  let far = { x, y, d: 0 };
  const steps = 2200;
  for (let i = 0; i < steps; i++) {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const nx = x + dx, ny = y + dy;
      if (nx > 0 && ny > 0 && nx < S - 1 && ny < S - 1) g[ny * S + nx] = TILE.CAVE;
    }
    const dir = rnd();
    if (dir < 0.28) x += 1; else if (dir < 0.56) x -= 1; else if (dir < 0.82) y -= 1; else y += 1;
    x = Math.max(2, Math.min(S - 3, x)); y = Math.max(2, Math.min(S - 3, y));
    const d = dist(x, y, entrance.x, entrance.y);
    if (d > far.d) far = { x, y, d };
  }
  const out = { tiles: g, entrance, exit: { x: far.x, y: far.y }, size: S };
  _dungeons.set(floor, out);
  return out;
}

export function tileAtPlane(plane, x, y) {
  if (plane === PLANE.OVERWORLD) return worldTile(x, y);
  if (plane === PLANE.COLOSSEUM) return arenaTile(x, y);
  if (plane >= PLANE.DUNGEON_BASE) {
    const f = dungeonFloor(plane - PLANE.DUNGEON_BASE);
    if (x < 0 || y < 0 || x >= f.size || y >= f.size) return TILE.WALL; // solid rock void
    return f.tiles[(y | 0) * f.size + (x | 0)];
  }
  if (plane >= PLANE.HOUSE_BASE) return houseTile(x, y);
  return TILE.OCEAN;
}
export function isBlocked(plane, x, y) {
  if (plane === PLANE.OVERWORLD) return isBlockedOverworld(x, y);
  return !TILE_WALKABLE.has(tileAtPlane(plane, x, y));
}

export { SHORTCUTS };

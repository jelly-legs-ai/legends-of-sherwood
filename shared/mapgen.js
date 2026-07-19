// Deterministic world generation shared by server and client. Both sides
// compute the identical 576x576 tile grid + node scatter from WORLD.SEED, so
// the map never crosses the network. Region layout is authored; detail is noise.

import { WORLD, TILE, TILE_WALKABLE, PLANE } from './constants.js';
import { TOWNS, POIS, SHORTCUTS, ARENA, HOUSE, DUNGEON_MAP, CASTLE } from './data/world.js';

const W = WORLD.W, H = WORLD.H;
export const WORLD_W = W, WORLD_H = H;

// ---- Map Studio overrides ---------------------------------------------------
// Hand-authored edits from the admin Map Studio, layered over the procedural
// world: per-tile terrain + elevation, node add/remove ("x,y" -> type or null),
// and free-standing custom levels (caves/dungeons) on their own planes.
// Both server and client apply the same overrides file, so the map still
// never crosses the network. Custom level planes: plane = -10 - slot.
export const MAP_OVERRIDES = { tiles: {}, elev: {}, nodes: {}, levels: {} };
export function applyMapOverrides(ov) {
  if (!ov) return;
  for (const k of ['tiles', 'elev', 'nodes']) {
    for (const [key, v] of Object.entries(ov[k] || {})) {
      if (v === null && k !== 'nodes') delete MAP_OVERRIDES[k][key];
      else MAP_OVERRIDES[k][key] = v;
    }
  }
  for (const [id, lv] of Object.entries(ov.levels || {})) {
    if (lv === null) delete MAP_OVERRIDES.levels[id];
    else MAP_OVERRIDES.levels[id] = lv;
  }
  _tiles = _nodes = _footprint = null;   // recompute the cached world
}
// Map Studio live preview: after the studio writes MAP_OVERRIDES.tiles for one
// tile, re-derive just that cell of the cached world so the rendered iso view
// updates instantly — no full computeWorld() rebuild per brush stroke.
export function syncTile(x, y) {
  if (!_tiles || x < 0 || y < 0 || x >= W || y >= H) return;
  const ov = MAP_OVERRIDES.tiles[x + ',' + y];
  _tiles[y * W + x] = ov !== undefined ? ov : tileAt(x, y);
}
// Same idea for a placed/removed node: re-derive just this cell of the node
// map so studio-placed props and deletions show in the rendered view at once.
export function syncNode(x, y) {
  if (!_nodes) return;
  const k = x + ',' + y;
  const ov = MAP_OVERRIDES.nodes[k];
  if (ov === null) _nodes.delete(k);
  else if (ov !== undefined) _nodes.set(k, ov);
  else { const n = scatterNodeAt(x, y); if (n) _nodes.set(k, n); else _nodes.delete(k); }
}
export function customLevel(slot) {
  for (const lv of Object.values(MAP_OVERRIDES.levels)) if (lv.slot === slot) return lv;
  return null;
}
// where you arrive in (and leave) a studio level: a pad by the south wall
export function levelEntry(lv) {
  const s = lv?.size || 64;
  return { x: s >> 1, y: s - 3 };
}
function customLevelTile(slot, x, y) {
  const lv = customLevel(slot);
  if (!lv) return TILE.OCEAN;
  const S2 = lv.size || 64;
  if (x < 0 || y < 0 || x >= S2 || y >= S2) return TILE.WALL;
  if (x === 0 || y === 0 || x === S2 - 1 || y === S2 - 1) return TILE.WALL;
  const t = lv.tiles?.[(x | 0) + ',' + (y | 0)];
  return t !== undefined ? t : (lv.fill ?? TILE.CAVE);
}

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
// The river system rises in the alpine peaks of the far north-east and works
// down across the realm: a headwater cascade, a north branch through Northmoor
// and western Sherwood, the broad lower Trent running west to the sea, a fen
// river draining south through the Fenwold, and the Elderglade stream. Domain
// warping (see riverDist) meanders every authored line into natural bends.
const RIVER_LINES = [
  { pts: [[430, 338], [380, 352], [300, 362], [240, 360], [150, 360], [28, 368]], w: 0.9 }, // the lower Trent
  { pts: [[554, 26], [536, 58], [510, 86], [486, 118], [458, 152], [444, 196], [434, 246], [426, 292], [430, 338]], w: 0.6 }, // alpine headwater
  { pts: [[510, 86], [470, 98], [424, 110], [380, 126], [340, 148], [306, 174], [280, 206], [262, 244], [252, 284], [246, 320], [240, 360]], w: 0.4 }, // north branch
  { pts: [[434, 246], [452, 288], [468, 328], [478, 370], [486, 414], [480, 460], [470, 508], [462, 548], [458, 578]], w: 0.5 }, // fen river
  { pts: [[240, 360], [236, 398], [244, 438], [258, 472], [262, 510], [256, 546], [250, 578]], w: 0.3 }, // elder stream
];
const RIVERS = RIVER_LINES.map(r => {
  const pts = r.pts.map(p => [S(p[0]), S(p[1])]);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [px, py] of pts) { x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); }
  const w = S(r.w), m = w + 14;
  return { pts, w, x0: x0 - m, y0: y0 - m, x1: x1 + m, y1: y1 + m };
});
// Still pools carved by the rivers — inland fisheries from the meadows to the
// frozen north. [x, y, radius] on the authored grid.
const POOLS = [
  [492, 108, 5],   // alpine tarn (top-tier fishing)
  [452, 180, 4],   // Grey Peaks tarn
  [272, 212, 5],   // Northmoor pool
  [238, 306, 4],   // west Sherwood pool
  [486, 412, 6],   // Fenwold broadwater
  [262, 474, 4],   // Elderglade pool
  [168, 330, 5],   // Barnsdale pond
  [120, 300, 4],   // west meadows pool
  [330, 74, 5],    // Wild Lands frozen pool
].map(([x, y, r]) => [S(x), S(y), S(r)]);
const ROAD_LINES = [
  // Nottingham's three roads meet its three gates dead-on (west, south, east —
  // the castle crag seals the north): the west road runs the gate axis, the
  // north road swings out through the EAST gate, the fen road leaves SOUTH.
  [[252, 332], [292, 331], [330, 330]],                          // Loxley → west gate
  [[364, 330], [376, 300], [356, 258], [330, 240], [300, 150]],  // east gate → the north road
  [[252, 336], [200, 368], [176, 396], [110, 412], [60, 420]],   // coast road skirting the Gulf of Barnsdale
  [[252, 340], [252, 440], [270, 470]],
  [[330, 334], [330, 372], [368, 398], [420, 420]],              // south gate → the fen road
  [[330, 330], [368, 330], [440, 300]],                          // east gate → the Peaks road
  [[330, 240], [352, 168]],              // spur to Peveril Keep
  [[210, 352], [196, 358]],              // lane into Edwinstowe
  [[420, 420], [400, 410]],              // causeway to Wyckham-on-Fen
  [[440, 300], [434, 296]],              // track up to Greywatch
  // ---- hamlet sub-roads: the little places tie into the greater web ----
  [[252, 332], [210, 300], [176, 272], [150, 250]],   // Loxley → Hathersage
  [[150, 250], [149, 278], [150, 300]],               // Hathersage → the air-altar meadow track
  [[196, 358], [176, 320], [160, 284], [150, 250]],   // Edwinstowe → Hathersage
  [[252, 332], [240, 318], [228, 304], [222, 296]],   // Loxley → Blidworth
  [[222, 296], [248, 294], [276, 296]],               // Blidworth → the Sherwood camp
  [[326, 268], [298, 278], [276, 296]],               // Ollerton Crossroads → the Sherwood camp
  [[398, 390], [386, 380]],                           // Papplewick spur onto the fen road
  [[300, 150], [276, 128], [252, 106], [240, 86]],    // Frosthollow → the Hooded Howe (into the Wild Lands)
  [[240, 86], [288, 72], [322, 76]],                  // Wild Lands trail: the Howe → the frozen pool
];
const ROADS = ROAD_LINES.map(line => {
  const pts = line.map(p => [S(p[0]), S(p[1])]);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [px, py] of pts) { x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); }
  return { pts, x0: x0 - 9, y0: y0 - 9, x1: x1 + 9, y1: y1 + 9 };
});
// Road distance with the sample point noise-displaced, so the dead-straight
// authored routes wander and kink like real cart tracks.
function roadDist(x, y) {
  const wx = x + (vnoise(x, y, 17, 65) - 0.5) * 5;
  const wy = y + (vnoise(x, y, 17, 66) - 0.5) * 5;
  let best = 1e9;
  for (const r of ROADS) {
    if (wx < r.x0 || wx > r.x1 || wy < r.y0 || wy > r.y1) continue;
    best = Math.min(best, distToPolyline(wx, wy, r.pts));
  }
  return best;
}
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
// Distance to the nearest river bank (negative inside the channel). The sample
// point is displaced by low-frequency noise before measuring, so the straight
// authored polylines meander into believable oxbows and bends for free.
function riverDist(x, y) {
  const wx = x + (vnoise(x, y, 13, 61) - 0.5) * 6;
  const wy = y + (vnoise(x, y, 13, 62) - 0.5) * 6;
  let best = 1e9;
  for (const r of RIVERS) {
    if (wx < r.x0 || wx > r.x1 || wy < r.y0 || wy > r.y1) continue;
    best = Math.min(best, distToPolyline(wx, wy, r.pts) - r.w);
  }
  return best;
}
// Inside a still pool? Radius wobbles with noise so banks curve naturally.
function inPool(x, y) {
  for (const [cx, cy, r] of POOLS) {
    if (Math.abs(x - cx) > r + 6 || Math.abs(y - cy) > r + 6) continue;
    if (dist(x, y, cx, cy) < r + (vnoise(x, y, 6, 63) - 0.5) * 3) return true;
  }
  return false;
}
// Signed distance inland from the sea. The continent's outline follows the
// authored World-example sketch: per-edge carve-depth profiles (control points
// on the 576 grid, linearly interpolated) shape the deep Gulf of Barnsdale in
// the west, leave Robin Hood's Bay on its peninsula with a small harbour
// indent, wobble the south coast, and run the east ocean all the way up to the
// alpine corner. Shoreline noise on top breaks every reach into coves and
// headlands.
const WEST_COAST = [[0, 8], [150, 10], [195, 14], [260, 35], [300, 70], [330, 110], [355, 155], [370, 165], [385, 148], [400, 80], [412, 30], [425, 30], [440, 28], [455, 16], [500, 12], [576, 12]];
const SOUTH_COAST = [[0, 16], [60, 26], [120, 40], [180, 30], [240, 42], [300, 32], [360, 40], [420, 30], [470, 44], [520, 26], [576, 20]];
const EAST_COAST = [[0, 0], [95, 4], [110, 8], [150, 22], [200, 32], [235, 26], [270, 22], [300, 30], [330, 26], [360, 44], [380, 49], [400, 40], [430, 26], [460, 34], [480, 20], [510, 14], [540, 12], [576, 16]];
function profileAt(prof, v) {
  const a = v / K;                             // back to authored coordinates
  for (let i = 1; i < prof.length; i++) {
    if (a <= prof[i][0]) {
      const [v0, d0] = prof[i - 1], [v1, d1] = prof[i];
      return S(d0 + (d1 - d0) * ((a - v0) / (v1 - v0 || 1)));
    }
  }
  return S(prof[prof.length - 1][1]);
}
function shoreDist(x, y) {
  const dW = x - (profileAt(WEST_COAST, y) + (fbm(0, y, 51) - 0.5) * S(14));
  const dS = (H - 1 - y) - (profileAt(SOUTH_COAST, x) + (fbm(x, 0, 52) - 0.5) * S(14));
  const dE = (W - 1 - x) - (profileAt(EAST_COAST, y) + (fbm(0, y + 4096, 53) - 0.5) * S(14));
  return Math.min(dW, dS, dE);
}

// ---- regions -------------------------------------------------------------------
export function regionAt(x0, y0) {
  // Towns pin their own region exactly — no warp may push a street into
  // another biome's terrain rules.
  if (dist(x0, y0, TOWNS.frosthollow.cx, TOWNS.frosthollow.cy) < TOWNS.frosthollow.r + 2) return 'FROSTHOLLOW';
  if (dist(x0, y0, TOWNS.nottingham.cx, TOWNS.nottingham.cy) < TOWNS.nottingham.r + 2) return 'NOTTINGHAM';
  if (dist(x0, y0, TOWNS.loxley.cx, TOWNS.loxley.cy) < TOWNS.loxley.r + 2) return 'LOXLEY';
  if (dist(x0, y0, TOWNS.bay.cx, TOWNS.bay.cy) < TOWNS.bay.r + 2) return 'BAY';
  // Organic biome frontiers: the authored layout is queried through a two-
  // octave domain warp, so every border wanders in its own natural shape
  // instead of tracing the old rectangles.
  const x = x0 + (vnoise(x0, y0, 52, 901) - 0.5) * S(20) + (vnoise(x0, y0, 13, 903) - 0.5) * S(6);
  const y = y0 + (vnoise(x0, y0, 52, 907) - 0.5) * S(20) + (vnoise(x0, y0, 13, 909) - 0.5) * S(6);
  if (x > S(460) && y < S(112)) return 'ALPINE';   // the high peaks of the far north-east
  if (y < S(96)) return 'WILDLANDS';
  if (y < S(200)) return 'NORTHMOOR';
  if (x > S(430) && y > S(140) && y < S(390)) return 'PEAKS';
  if (x > S(370) && y > S(395)) return 'FENWOLD';
  if (y > S(440) && x > S(170) && x <= S(370)) return 'ELDERGLADE';
  if (dist(x, y, S(290), S(308)) < S(72)) return 'SHERWOOD';
  if (x < S(170) && y > S(448)) return 'DESERT';   // the Sunfall Sands: dunes past the bay
  if (x < S(110) && y > S(380)) return 'BAY';
  return 'MEADOWS';
}
function dist(x1, y1, x2, y2) { const dx = x1 - x2, dy = y1 - y2; return Math.sqrt(dx * dx + dy * dy); }

// ---- towns ---------------------------------------------------------------------
// Settlement grounds are organic blobs, not circles: the radius bulges outward
// with noise (never inward, so buildings and walls always stay on town ground).
function townRadius(t, x, y) {
  return t.r + Math.max(0, (vnoise(x, y, 13, 71) - 0.42)) * t.r * 0.8;
}

// ---- streets & town furniture ---------------------------------------------------
// Every building's door is joined to a central cobbled plaza by a street, and the
// square is dressed with deterministic furniture (a well/fountain, benches, lamp
// posts, flower beds, market stalls, barrels & a signpost). Streets are painted
// as TILE.PATH within the town ground; furniture is emitted as decorative nodes
// (see TOWN_PROPS, merged into computeWorld) so both sides render it identically.
const STREET_TILES = new Set();
const PLAZAS = [];       // { cx, cy, r }
const TOWN_PROPS = [];   // [type, x, y]
function doorOutside(b) {
  const mid = { S: [b.x + (b.w >> 1), b.y + b.h - 1], N: [b.x + (b.w >> 1), b.y], E: [b.x + b.w - 1, b.y + (b.h >> 1)], W: [b.x, b.y + (b.h >> 1)] }[b.door] || [b.x + (b.w >> 1), b.y + b.h - 1];
  const d = { S: [0, 1], N: [0, -1], E: [1, 0], W: [-1, 0] }[b.door] || [0, 1];
  return [mid[0] + d[0], mid[1] + d[1]];
}
function inAnyBuilding(x, y) {
  for (const key in TOWNS) for (const b of TOWNS[key].buildings)
    if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return true;
  return false;
}
function rasterStreet(x0, y0, x1, y1) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t;
    // a 2-wide street: the centre tile plus its lower/right neighbour
    for (const [ox, oy] of [[0, 0], [1, 0], [0, 1]]) STREET_TILES.add(`${Math.round(cx) + ox},${Math.round(cy) + oy}`);
  }
}
function buildTownFurniture() {
  for (const key in TOWNS) {
    const t = TOWNS[key];
    const cx = t.cx, cy = t.cy;
    const big = t.r >= S(20);
    const plazaR = t.walled && big ? 6 : big ? 4 : t.r >= S(12) ? 3 : 2;
    PLAZAS.push({ cx, cy, r: plazaR });
    for (const b of t.buildings) { const [dx, dy] = doorOutside(b); rasterStreet(dx, dy, cx, cy); }
    // walled cities: paved avenues run from every gate to the central plaza
    const GATE_PT = { W: [cx - t.r, cy], E: [cx + t.r, cy], S: [cx, cy + t.r], N: [cx, cy - t.r] };
    if (t.walled) for (const s of (t.gates || ['N', 'W', 'S', 'E'])) rasterStreet(GATE_PT[s][0], GATE_PT[s][1], cx, cy);
    // authored squares (markets, parade grounds) are fully paved
    if (t.squares) for (const q of t.squares)
      for (let qy = q.y; qy < q.y + q.h; qy++) for (let qx = q.x; qx < q.x + q.w; qx++) STREET_TILES.add(`${qx},${qy}`);
    // deterministic furniture ---------------------------------------------------
    // Decoration density follows settlement wealth: walled cities are fully
    // dressed, towns moderately, villages keep only the rustic essentials
    // (and gain farmstead clutter — washing lines, a scarecrow — instead).
    const wealth = t.walled ? 2 : big ? 1 : 0;
    const rnd = (s) => vnoise(cx + s * 7, cy - s * 5, 3, 41 + s);
    const occupied = new Set();
    const put = (type, x, y) => {
      x = Math.round(x); y = Math.round(y);
      const k = `${x},${y}`;
      if (occupied.has(k) || inAnyBuilding(x, y)) return;
      if (dist(x, y, cx, cy) > t.r) return;       // keep it on town ground
      occupied.add(k); TOWN_PROPS.push([type, x, y]);
    };
    // centrepiece: a fountain in the cities, a village well otherwise
    put(t.walled || big ? 'fountain' : 'well', cx, cy);
    // a ring of benches, lamp posts and flower beds around the square
    const ring = plazaR + 1, spots = wealth === 2 ? 12 : wealth === 1 ? 8 : 5;
    const RING = ['park_bench', 'lamp_post', 'flower_bed', 'lamp_post', 'flower_bed', 'park_bench', 'lamp_post', 'flower_bed'];
    for (let i = 0; i < spots; i++) {
      const a = (i / spots) * Math.PI * 2;
      put(RING[i % RING.length], cx + Math.cos(a) * ring, cy + Math.sin(a) * (ring - 0.5));
    }
    // lamp posts marching along each street, and a barrel/crate by a couple of
    // doors — cities light every street, villages only every other one
    for (let bi = 0; bi < t.buildings.length; bi++) {
      const b = t.buildings[bi];
      const [dx, dy] = doorOutside(b);
      const midx = (dx + cx) / 2, midy = (dy + cy) / 2;
      if (wealth > 0 || bi % 2 === 0) put('lamp_post', midx + (dx < cx ? -1 : 1), midy);
      if (bi % (wealth === 2 ? 1 : wealth === 1 ? 2 : 3) === 0)
        put(rnd(bi) > 0.5 ? 'barrel' : 'crate', dx + (dx < cx ? -1 : 1), dy + 1);
    }
    // villages & towns hang their washing out back; a scarecrow guards the
    // village edge — the poorer the place, the more homespun the dressing
    if (wealth < 2 && t.buildings.length) {
      const b0 = t.buildings[0];
      put('wash_line', b0.x - 2, b0.y + b0.h + 1);
      if (wealth === 0) {
        put('scarecrow', cx + ring + 3, cy + ring + 2);
        if (t.buildings[1]) put('wash_line_full', t.buildings[1].x + t.buildings[1].w + 1, t.buildings[1].y + t.buildings[1].h + 1);
      }
    }
    // market stalls + a signpost for the bigger settlements
    if (big) {
      put('market_cart', cx - ring - 1, cy - 1);
      put('market_cart', cx + ring + 1, cy + 1);
      put('hay_bale', cx - 1, cy + ring + 1);
    }
    put('signpost', cx + (rnd(9) > 0.5 ? ring + 1 : -ring - 1), cy - ring);
    // cities: a hanging shop sign beside every trader's door, and lamp posts
    // marching down each gate avenue so the streets read as real streets
    if (t.walled) {
      for (const b of t.buildings) {
        if (b.castle || b.ge) continue;
        const [dx, dy] = doorOutside(b);
        const [px2, py2] = (b.door === 'E' || b.door === 'W') ? [0, 1] : [1, 0];
        put('shop_sign', dx + px2, dy + py2);
      }
      for (const s of (t.gates || ['N', 'W', 'S', 'E'])) {
        const [gx, gy] = GATE_PT[s];
        const horiz = s === 'W' || s === 'E';
        const steps = Math.floor((t.r - plazaR - 3) / 7);
        for (let i = 1; i <= steps; i++) {
          const f = plazaR + 2 + i * 7;
          const ax = horiz ? cx + Math.sign(gx - cx) * f : cx + (i % 2 ? -2 : 3);
          const ay = horiz ? cy + (i % 2 ? -2 : 3) : cy + Math.sign(gy - cy) * f;
          put('lamp_post', ax, ay);
          if (i % 2 === 0) put(rnd(i) > 0.5 ? 'park_bench' : 'flower_bed', horiz ? ax : cx + (i % 2 ? 3 : -2), horiz ? cy + (i % 2 ? 3 : -2) : ay);
        }
      }
    }
  }
}
buildTownFurniture();
function townPath(x, y) {
  if (STREET_TILES.has(`${x},${y}`)) return true;
  for (const p of PLAZAS) if (Math.abs(x - p.cx) <= p.r && Math.abs(y - p.cy) <= p.r && dist(x, y, p.cx, p.cy) <= p.r) return true;
  return false;
}

function townTile(x, y) {
  // buildings first — across ALL towns, so one settlement's bulging ground can
  // never swallow a neighbour's cottages
  for (const key in TOWNS) {
    const t = TOWNS[key];
    if (Math.abs(x - t.cx) > t.r + 14 || Math.abs(y - t.cy) > t.r + 14) continue;
    for (const b of t.buildings) {
      if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) {
        const stone = b.castle || b.fortified;   // castles & the fortified Exchange are coursed stone
        const onEdge = x === b.x || x === b.x + b.w - 1 || y === b.y || y === b.y + b.h - 1;
        if (onEdge) {
          const mid = { S: [b.x + (b.w >> 1), b.y + b.h - 1], N: [b.x + (b.w >> 1), b.y], E: [b.x + b.w - 1, b.y + (b.h >> 1)], W: [b.x, b.y + (b.h >> 1)] }[b.door];
          if (mid && mid[0] === x && mid[1] === y) return stone ? TILE.FLOOR_STONE : TILE.FLOOR_WOOD; // door
          return stone ? TILE.WALL : TILE.WALL_WOOD;
        }
        return stone ? TILE.FLOOR_STONE : TILE.FLOOR_WOOD;
      }
    }
  }
  for (const key in TOWNS) {
    const t = TOWNS[key];
    if (Math.abs(x - t.cx) > t.r * 1.5 + 6 || Math.abs(y - t.cy) > t.r * 1.5 + 6) continue;
    const d = dist(x, y, t.cx, t.cy);
    const rr = townRadius(t, x, y);
    // Castle moat (#126): a water ring hugs the outside of the rampart. Each gate
    // gets a timber drawbridge, but drawn as a DEAD-STRAIGHT square-on span rather
    // than a slice of the wavy ring — we measure the moat depth on the gate's
    // centre-line (perpendicular offset 0) and lay a uniform-width deck straight
    // across it, so the crossing reads as a clean rectangular bridge instead of a
    // jagged L that follows the organic bank.
    if (t.moat && t.walled) {
      const gw = 3;
      for (const s of (t.gates || [])) {
        let pd, od;   // pd: perpendicular offset from the gate axis; od: outward distance from centre
        if (s === 'S') { pd = x - t.cx; od = y - t.cy; }
        else if (s === 'N') { pd = x - t.cx; od = t.cy - y; }
        else if (s === 'E') { pd = y - t.cy; od = x - t.cx; }
        else { pd = y - t.cy; od = t.cx - x; }   // W
        if (od <= 0 || Math.abs(pd) > gw) continue;
        // wall radius sampled on the centre-line at this ring — the SAME value for
        // every tile across the strip, so the deck's edges stay perfectly straight
        const r0 = (s === 'S' || s === 'N') ? townRadius(t, t.cx, y) : townRadius(t, x, t.cy);
        if (od >= r0 - 1 && od < r0 + 3.2) return TILE.BRIDGE;   // gate threshold → across the moat → far bank
      }
    }
    if (t.moat && t.walled && d >= rr && d < rr + 2.4) return TILE.WATER;
    if (d < rr) {
      if (t.walled) {
        // Sealed rampart: a tile is wall if ANY of its 8 neighbours falls off
        // the town ground — the inner boundary of the organic blob, so the
        // ring can never gap the way the old thin distance-band did.
        let edge = false;
        for (let oy = -1; oy <= 1 && !edge; oy++) for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          if (dist(x + ox, y + oy, t.cx, t.cy) >= townRadius(t, x + ox, y + oy)) { edge = true; break; }
        }
        if (edge) {
          // gate openings only on the town's authored sides, on the road axes
          const gw = 3;
          for (const s of (t.gates || ['N', 'W', 'S', 'E'])) {
            if (s === 'W' && x < t.cx && Math.abs(y - t.cy) <= gw) return TILE.PATH;
            if (s === 'E' && x > t.cx && Math.abs(y - t.cy) <= gw) return TILE.PATH;
            if (s === 'S' && y > t.cy && Math.abs(x - t.cx) <= gw) return TILE.PATH;
            if (s === 'N' && y < t.cy && Math.abs(x - t.cx) <= gw) return TILE.PATH;
          }
          return TILE.WALL;
        }
      }
      // settlement grounds are living grass threaded by paths, brightened by
      // occasional wildflower patches (no bare dirt, no dirt floors)
      if (townPath(x, y)) return TILE.PATH;
      if (t.snowy) return TILE.SNOW;
      return vnoise(x, y, 7, 83) > 0.74 ? TILE.MEADOW : TILE.GRASS;
    }
  }
  return -1;
}

// Wall material tiers (#126): walled-town perimeter walls read as castle
// curtain wall (big grey brick, crenellated); stone buildings inside those
// walls build in cobblestone; everything else keeps its tile-type material.
export function wallStyleAt(x, y) {
  for (const key in TOWNS) {
    const t = TOWNS[key];
    if (!t.walled) continue;
    if (Math.abs(x - t.cx) > t.r * 1.5 + 8 || Math.abs(y - t.cy) > t.r * 1.5 + 8) continue;
    if (dist(x, y, t.cx, t.cy) >= townRadius(t, x, y)) continue;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oy) continue;
      if (dist(x + ox, y + oy, t.cx, t.cy) >= townRadius(t, x + ox, y + oy)) return 'castle';
    }
    return 'cobble';
  }
  return null;
}

// ---- main tile function ----------------------------------------------------------
export function tileAt(x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) return TILE.OCEAN;
  const sd = shoreDist(x, y);
  if (sd < 0) {
    // offshore: the occasional rocky islet breaks the swell near the coast
    if (sd > -26) {
      const isl = vnoise(x, y, 9, 56);
      if (isl > 0.9) return TILE.GRASS;
      if (isl > 0.865) return TILE.SAND;
    }
    return TILE.OCEAN;
  }

  const tt = townTile(x, y);
  if (tt >= 0) return tt;

  const river = riverDist(x, y);
  const road = roadDist(x, y);
  if (river < 1.7 && road < 1.4) return TILE.BRIDGE;
  if (river < 1.7) return TILE.RIVER;
  if (inPool(x, y)) return TILE.WATER;

  if (road < 1.1) return TILE.ROAD;
  if (sd < 2.5 + vnoise(x, y, 5, 55) * 3) return TILE.SAND;   // beaches trace the coves

  const reg = regionAt(x, y);
  const n = fbm(x, y), n2 = fbm(x, y, 31);
  switch (reg) {
    case 'ALPINE': {
      if (n > 0.62) return TILE.ROCK;
      if (n > 0.48) return TILE.SCREE;
      return n2 > 0.45 ? TILE.SNOW : TILE.TUNDRA;
    }
    case 'WILDLANDS': return n < 0.35 ? TILE.ICE : TILE.SNOW;
    case 'DESERT': {
      // rolling dunes: sand with wind-scoured dirt hollows and scree outcrops
      if (n2 > 0.78) return TILE.SCREE;
      if (n > 0.7) return TILE.DIRT;
      return TILE.SAND;
    }
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
  ALPINE: [4, 4], WILDLANDS: [3, 3], NORTHMOOR: [2, 3], FROSTHOLLOW: [3, 1], PEAKS: [3, 5],
  SHERWOOD: [1, 2], NOTTINGHAM: [1, 0], LOXLEY: [1, 1], MEADOWS: [0, 2],
  BAY: [0, 1], FENWOLD: [0, 1], ELDERGLADE: [1, 2],
};
export const MAX_ELEV = 8;

export function heightAt(x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) return 0;
  const hov = MAP_OVERRIDES.elev[(x | 0) + ',' + (y | 0)];
  if (hov !== undefined) return hov;
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
  // shoreline falls smoothly to sea level (whatever shape the carved coast takes)
  const shore = Math.min(1, Math.max(0, shoreDist(x, y) / 26 + 0.15));
  h *= shore;
  // rivers cut a shallow channel; a bridge deck stays level with its road banks.
  // (Original waterfall behaviour — restored by request: the h-0.8 offset gives
  // the falls their preferred look, only spilling at the larger elevation steps.)
  if (t === TILE.RIVER || t === TILE.WATER_SWAMP || t === TILE.WATER) h = Math.max(0, h - 0.8);
  return Math.max(0, Math.min(MAX_ELEV, Math.round(h)));
}

// ---- scattered gather nodes --------------------------------------------------------
const SCATTER = {
  LOXLEY: [['tree', 0.02], ['oak_tree', 0.005], ['rocks_grey', 0.0012]],
  MEADOWS: [['tree', 0.016], ['oak_tree', 0.004], ['rocks_grey', 0.0012]],
  BAY: [['tree', 0.012], ['rocks_sand', 0.002], ['spire_sand', 0.0005]],
  SHERWOOD: [['tree', 0.045], ['oak_tree', 0.02], ['willow_tree', 0.008], ['maple_tree', 0.006], ['yew_tree', 0.0025], ['rocks_dark', 0.001]],
  ELDERGLADE: [['maple_tree', 0.02], ['yew_tree', 0.006], ['elm_tree', 0.003], ['willow_tree', 0.012], ['rocks_dark', 0.001],
    // the Wildwood jungle (#127): giant hollow trunks, dense undergrowth,
    // harvestable exotics and overgrown temple ruins
    ['jungle_tree_great', 0.0012], ['jungle_tree_stump', 0.0012], ['jungle_tree_barrel', 0.0015],
    ['jungle_log_arch', 0.002], ['jungle_log', 0.004],
    ['jungle_fern', 0.02], ['jungle_monstera', 0.012], ['jungle_palm', 0.012], ['jungle_leaves', 0.015],
    ['pitcher_plant', 0.004], ['heliconia', 0.004],
    ['ruin_totem', 0.001], ['ruin_statue', 0.001], ['ruin_rubble', 0.0015], ['ruin_gate', 0.0004]],
  FENWOLD: [['willow_tree', 0.02], ['tree', 0.008], ['grave_cross', 0.0006], ['rocks_dark', 0.0008]],
  NORTHMOOR: [['frostpine_tree', 0.006], ['tree', 0.004], ['rocks_dark', 0.002], ['spire_dark', 0.0006], ['grave_slab', 0.0005], ['mountain_snow_0', 0.0003], ['mountain_snow_1', 0.0004], ['mountain_snow_2', 0.0004]],
  PEAKS: [['iron_rock', 0.007], ['coal_rock', 0.007], ['silver_rock', 0.0022], ['mithril_rock', 0.0018], ['gold_rock', 0.0015], ['rocks_grey', 0.004], ['spire_grey', 0.0012], ['crag_grey', 0.0006], ['mountain_grey_0', 0.00035], ['mountain_grey_1', 0.0007], ['mountain_grey_2', 0.0007]],
  WILDLANDS: [['sylvanite_rock', 0.0015], ['frostpine_tree', 0.005], ['rocks_black', 0.003], ['spire_black', 0.001], ['crag_black', 0.0006], ['mountain_snow_0', 0.0004], ['mountain_snow_1', 0.0007]],
  ALPINE: [['frostpine_tree', 0.01], ['silver_rock', 0.003], ['mithril_rock', 0.0022], ['gold_rock', 0.0022], ['sylvanite_rock', 0.0012], ['rocks_grey', 0.0035], ['crag_grey', 0.0008], ['mountain_snow_0', 0.0005], ['mountain_snow_1', 0.0008], ['mountain_snow_2', 0.0008]],
  DESERT: [['rocks_sand', 0.004], ['spire_sand', 0.0015], ['crag_sand', 0.0006], ['copper_rock', 0.0018], ['gold_rock', 0.0008]],
};
const NODE_OK_TILES = new Set([TILE.GRASS, TILE.MEADOW, TILE.FOREST, TILE.DEEPFOREST, TILE.JUNGLE, TILE.SWAMP, TILE.TUNDRA, TILE.SNOW, TILE.SCREE, TILE.DIRT]);

export function scatterNodeAt(x, y) {
  const t = tileAt(x, y);
  if (!NODE_OK_TILES.has(t)) return null;
  const reg = regionAt(x, y);
  const list = SCATTER[reg];
  if (!list) return null;
  // Trees gather into groves & woodlands with open clearings between, rather than
  // blanketing the map evenly: a coarse noise field gates them out of clearings
  // and concentrates them into forest cores. Rocks/ore are placed evenly as before.
  const grove = Math.max(0, vnoise(x, y, 26, 71) - 0.5) / 0.5;      // 0 across open clearings (~half the land) … 1 in a forest core
  const groveMult = grove * 3.0;                                     // dense woodland cores where trees do gather
  const r = hash2(x * 3 + 1, y * 5 + 2, 999);
  let acc = 0;
  for (const [type, dens] of list) {
    const isTree = type === 'tree' || type.endsWith('_tree');
    acc += isTree ? dens * groveMult : dens;
    if (r < acc) {
      // mountain formations only rise from locally-flat ground so the base
      // never straddles a cliff step (#131)
      if (type.startsWith('mountain_')) {
        const h = heightAt(x, y);
        for (const [ox, oy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, 2]])
          if (Math.abs(heightAt(x + ox, y + oy) - h) > 1) return null;
      }
      return type;
    }
  }
  return null;
}

// Big formations claim their full footprint, not just the anchor tile (#131):
// [rx, ry] tile radii around the anchor become unwalkable so players can't
// stroll through a mountain's flanks or a giant trunk.
const NODE_FOOTPRINT = {
  mountain_grey_0: [2, 2], mountain_snow_0: [2, 2], mountain_dark_0: [2, 2],
  mountain_grey_1: [2, 1], mountain_snow_1: [2, 1], mountain_dark_1: [2, 1],
  mountain_grey_2: [1, 2], mountain_snow_2: [1, 2], mountain_dark_2: [1, 2],
  jungle_tree_great: [2, 1], jungle_tree_stump: [2, 1], jungle_tree_barrel: [1, 1],
  jungle_log_arch: [1, 0], jungle_log: [1, 0], ruin_gate: [1, 0],
  crag_grey: [1, 1], crag_dark: [1, 1], crag_black: [1, 1], crag_sand: [1, 1],
  dolmen_grey: [1, 0], dolmen_dark: [1, 0], dolmen_black: [1, 0], dolmen_sand: [1, 0],
};

// ---- full map computation (cached) ---------------------------------------------------
let _tiles = null, _nodes = null, _footprint = null;
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
  for (const [type, x, y] of TOWN_PROPS) if (!inAnyBuilding(x, y)) _nodes.set(x + ',' + y, type); // town furniture
  for (const [type, x, y] of POIS) _nodes.set(x + ',' + y, type); // authored POIs win over furniture
  // both ends of every agility shortcut are clickable nodes (previously only
  // endpoints that happened to be duplicated in POIS worked)
  for (const [type, x1, y1, x2, y2] of SHORTCUTS) {
    _nodes.set(x1 + ',' + y1, type);
    _nodes.set(x2 + ',' + y2, type);
  }
  // Fishing spots must sit ON open water. Authored coordinates are approximate
  // (the warped rivers meander, pools wobble), so snap each spot to the nearest
  // water tile within 8 — this guarantees every fishery lands in its pool/river.
  const SPOT_TYPES = new Set(['net_spot', 'rod_spot', 'harpoon_spot']);
  const WATERY = new Set([TILE.RIVER, TILE.WATER, TILE.OCEAN, TILE.WATER_SWAMP]);
  for (const [key, type] of [..._nodes]) {
    if (!SPOT_TYPES.has(type)) continue;
    const [px, py] = key.split(',').map(Number);
    if (WATERY.has(_tiles[py * W + px])) continue;
    let best = null, bd = 1e9;
    for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
      const nx = px + dx, ny = py + dy;
      if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
      if (!WATERY.has(_tiles[ny * W + nx])) continue;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = nx + ',' + ny; }
    }
    _nodes.delete(key);
    if (best && !_nodes.has(best)) _nodes.set(best, type);
  }
  // Map Studio overrides win over everything procedural: painted terrain,
  // then placed (or null = removed) nodes
  for (const [key, t] of Object.entries(MAP_OVERRIDES.tiles)) {
    const [ox, oy] = key.split(',').map(Number);
    if (ox >= 0 && oy >= 0 && ox < W && oy < H) _tiles[oy * W + ox] = t;
  }
  for (const [key, t] of Object.entries(MAP_OVERRIDES.nodes)) {
    if (t === null) _nodes.delete(key); else _nodes.set(key, t);
  }
  // every studio level with a placed gate opens a cave mouth in the world
  for (const [id, lv] of Object.entries(MAP_OVERRIDES.levels)) {
    if (lv?.gate) _nodes.set((lv.gate.x | 0) + ',' + (lv.gate.y | 0), 'cave_gate:' + id);
  }
  // big formations spread their collision over the surrounding tiles
  _footprint = new Set();
  for (const [key, type] of _nodes) {
    const fp = NODE_FOOTPRINT[type];
    if (!fp) continue;
    const [fx, fy] = key.split(',').map(Number);
    for (let dy = -fp[1]; dy <= fp[1]; dy++)
      for (let dx = -fp[0]; dx <= fp[0]; dx++)
        if (dx || dy) _footprint.add((fx + dx) + ',' + (fy + dy));
  }
  return { tiles: _tiles, nodes: _nodes };
}

export function worldTile(x, y) {
  const { tiles } = computeWorld();
  if (x < 0 || y < 0 || x >= W || y >= H) return TILE.OCEAN;
  // Nottingham Castle stands on the overworld as its own ground floor (F1) — the
  // SAME generated plan as the upper floors, so the exterior footprint is
  // identical to what you walk when you climb the ladders.
  const lx = (x | 0) - CASTLE.ox, ly = (y | 0) - CASTLE.oy;
  if (lx >= 0 && ly >= 0 && lx < CASTLE.cols && ly < CASTLE.rows) return castleFloor(1).tiles[ly * CASTLE.cols + lx];
  return tiles[(y | 0) * W + (x | 0)];
}

// Blocking: unwalkable tile, or a gather node occupies it (except flat stations)
const FLAT_NODES = new Set(['net_spot', 'rod_spot', 'harpoon_spot', 'allotment', 'herb_patch', 'rabbit_run', 'fox_trail', 'deer_track', 'sable_run', 'campfire', 'log_balance', 'stepping_stones', 'cliff_scramble', 'rope_swing', 'ice_traverse', 'cliff_ladder', 'roman_ruin', 'saxon_barrow', 'druid_circle', 'norman_keep', 'grail_shrine', 'dungeon_entrance', 'house_portal', 'ge_rope', 'shop_sign']);
export function isBlockedOverworld(x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) return true;
  if (!TILE_WALKABLE.has(worldTile(x, y))) return true;
  const key = (x | 0) + ',' + (y | 0);
  const n = computeWorld().nodes.get(key);
  if (n && !FLAT_NODES.has(n) && !n.startsWith('cave_gate:')) return true;
  if (_footprint.has(key)) return true;   // inside a big formation's base
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
  // homestead garden beds: tilled farm soil flanking the front path
  for (const g of HOUSE.garden) if (g.x === x && g.y === y) return TILE.FARM;
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

// Nottingham Castle upper floors (planes CASTLE_BASE + floor). Each floor is a
// deterministic labyrinth carved to fill the keep footprint (cols x rows), so
// the plan mirrors the building; a drunkard walk from a start cell guarantees
// every carved tile is connected. 'down' is where you arrive from below, 'up'
// where you arrive from above (the top floor is an open roof with no up).
const _castleFloors = new Map();
export function castleFloor(floor) {
  if (_castleFloors.has(floor)) return _castleFloors.get(floor);
  const W = CASTLE.cols, H = CASTLE.rows, F = TILE.FLOOR_STONE, WL = TILE.WALL;
  const g = new Uint8Array(W * H).fill(WL);
  const roof = floor >= CASTLE.topFloor;
  const set = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y * W + x] = F; };
  const rect = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y); };

  if (roof) {
    // the open roof / battlement deck: a walkable lead surrounded by a
    // crenellated parapet (alternating merlons) so the silhouette isn't a box
    rect(2, 2, W - 3, H - 3);
    for (let x = 2; x < W - 2; x += 2) { g[1 * W + x] = WL; g[(H - 2) * W + x] = WL; }
    for (let y = 2; y < H - 2; y += 2) { g[y * W + 1] = WL; g[y * W + W - 2] = WL; }
    const down = { x: W >> 1, y: H >> 1 };
    const out = { tiles: g, cols: W, rows: H, down, up: null };
    _castleFloors.set(floor, out); return out;
  }

  // A proper castle floor: a grid of chambers inside a thick curtain wall, linked
  // by doorways (so it reads as rooms + corridors, not one cave), a great hall
  // knocked through the middle, drum towers at the corners, and a south gatehouse
  // opening (the ground-floor entrance from the bailey). The doorway spanning-grid
  // guarantees every chamber — and the gate — is reachable.
  const m = 2;                                        // curtain-wall margin
  const RC = Math.max(3, Math.round((W - 2 * m) / 9));    // ~9-tile chambers
  const RR = Math.max(3, Math.round((H - 2 * m) / 9));
  const cw = (W - 2 * m) / RC, ch = (H - 2 * m) / RR;
  const rooms = [];
  for (let ry = 0; ry < RR; ry++) for (let rx = 0; rx < RC; rx++) {
    const x0 = m + Math.round(rx * cw) + 1, x1 = m + Math.round((rx + 1) * cw) - 1;
    const y0 = m + Math.round(ry * ch) + 1, y1 = m + Math.round((ry + 1) * ch) - 1;
    rect(x0, y0, x1, y1);
    rooms.push({ x0, y0, x1, y1, cx: (x0 + x1) >> 1, cy: (y0 + y1) >> 1 });
  }
  const at = (rx, ry) => rooms[ry * RC + rx];
  for (let ry = 0; ry < RR; ry++) for (let rx = 0; rx < RC; rx++) {
    const a = at(rx, ry);
    if (rx < RC - 1) { const b = at(rx + 1, ry), yy = Math.max(a.y0, b.y0); for (let x = a.x1; x <= b.x0; x++) set(x, yy); }
    if (ry < RR - 1) { const b = at(rx, ry + 1), xx = Math.max(a.x0, b.x0); for (let y = a.y1; y <= b.y0; y++) set(xx, y); }
  }
  // great hall: a large central throne room knocked through the middle chambers —
  // the Sheriff holds court (and is fought) here on the ground floor. Spanning a
  // 3-wide x 2-tall block of rooms gives a proper boss arena.
  { const c0 = Math.max(0, (RC >> 1) - 2), c1 = Math.min(RC - 1, c0 + 2), r0 = Math.max(0, (RR >> 1) - 1), r1 = Math.min(RR - 1, r0 + 1);
    const a = at(c0, r0), b = at(c1, r1);
    rect(a.x0, a.y0, b.x1, b.y1); }
  // corner drum towers linked back into the interior
  for (const [cx, cy, sx, sy] of [[m, m, 1, 1], [W - 1 - m, m, -1, 1], [m, H - 1 - m, 1, -1], [W - 1 - m, H - 1 - m, -1, -1]]) {
    rect(Math.min(cx, cx + sx * 2), Math.min(cy, cy + sy * 2), Math.max(cx, cx + sx * 2), Math.max(cy, cy + sy * 2));
    for (let i = 0; i <= 3; i++) { set(cx + sx * i, cy + sy); set(cx + sx, cy + sy * i); }
  }
  // south gatehouse: a 2-wide passage from the outer wall up into the bottom-centre
  // chamber (the way in from the bailey on the ground floor)
  const gx = W >> 1, gate = at(RC >> 1, RR - 1);
  for (let y = H - 1; y >= gate.cy; y--) { set(gx, y); set(gx + 1, y); }
  const down = { x: rooms[0].cx, y: rooms[0].cy };
  const up = { x: rooms[rooms.length - 1].cx, y: rooms[rooms.length - 1].cy };
  const out = { tiles: g, cols: W, rows: H, down, up };
  _castleFloors.set(floor, out); return out;
}
export function castleFloorTile(plane, x, y) {
  const f = castleFloor(plane - PLANE.CASTLE_BASE);
  const lx = (x | 0) - CASTLE.ox, ly = (y | 0) - CASTLE.oy;
  if (lx < 0 || ly < 0 || lx >= f.cols || ly >= f.rows) return TILE.WALL;
  return f.tiles[ly * f.cols + lx];
}
// is (x,y) inside the castle keep footprint on the overworld? — lets the renderer
// draw the keep's walls as solid castle masonry (same as the floor planes) instead
// of the thin building-wall slabs, and lets the zone label read "Nottingham Castle"
export function inCastle(x, y) {
  const lx = (x | 0) - CASTLE.ox, ly = (y | 0) - CASTLE.oy;
  return lx >= 0 && ly >= 0 && lx < CASTLE.cols && ly < CASTLE.rows;
}
// ladder world positions for a floor plane: {down, up|null}
export function castleLadders(plane) {
  const f = castleFloor(plane - PLANE.CASTLE_BASE);
  return {
    down: { x: CASTLE.ox + f.down.x, y: CASTLE.oy + f.down.y },
    up: f.up ? { x: CASTLE.ox + f.up.x, y: CASTLE.oy + f.up.y } : null,
  };
}
// the great hall's (overworld ground floor) up-ladder into floor 2 — the F1 plan's
// far chamber, so it sits deep inside the castle you enter through the gatehouse
export function castleKeepLadder() { const u = castleFloor(1).up; return { x: CASTLE.ox + u.x, y: CASTLE.oy + u.y }; }

export function tileAtPlane(plane, x, y) {
  if (plane === PLANE.OVERWORLD) return worldTile(x, y);
  if (plane <= -10) return customLevelTile(-10 - plane, x, y);   // Map Studio levels
  if (plane === PLANE.COLOSSEUM) return arenaTile(x, y);
  if (plane >= PLANE.CASTLE_BASE) return castleFloorTile(plane, x, y);
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
  if (!TILE_WALKABLE.has(tileAtPlane(plane, x, y))) return true;
  if (plane <= -10) {
    // studio-placed cave nodes (ore veins, mushroom logs…) block like their
    // overworld cousins; flat interactables stay walkable
    const n = customLevel(-10 - plane)?.nodes?.[(x | 0) + ',' + (y | 0)];
    if (n && !FLAT_NODES.has(n)) return true;
  }
  return false;
}

export { SHORTCUTS };

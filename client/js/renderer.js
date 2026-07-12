// Isometric world renderer: chunk-cached terrain, depth-sorted entities,
// LPC characters, procedural critters/nodes, day-night tint, northern snow.

import { WORLD, TILE, PLANE, WILDERNESS_Y } from '/shared/constants.js';
import { tileAtPlane, computeWorld, dungeonFloor, regionAt, heightAt, MAX_ELEV } from '/shared/mapgen.js';
import { REGIONS } from '/shared/constants.js';
import { HOUSE } from '/shared/data/world.js';
import { composite, drawChar, drawOversize, critterSprite, nodeSprite, ANIMS, itemIcon, proc } from './sprites.js';
import { MOBS } from '/shared/data/mobs.js';
import { drawCreature, drawChest, drawGeode, drawSheetCell, drawFxSprite, MEDIA, mimg } from './media.js';

export const TW = 64, TH = 32;         // iso tile size
export const toScreen = (x, y) => [(x - y) * (TW / 2), (x + y) * (TH / 2)];
export const toTile = (sx, sy) => [(sx / (TW / 2) + sy / (TH / 2)) / 2, (sy / (TH / 2) - sx / (TW / 2)) / 2];

const TILE_COLOR = {
  [TILE.OCEAN]: ['#1d3a5f', '#16304f'], [TILE.WATER]: ['#2a5580', '#224a72'], [TILE.RIVER]: ['#2e5f8a', '#27537a'],
  [TILE.SAND]: ['#d8c07a', '#c9b06a'], [TILE.GRASS]: ['#6da144', '#5f923a'], [TILE.MEADOW]: ['#7cb14e', '#6da144'],
  [TILE.DIRT]: ['#9a7d4f', '#8a6f45'], [TILE.FOREST]: ['#4f7d33', '#44702c'], [TILE.DEEPFOREST]: ['#3c6427', '#335821'],
  [TILE.SWAMP]: ['#556446', '#49573c'], [TILE.JUNGLE]: ['#3e7034', '#35612c'], [TILE.ROCK]: ['#7d7a70', '#6e6b62'],
  [TILE.SCREE]: ['#948f80', '#858072'], [TILE.TUNDRA]: ['#a8ab88', '#999c7a'], [TILE.SNOW]: ['#e8edf0', '#dbe2e8'],
  [TILE.ICE]: ['#c2dcec', '#b2cfe2'], [TILE.ROAD]: ['#b09a6a', '#a08a5c'], [TILE.BRIDGE]: ['#8a6d42', '#7a5f38'],
  [TILE.FLOOR_WOOD]: ['#96713d', '#875f35'], [TILE.FLOOR_STONE]: ['#8d8878', '#7d7868'], [TILE.WALL]: ['#6e6a5e', '#565248'],
  [TILE.WALL_WOOD]: ['#6b4f2a', '#553f22'], [TILE.FARM]: ['#7a5f3c', '#6d5435'],
  [TILE.LAVA_ROCK]: ['#4a3a38', '#403230'], [TILE.ARENA]: ['#c9b06a', '#baa25e'], [TILE.WATER_SWAMP]: ['#3d5348', '#35493f'],
  [TILE.CAVE]: ['#6e5a3e', '#5e4c32'],
};
const WALLS = new Set([TILE.WALL, TILE.WALL_WOOD]);
const WATERS = new Set([TILE.OCEAN, TILE.WATER, TILE.RIVER, TILE.WATER_SWAMP]);

// ---- textured terrain (free isometric block pack in client/assets/terrain) -----
// Atlas is an 11x11 grid of 32x32 blocks (diamond top + earthen side skirt),
// drawn at 2x. Tiles the pack lacks are tinted variants via canvas filters.
export const ESTEP = 32;           // screen px per elevation level (one block)
const terrainAtlas = new Image();
terrainAtlas.src = 'assets/terrain/nature.png';
let atlasReady = false;
terrainAtlas.onload = () => { atlasReady = true; chunkCache.clear(); };
const TILE_TEX = {
  [TILE.GRASS]: { v: [22, 23, 24] },
  [TILE.MEADOW]: { v: [37, 38, 39] },
  [TILE.FOREST]: { v: [40, 24, 40] },
  [TILE.DEEPFOREST]: { v: [40], f: 'brightness(0.82)' },
  [TILE.DIRT]: { v: [17, 18], f: 'brightness(1.08)' },
  [TILE.ROAD]: { v: [17, 18], f: 'sepia(0.3) brightness(1.18)' },
  [TILE.FARM]: { v: [19, 20] },
  [TILE.CAVE]: { v: [6], f: 'brightness(0.55)' },
  [TILE.LAVA_ROCK]: { v: [6], f: 'brightness(0.45)' },
  [TILE.FLOOR_WOOD]: { v: [14, 15] },
  [TILE.BRIDGE]: { v: [15] },
  [TILE.FLOOR_STONE]: { v: [63] },
  [TILE.ROCK]: { v: [63], f: 'brightness(0.85)' },
  [TILE.SCREE]: { v: [61, 62] },
  [TILE.SAND]: { v: [6, 7], f: 'sepia(0.65) saturate(1.35) brightness(1.4)' },
  [TILE.ARENA]: { v: [6, 7], f: 'sepia(0.65) saturate(1.35) brightness(1.45)' },
  [TILE.SNOW]: { v: [22, 23], f: 'saturate(0.06) brightness(1.6)' },
  [TILE.TUNDRA]: { v: [22, 24], f: 'saturate(0.5) brightness(1.02)' },
  [TILE.SWAMP]: { v: [22, 24], f: 'hue-rotate(25deg) saturate(0.6) brightness(0.8)' },
  [TILE.JUNGLE]: { v: [22, 23], f: 'saturate(1.3) brightness(0.8)' },
  [TILE.OCEAN]: { v: [93, 95, 96] },
  [TILE.WATER]: { v: [99, 100, 101] },
  [TILE.RIVER]: { v: [99, 100, 101] },
  [TILE.WATER_SWAMP]: { v: [99, 100], f: 'hue-rotate(55deg) saturate(0.55) brightness(0.85)' },
  [TILE.ICE]: { v: [110, 111, 112] },
};
const texCache = new Map(); // "t:variantIdx[:dark]" -> 64x64 canvas
function tileTexture(t, pick, dark = 0) {
  const spec = TILE_TEX[t];
  if (!spec || !atlasReady) return null;
  const idx = spec.v[pick % spec.v.length];
  const key = t + ':' + idx + ':' + dark;
  let c = texCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    if (spec.f) g.filter = spec.f;
    g.drawImage(terrainAtlas, (idx % 11) * 32, ((idx / 11) | 0) * 32, 32, 32, 0, 0, 64, 64);
    g.filter = 'none';
    if (dark) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgba(10,8,20,${Math.min(0.5, dark * 0.16)})`; g.fillRect(0, 0, 64, 64); g.globalCompositeOperation = 'source-over'; }
    texCache.set(key, c);
  }
  return c;
}

function hashXY(x, y) { let h = (x * 73856093) ^ (y * 19349663); h = (h ^ (h >> 13)) * 0x5bd1e995; return ((h ^ (h >> 15)) >>> 0) / 4294967296; }

// Smooth value noise (bilinear over a 5-tile lattice): neighbouring tiles get
// near-identical shades, so terrain reads as continuous ground, not a grid.
function smoothNoise(x, y) {
  const s = 5;
  const gx = x / s, gy = y / s;
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const tx = gx - x0, ty = gy - y0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hashXY(x0, y0), b = hashXY(x0 + 1, y0), c = hashXY(x0, y0 + 1), d = hashXY(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
const _rgbCache = new Map();
function hexRgb(h) {
  let v = _rgbCache.get(h);
  if (!v) { v = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; _rgbCache.set(h, v); }
  return v;
}
function mixColor(h1, h2, t) {
  const a = hexRgb(h1), b = hexRgb(h2);
  return `rgb(${(a[0] + (b[0] - a[0]) * t) | 0},${(a[1] + (b[1] - a[1]) * t) | 0},${(a[2] + (b[2] - a[2]) * t) | 0})`;
}

// ---- chunk cache -------------------------------------------------------------
const CH = 16;
const chunkCache = new Map(); // "plane:cx,cy" -> {canvas, top}
function chunkElev(plane, x, y) { return plane === PLANE.OVERWORLD ? heightAt(x, y) : 0; }
function chunkCanvas(plane, cx, cy) {
  const key = plane + ':' + cx + ',' + cy;
  let c = chunkCache.get(key);
  if (c) return c;
  if (chunkCache.size > 90) { const first = chunkCache.keys().next().value; chunkCache.delete(first); }
  // canvas height depends on the tallest elevation in this chunk (flatland
  // chunks stay small; only mountain chunks pay for tall stacks)
  let maxH = 0;
  if (plane === PLANE.OVERWORLD)
    for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) maxH = Math.max(maxH, heightAt(cx * CH + i, cy * CH + j));
  const top = 48 + maxH * ESTEP;
  const canvas = document.createElement('canvas');
  canvas.width = CH * TW; canvas.height = CH * TH + top + 64;
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  const ox = CH * TW / 2, oy = top;
  for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) {
    const x = cx * CH + i, y = cy * CH + j;
    const t = tileAtPlane(plane, x, y);
    const h = chunkElev(plane, x, y);
    // Diamond centred on the LOGICAL tile centre, lifted by elevation.
    const lx = (i - j) * TW / 2 + ox;
    const ly = (i + j) * TH / 2 + oy + TH / 2 - h * ESTEP;
    const shade = hashXY(x, y);
    // exposed cliff column: fill down to the tallest lower neighbour in front
    const hFront = Math.min(chunkElev(plane, x + 1, y), chunkElev(plane, x, y + 1), chunkElev(plane, x + 1, y + 1));
    const drop = Math.max(0, h - Math.max(0, hFront));
    // Abyssal dungeon floors: crystal-cavern tiles from the Geo gem pack, with
    // rare glowing crystal clusters sprouting from the rock.
    if (plane >= PLANE.DUNGEON_BASE && t === TILE.CAVE) {
      const gt = MEDIA.sheets?.geo_tiles;
      const im = gt && mimg(gt.file);
      if (im) {
        // dark violet/navy cavern blocks (sheet rows 3-4)
        const PICKS = [[0, 3], [1, 3], [2, 3], [3, 3], [1, 4], [3, 4], [2, 3], [0, 3]];
        const [pc, pr] = PICKS[(shade * PICKS.length) | 0];
        g.drawImage(im, pc * gt.cellW, pr * gt.cellH, gt.cellW, gt.cellH, lx - TW / 2, ly - TH / 2, TW, 48);
        if (shade > 0.94) {
          const gm = MEDIA.sheets?.gems, gim = gm && mimg(gm.file);
          if (gim) {
            const row = ((shade * 997) | 0) % 6, col = ((shade * 131) | 0) % 9;
            g.drawImage(gim, col * gm.cellW, row * gm.cellH, gm.cellW, gm.cellH, lx - 14, ly - 22, 28, 28);
          }
        }
        continue;
      }
    }
    const tex = tileTexture(t, (shade * 8) | 0);
    if (tex && !WALLS.has(t)) {
      for (let k = drop; k >= 1; k--) {
        const fill = tileTexture(TILE.DIRT, ((shade * 8) | 0) + k, k);
        if (fill) g.drawImage(fill, lx - TW / 2, ly - TH / 2 + k * ESTEP);
      }
      g.drawImage(tex, lx - TW / 2, ly - TH / 2);
    } else if (!WALLS.has(t)) {
      // fallback flat diamond while the atlas streams in
      const col = TILE_COLOR[t] || ['#f0f', '#a0a'];
      g.fillStyle = mixColor(col[0], col[1], smoothNoise(x, y));
      g.beginPath();
      g.moveTo(lx, ly - TH / 2 - 0.5); g.lineTo(lx + TW / 2 + 0.5, ly); g.lineTo(lx, ly + TH / 2 + 0.5); g.lineTo(lx - TW / 2 - 0.5, ly);
      g.closePath(); g.fill();
    }
    // dungeon rock: flat dark tile (no tall prism, so corridors stay readable),
    // studded with abyssal rocks and glowing crystal veins
    if (t === TILE.WALL && plane >= PLANE.DUNGEON_BASE) {
      g.fillStyle = shade > 0.5 ? '#1e1a24' : '#171420';
      g.beginPath();
      g.moveTo(lx, ly - TH / 2); g.lineTo(lx + TW / 2, ly); g.lineTo(lx, ly + TH / 2); g.lineTo(lx - TW / 2, ly);
      g.closePath(); g.fill();
      const rk = MEDIA.sheets?.geo_rocks, rim = rk && mimg(rk.file);
      if (rim && shade > 0.45 && shade < 0.75) {
        const col = ((shade * 331) | 0) % rk.cols, row = ((shade * 173) | 0) % 4;
        g.drawImage(rim, col * rk.cellW, row * rk.cellH, rk.cellW, rk.cellH, lx - 22, ly - 30, 44, 44);
      } else if (shade >= 0.86) {
        const gm = MEDIA.sheets?.gems, gim = gm && mimg(gm.file);
        if (gim) {
          const row = ((shade * 997) | 0) % 6, col = ((shade * 131) | 0) % 9;
          g.drawImage(gim, col * gm.cellW, row * gm.cellH, gm.cellW, gm.cellH, lx - 16, ly - 26, 32, 32);
        }
      }
      continue;
    }
    // building walls: prism on top of the (flattened) terrain
    if (WALLS.has(t)) {
      const wh = 34;
      const topCol = t === TILE.WALL ? '#8d8878' : '#8a6a3c';
      const sideL = t === TILE.WALL ? '#565248' : '#4c381e';
      const sideR = t === TILE.WALL ? '#6e6a5e' : '#5e462a';
      g.fillStyle = sideL;
      g.beginPath(); g.moveTo(lx - TW / 2, ly); g.lineTo(lx, ly + TH / 2); g.lineTo(lx, ly + TH / 2 - wh); g.lineTo(lx - TW / 2, ly - wh); g.closePath(); g.fill();
      g.fillStyle = sideR;
      g.beginPath(); g.moveTo(lx + TW / 2, ly); g.lineTo(lx, ly + TH / 2); g.lineTo(lx, ly + TH / 2 - wh); g.lineTo(lx + TW / 2, ly - wh); g.closePath(); g.fill();
      g.fillStyle = topCol;
      g.beginPath(); g.moveTo(lx, ly - TH / 2 - wh); g.lineTo(lx + TW / 2, ly - wh); g.lineTo(lx, ly + TH / 2 - wh); g.lineTo(lx - TW / 2, ly - wh); g.closePath(); g.fill();
    }
  }
  c = { canvas, top };
  chunkCache.set(key, c);
  // dungeon chunks re-render until the geo sheets finish streaming in
  if (plane >= PLANE.DUNGEON_BASE && !(MEDIA.sheets?.geo_tiles && mimg(MEDIA.sheets.geo_tiles.file))) chunkCache.delete(key);
  return c;
}

// ---- main draw -----------------------------------------------------------------
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 252, y: 332 };
    this.snowP = [];
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }
  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.ctx.imageSmoothingEnabled = false;
  }
  // Smooth (bilinear) elevation so entities glide up slopes instead of popping.
  elevAt(x, y) {
    const x0 = Math.floor(x - 0.5), y0 = Math.floor(y - 0.5);
    const tx = x - 0.5 - x0, ty = y - 0.5 - y0;
    const a = heightAt(x0, y0), b = heightAt(x0 + 1, y0), c = heightAt(x0, y0 + 1), d = heightAt(x0 + 1, y0 + 1);
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  }
  screenOf(plane, x, y) {
    const [wx, wy] = toScreen(x, y);
    const [cx, cy] = toScreen(this.cam.x, this.cam.y);
    const e = plane === PLANE.OVERWORLD && this._elevOn ? this.elevAt(x, y) * ESTEP : 0;
    return [wx - cx + this.canvas.width / 2, wy - cy + this.canvas.height / 2 - e + (this._camE || 0)];
  }
  tileFromScreen(sx, sy) {
    const [cx, cy] = toScreen(this.cam.x, this.cam.y);
    const bx = sx - this.canvas.width / 2 + cx;
    const by = sy - this.canvas.height / 2 + cy - (this._camE || 0);
    if (!this._elevOn) return toTile(bx, by);
    // front-most elevated tile whose lifted diamond covers this pixel
    for (let h = MAX_ELEV; h >= 1; h--) {
      const [tx, ty] = toTile(bx, by + h * ESTEP);
      if (heightAt(Math.floor(tx), Math.floor(ty)) === h) return [tx, ty];
    }
    return toTile(bx, by);
  }

  draw(state) {
    const { entities, me, fx, now, depletedNodes } = state;
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.fillStyle = '#0b0f0a';
    ctx.fillRect(0, 0, W, H);
    if (!me) return;
    // frame-rate-independent camera smoothing (robust at any fps)
    const dt = Math.min(0.25, (now - (this._lastNow || now)) / 1000);
    this._lastNow = now;
    const k = 1 - Math.pow(0.0025, dt); // ~0.15/frame at 60fps, catches up fast when slow
    this.cam.x += (me.rx - this.cam.x) * k;
    this.cam.y += (me.ry - this.cam.y) * k;
    const plane = me.plane;
    // camera rides the terrain: keep the player vertically centred on slopes
    this._elevOn = plane === PLANE.OVERWORLD;
    this._camE = this._elevOn ? this.elevAt(this.cam.x, this.cam.y) * ESTEP : 0;

    // ---- terrain chunks ----
    const [camSX, camSY] = toScreen(this.cam.x, this.cam.y);
    const originX = W / 2 - camSX, originY = H / 2 - camSY + this._camE;
    const corners = [[0, 0], [W, 0], [0, H], [W, H]].map(([sx, sy]) => toTile(sx - originX, sy - originY));
    const elevPad = this._elevOn ? MAX_ELEV * 2 : 0; // elevated tiles from "below" the view poke upward
    const minX = Math.min(...corners.map(c => c[0])) - 3, maxX = Math.max(...corners.map(c => c[0])) + 3 + elevPad;
    const minY = Math.min(...corners.map(c => c[1])) - 3, maxY = Math.max(...corners.map(c => c[1])) + 6 + elevPad;
    const c0x = Math.floor(minX / CH), c1x = Math.floor(maxX / CH);
    const c0y = Math.floor(minY / CH), c1y = Math.floor(maxY / CH);
    for (let cy = c0y; cy <= c1y; cy++) for (let cx = c0x; cx <= c1x; cx++) {
      const cc = chunkCanvas(plane, cx, cy);
      const [bx, by] = toScreen(cx * CH, cy * CH);
      ctx.drawImage(cc.canvas, originX + bx - CH * TW / 2, originY + by - cc.top);
    }

    // ---- collect drawables (entities + nodes + farming), depth sort ----
    const drawables = [];
    for (const e of entities.values()) {
      if (e.plane !== undefined && e.plane !== plane) continue;
      drawables.push({ d: e.rx + e.ry, ent: e });
    }
    // static nodes in view
    if (plane === PLANE.OVERWORLD) {
      const { nodes } = computeWorld();
      const lim = WORLD.W - 1;
      for (let ty = Math.max(0, minY | 0); ty <= Math.min(lim, maxY | 0); ty++)
        for (let tx = Math.max(0, minX | 0); tx <= Math.min(lim, maxX | 0); tx++) {
          const type = nodes.get(tx + ',' + ty);
          if (type) drawables.push({ d: tx + ty + 0.5, node: { type, x: tx, y: ty, off: depletedNodes.has(tx + ',' + ty) } });
        }
    } else if (plane >= PLANE.DUNGEON_BASE) {
      const f = dungeonFloor(plane - PLANE.DUNGEON_BASE);
      drawables.push({ d: f.entrance.x + f.entrance.y + 0.5, node: { type: 'dungeon_entrance', x: f.entrance.x, y: f.entrance.y } });
      drawables.push({ d: f.exit.x + f.exit.y + 0.5, node: { type: 'obelisk', x: f.exit.x, y: f.exit.y, exit: true } });
    } else if (plane >= PLANE.HOUSE_BASE && state.houseFurniture) {
      for (const h of HOUSE.hotspots) {
        drawables.push({ d: h.x + h.y + 0.5, node: { type: state.houseFurniture[h.id] ? 'furn_' + h.id : 'hotspot', x: h.x, y: h.y, hot: h.id } });
      }
      drawables.push({ d: HOUSE.door.x + HOUSE.door.y + 1.5, node: { type: 'house_portal', x: HOUSE.door.x, y: HOUSE.door.y + 1, exitHouse: true } });
    }

    drawables.sort((a, b) => a.d - b.d);
    for (const dr of drawables) {
      if (dr.node) this.drawNode(ctx, dr.node, now);
      else this.drawEntity(ctx, dr.ent, now, state);
    }

    // ---- fx layer ----
    fx.draw(ctx, this, now);

    // ---- ambient: day-night (overworld only) + region weather ----
    if (plane === PLANE.OVERWORLD) {
      const dayT = (now / 600000) % 1; // 10-minute day
      const dark = Math.max(0, Math.sin(dayT * Math.PI * 2 - Math.PI / 2)) * 0.3;
      if (dark > 0.01) { ctx.fillStyle = `rgba(10,14,40,${dark})`; ctx.fillRect(0, 0, W, H); }
      const reg = regionAt(me.rx | 0, me.ry | 0);
      if (reg === 'WILDLANDS' || reg === 'NORTHMOOR' || reg === 'FROSTHOLLOW') this.drawSnow(ctx, W, H, now);
    }
    if (plane >= PLANE.DUNGEON_BASE) { // gentle cave gloom, torch-lit near the player
      const grad = ctx.createRadialGradient(W / 2, H / 2, 220, W / 2, H / 2, Math.max(W, H) / 1.25);
      grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    }
    return { minX, maxX, minY, maxY };
  }

  drawSnow(ctx, W, H, now) {
    if (this.snowP.length === 0)
      for (let i = 0; i < 120; i++) this.snowP.push({ x: Math.random() * W, y: Math.random() * H, s: 0.5 + Math.random() * 1.5, v: 30 + Math.random() * 60 });
    ctx.fillStyle = '#ffffffbb';
    for (const p of this.snowP) {
      const y = (p.y + now / 1000 * p.v) % H;
      const x = (p.x + Math.sin(now / 900 + p.s * 9) * 18 + W) % W;
      ctx.fillRect(x, y, p.s + 0.5, p.s + 0.5);
    }
  }

  drawNode(ctx, node, now) {
    const [sx, sy] = this.screenOf(0, node.x + 0.5, node.y + 0.5);
    if (node.type === 'hotspot') {
      ctx.strokeStyle = '#c77ce766'; ctx.setLineDash([4, 4]);
      ctx.strokeRect(sx - 14, sy - 20, 28, 22);
      ctx.setLineDash([]);
      return;
    }
    let type = node.type;
    if (type.startsWith('furn_')) {
      // simple furniture: reuse station art loosely
      const map = { furn_wooden_chair: 'museum_bench', furn_oak_table: 'bank_booth', furn_bed: 'bakery_stall', furn_bookcase: 'ge_booth', furn_house_altar: 'chapel_altar', furn_stone_range: 'range', furn_workbench: 'anvil', furn_trophy_hall: 'gem_stall', furn_greenwood_throne: 'obelisk' };
      type = map[type] || 'museum_bench';
    }
    const spr = nodeSprite(type, node.off);
    // gentle bob for fishing spots
    const bob = /spot/.test(type) ? Math.sin(now / 400 + node.x) * 2 : 0;
    ctx.drawImage(spr, sx - 32, sy - 64 + bob);
  }

  drawEntity(ctx, e, now, state) {
    const [sx, sy] = this.screenOf(e.plane ?? 0, e.rx, e.ry);
    if (sx < -80 || sy < -100 || sx > this.canvas.width + 80 || sy > this.canvas.height + 80) return;

    if (e.k === 'item') {
      ctx.drawImage(itemIcon(e.item), sx - 10, sy - 16, 20, 20);
      ctx.fillStyle = '#00000030'; ctx.beginPath(); ctx.ellipse(sx, sy + 3, 8, 3, 0, 0, 7); ctx.fill();
      return;
    }
    if (e.k === 'shil') {
      const bob = Math.sin(now / 300 + e.id) * 3;
      ctx.shadowColor = '#ffd75e'; ctx.shadowBlur = 12;
      ctx.fillStyle = '#ffd75e';
      ctx.beginPath(); ctx.arc(sx, sy - 10 + bob, 7, 0, 7); ctx.fill();
      ctx.fillStyle = '#8a6d1d';
      ctx.font = 'bold 9px Georgia'; ctx.textAlign = 'center';
      ctx.fillText('$', sx, sy - 7 + bob);
      ctx.shadowBlur = 0;
      return;
    }
    if (e.k === 'fire') {
      ctx.drawImage(nodeSprite('campfire'), sx - 32, sy - 64);
      return;
    }
    if (e.k === 'evbox') {
      ctx.fillStyle = '#6b5322'; ctx.fillRect(sx - 14, sy - 18, 28, 16);
      ctx.fillStyle = '#ffd75e'; ctx.fillRect(sx - 14, sy - 12, 28, 3);
      this.nameplate(ctx, sx, sy - 26, 'Convoy strongbox', '#ffd75e');
      return;
    }
    if (e.k === 'chest') {
      ctx.fillStyle = '#00000030'; ctx.beginPath(); ctx.ellipse(sx, sy + 4, 16, 6, 0, 0, 7); ctx.fill();
      const openT = e.anim === 'open' ? now - e.animStart : 0;
      if (!drawChest(ctx, e.variant, openT, e.snow, sx, sy, 1)) {
        ctx.fillStyle = '#7a5a2a'; ctx.fillRect(sx - 12, sy - 16, 24, 16);
      }
      if (state.hoverId === e.id || e.locked) this.nameplate(ctx, sx, sy - 52, (e.locked ? '🔒 ' : '') + e.name, '#ffd75e');
      return;
    }
    if (e.k === 'geode') {
      ctx.fillStyle = '#00000038'; ctx.beginPath(); ctx.ellipse(sx, sy + 5, 20, 7, 0, 0, 7); ctx.fill();
      drawGeode(ctx, e.gemRow, e.gemCol, now, sx, sy);
      if (state.hoverId === e.id) this.nameplate(ctx, sx, sy - 66, `${e.name} — mining ${e.lvl}`, '#9ae0ff');
      return;
    }

    // shadow
    const scale = e.scale || 1;
    ctx.fillStyle = '#00000038';
    ctx.beginPath(); ctx.ellipse(sx, sy + 4, 13 * scale, 5 * scale, 0, 0, 7); ctx.fill();

    let anim = e.anim;
    let animInfo = ANIMS[anim] || ANIMS.idle;
    let frame = 0;
    if (anim === 'walk') frame = Math.floor(now / animInfo.ms) % animInfo.frames;
    else if (animInfo.once) {
      const el = now - (e.animStart || now);
      frame = Math.min(animInfo.frames - 1, Math.floor(el / animInfo.ms));
      // Attack/cast swings return to idle once finished instead of freezing on
      // the last frame until the next swing (death keeps its final pose).
      if (anim !== 'hurt' && el > animInfo.frames * animInfo.ms + 60) {
        anim = 'idle'; animInfo = ANIMS.idle; frame = 0;
      }
    }
    if (anim === 'idle') frame = Math.floor((now + e.id * 217) / animInfo.ms) % animInfo.frames; // desynced breathing

    // cosmetic aura: looping elemental swirl beneath the wearer
    if (e.aura) {
      ctx.save();
      ctx.globalAlpha = 0.75;
      ctx.globalCompositeOperation = 'lighter';   // additive: glows on any ground
      drawFxSprite(ctx, e.aura, 0.22 + 0.5 * (((now + (e.id % 89) * 131) % 2400) / 2400), sx, sy - 14, 112);
      ctx.restore();
    }
    // mount: creature drawn under the rider, who sits lifted (flyers hover+bob)
    let lift = 0;
    if (e.mnt) {
      const bob = e.mnt.f ? Math.sin(now / 320 + e.id) * 3 + 10 : 0;
      const mh = drawCreature(ctx, e.mnt.s, { id: e.id, dir: e.dir, hp: 1, tint: e.mnt.t, animStart: e.animStart }, e.anim === 'walk' ? 'walk' : 'idle', now, sx, sy - bob, 1);
      lift = (mh ? mh * 0.45 : 15) + bob;
    }
    const ry = sy - lift;

    let sheetH = 0;
    if (e.sheet) {
      // sheet-animated creature (media.json packs); uses raw server anim +
      // its own once-anim timing via e.animStart / e.deathStart
      sheetH = drawCreature(ctx, e.sheet, e, e.anim, now, sx, sy, scale);
    }
    if (!sheetH && e.critter) {
      const dead = e.hp <= 0;
      const spr = critterSprite(e.critter, anim === 'walk' ? frame : 0, dead);
      const S = 64 * scale;
      const flip = e.dir === 1; // left-facing critters mirror
      ctx.save();
      if (flip) { ctx.translate(sx, 0); ctx.scale(-1, 1); ctx.translate(-sx, 0); }
      ctx.drawImage(spr, sx - S / 2, sy - S + 14 * scale, S, S);
      ctx.restore();
      // attack lunge flash
      if ((anim === 'slash' || anim === 'shoot' || anim === 'spellcast') && frame < 3) {
        ctx.fillStyle = '#ffffff22'; ctx.beginPath(); ctx.arc(sx, sy - 20 * scale, 16 * scale, 0, 7); ctx.fill();
      }
    } else if (!sheetH && e.vis) {
      const comp = composite(e.vis);
      drawChar(ctx, comp, anim, e.dir, frame, sx, ry, scale);
      drawOversize(ctx, comp, e.vis, anim, e.dir, frame, sx, ry, scale);
    } else if (!sheetH && !e.sheet) {
      ctx.fillStyle = '#888'; ctx.fillRect(sx - 8, sy - 30, 16, 30);
    }

    // nameplates & bars
    const topY = sy - (sheetH ? sheetH * 0.92 : 64 * scale) + 4;
    if (e.k === 'player') {
      const isMe = state.me && e.id === state.me.id;
      this.nameplate(ctx, sx, topY - 4, (e.skull ? '☠ ' : '') + e.name + ' (' + (e.cb || '?') + ')', isMe ? '#aef79a' : e.skull ? '#ff8a7a' : '#f1e6c0');
      if (e.hp < e.mhp) this.hpBar(ctx, sx, topY + 6, e.hp / e.mhp);
    } else if (e.k === 'mob') {
      const hovered = state.hoverId === e.id;
      if (e.hp < e.mhp || hovered) {
        this.nameplate(ctx, sx, topY - 4, `${e.name} (lvl ${e.lvl})`, e.boss ? '#ffd75e' : '#e0c8a0');
        this.hpBar(ctx, sx, topY + 6, e.hp / e.mhp);
      } else if (e.boss) this.nameplate(ctx, sx, topY - 4, `☠ ${e.name}`, '#ffd75e');
    } else if (e.k === 'npc') {
      this.nameplate(ctx, sx, topY - 4, e.name + (e.quest ? ' ❗' : ''), e.quest ? '#ffe27a' : '#bcd9f0');
    } else if (e.k === 'familiar') {
      this.nameplate(ctx, sx, topY - 4, e.name, '#9fe0cf');
    } else if (e.k === 'pet') {
      this.nameplate(ctx, sx, topY + 14, `🐾 ${e.name} Lv.${e.lvl || 1}`, '#8ae0b0');
    }
    // chat bubble
    if (e.bubble && now < e.bubbleUntil) {
      ctx.font = '12px Georgia';
      const w = Math.min(220, ctx.measureText(e.bubble).width + 12);
      ctx.fillStyle = '#fffef0e8';
      ctx.beginPath(); ctx.roundRect(sx - w / 2, topY - 34, w, 20, 5); ctx.fill();
      ctx.fillStyle = '#332';
      ctx.textAlign = 'center';
      ctx.fillText(e.bubble.slice(0, 40), sx, topY - 20);
    }
  }
  nameplate(ctx, x, y, text, color) {
    ctx.font = 'bold 11px Georgia';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000000aa';
    ctx.fillText(text, x + 1, y + 1);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }
  hpBar(ctx, x, y, pct) {
    ctx.fillStyle = '#300';
    ctx.fillRect(x - 16, y, 32, 4);
    ctx.fillStyle = pct > 0.5 ? '#5fc93a' : pct > 0.25 ? '#e0b93c' : '#e14d4d';
    ctx.fillRect(x - 16, y, 32 * Math.max(0, pct), 4);
  }
}

// ---- minimap: live local view (~50 tile range) -----------------------------------
// Top-down render of the player's actual surroundings: real terrain colours,
// tree canopies with trunks, ore rocks, water, stations, and living entities.
const MM_RANGE = 50; // tiles of visibility in each direction
export function drawMinimap(canvas, me, entities) {
  const g = canvas.getContext('2d');
  const S = canvas.width;
  const sc = S / (MM_RANGE * 2 + 1);
  g.fillStyle = '#0a0d08';
  g.fillRect(0, 0, S, S);
  if (!me) return;
  const plane = me.plane ?? 0;
  const cx = Math.round(me.rx), cy = Math.round(me.ry);
  const { nodes } = computeWorld();
  // terrain
  for (let dy = -MM_RANGE; dy <= MM_RANGE; dy++) {
    for (let dx = -MM_RANGE; dx <= MM_RANGE; dx++) {
      const t = tileAtPlane(plane, cx + dx, cy + dy);
      const col = TILE_COLOR[t];
      if (!col) continue;
      g.fillStyle = mixColor(col[0], col[1], smoothNoise(cx + dx, cy + dy));
      g.fillRect((dx + MM_RANGE) * sc, (dy + MM_RANGE) * sc, sc + 0.5, sc + 0.5);
    }
  }
  // scenery: trees as canopy dots with trunks, rocks as grey chips with ore tint
  if (plane === 0) {
    for (let dy = -MM_RANGE; dy <= MM_RANGE; dy++) {
      for (let dx = -MM_RANGE; dx <= MM_RANGE; dx++) {
        const type = nodes.get((cx + dx) + ',' + (cy + dy));
        if (!type) continue;
        const px2 = (dx + MM_RANGE) * sc, py2 = (dy + MM_RANGE) * sc;
        if (type.includes('tree')) {
          g.fillStyle = '#4a3423';
          g.fillRect(px2 + sc * 0.35, py2 + sc * 0.4, 1, 1.6);
          g.fillStyle = type === 'frostpine_tree' ? '#9fc4b8' : type === 'maple_tree' ? '#b07a34' : '#2f5c22';
          g.beginPath(); g.arc(px2 + sc / 2, py2 + sc / 2 - 0.5, sc * 0.85, 0, 7); g.fill();
          g.fillStyle = '#ffffff22';
          g.beginPath(); g.arc(px2 + sc / 2 - 0.6, py2 + sc / 2 - 1, sc * 0.4, 0, 7); g.fill();
        } else if (type.includes('rock') || type === 'coal_rock') {
          g.fillStyle = '#6e6a62';
          g.fillRect(px2 - 0.5, py2 - 0.5, sc + 1, sc + 1);
          g.fillStyle = { copper_rock: '#b87333', tin_rock: '#a8a8b0', iron_rock: '#8a6a5a', coal_rock: '#33333a', silver_rock: '#cfd4dc', gold_rock: '#e0b93c', sylvanite_rock: '#7fe07f', essence_rock: '#b09fe0' }[type] || '#888';
          g.fillRect(px2 + sc * 0.25, py2 + sc * 0.25, sc * 0.5, sc * 0.5);
        } else if (/spot/.test(type)) {
          g.fillStyle = '#bfe8f8';
          g.beginPath(); g.arc(px2 + sc / 2, py2 + sc / 2, sc * 0.4, 0, 7); g.fill();
        } else { // stations, altars, stalls — points of interest
          g.fillStyle = '#ffd75e';
          g.fillRect(px2, py2, sc, sc);
        }
      }
    }
  }
  // living entities
  if (entities) {
    for (const e of entities.values()) {
      const dx = e.rx - me.rx, dy = e.ry - me.ry;
      if (Math.abs(dx) > MM_RANGE || Math.abs(dy) > MM_RANGE) continue;
      const px2 = (dx + MM_RANGE + 0.5) * sc, py2 = (dy + MM_RANGE + 0.5) * sc;
      if (e.k === 'mob') g.fillStyle = e.boss ? '#ff4444' : '#e08080';
      else if (e.k === 'npc') g.fillStyle = '#ffe98a';
      else if (e.k === 'player' && e.id !== me.id) g.fillStyle = '#8ac4ff';
      else continue;
      g.beginPath(); g.arc(px2, py2, e.boss ? 3 : 2, 0, 7); g.fill();
    }
  }
  // the player: white arrow showing facing
  const c2 = S / 2;
  const ang = [ -Math.PI / 2, Math.PI, Math.PI / 2, 0 ][me.dir ?? 2];
  g.save();
  g.translate(c2, c2); g.rotate(ang);
  g.fillStyle = '#ffffff'; g.strokeStyle = '#000'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(5, 0); g.lineTo(-4, -3.5); g.lineTo(-2, 0); g.lineTo(-4, 3.5); g.closePath();
  g.fill(); g.stroke();
  g.restore();
  // compass
  g.fillStyle = '#ffffffcc'; g.font = 'bold 10px Georgia'; g.textAlign = 'center';
  g.fillText('N', S / 2, 11);
}

// ---- world map (globe button) ------------------------------------------------------
let _worldMapBase = null;
export function worldMapCanvas() {
  if (_worldMapBase) return _worldMapBase;
  const S = WORLD.W;
  const base = document.createElement('canvas');
  base.width = S; base.height = S;
  const bg = base.getContext('2d');
  const { tiles, nodes } = computeWorld();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const col = TILE_COLOR[tiles[y * WORLD.W + x]] || ['#f0f', '#a0a'];
    bg.fillStyle = mixColor(col[0], col[1], smoothNoise(x, y));
    bg.fillRect(x, y, 1, 1);
  }
  // forests read as texture at this scale
  bg.fillStyle = '#2f5c22aa';
  for (const [k, type] of nodes) {
    if (!type.includes('tree')) continue;
    const [x, y] = k.split(',').map(Number);
    bg.fillRect(x, y, 1.5, 1.5);
  }
  // wilderness border
  bg.strokeStyle = '#ff5544cc'; bg.setLineDash([6, 4]);
  bg.beginPath(); bg.moveTo(0, WILDERNESS_Y); bg.lineTo(S, WILDERNESS_Y); bg.stroke();
  bg.setLineDash([]);
  _worldMapBase = base;
  return base;
}
export { TILE_COLOR, MM_RANGE };

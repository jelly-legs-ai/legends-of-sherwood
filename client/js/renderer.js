// Isometric world renderer: chunk-cached terrain, depth-sorted entities,
// LPC characters, procedural critters/nodes, day-night tint, northern snow.

import { WORLD, TILE, PLANE, WILDERNESS_Y } from '/shared/constants.js';
import { tileAtPlane, computeWorld, dungeonFloor, regionAt } from '/shared/mapgen.js';
import { REGIONS } from '/shared/constants.js';
import { HOUSE } from '/shared/data/world.js';
import { composite, drawChar, drawOversize, critterSprite, nodeSprite, ANIMS, itemIcon, proc } from './sprites.js';
import { MOBS } from '/shared/data/mobs.js';

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

function hashXY(x, y) { let h = (x * 73856093) ^ (y * 19349663); h = (h ^ (h >> 13)) * 0x5bd1e995; return ((h ^ (h >> 15)) >>> 0) / 4294967296; }

// ---- chunk cache -------------------------------------------------------------
const CH = 16;
const chunkCache = new Map(); // "plane:cx,cy" -> canvas
function chunkCanvas(plane, cx, cy) {
  const key = plane + ':' + cx + ',' + cy;
  let c = chunkCache.get(key);
  if (c) return c;
  if (chunkCache.size > 140) { const first = chunkCache.keys().next().value; chunkCache.delete(first); }
  c = document.createElement('canvas');
  c.width = CH * TW; c.height = CH * TH + 96;
  const g = c.getContext('2d');
  const ox = CH * TW / 2, oy = 48;
  for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) {
    const x = cx * CH + i, y = cy * CH + j;
    const t = tileAtPlane(plane, x, y);
    const [lx, ly] = [(i - j) * TW / 2 + ox, (i + j) * TH / 2 + oy];
    const col = TILE_COLOR[t] || ['#f0f', '#a0a'];
    const shade = hashXY(x, y);
    g.fillStyle = shade > 0.5 ? col[0] : col[1];
    g.beginPath();
    g.moveTo(lx, ly - TH / 2); g.lineTo(lx + TW / 2, ly); g.lineTo(lx, ly + TH / 2); g.lineTo(lx - TW / 2, ly);
    g.closePath(); g.fill();
    // texture speckles
    if (!WALLS.has(t)) {
      g.fillStyle = '#00000012';
      if (shade > 0.7) g.fillRect(lx - 8, ly - 2, 4, 2);
      if (shade < 0.25) g.fillRect(lx + 4, ly + 3, 4, 2);
      if ((t === TILE.GRASS || t === TILE.MEADOW || t === TILE.FOREST) && shade > 0.82) {
        g.fillStyle = t === TILE.MEADOW ? (shade > 0.93 ? '#e8d44c' : '#d97fb8') : '#3c6427';
        g.fillRect(lx - 2 + (shade * 20 | 0) - 10, ly - 2, 2, 3);
      }
      if (t === TILE.SNOW && shade > 0.8) { g.fillStyle = '#ffffff'; g.fillRect(lx - 4, ly, 3, 2); }
      if (t === TILE.FARM) { g.fillStyle = '#00000018'; for (let r = -1; r <= 1; r++) g.fillRect(lx - 16, ly + r * 6 - 1, 32, 2); }
    }
    // dungeon rock: flat dark tile (no tall prism, so corridors stay readable)
    if (t === TILE.WALL && plane >= PLANE.DUNGEON_BASE) {
      g.fillStyle = shade > 0.5 ? '#2c2620' : '#241f1a';
      g.beginPath();
      g.moveTo(lx, ly - TH / 2); g.lineTo(lx + TW / 2, ly); g.lineTo(lx, ly + TH / 2); g.lineTo(lx - TW / 2, ly);
      g.closePath(); g.fill();
      if (shade > 0.7) { g.fillStyle = '#00000022'; g.fillRect(lx - 6, ly - 2, 4, 2); }
      continue;
    }
    // walls: prism
    if (WALLS.has(t)) {
      const wh = 34; // wall height in px
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
    if (WATERS.has(t)) { g.fillStyle = '#ffffff10'; g.fillRect(lx - 10, ly - 3, 8, 1); g.fillRect(lx + 2, ly + 4, 8, 1); }
  }
  chunkCache.set(key, c);
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
  screenOf(plane, x, y) {
    const [wx, wy] = toScreen(x, y);
    const [cx, cy] = toScreen(this.cam.x, this.cam.y);
    return [wx - cx + this.canvas.width / 2, wy - cy + this.canvas.height / 2];
  }
  tileFromScreen(sx, sy) {
    const [cx, cy] = toScreen(this.cam.x, this.cam.y);
    return toTile(sx - this.canvas.width / 2 + cx, sy - this.canvas.height / 2 + cy);
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

    // ---- terrain chunks ----
    const [camSX, camSY] = toScreen(this.cam.x, this.cam.y);
    const originX = W / 2 - camSX, originY = H / 2 - camSY;
    const corners = [[0, 0], [W, 0], [0, H], [W, H]].map(([sx, sy]) => toTile(sx - originX, sy - originY));
    const minX = Math.min(...corners.map(c => c[0])) - 3, maxX = Math.max(...corners.map(c => c[0])) + 3;
    const minY = Math.min(...corners.map(c => c[1])) - 3, maxY = Math.max(...corners.map(c => c[1])) + 6;
    const c0x = Math.floor(minX / CH), c1x = Math.floor(maxX / CH);
    const c0y = Math.floor(minY / CH), c1y = Math.floor(maxY / CH);
    for (let cy = c0y; cy <= c1y; cy++) for (let cx = c0x; cx <= c1x; cx++) {
      const cc = chunkCanvas(plane, cx, cy);
      const [bx, by] = toScreen(cx * CH, cy * CH);
      ctx.drawImage(cc, originX + bx - CH * TW / 2, originY + by - 48 - TH / 2);
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
      for (let ty = Math.max(0, minY | 0); ty <= Math.min(575, maxY | 0); ty++)
        for (let tx = Math.max(0, minX | 0); tx <= Math.min(575, maxX | 0); tx++) {
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

    // shadow
    const scale = e.scale || 1;
    ctx.fillStyle = '#00000038';
    ctx.beginPath(); ctx.ellipse(sx, sy + 4, 13 * scale, 5 * scale, 0, 0, 7); ctx.fill();

    const animInfo = ANIMS[e.anim] || ANIMS.idle;
    let frame = 0;
    if (e.anim === 'walk') frame = Math.floor(now / animInfo.ms) % animInfo.frames;
    else if (animInfo.once) {
      const el = now - (e.animStart || now);
      frame = Math.min(animInfo.frames - 1, Math.floor(el / animInfo.ms));
    }

    if (e.critter) {
      const dead = e.hp <= 0;
      const spr = critterSprite(e.critter, e.anim === 'walk' ? frame : 0, dead);
      const S = 64 * scale;
      const flip = e.dir === 1; // left-facing critters mirror
      ctx.save();
      if (flip) { ctx.translate(sx, 0); ctx.scale(-1, 1); ctx.translate(-sx, 0); }
      ctx.drawImage(spr, sx - S / 2, sy - S + 14 * scale, S, S);
      ctx.restore();
      // attack lunge flash
      if ((e.anim === 'slash' || e.anim === 'shoot' || e.anim === 'spellcast') && frame < 3) {
        ctx.fillStyle = '#ffffff22'; ctx.beginPath(); ctx.arc(sx, sy - 20 * scale, 16 * scale, 0, 7); ctx.fill();
      }
    } else if (e.vis) {
      const comp = composite(e.vis);
      drawChar(ctx, comp, e.anim, e.dir, frame, sx, sy, scale);
      drawOversize(ctx, comp, e.vis, e.anim, e.dir, frame, sx, sy, scale);
    } else {
      ctx.fillStyle = '#888'; ctx.fillRect(sx - 8, sy - 30, 16, 30);
    }

    // nameplates & bars
    const topY = sy - 64 * scale + 4;
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

// ---- minimap --------------------------------------------------------------------
export function drawMinimap(canvas, me) {
  const g = canvas.getContext('2d');
  const S = canvas.width;
  if (!canvas._base) {
    const base = document.createElement('canvas');
    base.width = S; base.height = S;
    const bg = base.getContext('2d');
    const { tiles } = computeWorld();
    const step = WORLD.W / S;
    for (let py = 0; py < S; py++) for (let px2 = 0; px2 < S; px2++) {
      const t = tiles[(py * step | 0) * WORLD.W + (px2 * step | 0)];
      bg.fillStyle = (TILE_COLOR[t] || ['#f0f'])[0];
      bg.fillRect(px2, py, 1, 1);
    }
    // wilderness line
    bg.strokeStyle = '#ff5544aa';
    bg.beginPath(); bg.moveTo(0, WILDERNESS_Y / step); bg.lineTo(S, WILDERNESS_Y / step); bg.stroke();
    canvas._base = base;
  }
  g.drawImage(canvas._base, 0, 0);
  if (me && me.plane === 0) {
    const step = WORLD.W / S;
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(me.rx / step, me.ry / step, 3, 0, 7); g.fill();
    g.strokeStyle = '#000'; g.stroke();
  }
}
export { TILE_COLOR };

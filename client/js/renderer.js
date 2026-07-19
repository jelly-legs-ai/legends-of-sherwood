// Isometric world renderer: chunk-cached terrain, depth-sorted entities,
// LPC characters, procedural critters/nodes, day-night tint, northern snow.

import { WORLD, TILE, PLANE, WILDERNESS_Y } from '/shared/constants.js';
import { tileAtPlane, computeWorld, dungeonFloor, regionAt, heightAt, MAX_ELEV, SHORTCUTS, wallStyleAt, customLevel, levelEntry, castleLadders, inCastle, castleTowerAt, isCastleBridge, castleBridgeAnchorAt } from '/shared/mapgen.js';
import { dayPhase, weatherAt } from '/shared/daycycle.js';
import { REGIONS } from '/shared/constants.js';
import { HOUSE, TOWNS, ANCHORS } from '/shared/data/world.js';
import { composite, drawChar, drawOversize, critterSprite, nodeSprite, ANIMS, itemIcon, proc } from './sprites.js';
import { MOBS } from '/shared/data/mobs.js';
import { drawCreature, drawChest, drawGeode, drawSheetCell, drawFxSprite, drawFxBand, MEDIA, mimg } from './media.js';

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
  [TILE.PATH]: ['#9fa0a0', '#8a8b8c'],
  [TILE.FLOOR_WOOD]: ['#96713d', '#875f35'], [TILE.FLOOR_STONE]: ['#8d8878', '#7d7868'], [TILE.WALL]: ['#6e6a5e', '#565248'],
  [TILE.WALL_WOOD]: ['#6b4f2a', '#553f22'], [TILE.FARM]: ['#7a5f3c', '#6d5435'],
  [TILE.LAVA_ROCK]: ['#4a3a38', '#403230'], [TILE.ARENA]: ['#c9b06a', '#baa25e'], [TILE.WATER_SWAMP]: ['#3d5348', '#35493f'],
  [TILE.CAVE]: ['#6e5a3e', '#5e4c32'],
};
const WALLS = new Set([TILE.WALL, TILE.WALL_WOOD]);
const WATERS = new Set([TILE.OCEAN, TILE.WATER, TILE.RIVER, TILE.WATER_SWAMP]);

// ---- HD procedural terrain materials -------------------------------------------
// Every ground family is painted, not sampled: a 64x64 block (diamond top +
// earthen side skirt) with hand-drawn detail per material — grass blades and
// wildflowers, soil granules and pebbles, rock strata and cracks, sand ripples,
// snow sparkle, plank grain, flagstone joints. Four seeded variants per family
// break repetition; everything is generated once and cached.
export const ESTEP = 32;           // screen px per elevation level (one block)

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function diamondPath(g, inset = 0) {
  g.beginPath();
  g.moveTo(32, -1 + inset); g.lineTo(65 - inset * 2, 16); g.lineTo(32, 33 - inset); g.lineTo(-1 + inset * 2, 16);
  g.closePath();
}
// material palettes: top gradient pair, speck colours, skirt soil pair, painter kind
const MATS = {
  [TILE.GRASS]:       { top: ['#6fa348', '#67993f'], sp: ['#82b858', '#527f2f', '#8cc262'], skirt: ['#6b4f2b', '#3f2d1a'], kind: 'grass' },
  [TILE.MEADOW]:      { top: ['#7bad4e', '#72a346'], sp: ['#8fbf5e', '#5c8f38', '#9ccb6a'], skirt: ['#6b4f2b', '#3f2d1a'], kind: 'meadow' },
  [TILE.FOREST]:      { top: ['#547b34', '#4d722e'], sp: ['#6c9a45', '#3a5c22', '#7fae52'], skirt: ['#5c432a', '#382a18'], kind: 'litter' },
  [TILE.DEEPFOREST]:  { top: ['#416426', '#3a5c21'], sp: ['#54803a', '#2c481a', '#5f8f40'], skirt: ['#4c3722', '#302214'], kind: 'litter' },
  [TILE.JUNGLE]:      { top: ['#3d7032', '#38672c'], sp: ['#529347', '#28481f', '#63a854'], skirt: ['#4c3722', '#302214'], kind: 'litter' },
  [TILE.SWAMP]:       { top: ['#5a6a49', '#4a583d'], sp: ['#6f8258', '#3c4a30', '#7d9464'], skirt: ['#453d28', '#2a2416'], kind: 'swamp' },
  [TILE.DIRT]:        { top: ['#9d8052', '#8a6f45'], sp: ['#b09263', '#75603c', '#c2a878'], skirt: ['#6b4f2b', '#3f2d1a'], kind: 'dirt' },
  [TILE.ROAD]:        { top: ['#b49d6d', '#a08a5c'], sp: ['#c7b183', '#8a7448', '#d4c298'], skirt: ['#6b4f2b', '#3f2d1a'], kind: 'road' },
  [TILE.PATH]:        { top: ['#9fa0a0', '#8a8b8c'], sp: ['#b6b7b8', '#74757a', '#c8c9cc'], skirt: ['#5b574b', '#3c392f'], kind: 'cobble' },
  [TILE.FARM]:        { top: ['#83643f', '#6d5435'], sp: ['#977850', '#5c452a', '#a8895e'], skirt: ['#5c432a', '#382a18'], kind: 'farm' },
  [TILE.SAND]:        { top: ['#ddc684', '#cbb26e'], sp: ['#ecd9a0', '#b89d5c', '#f4e6b8'], skirt: ['#b89d5c', '#8a744a'], kind: 'sand' },
  [TILE.ARENA]:       { top: ['#dfc88a', '#cdb474'], sp: ['#eedca6', '#ba9f60', '#f6e8bc'], skirt: ['#b89d5c', '#8a744a'], kind: 'sand' },
  [TILE.ROCK]:        { top: ['#84806f', '#6f6b5d'], sp: ['#98937f', '#5b574b', '#a5a08c'], skirt: ['#5b574b', '#3c392f'], kind: 'rock' },
  [TILE.SCREE]:       { top: ['#9b9583', '#878271'], sp: ['#aea892', '#726d5c', '#bcb5a0'], skirt: ['#726d5c', '#4c4a3e'], kind: 'scree' },
  [TILE.TUNDRA]:      { top: ['#adb08c', '#9a9d7b'], sp: ['#c0c29c', '#82856a', '#cccfab'], skirt: ['#6b5c3c', '#443b26'], kind: 'tundra' },
  [TILE.SNOW]:        { top: ['#eef2f6', '#dde4ec'], sp: ['#ffffff', '#c8d4e2', '#f6faff'], skirt: ['#8d95a4', '#5f6672'], kind: 'snow' },
  [TILE.ICE]:         { top: ['#c8e0ef', '#b2cfe2'], sp: ['#e4f2fa', '#96b8d0', '#ffffff'], skirt: ['#7e9cb4', '#54687c'], kind: 'ice' },
  [TILE.FLOOR_WOOD]:  { top: ['#9a7440', '#875f35'], sp: ['#ad8850', '#6f4e2a', '#bb965c'], skirt: ['#5c432a', '#382a18'], kind: 'planks' },
  [TILE.BRIDGE]:      { top: ['#8d6f44', '#7a5f38'], sp: ['#a08252', '#64502e', '#ac8e5e'], skirt: ['#4c3722', '#302214'], kind: 'planks' },
  [TILE.FLOOR_STONE]: { top: ['#918c7b', '#7d7868'], sp: ['#a5a08e', '#68644f', '#b2ad9a'], skirt: ['#5b574b', '#3c392f'], kind: 'flags' },
  [TILE.CAVE]:        { top: ['#6e5a3e', '#5a4a32'], sp: ['#826a48', '#4a3c28', '#8f7a54'], skirt: ['#4c3722', '#302214'], kind: 'dirt' },
  [TILE.LAVA_ROCK]:   { top: ['#4a3a38', '#3c302e'], sp: ['#5c4a46', '#2c2422', '#6a5450'], skirt: ['#302422', '#1e1614'], kind: 'rock' },
  [TILE.OCEAN]:       { top: ['#1e4066', '#152f4e'], sp: ['#2a5580', '#0e2340', '#31628f'], skirt: ['#12263e', '#0a1828'], kind: 'water' },
  [TILE.WATER]:       { top: ['#2a5580', '#204468'], sp: ['#3a6a97', '#16334f', '#427299'], skirt: ['#16334f', '#0e2338'], kind: 'water' },
  [TILE.RIVER]:       { top: ['#2e5f8a', '#244d72'], sp: ['#3f739f', '#1a3a58', '#487ba6'], skirt: ['#1a3a58', '#102840'], kind: 'water' },
  [TILE.WATER_SWAMP]: { top: ['#41584a', '#35493d'], sp: ['#52694f', '#28362c', '#5e7758'], skirt: ['#28362c', '#18221c'], kind: 'water' },
};
// -- small detail painters (all clipped to the diamond by the caller) --
function speck(g, rnd, n, cols) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[(rnd() * cols.length) | 0];
    g.globalAlpha = 0.3 + rnd() * 0.5;
    g.fillRect((rnd() * 62) | 0, (rnd() * 30) | 0, rnd() > 0.82 ? 2 : 1, 1);
  }
  g.globalAlpha = 1;
}
function blades(g, rnd, n, cols) {
  for (let i = 0; i < n; i++) {
    const x = 4 + rnd() * 56, y = 4 + rnd() * 25, h2 = 2 + rnd() * 3;
    g.strokeStyle = cols[(rnd() * cols.length) | 0];
    g.globalAlpha = 0.55 + rnd() * 0.4; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 2, y - h2); g.stroke();
  }
  g.globalAlpha = 1;
}
function pebbles(g, rnd, n, base) {
  for (let i = 0; i < n; i++) {
    const x = 5 + rnd() * 54, y = 4 + rnd() * 24, r = 1 + rnd() * 1.6;
    g.fillStyle = base; g.globalAlpha = 0.8;
    g.beginPath(); g.ellipse(x, y, r, r * 0.7, 0, 0, 7); g.fill();
    g.fillStyle = '#ffffff30'; g.beginPath(); g.ellipse(x - r * 0.3, y - r * 0.3, r * 0.5, r * 0.35, 0, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
}
function cracks(g, rnd, n, col) {
  g.strokeStyle = col; g.lineWidth = 1;
  for (let i = 0; i < n; i++) {
    let x = 8 + rnd() * 48, y = 4 + rnd() * 24;
    g.globalAlpha = 0.4 + rnd() * 0.3;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 3; s++) { x += (rnd() - 0.5) * 12; y += (rnd() - 0.3) * 5; g.lineTo(x, y); }
    g.stroke();
  }
  g.globalAlpha = 1;
}
// paint one full block (diamond top + soil skirt) for a ground family
function paintBlock(g, t, rnd) {
  const m = MATS[t] || { top: [TILE_COLOR[t]?.[0] || '#808080', TILE_COLOR[t]?.[1] || '#606060'], sp: ['#909090'], skirt: ['#5c432a', '#382a18'], kind: 'dirt' };
  // side skirt first (only shows at cliff edges / chunk seams)
  const sg = g.createLinearGradient(0, 16, 0, 64);
  sg.addColorStop(0, m.skirt[0]); sg.addColorStop(1, m.skirt[1]);
  g.fillStyle = sg;
  g.beginPath(); g.moveTo(-1, 16); g.lineTo(32, 33); g.lineTo(65, 16); g.lineTo(65, 48); g.lineTo(32, 65); g.lineTo(-1, 48); g.closePath(); g.fill();
  // strata + buried stones on the skirt
  g.save();
  g.beginPath(); g.moveTo(-1, 16); g.lineTo(32, 33); g.lineTo(65, 16); g.lineTo(65, 48); g.lineTo(32, 65); g.lineTo(-1, 48); g.closePath(); g.clip();
  g.strokeStyle = '#00000028'; g.lineWidth = 1;
  for (let s = 1; s <= 3; s++) {
    const yy = 16 + s * 9;
    g.beginPath(); g.moveTo(0, yy + 2); g.lineTo(32, yy + 17); g.lineTo(64, yy + 2); g.stroke();
  }
  for (let i = 0; i < 7; i++) {
    g.fillStyle = i % 2 ? '#00000022' : '#ffffff10';
    g.fillRect((rnd() * 60) | 0, 22 + ((rnd() * 36) | 0), 2 + (rnd() * 2 | 0), 1 + (rnd() * 2 | 0));
  }
  g.restore();
  // diamond top: base gradient + per-family detail
  g.save();
  diamondPath(g); g.clip();
  const tg = g.createLinearGradient(0, 0, 0, 32);
  tg.addColorStop(0, m.top[0]); tg.addColorStop(1, m.top[1]);
  g.fillStyle = tg; g.fillRect(0, 0, 64, 32);
  switch (m.kind) {
    case 'grass':
      speck(g, rnd, 40, m.sp); blades(g, rnd, 15, ['#9ed46e', '#6d9c42', '#b2e284']);
      break;
    case 'meadow': {
      speck(g, rnd, 38, m.sp); blades(g, rnd, 13, ['#aade7a', '#7cab50', '#c2ec96']);
      // wildflowers
      const petals = ['#f2e6b0', '#e8b4c8', '#e8d24e', '#c9a2e0'];
      for (let i = 0; i < 3; i++) {
        const x = 8 + rnd() * 48, y = 5 + rnd() * 22, col = petals[(rnd() * petals.length) | 0];
        g.fillStyle = col; g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3);
        g.fillStyle = '#e8a02a'; g.fillRect(x, y, 1, 1);
      }
      break;
    }
    case 'litter':
      speck(g, rnd, 44, m.sp); blades(g, rnd, 9, ['#7fae52', '#54803a']);
      // fallen leaves & twigs
      for (let i = 0; i < 6; i++) {
        g.fillStyle = ['#8a6a34', '#a07f42', '#6d5228'][(rnd() * 3) | 0];
        g.globalAlpha = 0.65;
        g.fillRect(4 + rnd() * 56, 3 + rnd() * 26, 2, 1);
      }
      g.globalAlpha = 1;
      break;
    case 'swamp':
      speck(g, rnd, 36, m.sp);
      for (let i = 0; i < 4; i++) { // murky wet patches + reeds
        g.fillStyle = '#31402c'; g.globalAlpha = 0.4;
        g.beginPath(); g.ellipse(8 + rnd() * 48, 6 + rnd() * 20, 3 + rnd() * 4, 2 + rnd() * 2, 0, 0, 7); g.fill();
      }
      g.globalAlpha = 1; blades(g, rnd, 7, ['#6d8248', '#4a5c34']);
      break;
    case 'dirt':
      speck(g, rnd, 52, m.sp); pebbles(g, rnd, 4, '#7a6844'); cracks(g, rnd, 1, '#00000030');
      break;
    case 'road':
      speck(g, rnd, 40, m.sp); pebbles(g, rnd, 6, '#8d7c58');
      // wheel ruts along the iso axis
      g.strokeStyle = '#00000026'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(10, 11); g.lineTo(54, 21); g.stroke();
      g.beginPath(); g.moveTo(12, 22); g.lineTo(52, 12); g.stroke();
      break;
    case 'cobble': {
      // set stone in a herringbone-ish grid along the iso axes, each stone
      // shaded so the street reads as laid cobbles rather than flat grey
      const ax = [16, 8], ay = [8, -8];   // the two iso step vectors (half-tile)
      for (let u = -1; u <= 4; u++) for (let v = -2; v <= 3; v++) {
        const cx = 32 + (u - 1.5) * ax[0] * 0.5 + (v) * ay[0] * 0.5;
        const cy = 16 + (u - 1.5) * ax[1] * 0.5 + (v) * ay[1] * 0.5;
        if (cx < 2 || cx > 62 || cy < 1 || cy > 31) continue;
        const r = rnd();
        g.fillStyle = r > 0.72 ? m.sp[2] : r > 0.4 ? m.sp[0] : m.top[1];
        g.beginPath(); g.moveTo(cx, cy - 3); g.lineTo(cx + 5, cy); g.lineTo(cx, cy + 3); g.lineTo(cx - 5, cy); g.closePath(); g.fill();
        g.strokeStyle = '#00000030'; g.lineWidth = 0.7; g.stroke();
      }
      // a few pale mortar glints
      g.fillStyle = '#ffffff20'; for (let i = 0; i < 6; i++) g.fillRect((rnd() * 60) | 0, 4 + (rnd() * 24 | 0), 1, 1);
      break;
    }
    case 'farm':
      speck(g, rnd, 30, m.sp);
      g.strokeStyle = '#00000033'; g.lineWidth = 2;
      for (let s = -2; s <= 2; s++) { // plough furrows
        g.beginPath(); g.moveTo(6, 16 + s * 5 - 6); g.lineTo(58, 16 + s * 5 + 6); g.stroke();
      }
      break;
    case 'sand':
      speck(g, rnd, 46, m.sp);
      g.strokeStyle = '#ffffff28'; g.lineWidth = 1;
      for (let i = 0; i < 4; i++) { // wind ripples
        const y = 5 + i * 6 + rnd() * 3;
        g.beginPath(); g.moveTo(6, y); g.quadraticCurveTo(32, y + (rnd() - 0.5) * 5, 58, y); g.stroke();
      }
      g.strokeStyle = '#00000015';
      for (let i = 0; i < 3; i++) { const y = 8 + i * 7 + rnd() * 3; g.beginPath(); g.moveTo(8, y); g.quadraticCurveTo(32, y + (rnd() - 0.5) * 5, 56, y); g.stroke(); }
      break;
    case 'rock':
      speck(g, rnd, 34, m.sp); cracks(g, rnd, 3, '#00000045');
      g.fillStyle = '#ffffff12'; // strata highlight
      g.fillRect(6, 8 + rnd() * 6, 50, 2);
      for (let i = 0; i < 3; i++) { g.fillStyle = '#9aa06a'; g.globalAlpha = 0.35; g.fillRect(6 + rnd() * 52, 4 + rnd() * 24, 2, 1); } // lichen
      g.globalAlpha = 1;
      break;
    case 'scree':
      speck(g, rnd, 30, m.sp);
      for (let i = 0; i < 9; i++) { // angular fragments
        const x = 5 + rnd() * 54, y = 4 + rnd() * 24, r = 1.5 + rnd() * 2;
        g.fillStyle = i % 2 ? '#7c7767' : '#a8a290'; g.globalAlpha = 0.8;
        g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r * 0.8); g.lineTo(x - r * 0.9, y); g.closePath(); g.fill();
      }
      g.globalAlpha = 1;
      break;
    case 'tundra':
      speck(g, rnd, 40, m.sp); blades(g, rnd, 8, ['#c2c49e', '#8e9172']);
      for (let i = 0; i < 3; i++) { g.fillStyle = '#e8ecf2'; g.globalAlpha = 0.5; g.beginPath(); g.ellipse(8 + rnd() * 48, 6 + rnd() * 20, 3, 1.6, 0, 0, 7); g.fill(); }
      g.globalAlpha = 1;
      break;
    case 'snow':
      speck(g, rnd, 26, m.sp);
      for (let i = 0; i < 7; i++) { // sparkle
        const x = 4 + rnd() * 56, y = 3 + rnd() * 26;
        g.fillStyle = '#ffffff'; g.globalAlpha = 0.8;
        g.fillRect(x, y, 1, 1);
        if (rnd() > 0.6) { g.globalAlpha = 0.4; g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3); }
      }
      g.globalAlpha = 1;
      g.strokeStyle = '#c8d4e2'; g.lineWidth = 1; g.globalAlpha = 0.5; // drift line
      g.beginPath(); g.moveTo(8, 10 + rnd() * 12); g.quadraticCurveTo(32, 8 + rnd() * 16, 56, 10 + rnd() * 12); g.stroke();
      g.globalAlpha = 1;
      break;
    case 'ice':
      speck(g, rnd, 14, m.sp);
      g.strokeStyle = '#ffffff55'; g.lineWidth = 1;
      cracks(g, rnd, 3, '#8fb2ca88');
      g.beginPath(); g.moveTo(12, 6); g.lineTo(30, 24); g.stroke(); // sheen
      g.strokeStyle = '#ffffff30'; g.beginPath(); g.moveTo(36, 6); g.lineTo(50, 20); g.stroke();
      break;
    case 'planks': {
      // planks laid along the iso axis with grain + nails
      g.strokeStyle = '#00000040'; g.lineWidth = 1;
      for (let s = -2; s <= 2; s++) {
        g.beginPath(); g.moveTo(0, 16 + s * 6 - 16); g.lineTo(64, 16 + s * 6 + 16); g.stroke();
      }
      speck(g, rnd, 24, m.sp);
      g.strokeStyle = '#00000022';
      for (let i = 0; i < 5; i++) { const x = 6 + rnd() * 52, y = 4 + rnd() * 24; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 6, y + 3); g.stroke(); }
      g.fillStyle = '#3c2c14';
      for (let i = 0; i < 3; i++) g.fillRect(8 + rnd() * 48, 6 + rnd() * 20, 1, 1);
      break;
    }
    case 'flags': {
      // flagstones: two joint lines + bevel highlights
      speck(g, rnd, 26, m.sp);
      g.strokeStyle = '#00000038'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(14 + rnd() * 8, 2); g.lineTo(24 + rnd() * 8, 30); g.stroke();
      g.beginPath(); g.moveTo(40 + rnd() * 8, 2); g.lineTo(44 + rnd() * 8, 30); g.stroke();
      g.beginPath(); g.moveTo(4, 12 + rnd() * 6); g.lineTo(60, 14 + rnd() * 6); g.stroke();
      g.strokeStyle = '#ffffff18';
      g.beginPath(); g.moveTo(6, 10 + rnd() * 6); g.lineTo(58, 12 + rnd() * 6); g.stroke();
      break;
    }
    case 'water': {
      // static deep base: darker depth blotches (the shimmer is animated separately)
      for (let i = 0; i < 5; i++) {
        g.fillStyle = m.sp[1]; g.globalAlpha = 0.35;
        g.beginPath(); g.ellipse(8 + rnd() * 48, 5 + rnd() * 22, 4 + rnd() * 6, 2 + rnd() * 3, 0, 0, 7); g.fill();
      }
      g.globalAlpha = 1;
      break;
    }
  }
  g.restore();
}
// ---- 4-season ground -----------------------------------------------------------
// A year passes in an hour: each season holds for 15 minutes. Temperate greens
// are tinted toward the LPC 4-season terrain palettes (sampled means — spring
// 90,151,43 / summer 70,128,50 / autumn 185,158,63 / winter 212,234,239);
// deserts, snowfields and rock keep their own climate.
const SEASON_MS = 15 * 60 * 1000;
export const seasonNow = () => Math.floor(Date.now() / SEASON_MS) % 4;  // 0 spring 1 summer 2 autumn 3 winter
export const SEASON_NAMES = ['spring', 'summer', 'autumn', 'winter'];
const SEASONAL_TILES = new Set([TILE.GRASS, TILE.MEADOW, TILE.FOREST, TILE.DEEPFOREST]);
const SEASON_TINT = ['rgba(150,205,30,0.10)', null, 'rgba(212,148,40,0.20)', 'rgba(216,233,243,0.36)'];

const texCache = new Map(); // "t:variant:dark:season" -> 64x64 canvas
function tileTexture(t, pick, dark = 0) {
  const v = pick & 3;
  const sn = SEASONAL_TILES.has(t) ? seasonNow() : 1;
  const key = t + ':' + v + ':' + dark + ':' + sn;
  let c = texCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    paintBlock(g, t, mulberry(t * 7919 + v * 104729 + 1));
    if (SEASON_TINT[sn] && SEASONAL_TILES.has(t)) {
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = SEASON_TINT[sn]; g.fillRect(0, 0, 64, 64);
      g.globalCompositeOperation = 'source-over';
    }
    if (dark) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgba(10,8,20,${Math.min(0.5, dark * 0.16)})`; g.fillRect(0, 0, 64, 64); g.globalCompositeOperation = 'source-over'; }
    texCache.set(key, c);
  }
  return c;
}

// ---- animated water --------------------------------------------------------------
// Water tiles get a static deep base in the chunk cache plus a live overlay:
// rolling highlight bands and crest sparkles cycling through 4 frames, with
// foam lapping every edge that meets land. Chunks record their water tiles at
// bake time so the per-frame cost is a couple of blits per visible water tile.
const _waterAnim = new Map();      // tile -> [4 frames]
function waterAnim(t) {
  let fr = _waterAnim.get(t);
  if (fr) return fr;
  const hue = {
    [TILE.OCEAN]: ['rgba(178,216,240,', 'rgba(120,170,210,'],
    [TILE.WATER]: ['rgba(196,232,250,', 'rgba(140,190,225,'],
    [TILE.RIVER]: ['rgba(205,238,252,', 'rgba(150,200,232,'],
    [TILE.WATER_SWAMP]: ['rgba(168,192,150,', 'rgba(120,142,105,'],
  }[t] || ['rgba(196,232,250,', 'rgba(140,190,225,'];
  fr = [];
  for (let f = 0; f < 4; f++) {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 32;
    const g = c.getContext('2d');
    g.save();
    g.beginPath(); g.moveTo(32, 0); g.lineTo(64, 16); g.lineTo(32, 32); g.lineTo(0, 16); g.closePath(); g.clip();
    const ph = f / 4;
    for (let b = 0; b < 3; b++) {   // rolling highlight bands
      const yy = 3 + ((b * 9 + ph * 9) % 26);
      const amp = 2 + Math.sin((ph + b / 3) * Math.PI * 2) * 1.6;
      g.strokeStyle = hue[b % 2] + (0.12 + 0.06 * Math.sin((ph * 2 + b / 3) * Math.PI * 2)) + ')';
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(2, yy);
      g.quadraticCurveTo(18, yy + amp, 34, yy);
      g.quadraticCurveTo(48, yy - amp, 62, yy);
      g.stroke();
    }
    const rnd = mulberry(t * 31 + f * 7 + 5);
    for (let i = 0; i < 4; i++) {   // crest sparkles
      const x = 6 + rnd() * 52, y = 4 + rnd() * 24;
      g.fillStyle = hue[0] + (0.35 + rnd() * 0.3) + ')';
      g.fillRect(x, y, rnd() > 0.5 ? 2 : 1, 1);
    }
    g.restore();
    fr.push(c);
  }
  _waterAnim.set(t, fr);
  return fr;
}
// foam along the 4 diamond edges (bit order: N(x,y-1) TR edge, W(x-1,y) TL, E(x+1,y) RB, S(x,y+1) LB)
const EDGE_SEG = [[[32, 1.5], [62, 16]], [[32, 1.5], [2, 16]], [[62, 16], [32, 30.5]], [[2, 16], [32, 30.5]]];
let _foam = null;
function foamFrames() {
  if (_foam) return _foam;
  _foam = [];
  for (let e = 0; e < 4; e++) {
    const frames = [];
    for (let f = 0; f < 2; f++) {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 32;
      const g = c.getContext('2d');
      // clip to the tile diamond so the foam laps only the water side of the
      // shoreline and never bleeds onto the land tile (or its trees/buildings)
      g.beginPath(); g.moveTo(32, 0); g.lineTo(64, 16); g.lineTo(32, 32); g.lineTo(0, 16); g.closePath(); g.clip();
      const [[ax, ay], [bx, by]] = EDGE_SEG[e];
      g.strokeStyle = 'rgba(240,250,255,0.5)';
      g.lineWidth = 1.6;
      g.setLineDash(f ? [3, 4] : [4, 3]);
      g.lineDashOffset = f * 3;
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      g.strokeStyle = 'rgba(240,250,255,0.25)';
      g.lineWidth = 3; g.setLineDash([2, 6]);
      g.beginPath(); g.moveTo((ax * 3 + bx) / 4, (ay * 3 + by) / 4 + 1); g.lineTo((ax + bx * 3) / 4, (ay + by * 3) / 4 + 1); g.stroke();
      frames.push(c);
    }
    _foam.push(frames);
  }
  return _foam;
}

// ---- castle masonry: real grey-ashlar stone lifted from the OGA "Copings"
// sheet, baked once into a 64px repeating pattern. The source has an opaque
// black background and dark mortar gaps, so any near-black pixel is clamped up
// to mid grey — the tile then repeats seamlessly across the curtain with no
// black showing. Used to fill the castle curtain + turret faces (the bounded,
// regular square where a sprite treatment is safe); villages keep procedural.
const _lodeLit = new Map();            // town key -> timestamp the client first saw it attuned (drives the one-shot light-up)
let _castleStone = null;               // CanvasPattern once built, 'pending' while the image streams
function castleStonePattern(g) {
  if (_castleStone && _castleStone !== 'pending') return _castleStone;
  const im = mimg('overhaul/copings_stone_128.png');
  if (!im || !im.complete || !im.naturalWidth) { _castleStone = 'pending'; return null; }
  const S = 64, c = document.createElement('canvas'); c.width = S; c.height = S;
  const cc = c.getContext('2d');
  cc.drawImage(im, 300, 48, S, S, 0, 0, S, S);   // a dense stone window from the tall-wall band
  const d = cc.getImageData(0, 0, S, S), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const lum = 0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2];
    if (lum < 30) { p[i] = 96; p[i + 1] = 96; p[i + 2] = 100; }   // fill black bg / mortar holes
    p[i + 3] = 255;
  }
  cc.putImageData(d, 0, 0);
  const wasPending = _castleStone === 'pending';
  _castleStone = g.createPattern(c, 'repeat');
  if (wasPending) chunkCache.clear();  // re-bake chunks that baked before the stone arrived
  return _castleStone;
}

// ---- waterfalls -------------------------------------------------------------------
// A river tile standing above its downhill neighbour spills over the edge: the
// cliff column below it is painted as falling water instead of earth, and the
// live overlay streams white water down it, misting at the lip and churning
// into plunge foam at the pool below.
function skirtPath(g) {
  g.beginPath(); g.moveTo(-1, 16); g.lineTo(32, 33); g.lineTo(65, 16); g.lineTo(65, 48); g.lineTo(32, 65); g.lineTo(-1, 48); g.closePath();
}
const _fallStatic = new Map();     // dark level -> canvas
function fallStatic(dark = 0) {
  let c = _fallStatic.get(dark);
  if (c) return c;
  c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.save(); skirtPath(g); g.clip();
  const grad = g.createLinearGradient(0, 14, 0, 64);
  grad.addColorStop(0, '#5488b8'); grad.addColorStop(0.5, '#3f6f9f'); grad.addColorStop(1, '#305a85');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#ffffff26'; g.lineWidth = 2;   // standing streak hints
  for (let i = 0; i < 6; i++) {
    const x = 6 + i * 10;
    const yTop = 16 + (x <= 32 ? x / 2 : (64 - x) / 2);
    g.beginPath(); g.moveTo(x, yTop); g.lineTo(x, 64); g.stroke();
  }
  if (dark) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgba(10,8,20,${Math.min(0.5, dark * 0.14)})`; g.fillRect(0, 0, 64, 64); g.globalCompositeOperation = 'source-over'; }
  g.restore();
  _fallStatic.set(dark, c);
  return c;
}
const _fallAnim = new Map();       // 'top' | 'mid0' | 'mid1' | 'base' -> [8 frames]
let _fallLPC = false;              // flips true (and rebuilds) once the LPC frames load
function fallAnim(kind) {
  // upgrade to the LPC animated-waterfall frames once their images stream in
  const wf = MEDIA.sheets?.waterfall;
  if (wf && !_fallLPC) {
    const imgs = [...(wf.top || []), ...wf.mid, ...wf.base].map(f => mimg(f));
    if (imgs.every(im => im && im.complete && im.naturalWidth)) { _fallLPC = true; _fallAnim.clear(); }
  }
  let fr = _fallAnim.get(kind);
  if (fr) return fr;
  fr = [];
  // whitewater churning on the pool at the fall's foot: a diamond-masked
  // 64x32 overlay of the pack's splash ring plus boiling foam
  if (kind === 'splash') {
    for (let f = 0; f < 8; f++) {
      const c = document.createElement('canvas'); c.width = 64; c.height = 32;
      const g = c.getContext('2d');
      g.save();
      g.beginPath(); g.moveTo(32, 0); g.lineTo(64, 16); g.lineTo(32, 32); g.lineTo(0, 16); g.closePath(); g.clip();
      const wfb = _fallLPC && mimg(MEDIA.sheets.waterfall.base[f & 3]);
      if (wfb) { g.globalAlpha = 0.8; g.drawImage(wfb, 0, 26, 64, 26, 0, 3, 64, 26); g.globalAlpha = 1; }
      const rnd = mulberry(313 + f * 47);
      for (let i = 0; i < 12; i++) {   // boiling foam, biggest at the impact line
        const x = 8 + rnd() * 48, y = 4 + rnd() * 20;
        g.fillStyle = `rgba(240,250,255,${0.25 + rnd() * 0.4})`;
        g.beginPath(); g.arc(x, y, 1.5 + rnd() * 3 * (1 - y / 32), 0, 7); g.fill();
      }
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.5;   // spreading ripple arcs
      const rr = 8 + (f / 8) * 18;
      g.beginPath(); g.ellipse(32, 12, rr, rr * 0.45, 0, 0, 7); g.stroke();
      g.restore();
      fr.push(c);
    }
    _fallAnim.set(kind, fr);
    return fr;
  }
  for (let f = 0; f < 8; f++) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    g.save(); skirtPath(g); g.clip();
    if (_fallLPC) {
      // The pour: the 64px body band slides DOWNWARD 8px per frame (a full
      // wrap over the 8-frame cycle) while the pack's own ripple animates on
      // top of it. Stacked cliff segments alternate mid0/mid1 so the band
      // phase lines up across segment seams and the fall reads as one sheet.
      const pf = f & 3;                                  // pack ripple frame
      // odd cliff segments shift the band half a wrap so the sheet is
      // continuous across the 32px segment seams (the crest sits at k=0, even)
      const phase = kind === 'mid1' ? 32 : 0;
      const off = (f * 8 + phase) % 64;
      const body = mimg(wf.mid[pf]);
      g.globalAlpha = 0.95;
      const yb = 16 - off;
      g.drawImage(body, 0, yb - 64, 64, 64);
      g.drawImage(body, 0, yb, 64, 64);
      g.drawImage(body, 0, yb + 64, 64, 64);
      if (kind === 'top' && wf.top) {
        // the lip stays pinned at the edge while the water below it scrolls
        g.drawImage(mimg(wf.top[pf]), 0, 12, 64, 34);
      }
      if (kind === 'top') {
        // the crest keeps its water SURFACE: cut the diamond top face back out
        // so the baked river top + live shimmer stay visible, and break a foam
        // lip along the spill edges where the surface tips over
        g.globalCompositeOperation = 'destination-out';
        g.beginPath(); g.moveTo(32, -1); g.lineTo(65, 16); g.lineTo(32, 33); g.lineTo(-1, 16); g.closePath(); g.fill();
        g.globalCompositeOperation = 'source-over';
        g.strokeStyle = `rgba(245,252,255,${0.5 + 0.2 * Math.sin(f)})`; g.lineWidth = 2.5;
        g.setLineDash(f & 1 ? [4, 3] : [3, 4]);
        g.beginPath(); g.moveTo(1, 17); g.lineTo(32, 33.5); g.lineTo(63, 17); g.stroke();
        g.setLineDash([]);
      }
      if (kind === 'base') {
        // plunge pool: splash ring over the scrolled body, plus churn foam
        g.drawImage(mimg(wf.base[pf]), 0, 12, 64, 52);
        const rnd = mulberry(977 + f * 31);
        for (let i = 0; i < 8; i++) {
          const x = 4 + rnd() * 56, y = 46 + rnd() * 16;
          g.fillStyle = `rgba(240,250,255,${0.2 + rnd() * 0.3})`;
          g.beginPath(); g.arc(x, y, 1.5 + rnd() * 2.5, 0, 7); g.fill();
        }
      }
      g.globalAlpha = 1;
    } else {
      // falling streaks, phase-shifted downward each frame so the water pours
      for (let i = 0; i < 9; i++) {
        const x = 3 + i * 7 + (i % 2 ? 2 : 0);
        const yTop = 16 + (x <= 32 ? x / 2 : (64 - x) / 2);
        const len = 10 + (i % 3) * 8;
        const y0 = yTop + ((f * 12 + i * 17) % 48);
        g.strokeStyle = i % 3 === 0 ? 'rgba(255,255,255,0.55)' : 'rgba(210,235,250,0.35)';
        g.lineWidth = i % 3 === 0 ? 2 : 1.4;
        g.beginPath(); g.moveTo(x, y0); g.lineTo(x, Math.min(64, y0 + len)); g.stroke();
        if (y0 + len > 64) {   // wrap the streak back to the lip
          g.beginPath(); g.moveTo(x, yTop); g.lineTo(x, yTop + (y0 + len - 64) * 0.6); g.stroke();
        }
      }
      g.fillStyle = 'rgba(255,255,255,0.18)';   // mist at the lip
      g.fillRect(0, 16, 64, 5);
      if (kind === 'base') {                     // churning plunge foam
        const rnd = mulberry(977 + f * 31);
        for (let i = 0; i < 10; i++) {
          const x = 4 + rnd() * 56, y = 44 + rnd() * 18;
          g.fillStyle = `rgba(240,250,255,${0.22 + rnd() * 0.35})`;
          g.beginPath(); g.arc(x, y, 2 + rnd() * 3, 0, 7); g.fill();
        }
      }
    }
    g.restore();
    fr.push(c);
  }
  _fallAnim.set(kind, fr);
  return fr;
}

function hashXY(x, y) { let h = (x * 73856093) ^ (y * 19349663); h = (h ^ (h >> 13)) * 0x5bd1e995; return ((h ^ (h >> 15)) >>> 0) / 4294967296; }

// A timber bridge deck spanning the river at bank level: the walking surface is
// the tile diamond itself (so players stand ON it), with the channel water
// drawn below, support piers plunging into it, deck thickness on the near
// faces, and a guard rail along the two far edges.
function drawBridge(g, lx, ly, x, y, plane) {
  const hw = TW / 2, hh = TH / 2, TK = 6, PIER = 17;
  const N = [lx, ly - hh], E = [lx + hw, ly], S = [lx, ly + hh], W = [lx - hw, ly];
  const tileT = (nx, ny) => tileAtPlane(plane, nx, ny);
  const water = (nx, ny) => WATERS.has(tileT(nx, ny));
  const land = (nx, ny) => { const t = tileT(nx, ny); return t !== TILE.BRIDGE && !WATERS.has(t); }; // road/ground bank
  // the four diamond edges: [corner a, corner b, neighbour tile]
  const EDGES = { TR: [N, E, x, y - 1], TL: [W, N, x - 1, y], RB: [E, S, x + 1, y], LB: [S, W, x, y + 1] };
  // Stone abutments where the deck meets a bank — a solid footing so the ends
  // read as anchored to the land, not floating on a pier. Drawn under the deck.
  for (const k in EDGES) {
    const [a, b, nx, ny] = EDGES[k];
    if (!land(nx, ny)) continue;
    g.fillStyle = '#6b6256';
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(b[0], b[1] + 13); g.lineTo(a[0], a[1] + 13); g.closePath(); g.fill();
    g.fillStyle = '#565046'; g.beginPath(); g.moveTo(a[0], a[1] + 6); g.lineTo(b[0], b[1] + 6); g.lineTo(b[0], b[1] + 13); g.lineTo(a[0], a[1] + 13); g.closePath(); g.fill();
    g.strokeStyle = '#3f3a33'; g.lineWidth = 1; g.beginPath(); g.moveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 4); g.lineTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 12); g.stroke();
  }
  // support piers plunge only where the channel water is actually below
  const pier = (px, topY) => { g.fillStyle = '#2a1c0e'; g.fillRect(px - 2.5, topY, 5, PIER); g.fillStyle = '#402c16'; g.fillRect(px - 2.5, topY, 2, PIER); };
  if (water(x - 1, y) || water(x, y + 1)) pier(W[0] + 6, W[1]);
  if (water(x + 1, y) || water(x, y + 1)) pier(E[0] - 6, E[1]);
  if (water(x, y + 1)) pier(lx, S[1] - 1);
  // The castle drawbridge draws as a grey-ashlar STONE deck (matching the curtain
  // walls, via the shared Copings pattern); river bridges keep their timber. Same
  // geometry either way — only the surfacing changes.
  const castle = isCastleBridge(x, y);
  const cPat = castle ? castleStonePattern(g) : null;
  const deck = () => { g.beginPath(); g.moveTo(N[0], N[1]); g.lineTo(E[0], E[1]); g.lineTo(S[0], S[1]); g.lineTo(W[0], W[1]); g.closePath(); };
  // deck thickness on the two camera-facing edges
  const faceQuad = (a, b, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(b[0], b[1] + TK); g.lineTo(a[0], a[1] + TK); g.closePath(); g.fill(); };
  faceQuad(W, S, castle ? '#4a4842' : '#573a1c'); faceQuad(S, E, castle ? '#5e5c54' : '#684622');
  // deck top: stone slabs for the castle bridge, timber planks otherwise
  g.fillStyle = castle ? '#8a8880' : '#7d5327'; deck(); g.fill();
  if (cPat) { g.save(); deck(); g.clip(); deck(); g.fillStyle = cPat; g.fill(); deck(); g.fillStyle = 'rgba(250,252,255,0.06)'; g.fill(); g.restore(); }
  if (!castle) {   // timber plank seams (the stone deck carries its own joints)
    g.save(); deck(); g.clip();
    const alongX = tileT(x - 1, y) === TILE.BRIDGE || tileT(x + 1, y) === TILE.BRIDGE || land(x - 1, y) || land(x + 1, y);
    g.strokeStyle = '#00000038'; g.lineWidth = 1;
    for (let i = 1; i < 7; i++) {
      const t2 = i / 7;
      if (alongX) { g.beginPath(); g.moveTo(N[0] + (W[0] - N[0]) * t2, N[1] + (W[1] - N[1]) * t2); g.lineTo(E[0] + (S[0] - E[0]) * t2, E[1] + (S[1] - E[1]) * t2); g.stroke(); }
      else { g.beginPath(); g.moveTo(N[0] + (E[0] - N[0]) * t2, N[1] + (E[1] - N[1]) * t2); g.lineTo(W[0] + (S[0] - W[0]) * t2, W[1] + (S[1] - W[1]) * t2); g.stroke(); }
    }
    g.restore();
  }
  g.strokeStyle = castle ? '#b2b4ae' : '#9a6a34'; g.lineWidth = 1;   // lit far edges
  g.beginPath(); g.moveTo(W[0], W[1]); g.lineTo(N[0], N[1]); g.lineTo(E[0], E[1]); g.stroke();
  // guard rails run along EVERY edge that meets open water (both sides of the
  // span); edges that meet the bank get none, so land never has a rail beside it.
  // The castle bridge gets a heavier grey stone parapet.
  const railH = castle ? 10 : 9;
  const rail = (a, b) => {
    g.strokeStyle = castle ? '#726e64' : '#4a3016'; g.lineWidth = castle ? 3 : 2;
    g.beginPath(); g.moveTo(a[0], a[1] - railH); g.lineTo(b[0], b[1] - railH); g.stroke();
    for (let i = 0; i <= 3; i++) { const px = a[0] + (b[0] - a[0]) * (i / 3), py = a[1] + (b[1] - a[1]) * (i / 3); g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - railH); g.stroke(); }
  };
  for (const k in EDGES) { const [a, b, nx, ny] = EDGES[k]; if (water(nx, ny)) rail(a, b); }
}

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
let _decorReady = false;      // one-time chunk-cache flush when undead decor loads
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
  const top = 200 + maxH * ESTEP;   // headroom for tall crenellated walls + castle turrets on the first rows
  const canvas = document.createElement('canvas');
  canvas.width = CH * TW; canvas.height = CH * TH + top + 64;
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  const ox = CH * TW / 2, oy = top;
  const water = [];   // animated-water tiles recorded at bake time
  // Bake tiles in back-to-front DIAGONAL (i+j) order — the true iso painter's
  // order — so tall prisms (castle ramparts, cliffs, walls) occlude only what is
  // genuinely BEHIND them and are overdrawn by whatever sits in front. A plain
  // row-by-row (j,i) sweep mis-sorts adjacent diagonals, which let the tall moat
  // rampart paint over the drawbridge deck crossing in front of it.
  for (let dsum = 0; dsum <= 2 * (CH - 1); dsum++)
    for (let i = Math.max(0, dsum - (CH - 1)); i <= Math.min(CH - 1, dsum); i++) {
    const j = dsum - i;
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
    if (t === TILE.BRIDGE) {
      // channel water below, then a timber deck on piers at bank level. The
      // water is re-drawn live (with the deck relaid over it) so the river keeps
      // flowing under the crossing instead of freezing to a static texture.
      g.drawImage(tileTexture(TILE.RIVER, (shade * 8) | 0), lx - TW / 2, ly - TH / 2 + 9);
      if (!isCastleBridge(x, y)) drawBridge(g, lx, ly, x, y, plane);   // castle bridge is stamped live (the OGA model)
      water.push({ lx, ly, t: TILE.RIVER, x, y, ph: (x * 7 + y * 13) % 64, bridge: true });
    } else if (!WALLS.has(t)) {
      const isWater = WATERS.has(t);
      // Per-face drops: the tile's two camera-facing prism faces belong to the
      // SW neighbour (y+1, screen left half) and SE neighbour (x+1, right
      // half). Water only pours over a face whose OWN neighbour sits lower —
      // internal faces (same-level water behind them) stay dry. Land cliffs
      // keep the full min-neighbour column (the prism corner needs the fill).
      const dl = isWater ? Math.max(0, h - Math.max(0, chunkElev(plane, x, y + 1))) : 0;
      const dr = isWater ? Math.max(0, h - Math.max(0, chunkElev(plane, x + 1, y))) : 0;
      if (isWater) {
        if (dl || dr) {
          g.save(); g.beginPath();
          if (dl) g.rect(lx - TW / 2, ly - TH / 2, TW / 2, (dl + 1) * ESTEP + TH * 2);
          if (dr) g.rect(lx, ly - TH / 2, TW / 2, (dr + 1) * ESTEP + TH * 2);
          g.clip();
          for (let k = Math.max(dl, dr); k >= 1; k--) g.drawImage(fallStatic(k), lx - TW / 2, ly - TH / 2 + k * ESTEP);
          g.restore();
        }
      } else for (let k = drop; k >= 1; k--) {
        g.drawImage(tileTexture(TILE.DIRT, ((shade * 8) | 0) + k, k), lx - TW / 2, ly - TH / 2 + k * ESTEP);
      }
      g.drawImage(tileTexture(t, (shade * 8) | 0), lx - TW / 2, ly - TH / 2);
      if (isWater) {
        // record for the live shimmer overlay + note which edges lap onto land
        let em = 0;
        const dirs = [[0, -1], [-1, 0], [1, 0], [0, 1]];
        for (let k2 = 0; k2 < 4; k2++) {
          const nt = tileAtPlane(plane, x + dirs[k2][0], y + dirs[k2][1]);
          if (!WATERS.has(nt) && nt !== TILE.BRIDGE) em |= 1 << k2;
        }
        // churned pool: any lower water tile within a block of a spilling fall
        // boils with whitewater where the falls crash down (per-face spills
        // only — a purely diagonal step has no visible curtain, so no churn)
        let churn = 0;
        if (!dl && !dr) {
          outer: for (let ny2 = y - 2; ny2 <= y + 2; ny2++) {
            for (let nx2 = x - 2; nx2 <= x + 2; nx2++) {
              if (nx2 === x && ny2 === y) continue;
              if (!WATERS.has(tileAtPlane(plane, nx2, ny2))) continue;
              const nh = chunkElev(plane, nx2, ny2);
              if (nh <= h) continue;
              const nDrop = Math.max(nh - Math.max(0, chunkElev(plane, nx2, ny2 + 1)), nh - Math.max(0, chunkElev(plane, nx2 + 1, ny2)));
              if (nDrop >= 1) { churn = 1; break outer; }
            }
          }
        }
        water.push({ lx, ly, t, ph: (x * 7 + y * 13) % 64, em, drop: Math.max(dl, dr), dl, dr, churn });
      }
      // snowfield melt-lace where snow meets bare ground (terrain-extension
      // style transition softening; shorelines keep their foam instead)
      if (t === TILE.SNOW) {
        const dirs = [[0, -1], [-1, 0], [1, 0], [0, 1]];
        for (let e = 0; e < 4; e++) {
          const nt = tileAtPlane(plane, x + dirs[e][0], y + dirs[e][1]);
          if (nt === TILE.SNOW || nt === TILE.ICE || WATERS.has(nt) || WALLS.has(nt)) continue;
          const [[ax, ay], [bx, by]] = EDGE_SEG[e];
          g.save();
          g.translate(lx - TW / 2, ly - TH / 2);
          g.strokeStyle = 'rgba(245,250,252,0.5)'; g.lineWidth = 2.2; g.setLineDash([3, 3]);
          g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
          g.strokeStyle = 'rgba(235,242,248,0.28)'; g.lineWidth = 4; g.setLineDash([2, 5]);
          g.beginPath(); g.moveTo((ax * 3 + bx) / 4, (ay * 3 + by) / 4 + 1); g.lineTo((ax + bx * 3) / 4, (ay + by * 3) / 4 + 1); g.stroke();
          g.restore();
        }
      }
    }
    // castle masonry: a lit-stone prism (raised coursed stone) — used both on the
    // upper floor planes AND for the keep on the overworld (same look inside and
    // out, and it renders as one solid block per tile so there are no thin-slab
    // gaps/"slits"). Taller on the overworld so the keep walls read as a castle.
    if (t === TILE.WALL && (plane >= PLANE.CASTLE_BASE || (plane === PLANE.OVERWORLD && inCastle(x, y)))) {
      const lit = 0.78 + shade * 0.3, wh = plane >= PLANE.CASTLE_BASE ? 24 : 46;
      const s = (r, gg, b) => `rgb(${Math.min(255, r * lit) | 0},${Math.min(255, gg * lit) | 0},${Math.min(255, b * lit) | 0})`;
      g.fillStyle = s(96, 100, 110); g.beginPath(); g.moveTo(lx - TW / 2, ly); g.lineTo(lx, ly + TH / 2); g.lineTo(lx, ly + TH / 2 - wh); g.lineTo(lx - TW / 2, ly - wh); g.closePath(); g.fill();
      g.fillStyle = s(126, 131, 142); g.beginPath(); g.moveTo(lx + TW / 2, ly); g.lineTo(lx, ly + TH / 2); g.lineTo(lx, ly + TH / 2 - wh); g.lineTo(lx + TW / 2, ly - wh); g.closePath(); g.fill();
      g.fillStyle = s(158, 164, 176); g.beginPath(); g.moveTo(lx, ly - TH / 2 - wh); g.lineTo(lx + TW / 2, ly - wh); g.lineTo(lx, ly + TH / 2 - wh); g.lineTo(lx - TW / 2, ly - wh); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(40,42,48,0.6)'; g.lineWidth = 1;                       // a coursing line down each face
      g.beginPath(); g.moveTo(lx - TW / 2, ly - wh / 2); g.lineTo(lx, ly + TH / 2 - wh / 2); g.lineTo(lx + TW / 2, ly - wh / 2); g.stroke();
      continue;
    }
    // dungeon rock: flat dark tile (no tall prism, so corridors stay readable),
    // studded with abyssal rocks and glowing crystal veins
    if (t === TILE.WALL && plane >= PLANE.DUNGEON_BASE && plane < PLANE.CASTLE_BASE) {
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
    // building walls: textured prisms — coursed masonry for castle stone,
    // timber framing over lime-washed wattle for village walls
    if (WALLS.has(t)) {
      const stone = t === TILE.WALL;
      const wh = stone ? 56 : 46;
      const wear = 0.9 + shade * 0.2;                     // per-tile weathering
      const tint = (hex, f) => {
        const [r, gg, b] = hexRgb(hex);
        return `rgb(${Math.min(255, r * f) | 0},${Math.min(255, gg * f) | 0},${Math.min(255, b * f) | 0})`;
      };
      // settlement material tiers (#126): walled-town ramparts read as castle
      // curtain wall in big grey brick with a crenellated parapet; stone
      // buildings inside those walls build in rounded cobblestone
      const wallStyle = stone ? wallStyleAt(x, y) : null;
      if (wallStyle === 'castle') {
        // curtain wall height; the corner/gate TURRETS stand far taller (~5-6 tiles)
        // as battlemented drums, their crenellated deck the roof a bowman would man
        const tower = stone ? castleTowerAt(x, y) : null;
        const cwh = tower ? 168 : (regionAt(x, y) === 'NOTTINGHAM' ? 96 : 64);
        const cFaceL = () => { g.beginPath(); g.moveTo(lx - TW / 2, ly); g.lineTo(lx, ly + TH / 2); g.lineTo(lx, ly + TH / 2 - cwh); g.lineTo(lx - TW / 2, ly - cwh); g.closePath(); };
        const cFaceR = () => { g.beginPath(); g.moveTo(lx + TW / 2, ly); g.lineTo(lx, ly + TH / 2); g.lineTo(lx, ly + TH / 2 - cwh); g.lineTo(lx + TW / 2, ly - cwh); g.closePath(); };
        // faces: real grey-ashlar stone (OGA Copings sheet) tiled down each face,
        // with a translucent directional wash so the lit (right) / shade (left)
        // read and per-tile weathering survive. Falls back to flat grey brick +
        // procedural courses until the stone image streams in.
        const cPat = castleStonePattern(g);
        for (const [face, dark] of [[cFaceL, true], [cFaceR, false]]) {
          if (cPat) {
            g.save(); face(); g.clip();
            face(); g.fillStyle = cPat; g.fill();
            face(); g.fillStyle = dark ? `rgba(22,24,30,${(0.36 - shade * 0.16).toFixed(3)})`
                                       : `rgba(255,255,255,${(0.07 + shade * 0.07).toFixed(3)})`;
            g.fill();
            g.restore();
          } else {
            g.fillStyle = tint(dark ? '#7c8387' : '#9aa2a6', wear); face(); g.fill();
            g.save(); face(); g.clip();
            g.strokeStyle = '#545b5f'; g.lineWidth = 1.4;
            const ox2 = dark ? lx - TW / 2 : lx;
            for (let row = 1; row < 6; row++) {
              const yy = ly - cwh + row * (cwh / 6);
              g.beginPath(); g.moveTo(ox2, yy); g.lineTo(ox2 + TW / 2, yy + TH / 4); g.stroke();
              for (const fx2 of row % 2 ? [0.28, 0.72] : [0.5]) {
                const jx = ox2 + (TW / 2) * fx2;
                g.beginPath(); g.moveTo(jx, yy - cwh / 6 + fx2 * TH / 4 + 3); g.lineTo(jx, yy + fx2 * TH / 4 + 1); g.stroke();
              }
            }
            g.restore();
          }
        }
        // wall-walk cap + crenellated parapet along the two far edges
        g.fillStyle = tint('#aab2b6', wear);
        g.beginPath(); g.moveTo(lx, ly - TH / 2 - cwh); g.lineTo(lx + TW / 2, ly - cwh); g.lineTo(lx, ly + TH / 2 - cwh); g.lineTo(lx - TW / 2, ly - cwh); g.closePath(); g.fill();
        g.strokeStyle = '#00000030'; g.lineWidth = 1; g.stroke();
        for (const dir of [-1, 1]) {   // -1: NW edge, +1: NE edge
          for (const f of [0.2, 0.55, 0.9]) {
            const mx = lx + dir * (TW / 2) * f, my = ly - TH / 2 - cwh + (TH / 2) * f;
            g.fillStyle = tint(dir < 0 ? '#8d959a' : '#9aa2a6', wear);
            g.fillRect(mx - 4, my - 7, 8, 8);
            g.strokeStyle = '#545b5f88'; g.strokeRect(mx - 4, my - 7, 8, 8);
          }
        }
        continue;
      }
      // Building walls draw as THIN slabs — a third of a tile across — that
      // follow the wall's run, so rooms stop reading as solid cubes. Corner
      // tiles draw both runs (their union forms the corner); collision keeps
      // the full tile. Only the castle curtain wall above stays massive.
      const P = (u, v, dz = 0) => [lx + (u - v) * TW / 2, ly - TH / 2 + (u + v) * TH / 2 - dz];
      const wl = (dx2, dy2) => WALLS.has(tileAtPlane(plane, x + dx2, y + dy2));
      const wlE = wl(1, 0), wlW = wl(-1, 0), wlN = wl(0, -1), wlS = wl(0, 1);
      const th3 = 1 / 3, a3 = 0.5 - th3 / 2, b3 = 0.5 + th3 / 2;
      const slabs = [];
      // Each tile grows a thin arm from the centre out to ONLY the sides that
      // actually have a wall neighbour: a straight run is one band, a corner is
      // a clean L at the same slab thickness (no fat full-tile block, and no stub
      // poking into the exterior), so every joint lines up.
      const horiz = wlE || wlW, vert = wlN || wlS;
      const uLo = wlW ? 0 : a3, uHi = wlE ? 1 : b3;
      const vLo = wlN ? 0 : a3, vHi = wlS ? 1 : b3;
      if (horiz) slabs.push([uLo, uHi, a3, b3]);
      if (vert) slabs.push([a3, b3, vLo, vHi]);
      if (!horiz && !vert) slabs.push([a3, b3, a3, b3]);
      const quad = (pts) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let q = 1; q < pts.length; q++) g.lineTo(pts[q][0], pts[q][1]); g.closePath(); };
      const adobe = !stone && regionAt(x, y) === 'DESERT';
      for (const [u0, u1, v0, v1] of slabs) {
        const sFaceL = () => quad([P(u0, v1), P(u1, v1), P(u1, v1, wh), P(u0, v1, wh)]);
        const sFaceR = () => quad([P(u1, v0), P(u1, v1), P(u1, v1, wh), P(u1, v0, wh)]);
        const sCap = () => quad([P(u0, v0, wh), P(u1, v0, wh), P(u1, v1, wh), P(u0, v1, wh)]);
        const oL = P(u0, v1)[0], oR = P(u1, v0)[0];
        if (wallStyle === 'cobble') {
          g.fillStyle = tint('#6b6860', wear); sFaceL(); g.fill();
          g.fillStyle = tint('#838078', wear); sFaceR(); g.fill();
          // rounded river cobbles packed in mortar
          for (const spec of [[sFaceL, oL, 0], [sFaceR, oR, 1]]) {
            g.save(); spec[0](); g.clip();
            const rnd = mulberry(x * 131 + y * 977 + spec[2]);
            for (let i = 0; i < 12; i++) {
              const px3 = spec[1] + rnd() * (TW / 2), py3 = ly - wh + 3 + rnd() * (wh + TH / 2 - 8);
              const rw = 4 + rnd() * 4, rh2 = 3 + rnd() * 3;
              const c3 = ['#918e86', '#7b786f', '#9c9992', '#868378'][(rnd() * 4) | 0];
              g.fillStyle = c3;
              g.beginPath(); g.ellipse(px3, py3, rw / 2, rh2 / 2, 0, 0, 7); g.fill();
              g.strokeStyle = '#4f4c45aa'; g.lineWidth = 0.8; g.stroke();
            }
            g.restore();
          }
          g.fillStyle = tint('#9a978e', wear); sCap(); g.fill();
          g.strokeStyle = '#00000030'; g.lineWidth = 1; g.stroke();
        } else if (adobe) {
          // Sunfall Sands adobe: cream plaster, protruding beams, flat cap
          g.fillStyle = tint('#c8b490', wear); sFaceL(); g.fill();
          g.fillStyle = tint('#e0cda6', wear); sFaceR(); g.fill();
          for (const spec of [[sFaceL, oL], [sFaceR, oR]]) {
            g.save(); spec[0](); g.clip();
            g.fillStyle = '#6a4a26';
            for (let i = 0; i < 4; i++) { const bx = spec[1] + 5 + i * (TW / 8), by = ly - wh + 8 + (i * TH / 16); g.fillRect(bx, by, 4, 3); }
            g.restore();
          }
          g.fillStyle = tint('#d8c49a', wear); sCap(); g.fill();
          g.strokeStyle = '#00000022'; g.lineWidth = 1; g.stroke();
        } else if (stone) {
          g.fillStyle = tint('#565248', wear); sFaceL(); g.fill();
          g.fillStyle = tint('#6e6a5e', wear); sFaceR(); g.fill();
          // masonry courses + staggered joints on both faces
          for (const spec of [[sFaceL, oL], [sFaceR, oR]]) {
            g.save(); spec[0](); g.clip();
            g.strokeStyle = '#00000040'; g.lineWidth = 1;
            for (let row = 1; row < 5; row++) {
              const yy = ly - wh + row * (wh / 5);
              g.beginPath(); g.moveTo(spec[1], yy); g.lineTo(spec[1] + TW / 2, yy + TH / 4); g.stroke();
              const jx = spec[1] + (TW / 2) * (row % 2 ? 0.33 : 0.66);
              g.beginPath(); g.moveTo(jx, yy - wh / 5 + 3); g.lineTo(jx, yy + 3); g.stroke();
            }
            g.restore();
          }
          g.fillStyle = tint('#a09a88', wear); sCap(); g.fill();
          g.strokeStyle = '#00000030'; g.lineWidth = 1; g.stroke();
        } else {
          // timber: dark posts + diagonal brace over lime-washed wattle panels
          g.fillStyle = tint('#4c381e', wear); sFaceL(); g.fill();
          g.fillStyle = tint('#5e462a', wear); sFaceR(); g.fill();
          for (const spec of [[sFaceL, oL, 1], [sFaceR, oR, -1]]) {
            g.save(); spec[0](); g.clip();
            g.strokeStyle = '#3c2c14'; g.lineWidth = 2.2;
            g.beginPath(); g.moveTo(spec[1], ly - wh + 2); g.lineTo(spec[1], ly + TH / 2); g.stroke();
            g.beginPath(); g.moveTo(spec[1], ly - wh + 6); g.lineTo(spec[1] + spec[2] * TW / 2, ly - wh / 2.6); g.stroke();
            g.restore();
          }
          // thatched roof cap with straw striations
          g.fillStyle = tint('#a8843c', wear); sCap(); g.fill();
          g.save(); sCap(); g.clip();
          g.strokeStyle = '#7d613566'; g.lineWidth = 1;
          for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(lx + i * 7, ly - TH / 2 - wh); g.lineTo(lx + i * 7 - TW / 4, ly + TH / 2 - wh); g.stroke(); }
          g.restore();
        }
      }
    }
  }
  // ---- de-grid detail scatter: deterministic tufts/pebbles that spill across
  // tile seams so the diamond tessellation stops reading as a grid (overworld
  // vegetated ground only; walls/water/dungeon skip it) ----
  if (plane === PLANE.OVERWORLD) {
    const GROUNDY = { [TILE.GRASS]: ['#4f7d33', '#7cb14e'], [TILE.MEADOW]: ['#5f923a', '#8ac04e'], [TILE.FOREST]: ['#3c6427', '#5a8a38'], [TILE.DEEPFOREST]: ['#335821', '#4a7a2c'], [TILE.JUNGLE]: ['#2f5c22', '#4a7a34'], [TILE.SWAMP]: ['#49573c', '#5f7048'], [TILE.DIRT]: ['#8a6f45', '#a0855a'], [TILE.SAND]: ['#c9b06a', '#ddc888'], [TILE.TUNDRA]: ['#999c7a', '#b2b48f'] };
    for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) {
      const x = cx * CH + i, y = cy * CH + j;
      const t = tileAtPlane(plane, x, y);
      const pal = GROUNDY[t];
      if (!pal) continue;
      const h = chunkElev(plane, x, y);
      const lx = (i - j) * TW / 2 + ox;
      const ly = (i + j) * TH / 2 + oy + TH / 2 - h * ESTEP;
      // 3 specks per tile, hashed positions that push past the diamond edges
      for (let s = 0; s < 3; s++) {
        const r1 = hashXY(x * 3 + s, y * 7 - s), r2 = hashXY(x * 11 - s, y * 5 + s), r3 = hashXY(x + s * 97, y + s * 41);
        const px = lx + (r1 - 0.5) * TW * 0.9;
        const py = ly + (r2 - 0.5) * TH * 1.5;
        g.globalAlpha = 0.5 + r3 * 0.4;
        g.fillStyle = pal[r3 > 0.5 ? 1 : 0];
        if (t === TILE.GRASS || t === TILE.MEADOW || t === TILE.FOREST || t === TILE.DEEPFOREST || t === TILE.JUNGLE) {
          // little grass tuft: two short blades
          g.fillRect(px | 0, (py - 2) | 0, 1, 3);
          if (r3 > 0.4) g.fillRect((px + 1) | 0, (py - 1) | 0, 1, 2);
        } else {
          g.fillRect(px | 0, py | 0, r3 > 0.7 ? 2 : 1, 1); // pebble/grain fleck
        }
      }
    }
    g.globalAlpha = 1;
  }
  // ---- abyssal dungeon: scatter undead decor (graves, bones, dead trees,
  // ruins, thorns) across the cave floor for atmosphere ----
  if (plane >= PLANE.DUNGEON_BASE) {
    const decor = MEDIA.sheets?.undeadDecor;
    if (decor && decor.length) {
      for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) {
        const x = cx * CH + i, y = cy * CH + j;
        if (tileAtPlane(plane, x, y) !== TILE.CAVE) continue;
        const r = hashXY(x * 13 + 5, y * 29 - 7);
        if (r > 0.09) continue;                       // ~9% of floor tiles get a prop
        const pick = decor[(hashXY(x * 7, y * 3) * decor.length) | 0];
        const im = mimg(pick.file);
        if (!im) continue;
        const lx = (i - j) * TW / 2 + ox;
        const ly = (i + j) * TH / 2 + oy + TH / 2;
        const big = pick.w >= 128;
        const s = big ? 0.42 : pick.w >= 64 ? 0.6 : 1;   // scale 128s down, keep small props
        const dw = pick.w * s, dh = pick.h * s;
        g.imageSmoothingEnabled = false;
        g.drawImage(im, lx - dw / 2, ly - dh + 6, dw, dh);
      }
    }
  }
  c = { canvas, top, water };
  chunkCache.set(key, c);
  // dungeon chunks re-render until the undead decor + geo sheets stream in
  if (plane >= PLANE.DUNGEON_BASE && MEDIA.sheets?.undeadDecor?.length && !mimg(MEDIA.sheets.undeadDecor[0].file)) chunkCache.delete(key);
  // dungeon chunks re-render until the geo sheets finish streaming in
  if (plane >= PLANE.DUNGEON_BASE && !(MEDIA.sheets?.geo_tiles && mimg(MEDIA.sheets.geo_tiles.file))) chunkCache.delete(key);
  return c;
}

// ---- main draw -----------------------------------------------------------------
// The Map Studio re-renders through this module after live edits: dropping the
// baked chunks forces the next frame to rebake against the new overrides.
export function flushChunkCache() { chunkCache.clear(); }
// Re-bake just the chunk containing (x,y) plus its ring — used by the Map
// Studio to show a single painted tile's real terrain without clearing all
// bakes. The ring covers cliff skirts and wall runs that spill across seams.
export function flushChunkAt(plane, x, y) {
  const cx = Math.floor(x / CH), cy = Math.floor(y / CH);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
    chunkCache.delete(plane + ':' + (cx + dx) + ',' + (cy + dy));
}

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
    // once the undead decor sheets finish streaming in, drop chunks cached
    // before they were ready so the decor actually appears (one-time)
    if (!_decorReady) {
      const decor = MEDIA.sheets?.undeadDecor;
      if (decor && decor.length && decor.every(d => mimg(d.file))) { chunkCache.clear(); _decorReady = true; }
    }
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
    // season rollover: re-bake ground textures and chunks in the new palette
    const sn = seasonNow();
    if (this._seasonStamp !== sn) { this._seasonStamp = sn; texCache.clear(); chunkCache.clear(); }

    // ---- terrain chunks ----
    const [camSX, camSY] = toScreen(this.cam.x, this.cam.y);
    const originX = W / 2 - camSX, originY = H / 2 - camSY + this._camE;
    const corners = [[0, 0], [W, 0], [0, H], [W, H]].map(([sx, sy]) => toTile(sx - originX, sy - originY));
    const elevPad = this._elevOn ? MAX_ELEV * 2 : 0; // elevated tiles from "below" the view poke upward
    const minX = Math.min(...corners.map(c => c[0])) - 3, maxX = Math.max(...corners.map(c => c[0])) + 3 + elevPad;
    const minY = Math.min(...corners.map(c => c[1])) - 3, maxY = Math.max(...corners.map(c => c[1])) + 6 + elevPad;
    const c0x = Math.floor(minX / CH), c1x = Math.floor(maxX / CH);
    const c0y = Math.floor(minY / CH), c1y = Math.floor(maxY / CH);
    let bridgeStamp = null;   // castle bridge model screen pos, drawn after all water
    for (let cy = c0y; cy <= c1y; cy++) for (let cx = c0x; cx <= c1x; cx++) {
      const cc = chunkCanvas(plane, cx, cy);
      const [bx, by] = toScreen(cx * CH, cy * CH);
      const cox = originX + bx - CH * TW / 2, coy = originY + by - cc.top;
      ctx.drawImage(cc.canvas, cox, coy);
      // live water: shimmer frames + foam lapping the shore edges
      if (cc.water && cc.water.length) {
        const foam = foamFrames();
        for (const w of cc.water) {
          const sx = cox + w.lx - TW / 2, sy = coy + w.ly - TH / 2;
          if (sx < -TW || sy < -TH - (w.drop || 0) * ESTEP || sx > W || sy > H) continue;
          if (w.bridge) {   // flowing channel water, with the deck relaid on top
            ctx.drawImage(waterAnim(TILE.RIVER)[((now / 260 + w.ph) | 0) & 3], sx, sy + 9);
            if (isCastleBridge(w.x, w.y)) {
              // the castle causeway is the single OGA arched stone-bridge model. It
              // is stamped AFTER all water (see bridgeStamp below) so the moat flows
              // cleanly under the arch and no neighbouring water tile paints over it.
              // Until the image streams in, fall back to the procedural stone deck.
              const bim = mimg('overhaul/bridge_stone.png');
              if (bim && bim.complete && bim.naturalWidth) {
                if (castleBridgeAnchorAt(w.x, w.y)) bridgeStamp = { x: cox + w.lx, y: coy + w.ly };
              } else {
                drawBridge(ctx, cox + w.lx, coy + w.ly, w.x, w.y, plane);
              }
            } else {
              drawBridge(ctx, cox + w.lx, coy + w.ly, w.x, w.y, plane);
            }
            continue;
          }
          ctx.drawImage(waterAnim(w.t)[((now / 260 + w.ph) | 0) & 3], sx, sy);
          // LPC ripple crests drifting over the open water
          const sp = MEDIA.sheets?.water_sparkle;
          if (sp) {
            const si = mimg(sp[((now / 320 + w.ph) | 0) & 3]);
            if (si && si.complete && si.naturalWidth) ctx.drawImage(si, sx, sy);
          }
          if (w.em) {
            const f2 = ((now / 430 + w.ph) | 0) & 1;
            for (let e = 0; e < 4; e++) if (w.em & (1 << e)) ctx.drawImage(foam[e][f2], sx, sy);
          }
          if (w.drop) {   // pouring waterfall down the cliff face
            const ff = ((now / 90 + w.ph) | 0) & 7;
            // One clipped column per EXTERNAL face: left half where the SW
            // neighbour sits lower, right half where the SE one does. Internal
            // faces (same-level water in front) get no curtain at all.
            for (const [side, d] of [[0, w.dl], [1, w.dr]]) {
              if (!d) continue;
              ctx.save(); ctx.beginPath();
              ctx.rect(sx + side * TW / 2, sy, TW / 2, (d + 1) * ESTEP + TH * 2);
              ctx.clip();
              // k=0 is the spilling tile's own crest — the band right under
              // the river lip — then the cliff segments, ending in the plunge
              for (let k = 0; k <= d; k++) {
                const kind = k === 0 ? 'top' : k === d ? 'base' : 'mid' + (k & 1);
                ctx.drawImage(fallAnim(kind)[ff], sx, sy + k * ESTEP);
              }
              ctx.restore();
            }
          }
          // whitewater boils across every pool tile within a block of the falls
          if (w.churn) ctx.drawImage(fallAnim('splash')[((now / 90 + w.ph) | 0) & 7], sx, sy);
        }
      }
    }

    // Castle bridge model — stamped AFTER every water tile so the moat animation
    // flows cleanly under the arch and no neighbouring water paints over the deck.
    if (bridgeStamp) {
      const bim = mimg('overhaul/bridge_stone.png');
      const bw = 300, bh = bw * bim.naturalHeight / bim.naturalWidth;
      ctx.drawImage(bim, bridgeStamp.x - bw / 2, bridgeStamp.y - bh * 0.6, bw, bh);
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
    } else if (plane <= -10) {
      // studio level: the glowing exit pad by the south wall carries you out,
      // and every studio-placed node stands ready to gather
      const lv = customLevel(-10 - plane);
      if (lv) {
        const en = levelEntry(lv);
        drawables.push({ d: en.x + en.y + 0.5, node: { type: 'cave_exit_pad', x: en.x, y: en.y } });
        for (const [k, t] of Object.entries(lv.nodes || {})) {
          const [nx, ny] = k.split(',').map(Number);
          drawables.push({ d: nx + ny + 0.5, node: { type: t, x: nx, y: ny, off: depletedNodes.has(k) } });
        }
      }
    } else if (plane >= PLANE.CASTLE_BASE) {
      const L = castleLadders(plane);
      drawables.push({ d: L.down.x + L.down.y + 0.5, node: { type: 'dungeon_entrance', x: L.down.x, y: L.down.y } });
      if (L.up) drawables.push({ d: L.up.x + L.up.y + 0.5, node: { type: 'dungeon_entrance', x: L.up.x, y: L.up.y } });
    } else if (plane >= PLANE.DUNGEON_BASE) {
      const f = dungeonFloor(plane - PLANE.DUNGEON_BASE);
      drawables.push({ d: f.entrance.x + f.entrance.y + 0.5, node: { type: 'dungeon_entrance', x: f.entrance.x, y: f.entrance.y } });
      drawables.push({ d: f.exit.x + f.exit.y + 0.5, node: { type: 'obelisk', x: f.exit.x, y: f.exit.y, exit: true } });
    } else if (plane >= PLANE.HOUSE_BASE && state.houseFurniture) {
      for (const h of HOUSE.hotspots) {
        drawables.push({ d: h.x + h.y + 0.5, node: { type: state.houseFurniture[h.id] ? 'furn_' + h.id : 'hotspot', x: h.x, y: h.y, hot: h.id } });
      }
      drawables.push({ d: HOUSE.door.x + HOUSE.door.y + 1.5, node: { type: 'house_portal', x: HOUSE.door.x, y: HOUSE.door.y + 1, exitHouse: true } });
      // the garden beds: planted crops rise through their LPC growth stages
      for (const gp of HOUSE.garden) {
        const st = state.houseGarden && state.houseGarden[gp.x + ',' + gp.y];
        if (st) drawables.push({ d: gp.x + gp.y + 0.5, node: { type: 'crop', x: gp.x, y: gp.y, crop: st.crop, t0: st.t0, growMs: st.growMs } });
      }
    }

    drawables.sort((a, b) => a.d - b.d);
    // light-bearing props remember their screen spots so night can kindle them
    const LIGHTS = { lamp_post: [46, 1.0], campfire: [10, 1.15], furnace: [16, 0.55], forge: [16, 0.55] };
    this._lights = [];
    for (const dr of drawables) {
      if (dr.node) {
        this.drawNode(ctx, dr.node, now);
        const li = plane === PLANE.OVERWORLD && LIGHTS[dr.node.type];
        if (li) {
          const [lx, ly] = this.screenOf(plane, dr.node.x + 0.5, dr.node.y + 0.5);
          this._lights.push([lx, ly - li[0], li[1]]);
        }
      } else this.drawEntity(ctx, dr.ent, now, state);
    }

    // ---- building roofs: complete pitched roofs over town buildings, drawn on
    // top of everything, that fade out as the player steps inside/adjacent so
    // the interior (floor, stalls, shopkeeper) is revealed ----
    if (plane === PLANE.OVERWORLD) this.drawRoofs(ctx, me, now);

    // ---- fx layer ----
    fx.draw(ctx, this, now);

    // ---- ambient: the shared environmental clock — every client renders the
    // same sky from wall time alone (R.envOverride = {dark, weather} to force) ----
    if (plane === PLANE.OVERWORLD) {
      const ov = this.envOverride || {};
      const wall = Date.now();
      const dark = ov.dark ?? dayPhase(wall).dark;
      const reg = regionAt(me.rx | 0, me.ry | 0);
      const snowy = reg === 'WILDLANDS' || reg === 'NORTHMOOR' || reg === 'FROSTHOLLOW';
      const wx = ov.weather ?? weatherAt((me.rx | 0) >> 6, (me.ry | 0) >> 6, wall);
      // night falls deep blue; cloud cover steals some light even at noon
      const gloom = Math.min(0.62, dark * 0.52 + (wx === 'storm' ? 0.22 : wx === 'rain' ? 0.12 : 0));
      if (gloom > 0.01) { ctx.fillStyle = `rgba(9,13,42,${gloom.toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
      // after dark, lamplight leaks from every doorway and window in town
      if (gloom > 0.18) {
        for (const tn of Object.values(TOWNS)) {
          for (const b of tn.buildings || []) {
            if (Math.abs(b.x - me.rx) > 40 || Math.abs(b.y - me.ry) > 40) continue;
            const mid = { S: [b.x + b.w / 2, b.y + b.h], N: [b.x + b.w / 2, b.y], E: [b.x + b.w, b.y + b.h / 2], W: [b.x, b.y + b.h / 2] }[b.door] || [b.x + b.w / 2, b.y + b.h];
            const [wx, wy] = this.screenOf(0, mid[0], mid[1]);
            this._lights.push([wx, wy - 22, 0.75]);
          }
        }
      }
      // lamps, campfires and forges kindle against the dark, guttering gently
      if (gloom > 0.18 && this._lights?.length) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (const [lx, ly, inten] of this._lights) {
          if (lx < -90 || ly < -90 || lx > W + 90 || ly > H + 90) continue;
          const fl = inten * (gloom / 0.62) * (0.42 + 0.07 * Math.sin(now / 91 + lx) + 0.05 * Math.sin(now / 47 + ly));
          const r = 88 * inten;
          const g2 = ctx.createRadialGradient(lx, ly, 0, lx, ly, r);
          g2.addColorStop(0, `rgba(255,196,102,${Math.min(0.5, fl).toFixed(3)})`);
          g2.addColorStop(1, 'rgba(255,150,50,0)');
          ctx.fillStyle = g2; ctx.fillRect(lx - r, ly - r, r * 2, r * 2);
        }
        ctx.restore();
      }
      // dusk and dawn blush warm at the heart of the transition
      const warm = Math.sin(Math.min(1, Math.max(0, dark)) * Math.PI) * 0.12;
      if (warm > 0.01 && wx === 'clear') {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255,120,40,${warm.toFixed(3)})`; ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
      // precipitation: the frozen north always snows softly; elsewhere the
      // weather fronts decide, and cold regions turn their rain to snow
      if (snowy) this.drawSnow(ctx, W, H, now);
      else if (wx !== 'clear') this.drawRain(ctx, W, H, now, wx === 'storm');
      // storm lightning: rare deterministic flashes, thunder rolls behind them
      if (wx === 'storm') {
        const cell = Math.floor(wall / 3400);
        let h = (cell * 2654435761) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
        if ((h & 7) === 3) {
          const tIn = wall % 3400;
          if (tIn < 160) {
            ctx.fillStyle = `rgba(235,240,255,${(0.28 * (1 - tIn / 160)).toFixed(3)})`;
            ctx.fillRect(0, 0, W, H);
            if (this.onThunder && this._thunderCell !== cell) { this._thunderCell = cell; this.onThunder(); }
          }
        }
      }
    }
    if (plane >= PLANE.DUNGEON_BASE) { // gentle cave gloom, torch-lit near the player
      const grad = ctx.createRadialGradient(W / 2, H / 2, 220, W / 2, H / 2, Math.max(W, H) / 1.25);
      grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    }
    if (plane <= -10) { // studio caves: deep darkness, a guttering torch about you
      const grad = ctx.createRadialGradient(W / 2, H / 2, 90, W / 2, H / 2, Math.max(W, H) / 1.6);
      grad.addColorStop(0, 'rgba(4,3,10,0)'); grad.addColorStop(1, 'rgba(4,3,10,0.78)');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
      const fl = 0.05 + 0.025 * Math.sin(now / 87) + 0.015 * Math.sin(now / 41);
      const warm = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 130);
      warm.addColorStop(0, `rgba(255,178,84,${fl.toFixed(3)})`); warm.addColorStop(1, 'rgba(255,178,84,0)');
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = warm; ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    return { minX, maxX, minY, maxY };
  }

  drawRain(ctx, W, H, now, storm) {
    if (!this.rainP) {
      this.rainP = [];
      for (let i = 0; i < 260; i++) this.rainP.push({ x: Math.random() * (W + 80), y: Math.random() * H, v: 520 + Math.random() * 260, l: 9 + Math.random() * 7 });
    }
    const n = storm ? this.rainP.length : (this.rainP.length * 0.55) | 0;
    ctx.save();
    ctx.strokeStyle = storm ? 'rgba(190,205,255,0.42)' : 'rgba(175,195,235,0.30)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const p = this.rainP[i];
      const y = (p.y + now / 1000 * p.v) % (H + 30) - 15;
      const x = (p.x - y * 0.18 + W * 3) % (W + 80) - 40;
      ctx.moveTo(x, y); ctx.lineTo(x - p.l * 0.18, y + p.l);
    }
    ctx.stroke();
    ctx.restore();
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
    // studio-placed pack props: 'prop:<pack>:<idx>' — a standalone decor file
    // (undeadDecor) or one cell of a grid sheet (geo_objects, geo_rocks)
    if (node.type.startsWith('prop:')) {
      const [, pack, is] = node.type.split(':');
      const sh = MEDIA.sheets?.[pack];
      if (!sh) return;
      const idx = +is || 0;
      ctx.fillStyle = '#00000030';
      ctx.beginPath(); ctx.ellipse(sx, sy + 6, 15, 5, 0, 0, 7); ctx.fill();
      if (Array.isArray(sh)) {
        const e = sh[idx]; const im = e && mimg(e.file);
        if (im && im.complete && im.naturalWidth) {
          const s = 2;   // 32px pack art reads right at 2x on the 64px tile
          ctx.drawImage(im, sx - (e.w * s) / 2, sy - e.h * s + 10, e.w * s, e.h * s);
        }
      } else {
        const im = mimg(sh.file);
        if (im && im.complete && im.naturalWidth) {
          const cw = sh.cellW || sh.cell || 32, ch = sh.cellH || sh.cell || 32;
          const cols = sh.cols || Math.max(1, (sh.w / cw) | 0);
          const cx = (idx % cols) * cw, cy = ((idx / cols) | 0) * ch;
          const s = cw >= 256 ? 0.6 : cw >= 128 ? 0.8 : 2;
          ctx.drawImage(im, cx, cy, cw, ch, sx - (cw * s) / 2, sy - ch * s + 12, cw * s, ch * s);
        }
      }
      return;
    }
    // a growing garden crop: pick the LPC stage sprite by elapsed grow time
    if (node.type === 'crop' && MEDIA.sheets?.crops?.[node.crop]) {
      const stages = MEDIA.sheets.crops[node.crop];
      const t = Math.max(0, Math.min(1, (Date.now() - node.t0) / (node.growMs || 60000)));
      const im = mimg(stages[Math.min(stages.length - 1, Math.floor(t * stages.length))]);
      if (im && im.complete && im.naturalWidth) {
        ctx.drawImage(im, sx - 20, sy - 34, 40, 40);
        if (t >= 1) {  // ripe: a soft golden shimmer says "harvest me"
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.25 + 0.15 * Math.sin(now / 300 + node.x);
          const gr = ctx.createRadialGradient(sx, sy - 14, 0, sx, sy - 14, 20);
          gr.addColorStop(0, '#ffe27a'); gr.addColorStop(1, '#ffe27a00');
          ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sx, sy - 14, 20, 0, 7); ctx.fill();
          ctx.restore();
        }
      }
      return;
    }
    // a timber ladder bolted to the cliff face, spanning bottom node to top node
    if (node.type === 'cliff_ladder') {
      let sc = null, bd = 9;
      for (const s of SHORTCUTS) {
        if (s[0] !== 'cliff_ladder') continue;
        const d = Math.min(Math.hypot(s[1] - node.x, s[2] - node.y), Math.hypot(s[3] - node.x, s[4] - node.y));
        if (d < bd) { bd = d; sc = s; }
      }
      if (!sc) return;
      const bottom = sc[2] > sc[4] ? [sc[1], sc[2]] : [sc[3], sc[4]];
      const top = sc[2] > sc[4] ? [sc[3], sc[4]] : [sc[1], sc[2]];
      if (Math.hypot(node.x - bottom[0], node.y - bottom[1]) > 1) return;  // draw once, from the bottom end
      const [bx, by] = this.screenOf(0, bottom[0] + 0.5, bottom[1] + 0.5);
      const [tx, ty] = this.screenOf(0, top[0] + 0.5, top[1] + 0.5);
      const dx = tx - bx, dy = ty - by, len = Math.hypot(dx, dy);
      const ux = dx / len, uy = dy / len;              // along the ladder
      const px2 = -uy, py2 = ux;                       // perpendicular (rail offset)
      ctx.save();
      ctx.lineCap = 'round';
      for (const side of [-6, 6]) {                    // rails
        ctx.strokeStyle = '#6d4f28'; ctx.lineWidth = 3.4;
        ctx.beginPath();
        ctx.moveTo(bx + px2 * side, by - 2 + py2 * side);
        ctx.lineTo(tx + px2 * side + ux * 6, ty - 8 + py2 * side + uy * 6);
        ctx.stroke();
      }
      ctx.strokeStyle = '#8a6836'; ctx.lineWidth = 2.4;
      const steps = Math.max(3, (len / 9) | 0);
      for (let i = 1; i < steps; i++) {                // rungs
        const rx = bx + ux * (len * i / steps), ry = by - 2 + uy * (len * i / steps) - 3;
        ctx.beginPath();
        ctx.moveTo(rx - px2 * 6, ry - py2 * 6);
        ctx.lineTo(rx + px2 * 6, ry + py2 * 6);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    // the smith's forge roars with a live fire: 4-frame LPC forge animation
    if (node.type === 'furnace' && MEDIA.sheets?.forge) {
      const f = MEDIA.sheets.forge, im = mimg(f.file);
      if (im && im.complete && im.naturalWidth) {
        const fi = 1 + Math.floor(now / 220) % 3;                 // frames 1-3 are lit
        ctx.drawImage(im, fi * f.cellW, 0, f.cellW, f.cellH, sx - 30, sy - 52, 60, Math.round(60 * f.cellH / f.cellW));
        return;
      }
    }
    // town-square fountain: a live 16-frame stone fountain, water spilling over
    // two tiers. Cell is 384² (fountain in the upper half, streams below); we draw
    // it ~2 tiles wide, anchored so the basin foot sits on the plaza.
    if (node.type === 'fountain' && MEDIA.sheets?.fountain) {
      const f = MEDIA.sheets.fountain, im = mimg(f.file);
      if (im && im.complete && im.naturalWidth) {
        const fi = Math.floor(now / 90) % f.frames;
        const col = fi % f.cols, row = (fi / f.cols) | 0;
        const dw = 132, dh = 132;
        ctx.drawImage(im, col * f.cellW, row * f.cellH, f.cellW, f.cellH, sx - dw / 2, sy - dh * 0.74, dw, dh);
        return;
      }
    }
    // teleport lodestone: a stone waystone ring (frames 0..4 = dormant → lit blue
    // portal, 128x64 stacked vertically). State-driven, NOT a loop: an UNVISITED
    // stone is dark (frame 0, no glow); the FIRST time the player attunes it the
    // portal lights up once (frames 0→4); an attuned stone then stays permanently
    // lit. Attunement = this town's key in G.self.lodestones (set on proximity).
    if (node.type === 'lodestone') {
      const im = mimg('overhaul/lodestone.png');
      if (im && im.complete && im.naturalWidth) {
        let key = null;
        for (const k of ['loxley', 'nottingham', 'bay', 'frosthollow']) {
          const a = ANCHORS[k];
          if (a && Math.abs(a.x - node.x) <= 3 && Math.abs(a.y - node.y) <= 3) { key = k; break; }
        }
        const attuned = !!key && (window.G?.self?.lodestones || []).includes(key);
        const w = 92, h = 46, dy = sy - h * 0.6;
        let fr = 0, glow = 0;
        if (attuned) {
          if (!_lodeLit.has(key)) _lodeLit.set(key, now);        // begin the one-shot light-up
          const el = now - _lodeLit.get(key), STEP = 130;
          fr = Math.min(4, Math.floor(el / STEP));               // play 0→4 once, then hold at 4
          glow = fr < 4 ? 0.08 + fr * 0.08 : 0.26 + 0.16 * Math.sin(now / 340);  // steady breathing once lit
        }
        if (glow > 0) {   // dormant stones draw no arcane light at all
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = `rgba(70,150,255,${glow.toFixed(3)})`;
          ctx.beginPath(); ctx.ellipse(sx, dy + h * 0.45, w * 0.28, h * 0.28, 0, 0, 7); ctx.fill();
          ctx.restore();
        }
        ctx.drawImage(im, 0, fr * 64, 128, 64, sx - w / 2, dy, w, h);
        return;
      }
    }
    if (node.type === 'ge_counter') { this.drawGEcounter(ctx, sx, sy, false, node.x, node.y); return; }
    if (node.type === 'ge_window') { this.drawGEcounter(ctx, sx, sy, true, node.x, node.y); return; }
    if (node.type === 'ge_rope') { this.drawGErope(ctx, sx, sy, node.x, node.y); return; }
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
    // LPC tree art (media.trees) draws the standing tree; depleted nodes fall
    // through to the procedural stump, as do trees whose image is still loading
    const tm = !node.off && MEDIA.trees?.[type];
    if (tm) {
      const tim = mimg(tm.file);
      if (tim && tim.complete && tim.naturalWidth) {
        ctx.drawImage(tim, sx - tm.w / 2, sy - tm.h + 14);
        return;
      }
    }
    // studio cave gates share the abyss-mouth art; the exit pad glows softly
    if (type.startsWith('cave_gate:')) { ctx.drawImage(nodeSprite('dungeon_entrance'), sx - 32, sy - 64); return; }
    if (type === 'cave_exit_pad') {
      const pulse = 0.35 + 0.2 * Math.sin(now / 400);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(140,220,255,${pulse.toFixed(3)})`;
      ctx.beginPath(); ctx.ellipse(sx, sy, 22, 11, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(200,240,255,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(sx, sy, 15, 7.5, 0, 0, 7); ctx.stroke();
      ctx.restore();
      return;
    }
    // fishing spots: a live, quietly bubbling patch of water
    if (/_spot$/.test(type)) { this.drawFishingSpot(ctx, sx, sy, node, now); return; }
    const spr = nodeSprite(type, node.off);
    ctx.drawImage(spr, spr.width === 96 ? sx - 48 : sx - 32, spr.width === 96 ? sy - 112 : sy - 64);
  }
  // Subtle bubbling marks a fishing spot: slow expanding ripple rings and a
  // handful of small bubbles that rise a touch and fade — clean, no froth.
  drawFishingSpot(ctx, sx, sy, node, now) {
    const seed = (node.x * 31 + node.y * 17) % 97;
    ctx.save();
    ctx.lineWidth = 1.8;
    for (let i = 0; i < 2; i++) {   // two staggered ripples, expanding then gone
      const t = (now / 2100 + i * 0.5 + seed * 0.13) % 1;
      ctx.strokeStyle = `rgba(220,245,255,${(0.6 * (1 - t)).toFixed(3)})`;
      ctx.beginPath(); ctx.ellipse(sx, sy, 4 + t * 14, (4 + t * 14) * 0.45, 0, 0, 7); ctx.stroke();
    }
    for (let i = 0; i < 6; i++) {   // small bubbles surfacing and popping
      const period = 900 + (i % 3) * 320;
      const t = ((now + seed * 211) / period + i * 0.41) % 1;
      const bx = sx + Math.sin(i * 2.4 + seed) * 9;
      const by = sy + 1 - t * 7 + Math.cos(i * 1.7) * 2;
      ctx.fillStyle = `rgba(238,250,255,${(0.9 * (1 - t)).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(bx, by, 1.2 + (i % 3) * 0.8, 0, 7); ctx.fill();
    }
    // a small breaking-surface glint so the spot reads at a glance
    const gp = 0.55 + 0.45 * Math.sin(now / 350 + seed);
    ctx.fillStyle = `rgba(255,255,255,${(0.5 * gp).toFixed(3)})`;
    ctx.fillRect(sx - 1, sy - 2, 3, 2);
    ctx.restore();
  }
  // A one-tile segment of the Grand Exchange teller desk. In a row these tile
  // into a continuous wooden divide; `window` segments add a glazed booth above
  // the counter (semi-transparent, so the clerk standing behind shows through).
  drawGEcounter(ctx, sx, sy, isWindow, x, y) {
    const hw = TW / 2, hh = TH / 2, h = 34;   // a tall wooden divide between clerks and queue
    const N = [sx, sy - hh], E = [sx + hw, sy], S = [sx, sy + hh], W = [sx - hw, sy];
    const up = (p, dz = h) => [p[0], p[1] - dz];
    ctx.save();
    // camera-facing counter faces (SW + SE), then the top
    const face = (a, b, col) => { const at = up(a), bt = up(b); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(bt[0], bt[1]); ctx.lineTo(at[0], at[1]); ctx.closePath(); ctx.fill(); };
    face(W, S, '#573a1c'); face(S, E, '#6a4824');
    // plank seams down the wooden faces
    ctx.strokeStyle = '#3c2712'; ctx.lineWidth = 1;
    for (const [a, b] of [[W, S], [S, E]]) for (let i = 1; i <= 2; i++) { const p = [a[0] + (b[0] - a[0]) * i / 3, a[1] + (b[1] - a[1]) * i / 3]; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0], p[1] - h); ctx.stroke(); }
    const Nt = up(N), Et = up(E), St = up(S), Wt = up(W);
    ctx.fillStyle = '#7d5327'; ctx.beginPath(); ctx.moveTo(Nt[0], Nt[1]); ctx.lineTo(Et[0], Et[1]); ctx.lineTo(St[0], St[1]); ctx.lineTo(Wt[0], Wt[1]); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#33200f'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(S[0], S[1]); ctx.lineTo(St[0], St[1]); ctx.stroke();   // corner seam
    if (isWindow) {
      const gh = 30;
      // glazed panes ONLY on the customer-facing (camera-near, south) faces; the
      // clerk side stays solid timber. Two-wide windows join into one long booth.
      const glass = (a, b) => { const at = up(a), bt = up(b); ctx.fillStyle = 'rgba(150,205,232,0.22)'; ctx.beginPath(); ctx.moveTo(at[0], at[1]); ctx.lineTo(bt[0], bt[1]); ctx.lineTo(bt[0], bt[1] - gh); ctx.lineTo(at[0], at[1] - gh); ctx.closePath(); ctx.fill(); };
      glass(W, S); glass(S, E);
      // gilded frame: corner posts + top beam over the glazing
      ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 2.5;
      for (const t of [Wt, St, Et]) { ctx.beginPath(); ctx.moveTo(t[0], t[1]); ctx.lineTo(t[0], t[1] - gh); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(Wt[0], Wt[1] - gh); ctx.lineTo(St[0], St[1] - gh); ctx.lineTo(Et[0], Et[1] - gh); ctx.stroke();
      // mullion only where this is the LEFT tile of a 2-wide booth (seam hidden mid-booth)
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(St[0] - 6, St[1] - 5); ctx.lineTo(St[0] - 6, St[1] - gh + 5); ctx.stroke();
    }
    ctx.restore();
  }
  // A gilded rope stanchion; the rope drapes to the next post in the lane so the
  // dividers read as continuous velvet ropes rather than isolated stubs.
  drawGErope(ctx, sx, sy, x, y) {
    const h = 24;
    ctx.save();
    ctx.fillStyle = '#00000022'; ctx.beginPath(); ctx.ellipse(sx, sy + 2, 5, 2.5, 0, 0, 7); ctx.fill();
    // draped rope to the next post down the lane (2 tiles south, toward the door)
    if (x !== undefined && computeWorld().nodes.get(x + ',' + (y + 2)) === 'ge_rope') {
      const [nsx, nsy] = this.screenOf(0, x + 0.5, y + 2 + 0.5);
      const mx = (sx + nsx) / 2, my = (sy + nsy) / 2 + 12;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#2e5c2e'; ctx.lineWidth = 3.2;
      ctx.beginPath(); ctx.moveTo(sx, sy - h + 4); ctx.quadraticCurveTo(mx, my - h + 4, nsx, nsy - h + 4); ctx.stroke();
      ctx.strokeStyle = '#4c9a4c'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(sx, sy - h + 3); ctx.quadraticCurveTo(mx, my - h + 3, nsx, nsy - h + 4); ctx.stroke();
    }
    // brass post + finial
    ctx.strokeStyle = '#b8912f'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - h); ctx.stroke();
    ctx.fillStyle = '#e8c84e'; ctx.beginPath(); ctx.arc(sx, sy - h - 2, 4, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(sx - 1.2, sy - h - 3, 1.4, 0, 7); ctx.fill();
    ctx.restore();
  }

  drawEntity(ctx, e, now, state) {
    const [sx, sy] = this.screenOf(e.plane ?? 0, e.rx, e.ry);
    if (sx < -80 || sy < -100 || sx > this.canvas.width + 80 || sy > this.canvas.height + 80) return;

    if (e.k === 'item') {
      // tiny deterministic scatter so items sharing a tile (a death pile) fan into a heap
      const ox = ((e.id * 7) % 7) - 3, oy = ((e.id * 13) % 5) - 2;
      ctx.fillStyle = '#00000030'; ctx.beginPath(); ctx.ellipse(sx, sy + 3, 8, 3, 0, 0, 7); ctx.fill();
      ctx.drawImage(itemIcon(e.item), sx - 10 + ox, sy - 16 + oy, 20, 20);
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

    // cosmetic aura: a looping VFX effect around the wearer, tinted to element.
    // Fitted to the body band (head→feet) and drawn BEFORE the character so it
    // always sits behind the wearer's back; bottom-anchored so fire licks up
    // from the floor instead of floating above the head.
    if (e.aura) {
      const au = typeof e.aura === 'string' ? { fx: e.aura } : e.aura;
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.globalCompositeOperation = 'lighter';   // additive: glows on any ground
      drawFxBand(ctx, au.fx, ((now + (e.id % 89) * 131) % 1600) / 1600, sx, sy - 42 * scale, sy + 9 * scale, au.tint);
      ctx.restore();
    }
    // mount: the beast is drawn under the rider, facing the player's heading.
    // The rider sits still on the saddle — never the walk cycle — and the mount's
    // near flank is re-drawn over the rider's shins so the legs read as astride.
    let lift = 0, mounted = false, mountBob = 0;
    if (e.mnt) {
      mounted = true;
      mountBob = e.mnt.f ? Math.sin(now / 320 + e.id) * 3 + 10 : 0;
      const mh = drawCreature(ctx, e.mnt.s, { id: e.id, dir: e.dir, hp: 1, tint: e.mnt.t, animStart: e.animStart }, e.anim === 'walk' ? 'walk' : 'idle', now, sx, sy - mountBob, e.mnt.sc || 1);
      lift = (mh ? mh * 0.42 : 15) + mountBob;
    }
    const ry = sy - lift;
    // while mounted, the rider holds a fixed seated pose (idle frame 0)
    const rAnim = mounted ? 'idle' : anim;
    const rFrame = mounted ? 0 : frame;

    let sheetH = 0;
    if (e.sheet) {
      // sheet-animated creature (media.json packs); uses raw server anim +
      // its own once-anim timing via e.animStart / e.deathStart
      sheetH = drawCreature(ctx, e.sheet, e, e.anim, now, sx, sy, scale);
    }
    if (!sheetH && e.critter) {
      const dead = e.hp <= 0;
      // map the shared animation set onto the critter's four states
      const cAnim = dead ? 'idle'
        : (anim === 'slash' || anim === 'shoot' || anim === 'spellcast') ? 'attack'
          : anim === 'hurt' ? 'hurt' : anim === 'walk' ? 'walk' : 'idle';
      const spr = critterSprite(e.critter, frame, e.dir ?? 2, cAnim, dead);
      const S = 64 * scale;
      const flip = e.dir === 1; // left-facing critters mirror the right-facing art
      ctx.save();
      if (flip) { ctx.translate(sx, 0); ctx.scale(-1, 1); ctx.translate(-sx, 0); }
      ctx.drawImage(spr, sx - S / 2, sy - S + 14 * scale, S, S);
      ctx.restore();
    } else if (!sheetH && e.vis) {
      const comp = composite(e.vis);
      // enchanted (dragonhide) armour sheds a soft aura the wearer stands in
      const armorGlow = e.vis.torso && e.vis.torso[2];
      if (armorGlow) {
        const ay = ry - 20 * scale, ap = 0.32 + 0.14 * Math.sin(now / 380 + e.id);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ap;
        const gr = ctx.createRadialGradient(sx, ay, 0, sx, ay, 32 * scale);
        gr.addColorStop(0, armorGlow); gr.addColorStop(1, armorGlow + '00');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(sx, ay, 20 * scale, 30 * scale, 0, 0, 7); ctx.fill();
        ctx.restore();
      }
      drawChar(ctx, comp, rAnim, e.dir, rFrame, sx, ry, scale);
      drawOversize(ctx, comp, e.vis, rAnim, e.dir, rFrame, sx, ry, scale);
      // a signature bloom around a glowing (rare/unique) weapon
      const gcol = e.vis.weapon && e.vis.weapon[2];
      if (gcol) {
        const gy = ry - 34 * scale, pulse = 0.6 + 0.25 * Math.sin(now / 300 + e.id);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = pulse;
        const gr = ctx.createRadialGradient(sx, gy, 0, sx, gy, 24 * scale);
        gr.addColorStop(0, gcol); gr.addColorStop(1, gcol + '00');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(sx, gy, 24 * scale, 0, 7); ctx.fill();
        ctx.restore();
      }
      // re-draw the mount's lower body over the rider's legs (seated occlusion)
      if (mounted) {
        const msc = e.mnt.sc || 1;
        ctx.save();
        ctx.beginPath(); ctx.rect(sx - 40 * msc, ry - 8, 80 * msc, 40 * msc); ctx.clip();
        drawCreature(ctx, e.mnt.s, { id: e.id, dir: e.dir, hp: 1, tint: e.mnt.t, animStart: e.animStart }, e.anim === 'walk' ? 'walk' : 'idle', now, sx, sy - mountBob, msc);
        ctx.restore();
      }
    } else if (!sheetH && !e.sheet) {
      ctx.fillStyle = '#888'; ctx.fillRect(sx - 8, sy - 30, 16, 30);
    }

    // crowned royalty: kings without a composited head (sheet + critter
    // bodies) wear the LPC crown floating just above the crown of the head
    if (e.crown && (e.sheet || e.critter) && !e.vis) {
      const ci = mimg('env/crown_gold.png');
      if (ci && ci.complete && ci.naturalWidth) {
        const ch2 = sy - (sheetH ? sheetH * 0.92 : 64 * scale) + 4;
        const cs = Math.max(14, 26 * scale);
        ctx.drawImage(ci, sx - cs / 2, ch2 - cs * 0.7, cs, cs * (ci.naturalHeight / ci.naturalWidth));
      }
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
  // Pitched roofs over town buildings, drawn on top so structures read as
  // complete; each fades as the player steps inside/adjacent, revealing the
  // interior (floor + shopkeeper). Roofs sit on the baked wall prisms.
  // Which hanging trade-sign a shop wears, matched from its name. Houses and
  // unnamed buildings hang nothing.
  shopSignFor(b) {
    const n = (b.name || '').toLowerCase();
    if (!n) return null;
    if (/bank|exchange|vault/.test(n)) return 'sign_bank';
    if (/\binn\b/.test(n)) return 'sign_inn';
    if (/tavern|alehouse|kitchen|brew|meadery/.test(n)) return 'sign_tavern';
    if (/forge|smith|anvil|armou?r/.test(n)) return 'sign_smith';
    if (/fletch|bow|archer|hunt|ranger/.test(n)) return 'sign_fletcher';
    if (/apothecary|herb|alchem|potion|healer/.test(n)) return 'sign_apothecary';
    if (/jewel|gem|goldsmith|amulet/.test(n)) return 'sign_jeweler';
    if (/arms|sword|weapon|blade/.test(n)) return 'sign_arms';
    if (/shop|store|trade|market|mill|fish|tann|craft|rune|magic|stave/.test(n)) return 'sign_blank';
    return null;
  }
  drawRoofs(ctx, me, now) {
    const W = this.canvas.width, H = this.canvas.height;
    for (const town of Object.values(TOWNS)) {
      for (const b of town.buildings) {
        const cxw = b.x + b.w / 2, cyw = b.y + b.h / 2;
        const [ccx, ccy] = this.screenOf(0, cxw, cyw);
        if (ccx < -140 || ccx > W + 140 || ccy < -160 || ccy > H + 160) continue;
        // animated door: closed at rest, swinging open as the player nears —
        // the LPC door sprite sits on the door tile of the wall
        const doorSheet = MEDIA.sheets?.door;
        if (doorSheet) {
          const dim = mimg(doorSheet.file);
          if (dim && dim.complete && dim.naturalWidth) {
            const door = b.door || 'S';
            const ddx = door === 'W' ? b.x : door === 'E' ? b.x + b.w : b.x + b.w / 2;
            const ddy = door === 'N' ? b.y : door === 'S' ? b.y + b.h : b.y + b.h / 2;
            const dd = Math.hypot(me.rx - ddx, me.ry - ddy);
            const open = Math.max(0, Math.min(3, Math.round((2.6 - dd) * 1.6)));   // 0 closed .. 3 wide open
            const [dsx, dsy] = this.screenOf(0, ddx, ddy);
            ctx.drawImage(dim, open * doorSheet.cellW, 0, doorSheet.cellW, doorSheet.cellH, dsx - 17, dsy - 40, 34, 36);
          }
        }
        // hanging trade sign beside the door lintel — players read the shop at
        // a glance. Drawn before the roof fade so it stays up even when the
        // roof melts away as you step inside; sways gently on its bracket.
        const signKey = this.shopSignFor(b);
        if (signKey && MEDIA.trees?.[signKey]) {
          const sim = mimg(MEDIA.trees[signKey].file);
          if (sim && sim.complete && sim.naturalWidth) {
            const door = b.door || 'S';
            const dxw = door === 'W' ? b.x : door === 'E' ? b.x + b.w : b.x + b.w / 2 + 0.9;
            const dyw = door === 'N' ? b.y : door === 'S' ? b.y + b.h : b.y + b.h / 2 + 0.9;
            const [sxp, syp] = this.screenOf(0, dxw, dyw);
            const sway = Math.sin(now / 700 + b.x) * 1.6;
            ctx.save();
            ctx.translate(sxp + sway * 0.2, syp - 38);
            ctx.rotate(sway * 0.03);
            ctx.drawImage(sim, -11, 0, 22, 20);
            ctx.restore();
          }
        }
        // proximity fade: transparent when the player is within the footprint
        // (+1.5 tile porch), opaque again 3 tiles out
        const dx = Math.max(b.x - 1 - me.rx, 0, me.rx - (b.x + b.w) - 0.5);
        const dy = Math.max(b.y - 1 - me.ry, 0, me.ry - (b.y + b.h) - 0.5);
        const edge = Math.hypot(dx, dy);
        const alpha = Math.max(0, Math.min(1, (edge - 0.4) / 3));
        if (alpha < 0.02) continue;                       // fully inside — skip the roof entirely
        const stone = b.castle || b.fortified;   // castles & the fortified Grand Exchange
        const wallH = stone ? 56 : 46;
        // top-of-wall screen corners (elevation already folded into screenOf)
        const P = (wx, wy) => { const [sx, sy] = this.screenOf(0, wx, wy); return [sx, sy - wallH]; };
        const c00 = P(b.x, b.y), c10 = P(b.x + b.w, b.y), c11 = P(b.x + b.w, b.y + b.h), c01 = P(b.x, b.y + b.h);
        const adobeTown = town.adobe;                        // desert roofs are flat sun-baked slabs
        const rise = adobeTown ? 3 : 16 + Math.max(b.w, b.h) * 3.2;
        const apex = [(c00[0] + c11[0]) / 2, (c00[1] + c11[1]) / 2 - rise];
        // eave overhang: push corners slightly outward
        const ov = 5;
        const out = (c, cx2, cy2) => [c[0] + Math.sign(c[0] - cx2) * ov, c[1] + Math.sign(c[1] - cy2) * ov + 2];
        const mx = (c00[0] + c11[0]) / 2, myy = (c00[1] + c11[1]) / 2;
        const e00 = out(c00, mx, myy), e10 = out(c10, mx, myy), e11 = out(c11, mx, myy), e01 = out(c01, mx, myy);
        ctx.save();
        ctx.globalAlpha = alpha;
        const gilded = b.ge;                                 // the ornate Exchange wears a gilded roof
        const roofTop = adobeTown ? '#dcc89e' : gilded ? '#d8b24a' : stone ? '#8a8578' : '#b06a3a';   // near-camera face
        const roofL = adobeTown ? '#c0ac82' : gilded ? '#a8842e' : stone ? '#6e6a5e' : '#8a4f2a';
        const roofR = adobeTown ? '#d0bc92' : gilded ? '#c09a3c' : stone ? '#7a766a' : '#9a5c32';
        const roofBack = adobeTown ? '#b09c74' : gilded ? '#8a6c24' : stone ? '#5e5a50' : '#733f22';
        const kind = adobeTown ? 'tile' : gilded ? 'tile' : stone ? 'slate' : 'thatch';   // roof material
        const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
        const tint = (hex, f) => { const [r, g, bl] = rgb(hex); return `rgb(${Math.min(255, r * f) | 0},${Math.min(255, g * f) | 0},${Math.min(255, bl * f) | 0})`; };
        const L2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        // A hip-roof face is a triangle (eave corner a, eave corner b, apex). We
        // lay courses parallel to the eave and rake tile/thatch joints down each
        // course so the roof reads as a textured surface, not a flat gradient.
        const face = (a, b, col, near) => {
          ctx.save();
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(apex[0], apex[1]); ctx.closePath();
          ctx.fillStyle = col; ctx.fill(); ctx.clip();
          const courses = kind === 'thatch' ? 7 : 5;
          for (let i = 0; i < courses; i++) {
            const t0 = i / courses, t1 = (i + 1) / courses;
            const A0 = L2(a, apex, t0), B0 = L2(b, apex, t0), A1 = L2(a, apex, t1), B1 = L2(b, apex, t1);
            ctx.fillStyle = tint(col, i % 2 ? 0.9 : 1.07);              // alternating course bands
            ctx.beginPath(); ctx.moveTo(A0[0], A0[1]); ctx.lineTo(B0[0], B0[1]); ctx.lineTo(B1[0], B1[1]); ctx.lineTo(A1[0], A1[1]); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = '#0000003a'; ctx.lineWidth = 1.2;         // course shadow (tile lip)
            ctx.beginPath(); ctx.moveTo(A0[0], A0[1]); ctx.lineTo(B0[0], B0[1]); ctx.stroke();
            ctx.strokeStyle = near ? '#ffffff1e' : '#ffffff10'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(A0[0], A0[1] + 1.2); ctx.lineTo(B0[0], B0[1] + 1.2); ctx.stroke();
            const eaveLen = Math.hypot(B0[0] - A0[0], B0[1] - A0[1]);
            if (kind === 'thatch') {                                    // fine straw striations
              const n = Math.max(6, Math.round(eaveLen / 5));
              ctx.strokeStyle = '#0000001a'; ctx.lineWidth = 1;
              for (let j = 1; j < n; j++) { const f = j / n; const p = L2(A0, B0, f), q = L2(A1, B1, f); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); }
            } else {                                                    // staggered tile/slate joints
              const tiles = Math.max(3, Math.round(eaveLen / 9)), off = i % 2 ? 0.5 : 0;
              ctx.strokeStyle = '#00000030'; ctx.lineWidth = 1;
              for (let j = 0; j <= tiles; j++) { const f = (j + off) / tiles; if (f <= 0 || f >= 1) continue; const p = L2(A0, B0, f), q = L2(A1, B1, f); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); }
            }
          }
          ctx.restore();
        };
        // draw far faces first, near faces last (painter's order in iso)
        face(e01, e11, roofBack, false);   // north/back
        face(e00, e01, roofL, false);      // west/left
        face(e10, e11, roofR, false);      // east/right
        face(e00, e10, roofTop, true);     // south/front (toward camera)
        // hip ridges from each eave corner up to the apex
        ctx.strokeStyle = gilded ? '#ffe9a8cc' : stone ? '#b4ae98aa' : '#d0925caa'; ctx.lineWidth = 1.5;
        for (const c of [e00, e10, e11, e01]) { ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(apex[0], apex[1]); ctx.stroke(); }
        ctx.restore();
      }
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
  // — overworld reads the authored node map, caves read their studio level
  const mmLv = plane <= -10 ? customLevel(-10 - plane) : null;
  const mmNode = plane === 0 ? (x, y) => nodes.get(x + ',' + y)
    : mmLv ? (x, y) => mmLv.nodes?.[x + ',' + y] : null;
  if (mmNode) {
    for (let dy = -MM_RANGE; dy <= MM_RANGE; dy++) {
      for (let dx = -MM_RANGE; dx <= MM_RANGE; dx++) {
        const type = mmNode(cx + dx, cy + dy);
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
  // the cave exit pad glows cyan so the way out always reads
  if (mmLv) {
    const en = levelEntry(mmLv);
    const dx = en.x - cx, dy = en.y - cy;
    if (Math.abs(dx) <= MM_RANGE && Math.abs(dy) <= MM_RANGE) {
      const px2 = (dx + MM_RANGE + 0.5) * sc, py2 = (dy + MM_RANGE + 0.5) * sc;
      g.fillStyle = '#7cd6ff';
      g.beginPath(); g.arc(px2, py2, Math.max(2.5, sc * 0.7), 0, 7); g.fill();
      g.strokeStyle = '#ffffffaa'; g.lineWidth = 1; g.stroke();
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
  // Base terrain (the clean flat colouring), with roads/bridges lifted to pale
  // tracks and a faint relief tint that reads without muddying the map.
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const t = tiles[y * WORLD.W + x];
    if (t === TILE.ROAD || t === TILE.BRIDGE) { bg.fillStyle = '#c6ac74'; bg.fillRect(x, y, 1, 1); continue; }
    if (t === TILE.PATH) { bg.fillStyle = '#c4c2bc'; bg.fillRect(x, y, 1, 1); continue; }
    const col = TILE_COLOR[t] || ['#f0f', '#a0a'];
    bg.fillStyle = mixColor(col[0], col[1], smoothNoise(x, y));
    bg.fillRect(x, y, 1, 1);
  }
  // forest canopy stipple: darker specks give woodland texture at this scale
  bg.fillStyle = '#2f5c2299';
  for (const [k, type] of nodes) {
    if (!type.includes('tree')) continue;
    const [x, y] = k.split(',').map(Number);
    bg.beginPath(); bg.arc(x, y, type.includes('yew') || type.includes('maple') ? 1.8 : 1.2, 0, 7); bg.fill();
  }
  // light parchment vignette to frame the edges without dimming the centre
  const grad = bg.createRadialGradient(S / 2, S / 2, S * 0.46, S / 2, S / 2, S * 0.76);
  grad.addColorStop(0, '#00000000'); grad.addColorStop(1, '#2a1c0a26');
  bg.fillStyle = grad; bg.fillRect(0, 0, S, S);
  // wilderness border
  bg.strokeStyle = '#ff5544cc'; bg.setLineDash([6, 4]); bg.lineWidth = 2;
  bg.beginPath(); bg.moveTo(0, WILDERNESS_Y); bg.lineTo(S, WILDERNESS_Y); bg.stroke();
  bg.setLineDash([]);
  _worldMapBase = base;
  return base;
}
export { TILE_COLOR, MM_RANGE };

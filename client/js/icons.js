// Item icons: 32x32 procedural art with a consistent language — dark outline,
// lit-from-upper-left shading, diagonal presentation for held weapons/tools.
// Items with a `micon` ref use painted media-pack icons instead.
import { ITEMS } from '/shared/data/items.js';
import { drawMediaIcon } from './media.js';

const cache = new Map();
const INK = '#1b1410';
const ORE_COL = {
  copper_rock: '#b87333', tin_rock: '#a8a8b0', iron_rock: '#8a6a5a', coal_rock: '#3a3a3e',
  silver_rock: '#cfd4dc', mithril_rock: '#5a72b8', gold_rock: '#e0b93c', sylvanite_rock: '#7fe07f', essence_rock: '#b09fe0',
};
const METAL_PAL = {
  copper: ['#d98d4f', '#9c5a28', '#f4c08a'], bronze: ['#c98f57', '#8a5a30', '#eec394'],
  iron: ['#aeb0b8', '#6e7078', '#dcdee4'], steel: ['#ced4dc', '#8c929c', '#f4f7fa'],
  mithril: ['#5a72b8', '#34457e', '#8ca4e0'], damasked: ['#d8b45e', '#997a2c', '#f4e0a0'],
  silversteel: ['#e4e9f2', '#9aa2b2', '#ffffff'], sylvan: ['#e8cc66', '#a8862e', '#fff0b0'],
};
function metalFor(name) {
  const m = Object.keys(METAL_PAL).find(k => name.startsWith(k));
  return METAL_PAL[m] || METAL_PAL.iron;
}
function px(g, x, y, w, h, col) { g.fillStyle = col; g.fillRect(x, y, w, h); }
function diag(g, fn) { g.save(); g.translate(16, 16); g.rotate(Math.PI / 4); fn(); g.restore(); }

// Dragonhide / sylvan-trimmed ranger armour — scaly hide in the dragon's colour,
// a bright trim edge and a soft elemental glow.
const DHIDE = {
  sylvan_trimmed: { c: '#43434c', trim: '#e8c84e', glow: '#e8c84e' },
  blue_dragonhide: { c: '#2f5c9c', trim: '#8fd0f0', glow: '#4aa0e0' },
  green_dragonhide: { c: '#2f6c3a', trim: '#8fe0a0', glow: '#3fbf6a' },
  red_dragonhide: { c: '#9c2f2f', trim: '#f0968a', glow: '#e0503a' },
  aethereal_dragonhide: { c: '#aac8e0', trim: '#ffffff', glow: '#bfeaff' },
};
function dhideOf(name) { for (const k in DHIDE) if (name.startsWith(k)) return DHIDE[k]; return null; }
function drawHide(g, slot, dh) {
  const path = slot === 'head' ? () => { g.beginPath(); g.moveTo(16, 5); g.quadraticCurveTo(26, 8, 25, 20); g.quadraticCurveTo(24, 26, 16, 26); g.quadraticCurveTo(8, 26, 7, 20); g.quadraticCurveTo(6, 8, 16, 5); }
    : slot === 'torso' ? () => { g.beginPath(); g.moveTo(11, 6); g.lineTo(21, 6); g.lineTo(27, 10); g.lineTo(25, 15); g.lineTo(22, 13); g.lineTo(22, 26); g.lineTo(10, 26); g.lineTo(10, 13); g.lineTo(7, 15); g.lineTo(5, 10); g.closePath(); }
      : slot === 'legs' ? () => { g.beginPath(); g.moveTo(10, 6); g.lineTo(22, 6); g.lineTo(23, 12); g.lineTo(18.6, 27); g.lineTo(14.8, 27); g.lineTo(16, 14); g.lineTo(13.4, 27); g.lineTo(9.6, 27); g.lineTo(9, 12); g.closePath(); }
        : () => { g.beginPath(); g.moveTo(11, 8); g.lineTo(21, 8); g.lineTo(22, 18); g.lineTo(24, 20); g.lineTo(22, 23); g.lineTo(19, 21); g.lineTo(12, 21); g.closePath(); };
  g.save(); g.shadowColor = dh.glow; g.shadowBlur = 5;
  path(); g.fillStyle = dh.c; g.fill();
  g.shadowBlur = 0;
  // overlapping scales
  g.save(); path(); g.clip();
  g.strokeStyle = dh.trim; g.lineWidth = 0.8; g.globalAlpha = 0.5;
  for (let r = 0; r < 6; r++) for (let cxs = 0; cxs < 6; cxs++) { const x = 4 + cxs * 5 + (r % 2) * 2.5, y = 6 + r * 4; g.beginPath(); g.arc(x, y + 2, 2.5, Math.PI * 1.05, Math.PI * 1.95); g.stroke(); }
  g.globalAlpha = 1; g.restore();
  path(); g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
  path(); g.strokeStyle = dh.trim; g.lineWidth = 0.8; g.globalAlpha = 0.7; g.stroke(); g.globalAlpha = 1;
  if (slot === 'head') { g.fillStyle = '#141210'; g.beginPath(); g.ellipse(16, 18, 5.4, 5, 0, 0, 7); g.fill(); }
  g.restore();
}

function blade(g, pal, len, wid) {
  g.fillStyle = pal[1];
  g.beginPath(); g.moveTo(0, -len); g.lineTo(wid, -len + 4); g.lineTo(wid, 6); g.lineTo(-wid, 6); g.lineTo(-wid, -len + 4); g.closePath(); g.fill();
  g.fillStyle = pal[0];
  g.beginPath(); g.moveTo(0, -len); g.lineTo(-wid, -len + 4); g.lineTo(-wid, 6); g.lineTo(0, 6); g.closePath(); g.fill();
  g.fillStyle = pal[2]; g.fillRect(-1, -len + 3, 1.4, len - 2);
  g.strokeStyle = INK; g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, -len); g.lineTo(wid, -len + 4); g.lineTo(wid, 6); g.lineTo(-wid, 6); g.lineTo(-wid, -len + 4); g.closePath(); g.stroke();
}
function hilt(g, pal, y = 6) {
  g.fillStyle = '#5e4426'; g.fillRect(-4.5, y, 9, 2.4);
  g.strokeStyle = INK; g.strokeRect(-4.5, y, 9, 2.4);
  g.fillStyle = '#7a5a34'; g.fillRect(-1.4, y + 2.4, 2.8, 5.4);
  g.strokeStyle = INK; g.strokeRect(-1.4, y + 2.4, 2.8, 5.4);
  g.fillStyle = pal[0]; g.beginPath(); g.arc(0, y + 9.2, 2, 0, 7); g.fill(); g.stroke();
}
function shaft(g, from, to) {
  g.strokeStyle = INK; g.lineWidth = 4; g.lineCap = 'round';
  g.beginPath(); g.moveTo(0, from); g.lineTo(0, to); g.stroke();
  g.strokeStyle = '#8a6234'; g.lineWidth = 2.4; g.stroke();
  g.strokeStyle = '#b98d55'; g.lineWidth = 0.9;
  g.beginPath(); g.moveTo(-0.6, from); g.lineTo(-0.6, to); g.stroke();
}
function flask(g, liquid, tall = false) {
  g.fillStyle = '#c8963c'; g.fillRect(13.4, 4, 5.2, 3); g.strokeStyle = INK; g.strokeRect(13.4, 4, 5.2, 3);
  const body = () => { g.beginPath(); g.moveTo(14, 7); g.lineTo(14, tall ? 12 : 14); g.quadraticCurveTo(8, 18, 9, 22.6); g.quadraticCurveTo(10, 28, 16, 28); g.quadraticCurveTo(22, 28, 23, 22.6); g.quadraticCurveTo(24, 18, 18, tall ? 12 : 14); g.lineTo(18, 7); g.closePath(); };
  g.fillStyle = '#dfe9ee55'; body(); g.fill();
  g.save(); body(); g.clip();
  g.fillStyle = liquid; g.fillRect(6, 16, 20, 14);
  g.fillStyle = '#ffffff55'; g.fillRect(11, 8, 2, 20);
  g.restore();
  g.strokeStyle = INK; g.lineWidth = 1; body(); g.stroke();
}
function fishIcon(g, body, belly, dead = false) {
  g.fillStyle = body;
  g.beginPath(); g.ellipse(14, 16, 9, 5, -0.15, 0, 7); g.fill();
  g.beginPath(); g.moveTo(22, 16); g.lineTo(29, 11); g.lineTo(28, 16); g.lineTo(29, 21); g.closePath(); g.fill();
  g.fillStyle = belly; g.beginPath(); g.ellipse(13, 18, 6.5, 2.6, -0.1, 0, 7); g.fill();
  g.strokeStyle = INK; g.lineWidth = 1;
  g.beginPath(); g.ellipse(14, 16, 9, 5, -0.15, 0, 7); g.stroke();
  g.beginPath(); g.moveTo(22, 16); g.lineTo(29, 11); g.lineTo(28, 16); g.lineTo(29, 21); g.closePath(); g.stroke();
  px(g, 8, 14, 2, 2, dead ? '#666' : '#101418');
  if (!dead) px(g, 8.6, 14.2, 0.8, 0.8, '#fff');
  g.strokeStyle = '#00000030';
  g.beginPath(); g.moveTo(17, 12.6); g.lineTo(15, 19); g.stroke();
}
function gemIcon(g, col, cx = 16, cy = 16, s = 9) {
  g.fillStyle = col;
  g.beginPath(); g.moveTo(cx, cy - s); g.lineTo(cx + s * 0.85, cy - s * 0.2); g.lineTo(cx + s * 0.5, cy + s); g.lineTo(cx - s * 0.5, cy + s); g.lineTo(cx - s * 0.85, cy - s * 0.2); g.closePath(); g.fill();
  g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
  g.strokeStyle = '#ffffff70'; g.lineWidth = 0.8;
  g.beginPath(); g.moveTo(cx - s * 0.85, cy - s * 0.2); g.lineTo(cx, cy - s * 0.1); g.lineTo(cx + s * 0.85, cy - s * 0.2); g.moveTo(cx, cy - s); g.lineTo(cx, cy - s * 0.1); g.lineTo(cx - s * 0.4, cy + s); g.stroke();
  px(g, cx - s * 0.4, cy - s * 0.7, 2, 2, '#ffffffcc');
}

export function itemIcon(id) {
  let c = cache.get(id);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const g = c.getContext('2d');
  const def = ITEMS[id] || {};
  // media-pack icon (rare swords, potions, tomes, gems); skip caching until
  // the sheet image is loaded so early calls retry instead of freezing blank
  if (def.micon) {
    if (drawMediaIcon(g, def.micon, 1, 1, 30)) cache.set(id, c);
    return c;
  }
  cache.set(id, c);
  const name = id;
  const pal = metalFor(name);
  g.lineJoin = 'round';
  g.fillStyle = '#00000026';
  g.beginPath(); g.ellipse(16, 27.5, 10, 2.6, 0, 0, 7); g.fill();

  const dh = dhideOf(name);
  if (dh && def.slot) { drawHide(g, def.slot, dh); return c; }

  if (/(sword|_dagger|blade)/.test(name)) {
    diag(g, () => { blade(g, pal, name.includes('dagger') ? 12 : 17, name.includes('dagger') ? 2.2 : 3); hilt(g, pal); });
  } else if (name.includes('spear')) {
    diag(g, () => {
      shaft(g, -8, 14);
      g.fillStyle = pal[0]; g.beginPath(); g.moveTo(0, -18); g.lineTo(3.6, -9); g.lineTo(0, -6.5); g.lineTo(-3.6, -9); g.closePath(); g.fill();
      g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
      g.fillStyle = pal[2]; g.beginPath(); g.moveTo(0, -17); g.lineTo(-2, -9.6); g.lineTo(0, -8); g.closePath(); g.fill();
    });
  } else if (name.includes('pickaxe')) {
    diag(g, () => {
      shaft(g, -12, 13);
      g.fillStyle = pal[0];
      g.beginPath(); g.moveTo(-11, -9); g.quadraticCurveTo(0, -17, 11, -9); g.lineTo(9.4, -6.4); g.quadraticCurveTo(0, -13, -9.4, -6.4); g.closePath(); g.fill();
      g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
    });
  } else if (name.includes('hatchet')) {
    diag(g, () => {
      shaft(g, -12, 13);
      g.fillStyle = pal[0];
      g.beginPath(); g.moveTo(1, -13); g.quadraticCurveTo(11, -13, 11, -4); g.quadraticCurveTo(6, -6, 1, -4); g.closePath(); g.fill();
      g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
      g.fillStyle = pal[2]; g.beginPath(); g.moveTo(10.4, -5); g.quadraticCurveTo(11, -12, 3, -12.6); g.lineTo(3, -11); g.quadraticCurveTo(9, -10.6, 10.4, -5); g.fill();
    });
  } else if (name.includes('crossbow') || name.includes('arbalest')) {
    if (name === 'crossbow_stock') {
      diag(g, () => { shaft(g, -12, 10); g.fillStyle = '#8a6234'; g.fillRect(-3, -13, 6, 8); g.strokeStyle = INK; g.strokeRect(-3, -13, 6, 8); });
    } else {
      diag(g, () => {
        shaft(g, -6, 12); // stock
        g.strokeStyle = INK; g.lineWidth = 3.4; g.beginPath(); g.moveTo(-9, -7); g.quadraticCurveTo(0, -13, 9, -7); g.stroke();
        g.strokeStyle = name.includes('siege') ? METAL_PAL.silversteel[0] : METAL_PAL.iron[0]; g.lineWidth = 2;
        g.beginPath(); g.moveTo(-9, -7); g.quadraticCurveTo(0, -13, 9, -7); g.stroke();
        g.strokeStyle = '#e8ddc0'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(-9, -7); g.lineTo(9, -7); g.stroke();
        g.fillStyle = METAL_PAL.iron[1]; g.fillRect(-1.4, -9, 2.8, 4);
      });
    }
  } else if (name.includes('_bolts')) {
    for (const o of [-3, 1, 5]) {
      g.save(); g.translate(15 + o, 16); g.rotate(Math.PI / 4);
      g.strokeStyle = '#8a6234'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 7); g.lineTo(0, -6); g.stroke();
      g.fillStyle = pal[0]; g.beginPath(); g.moveTo(0, -9); g.lineTo(2.4, -4.6); g.lineTo(-2.4, -4.6); g.closePath(); g.fill();
      g.strokeStyle = INK; g.lineWidth = 0.7; g.stroke();
      g.restore();
    }
  } else if (name.includes('_mace')) {
    diag(g, () => {
      shaft(g, -6, 13);
      g.fillStyle = pal[0]; g.beginPath(); g.arc(0, -11, 5.4, 0, 7); g.fill();
      g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
      g.fillStyle = pal[2];
      for (let a = 0; a < 8; a++) { const ang = a * Math.PI / 4; g.beginPath(); g.moveTo(Math.cos(ang) * 5, -11 + Math.sin(ang) * 5); g.lineTo(Math.cos(ang) * 8.4, -11 + Math.sin(ang) * 8.4); g.lineTo(Math.cos(ang + 0.5) * 5, -11 + Math.sin(ang + 0.5) * 5); g.fill(); }
      px(g, -2, -13, 2, 2, pal[2]);
    });
  } else if (name.includes('waraxe')) {
    diag(g, () => {
      shaft(g, -13, 13);
      for (const m2 of [-1, 1]) {
        g.fillStyle = pal[0];
        g.beginPath(); g.moveTo(m2 * 1.4, -13); g.quadraticCurveTo(m2 * 11, -14, m2 * 11, -5); g.quadraticCurveTo(m2 * 6, -7, m2 * 1.4, -5); g.closePath(); g.fill();
        g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
      }
      px(g, -1.4, -15, 2.8, 3, pal[1]);
    });
  } else if (/bow$/.test(name)) {
    diag(g, () => {
      g.strokeStyle = INK; g.lineWidth = 3.6; g.beginPath(); g.arc(-3, 0, 13, -Math.PI / 2.15, Math.PI / 2.15); g.stroke();
      g.strokeStyle = name.includes('sherwood') ? '#c8a038' : '#8a6234'; g.lineWidth = 2;
      g.beginPath(); g.arc(-3, 0, 13, -Math.PI / 2.15, Math.PI / 2.15); g.stroke();
      g.strokeStyle = '#e8ddc0'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(-2.4, -12.6); g.lineTo(-2.4, 12.6); g.stroke();
      g.fillStyle = '#5e4426'; g.fillRect(8.4, -2.6, 3, 5.2); g.strokeStyle = INK; g.strokeRect(8.4, -2.6, 3, 5.2);
    });
  } else if (name.includes('arrow') && !name.includes('shafts') && !name.includes('headless')) {
    for (const o of [-4, 0, 4]) {
      g.save(); g.translate(16 + o, 16 - o * 0.2); g.rotate(Math.PI / 4);
      g.strokeStyle = '#8a6234'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(0, 10); g.lineTo(0, -8); g.stroke();
      g.fillStyle = pal[0]; g.beginPath(); g.moveTo(0, -12); g.lineTo(2.6, -7); g.lineTo(-2.6, -7); g.closePath(); g.fill();
      g.strokeStyle = INK; g.lineWidth = 0.8; g.stroke();
      g.fillStyle = '#dce4ec'; g.beginPath(); g.moveTo(0, 6); g.lineTo(3, 11); g.lineTo(0, 10); g.lineTo(-3, 11); g.closePath(); g.fill();
      g.restore();
    }
  } else if (name.includes('staff')) {
    // Staves stage up in power: a plain sphere for the apprentice, an ever
    // larger, more ornate elemental crystal in metal claws for the archdruid.
    const tier = name.includes('archdruid') ? 3 : name.includes('druid') ? 2 : name.includes('friar') ? 1 : 0;
    const oc = ['#9fd8ef', '#8fd0c0', '#7fd05f', '#ffd75e'][tier];
    const r = [3.2, 3.9, 4.7, 5.7][tier];
    diag(g, () => {
      shaft(g, -10, 14);
      const cy = -13;
      // metal claws cradling the crystal (higher tiers)
      if (tier >= 2) {
        g.strokeStyle = tier === 3 ? '#e8cc66' : '#9a8a5a'; g.lineWidth = 1.6; g.lineCap = 'round';
        for (const dx of [-1, 1]) { g.beginPath(); g.moveTo(dx * r * 0.9, cy + r * 0.7); g.quadraticCurveTo(dx * r * 1.1, cy - r * 0.3, dx * r * 0.4, cy - r); g.stroke(); }
        g.fillStyle = tier === 3 ? '#c8a83c' : '#7a6a44'; g.beginPath(); g.arc(0, cy + r * 0.8, 2, 0, 7); g.fill();
      }
      g.shadowColor = oc; g.shadowBlur = 4 + tier * 2.5;
      if (tier >= 2) { // faceted crystal
        g.fillStyle = oc;
        g.beginPath(); g.moveTo(0, cy - r); g.lineTo(r * 0.82, cy - r * 0.2); g.lineTo(r * 0.5, cy + r); g.lineTo(-r * 0.5, cy + r); g.lineTo(-r * 0.82, cy - r * 0.2); g.closePath(); g.fill();
        g.shadowBlur = 0; g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
        g.strokeStyle = '#ffffffa0'; g.lineWidth = 0.7;
        g.beginPath(); g.moveTo(-r * 0.82, cy - r * 0.2); g.lineTo(0, cy); g.lineTo(r * 0.82, cy - r * 0.2); g.moveTo(0, cy - r); g.lineTo(0, cy); g.stroke();
      } else { // glowing sphere
        g.fillStyle = oc; g.beginPath(); g.arc(0, cy, r, 0, 7); g.fill();
        g.shadowBlur = 0; g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
        if (tier === 1) { g.strokeStyle = '#c9b06a'; g.lineWidth = 1; g.beginPath(); g.arc(0, cy, r + 1.2, 0.2, 2.9); g.stroke(); }
      }
      px(g, -1.4, cy - r * 0.5, 1.5, 1.5, '#ffffffdd');
      // radiant sparkle for the top-tier crystal
      if (tier === 3) { g.strokeStyle = '#fff3b0'; g.lineWidth = 0.8; for (const a of [0, 1.6, 3.1, 4.7]) { g.beginPath(); g.moveTo(Math.cos(a) * (r + 2), cy + Math.sin(a) * (r + 2)); g.lineTo(Math.cos(a) * (r + 4), cy + Math.sin(a) * (r + 4)); g.stroke(); } }
    });
  } else if (name.includes('rune')) {
    if (name === 'rune_essence') {
      g.shadowColor = '#b09fe0'; g.shadowBlur = 6;
      g.fillStyle = '#cabfe8'; g.beginPath(); g.moveTo(16, 6); g.lineTo(24, 14); g.lineTo(20, 26); g.lineTo(12, 26); g.lineTo(8, 14); g.closePath(); g.fill();
      g.shadowBlur = 0; g.strokeStyle = INK; g.stroke();
      g.fillStyle = '#ffffff88'; g.beginPath(); g.moveTo(16, 8); g.lineTo(12, 14); g.lineTo(15, 22); g.closePath(); g.fill();
    } else {
      // carved stone slab: chiselled edge, elemental glyph cut deep and glowing
      const cols = { air: '#9fd8ef', earth: '#c89a52', water: '#5fa8dc', fire: '#ff8a2a', nature: '#6fc04a', cosmic: '#c08aff', blood: '#e0304a' };
      const el = name.split('_')[0];
      const c = cols[el] || '#888';
      // slab body with bevel
      g.fillStyle = '#cfc6b0';
      g.beginPath(); g.moveTo(10, 4.5); g.lineTo(22, 4.5); g.quadraticCurveTo(25.5, 5, 25.5, 9); g.lineTo(25, 24); g.quadraticCurveTo(24.8, 27.5, 21, 27.5); g.lineTo(11, 27.5); g.quadraticCurveTo(7.2, 27.5, 7, 24); g.lineTo(6.5, 9); g.quadraticCurveTo(6.5, 5, 10, 4.5); g.closePath(); g.fill();
      g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
      g.fillStyle = '#e9e2d0'; g.beginPath(); g.moveTo(10, 5.5); g.lineTo(22, 5.5); g.lineTo(21, 8); g.lineTo(11, 8); g.closePath(); g.fill(); // top light bevel
      g.fillStyle = '#a89e86'; g.beginPath(); g.moveTo(8, 23); g.lineTo(24, 23); g.lineTo(23.6, 26.4); g.lineTo(8.6, 26.4); g.closePath(); g.fill(); // bottom shadow bevel
      // chips
      g.fillStyle = '#b8ad96'; g.beginPath(); g.moveTo(25, 11); g.lineTo(23.4, 12.6); g.lineTo(25, 13.6); g.closePath(); g.fill();
      // carved glyph (path per element), glowing
      g.save(); g.translate(16, 16);
      g.shadowColor = c; g.shadowBlur = 6;
      g.strokeStyle = c; g.lineWidth = 2.2; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath();
      if (el === 'air') { g.arc(0, 0, 5.2, -2.4, 2.2); g.moveTo(3.4, -3.4); g.arc(1.2, -1.4, 3, -0.8, 1.8); }
      else if (el === 'earth') { g.moveTo(0, -6); g.lineTo(5.4, 4.6); g.lineTo(-5.4, 4.6); g.closePath(); g.moveTo(0, -1.4); g.lineTo(2.4, 3.2); g.lineTo(-2.4, 3.2); g.closePath(); }
      else if (el === 'water') { g.moveTo(-5.6, -2.6); g.quadraticCurveTo(-2.8, -6.2, 0, -2.6); g.quadraticCurveTo(2.8, 1, 5.6, -2.6); g.moveTo(-5.6, 2.8); g.quadraticCurveTo(-2.8, -0.8, 0, 2.8); g.quadraticCurveTo(2.8, 6.4, 5.6, 2.8); }
      else if (el === 'fire') { g.moveTo(0, -6.4); g.quadraticCurveTo(4.6, -2, 3.2, 2.4); g.quadraticCurveTo(2.2, 5.6, 0, 6); g.quadraticCurveTo(-2.2, 5.6, -3.2, 2.4); g.quadraticCurveTo(-4.6, -2, 0, -6.4); g.moveTo(0, -1.6); g.quadraticCurveTo(1.8, 1.2, 0, 3.6); g.quadraticCurveTo(-1.8, 1.2, 0, -1.6); }
      else if (el === 'nature') { g.moveTo(0, 6); g.quadraticCurveTo(-6, 0, -2.6, -4.6); g.quadraticCurveTo(0, -6.6, 2.6, -4.6); g.quadraticCurveTo(6, 0, 0, 6); g.moveTo(0, 5); g.lineTo(0, -3.4); }
      else if (el === 'cosmic') { for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; g.moveTo(0, 0); g.lineTo(Math.cos(a) * 6, Math.sin(a) * 6); } for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; g.moveTo(0, 0); g.lineTo(Math.cos(a) * 3.4, Math.sin(a) * 3.4); } }
      else if (el === 'blood') { g.moveTo(0, -6); g.quadraticCurveTo(4.8, 0, 3.4, 3); g.quadraticCurveTo(2, 6, 0, 6); g.quadraticCurveTo(-2, 6, -3.4, 3); g.quadraticCurveTo(-4.8, 0, 0, -6); }
      g.stroke();
      g.shadowBlur = 0;
      g.strokeStyle = '#ffffff80'; g.lineWidth = 0.8; g.stroke();  // inner shine
      g.restore();
    }
  } else if (name.includes('helm') || name.includes('coif')) {
    g.fillStyle = pal[0];
    g.beginPath(); g.arc(16, 15, 9.6, Math.PI, 0); g.lineTo(25.6, 21); g.lineTo(6.4, 21); g.closePath(); g.fill();
    g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
    g.fillStyle = pal[2]; g.beginPath(); g.arc(13, 12, 5, Math.PI, Math.PI * 1.6); g.lineTo(13, 12); g.fill();
    g.fillStyle = pal[1]; g.fillRect(6.4, 16, 19.2, 2.2);
    g.fillStyle = INK; g.fillRect(10, 18.4, 12, 1.6);
    if (name.includes('trollkings')) { g.fillStyle = '#ffd75e'; for (const o of [-6, 0, 6]) { g.beginPath(); g.moveTo(16 + o, 5); g.lineTo(14 + o, 9); g.lineTo(18 + o, 9); g.fill(); } }
  } else if (name.includes('hood') || name.includes('cowl')) {
    const c = { black: '#3a3a42', green: '#4a7a34', forest: '#2f5c22', blue: '#3c5c9c', brown: '#7a5a34', white: '#d8d5c8', charcoal: '#4a4a52' }[def.vis?.color] || '#6a6a5a';
    g.fillStyle = c;
    g.beginPath(); g.moveTo(16, 5); g.quadraticCurveTo(26, 8, 25, 20); g.quadraticCurveTo(24, 26, 16, 26); g.quadraticCurveTo(8, 26, 7, 20); g.quadraticCurveTo(6, 8, 16, 5); g.fill();
    g.strokeStyle = INK; g.stroke();
    g.fillStyle = '#141210'; g.beginPath(); g.ellipse(16, 18, 6, 5.4, 0, 0, 7); g.fill();
    g.fillStyle = '#ffffff22'; g.beginPath(); g.moveTo(16, 6); g.quadraticCurveTo(9, 9, 8.6, 18); g.lineTo(11, 18); g.quadraticCurveTo(11, 10, 16, 7.4); g.fill();
  } else if (name.includes('platebody') || /(_body|tunic|shirt|robe_top)/.test(name)) {
    const isRobe = name.includes('robe');
    const c = isRobe ? ({ novice: '#3c5c9c', friar: '#7a5a34', druidic: '#2f5c22', archdruid: '#d8d5c8' }[name.split('_')[0]] || '#3c5c9c')
      : name.includes('leather') || name.includes('studded') ? '#8a5f36'
      : name.includes('ranger') ? '#2f5c22' : name.includes('lincoln') ? '#3e7a2e'
      : name.includes('outlaw') ? '#4a7a34' : name.includes('peasant') ? '#d8d0bc' : pal[0];
    g.fillStyle = c;
    g.beginPath(); g.moveTo(11, 6); g.lineTo(21, 6); g.lineTo(27, 10); g.lineTo(25, 15); g.lineTo(22, 13); g.lineTo(22, 26); g.lineTo(10, 26); g.lineTo(10, 13); g.lineTo(7, 15); g.lineTo(5, 10); g.closePath(); g.fill();
    g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
    g.fillStyle = '#00000028'; g.fillRect(10, 20, 12, 6);
    g.fillStyle = '#ffffff30'; g.beginPath(); g.moveTo(11, 6.6); g.lineTo(15, 6.6); g.lineTo(12, 14); g.lineTo(10.6, 12); g.fill();
    g.fillStyle = INK; g.beginPath(); g.moveTo(13.4, 6); g.quadraticCurveTo(16, 9, 18.6, 6); g.fill();
    if (name.includes('studded')) { for (let i = 0; i < 6; i++) px(g, 12 + (i % 3) * 4, 15 + ((i / 3) | 0) * 5, 1.6, 1.6, '#c8ccd4'); }
  } else if (/platelegs|chaps|skirt|trousers/.test(name)) {
    const c = name.includes('plate') ? pal[0] : name.includes('peasant') ? '#8a7050' : '#7a5a34';
    g.fillStyle = c;
    g.beginPath(); g.moveTo(10, 6); g.lineTo(22, 6); g.lineTo(23, 12); g.lineTo(18.6, 27); g.lineTo(14.8, 27); g.lineTo(16, 14); g.lineTo(13.4, 27); g.lineTo(9.6, 27); g.lineTo(9, 12); g.closePath(); g.fill();
    g.strokeStyle = INK; g.stroke();
    g.fillStyle = '#ffffff2a'; g.fillRect(11, 7, 3, 5);
  } else if (name.includes('boots')) {
    const c = name.includes('leather') ? '#7a5a34' : pal[0];
    for (const ox of [0, 9]) {
      g.fillStyle = c;
      g.beginPath(); g.moveTo(8 + ox, 12); g.lineTo(13 + ox, 12); g.lineTo(13 + ox, 20); g.lineTo(17 + ox, 23); g.lineTo(17 + ox, 26); g.lineTo(8 + ox, 26); g.closePath(); g.fill();
      g.strokeStyle = INK; g.stroke();
      g.fillStyle = '#00000030'; g.fillRect(8 + ox, 24, 9, 2);
      g.fillStyle = '#ffffff2a'; g.fillRect(9 + ox, 13, 1.6, 6);
    }
  } else if (name.includes('gauntlet') || name.includes('glove')) {
    g.fillStyle = pal[0];
    g.beginPath(); g.moveTo(11, 8); g.lineTo(21, 8); g.lineTo(22, 18); g.lineTo(24, 20); g.lineTo(22, 23); g.lineTo(19, 21); g.lineTo(12, 21); g.closePath(); g.fill();
    g.strokeStyle = INK; g.stroke();
    g.fillStyle = pal[1]; g.fillRect(11, 8, 10, 3);
    g.strokeStyle = pal[1]; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(14 + i * 2.6, 11); g.lineTo(14 + i * 2.6, 19); g.stroke(); }
  } else if (name.includes('shield')) {
    const sh = () => { g.beginPath(); g.moveTo(16, 4); g.quadraticCurveTo(24, 6, 25, 10); g.quadraticCurveTo(25, 20, 16, 27); g.quadraticCurveTo(7, 20, 7, 10); g.quadraticCurveTo(8, 6, 16, 4); g.closePath(); };
    g.fillStyle = pal[1]; sh(); g.fill();
    g.save(); sh(); g.clip(); g.fillStyle = pal[0]; g.fillRect(16, 0, 16, 32); g.restore();
    g.strokeStyle = INK; g.lineWidth = 1.2; sh(); g.stroke();
    g.strokeStyle = pal[2]; g.lineWidth = 1; g.beginPath(); g.moveTo(16, 5.4); g.quadraticCurveTo(23, 7, 23.6, 10.4); g.stroke();
    g.fillStyle = pal[2]; g.beginPath(); g.arc(16, 14, 2.6, 0, 7); g.fill(); g.strokeStyle = INK; g.stroke();
  } else if (name.includes('amulet')) {
    g.strokeStyle = '#c8a038'; g.lineWidth = 1.6;
    g.beginPath(); g.arc(16, 12, 8, Math.PI * 0.15, Math.PI * 0.85, true); g.stroke();
    const gc = { sapphire: '#3c6ee0', emerald: '#3ca03c', ruby: '#c03a3a', diamond: '#dff2fc', gold: '#e8cc66' }[name.split('_')[0]] || '#e8cc66';
    gemIcon(g, gc, 16, 20, 5.4);
  } else if (name.includes('_ore')) {
    g.fillStyle = '#5c584e';
    g.beginPath(); g.moveTo(8, 24); g.lineTo(10, 14); g.lineTo(18, 10); g.lineTo(25, 16); g.lineTo(24, 24); g.closePath(); g.fill();
    g.strokeStyle = INK; g.stroke();
    g.fillStyle = '#777164';
    g.beginPath(); g.moveTo(10, 14); g.lineTo(18, 10); g.lineTo(22, 14); g.lineTo(13, 17); g.closePath(); g.fill();
    const oc = ORE_COL[name.replace('_ore', '_rock')] || '#c8b48a';
    g.shadowColor = oc; g.shadowBlur = 3;
    for (const [ox, oy] of [[13, 19], [19, 17], [16, 22]]) { g.fillStyle = oc; g.beginPath(); g.moveTo(ox, oy - 2.4); g.lineTo(ox + 2.4, oy); g.lineTo(ox, oy + 2.4); g.lineTo(ox - 2.4, oy); g.closePath(); g.fill(); }
    g.shadowBlur = 0;
  } else if (name === 'coal') {
    g.fillStyle = '#26262c';
    g.beginPath(); g.moveTo(9, 23); g.lineTo(10, 15); g.lineTo(17, 11); g.lineTo(24, 16); g.lineTo(23, 24); g.closePath(); g.fill();
    g.strokeStyle = INK; g.stroke();
    g.fillStyle = '#44444e'; g.beginPath(); g.moveTo(10, 15); g.lineTo(17, 11); g.lineTo(20, 14); g.lineTo(12, 18); g.closePath(); g.fill();
    px(g, 18, 15, 2, 2, '#6a6a78');
  } else if (name.includes('_bar')) {
    for (const [ox, oy] of [[10, 18], [18, 18], [14, 12]]) {
      g.fillStyle = pal[1];
      g.beginPath(); g.moveTo(ox - 5, oy + 6); g.lineTo(ox - 3, oy); g.lineTo(ox + 5, oy); g.lineTo(ox + 7, oy + 6); g.closePath(); g.fill();
      g.fillStyle = pal[0]; g.beginPath(); g.moveTo(ox - 3, oy); g.lineTo(ox + 5, oy); g.lineTo(ox + 5.8, oy + 2.4); g.lineTo(ox - 3.8, oy + 2.4); g.closePath(); g.fill();
      g.strokeStyle = INK; g.lineWidth = 0.9; g.beginPath(); g.moveTo(ox - 5, oy + 6); g.lineTo(ox - 3, oy); g.lineTo(ox + 5, oy); g.lineTo(ox + 7, oy + 6); g.closePath(); g.stroke();
    }
    px(g, 12.6, 13, 3, 1.2, pal[2]);
  } else if (name.includes('logs') || name === 'elder_heartwood') {
    const bark = name.includes('frostpine') ? '#8fb0a5' : name.includes('yew') ? '#4a5c3c' : name.includes('maple') ? '#8a5a30' : name === 'elder_heartwood' ? '#3e7a2e' : '#6e522f';
    for (const [ox, oy, rot] of [[15, 20, 0.06], [17, 13, -0.04]]) {
      g.save(); g.translate(ox, oy); g.rotate(rot);
      g.fillStyle = bark; g.fillRect(-10, -3.4, 20, 6.8);
      g.strokeStyle = INK; g.strokeRect(-10, -3.4, 20, 6.8);
      g.fillStyle = '#00000022'; g.fillRect(-10, 1.4, 20, 2);
      g.fillStyle = '#c9ac7c'; g.beginPath(); g.ellipse(10, 0, 2.6, 3.4, 0, 0, 7); g.fill(); g.strokeStyle = INK; g.stroke();
      g.strokeStyle = '#9a7c50'; g.beginPath(); g.ellipse(10, 0, 1.2, 1.8, 0, 0, 7); g.stroke();
      g.restore();
    }
  } else if (name === 'raw_venison' || name === 'venison') {
    const cooked = name === 'venison';
    g.fillStyle = cooked ? '#a05a2c' : '#c05050';
    g.beginPath(); g.ellipse(14, 16, 8.4, 6, -0.4, 0, 7); g.fill();
    g.strokeStyle = INK; g.stroke();
    g.fillStyle = cooked ? '#c9803c' : '#dd7a7a'; g.beginPath(); g.ellipse(13, 14.6, 5, 3.2, -0.4, 0, 7); g.fill();
    g.strokeStyle = '#e8e0d0'; g.lineWidth = 3; g.beginPath(); g.moveTo(20, 21); g.lineTo(26, 26); g.stroke();
    g.fillStyle = '#e8e0d0'; g.beginPath(); g.arc(27, 27, 2.2, 0, 7); g.fill();
  } else if (name.startsWith('raw_')) fishIcon(g, '#9ab8c8', '#c8dde8', false);
  else if (name.startsWith('cooked_')) fishIcon(g, '#d8935a', '#eec394', true);
  else if (name.startsWith('burnt_')) fishIcon(g, '#3a3a3e', '#55555c', true);
  else if (name === 'bread') {
    g.fillStyle = '#d8a85a'; g.beginPath(); g.ellipse(16, 17, 11, 7.4, -0.1, 0, 7); g.fill();
    g.strokeStyle = INK; g.stroke();
    g.fillStyle = '#eec98c'; g.beginPath(); g.ellipse(14, 14.4, 8, 4, -0.12, 0, 7); g.fill();
    g.strokeStyle = '#a87838'; g.lineWidth = 1;
    for (const o of [-4, 0, 4]) { g.beginPath(); g.moveTo(12 + o, 12.6); g.lineTo(15 + o, 16); g.stroke(); }
  } else if (name.includes('stew')) {
    g.fillStyle = '#8a6d4c'; g.beginPath(); g.moveTo(7, 16); g.quadraticCurveTo(7, 25, 16, 25); g.quadraticCurveTo(25, 25, 25, 16); g.closePath(); g.fill();
    g.strokeStyle = INK; g.stroke();
    g.fillStyle = '#b06a3c'; g.beginPath(); g.ellipse(16, 16, 9, 2.6, 0, 0, 7); g.fill(); g.strokeStyle = INK; g.stroke();
    px(g, 13, 14.8, 2.4, 1.6, '#d8935a'); px(g, 18, 15.4, 2.4, 1.6, '#5aa03c');
    g.strokeStyle = '#ffffff55'; g.beginPath(); g.moveTo(13, 11); g.quadraticCurveTo(14, 8, 13, 6); g.moveTo(18, 11); g.quadraticCurveTo(19, 8, 18, 6); g.stroke();
  } else if (name.includes('potion') || name.includes('elixir') || name.includes('restore')) {
    flask(g, name.includes('attack') ? '#e06a2a' : name.includes('strength') ? '#c03a3a' : name.includes('defence') ? '#4c8ab0' : name.includes('rang') ? '#5aa03c' : name.includes('magic') ? '#b07fe0' : name.includes('prayer') ? '#9ad2e8' : '#e8cc66');
  } else if (name === 'vial_water') flask(g, '#9ad2e8', true);
  else if (name.startsWith('grimy_')) {
    g.fillStyle = '#4a5a3a'; g.beginPath(); g.ellipse(16, 17, 8, 6.4, 0.5, 0, 7); g.fill();
    g.strokeStyle = INK; g.stroke();
    g.fillStyle = '#39462c'; g.beginPath(); g.ellipse(14, 16, 4, 3, 0.5, 0, 7); g.fill();
    px(g, 12, 13, 2, 2, '#6a5434'); px(g, 19, 19, 2.4, 2, '#6a5434'); px(g, 16, 21, 2, 1.6, '#6a5434');
  } else if (name.startsWith('clean_')) {
    g.strokeStyle = '#2f6c22'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(16, 26); g.quadraticCurveTo(15, 18, 16, 10); g.stroke();
    for (const [a, l] of [[-0.7, 8], [0.7, 8], [-0.5, 7], [0.5, 7], [-0.2, 6]]) {
      g.save(); g.translate(16, 22 - l); g.rotate(a);
      g.fillStyle = '#5aa03c'; g.beginPath(); g.ellipse(4, 0, 4.6, 2, 0, 0, 7); g.fill();
      g.strokeStyle = '#2f6c22'; g.lineWidth = 0.6; g.stroke();
      g.restore();
    }
  } else if (name.includes('seed')) {
    g.fillStyle = '#a8814f';
    g.beginPath(); g.moveTo(10, 10); g.quadraticCurveTo(6, 20, 11, 25); g.quadraticCurveTo(16, 28, 21, 25); g.quadraticCurveTo(26, 20, 22, 10); g.closePath(); g.fill();
    g.strokeStyle = INK; g.stroke();
    g.strokeStyle = '#6b5322'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(10, 11); g.quadraticCurveTo(16, 14, 22, 11); g.stroke();
    g.fillStyle = '#5e4426'; for (const [ox, oy] of [[13, 7], [17, 6], [20, 8]]) { g.beginPath(); g.ellipse(ox, oy, 1.6, 2.2, 0.3, 0, 7); g.fill(); }
  } else if (name.includes('bones')) {
    const glow = name.includes('ancient');
    if (glow) { g.shadowColor = '#9fd8ef'; g.shadowBlur = 5; }
    for (const rot of [-0.5, 0.5]) {
      g.save(); g.translate(16, 16); g.rotate(rot);
      g.strokeStyle = INK; g.lineWidth = 4.6; g.beginPath(); g.moveTo(-8, 0); g.lineTo(8, 0); g.stroke();
      g.strokeStyle = '#ece4d4'; g.lineWidth = 3; g.stroke();
      for (const e of [-8, 8]) { g.fillStyle = '#ece4d4'; g.beginPath(); g.arc(e, -1.8, 2.2, 0, 7); g.arc(e, 1.8, 2.2, 0, 7); g.fill(); }
      g.restore();
    }
    g.shadowBlur = 0;
  } else if (/fur|pelt|hide|^soft_leather|scale$/.test(name)) {
    // species-distinct pelts: silhouettes you can tell apart at a glance
    const splayed = (base, dark, headFn) => {
      // flat splayed pelt: body + four leg flaps + species head
      g.fillStyle = base;
      g.beginPath();
      g.moveTo(16, 6); g.quadraticCurveTo(22, 7, 23, 11); g.lineTo(27, 13); g.lineTo(24, 16);
      g.quadraticCurveTo(24, 20, 23, 22); g.lineTo(26, 26); g.lineTo(21, 25);
      g.quadraticCurveTo(16, 28, 11, 25); g.lineTo(6, 26); g.lineTo(9, 22);
      g.quadraticCurveTo(8, 20, 8, 16); g.lineTo(5, 13); g.lineTo(9, 11);
      g.quadraticCurveTo(10, 7, 16, 6); g.closePath(); g.fill();
      g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
      g.strokeStyle = dark; g.lineWidth = 1;
      g.beginPath(); g.moveTo(16, 9); g.lineTo(16, 24); g.stroke();
      headFn && headFn();
    };
    if (name.includes('wolf')) {
      splayed('#7a7e88', '#565a64', () => { // grey pelt, wolf muzzle + ears at top
        g.fillStyle = '#5a5e68';
        g.beginPath(); g.moveTo(16, 2.6); g.lineTo(19.4, 7); g.lineTo(16, 9.6); g.lineTo(12.6, 7); g.closePath(); g.fill(); g.strokeStyle = INK; g.stroke();
        g.beginPath(); g.moveTo(12.4, 4.6); g.lineTo(13.8, 7); g.lineTo(11.6, 7.4); g.closePath();
        g.moveTo(19.6, 4.6); g.lineTo(18.2, 7); g.lineTo(20.4, 7.4); g.closePath(); g.fill(); g.stroke();
        px(g, 14.4, 6, 1.2, 1.2, '#20242c'); px(g, 16.6, 6, 1.2, 1.2, '#20242c');
      });
      g.fillStyle = '#b8bcC6'; g.beginPath(); g.ellipse(16, 14, 3, 4.4, 0, 0, 7); g.fill(); // pale chest streak
    } else if (name.includes('fox')) {
      // rusty fur with the giveaway white-tipped bushy tail
      g.fillStyle = '#c8641e';
      g.beginPath(); g.moveTo(10, 7); g.quadraticCurveTo(20, 4, 23, 10); g.quadraticCurveTo(25, 16, 20, 20); g.quadraticCurveTo(14, 24, 10, 19); g.quadraticCurveTo(6, 12, 10, 7); g.closePath(); g.fill();
      g.strokeStyle = INK; g.stroke();
      g.fillStyle = '#e08a44'; g.beginPath(); g.ellipse(14, 12, 4, 3, -0.4, 0, 7); g.fill();
      g.fillStyle = '#c8641e'; // tail sweeping under
      g.beginPath(); g.moveTo(19, 18); g.quadraticCurveTo(27, 20, 25, 26); g.quadraticCurveTo(23, 29, 18, 27); g.quadraticCurveTo(14, 25, 16, 21); g.closePath(); g.fill(); g.strokeStyle = INK; g.stroke();
      g.fillStyle = '#f4ede0'; g.beginPath(); g.moveTo(24.6, 23.4); g.quadraticCurveTo(26, 26.4, 22.4, 27.6); g.quadraticCurveTo(20.6, 27.8, 20, 26.4); g.quadraticCurveTo(22.6, 26.2, 24.6, 23.4); g.closePath(); g.fill();
    } else if (name.includes('rabbit')) {
      // small soft pelt with long upright ears
      g.fillStyle = '#c9b295';
      g.beginPath(); g.ellipse(16, 19, 7.4, 6.8, 0, 0, 7); g.fill(); g.strokeStyle = INK; g.stroke();
      g.fillStyle = '#bfa688';
      for (const o of [-3.2, 3.2]) {
        g.beginPath(); g.ellipse(16 + o, 9, 2.1, 5.4, o > 0 ? 0.22 : -0.22, 0, 7); g.fill(); g.strokeStyle = INK; g.stroke();
        g.fillStyle = '#e8cfae'; g.beginPath(); g.ellipse(16 + o, 9.6, 0.9, 3.4, o > 0 ? 0.22 : -0.22, 0, 7); g.fill();
        g.fillStyle = '#bfa688';
      }
      g.fillStyle = '#efe2cc'; g.beginPath(); g.ellipse(15, 18, 3.4, 2.6, 0.3, 0, 7); g.fill(); // belly fluff
      g.fillStyle = '#f7f2e8'; g.beginPath(); g.arc(20.5, 23.5, 2, 0, 7); g.fill(); g.strokeStyle = INK; g.stroke(); // bob tail
    } else if (name.includes('sable')) {
      // long sleek near-black stole, curled
      g.fillStyle = '#2e2830';
      g.beginPath(); g.moveTo(8, 10); g.quadraticCurveTo(16, 4, 24, 9); g.quadraticCurveTo(28, 13, 24, 16); g.quadraticCurveTo(18, 19, 20, 23); g.quadraticCurveTo(21, 27, 15, 27); g.quadraticCurveTo(8, 26, 9, 20); g.quadraticCurveTo(10, 16, 8, 13) ; g.closePath(); g.fill();
      g.strokeStyle = INK; g.stroke();
      g.fillStyle = '#4a4250'; g.beginPath(); g.ellipse(15, 11, 6, 2.2, -0.15, 0, 7); g.fill(); // sheen
      g.fillStyle = '#191521'; g.beginPath(); g.ellipse(17, 22, 3.4, 2.6, 0.5, 0, 7); g.fill();
    } else if (name.includes('cow')) {
      // rectangular hide with black patches
      g.fillStyle = '#e8ddc8';
      g.beginPath(); g.moveTo(8, 7); g.lineTo(24, 7); g.lineTo(26, 12); g.lineTo(24, 25); g.lineTo(8, 25); g.lineTo(6, 12); g.closePath(); g.fill();
      g.strokeStyle = INK; g.stroke();
      g.fillStyle = '#2c2c30';
      g.beginPath(); g.ellipse(12, 12, 3.4, 2.8, 0.4, 0, 7); g.fill();
      g.beginPath(); g.ellipse(21, 17, 3, 3.4, -0.3, 0, 7); g.fill();
      g.beginPath(); g.ellipse(13, 21.5, 2.6, 2, 0.2, 0, 7); g.fill();
    } else if (name.includes('fenwyrm')) {
      g.shadowColor = '#4a7040'; g.shadowBlur = 4;
      g.fillStyle = '#4a7040';
      g.beginPath(); g.moveTo(16, 5); g.lineTo(24, 12); g.lineTo(21, 26); g.lineTo(11, 26); g.lineTo(8, 12); g.closePath(); g.fill();
      g.shadowBlur = 0; g.strokeStyle = INK; g.stroke();
      g.strokeStyle = '#35532c'; for (let yy = 10; yy < 25; yy += 4) { g.beginPath(); g.moveTo(10, yy); g.quadraticCurveTo(16, yy + 2, 22, yy); g.stroke(); }
      g.fillStyle = '#7fae62'; g.beginPath(); g.ellipse(14, 10, 3, 2, 0.4, 0, 7); g.fill();
    } else { // soft leather: neatly folded tan square
      g.fillStyle = '#b3854e'; g.fillRect(8, 10, 17, 13);
      g.strokeStyle = INK; g.strokeRect(8, 10, 17, 13);
      g.fillStyle = '#9c7140'; g.fillRect(8, 15.4, 17, 2.2);
      g.fillStyle = '#c99a63'; g.fillRect(8, 10, 17, 2.6);
      g.strokeStyle = '#7a5830'; g.beginPath(); g.moveTo(8, 18.6); g.lineTo(25, 18.6); g.stroke();
    }
  } else if (name === 'coins') {
    for (const [ox, oy] of [[11, 21], [17, 22], [14, 17], [20, 17]]) {
      g.fillStyle = '#e8b93c'; g.beginPath(); g.ellipse(ox, oy, 5, 3.6, 0, 0, 7); g.fill();
      g.strokeStyle = INK; g.lineWidth = 0.9; g.stroke();
      g.fillStyle = '#f8dc7c'; g.beginPath(); g.ellipse(ox, oy - 0.8, 3.4, 2, 0, 0, 7); g.fill();
    }
    px(g, 13, 15.4, 2, 1.4, '#fff2b8');
  } else if (name.includes('charm')) {
    const c = { verdant_charm: '#5aa03c', amber_charm: '#e0b93c', cobalt_charm: '#3c6ee0', crimson_charm: '#c03a3a' }[name] || '#888';
    g.strokeStyle = '#8a6d4c'; g.lineWidth = 1.4; g.beginPath(); g.arc(16, 8, 3, Math.PI, 0); g.stroke();
    gemIcon(g, c, 16, 18, 8);
  } else if (name === 'spirit_shard') {
    g.shadowColor = '#9fd8ef'; g.shadowBlur = 5;
    g.fillStyle = '#bfe4f4'; g.beginPath(); g.moveTo(16, 5); g.lineTo(21, 15); g.lineTo(16, 27); g.lineTo(11, 15); g.closePath(); g.fill();
    g.shadowBlur = 0; g.strokeStyle = INK; g.stroke();
    g.fillStyle = '#ffffff99'; g.beginPath(); g.moveTo(15.6, 7); g.lineTo(12.6, 15); g.lineTo(15, 22); g.lineTo(16, 22); g.closePath(); g.fill();
  } else if (name.includes('pouch')) {
    g.fillStyle = '#8a6d4c';
    g.beginPath(); g.moveTo(11, 12); g.quadraticCurveTo(6, 20, 11, 25); g.quadraticCurveTo(16, 28, 21, 25); g.quadraticCurveTo(26, 20, 21, 12); g.closePath(); g.fill();
    g.strokeStyle = INK; g.stroke();
    g.fillStyle = '#6b5322'; g.beginPath(); g.ellipse(16, 11, 6, 3, 0, 0, 7); g.fill(); g.strokeStyle = INK; g.stroke();
    g.strokeStyle = '#4a3a1c'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(10, 12.6); g.lineTo(22, 12.6); g.stroke();
    g.shadowColor = '#9fe0cf'; g.shadowBlur = 4; px(g, 14.4, 17, 3.4, 3.4, '#9fe0cf'); g.shadowBlur = 0;
  } else if (['sapphire', 'emerald', 'ruby', 'diamond'].includes(name)) {
    gemIcon(g, { sapphire: '#3c6ee0', emerald: '#3ca03c', ruby: '#c03a3a', diamond: '#dff2fc' }[name]);
  } else if (name.includes('key')) {
    // the Abyssal key glows crimson; mundane keys stay brass
    const abyssal = name === 'dungeon_key';
    const kc = abyssal ? '#c22030' : '#c8a038';
    g.save(); g.translate(16, 16); g.rotate(Math.PI / 4);
    if (abyssal) { g.shadowColor = '#e0304a'; g.shadowBlur = 6; }
    g.strokeStyle = kc; g.lineWidth = 2.4;
    g.beginPath(); g.arc(0, -7, 3.6, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(0, -3.4); g.lineTo(0, 9); g.stroke();
    g.beginPath(); g.moveTo(0, 5); g.lineTo(3.4, 5); g.moveTo(0, 8.4); g.lineTo(4.4, 8.4); g.stroke();
    g.shadowBlur = 0;
    if (abyssal) { // darker core + skull-socket bow
      g.strokeStyle = '#7a1020'; g.lineWidth = 1;
      g.beginPath(); g.arc(0, -7, 3.6, 0, 7); g.stroke();
      g.fillStyle = '#3a0810'; g.beginPath(); g.arc(0, -7, 1.6, 0, 7); g.fill();
    }
    g.restore();
  } else if (name.startsWith('aura_')) {
    // glowing elemental ring
    const ac = { ember: '#ff8a2a', frost: '#7ac8f0', verdant: '#6fc04a', royal: '#e8c84e', blood: '#e0304a', spectral: '#c08aff', storm: '#9fd8ef', void: '#8a5cff' }[name.slice(5)] || '#ffd75e';
    g.shadowColor = ac; g.shadowBlur = 7;
    g.strokeStyle = ac; g.lineWidth = 2.6;
    g.beginPath(); g.ellipse(16, 18, 9.5, 5, 0, 0, 7); g.stroke();
    g.shadowBlur = 0;
    g.strokeStyle = '#ffffff90'; g.lineWidth = 1;
    g.beginPath(); g.ellipse(16, 18, 9.5, 5, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    for (const [ox, oy] of [[9, 11], [23, 12], [16, 7]]) { g.fillStyle = ac; g.beginPath(); g.arc(ox, oy, 1.4, 0, 7); g.fill(); }
  } else if (def.mount) {
    // saddle over a horse-blanket; flyers get a wing
    g.fillStyle = '#8a5f36';
    g.beginPath(); g.moveTo(8, 16); g.quadraticCurveTo(10, 10, 16, 10); g.quadraticCurveTo(23, 10, 25, 17); g.quadraticCurveTo(25.5, 21, 21, 21); g.lineTo(12, 21); g.quadraticCurveTo(7.5, 21, 8, 16); g.closePath(); g.fill();
    g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
    g.fillStyle = '#6b4726'; g.beginPath(); g.moveTo(15, 10); g.quadraticCurveTo(13, 6, 16.5, 5.5); g.quadraticCurveTo(19, 6, 17.6, 10); g.closePath(); g.fill(); g.stroke(); // pommel
    g.fillStyle = def.mount.tint === 'gold' ? '#e8c84e' : '#a03a3a';
    g.fillRect(9, 21, 14.5, 4.4); g.strokeStyle = INK; g.strokeRect(9, 21, 14.5, 4.4); // blanket
    g.fillStyle = '#c8a038'; g.beginPath(); g.arc(11.5, 18, 1.4, 0, 7); g.fill(); // buckle
    if (def.mount.fly) { // wing
      g.fillStyle = '#e8e2d4';
      g.beginPath(); g.moveTo(22, 12); g.quadraticCurveTo(29, 4, 30, 10); g.quadraticCurveTo(27.5, 11, 27, 14); g.quadraticCurveTo(24.5, 13, 22, 15); g.closePath(); g.fill();
      g.strokeStyle = INK; g.stroke();
    }
  } else if (name.includes('letter')) {
    g.fillStyle = '#efe6d0'; g.fillRect(7, 10, 18, 13);
    g.strokeStyle = INK; g.strokeRect(7, 10, 18, 13);
    g.strokeStyle = '#a89468'; g.beginPath(); g.moveTo(7, 10); g.lineTo(16, 18); g.lineTo(25, 10); g.stroke();
    g.fillStyle = '#c03a3a'; g.beginPath(); g.arc(16, 18, 2.4, 0, 7); g.fill();
  } else if (name === 'box_trap') {
    g.fillStyle = '#8a6d4c'; g.fillRect(8, 14, 16, 11); g.strokeStyle = INK; g.strokeRect(8, 14, 16, 11);
    g.strokeStyle = '#5e4426'; g.lineWidth = 1.2;
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(8 + i * 4, 14); g.lineTo(8 + i * 4, 25); g.stroke(); }
    g.strokeStyle = '#8a6d4c'; g.beginPath(); g.moveTo(8, 14); g.lineTo(14, 8); g.lineTo(24, 8); g.stroke();
    px(g, 15, 18, 3, 2.4, '#e8952e');
  } else if (name === 'small_fishing_net') {
    g.strokeStyle = '#8a6234'; g.lineWidth = 2.2; g.beginPath(); g.arc(16, 14, 9, Math.PI * 0.8, Math.PI * 2.2); g.stroke();
    g.strokeStyle = '#d8cfc0'; g.lineWidth = 0.8;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(9 + i * 4.6, 12); g.lineTo(12 + i * 4.6, 26); g.stroke(); }
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(8, 14 + i * 4); g.lineTo(24, 15 + i * 4); g.stroke(); }
  } else if (name === 'fishing_rod' || name === 'harpoon') {
    diag(g, () => {
      shaft(g, -14, 14);
      if (name === 'harpoon') {
        g.fillStyle = METAL_PAL.steel[0];
        g.beginPath(); g.moveTo(0, -19); g.lineTo(3, -12); g.lineTo(1.2, -12); g.lineTo(1.2, -9); g.lineTo(-1.2, -9); g.lineTo(-1.2, -12); g.lineTo(-3, -12); g.closePath(); g.fill();
        g.strokeStyle = INK; g.lineWidth = 0.8; g.stroke();
      } else {
        g.strokeStyle = '#d8cfc0'; g.lineWidth = 0.8;
        g.beginPath(); g.moveTo(0, -14); g.quadraticCurveTo(8, -12, 8, -4); g.stroke();
        g.strokeStyle = METAL_PAL.steel[0]; g.lineWidth = 1.2;
        g.beginPath(); g.arc(8, -2.6, 1.6, -0.5, Math.PI); g.stroke();
      }
    });
  } else if (name === 'tinderbox') {
    g.fillStyle = '#7a6a5c'; g.fillRect(8, 15, 16, 9); g.strokeStyle = INK; g.strokeRect(8, 15, 16, 9);
    g.fillStyle = '#948274'; g.fillRect(8, 15, 16, 2.6);
    g.fillStyle = METAL_PAL.steel[0]; g.beginPath(); g.ellipse(13, 12, 3.4, 2, 0.4, 0, 7); g.fill(); g.strokeStyle = INK; g.lineWidth = 0.8; g.stroke();
    g.shadowColor = '#ffd75e'; g.shadowBlur = 4;
    g.fillStyle = '#ffd75e'; g.beginPath(); g.moveTo(19, 8); g.lineTo(21, 11); g.lineTo(23, 9); g.lineTo(21.6, 12.6); g.lineTo(19, 12); g.closePath(); g.fill();
    g.shadowBlur = 0;
  } else if (name === 'hammer') {
    diag(g, () => {
      shaft(g, -8, 13);
      g.fillStyle = METAL_PAL.steel[1]; g.fillRect(-8, -14, 16, 7);
      g.fillStyle = METAL_PAL.steel[0]; g.fillRect(-8, -14, 16, 3);
      g.strokeStyle = INK; g.strokeRect(-8, -14, 16, 7);
    });
  } else if (name === 'knife' || name === 'chisel') {
    diag(g, () => { blade(g, METAL_PAL.steel, name === 'knife' ? 11 : 8, 2); g.fillStyle = '#7a5a34'; g.fillRect(-1.8, 6, 3.6, 7); g.strokeStyle = INK; g.strokeRect(-1.8, 6, 3.6, 7); });
  } else if (name === 'needle') {
    g.strokeStyle = METAL_PAL.silversteel[0]; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(10, 24); g.lineTo(23, 8); g.stroke();
    g.strokeStyle = '#c8ccd4'; g.lineWidth = 1; g.beginPath(); g.ellipse(22.4, 8.6, 1.8, 2.6, -0.7, 0, 7); g.stroke();
  } else if (name === 'spade' || name === 'trowel') {
    diag(g, () => {
      shaft(g, -10, 10);
      g.fillStyle = METAL_PAL.steel[0];
      g.beginPath(); g.moveTo(-4, -10); g.lineTo(4, -10); g.lineTo(3, -17); g.quadraticCurveTo(0, -20, -3, -17); g.closePath(); g.fill();
      g.strokeStyle = INK; g.lineWidth = 0.9; g.stroke();
      if (name === 'spade') { g.fillStyle = '#7a5a34'; g.fillRect(-3, 10, 6, 2.6); g.strokeStyle = INK; g.strokeRect(-3, 10, 6, 2.6); }
    });
  } else if (name === 'secateurs') {
    for (const m of [-1, 1]) {
      g.save(); g.translate(16, 16); g.scale(m, 1);
      g.strokeStyle = METAL_PAL.steel[0]; g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(1, 6); g.quadraticCurveTo(6, -2, 2, -9); g.stroke();
      g.strokeStyle = '#c03a3a'; g.beginPath(); g.moveTo(1, 6); g.lineTo(4, 12); g.stroke();
      g.restore();
    }
    g.fillStyle = METAL_PAL.steel[1]; g.beginPath(); g.arc(16, 5, 1.8, 0, 7); g.fill();
  } else if (name === 'arrow_shafts' || name === 'headless_arrows') {
    for (const o of [-3, 0, 3]) {
      g.save(); g.translate(16 + o, 16); g.rotate(Math.PI / 4);
      g.strokeStyle = '#a87f4f'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(0, 11); g.lineTo(0, -11); g.stroke();
      if (name === 'headless_arrows') { g.fillStyle = '#dce4ec'; g.beginPath(); g.moveTo(0, 7); g.lineTo(2.6, 11); g.lineTo(0, 10); g.lineTo(-2.6, 11); g.closePath(); g.fill(); }
      g.restore();
    }
  } else if (name === 'feathers') {
    for (const [o, rot, c2] of [[-4, -0.3, '#e8e4dc'], [2, 0.15, '#d0c8b8'], [7, 0.5, '#e8e4dc']]) {
      g.save(); g.translate(14 + o, 16); g.rotate(rot);
      g.fillStyle = c2; g.beginPath(); g.ellipse(0, -2, 3, 9, 0, 0, 7); g.fill();
      g.strokeStyle = INK; g.lineWidth = 0.7; g.stroke();
      g.strokeStyle = '#9a917e'; g.beginPath(); g.moveTo(0, 8); g.lineTo(0, -10); g.stroke();
      g.restore();
    }
  } else if (name === 'bowstring' || name === 'flax') {
    g.strokeStyle = name === 'flax' ? '#9ab060' : '#e0d8c0'; g.lineWidth = 2;
    g.beginPath(); g.arc(16, 16, 8, 0, Math.PI * 1.8); g.stroke();
    g.strokeStyle = INK; g.lineWidth = 0.7;
    g.beginPath(); g.arc(16, 16, 9.2, 0, Math.PI * 1.8); g.stroke();
    g.beginPath(); g.arc(16, 16, 6.8, 0, Math.PI * 1.8); g.stroke();
    px(g, 23, 13, 3.4, 2, name === 'flax' ? '#7a9040' : '#c0b8a0');
  } else if (name === 'fishing_bait') {
    g.fillStyle = '#8a6d4c'; g.beginPath(); g.ellipse(16, 20, 9, 5, 0, 0, 7); g.fill(); g.strokeStyle = INK; g.stroke();
    g.strokeStyle = '#d88a94'; g.lineWidth = 2.4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(11, 17); g.quadraticCurveTo(14, 12, 18, 15); g.quadraticCurveTo(22, 18, 24, 13); g.stroke();
  } else if (name.startsWith('damaged_')) {
    g.fillStyle = '#b8ad96';
    g.beginPath(); g.moveTo(10, 8); g.lineTo(22, 9); g.lineTo(24, 20); g.lineTo(18, 25); g.lineTo(9, 23); g.closePath(); g.fill();
    g.strokeStyle = INK; g.stroke();
    g.strokeStyle = '#6e6456'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(13, 10); g.lineTo(17, 16); g.lineTo(14, 22); g.stroke();
    px(g, 18, 12, 3, 3, '#8a7f6a');
  } else if (['roman_coin', 'saxon_brooch', 'druid_idol', 'norman_seal', 'grail_fragment', 'frostgiant_heart'].includes(name)) {
    g.shadowColor = '#e8cc66'; g.shadowBlur = 4;
    g.fillStyle = name === 'frostgiant_heart' ? '#7ab8d4' : '#d8bc6a';
    if (name === 'roman_coin') { g.beginPath(); g.arc(16, 16, 8, 0, 7); g.fill(); g.shadowBlur = 0; g.strokeStyle = INK; g.stroke(); g.strokeStyle = '#a8863c'; g.beginPath(); g.arc(16, 16, 5.6, 0, 7); g.stroke(); px(g, 14, 11, 4, 10, '#a8863c'); }
    else if (name === 'grail_fragment') { g.beginPath(); g.moveTo(9, 8); g.quadraticCurveTo(16, 14, 23, 8); g.lineTo(20, 18); g.lineTo(12, 18); g.closePath(); g.fill(); g.shadowBlur = 0; g.strokeStyle = INK; g.stroke(); px(g, 14, 18, 4, 6, '#d8bc6a'); }
    else if (name === 'frostgiant_heart') { g.beginPath(); g.moveTo(16, 25); g.quadraticCurveTo(6, 17, 9, 10); g.quadraticCurveTo(12, 6, 16, 11); g.quadraticCurveTo(20, 6, 23, 10); g.quadraticCurveTo(26, 17, 16, 25); g.fill(); g.shadowBlur = 0; g.strokeStyle = INK; g.stroke(); }
    else { g.beginPath(); g.arc(16, 15, 8, 0, 7); g.fill(); g.shadowBlur = 0; g.strokeStyle = INK; g.stroke(); g.fillStyle = '#8a6d2c'; g.beginPath(); g.arc(16, 15, 3, 0, 7); g.fill(); }
  } else if (def.pet) {
    // paw print in a warm medallion — the mark of a companion
    g.fillStyle = '#8a6d4c'; g.beginPath(); g.arc(16, 16, 11, 0, 7); g.fill();
    g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
    g.fillStyle = '#f4e6c0';
    g.beginPath(); g.ellipse(16, 19, 4.4, 3.6, 0, 0, 7); g.fill();
    for (const [ox, oy] of [[-5, -1], [-1.8, -3.4], [1.8, -3.4], [5, -1]]) { g.beginPath(); g.arc(16 + ox, 16 + oy, 1.9, 0, 7); g.fill(); }
    g.strokeStyle = '#c8a038'; g.lineWidth = 1.4; g.beginPath(); g.arc(16, 16, 12.6, 0, 7); g.stroke();
  } else if (def.tool) {
    diag(g, () => { shaft(g, -10, 12); g.fillStyle = METAL_PAL.iron[0]; g.fillRect(-5, -13, 10, 5); g.strokeStyle = INK; g.strokeRect(-5, -13, 10, 5); });
  } else if (def.food) {
    g.fillStyle = '#c98a3c'; g.beginPath(); g.arc(16, 17, 8, 0, 7); g.fill(); g.strokeStyle = INK; g.stroke();
    g.fillStyle = '#e8b06a'; g.beginPath(); g.arc(14, 14.6, 4.4, 0, 7); g.fill();
  } else {
    g.fillStyle = '#a8895c'; g.fillRect(9, 11, 14, 13); g.strokeStyle = INK; g.strokeRect(9, 11, 14, 13);
    g.strokeStyle = '#6b5322'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(16, 11); g.lineTo(16, 24); g.moveTo(9, 17.4); g.lineTo(23, 17.4); g.stroke();
    g.fillStyle = '#e0c88a'; g.beginPath(); g.arc(16, 17.4, 2, 0, 7); g.fill();
  }
  return c;
}

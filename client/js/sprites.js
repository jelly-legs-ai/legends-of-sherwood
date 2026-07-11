// Sprite system.
// 1) LPC paperdoll compositor: every humanoid (players, NPCs, humanoid mobs) is
//    composited from free LPC layers (body/head/hair/gear/weapon) onto a cached
//    832x1344 sheet — so equipping gear genuinely changes the sprite, and all
//    layers share the same frame grid: animation flow stays continuous.
// 2) Procedural pixel art for beasts, gather nodes, stations and items.

export const FRAME = 64;
export const ANIMS = {
  spellcast: { row: 0, frames: 7, ms: 90, once: true },
  thrust: { row: 4, frames: 8, ms: 90, once: true },
  walk: { row: 8, frames: 9, ms: 70 },
  slash: { row: 12, frames: 6, ms: 90, once: true },
  shoot: { row: 16, frames: 13, ms: 60, once: true },
  hurt: { row: 20, frames: 6, ms: 110, once: true, nodir: true },
  idle: { row: 8, frames: 1, ms: 999 },
};

let manifest = null;
const images = new Map();   // file -> HTMLImageElement (loading or ready)
const composites = new Map(); // lookKey -> {canvas, ready}

export async function loadManifest() {
  manifest = await (await fetch('assets/lpc/manifest.json')).json();
  return manifest;
}
function img(file) {
  if (!file) return null;
  let im = images.get(file);
  if (!im) {
    im = new Image();
    im.src = 'assets/lpc/' + file;
    images.set(file, im);
  }
  return im;
}
function pick(obj, ...keys) { let o = obj; for (const k of keys) { if (!o) return null; o = o[k]; } return o; }
function gearFile(sheetKey, sex, color) {
  const g = pick(manifest.gear, sheetKey, sex);
  if (!g) return null;
  return g[color] || Object.values(g).find(Boolean);
}

// Build (or fetch) the composited sheet for a "vis" descriptor.
// vis: {sex, skin, hair:[style,color], beard, torso:[sheet,color], legs, feet,
//       hands, head, shield, behind, weapon:[type,color]}
export function composite(vis) {
  const key = JSON.stringify(vis);
  let c = composites.get(key);
  if (c) return c;
  c = { canvas: document.createElement('canvas'), ready: false, oversize: null };
  c.canvas.width = 832; c.canvas.height = 1344;
  composites.set(key, c);

  const sex = vis.sex || 'male';
  const layers = []; // [file, isWeaponBg]
  const wep = vis.weapon ? weaponFiles(vis.weapon[0], vis.weapon[1], sex) : null;

  if (wep?.bg) layers.push(wep.bg);
  if (vis.behind) layers.push(gearFile('behind/quiver', sex, 'brown'));
  layers.push(pick(manifest.bodies, sex, vis.skin || 'light') || pick(manifest.bodies, sex, 'light'));
  layers.push(pick(manifest.heads, sex, vis.skin || 'light') || pick(manifest.heads, sex, 'light'));
  if (vis.hair && !vis.head) layers.push(pick(manifest.hair, vis.hair[0], sex, vis.hair[1]));
  if (vis.beard) layers.push(manifest.beard[vis.beard]);
  if (vis.feet) layers.push(gearFile('feet/' + vis.feet[0], sex, vis.feet[1]));
  if (vis.legs) layers.push(gearFile('legs/' + vis.legs[0], sex, vis.legs[1]));
  if (vis.torso) layers.push(gearFile('torso/' + vis.torso[0], sex, vis.torso[1]));
  if (vis.hands) layers.push(gearFile('hands/gloves', sex, vis.hands[1]));
  if (vis.head) layers.push(gearFile('head/' + vis.head[0], sex, vis.head[1]));
  if (vis.shield) layers.push(gearFile('shield/heater', sex, vis.shield[1]));
  if (wep?.fg) layers.push(wep.fg);
  if (wep?.perAnim) c.oversize = wep.perAnim; // spear overlays drawn at render time

  const files = layers.filter(Boolean);
  let pending = files.length;
  const ctx = c.canvas.getContext('2d');
  const drawAll = () => {
    ctx.clearRect(0, 0, 832, 1344);
    for (const f of files) {
      const im = img(f);
      if (im.complete && im.naturalWidth) ctx.drawImage(im, 0, 0, 832, Math.min(1344, im.naturalHeight), 0, 0, 832, Math.min(1344, im.naturalHeight));
    }
    c.ready = true;
  };
  for (const f of files) {
    const im = img(f);
    if (im.complete) { if (--pending === 0) drawAll(); }
    else im.addEventListener('load', () => { if (--pending === 0) drawAll(); }, { once: true });
    im.addEventListener('error', () => { if (--pending === 0) drawAll(); }, { once: true });
  }
  if (pending === 0) drawAll();
  return c;
}
function weaponFiles(type, color, sex = 'male') {
  const w = manifest.weapons[type];
  if (!w) return null;
  const out = { perAnim: w.perAnim || null, color };
  if (w.sexed) out.fg = w.sexed[sex] || Object.values(w.sexed).find(Boolean);       // tools (axe/pickaxe)
  else if (w.fg || w.bg) {
    out.fg = w.fg?.[color] || Object.values(w.fg || {}).find(Boolean);
    out.bg = w.bg?.[color] || (w.bg && Object.values(w.bg).find(Boolean));
  }
  return (out.fg || out.bg || out.perAnim) ? out : null;
}

// Draw a composited character. dir: 0 up,1 left,2 down,3 right.
export function drawChar(ctx, comp, anim, dir, frame, sx, sy, scale = 1) {
  if (!comp.ready) return;
  const a = ANIMS[anim] || ANIMS.idle;
  const row = a.nodir ? a.row : a.row + dir;
  const f = Math.min(frame, a.frames - 1);
  const S = FRAME * scale;
  ctx.drawImage(comp.canvas, f * FRAME, row * FRAME, FRAME, FRAME, sx - S / 2, sy - S + 12 * scale, S, S);
}
// Per-animation weapon overlays (sword slash, tool smash, spear thrust/walk,
// staff thrust, bow walk). Frame size derived from sheet height/4 so 64px and
// oversize (128/192px) sheets both work; the oversize frame is centred on the
// 64px body cell so weapon and body stay in perfect sync.
export function drawOversize(ctx, comp, vis, anim, dir, frame, sx, sy, scale = 1) {
  if (!comp.oversize) return;
  let set = comp.oversize[anim];
  let f = frame;
  if (!set && anim === 'idle' && comp.oversize.walk) { set = comp.oversize.walk; f = 0; } // idle = walk frame 0
  if (!set) return;
  const color = (vis.weapon && vis.weapon[1]) || 'steel';
  for (const part of ['bg', 'fg']) {
    const dict = set[part] || {};
    const file = dict[color] || Object.values(dict).find(Boolean);
    if (!file) continue;
    const im = img(file);
    if (!im.complete || !im.naturalWidth) continue;
    const fs = im.naturalHeight / 4;
    const cols = Math.floor(im.naturalWidth / fs);
    const a = ANIMS[anim === 'idle' ? 'walk' : anim] || ANIMS.idle;
    const ff = Math.min(f, Math.min(a.frames, cols) - 1);
    const S = fs * scale;
    ctx.drawImage(im, ff * fs, dir * fs, fs, fs, sx - S / 2, sy - (fs / 2 + 20) * scale, S, S);
  }
}

// ---------------------------------------------------------------------------
// Procedural pixel sprites (beasts, nodes, stations, items) — original art.
const procCache = new Map();
export function proc(key, w, h, fn) {
  let c = procCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  fn(g, w, h);
  procCache.set(key, c);
  return c;
}
function px(g, x, y, w, h, col) { g.fillStyle = col; g.fillRect(x | 0, y | 0, w, h); }

// Creatures face RIGHT (renderer mirrors left-facers). Each has a body colour,
// a lighter top highlight, a darker shade, and an outline for a clean silhouette.
const CRITTER_STYLE = {
  rat: { kind: 'quad', body: '#8a8072', hi: '#a89c8c', sh: '#645b50', size: 0.62, ears: 'round', tail: 'thin', snout: 'point' },
  rabbit: { kind: 'quad', body: '#b59a77', hi: '#e0cdb0', sh: '#8a7255', size: 0.55, ears: 'tall', tail: 'puff', snout: 'short', hop: true },
  boar: { kind: 'quad', body: '#5c4633', hi: '#7a5f45', sh: '#3e2f22', size: 0.92, ears: 'round', tail: 'thin', snout: 'boar', tusks: true, mane: true },
  wolf: { kind: 'quad', body: '#767a82', hi: '#9a9da5', sh: '#4e5158', size: 0.92, ears: 'point', tail: 'bush', snout: 'long' },
  icewolf: { kind: 'quad', body: '#c4d6e4', hi: '#eef6fb', sh: '#8fa8bc', size: 0.98, ears: 'point', tail: 'bush', snout: 'long', glow: '#bfe0ff' },
  panther: { kind: 'quad', body: '#26282f', hi: '#3c3f4a', sh: '#141519', size: 0.95, ears: 'round', tail: 'long', snout: 'short', sleek: true },
  goat: { kind: 'quad', body: '#cfc4b0', hi: '#e8e0d0', sh: '#a89a80', size: 0.72, ears: 'round', tail: 'thin', snout: 'short', horns: 'curl', beard: true },
  stag: { kind: 'quad', body: '#caa348', hi: '#f0d27a', sh: '#9a7a2a', size: 1.0, ears: 'point', tail: 'puff', snout: 'long', antlers: true, glow: '#ffe08a' },
  hawk: { kind: 'bird', body: '#8a6234', hi: '#c8a26a', sh: '#5e4222', size: 0.72 },
  serpent: { kind: 'snake', body: '#4a7040', hi: '#7ba05f', sh: '#2e4a28', size: 1.0 },
  leech: { kind: 'worm', body: '#42502e', hi: '#5f7440', sh: '#2a341c', size: 0.8 },
  treant: { kind: 'tree', bark: '#5a4326', barkHi: '#785c38', leaf: '#3e7a2e', leafHi: '#5aa03c', size: 1.05 },
  troll: { kind: 'brute', body: '#5e7150', hi: '#7e9070', sh: '#3e4c34', size: 1.1 },
  giant: { kind: 'brute', body: '#8fa8bc', hi: '#b8cbd9', sh: '#5e7284', size: 1.35, frost: true },
  sprite: { kind: 'wisp', body: '#9fd8ef', hi: '#e6f8ff', size: 0.6, glow: '#bfefff' },
  spider: { kind: 'spider', body: '#332838', hi: '#54425c', sh: '#1c141f', size: 0.82 },
};
const OUTLINE = '#1b1712';

function oval(g, x, y, rx, ry, fill, outline) {
  g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7);
  if (outline) { g.fillStyle = outline; g.beginPath(); g.ellipse(x, y, rx + 1, ry + 1, 0, 0, 7); g.fill(); }
  g.fillStyle = fill; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill();
}

export function critterSprite(type, frame = 0, dead = false) {
  const st = CRITTER_STYLE[type] || CRITTER_STYLE.rat;
  const key = `cr:${type}:${frame}:${dead ? 1 : 0}`;
  return proc(key, 64, 64, (g) => {
    g.save();
    if (dead) { g.globalAlpha = 0.55; g.translate(32, 48); g.rotate(1.2); g.translate(-32, -40); }
    const s = st.size;
    const swing = Math.sin(frame * 0.8);         // leg/wing swing
    const bob = Math.round(Math.abs(Math.cos(frame * 0.8)) * (st.hop ? 3 : 1.5));
    if (st.glow) { g.shadowColor = st.glow; g.shadowBlur = 9; }

    if (st.kind === 'quad') drawQuad(g, st, s, swing, bob, type);
    else if (st.kind === 'bird') drawBird(g, st, s, swing);
    else if (st.kind === 'snake') drawSnake(g, st, s, frame);
    else if (st.kind === 'worm') drawWorm(g, st, s, frame);
    else if (st.kind === 'tree') drawTreant(g, st, s, swing);
    else if (st.kind === 'brute') drawBrute(g, st, s, swing, bob);
    else if (st.kind === 'wisp') drawWisp(g, st, frame);
    else if (st.kind === 'spider') drawSpider(g, st, s, swing);

    g.shadowBlur = 0; g.restore();
  });
}

function eye(g, x, y, r = 1.6, glint = true) {
  px(g, x - r, y - r, r * 2, r * 2, '#0c0c10');
  if (glint) px(g, x, y - r, 1, 1, '#fff');
}

function drawQuad(g, st, s, swing, bob, type) {
  const cx = 30, cy = 40 - bob;
  const bw = 15 * s, bh = 8 * s;
  const legY = cy + bh - 1;
  const legLen = 6 * s, legW = Math.max(2, 3 * s);
  // legs (front + back pairs, opposed swing)
  const legs = [[cx - bw * 0.6, -swing], [cx - bw * 0.5, swing], [cx + bw * 0.55, swing], [cx + bw * 0.62, -swing]];
  for (const [lx, ph] of legs) {
    const off = ph * 2.2 * s;
    px(g, lx - legW / 2 - 1, legY, legW + 2, legLen + 1, OUTLINE);
    px(g, lx - legW / 2, legY, legW, legLen, st.sh);
  }
  // tail
  if (st.tail === 'bush') { oval(g, cx - bw - 3, cy + 1 - swing, 5 * s, 3.5 * s, st.body, OUTLINE); oval(g, cx - bw - 6, cy - 2 - swing, 3.5 * s, 2.6 * s, st.hi); }
  else if (st.tail === 'long') { g.strokeStyle = OUTLINE; g.lineWidth = 4 * s; g.beginPath(); g.moveTo(cx - bw + 2, cy); g.quadraticCurveTo(cx - bw - 8, cy - 4, cx - bw - 10, cy - 10 + swing * 2); g.stroke(); g.strokeStyle = st.body; g.lineWidth = 2.4 * s; g.stroke(); }
  else if (st.tail === 'puff') { oval(g, cx - bw - 1, cy + 1, 3 * s, 3 * s, '#f4efe4', OUTLINE); }
  else if (st.tail === 'thin') { g.strokeStyle = st.sh; g.lineWidth = 1.6; g.beginPath(); g.moveTo(cx - bw + 2, cy); g.quadraticCurveTo(cx - bw - 7, cy - 3, cx - bw - 9, cy + 3); g.stroke(); }
  // body
  oval(g, cx, cy, bw, bh, st.body, OUTLINE);
  oval(g, cx - 1, cy - bh * 0.4, bw * 0.82, bh * 0.5, st.hi);       // top highlight
  oval(g, cx, cy + bh * 0.55, bw * 0.7, bh * 0.28, st.sh);          // underside shade
  if (st.mane) { g.fillStyle = st.sh; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(cx + i * 3, cy - bh); g.lineTo(cx + i * 3 - 1, cy - bh - 4); g.lineTo(cx + i * 3 + 2, cy - bh); g.fill(); } }
  // head
  const hx = cx + bw + 2 * s, hy = cy - bh * 0.4;
  const hr = 5.5 * s;
  oval(g, hx, hy, hr, hr * 0.95, st.body, OUTLINE);
  oval(g, hx - hr * 0.3, hy - hr * 0.3, hr * 0.55, hr * 0.5, st.hi);
  // ears
  if (st.ears === 'tall') { for (const ex of [hx - 1, hx + 2]) { oval(g, ex, hy - hr - 3, 1.8 * s, 4.5 * s, st.body, OUTLINE); oval(g, ex, hy - hr - 3, 0.9 * s, 3 * s, '#e8b0b0'); } }
  else if (st.ears === 'point') { for (const [ex, ey] of [[hx - 2, hy - hr], [hx + 3, hy - hr - 1]]) { g.fillStyle = OUTLINE; g.beginPath(); g.moveTo(ex - 3, ey + 2); g.lineTo(ex + 1, ey - 5); g.lineTo(ex + 3, ey + 2); g.fill(); g.fillStyle = st.sh; g.beginPath(); g.moveTo(ex - 1.5, ey + 1); g.lineTo(ex + 0.5, ey - 3); g.lineTo(ex + 2, ey + 1); g.fill(); } }
  else if (st.ears === 'round') { for (const ex of [hx - 2, hx + 3]) oval(g, ex, hy - hr - 1, 2 * s, 2 * s, st.body, OUTLINE); }
  // snout
  if (st.snout === 'long' || st.snout === 'boar') { const sw = st.snout === 'boar' ? 5 * s : 4 * s; oval(g, hx + hr - 1, hy + 1, sw, 2.6 * s, st.body, OUTLINE); px(g, hx + hr + sw - 3, hy - 1, 2, 3, '#1c1418'); if (st.snout === 'boar') { px(g, hx + hr + sw - 2, hy - 1, 1, 1, '#222'); px(g, hx + hr + sw - 2, hy + 2, 1, 1, '#222'); } }
  else if (st.snout === 'point') { g.fillStyle = st.body; g.beginPath(); g.moveTo(hx + hr - 1, hy - 1); g.lineTo(hx + hr + 5 * s, hy + 1); g.lineTo(hx + hr - 1, hy + 3); g.fill(); px(g, hx + hr + 5 * s - 1, hy, 1.5, 1.5, '#d99'); }
  else oval(g, hx + hr - 1, hy + 1.5, 2.5 * s, 2 * s, st.hi);
  eye(g, hx + hr * 0.4, hy - 0.5, st.sleek ? 1.8 : 1.6);
  if (st.sleek) { g.strokeStyle = '#4c9a4c'; g.lineWidth = 1; g.beginPath(); g.moveTo(hx + hr * 0.4 - 2, hy - 1); g.lineTo(hx + hr * 0.4 + 2, hy - 1); g.stroke(); }
  // features
  if (st.tusks) { px(g, hx + hr + 1, hy + 3, 1.5, 3, '#f4ecd8'); px(g, hx + hr + 3, hy + 3, 1.5, 3, '#f4ecd8'); }
  if (st.beard) px(g, hx - 1, hy + hr - 1, 2, 4, '#e8e0d0');
  if (st.horns === 'curl') { for (const dx of [-1, 4]) { g.strokeStyle = '#e8dcc0'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(hx + dx, hy - hr + 1); g.quadraticCurveTo(hx + dx - 4, hy - hr - 5, hx + dx + 2, hy - hr - 7); g.stroke(); } }
  if (st.antlers) { g.strokeStyle = '#b98a3c'; g.lineWidth = 2; g.shadowColor = '#ffe08a'; g.shadowBlur = 6; for (const dx of [-2, 4]) { g.beginPath(); g.moveTo(hx + dx, hy - hr); g.lineTo(hx + dx - 2, hy - hr - 7); g.moveTo(hx + dx - 2, hy - hr - 4); g.lineTo(hx + dx - 5, hy - hr - 5); g.moveTo(hx + dx - 1, hy - hr - 6); g.lineTo(hx + dx + 2, hy - hr - 9); g.stroke(); } g.shadowBlur = 0; }
}

function drawBird(g, st, s, swing) {
  const cx = 32, cy = 36;
  const flap = swing * 6;
  // far wing
  g.fillStyle = st.sh; g.beginPath(); g.moveTo(cx, cy); g.quadraticCurveTo(cx - 14, cy - 6 - flap, cx - 20, cy + 2 - flap); g.quadraticCurveTo(cx - 10, cy + 2, cx, cy + 3); g.fill();
  // body
  oval(g, cx, cy, 6 * s, 8 * s, st.body, OUTLINE);
  oval(g, cx, cy + 3, 4 * s, 4 * s, st.hi);
  // head
  oval(g, cx + 1, cy - 8 * s, 4 * s, 4 * s, st.body, OUTLINE);
  eye(g, cx + 3, cy - 8 * s - 1);
  // beak
  g.fillStyle = '#e0a83c'; g.beginPath(); g.moveTo(cx + 5 * s, cy - 8 * s); g.lineTo(cx + 10 * s, cy - 7 * s); g.lineTo(cx + 5 * s, cy - 6 * s); g.fill();
  // near wing (animated)
  g.fillStyle = st.body; g.strokeStyle = OUTLINE; g.lineWidth = 1;
  g.beginPath(); g.moveTo(cx, cy - 2); g.quadraticCurveTo(cx + 16, cy - 8 - flap, cx + 22, cy + 2 - flap); g.quadraticCurveTo(cx + 12, cy + 3, cx, cy + 2); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = st.hi; g.beginPath(); g.moveTo(cx + 2, cy - 1); g.quadraticCurveTo(cx + 12, cy - 5 - flap, cx + 17, cy + 1 - flap); g.quadraticCurveTo(cx + 9, cy + 1, cx + 2, cy + 1); g.fill();
  // tail feathers
  g.fillStyle = st.sh; g.beginPath(); g.moveTo(cx - 5, cy + 4); g.lineTo(cx - 12, cy + 9); g.lineTo(cx - 4, cy + 8); g.fill();
}

function drawSnake(g, st, s, frame) {
  g.strokeStyle = OUTLINE; g.lineWidth = 9 * s;
  g.lineCap = 'round';
  const path = (lw, col) => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(12, 44); for (let i = 0; i <= 8; i++) { const x = 12 + i * 4.6; const y = 40 + Math.sin(i * 0.9 + frame * 0.5) * 5 * s; g.lineTo(x, y); } g.stroke(); };
  path(9 * s, OUTLINE); path(6.5 * s, st.body);
  // highlight ridge
  g.strokeStyle = st.hi; g.lineWidth = 2 * s; g.beginPath(); g.moveTo(12, 42); for (let i = 0; i <= 8; i++) { const x = 12 + i * 4.6; const y = 38 + Math.sin(i * 0.9 + frame * 0.5) * 5 * s; g.lineTo(x, y); } g.stroke();
  // head
  const hx = 12 + 8 * 4.6, hy = 40 + Math.sin(8 * 0.9 + frame * 0.5) * 5 * s;
  oval(g, hx + 2, hy, 5 * s, 3.6 * s, st.body, OUTLINE);
  eye(g, hx + 4, hy - 1, 1.3);
  // forked tongue
  g.strokeStyle = '#d33'; g.lineWidth = 1; g.beginPath(); g.moveTo(hx + 6, hy); g.lineTo(hx + 10, hy - 1); g.moveTo(hx + 6, hy); g.lineTo(hx + 10, hy + 1); g.stroke();
}

function drawWorm(g, st, s, frame) {
  for (let i = 6; i >= 0; i--) {
    const x = 18 + i * 4, y = 42 - Math.sin(i * 0.8 + frame * 0.6) * 3 * s;
    const r = (i === 6 ? 6 : 5 - i * 0.2) * s;
    oval(g, x, y, r, r * 0.9, i === 6 ? st.hi : st.body, OUTLINE);
  }
  eye(g, 18 + 6 * 4 + 2, 42 - Math.sin(6 * 0.8 + frame * 0.6) * 3 * s - 1, 1.3);
  // sucker mouth
  oval(g, 18 + 6 * 4 + 4, 42, 2, 2.4, '#7a1f1f');
}

function drawTreant(g, st, s, swing) {
  const cx = 32;
  // root legs
  for (const dx of [-6, 6]) { px(g, cx + dx - 2, 50 + (dx > 0 ? swing : -swing), 5, 8, OUTLINE); px(g, cx + dx - 1, 50 + (dx > 0 ? swing : -swing), 3, 7, st.bark); }
  // trunk
  px(g, cx - 6, 30, 13, 22, OUTLINE);
  px(g, cx - 5, 30, 11, 21, st.bark);
  px(g, cx - 5, 30, 4, 21, st.barkHi);
  // bark cracks
  g.strokeStyle = st.barkHi; g.lineWidth = 1; g.beginPath(); g.moveTo(cx + 1, 32); g.lineTo(cx, 48); g.stroke();
  // arms
  g.strokeStyle = OUTLINE; g.lineWidth = 5; g.beginPath(); g.moveTo(cx - 5, 34); g.lineTo(cx - 13, 30 + swing * 2); g.moveTo(cx + 6, 34); g.lineTo(cx + 14, 30 - swing * 2); g.stroke();
  g.strokeStyle = st.bark; g.lineWidth = 3; g.stroke();
  // canopy
  oval(g, cx, 22, 15 * s, 11 * s, st.leaf, '#24401f');
  oval(g, cx - 6, 18, 8 * s, 6 * s, st.leafHi);
  oval(g, cx + 7, 20, 7 * s, 5 * s, st.leafHi);
  // face
  eye(g, cx - 3, 40, 1.8); eye(g, cx + 3, 40, 1.8);
  g.fillStyle = '#e6c890'; px(g, cx - 3, 40 - 2, 1, 1, '#e6c890'); px(g, cx + 3, 40 - 2, 1, 1, '#e6c890');
  g.strokeStyle = '#2a1e12'; g.lineWidth = 1.4; g.beginPath(); g.arc(cx, 44, 3, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
}

function drawBrute(g, st, s, swing, bob) {
  const cx = 32, top = 20 - bob;
  // legs
  for (const dx of [-5, 5]) { const off = dx > 0 ? swing * 2 : -swing * 2; px(g, cx + dx - 3, 46 + off, 7, 10 - off, OUTLINE); px(g, cx + dx - 2, 46 + off, 5, 9 - off, st.sh); }
  // torso
  oval(g, cx, 38, 11 * s, 10 * s, st.body, OUTLINE);
  oval(g, cx - 3, 33, 6 * s, 6 * s, st.hi);
  oval(g, cx, 43, 8 * s, 4 * s, st.sh);
  // arms (big, knuckle-dragging)
  g.strokeStyle = OUTLINE; g.lineWidth = 7; g.lineCap = 'round';
  g.beginPath(); g.moveTo(cx - 8, 34); g.lineTo(cx - 13, 46 + swing * 3); g.moveTo(cx + 8, 34); g.lineTo(cx + 13, 46 - swing * 3); g.stroke();
  g.strokeStyle = st.body; g.lineWidth = 5; g.stroke();
  oval(g, cx - 13, 47 + swing * 3, 4, 4, st.sh, OUTLINE); oval(g, cx + 13, 47 - swing * 3, 4, 4, st.sh, OUTLINE);
  // head
  oval(g, cx, top + 6, 7 * s, 6.5 * s, st.body, OUTLINE);
  oval(g, cx - 2, top + 3, 3.5 * s, 3 * s, st.hi);
  eye(g, cx - 3, top + 6, 1.6); eye(g, cx + 3, top + 6, 1.6);
  // brow + mouth
  g.strokeStyle = st.sh; g.lineWidth = 2; g.beginPath(); g.moveTo(cx - 6, top + 3); g.lineTo(cx + 6, top + 3); g.stroke();
  g.strokeStyle = '#2a1a1a'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(cx - 4, top + 10); g.lineTo(cx + 4, top + 10); g.stroke();
  // tusks / frost
  px(g, cx - 3, top + 9, 1.5, 3, '#f4ecd8'); px(g, cx + 2, top + 9, 1.5, 3, '#f4ecd8');
  if (st.frost) { g.shadowColor = '#bfe0ff'; g.shadowBlur = 8; oval(g, cx, 38, 11 * s, 10 * s, 'rgba(200,230,255,0.10)'); g.shadowBlur = 0; }
}

function drawWisp(g, st, frame) {
  const cx = 32, cy = 36 + Math.sin(frame * 0.5) * 3;
  g.shadowColor = st.glow; g.shadowBlur = 14;
  oval(g, cx, cy, 6, 6, st.body);
  oval(g, cx, cy, 3.4, 3.4, st.hi);
  g.shadowBlur = 6;
  for (let i = 0; i < 5; i++) { const a = frame * 0.4 + i * 1.256; px(g, cx + Math.cos(a) * 10, cy + Math.sin(a) * 8, 2, 2, st.hi); }
  g.shadowBlur = 0;
  eye(g, cx - 1.5, cy - 1, 1); eye(g, cx + 2.5, cy - 1, 1);
}

function drawSpider(g, st, s, swing) {
  const cx = 32, cy = 40;
  // 8 legs (4 per side, animated)
  g.strokeStyle = OUTLINE; g.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const ph = ((i % 2) ? swing : -swing) * 3;
    const ly = cy - 4 + i * 3;
    g.beginPath(); g.moveTo(cx - 3, ly); g.lineTo(cx - 12, ly - 4 + ph); g.stroke();
    g.beginPath(); g.moveTo(cx + 3, ly); g.lineTo(cx + 12, ly - 4 - ph); g.stroke();
  }
  // abdomen + head
  oval(g, cx - 2, cy + 2, 8 * s, 7 * s, st.body, OUTLINE);
  oval(g, cx - 3, cy, 4 * s, 3 * s, st.hi);
  oval(g, cx + 7 * s, cy - 2, 4.5 * s, 4 * s, st.body, OUTLINE);
  // cluster of eyes
  eye(g, cx + 7 * s + 1, cy - 3, 1.1); eye(g, cx + 7 * s + 3, cy - 2.5, 1.1);
  px(g, cx + 7 * s, cy - 1, 1, 1, '#a33'); px(g, cx + 7 * s + 3, cy - 1, 1, 1, '#a33');
}

// ---- gather nodes / stations -------------------------------------------------
const TREE_STYLE = {
  tree: ['#79a95a', '#4a7a34', 14], oak_tree: ['#5e8a3c', '#3c6424', 18],
  willow_tree: ['#8fb573', '#5f8a4c', 16], maple_tree: ['#c98a3c', '#8a5a24', 16],
  yew_tree: ['#3c5e34', '#24401f', 17], elm_tree: ['#6e9a4c', '#48682f', 20],
  frostpine_tree: ['#cfe0da', '#8fb0a5', 16],
};
const ROCK_STYLE = {
  copper_rock: '#b87333', tin_rock: '#a8a8b0', iron_rock: '#8a6a5a', coal_rock: '#3a3a3e',
  silver_rock: '#cfd4dc', gold_rock: '#e0b93c', sylvanite_rock: '#7fe07f', essence_rock: '#b09fe0',
};
export function nodeSprite(type, off = false) {
  const key = `nd:${type}:${off ? 1 : 0}`;
  return proc(key, 64, 80, (g) => {
    if (TREE_STYLE[type]) {
      const [lite, dark, r] = TREE_STYLE[type];
      if (off) { // stump
        px(g, 28, 60, 9, 8, '#7a5f3c'); px(g, 27, 58, 11, 4, '#a8895c');
        return;
      }
      px(g, 29, 44, 7, 26, '#6e522f');
      if (type === 'frostpine_tree') {
        g.fillStyle = dark;
        for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(32, 4 + i * 12); g.lineTo(16 + i * 2, 30 + i * 11); g.lineTo(48 - i * 2, 30 + i * 11); g.fill(); }
        g.fillStyle = lite; g.beginPath(); g.moveTo(32, 2); g.lineTo(22, 22); g.lineTo(42, 22); g.fill();
      } else {
        g.fillStyle = dark; g.beginPath(); g.arc(32, 30, r, 0, 7); g.fill();
        g.fillStyle = lite; g.beginPath(); g.arc(28, 25, r * 0.72, 0, 7); g.fill();
        if (type === 'oak_tree') { g.fillStyle = dark; g.beginPath(); g.arc(42, 26, r * 0.5, 0, 7); g.fill(); }
      }
    } else if (ROCK_STYLE[type]) {
      const col = ROCK_STYLE[type];
      g.fillStyle = off ? '#55504a' : '#6e6a62';
      g.beginPath(); g.moveTo(12, 68); g.lineTo(20, 48); g.lineTo(34, 42); g.lineTo(50, 50); g.lineTo(54, 68); g.fill();
      if (!off) { g.fillStyle = col; px(g, 24, 52, 5, 4, col); px(g, 36, 50, 6, 5, col); px(g, 30, 60, 4, 4, col); g.shadowColor = col; g.shadowBlur = 4; px(g, 42, 58, 4, 3, col); g.shadowBlur = 0; }
    } else switch (type) {
      case 'net_spot': case 'rod_spot': case 'harpoon_spot': {
        g.strokeStyle = '#bfe8f8'; g.lineWidth = 2;
        g.beginPath(); g.ellipse(32, 64, 13, 6, 0, 0, 7); g.stroke();
        g.beginPath(); g.ellipse(32, 64, 7, 3, 0, 0, 7); g.stroke();
        px(g, 30, 60, 3, 3, '#e8f6fc');
        break;
      }
      case 'bank_booth': { px(g, 14, 44, 36, 22, '#6b5322'); px(g, 16, 40, 32, 6, '#8a6d1d'); px(g, 20, 50, 24, 4, '#ffd75e'); break; }
      case 'ge_booth': { px(g, 10, 40, 44, 28, '#55431c'); px(g, 12, 34, 40, 8, '#d8a827'); px(g, 18, 48, 12, 10, '#ffe98a'); px(g, 34, 48, 12, 10, '#ffe98a'); break; }
      case 'anvil': { px(g, 22, 56, 22, 6, '#3a3a3e'); px(g, 26, 50, 12, 7, '#52525c'); px(g, 18, 48, 10, 4, '#52525c'); break; }
      case 'furnace': { px(g, 18, 38, 28, 30, '#7a6a5c'); px(g, 26, 52, 12, 14, '#2a1c10'); px(g, 28, 56, 8, 9, off ? '#402a14' : '#ff7a2a'); break; }
      case 'range': { px(g, 18, 46, 28, 20, '#5c5650'); px(g, 22, 50, 20, 6, '#ff8c3a'); px(g, 20, 42, 6, 6, '#3a3a3e'); break; }
      case 'campfire': { px(g, 22, 62, 20, 5, '#6e522f'); g.fillStyle = '#ff9b2a'; g.beginPath(); g.moveTo(32, 42); g.lineTo(24, 62); g.lineTo(40, 62); g.fill(); g.fillStyle = '#ffe27a'; g.beginPath(); g.moveTo(32, 50); g.lineTo(28, 62); g.lineTo(37, 62); g.fill(); break; }
      case 'chapel_altar': { px(g, 20, 46, 24, 20, '#b9b3a4'); px(g, 16, 42, 32, 6, '#d5cfc0'); px(g, 30, 30, 4, 14, '#d5cfc0'); px(g, 26, 34, 12, 4, '#d5cfc0'); break; }
      case 'air_altar': case 'earth_altar': case 'water_altar': case 'fire_altar': case 'nature_altar': case 'cosmic_altar': case 'blood_altar': {
        const cols = { air: '#cfe8f8', earth: '#b08a4c', water: '#4c8ab0', fire: '#e06a2a', nature: '#5aa03c', cosmic: '#b07fe0', blood: '#c03a3a' };
        const c = cols[type.split('_')[0]];
        px(g, 18, 52, 28, 14, '#7a7468');
        g.shadowColor = c; g.shadowBlur = 10;
        px(g, 27, 34, 10, 20, c);
        g.shadowBlur = 0;
        break;
      }
      case 'obelisk': { g.shadowColor = '#9fe0cf'; g.shadowBlur = 8; g.fillStyle = '#5e7a72'; g.beginPath(); g.moveTo(32, 18); g.lineTo(42, 66); g.lineTo(22, 66); g.fill(); px(g, 29, 34, 6, 6, '#c9fce9'); g.shadowBlur = 0; break; }
      case 'museum_bench': { px(g, 14, 52, 36, 8, '#8a6d4c'); px(g, 16, 60, 4, 8, '#6b5322'); px(g, 44, 60, 4, 8, '#6b5322'); px(g, 20, 46, 10, 6, '#d8cfa8'); px(g, 34, 46, 8, 6, '#b0b8c8'); break; }
      case 'allotment': case 'herb_patch': { px(g, 12, 52, 40, 16, '#5a4326'); for (let i = 0; i < 4; i++) px(g, 16 + i * 10, 54, 6, 2, '#3e2f1a'); if (type === 'herb_patch') for (let i = 0; i < 3; i++) px(g, 18 + i * 12, 48, 4, 5, '#5aa03c'); break; }
      case 'bakery_stall': case 'fur_stall': case 'silver_stall': case 'gem_stall': {
        const c = { bakery_stall: '#e0b93c', fur_stall: '#a8703c', silver_stall: '#cfd4dc', gem_stall: '#7fd0e0' }[type];
        px(g, 14, 48, 36, 18, '#6b5322');
        px(g, 12, 40, 40, 9, c);
        px(g, 20, 52, 8, 5, c); px(g, 34, 52, 9, 5, c);
        break;
      }
      case 'rabbit_run': case 'fox_trail': case 'deer_track': case 'sable_run': { px(g, 18, 58, 28, 10, '#7a6a4c'); px(g, 24, 54, 16, 6, '#4a3a24'); g.fillStyle = '#3a2d1a'; g.beginPath(); g.ellipse(32, 64, 7, 3, 0, 0, 7); g.fill(); break; }
      case 'roman_ruin': case 'saxon_barrow': case 'druid_circle': case 'norman_keep': case 'grail_shrine': {
        px(g, 14, 56, 36, 10, '#8a8474');
        px(g, 18, 44, 8, 14, '#a8a294'); px(g, 38, 40, 8, 18, '#a8a294');
        px(g, 30, 36, 4, 10, '#d8a827');
        break;
      }
      case 'dungeon_entrance': { g.fillStyle = '#2a2420'; g.beginPath(); g.arc(32, 60, 16, Math.PI, 0); g.fill(); px(g, 18, 60, 28, 6, '#181410'); px(g, 24, 50, 4, 4, '#e06a2a'); px(g, 38, 52, 3, 3, '#e06a2a'); break; }
      case 'house_portal': { g.shadowColor = '#c77ce7'; g.shadowBlur = 10; g.strokeStyle = '#c77ce7'; g.lineWidth = 3; g.beginPath(); g.ellipse(32, 46, 12, 20, 0, 0, 7); g.stroke(); g.fillStyle = '#5e2a7050'; g.beginPath(); g.ellipse(32, 46, 10, 17, 0, 0, 7); g.fill(); g.shadowBlur = 0; break; }
      case 'log_balance': { px(g, 8, 56, 48, 7, '#6e522f'); px(g, 8, 56, 48, 2, '#8a6d42'); break; }
      case 'stepping_stones': { for (let i = 0; i < 3; i++) px(g, 12 + i * 16, 56 + (i % 2) * 4, 10, 6, '#8a8474'); break; }
      case 'cliff_scramble': { g.fillStyle = '#7a7468'; g.beginPath(); g.moveTo(10, 68); g.lineTo(30, 30); g.lineTo(54, 68); g.fill(); px(g, 28, 44, 4, 3, '#d8cfa8'); px(g, 36, 54, 4, 3, '#d8cfa8'); break; }
      case 'rope_swing': { px(g, 30, 10, 3, 44, '#a8895c'); px(g, 26, 52, 10, 4, '#6e522f'); break; }
      case 'ice_traverse': { g.fillStyle = '#cfe8f8aa'; g.beginPath(); g.moveTo(10, 66); g.lineTo(32, 40); g.lineTo(54, 66); g.fill(); break; }
      case 'archery_butt': { g.fillStyle = '#e8dcc0'; g.beginPath(); g.arc(32, 48, 14, 0, 7); g.fill(); g.fillStyle = '#c03a3a'; g.beginPath(); g.arc(32, 48, 9, 0, 7); g.fill(); g.fillStyle = '#e8dcc0'; g.beginPath(); g.arc(32, 48, 4, 0, 7); g.fill(); px(g, 28, 62, 10, 6, '#6e522f'); break; }
      default: { px(g, 26, 50, 12, 12, '#8a8474'); }
    }
  });
}

// ---- item icons ---------------------------------------------------------------
import { ITEMS } from '/shared/data/items.js';
export function itemIcon(id) {
  const key = `it:${id}`;
  return proc(key, 32, 32, (g) => {
    const def = ITEMS[id] || {};
    const name = id;
    const metal = { copper: '#b87333', bronze: '#a97142', iron: '#9a9aa4', steel: '#c8ccd4', damasked: '#c9a23c', silversteel: '#e0e4ec', sylvan: '#e0b93c' };
    const m = Object.keys(metal).find(k => name.startsWith(k));
    const col = m ? metal[m] : '#c8b48a';
    if (name.includes('sword') || name.includes('dagger') || name.includes('blade')) {
      px(g, 14, 4, 4, 16, col); px(g, 10, 20, 12, 3, '#6b5322'); px(g, 14, 23, 4, 6, '#6b5322');
    } else if (name.includes('spear')) { px(g, 15, 2, 3, 24, '#8a6d4c'); g.fillStyle = col; g.beginPath(); g.moveTo(16, 0); g.lineTo(11, 8); g.lineTo(21, 8); g.fill(); }
    else if (name.includes('pickaxe')) { px(g, 15, 8, 3, 20, '#8a6d4c'); px(g, 6, 6, 20, 4, col); }
    else if (name.includes('hatchet')) { px(g, 15, 8, 3, 20, '#8a6d4c'); px(g, 16, 4, 9, 8, col); }
    else if (name.includes('bow')) { g.strokeStyle = '#8a6d4c'; g.lineWidth = 3; g.beginPath(); g.arc(10, 16, 12, -1.2, 1.2); g.stroke(); g.strokeStyle = '#e8dcc0'; g.lineWidth = 1; g.beginPath(); g.moveTo(14, 5); g.lineTo(14, 27); g.stroke(); }
    else if (name.includes('arrow') && !name.includes('shafts') && !name.includes('headless')) { px(g, 8, 15, 18, 2, '#8a6d4c'); g.fillStyle = col; g.beginPath(); g.moveTo(30, 16); g.lineTo(24, 12); g.lineTo(24, 20); g.fill(); px(g, 5, 13, 4, 6, '#c8d4e0'); }
    else if (name.includes('staff')) { px(g, 14, 4, 4, 24, '#8a6d4c'); g.fillStyle = '#9fd8ef'; g.beginPath(); g.arc(16, 5, 4, 0, 7); g.fill(); }
    else if (name.includes('rune')) { px(g, 8, 8, 16, 16, '#d5cfc0'); g.fillStyle = { air: '#9ad2e8', earth: '#b08a4c', water: '#4c8ab0', fire: '#e06a2a', nature: '#5aa03c', cosmic: '#b07fe0', blood: '#c03a3a' }[name.split('_')[0]] || '#888'; px(g, 12, 12, 8, 8, g.fillStyle); }
    else if (name.includes('helm') || name.includes('coif') || name.includes('hood')) { g.fillStyle = col; g.beginPath(); g.arc(16, 16, 10, Math.PI, 0); g.fill(); px(g, 6, 16, 20, 4, col); }
    else if (name.includes('platebody') || name.includes('body') || name.includes('tunic') || name.includes('shirt') || name.includes('robe_top') || name.includes('vestment')) { px(g, 8, 8, 16, 16, col); px(g, 4, 8, 5, 10, col); px(g, 23, 8, 5, 10, col); }
    else if (name.includes('legs') || name.includes('chaps') || name.includes('skirt') || name.includes('trousers')) { px(g, 10, 6, 12, 8, col); px(g, 10, 14, 5, 12, col); px(g, 17, 14, 5, 12, col); }
    else if (name.includes('boots')) { px(g, 8, 14, 7, 12, col); px(g, 18, 14, 7, 12, col); px(g, 8, 24, 10, 4, col); }
    else if (name.includes('gauntlet') || name.includes('glove')) { px(g, 10, 8, 12, 14, col); px(g, 8, 12, 4, 8, col); }
    else if (name.includes('shield')) { g.fillStyle = col; g.beginPath(); g.moveTo(16, 4); g.lineTo(26, 8); g.lineTo(24, 20); g.lineTo(16, 28); g.lineTo(8, 20); g.lineTo(6, 8); g.fill(); }
    else if (name.includes('amulet')) { g.strokeStyle = '#e0b93c'; g.lineWidth = 2; g.beginPath(); g.arc(16, 12, 8, 0, 7); g.stroke(); px(g, 13, 18, 6, 8, name.includes('sapphire') ? '#3c6ee0' : name.includes('emerald') ? '#3ca03c' : name.includes('ruby') ? '#c03a3a' : name.includes('diamond') ? '#e8f4fc' : '#e0b93c'); }
    else if (name.includes('ore')) { g.fillStyle = '#6e6a62'; g.beginPath(); g.arc(16, 18, 10, 0, 7); g.fill(); px(g, 12, 14, 4, 4, ROCK_STYLE[name.replace('_ore', '_rock')] || '#c8b48a'); px(g, 18, 20, 4, 4, ROCK_STYLE[name.replace('_ore', '_rock')] || '#c8b48a'); }
    else if (name === 'coal') { g.fillStyle = '#2c2c30'; g.beginPath(); g.arc(16, 18, 9, 0, 7); g.fill(); }
    else if (name.includes('bar')) { px(g, 6, 12, 20, 9, col); px(g, 6, 12, 20, 3, '#ffffff30'); }
    else if (name.includes('logs')) { px(g, 6, 14, 20, 7, '#8a6d4c'); px(g, 24, 12, 6, 11, '#a8895c'); }
    else if (name.startsWith('raw_')) { px(g, 8, 12, 16, 8, '#9ab8c8'); g.fillStyle = '#9ab8c8'; g.beginPath(); g.moveTo(24, 16); g.lineTo(30, 10); g.lineTo(30, 22); g.fill(); px(g, 11, 14, 2, 2, '#111'); }
    else if (name.startsWith('cooked_') || name === 'venison') { px(g, 8, 12, 16, 8, '#d8935a'); g.fillStyle = '#d8935a'; g.beginPath(); g.moveTo(24, 16); g.lineTo(30, 10); g.lineTo(30, 22); g.fill(); }
    else if (name.startsWith('burnt_')) { px(g, 8, 12, 16, 8, '#333'); }
    else if (name === 'bread') { g.fillStyle = '#d8a85a'; g.beginPath(); g.ellipse(16, 16, 11, 7, 0, 0, 7); g.fill(); px(g, 10, 13, 12, 2, '#e8cc8a'); }
    else if (name.includes('stew')) { px(g, 8, 14, 16, 10, '#8a6d4c'); px(g, 10, 12, 12, 4, '#b06a3c'); }
    else if (name.includes('potion') || name.includes('elixir') || name.includes('restore') || name === 'vial_water') {
      g.fillStyle = name === 'vial_water' ? '#9ad2e8' : name.includes('attack') ? '#e06a2a' : name.includes('strength') ? '#c03a3a' : name.includes('defence') ? '#4c8ab0' : name.includes('rang') ? '#5aa03c' : name.includes('magic') ? '#b07fe0' : name.includes('prayer') ? '#9ad2e8' : '#e0b93c';
      px(g, 12, 12, 8, 14, g.fillStyle); px(g, 13, 8, 6, 5, '#c8d4dc'); px(g, 14, 6, 4, 3, '#8a6d4c');
    } else if (name.startsWith('grimy_')) { px(g, 10, 10, 12, 12, '#4a5a3a'); px(g, 13, 13, 6, 6, '#3a4a2c'); }
    else if (name.startsWith('clean_')) { g.fillStyle = '#5aa03c'; g.beginPath(); g.ellipse(16, 16, 5, 10, 0.6, 0, 7); g.fill(); }
    else if (name.includes('seed')) { g.fillStyle = '#b08a4c'; for (let i = 0; i < 5; i++) px(g, 10 + (i % 3) * 5, 12 + ((i / 3) | 0) * 6, 3, 4, '#b08a4c'); }
    else if (name.includes('bones')) { px(g, 8, 14, 16, 4, '#e8e0d0'); g.fillStyle = '#e8e0d0'; g.beginPath(); g.arc(8, 16, 4, 0, 7); g.arc(24, 16, 4, 0, 7); g.fill(); }
    else if (name.includes('fur') || name.includes('pelt') || name.includes('hide') || name.includes('leather')) { g.fillStyle = name.includes('wolf') ? '#6a6d75' : name.includes('fox') ? '#c86a2a' : '#a8814f'; g.beginPath(); g.moveTo(8, 8); g.lineTo(24, 8); g.lineTo(26, 24); g.lineTo(16, 28); g.lineTo(6, 24); g.fill(); }
    else if (name === 'coins') { g.fillStyle = '#d8a827'; g.beginPath(); g.arc(12, 18, 7, 0, 7); g.fill(); g.beginPath(); g.arc(20, 14, 7, 0, 7); g.fill(); g.fillStyle = '#ffe98a'; g.beginPath(); g.arc(20, 14, 4, 0, 7); g.fill(); }
    else if (name.includes('charm')) { g.fillStyle = { verdant_charm: '#5aa03c', amber_charm: '#e0b93c', cobalt_charm: '#3c6ee0', crimson_charm: '#c03a3a' }[name] || '#888'; g.beginPath(); g.moveTo(16, 4); g.lineTo(26, 16); g.lineTo(16, 28); g.lineTo(6, 16); g.fill(); }
    else if (name.includes('pouch')) { px(g, 8, 10, 16, 16, '#8a6d4c'); px(g, 12, 6, 8, 6, '#6b5322'); px(g, 14, 16, 4, 4, '#5aa03c'); }
    else if (name === 'spirit_shard') { g.fillStyle = '#9fd8ef'; g.beginPath(); g.moveTo(16, 4); g.lineTo(22, 16); g.lineTo(16, 28); g.lineTo(10, 16); g.fill(); }
    else if (['sapphire', 'emerald', 'ruby', 'diamond'].includes(name)) { g.fillStyle = { sapphire: '#3c6ee0', emerald: '#3ca03c', ruby: '#c03a3a', diamond: '#e8f4fc' }[name]; g.beginPath(); g.moveTo(16, 6); g.lineTo(25, 14); g.lineTo(16, 26); g.lineTo(7, 14); g.fill(); px(g, 12, 10, 4, 3, '#ffffff60'); }
    else if (name.includes('key')) { g.strokeStyle = '#d8a827'; g.lineWidth = 3; g.beginPath(); g.arc(11, 12, 5, 0, 7); g.stroke(); px(g, 14, 14, 12, 3, '#d8a827'); px(g, 22, 17, 3, 4, '#d8a827'); }
    else if (name.includes('letter')) { px(g, 6, 10, 20, 14, '#e8e0d0'); g.strokeStyle = '#8a6d4c'; g.beginPath(); g.moveTo(6, 10); g.lineTo(16, 18); g.lineTo(26, 10); g.stroke(); }
    else if (def.tool) { px(g, 14, 6, 4, 18, '#8a6d4c'); px(g, 10, 22, 12, 5, '#9a9aa4'); }
    else { px(g, 9, 9, 14, 14, '#8d7a4b'); px(g, 12, 12, 8, 8, '#c8b48a'); }
  });
}

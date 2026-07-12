// Sprite system.
// 1) LPC paperdoll compositor: every humanoid (players, NPCs, humanoid mobs) is
//    composited from free LPC layers (body/head/hair/gear/weapon) onto a cached
//    832x1344 sheet — so equipping gear genuinely changes the sprite, and all
//    layers share the same frame grid: animation flow stays continuous.
// 2) Procedural pixel art for beasts, gather nodes, stations and items.

export const FRAME = 64;
export const SHEET_ROWS = 26; // rows 0-20 classic + 21 climb (unused) + 22-25 idle
export const ANIMS = {
  spellcast: { row: 0, frames: 7, ms: 90, once: true },
  thrust: { row: 4, frames: 8, ms: 90, once: true },
  walk: { row: 8, frames: 9, ms: 70 },
  slash: { row: 12, frames: 6, ms: 90, once: true },
  shoot: { row: 16, frames: 13, ms: 60, once: true },
  hurt: { row: 20, frames: 6, ms: 110, once: true, nodir: true },
  idle: { row: 22, frames: 2, ms: 650 }, // gentle breathing (LPC expanded rows 22-25)
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
  c.canvas.width = 832; c.canvas.height = SHEET_ROWS * FRAME;
  composites.set(key, c);

  const sex = vis.sex || 'male';
  const layers = []; // [file, isWeaponBg]
  const wep = vis.weapon ? weaponFiles(vis.weapon[0], vis.weapon[1], sex) : null;

  if (wep?.bg) layers.push(wep.bg);
  if (vis.behind) layers.push(gearFile('behind/quiver', sex, 'brown'));
  layers.push(pick(manifest.bodies, sex, vis.skin || 'light') || pick(manifest.bodies, sex, 'light'));
  if (vis.monster) { // beast-folk: goblin/orc/minotaur/lizard/wolf heads
    const mh = manifest.monsters?.[vis.monster];
    layers.push(mh?.[vis.skin] || (mh && Object.values(mh).find(Boolean)));
  } else {
    layers.push(pick(manifest.heads, sex, vis.skin || 'light') || pick(manifest.heads, sex, 'light'));
  }
  if (vis.hair && !vis.head && !vis.monster) layers.push(pick(manifest.hair, vis.hair[0], sex, vis.hair[1]));
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
  const H = SHEET_ROWS * FRAME;
  const drawAll = () => {
    ctx.clearRect(0, 0, 832, H);
    for (const spec of files) {
      const f = typeof spec === 'string' ? spec : spec.f;
      const im = img(f);
      if (!im.complete || !im.naturalWidth) continue;
      const h = Math.min(H, im.naturalHeight);
      const src = spec.tint ? tinted(im, spec.tint) : im;
      ctx.drawImage(src, 0, 0, 832, h, 0, 0, 832, h);
      // Legacy 21-row sheets (bows, staves, quivers, tools) have no idle rows —
      // synthesize idle art from their walk frame 0 so held items never vanish
      // while standing, and layer order is preserved.
      if (im.naturalHeight <= 21 * FRAME + 8) {
        for (let d = 0; d < 4; d++)
          for (let f2 = 0; f2 < 2; f2++)
            ctx.drawImage(src, 0, (8 + d) * FRAME, FRAME, FRAME, f2 * FRAME, (22 + d) * FRAME, FRAME, FRAME);
      }
    }
    c.ready = true;
  };
  for (const spec of files) {
    const im = img(typeof spec === 'string' ? spec : spec.f);
    if (im.complete) { if (--pending === 0) drawAll(); }
    else im.addEventListener('load', () => { if (--pending === 0) drawAll(); }, { once: true });
    im.addEventListener('error', () => { if (--pending === 0) drawAll(); }, { once: true });
  }
  if (pending === 0) drawAll();
  return c;
}
// Hue-shift a sheet toward a metal tint, preserving shading + alpha. Lets one
// LPC tool/weapon sheet represent every metal tier (gold sylvan pickaxes etc).
const METAL_TINT = { copper: '#b87333', bronze: '#c98f57', steel: '#e2e7ee', brass: '#d8b45e', silver: '#eef2f8', gold: '#e8c84e' };
const tintCache = new Map();
function tinted(im, tint) {
  const key = im.src + '|' + tint;
  let c = tintCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(im, 0, 0);
  g.globalCompositeOperation = 'color';
  g.fillStyle = tint; g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(im, 0, 0);
  tintCache.set(key, c);
  return c;
}
function weaponFiles(type, color, sex = 'male') {
  const w = manifest.weapons[type];
  if (!w) return null;
  const out = { perAnim: w.perAnim || null, color };
  if (w.sexed) {                                                                    // tools (axe/pickaxe): single sheet, tint per metal
    const f = w.sexed[sex] || Object.values(w.sexed).find(Boolean);
    out.fg = f && METAL_TINT[color] ? { f, tint: METAL_TINT[color] } : f;
  } else if (w.fg || w.bg) {
    const exact = w.fg?.[color];
    const fb = Object.values(w.fg || {}).find(Boolean);
    out.fg = exact || (fb && METAL_TINT[color] ? { f: fb, tint: METAL_TINT[color] } : fb);
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
  if (!set && anim === 'idle' && comp.oversize.walk) { set = comp.oversize.walk; f = 0; } // held at rest
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
  rat: { kind: 'quad', body: '#8a8072', hi: '#a89c8c', sh: '#645b50', size: 0.45, ears: 'round', tail: 'thin', snout: 'point' },
  rabbit: { kind: 'quad', body: '#b59a77', hi: '#e0cdb0', sh: '#8a7255', size: 0.55, ears: 'tall', tail: 'puff', snout: 'short', hop: true },
  boar: { kind: 'quad', body: '#4e3a28', hi: '#6b5238', sh: '#31241a', size: 1.0, ears: 'round', tail: 'curl', snout: 'boar', tusks: true, mane: true, hump: true, headLow: true },
  bear: { kind: 'quad', body: '#5a3c22', hi: '#7c5636', sh: '#38230f', size: 1.35, ears: 'round', snout: 'long', hump: true, headLow: true, mane: true },
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
  abyssal: { kind: 'brute', body: '#4a1f2e', hi: '#7a3550', sh: '#26101a', size: 1.28, horns: true, glow: '#e0304a', cracks: true },
  // ---- farm animals (procedural quads; 3D packs unusable in the 2D engine) ----
  cow: { kind: 'quad', body: '#efe6d6', hi: '#ffffff', sh: '#c8bca6', size: 1.1, ears: 'round', snout: 'long', horns: 'curl', cowspots: true, udder: true, headLow: true },
  sheep: { kind: 'quad', body: '#eae4d6', hi: '#fbf7ec', sh: '#c2b8a4', size: 0.82, ears: 'round', snout: 'short', wool: true, headLow: true },
  pig: { kind: 'quad', body: '#e79aa2', hi: '#f4bcc0', sh: '#b96e78', size: 0.8, ears: 'round', snout: 'boar', tail: 'curl', hump: true, headLow: true },
  horse: { kind: 'quad', body: '#7a5230', hi: '#9c6c40', sh: '#4e341c', size: 1.15, ears: 'point', snout: 'long', tail: 'long', horsemane: true },
  alpaca: { kind: 'quad', body: '#d8c29a', hi: '#efe0c0', sh: '#a88f66', size: 0.95, ears: 'point', snout: 'short', wool: true, longneck: true },
  farmdog: { kind: 'quad', body: '#a8763e', hi: '#c8945a', sh: '#75512a', size: 0.5, ears: 'flop', tail: 'bush', snout: 'point' },
  sprite: { kind: 'wisp', body: '#9fd8ef', hi: '#e6f8ff', size: 0.6, glow: '#bfefff' },
  spider: { kind: 'spider', body: '#332838', hi: '#54425c', sh: '#1c141f', size: 0.82 },
  // ---- pets (small, characterful, animated like all critters) ----
  hedgehog: { kind: 'quad', body: '#8a7358', hi: '#b59a77', sh: '#5e4c38', size: 0.42, ears: 'round', snout: 'point', spikes: true },
  squirrel: { kind: 'quad', body: '#b0662e', hi: '#d8935a', sh: '#7a441e', size: 0.4, ears: 'tall', tail: 'bush', snout: 'short' },
  wolfpup: { kind: 'quad', body: '#8a8d95', hi: '#b5b8c0', sh: '#5e6168', size: 0.5, ears: 'point', tail: 'bush', snout: 'short' },
  badger: { kind: 'quad', body: '#4a4a50', hi: '#e8e8ec', sh: '#2e2e33', size: 0.55, ears: 'round', snout: 'point', stripes: true },
  falcon: { kind: 'bird', body: '#6e5230', hi: '#c8a26a', sh: '#4a3620', size: 0.6 },
  ferret: { kind: 'quad', body: '#c9b490', hi: '#ece0c8', sh: '#96835e', size: 0.42, ears: 'round', tail: 'long', snout: 'point', long: true },
  tortoise: { kind: 'quad', body: '#7a8a50', hi: '#a0b070', sh: '#525e34', size: 0.6, snout: 'short', shell: true },
  lynx: { kind: 'quad', body: '#c9a166', hi: '#e8cfa0', sh: '#96744a', size: 0.62, ears: 'point', tail: 'thin', snout: 'short', tufts: true },
  magpie: { kind: 'bird', body: '#26262e', hi: '#e8e8f0', sh: '#16161c', size: 0.55 },
  bearcub: { kind: 'quad', body: '#6b4a2e', hi: '#8a6540', sh: '#47301d', size: 0.62, ears: 'round', snout: 'short', hump: true },
  direwolfpup: { kind: 'quad', body: '#4a4d55', hi: '#767a82', sh: '#2e3036', size: 0.58, ears: 'point', tail: 'bush', snout: 'long', glow: '#8ab4ff' },
  imp: { kind: 'brute', body: '#a04038', hi: '#c86050', sh: '#702a24', size: 0.55, horns: true },
  golemling: { kind: 'brute', body: '#8a8474', hi: '#a8a294', sh: '#5e5a4e', size: 0.6, cracks: true },
  gryphon: { kind: 'bird', body: '#c9a23c', hi: '#f0d27a', sh: '#96742a', size: 0.85, glow: '#ffe08a' },
  fae: { kind: 'wisp', body: '#e8a0d8', hi: '#fce0f8', size: 0.55, glow: '#ffc0f0' },
  whelp: { kind: 'quad', body: '#a03828', hi: '#d86040', sh: '#6e2418', size: 0.6, ears: 'point', tail: 'long', snout: 'long', wings: true, glow: '#ff8a50' },
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
  else if (st.tail === 'curl') { g.strokeStyle = st.sh; g.lineWidth = 1.8; g.beginPath(); g.arc(cx - bw - 2, cy - 3, 3, 0.6, 4.6); g.stroke(); }
  // wings (dragon whelps) flap behind the body
  if (st.wings) {
    const flap = swing * 4;
    g.fillStyle = st.sh;
    g.beginPath(); g.moveTo(cx - 2, cy - bh); g.quadraticCurveTo(cx - 14, cy - bh - 10 - flap, cx - 18, cy - bh + 2 - flap); g.quadraticCurveTo(cx - 8, cy - bh + 2, cx - 2, cy - bh + 3); g.fill();
    g.strokeStyle = OUTLINE; g.lineWidth = 1; g.stroke();
  }
  // body
  oval(g, cx, cy, bw, bh, st.body, OUTLINE);
  if (st.hump) { oval(g, cx - bw * 0.25, cy - bh * 0.66, bw * 0.62, bh * 0.66, st.body, OUTLINE); oval(g, cx - bw * 0.3, cy - bh * 0.8, bw * 0.4, bh * 0.35, st.hi); }
  if (st.spikes) { g.fillStyle = st.sh; for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(cx + i * 2.6, cy - bh + 1); g.lineTo(cx + i * 2.6 + 1, cy - bh - 5); g.lineTo(cx + i * 2.6 + 2.6, cy - bh + 1); g.fill(); } }
  if (st.shell) { oval(g, cx - bw * 0.1, cy - bh * 0.55, bw * 0.78, bh * 0.85, st.sh, OUTLINE); g.strokeStyle = st.hi; g.lineWidth = 1; g.beginPath(); g.moveTo(cx - bw * 0.5, cy - bh * 0.5); g.lineTo(cx + bw * 0.4, cy - bh * 0.5); g.moveTo(cx - bw * 0.3, cy - bh * 0.95); g.lineTo(cx - bw * 0.3, cy - bh * 0.1); g.moveTo(cx + bw * 0.15, cy - bh * 0.95); g.lineTo(cx + bw * 0.15, cy - bh * 0.1); g.stroke(); }
  if (st.stripes) { g.fillStyle = st.hi; oval(g, cx, cy - bh * 0.5, bw * 0.7, bh * 0.22, st.hi); }
  oval(g, cx - 1, cy - bh * 0.4, bw * 0.82, bh * 0.5, st.hi);       // top highlight
  oval(g, cx, cy + bh * 0.55, bw * 0.7, bh * 0.28, st.sh);          // underside shade
  // fleece: overlapping fluff lumps give a woolly silhouette (sheep/alpaca)
  if (st.wool) {
    g.fillStyle = st.hi;
    for (let i = -3; i <= 3; i++) oval(g, cx + i * bw * 0.28, cy - bh * 0.5 + (i % 2) * 2, bw * 0.28, bh * 0.34, st.hi, OUTLINE);
    for (let i = -2; i <= 2; i++) oval(g, cx + i * bw * 0.34, cy + bh * 0.1, bw * 0.26, bh * 0.3, st.body);
  }
  // dark cow patches
  if (st.cowspots) { g.fillStyle = '#3a332c'; oval(g, cx - bw * 0.4, cy - bh * 0.2, bw * 0.3, bh * 0.34, '#3a332c'); oval(g, cx + bw * 0.3, cy + bh * 0.15, bw * 0.26, bh * 0.28, '#3a332c'); oval(g, cx + bw * 0.05, cy - bh * 0.45, bw * 0.18, bh * 0.2, '#3a332c'); }
  // pink udder under the belly
  if (st.udder) { g.fillStyle = '#e79aa2'; oval(g, cx - bw * 0.1, cy + bh * 0.7, bw * 0.22, bh * 0.2, '#e79aa2', OUTLINE); }
  // horse mane running along the neck/back
  if (st.horsemane) { g.fillStyle = st.sh; for (let i = 0; i < 6; i++) { const mx2 = cx + bw * 0.4 + i * 2.2, my2 = cy - bh * 0.7 + i * 1.4; g.beginPath(); g.moveTo(mx2, my2); g.lineTo(mx2 + 3, my2 - 3); g.lineTo(mx2 + 3, my2 + 1); g.fill(); } }
  if (st.mane) { g.fillStyle = st.sh; for (let i = -3; i <= 2; i++) { g.beginPath(); g.moveTo(cx + i * 3, cy - bh - (st.hump ? bh * 0.5 : 0)); g.lineTo(cx + i * 3 - 1, cy - bh - 5 - (st.hump ? bh * 0.5 : 0)); g.lineTo(cx + i * 3 + 2, cy - bh - (st.hump ? bh * 0.5 : 0)); g.fill(); } }
  // head (boars/bears carry it low; alpacas/horses hold a long neck high)
  const hx = cx + bw + 2 * s, hy = cy - bh * (st.longneck ? 1.05 : st.headLow ? 0.05 : 0.4);
  const hr = 5.5 * s;
  // neck for long-necked / maned animals
  if (st.longneck || st.horsemane) { g.strokeStyle = st.body; g.lineWidth = 4.5 * s; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx + bw * 0.5, cy - bh * 0.3); g.lineTo(hx, hy + hr * 0.4); g.stroke(); g.strokeStyle = OUTLINE; g.lineWidth = 5.5 * s; g.globalCompositeOperation = 'destination-over'; g.stroke(); g.globalCompositeOperation = 'source-over'; }
  oval(g, hx, hy, hr, hr * 0.95, st.body, OUTLINE);
  oval(g, hx - hr * 0.3, hy - hr * 0.3, hr * 0.55, hr * 0.5, st.hi);
  // ears
  if (st.ears === 'tall') { for (const ex of [hx - 1, hx + 2]) { oval(g, ex, hy - hr - 3, 1.8 * s, 4.5 * s, st.body, OUTLINE); oval(g, ex, hy - hr - 3, 0.9 * s, 3 * s, '#e8b0b0'); } }
  else if (st.ears === 'point') { for (const [ex, ey] of [[hx - 2, hy - hr], [hx + 3, hy - hr - 1]]) { g.fillStyle = OUTLINE; g.beginPath(); g.moveTo(ex - 3, ey + 2); g.lineTo(ex + 1, ey - 5); g.lineTo(ex + 3, ey + 2); g.fill(); g.fillStyle = st.sh; g.beginPath(); g.moveTo(ex - 1.5, ey + 1); g.lineTo(ex + 0.5, ey - 3); g.lineTo(ex + 2, ey + 1); g.fill(); } }
  else if (st.ears === 'round') { for (const ex of [hx - 2, hx + 3]) oval(g, ex, hy - hr - 1, 2 * s, 2 * s, st.body, OUTLINE); }
  else if (st.ears === 'flop') { for (const [ex, dxx] of [[hx - 3, -1], [hx + 3, 1]]) { g.fillStyle = st.sh; g.beginPath(); g.ellipse(ex, hy - hr * 0.2, 1.8 * s, 3.4 * s, dxx * 0.5, 0, 7); g.fill(); g.strokeStyle = OUTLINE; g.lineWidth = 0.8; g.stroke(); } }
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
  // tusks / frost / horns / cracked stone
  px(g, cx - 3, top + 9, 1.5, 3, '#f4ecd8'); px(g, cx + 2, top + 9, 1.5, 3, '#f4ecd8');
  if (st.frost) { g.shadowColor = '#bfe0ff'; g.shadowBlur = 8; oval(g, cx, 38, 11 * s, 10 * s, 'rgba(200,230,255,0.10)'); g.shadowBlur = 0; }
  if (st.horns) { g.fillStyle = '#3a2018'; for (const dx of [-5, 3]) { g.beginPath(); g.moveTo(cx + dx, top + 1); g.lineTo(cx + dx - 1, top - 6); g.lineTo(cx + dx + 3, top + 1); g.fill(); } }
  if (st.cracks) { g.strokeStyle = st.sh; g.lineWidth = 1; g.beginPath(); g.moveTo(cx - 4, 32); g.lineTo(cx - 1, 38); g.lineTo(cx - 5, 44); g.moveTo(cx + 5, 34); g.lineTo(cx + 2, 40); g.stroke(); }
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
    // soft ground shadow under every node
    g.fillStyle = '#00000030';
    g.beginPath(); g.ellipse(32, 68, 15, 5, 0, 0, 7); g.fill();
    if (TREE_STYLE[type]) {
      const [lite, dark, r] = TREE_STYLE[type];
      if (off) { // fresh stump with rings
        g.fillStyle = '#5a442c'; g.beginPath(); g.ellipse(32, 64, 8, 5, 0, 0, 7); g.fill();
        px(g, 24, 58, 16, 7, '#6e522f');
        g.fillStyle = '#c9ac7c'; g.beginPath(); g.ellipse(32, 58, 8, 5, 0, 0, 7); g.fill();
        g.strokeStyle = '#9a7c50'; g.lineWidth = 1;
        g.beginPath(); g.ellipse(32, 58, 5, 3, 0, 0, 7); g.stroke();
        g.beginPath(); g.ellipse(32, 58, 2.4, 1.4, 0, 0, 7); g.stroke();
        return;
      }
      // tapered trunk with root flare + bark shading
      g.fillStyle = '#4a3520';
      g.beginPath(); g.moveTo(28, 42); g.lineTo(26, 66); g.lineTo(22, 68); g.lineTo(43, 68); g.lineTo(38, 66); g.lineTo(36, 42); g.closePath(); g.fill();
      g.fillStyle = '#6e522f'; g.beginPath(); g.moveTo(29, 42); g.lineTo(28, 67); g.lineTo(33, 67); g.lineTo(32, 42); g.closePath(); g.fill();
      if (type === 'frostpine_tree') {
        for (let i = 2; i >= 0; i--) {
          const y0 = 8 + i * 13, w = 13 + i * 5;
          g.fillStyle = '#24401f'; g.beginPath(); g.moveTo(32, y0 - 2); g.lineTo(32 - w - 1, y0 + 25); g.lineTo(32 + w + 1, y0 + 25); g.closePath(); g.fill();
          g.fillStyle = dark; g.beginPath(); g.moveTo(32, y0); g.lineTo(32 - w, y0 + 23); g.lineTo(32 + w, y0 + 23); g.closePath(); g.fill();
          g.fillStyle = lite; g.beginPath(); g.moveTo(32, y0); g.lineTo(32 - w * 0.55, y0 + 14); g.lineTo(32 + w * 0.2, y0 + 14); g.closePath(); g.fill();
        }
      } else {
        // layered canopy: dark outline ring, mid body, clustered highlights
        const blobs = [[32, 28, r], [32 - r * 0.55, 33, r * 0.62], [32 + r * 0.58, 32, r * 0.6]];
        g.fillStyle = '#1e3315';
        for (const [bx, by, br] of blobs) { g.beginPath(); g.arc(bx, by, br + 1.5, 0, 7); g.fill(); }
        g.fillStyle = dark;
        for (const [bx, by, br] of blobs) { g.beginPath(); g.arc(bx, by, br, 0, 7); g.fill(); }
        g.fillStyle = lite;
        g.beginPath(); g.arc(28, 24, r * 0.62, 0, 7); g.fill();
        g.beginPath(); g.arc(32 + r * 0.45, 29, r * 0.34, 0, 7); g.fill();
        g.fillStyle = '#ffffff22';
        g.beginPath(); g.arc(26, 21, r * 0.3, 0, 7); g.fill();
        if (type === 'maple_tree') { g.fillStyle = '#e0a04c55'; g.beginPath(); g.arc(36, 26, r * 0.5, 0, 7); g.fill(); }
      }
    } else if (ROCK_STYLE[type]) {
      const col = ROCK_STYLE[type];
      // faceted boulder: outline, lit top facet, shaded base
      g.fillStyle = '#3c3830';
      g.beginPath(); g.moveTo(10, 68); g.lineTo(17, 47); g.lineTo(33, 40); g.lineTo(51, 49); g.lineTo(56, 68); g.closePath(); g.fill();
      g.fillStyle = off ? '#55504a' : '#7a766c';
      g.beginPath(); g.moveTo(12, 66); g.lineTo(19, 48); g.lineTo(33, 42); g.lineTo(49, 50); g.lineTo(54, 66); g.closePath(); g.fill();
      g.fillStyle = off ? '#615c54' : '#8f8a7e';
      g.beginPath(); g.moveTo(19, 48); g.lineTo(33, 42); g.lineTo(44, 47); g.lineTo(30, 54); g.closePath(); g.fill();
      g.fillStyle = '#00000022';
      g.beginPath(); g.moveTo(30, 54); g.lineTo(44, 47); g.lineTo(54, 66); g.lineTo(34, 66); g.closePath(); g.fill();
      if (!off) {
        // ore crystals with glint
        g.shadowColor = col; g.shadowBlur = 5;
        for (const [ox, oy, s2] of [[25, 53, 5], [37, 50, 6], [31, 60, 4], [44, 58, 4]]) {
          g.fillStyle = col;
          g.beginPath(); g.moveTo(ox, oy - s2 / 2); g.lineTo(ox + s2 / 2, oy); g.lineTo(ox, oy + s2 / 2); g.lineTo(ox - s2 / 2, oy); g.closePath(); g.fill();
        }
        g.shadowBlur = 0;
        g.fillStyle = '#ffffff88'; px(g, 36, 48, 2, 2, '#ffffff88');
      }
    } else switch (type) {
      case 'net_spot': case 'rod_spot': case 'harpoon_spot': {
        g.strokeStyle = '#bfe8f8'; g.lineWidth = 2;
        g.beginPath(); g.ellipse(32, 64, 13, 6, 0, 0, 7); g.stroke();
        g.beginPath(); g.ellipse(32, 64, 7, 3, 0, 0, 7); g.stroke();
        px(g, 30, 60, 3, 3, '#e8f6fc');
        break;
      }
      case 'bank_booth': {
        px(g, 13, 43, 38, 24, '#3c2c12'); px(g, 15, 45, 34, 20, '#6b5322');
        px(g, 12, 38, 40, 7, '#8a6d1d'); px(g, 12, 38, 40, 2, '#b8963c');
        px(g, 19, 50, 26, 5, '#3c2c12');
        g.fillStyle = '#ffd75e'; g.beginPath(); g.arc(27, 52, 3, 0, 7); g.fill(); g.beginPath(); g.arc(35, 52, 3, 0, 7); g.fill();
        g.fillStyle = '#ffe98a'; g.beginPath(); g.arc(31, 50, 3, 0, 7); g.fill();
        break;
      }
      case 'ge_booth': {
        px(g, 9, 39, 46, 30, '#3c2c12'); px(g, 11, 41, 42, 26, '#55431c');
        px(g, 9, 32, 46, 9, '#d8a827'); px(g, 9, 32, 46, 3, '#ffe27a');
        for (let i = 0; i < 5; i++) px(g, 11 + i * 9, 35, 5, 6, i % 2 ? '#b8871c' : '#d8a827');
        px(g, 17, 47, 13, 11, '#2c2210'); px(g, 34, 47, 13, 11, '#2c2210');
        px(g, 18, 48, 11, 9, '#ffe98a'); px(g, 35, 48, 11, 9, '#ffe98a');
        g.fillStyle = '#8a6d1d'; g.font = 'bold 8px Georgia'; g.textAlign = 'center'; g.fillText('£', 23.5, 55); g.fillText('⚖', 40.5, 55);
        break;
      }
      case 'anvil': {
        px(g, 20, 62, 26, 5, '#26262c');
        px(g, 27, 55, 12, 8, '#33333a');
        g.fillStyle = '#4c4c56'; g.beginPath(); g.moveTo(16, 48); g.lineTo(46, 48); g.lineTo(44, 54); g.lineTo(38, 56); g.lineTo(28, 56); g.lineTo(24, 52); g.lineTo(16, 52); g.closePath(); g.fill();
        g.fillStyle = '#6e6e7a'; g.beginPath(); g.moveTo(16, 48); g.lineTo(46, 48); g.lineTo(45, 50); g.lineTo(16, 50); g.closePath(); g.fill();
        px(g, 44, 46, 6, 3, '#4c4c56');
        break;
      }
      case 'loom': {
        // upright wooden frame with warp threads and a woven band
        px(g, 18, 36, 4, 30, '#6e522f'); px(g, 42, 36, 4, 30, '#6e522f');
        px(g, 16, 34, 32, 4, '#8a6a3c'); px(g, 16, 62, 32, 4, '#5a442c');
        g.strokeStyle = '#e8dcc0'; g.lineWidth = 1;
        for (let i = 0; i < 7; i++) { g.beginPath(); g.moveTo(23 + i * 3, 38); g.lineTo(23 + i * 3, 62); g.stroke(); }
        px(g, 22, 50, 21, 6, '#a34a3a'); px(g, 22, 50, 21, 2, '#c86a52');
        px(g, 20, 44, 24, 3, '#8a6a3c');
        break;
      }
      case 'tanning_rack': {
        // A-frame rack with a stretched hide laced at the corners
        g.strokeStyle = '#6e522f'; g.lineWidth = 4; g.lineCap = 'round';
        g.beginPath(); g.moveTo(18, 66); g.lineTo(30, 34); g.moveTo(46, 66); g.lineTo(34, 34); g.stroke();
        g.beginPath(); g.moveTo(28, 36); g.lineTo(36, 36); g.stroke();
        g.fillStyle = '#c49a62';
        g.beginPath(); g.moveTo(24, 42); g.quadraticCurveTo(32, 39, 40, 42); g.lineTo(42, 58); g.quadraticCurveTo(32, 62, 22, 58); g.closePath(); g.fill();
        g.strokeStyle = '#8a6a3c'; g.lineWidth = 1; g.stroke();
        g.fillStyle = '#a87f4c'; g.beginPath(); g.ellipse(32, 50, 6, 4.4, 0.2, 0, 7); g.fill();
        g.strokeStyle = '#4a3a1c';
        for (const [ax, ay, bx2, by2] of [[24, 42, 21, 39], [40, 42, 43, 39], [22, 58, 19, 61], [42, 58, 45, 61]]) { g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx2, by2); g.stroke(); }
        break;
      }
      case 'furnace': {
        px(g, 16, 34, 32, 34, '#4a4038'); px(g, 18, 36, 28, 30, '#7a6a5c');
        px(g, 18, 36, 28, 4, '#948274'); px(g, 20, 30, 8, 8, '#5c5048');
        g.fillStyle = '#2a1c10'; g.beginPath(); g.arc(32, 60, 9, Math.PI, 0); g.fill(); px(g, 23, 60, 18, 7, '#2a1c10');
        if (!off) {
          g.shadowColor = '#ff7a2a'; g.shadowBlur = 8;
          g.fillStyle = '#ff7a2a'; g.beginPath(); g.arc(32, 61, 6, Math.PI, 0); g.fill(); px(g, 26, 61, 12, 5, '#ff7a2a');
          g.fillStyle = '#ffd75e'; g.beginPath(); g.arc(32, 62, 3, Math.PI, 0); g.fill();
          g.shadowBlur = 0;
        }
        break;
      }
      case 'range': {
        px(g, 16, 44, 32, 24, '#3a3632'); px(g, 18, 46, 28, 20, '#5c5650');
        px(g, 18, 46, 28, 3, '#6e6862');
        px(g, 21, 52, 22, 8, '#2a1c10');
        if (!off) { g.shadowColor = '#ff8c3a'; g.shadowBlur = 6; px(g, 23, 54, 18, 4, '#ff8c3a'); px(g, 27, 53, 6, 6, '#ffd75e'); g.shadowBlur = 0; }
        px(g, 20, 38, 6, 8, '#3a3632');
        break;
      }
      case 'campfire': {
        // log ring + layered flame with glow
        g.fillStyle = '#5a442c';
        for (const [lx2, ly2, rot] of [[24, 63, 0.4], [40, 63, -0.4], [32, 66, 0]]) {
          g.save(); g.translate(lx2, ly2); g.rotate(rot); g.fillRect(-8, -2, 16, 4); g.restore();
        }
        g.shadowColor = '#ff9b2a'; g.shadowBlur = 10;
        g.fillStyle = '#e05a1c'; g.beginPath(); g.moveTo(32, 40); g.quadraticCurveTo(24, 52, 26, 60); g.lineTo(38, 60); g.quadraticCurveTo(41, 50, 32, 40); g.fill();
        g.fillStyle = '#ff9b2a'; g.beginPath(); g.moveTo(32, 46); g.quadraticCurveTo(27, 54, 29, 60); g.lineTo(36, 60); g.quadraticCurveTo(38, 52, 32, 46); g.fill();
        g.fillStyle = '#ffe27a'; g.beginPath(); g.moveTo(32, 52); g.quadraticCurveTo(30, 56, 31, 60); g.lineTo(34, 60); g.quadraticCurveTo(35, 55, 32, 52); g.fill();
        g.shadowBlur = 0;
        break;
      }
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


// Item icons live in their own module; re-exported here for existing importers.
export { itemIcon } from "./icons.js";

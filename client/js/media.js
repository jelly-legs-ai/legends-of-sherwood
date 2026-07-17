// Sheet-based media renderer: animated creatures (bosses/mobs), spell & impact
// FX, icon atlases and dungeon tilesets described by assets/media.json (built
// by tools/build-media.mjs). Complements the LPC paperdoll + procedural
// critters in sprites.js.

export let MEDIA = { creatures: {}, fx: {}, sheets: {} };
let ready = false;

export async function loadMedia() {
  try {
    MEDIA = await (await fetch('assets/media.json')).json();
    ready = true;
  } catch (e) { console.warn('media.json missing — sheet creatures disabled', e); }
  return MEDIA;
}
export function mediaReady() { return ready; }

const images = new Map();
export function mimg(file) {
  if (!file) return null;
  let im = images.get(file);
  if (!im) { im = new Image(); im.src = 'assets/' + file; images.set(file, im); }
  return im.complete && im.naturalWidth ? im : null;
}
// Eagerly load EVERY anim sheet of a creature the first time it's seen, so an
// attack/special never flashes blank because only its idle frame was cached.
const preloaded = new Set();
function preloadCreature(def) {
  for (const m of Object.values(def.anims)) if (m.file && !images.has(m.file)) mimg(m.file);
}

// Server anim names -> sheet anim names (with graceful fallbacks)
const ANIM_MAP = { idle: 'idle', walk: 'walk', slash: 'attack', thrust: 'attack', shoot: 'attack', spellcast: 'special', hurt: 'hit' };
const FALLBACK = { special: 'attack', attack: 'idle', hit: 'idle', death: 'idle', walk: 'idle' };
function pickAnim(def, name) {
  let a = ANIM_MAP[name] || name;
  for (let i = 0; i < 4 && !def.anims[a]; i++) a = FALLBACK[a] || 'idle';
  return def.anims[a] ? a : 'idle';
}

// Directional row order for 4-row monster-pack grids: [S, N, W, E] rows.
// Game dirs: 0=N 1=W 2=S 3=E.
const DIR_ROW = { 0: 1, 1: 2, 2: 0, 3: 3 };

const ONCE_MS = { attack: 55, special: 60, hit: 70, death: 80, heal: 60 };

// Draw a media.json creature. Returns drawn pixel height (for nameplates /
// hit boxes) or 0 if the sheet isn't ready yet.
export function drawCreature(ctx, key, e, animName, now, sx, sy, scale = 1) {
  const def = MEDIA.creatures?.[key];
  if (!def) return 0;
  if (!preloaded.has(key)) { preloaded.add(key); preloadCreature(def); }
  const dead = e.hp <= 0;
  let a = dead && def.anims.death ? 'death' : pickAnim(def, animName);
  const m = def.anims[a];
  const im = mimg(m.file);
  if (!im) return 0;

  const fw = def.frame;
  const isDirGrid = def.kind === 'grid' && m.rows > 1 && !m.cols;      // rows = facings
  const rowMajor = def.kind === 'grid' && m.cols;                       // sequential grid
  const stripRows = def.kind === 'strips' && m.rows > 1 ? m.rows : 1;   // wrapped strip
  const total = isDirGrid ? m.frames : rowMajor ? m.frames : m.frames * stripRows;

  // frame selection
  let fi;
  const once = ONCE_MS[a];
  if (a === 'death') {
    const el = now - (e.deathStart ?? (e.deathStart = now));
    fi = Math.min(total - 1, Math.floor(el / 70));
  } else if (once && (a === 'attack' || a === 'special' || a === 'hit' || a === 'heal')) {
    const el = now - (e.animStart || now);
    fi = Math.floor(el / once);
    if (fi >= total) { // swing finished — settle back to idle
      a = pickAnim(def, 'idle');
      const mi = def.anims[a];
      return drawFrame(ctx, def, mi, e, a, now, sx, sy, scale);
    }
  } else {
    const rate = a === 'idle' ? 110 : 70;
    fi = Math.floor((now + (e.id % 97) * 53) / rate) % total;
  }
  const h = drawFrame(ctx, def, m, e, a, now, sx, sy, scale, fi);
  drawCustomAnimLayers(ctx, key, a, fi, total, e, sx, sy, scale, now);
  return h;
}

// ---------------------------------------------------------------------------
// Custom animations (admin Animations creator): FX layers keyed to a creature
// animation, positioned per frame in the studio. A layer labelled 'projectile'
// launches from its last recorded position when the animation passes its final
// frame, flying out in the facing direction (smart tracking).
export const CUSTOM_ANIMS = {};   // 'base:anim' -> [layers]
export function registerCustomAnims(defs) {
  for (const d of Object.values(defs || {})) {
    if (!d || !d.base) continue;
    const k = d.base + ':' + (d.anim || 'attack');
    (CUSTOM_ANIMS[k] = CUSTOM_ANIMS[k] || []).push(...(d.layers || []));
  }
}
export function customLayerPos(l, fi) {
  // nearest recorded studio offset at or below this frame, lerped to the next
  const keys = Object.keys(l.offsets || {}).map(Number).sort((a, b) => a - b);
  if (!keys.length) return [0, -20];
  let lo = keys[0], hi = keys[keys.length - 1];
  for (const k of keys) { if (k <= fi) lo = k; if (k >= fi) { hi = k; break; } }
  const A = l.offsets[lo], B = l.offsets[hi];
  const t = hi > lo ? (fi - lo) / (hi - lo) : 0;
  return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
}
function drawCustomAnimLayers(ctx, key, a, fi, total, e, sx, sy, scale, now) {
  const layers = CUSTOM_ANIMS[key + ':' + a];
  if (!layers) return;
  const flip = e.dir === 1 ? -1 : 1;
  for (const l of layers) {
    const from = l.from | 0, to = l.to ?? total - 1;
    if (fi >= from && fi <= to) {
      const [dx, dy] = customLayerPos(l, fi);
      drawFxSprite(ctx, l.fx, (fi - from) / Math.max(1, to - from), sx + dx * flip * scale, sy + dy * scale, (l.size || 42) * scale);
    } else if (l.projectile && fi > to) {
      // smart tracking: after release the fx streaks onward, fading out
      const t = Math.min(1, (fi - to) / Math.max(2, total - to));
      const [dx, dy] = customLayerPos(l, to);
      ctx.save(); ctx.globalAlpha = 1 - t * 0.6;
      drawFxSprite(ctx, l.fx, t, sx + (dx + t * 90) * flip * scale, sy + dy * scale - t * 8, (l.size || 42) * scale);
      ctx.restore();
    }
  }
}

export function drawFrame(ctx, def, m, e, a, now, sx, sy, scale, fi) {
  const im = mimg(m.file);
  if (!im) return 0;
  const fw = def.frame;
  if (fi === undefined) {
    const total = m.cols ? m.frames : (m.rows > 1 && def.kind === 'strips' ? m.frames * m.rows : m.frames);
    fi = Math.floor((now + (e.id % 97) * 53) / 110) % total;
  }
  let sxx, syy, fh = fw;
  if (def.kind === 'grid' && m.rows > 1 && !m.cols) {          // directional grid
    sxx = (fi % m.frames) * fw; syy = DIR_ROW[e.dir ?? 2] * fw;
  } else if (m.cols) {                                          // sequential row-major grid
    sxx = (fi % m.cols) * fw; syy = Math.floor(fi / m.cols) * fw;
  } else {                                                      // strip (possibly wrapped)
    const cols = m.frames;
    sxx = (fi % cols) * fw; syy = Math.floor(fi / cols) * fw;
    if (m.rows <= 1 || !m.rows) { fh = m.h; syy = 0; }          // single-row strips keep native height
  }
  // Content-aware sizing: many packs centre a tiny sprite in a big cell (a
  // reindeer is ~26px of art in a 128px cell). Boost so the VISIBLE art reaches
  // roughly player height (~62px) * mob scale, and anchor to the real feet.
  const art = def.art;
  const boost = art ? Math.min(5, Math.max(1, 62 / (fh * art.h))) : 1;
  const S = fw * scale * boost;
  const drawH = fh * scale * boost;
  const dx = sx - S / 2;
  let dy;
  if (art) dy = sy + 6 * scale - drawH * (1 - art.b);          // content bottom on the anchor
  else if (fw >= 160) dy = sy + S * 0.10 - S;                  // big beasts: centred cells
  else dy = sy + 6 * scale - drawH;
  // Facing. Directional grids (rows = facings) already pick the right row and
  // must never mirror. Single-view sheets have no left/right art, so we mirror
  // horizontally to face the target: side-view strips face left by default
  // (flip when heading east); front-facing sequential grids face right by
  // default (flip when heading west) so bosses turn toward whoever they fight.
  const rowMajor = def.kind === 'grid' && m.cols;
  const flip = (def.kind === 'strips' && e.dir === 3) || (rowMajor && e.dir === 1);
  ctx.save();
  if (flip) { ctx.translate(sx * 2, 0); ctx.scale(-1, 1); }
  if (e.hp <= 0 && !def.anims.death) ctx.globalAlpha = 0.55;
  if (e.tint === 'gold') { // legendary creatures (Golden Stag): gilded + haloed
    ctx.filter = 'sepia(1) saturate(3.4) hue-rotate(8deg) brightness(1.3)';
    ctx.shadowColor = '#ffd75e'; ctx.shadowBlur = 18;
  } else if (e.tint === 'spectral') { // aethereal dragons: pre-dyed pale, plus a ghostlight halo
    ctx.shadowColor = '#bfeaff'; ctx.shadowBlur = 16;
    ctx.globalAlpha *= 0.92;
  } else if (e.tint === 'frost') { // ice golems: rimed sheet + a cold-mist aura
    ctx.shadowColor = '#9fd8ff'; ctx.shadowBlur = 13;
  }
  ctx.imageSmoothingEnabled = fw >= 128 && boost < 1.5;         // pixel art stays crisp
  ctx.drawImage(im, sxx, syy, fw, fh, flip ? sx - S / 2 : dx, dy, S, drawH);
  ctx.filter = 'none';
  ctx.restore();
  ctx.imageSmoothingEnabled = true;
  return art ? Math.max(30, drawH * art.h * 1.15) : fw >= 160 ? S * 0.9 : drawH;
}

// ---------------------------------------------------------------------------
// FX sheets. spec: 'key:variant' into media.fx (vargrid = row per variant, or
// grid = sequential). t01 = normalized 0..1 animation progress.
// Cache of hue-tinted whole-sheet copies (alpha preserved) so tinted effects
// draw as fast as untinted ones.
const _fxTint = new Map();
function tintedFxSheet(im, file, tint) {
  const k = file + '|' + tint;
  let c = _fxTint.get(k);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(im, 0, 0);
  g.globalCompositeOperation = 'color';       // shift hue, keep luminance
  g.globalAlpha = 0.72; g.fillStyle = tint; g.fillRect(0, 0, c.width, c.height);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'destination-in'; // clip back to the effect's alpha
  g.drawImage(im, 0, 0);
  _fxTint.set(k, c);
  return c;
}
export function drawFxSprite(ctx, spec, t01, sx, sy, size = 42, rot = 0, tint = null) {
  const [key, vs] = String(spec).split(':');
  const f = MEDIA.fx?.[key];
  if (!f) return false;
  const im = mimg(f.file);
  if (!im) return false;
  const src = tint ? tintedFxSheet(im, f.file, tint) : im;
  const fw = f.frame, fh = f.fh || f.frame;              // rectangular frames (VFX packs)
  const v = Math.max(0, Math.min((vs | 0), (f.variants || 1) - 1));
  let sxx, syy;
  const n = f.frames;
  const fi = Math.max(0, Math.min(n - 1, Math.floor(t01 * n)));
  if (f.kind === 'vargrid') { sxx = fi * fw; syy = v * fw; }
  else { sxx = (fi % f.cols) * fw; syy = Math.floor(fi / f.cols) * fh; }
  const dw = size, dh = size * (fh / fw);                 // preserve aspect
  ctx.save();
  ctx.translate(sx, sy);
  if (rot) ctx.rotate(rot);
  ctx.imageSmoothingEnabled = fw >= 48;
  ctx.drawImage(src, sxx, syy, fw, fh, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
  ctx.imageSmoothingEnabled = true;
  return true;
}
// Loop an fx continuously (for auras / ambient loops)
export function drawFxLoop(ctx, spec, now, ms, sx, sy, size, rot = 0) {
  return drawFxSprite(ctx, spec, (now % ms) / ms, sx, sy, size, rot);
}
// Fit an fx into a vertical band (yTop..yBot): scaled to the band height with
// aspect preserved and bottom-anchored, so ground effects — flames especially —
// rise from the floor and can never clear the top of the band (the wearer's head).
export function drawFxBand(ctx, spec, t01, sx, yTop, yBot, tint = null) {
  const f = MEDIA.fx?.[String(spec).split(':')[0]];
  if (!f) return false;
  const fw = f.frame, fh = f.fh || f.frame;
  const dh = yBot - yTop, dw = dh * (fw / fh);
  return drawFxSprite(ctx, spec, t01, sx, yBot - dh / 2, dw, 0, tint);
}

// ---------------------------------------------------------------------------
// Icon atlases & sheets. ref: ['rareSwords', 3] (file list) or
// ['potions_atlas', 17] (fixed-cell atlas) or ['icons_full', col, row].
export function drawMediaIcon(ctx, ref, dx, dy, size = 24) {
  const sheet = MEDIA.sheets?.[ref[0]];
  if (!sheet) return false;
  if (Array.isArray(sheet)) {                                   // list of standalone files
    const im = mimg(sheet[ref[1]]);
    if (!im) return false;
    ctx.imageSmoothingEnabled = im.naturalWidth > 64;
    ctx.drawImage(im, dx, dy, size, size);
    ctx.imageSmoothingEnabled = true;
    return true;
  }
  const im = mimg(sheet.file);
  if (!im) return false;
  const cw = sheet.cell || sheet.cellW || 32, ch = sheet.cell || sheet.cellH || 32;
  let cx, cy;
  if (ref.length >= 3) { cx = ref[1]; cy = ref[2]; }
  else { const cols = sheet.cols || Math.floor(sheet.w / cw); cx = ref[1] % cols; cy = Math.floor(ref[1] / cols); }
  ctx.imageSmoothingEnabled = cw > 64;
  ctx.drawImage(im, cx * cw, cy * ch, cw, ch, dx, dy, size, size);
  ctx.imageSmoothingEnabled = true;
  return true;
}

// Dungeon / world decor cell from a geo sheet ('gems', 'geo_rocks', 'geo_tiles', 'geo_objects')
export function drawSheetCell(ctx, key, col, row, dx, dy, w, h) {
  const sheet = MEDIA.sheets?.[key];
  if (!sheet || !sheet.cellW) return false;
  const im = mimg(sheet.file);
  if (!im) return false;
  ctx.drawImage(im, col * sheet.cellW, row * sheet.cellH, sheet.cellW, sheet.cellH, dx, dy, w, h);
  return true;
}

// Animated chest: sheet is 5 cols x 8 rows of 48x32 cells. Each chest style
// owns TWO rows: style*2 = closed idle shimmer, style*2+1 = opening animation.
// openT = ms since opening (0/undefined = closed).
export function drawChest(ctx, variant, openT, snow, sx, sy, scale = 1) {
  const sheet = MEDIA.sheets?.[snow ? 'chests_snow' : 'chests'];
  if (!sheet) return false;
  const im = mimg(sheet.file);
  if (!im) return false;
  const cols = 5, cw = sheet.w / cols, ch = sheet.h / 8;
  const style = (variant | 0) % 4;
  let row, fi;
  if (openT) { row = style * 2 + 1; fi = Math.min(cols - 1, Math.floor(openT / 110)); }
  else { row = style * 2; fi = Math.floor(performance.now() / 260) % cols; }
  const W = cw * 1.5 * scale, H = ch * 1.5 * scale;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(im, fi * cw, row * ch, cw, ch, sx - W / 2, sy + 8 - H, W, H);
  ctx.imageSmoothingEnabled = true;
  return true;
}

// Gold bitmap digits (UI_Gold font, shadowed variant: '1'..'9' at x=36..324,
// '0' at x=360, y=0; cell 36x48). For damage splats and juicy counters.
export function drawGoldNumber(ctx, value, cx, cy, h = 16) {
  const sheet = MEDIA.sheets?.ui_gold;
  if (!sheet) return false;
  const im = mimg(sheet.file);
  if (!im) return false;
  const str = String(Math.max(0, value | 0));
  const w = h * 0.62, adv = w * 0.86;
  let x = cx - (str.length * adv) / 2;
  ctx.imageSmoothingEnabled = false;
  for (const chr of str) {
    const d = chr.charCodeAt(0) - 48;
    const sx = d === 0 ? 360 : d * 36;
    ctx.drawImage(im, sx, 0, 36, 48, x, cy - h / 2, w, h);
    x += adv;
  }
  ctx.imageSmoothingEnabled = true;
  return true;
}

// Wandering gem geode node: crystal cell + sparkle.
export function drawGeode(ctx, gemRow, gemCol, now, sx, sy) {
  const sheet = MEDIA.sheets?.gems;
  if (!sheet) return false;
  const im = mimg(sheet.file);
  if (!im) return false;
  const S = 74 + Math.sin(now / 500) * 2;
  ctx.drawImage(im, gemCol * sheet.cellW, gemRow * sheet.cellH, sheet.cellW, sheet.cellH, sx - S / 2, sy + 8 - S, S, S);
  // sparkle
  const tw = (now / 160 + sx) % 8;
  if (tw < 1.6) {
    ctx.save();
    ctx.globalAlpha = 0.8 - tw * 0.4;
    ctx.fillStyle = '#ffffff';
    const px = sx + Math.sin(sx * 7 + now / 900) * 14, py = sy - 26 + Math.cos(sy * 5 + now / 700) * 12;
    ctx.fillRect(px - 1, py - 5, 2, 10); ctx.fillRect(px - 5, py - 1, 10, 2);
    ctx.restore();
  }
  return true;
}

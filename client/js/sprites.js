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
// Deployed gear-sheet weapons: register their compiled LPC sheets into the
// weapon manifest so a custom weapon (vis.type = its item id) renders in-world
// exactly like a built-in one — carry sheet as the held/walk art, and the
// slash/thrust overlays as its perAnim attack frames.
export function registerCustomWeaponArt(defs) {
  if (!manifest) return;
  manifest.weapons = manifest.weapons || {};
  let changed = false;
  for (const [id, d] of Object.entries(defs || {})) {
    const g = d?.gear;
    if (!g || (g.slot && g.slot !== 'weapon') || !g.sheets?.carry) continue;
    const color = g.color || 'steel';
    const w = { grid: 64 };
    const per = {};
    if (g.sheets.carry_over) {
      // OVERSIZE held: a big weapon ships its walk/idle art as a 128px overlay instead
      // of a baked 64px carry, so a long blade isn't shaved off by the body cell. It
      // plays via drawOversize.walk (idle falls back to walk frame 0), drawn over the body.
      per.walk = { bg: {}, fg: { [color]: g.sheets.carry_over } };
    } else {
      // carry ships an fg (over-body facings) and, when the maker marked any facing
      // 'behind body', a bg (under-body facings) — so a held weapon layers per facing
      // (e.g. in front facing south, behind the body facing north)
      w.fg = { [color]: g.sheets.carry };
      if (g.sheets.carry_bg) w.bg = { [color]: g.sheets.carry_bg };
    }
    if (g.sheets.slash) per.slash = { bg: { [color]: g.sheets.slash }, fg: {} };
    if (g.sheets.thrust) per.thrust = { bg: { [color]: g.sheets.thrust }, fg: {} };
    if (Object.keys(per).length) w.perAnim = per;
    manifest.weapons[id] = w;
    changed = true;
  }
  if (changed) composites.clear();   // re-bake looks so the new weapon art shows
  return changed;
}
// Existing in-game weapons, for the gear sheet maker's "import" picker.
export function weaponList() { return manifest ? Object.keys(manifest.weapons || {}).sort() : []; }
// A weapon can be imported into the gear maker only if it has a held/walk sheet to
// trace (fg or bg). Some manifest entries are icon-/procedural-only with neither, so
// the picker filters by this. Deployed custom weapons carry an fg sheet, so they pass.
export function weaponImportable(type) { return !!(weaponSheetFile(type, 'fg') || weaponSheetFile(type, 'bg')); }
// The fg (or bg) sheet file for a weapon type at a colour, with sensible fallback.
export function weaponSheetFile(type, part = 'fg', color) {
  const w = manifest?.weapons?.[type]; if (!w) return null;
  const dict = w[part] || {};
  return dict[color] || dict.iron || dict.steel || dict.medium || Object.values(dict).find((v) => typeof v === 'string') || null;
}
// The LPC wardrobe, for the compositor's Gear browser: every equipment slot/type
// with its available dye colours. { 'torso/plate': ['copper','iron',…], … }
export function gearCatalog() {
  const out = {};
  for (const [k, v] of Object.entries(manifest?.gear || {})) out[k] = Object.keys(v.male || v.female || {});
  return out;
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
// The mail sheets ship in near-identical greys, so chainmail is ALWAYS dyed to
// its metal tint (steel/iron keep their native art); other sheets use their
// exact palette file when one exists and tint a neutral sheet otherwise — so
// new metals (mithril) dye correctly on every armour line.
const FORCE_DYE = new Set(['torso/chainmail', 'head/mail', 'shield/kite']);
// Wings ship one design each; the colour variants are baked by hue-tinting the
// light feathers (blue) or multiply-darkening them (black). `mul` darkens.
const WING_TINT = { white: null, blue: { tint: '#4aa0e0' }, red: { tint: '#d24a3a' }, black: { mul: '#2a2a30' }, gray: { mul: '#8a8a90' } };
function gearFile(sheetKey, sex, color) {
  const g = pick(manifest.gear, sheetKey, sex);
  if (!g) return null;
  if (sheetKey.includes('wings_')) {
    const base = g.default || Object.values(g).find(Boolean);
    const w = WING_TINT[color];
    return w ? { f: base, ...w } : base;
  }
  const neutral = g.steel || g.iron || Object.values(g).find(Boolean);
  if (FORCE_DYE.has(sheetKey) && METAL_TINT[color] && color !== 'steel' && color !== 'iron')
    return { f: neutral, tint: METAL_TINT[color] };
  if (g[color]) return g[color];
  if (METAL_TINT[color]) return { f: neutral, tint: METAL_TINT[color] };
  return neutral;
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
  try {
    compositeInto(c, vis);
  } catch (err) {
    // never cache a wedged sheet — drop the entry so the next frame retries
    // (e.g. a click that raced the manifest fetch)
    console.error('[composite]', err);
    composites.delete(key);
  }
  return c;
}
function compositeInto(c, vis) {
  const sex = vis.sex || 'male';
  const layers = []; // [file, isWeaponBg]
  const wep = vis.weapon ? weaponFiles(vis.weapon[0], vis.weapon[1], sex, vis.weapon[3]) : null;

  if (wep?.bg) layers.push(wep.bg);
  // behind-the-body layer: quiver (legacy truthy flag) or [sheet, color] —
  // wings and tails ride here, drawn behind the body like the weapon bg. Wings
  // also get a FRONT layer (drawn after the body) so the near wing wraps over
  // the shoulder correctly.
  let wingFront = null, capeFront = null;
  if (vis.behind) {
    const bh = Array.isArray(vis.behind) ? vis.behind : ['quiver', 'brown'];
    layers.push(gearFile('behind/' + bh[0], sex, bh[1] || 'brown'));
    if (String(bh[0]).startsWith('wings_')) wingFront = gearFile('wingfront/' + bh[0], sex, bh[1] || 'white');
    // capes get a FRONT companion: the away-facing cape + a collar over the chest
    // (the behind sheet alone vanishes facing north and hides the necktie)
    if (String(bh[0]).startsWith('cape')) capeFront = gearFile('capefront/' + bh[0], sex, bh[1] || 'brown');
  }
  // worn backpack: the pack/basket rides behind the body; its straps + basket rim
  // are a FRONT layer (drawn over the torso). vis.pack[0] is the pack key. Only
  // colours actually present in each layer are drawn (no neutral fallback — a
  // coloured pack has no behind sheet, and must not borrow a basket's).
  const packKey = vis.pack && (Array.isArray(vis.pack) ? vis.pack[0] : vis.pack);
  const packHas = (cat) => packKey && pick(manifest.gear, cat, sex)?.[packKey];
  const packFront = packHas('packfront/pack') ? gearFile('packfront/pack', sex, packKey) : null;
  if (packHas('behind/pack')) layers.push(gearFile('behind/pack', sex, packKey));
  layers.push(pick(manifest.bodies, sex, vis.skin || 'light') || pick(manifest.bodies, sex, 'light'));
  if (vis.monster) { // beast-folk: goblin/orc/minotaur/lizard/wolf heads
    const mh = manifest.monsters?.[vis.monster];
    layers.push(mh?.[vis.skin] || (mh && Object.values(mh).find(Boolean)));
  } else {
    layers.push(pick(manifest.heads, sex, vis.skin || 'light') || pick(manifest.heads, sex, 'light'));
  }
  if (vis.hair && !vis.head && !vis.monster) layers.push(pick(manifest.hair, vis.hair[0], sex, vis.hair[1]));
  if (vis.beard) layers.push(manifest.beard[vis.beard]);
  // gear layers may carry a surface fx (vis[3]): studs, scales, runes — the
  // pattern is stamped over the garment's own pixels at bake time
  const gearL = (path, arr) => {
    let f = gearFile(path, sex, arr[1]);
    if (f && arr[3]) f = typeof f === 'string' ? { f, fx: arr[3] } : { ...f, fx: arr[3] };
    return f;
  };
  if (vis.feet) layers.push(gearL('feet/' + vis.feet[0], vis.feet));
  if (vis.legs) layers.push(gearL('legs/' + vis.legs[0], vis.legs));
  if (vis.torso) layers.push(gearL('torso/' + vis.torso[0], vis.torso));
  if (vis.wrists) layers.push(gearL('wrists/' + vis.wrists[0], vis.wrists));
  if (vis.hands) layers.push(gearL('hands/gloves', vis.hands));
  if (vis.shoulders) layers.push(gearL('shoulders/' + vis.shoulders[0], vis.shoulders));
  if (vis.head) layers.push(gearL('head/' + vis.head[0], vis.head));
  if (capeFront) layers.push(capeFront);   // away-facing cape + collar, over the body
  if (wingFront) layers.push(wingFront);   // near wing wraps over the body
  if (packFront) layers.push(packFront);   // backpack straps / basket rim over the torso
  // LPC kite shield: a real baked off-hand layer (walk/slash/thrust rows), dyed
  // to the metal tier via FORCE_DYE. Sits over the body, under the weapon.
  if (vis.shield) layers.push(gearL('shield/' + (vis.shield[0] || 'kite'), vis.shield));
  if (wep?.fg) layers.push(wep.fg);
  if (wep?.shootPatch) layers.push(wep.shootPatch);   // recurve/great bows borrow the bow sheet's shoot rows
  if (wep?.perAnim) c.oversize = wep.perAnim; // spear overlays drawn at render time
  // swords cut INWARD: their slash rows play in reverse (see drawChar/drawOversize)
  c.reverseSlash = !!(vis.weapon && SLASH_REVERSE.has(vis.weapon[0]));

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
      let src = spec.metalTint ? dualTinted(im, spec.tint, spec.metalTint)
        : spec.tint ? tinted(im, spec.tint) : spec.mul ? tintedMul(im, spec.mul) : im;
      if (spec.fx) src = decorated(src, spec.fx);
      if (spec.rows === 'shoot') {
        // patch only the shoot rows (16-19) — used to lend firing art to bows
        // whose own sheets ship those rows empty
        const y0 = 16 * FRAME, hh = Math.min(4 * FRAME, h - y0);
        if (hh > 0) ctx.drawImage(src, 0, y0, 832, hh, 0, y0, 832, hh);
      } else if (spec.scl) {
        // re-scale each 64px weapon cell about the wielder's grip: daggers
        // shrink to short blades, arbalests and siege arbalests grow a size up
        const scl = spec.scl, pxp = 34, pyp = 46;
        for (let ry = 0; ry * FRAME < h; ry++)
          for (let cx2 = 0; cx2 < 13; cx2++) {
            const dx = cx2 * FRAME, dy = ry * FRAME;
            ctx.drawImage(src, dx, dy, FRAME, FRAME, dx + pxp - pxp * scl, dy + pyp - pyp * scl, FRAME * scl, FRAME * scl);
          }
      } else ctx.drawImage(src, 0, 0, 832, h, 0, 0, 832, h);
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
const METAL_TINT = { copper: '#b87333', bronze: '#c98f57', iron: '#8d94a0', steel: '#e2e7ee', brass: '#d8b45e', silver: '#eef2f8', gold: '#e8c84e', dark: '#6a6480', walnut: '#9a6a3c', normal: null, wood: null,
  mithril: '#42589c',                                              // navy-blue metal of the deep seams
  ashwood: '#b59a77', elmwood: '#8a6a42', yewwood: '#6a4a2a',      // crossbow stock woods
  // rare-blade finishes: each unique sword tints its LPC model to match its icon
  tide: '#5fa8dc', blood: '#8a2020', ember: '#ff6a2a', bone: '#e8dcc0', abyss: '#8a4ae0', venom: '#7fe07f' };
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
// Two-material dye for the crossbow family: the art's SATURATED pixels (the
// wooden stock) tint to the stock wood, its grey low-saturation pixels (the
// bow limbs, trigger, plate) tint to the limb metal — so every wood x metal
// variant shows both materials honestly.
function dualTinted(im, woodTint, metalTint) {
  const key = im.src + '|dual|' + woodTint + '|' + metalTint;
  let c = tintCache.get(key);
  if (c) return c;
  const woodC = woodTint ? tinted(im, woodTint) : im;
  const metalC = tinted(im, metalTint);
  c = document.createElement('canvas');
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(woodC, 0, 0);
  const out = g.getImageData(0, 0, c.width, c.height);
  const mg = document.createElement('canvas');
  mg.width = c.width; mg.height = c.height;
  const mctx = mg.getContext('2d');
  mctx.drawImage(metalC, 0, 0);
  const met = mctx.getImageData(0, 0, c.width, c.height);
  const srcCv = document.createElement('canvas');
  srcCv.width = c.width; srcCv.height = c.height;
  const sctx = srcCv.getContext('2d');
  sctx.drawImage(im, 0, 0);
  const orig = sctx.getImageData(0, 0, c.width, c.height);
  for (let p = 0; p < orig.data.length; p += 4) {
    if (orig.data[p + 3] < 10) continue;
    const r = orig.data[p], gg2 = orig.data[p + 1], b = orig.data[p + 2];
    const mx = Math.max(r, gg2, b);
    const sat = mx ? (mx - Math.min(r, gg2, b)) / mx : 0;
    if (sat < 0.18) { out.data[p] = met.data[p]; out.data[p + 1] = met.data[p + 1]; out.data[p + 2] = met.data[p + 2]; out.data[p + 3] = met.data[p + 3]; }
  }
  g.putImageData(out, 0, 0);
  tintCache.set(key, c);
  return c;
}
// Multiply-darken toward a colour (for black/grey wings where a hue shift can't
// dim white feathers). Preserves alpha.
function tintedMul(im, col) {
  const key = im.src + '|mul|' + col;
  let c = tintCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(im, 0, 0);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(im, 0, 0);
  tintCache.set(key, c);
  return c;
}
// Surface fx stamped over a garment's own pixels (source-atop respects alpha):
// studs = riveted dots, scales = overlapping dragonhide crescents, runes =
// stitched glyphs. These are stamped PER 64px CELL — the pattern restarts at
// every frame's origin, so it sits STILL on the garment as the wearer animates
// (a fixed texture, not a crawling one). 'arcane' is the exception: its runic
// shimmer is painted continuously across the whole sheet so it drifts over the
// hide frame-to-frame — a deliberate living-magic animation on spellhide gear.
const decoCache = new Map();
function stampFx(g, fx, ox, oy, w, h) {
  if (fx === 'studs') {
    for (let y = 22; y < h; y += 5) {
      const x0 = ((y / 5) | 0) % 2 ? 2 : 4;
      for (let x = x0; x < w; x += 5) {
        g.fillStyle = 'rgba(226,231,238,0.85)'; g.fillRect(ox + x, oy + y, 1.6, 1.6);
        g.fillStyle = 'rgba(40,40,48,0.5)'; g.fillRect(ox + x + 0.8, oy + y + 1.2, 1.2, 0.8);
      }
    }
  } else if (fx === 'scales') {
    g.lineWidth = 1;
    for (let y = 20; y < h; y += 4) {
      const off = ((y / 4) | 0) % 2 ? 3 : 0;
      for (let x = off; x < w; x += 6) {
        g.strokeStyle = 'rgba(0,0,0,0.30)';
        g.beginPath(); g.arc(ox + x + 3, oy + y, 3, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.20)';
        g.beginPath(); g.arc(ox + x + 3, oy + y - 1, 3, 0.25 * Math.PI, 0.75 * Math.PI); g.stroke();
      }
    }
  } else if (fx === 'runes') {
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1;
    const GLYPH = [[0, 0, 0, 3], [0, 1, 2, 1], [0, 3, 2, 0], [2, 0, 2, 3]];
    for (let y = 26; y < h; y += 9) for (let x = ((y / 9) | 0) % 2 ? 3 : 8; x < w; x += 11) {
      const seg = GLYPH[((x * 7 + y * 13) >> 2) % GLYPH.length];
      g.beginPath(); g.moveTo(ox + x + seg[0], oy + y + seg[1]); g.lineTo(ox + x + seg[2], oy + y + seg[3]); g.stroke();
    }
  } else if (fx === 'arcane') {
    // luminous runic glyphs woven through the hide — bright cyan strokes with a
    // violet glow node, read clearly against any dye so the shimmer stands out
    const GLYPH = [[0, 0, 0, 3], [0, 1, 2, 1], [0, 3, 2, 0], [2, 0, 2, 3], [0, 0, 2, 2], [2, 0, 0, 2]];
    g.lineWidth = 1.1; g.lineCap = 'round';
    for (let y = 24; y < h; y += 8) for (let x = ((y / 8) | 0) % 2 ? 4 : 9; x < w; x += 10) {
      const seg = GLYPH[((x * 7 + y * 13) >> 2) % GLYPH.length];
      g.strokeStyle = 'rgba(120,190,255,0.45)'; g.lineWidth = 2.2;   // soft outer glow
      g.beginPath(); g.moveTo(ox + x + seg[0], oy + y + seg[1]); g.lineTo(ox + x + seg[2], oy + y + seg[3]); g.stroke();
      g.strokeStyle = 'rgba(200,240,255,0.9)'; g.lineWidth = 1;       // bright core
      g.beginPath(); g.moveTo(ox + x + seg[0], oy + y + seg[1]); g.lineTo(ox + x + seg[2], oy + y + seg[3]); g.stroke();
      g.fillStyle = 'rgba(224,190,255,0.85)'; g.fillRect(ox + x + seg[0] - 0.3, oy + y + seg[1] - 0.3, 1.6, 1.6);  // violet node
    }
    g.lineCap = 'butt';
  }
}
function decorated(im, fx) {
  const key = (im.src || im.toDataURL?.().slice(0, 40) || 'c') + '|' + fx + '|' + im.width;
  let c = decoCache.get(key);
  if (c) return c;
  const W2 = im.naturalWidth || im.width, H2 = im.naturalHeight || im.height;
  c = document.createElement('canvas'); c.width = W2; c.height = H2;
  const g = c.getContext('2d');
  g.drawImage(im, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  if (fx === 'arcane') stampFx(g, fx, 0, 0, W2, H2);              // one continuous field → drifts (animated)
  else for (let cy = 0; cy < H2; cy += 64) for (let cx = 0; cx < W2; cx += 64) stampFx(g, fx, cx, cy, 64, 64);  // per-cell → fixed
  g.globalCompositeOperation = 'source-over';
  decoCache.set(key, c);
  return c;
}

// Daggers reuse the sword sheets shrunk toward the grip; arbalests and siege
// arbalests reuse the crossbow sheet scaled UP a step per frame.
// Daggers now use REAL LPC dagger art (walk/thrust/slash overlays) — no more
// shrunk-sword hack. Arbalests still reuse the crossbow sheet scaled up.
const WEAPON_ALIAS = {
  arbalest: { base: 'crossbow', scl: 1.12 },
  siege: { base: 'crossbow', scl: 1.26 },
  // the greatsword is the broad alt-longsword blade grown a size for a two-hander
  greatsword: { base: 'longsword_alt', scl: 1.32 },
};
// blades that cut INWARD across the body: their slash rows play in reverse
const SLASH_REVERSE = new Set(['sword', 'longsword', 'longsword_alt', 'scimitar', 'saber', 'katana', 'rapier', 'glowsword', 'greatsword']);
function weaponFiles(type, color, sex = 'male', metal = null) {
  const alias = WEAPON_ALIAS[type];
  const base = alias ? alias.base : type;
  const w = manifest.weapons[base];
  if (!w) return null;
  const out = { perAnim: w.perAnim || null, color, scl: alias?.scl };
  // waraxes swing with the two-handed overhead cleave (the big tool arc),
  // tinted to their metal — not the one-hand sword slash
  if (type === 'waraxe' && manifest.weapons.axe?.perAnim) out.perAnim = manifest.weapons.axe.perAnim;
  // pickaxes mine with a TWO-HANDED overhead swing: the smash arc rides the
  // braced thrust body rows (mining nodes play 'thrust'), distinct from the
  // hatchet's side chop
  if (type === 'pickaxe' && out.perAnim?.slash) out.perAnim = { ...out.perAnim, thrust: out.perAnim.slash };
  // recurve + great bows ship empty shoot rows: borrow the standard bow's
  // firing art in the matching wood so every bow has a draw-and-loose anim
  if ((type === 'recurve' || type === 'great') && manifest.weapons.bow?.fg) {
    const bfg = manifest.weapons.bow.fg;
    const base = bfg[color] || bfg.medium || Object.values(bfg).find(Boolean);
    if (base) out.shootPatch = { f: base, rows: 'shoot' };
  }
  // neutral fallback (steel) so an unknown colour tints a grey blade, never brass
  const neutral = (dict) => dict && (dict.steel || dict.iron || Object.values(dict).find(Boolean));
  if (w.sexed) {                                                                    // tools (axe/pickaxe): single sheet, tint per metal
    const f = w.sexed[sex] || Object.values(w.sexed).find(Boolean);
    out.fg = f && METAL_TINT[color] ? { f, tint: METAL_TINT[color] } : f;
  } else if (w.fg || w.bg) {
    const exact = w.fg?.[color];
    const fb = neutral(w.fg);
    out.fg = exact || (fb && METAL_TINT[color] ? { f: fb, tint: METAL_TINT[color] } : fb);
    const exBg = w.bg?.[color];
    const fbBg = neutral(w.bg);
    out.bg = exBg || (fbBg && METAL_TINT[color] ? { f: fbBg, tint: METAL_TINT[color] } : fbBg);
  }
  // crossbow family: the stock tints to its wood, but the LIMBS (the grey
  // low-saturation pixels of the art) tint to the frame's limb METAL — so an
  // arbalest's bow visually matches the crossbow limbs it was built from
  if (base === 'crossbow' && metal && METAL_TINT[metal]) {
    const dual = (spec) => spec && { ...(typeof spec === 'string' ? { f: spec } : spec), metalTint: METAL_TINT[metal] };
    out.fg = dual(out.fg); out.bg = dual(out.bg);
  }
  // flag the composite layers so the baker re-scales them about the grip
  if (out.scl) { out.fg = tagScale(out.fg, out.scl); out.bg = tagScale(out.bg, out.scl); }
  return (out.fg || out.bg || out.perAnim || out.shootPatch) ? out : null;
}
function tagScale(spec, scl) {
  if (!spec) return spec;
  return typeof spec === 'string' ? { f: spec, scl } : { ...spec, scl };
}

// Draw a composited character. dir: 0 up,1 left,2 down,3 right.
export function drawChar(ctx, comp, anim, dir, frame, sx, sy, scale = 1) {
  if (!comp.ready) return;
  const a = ANIMS[anim] || ANIMS.idle;
  const row = a.nodir ? a.row : a.row + dir;
  let f = Math.min(frame, a.frames - 1);
  if (anim === 'slash' && comp.reverseSlash) f = a.frames - 1 - f;   // swords cut inward
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
  const type = (vis.weapon && vis.weapon[0]) || '';
  const color = (vis.weapon && vis.weapon[1]) || 'steel';
  const shrink = WEAPON_ALIAS[type]?.scl || 1;
  for (const part of ['bg', 'fg']) {
    const dict = set[part] || {};
    // exact metal art if the sheet has it, else tint a neutral sheet to the tier
    const exact = dict[color];
    const fallback = dict.steel || dict.tool || Object.values(dict).find(Boolean);
    const file = exact || fallback;
    if (!file) continue;
    const im = img(file);
    if (!im.complete || !im.naturalWidth) continue;
    const src = (!exact && METAL_TINT[color]) ? tinted(im, METAL_TINT[color]) : im;
    const fs = im.naturalHeight / 4;
    const cols = Math.floor(im.naturalWidth / fs);
    const a = ANIMS[anim === 'idle' ? 'walk' : anim] || ANIMS.idle;
    let ff = Math.min(f, Math.min(a.frames, cols) - 1);
    if (anim === 'slash' && comp.reverseSlash) ff = Math.min(a.frames, cols) - 1 - ff;  // inward cut
    const S = fs * scale * shrink;
    ctx.drawImage(src, ff * fs, dir * fs, fs, fs, sx - S / 2, sy - (fs / 2 + 20) * scale, S, S);
  }
  // the staff's focus crystal rides the staff head as a glowing orb (matches
  // the icon's gem; colour carried on vis.weapon[2])
  if (type === 'staff' && vis.weapon && vis.weapon[2]) {
    const gem = vis.weapon[2];
    const jab = anim === 'thrust' ? Math.min(3, Math.max(0, f - 2)) * 2.4 : 0;   // extends with the cast jab
    const gx = sx + (dir === 1 ? -9 - jab : dir === 3 ? 9 + jab : dir === 0 ? -7 : 8) * scale;
    const gy = sy + (-36 - (anim === 'thrust' ? 2 : 0)) * scale + (anim === 'walk' ? Math.sin(f * 1.1) * scale : 0);
    ctx.save();
    ctx.shadowColor = gem; ctx.shadowBlur = 9 * scale;
    ctx.fillStyle = gem;
    ctx.beginPath(); ctx.arc(gx, gy, 2.4 * scale, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(gx - 0.7 * scale, gy - 0.7 * scale, 0.9 * scale, 0, 7); ctx.fill();
    ctx.restore();
  }
}

// (The off-hand shield is now a real baked LPC kite-shield layer — see the
// shield handling in compositeInto() — so no procedural shield draw is needed.)

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
  rat: { kind: 'quad', body: '#8a8072', hi: '#a89c8c', sh: '#645b50', size: 0.45, len: 13, ht: 6, leg: 3.5, legW: 2, headR: 5, ears: 'round', tail: 'thin', snout: 'point' },
  rabbit: { kind: 'quad', body: '#b59a77', hi: '#e0cdb0', sh: '#8a7255', size: 0.55, len: 10, ht: 9, leg: 4, legW: 2.4, headR: 5.5, ears: 'tall', tail: 'puff', snout: 'short', hop: true },
  boar: { kind: 'quad', body: '#4e3a28', hi: '#6b5238', sh: '#31241a', size: 1.0, len: 15, ht: 8.5, leg: 4.4, legW: 3.4, headR: 5.5, hoof: '#241a12', ears: 'round', tail: 'curl', snout: 'boar', tusks: true, mane: true, hump: true, headLow: true },
  bear: { kind: 'quad', body: '#5a3c22', hi: '#7c5636', sh: '#38230f', size: 1.35, len: 15, ht: 10.5, leg: 5, legW: 4, headR: 6, ears: 'round', snout: 'long', hump: true, headLow: true, mane: true },
  wolf: { kind: 'quad', body: '#767a82', hi: '#9a9da5', sh: '#4e5158', size: 0.92, len: 17, ht: 6.8, leg: 6.6, legW: 2.6, headR: 5.2, ears: 'point', tail: 'bush', snout: 'long' },
  icewolf: { kind: 'quad', body: '#c4d6e4', hi: '#eef6fb', sh: '#8fa8bc', size: 0.98, len: 17, ht: 6.8, leg: 6.6, legW: 2.6, headR: 5.2, ears: 'point', tail: 'bush', snout: 'long', glow: '#bfe0ff' },
  panther: { kind: 'quad', body: '#26282f', hi: '#3c3f4a', sh: '#141519', size: 0.95, len: 18, ht: 6.4, leg: 6.6, legW: 2.4, headR: 5, ears: 'round', tail: 'long', snout: 'short', sleek: true },
  goat: { kind: 'quad', body: '#cfc4b0', hi: '#e8e0d0', sh: '#a89a80', size: 0.72, len: 13, ht: 7.6, leg: 6, legW: 2.4, headR: 5, hoof: '#2a2018', ears: 'round', tail: 'thin', snout: 'short', horns: 'curl', beard: true },
  stag: { kind: 'quad', body: '#caa348', hi: '#f0d27a', sh: '#9a7a2a', size: 1.0, len: 15, ht: 7.4, leg: 8, legW: 2.4, headR: 5, hoof: '#3a2c18', ears: 'point', tail: 'puff', snout: 'long', antlers: true, glow: '#ffe08a' },
  hawk: { kind: 'bird', body: '#8a6234', hi: '#c8a26a', sh: '#5e4222', size: 0.72 },
  serpent: { kind: 'snake', body: '#4a7040', hi: '#7ba05f', sh: '#2e4a28', size: 1.0 },
  leech: { kind: 'worm', body: '#42502e', hi: '#5f7440', sh: '#2a341c', size: 0.8 },
  treant: { kind: 'tree', bark: '#5a4326', barkHi: '#785c38', leaf: '#3e7a2e', leafHi: '#5aa03c', size: 1.05 },
  troll: { kind: 'brute', body: '#5e7150', hi: '#7e9070', sh: '#3e4c34', size: 1.1 },
  giant: { kind: 'brute', body: '#8fa8bc', hi: '#b8cbd9', sh: '#5e7284', size: 1.35, frost: true },
  abyssal: { kind: 'brute', body: '#4a1f2e', hi: '#7a3550', sh: '#26101a', size: 1.28, horns: true, glow: '#e0304a', cracks: true },
  // ---- farm animals (procedural quads; 3D packs unusable in the 2D engine) ----
  cow: { kind: 'quad', body: '#efe6d6', hi: '#ffffff', sh: '#c8bca6', size: 1.1, len: 17, ht: 10, leg: 6.5, legW: 3.6, headR: 6, hoof: '#2a221a', ears: 'round', snout: 'long', horns: 'curl', cowspots: true, udder: true, headLow: true },
  sheep: { kind: 'quad', body: '#eae4d6', hi: '#fbf7ec', sh: '#c2b8a4', size: 0.82, len: 13, ht: 10, leg: 3.8, legW: 2.6, headR: 4.6, hoof: '#2a221a', ears: 'round', snout: 'short', wool: true, headLow: true },
  pig: { kind: 'quad', body: '#e79aa2', hi: '#f4bcc0', sh: '#b96e78', size: 0.8, len: 15, ht: 9, leg: 3, legW: 3.2, headR: 5, hoof: '#7a4a50', ears: 'round', snout: 'boar', tail: 'curl', hump: true, headLow: true },
  horse: { kind: 'quad', body: '#7a5230', hi: '#9c6c40', sh: '#4e341c', size: 1.15, len: 18, ht: 8.4, leg: 9, legW: 2.8, headR: 5.4, hoof: '#241812', ears: 'point', snout: 'long', tail: 'long', horsemane: true },
  alpaca: { kind: 'quad', body: '#d8c29a', hi: '#efe0c0', sh: '#a88f66', size: 0.95, len: 11, ht: 9, leg: 7.5, legW: 2.4, headR: 4.4, ears: 'point', snout: 'short', wool: true, longneck: true },
  farmdog: { kind: 'quad', body: '#a8763e', hi: '#c8945a', sh: '#75512a', size: 0.5, len: 13, ht: 6.6, leg: 5, legW: 2.4, headR: 5.2, ears: 'flop', tail: 'bush', snout: 'point' },
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

// Creatures are drawn facing RIGHT; the renderer mirrors dir-1 (left) horizontally.
// Each has four animation states — idle (gentle breathing), walk (leg/wing cycle),
// attack (a forward lunge with bared jaws/claws) and hurt (a recoil with a red
// impact flash and clenched eyes).
export function critterSprite(type, frame = 0, dir = 2, anim = 'walk', dead = false) {
  const st = CRITTER_STYLE[type] || CRITTER_STYLE.rat;
  const key = `cr:${type}:${frame}:${dir}:${anim}:${dead ? 1 : 0}`;
  return proc(key, 64, 64, (g) => {
    g.save();
    if (dead) { g.globalAlpha = 0.55; g.translate(32, 48); g.rotate(1.2); g.translate(-32, -40); }
    const s = st.size;
    const walking = anim === 'walk';
    const swing = walking ? Math.sin(frame * 0.8) : anim === 'idle' ? Math.sin(frame * 0.35) * 0.3 : 0;
    const bob = walking ? Math.round(Math.abs(Math.cos(frame * 0.8)) * (st.hop ? 3 : 1.5)) : 0;
    // attack: a 0→1→0 lunge; hurt: a recoil that eases out over the frames
    const atk = anim === 'attack' ? Math.sin(Math.min(1, frame / 3) * Math.PI) : 0;
    const hurt = anim === 'hurt' ? Math.max(0, 1 - frame / 4) : 0;
    const pose = { atk, hurt, dir };
    if (!dead) g.translate(atk * 6 - hurt * 5, -atk * 1.5 + hurt * 1);   // shove the whole body
    if (st.glow) { g.shadowColor = st.glow; g.shadowBlur = 9; }
    const kind = st.kind;
    if (kind === 'quad') drawQuad(g, st, s, swing, bob, type, pose);
    else if (kind === 'bird') drawBird(g, st, s, swing, pose);
    else if (kind === 'snake') drawSnake(g, st, s, frame, pose);
    else if (kind === 'worm') drawWorm(g, st, s, frame, pose);
    else if (kind === 'tree') drawTreant(g, st, s, swing, pose);
    else if (kind === 'brute') drawBrute(g, st, s, swing, bob, pose);
    else if (kind === 'wisp') drawWisp(g, st, frame);
    else if (kind === 'spider') drawSpider(g, st, s, swing, pose);
    if (hurt > 0.35) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgba(255,90,90,${hurt * 0.45})`; g.fillRect(0, 0, 64, 64); g.globalCompositeOperation = 'source-over'; }
    g.shadowBlur = 0; g.restore();
  });
}

function eye(g, x, y, r = 1.6, glint = true) {
  px(g, x - r, y - r, r * 2, r * 2, '#0c0c10');
  if (glint) px(g, x, y - r, 1, 1, '#fff');
}
// clenched/pained eye for the hurt pose
function eyeX(g, x, y) { g.strokeStyle = '#0c0c10'; g.lineWidth = 1; g.beginPath(); g.moveTo(x - 2, y - 2); g.lineTo(x + 2, y + 2); g.moveTo(x + 2, y - 2); g.lineTo(x - 2, y + 2); g.stroke(); }
// bared jaws for the attack pose (an open red maw with a fang)
function maw(g, x, y, r, atk) { g.fillStyle = '#3a0e12'; g.beginPath(); g.ellipse(x, y, r, r * (0.5 + atk), 0, 0, 7); g.fill(); g.fillStyle = '#f4ecd8'; px(g, x - r * 0.6, y - r * 0.4, 1.2, 2.2, '#f4ecd8'); px(g, x + r * 0.3, y - r * 0.4, 1.2, 2.2, '#f4ecd8'); }

// Draw a set of overlapping ellipses as one clean silhouette: every outline
// ring first, then every fill, so internal seams get painted over and only the
// outer edge keeps its outline. Used to build a chest+barrel+haunch torso.
function blobs(g, list, fill, outline) {
  if (outline) { g.fillStyle = outline; for (const [x, y, rx, ry] of list) { g.beginPath(); g.ellipse(x, y, rx + 1, ry + 1, 0, 0, 7); g.fill(); } }
  g.fillStyle = fill; for (const [x, y, rx, ry] of list) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill(); }
}

// Front (dir 2, toward camera) and back (dir 0, walking away) views of the
// four-legged animals: a narrow foreshortened body, symmetric features, the
// face only when it looks at you — and the tail only when it doesn't.
function drawQuadFB(g, st, s, swing, bob, type, pose = {}) {
  const front = pose.dir === 2;
  const cx = 32, cy = 40 - bob;
  const bw = (st.len ?? 15) * s * 0.42, bh = (st.ht ?? 8) * s * 1.15;   // foreshortened barrel
  const legLen = (st.leg ?? 6) * s, legW = Math.max(2, (st.legW ?? 3) * s);
  const legY = cy + bh - 1;
  const hoof = st.hoof || '#241c16';
  // ground contact shadow
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.beginPath(); g.ellipse(cx, legY + legLen + 1, bw * 1.5, 2.2 * s, 0, 0, 7); g.fill();
  // the visible leg pair, striding alternately (vertical scissor toward camera)
  for (const [side, ph] of [[-1, swing], [1, -swing]]) {
    const lx = cx + side * bw * 0.55, lift = Math.max(0, ph * 1.6 * s);
    px(g, lx - legW / 2 - 1, legY - lift, legW + 2, legLen - lift + 1, OUTLINE);
    px(g, lx - legW / 2, legY - lift, legW, legLen - lift, st.sh);
    px(g, lx - legW / 2, legY + legLen - lift - Math.max(2, legLen * 0.3), legW, Math.max(2, legLen * 0.3), hoof);
  }
  // haunches flanking the barrel
  blobs(g, [
    [cx - bw * 0.7, cy + bh * 0.25, bw * 0.55, bh * 0.55],
    [cx + bw * 0.7, cy + bh * 0.25, bw * 0.55, bh * 0.55],
    [cx, cy, bw, bh],
  ], st.body, OUTLINE);
  // form shading: lit crown, shaded flanks
  g.save();
  g.beginPath(); g.ellipse(cx, cy, bw * 1.05, bh * 1.02, 0, 0, 7); g.clip();
  oval(g, cx, cy + bh * 0.55, bw * 0.95, bh * 0.5, st.sh);
  g.globalAlpha = 0.85; oval(g, cx, cy - bh * 0.45, bw * 0.8, bh * 0.42, st.hi); g.globalAlpha = 1;
  g.restore();
  if (st.hump) oval(g, cx, cy - bh * 0.55, bw * 0.8, bh * 0.4, st.body, OUTLINE);
  if (st.wool) for (let i = -2; i <= 2; i++) oval(g, cx + i * bw * 0.42, cy - bh * 0.35 + (i % 2) * 2, bw * 0.34, bh * 0.3, st.hi, OUTLINE);
  if (st.cowspots) { oval(g, cx - bw * 0.45, cy - bh * 0.1, bw * 0.32, bh * 0.3, '#3a332c'); oval(g, cx + bw * 0.4, cy + bh * 0.3, bw * 0.28, bh * 0.24, '#3a332c'); }
  if (st.udder && front) oval(g, cx, cy + bh * 0.72, bw * 0.34, bh * 0.18, '#e79aa2', OUTLINE);
  if (st.shell) { oval(g, cx, cy - bh * 0.1, bw * 0.9, bh * 0.7, st.sh, OUTLINE); g.strokeStyle = st.hi; g.lineWidth = 1; g.beginPath(); g.moveTo(cx, cy - bh * 0.7); g.lineTo(cx, cy + bh * 0.5); g.stroke(); }
  if (st.spikes) { g.fillStyle = st.sh; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(cx + i * 3 - 1.3, cy - bh * 0.5); g.lineTo(cx + i * 3, cy - bh * 0.5 - 4); g.lineTo(cx + i * 3 + 1.3, cy - bh * 0.5); g.fill(); } }
  // wings (whelps) flare symmetrically behind the body
  if (st.wings) {
    const flap = swing * 4;
    g.fillStyle = st.sh;
    for (const sd of [-1, 1]) {
      g.beginPath(); g.moveTo(cx + sd * bw * 0.6, cy - bh * 0.4);
      g.quadraticCurveTo(cx + sd * (bw + 12), cy - bh - 6 - flap, cx + sd * (bw + 15), cy - flap);
      g.quadraticCurveTo(cx + sd * bw, cy - bh * 0.1, cx + sd * bw * 0.6, cy - bh * 0.2); g.fill();
    }
  }
  // tail shows on the way OUT
  if (!front) {
    if (st.tail === 'bush') { oval(g, cx, cy + bh * 0.15, 4.5 * s, 5.5 * s, st.body, OUTLINE); oval(g, cx, cy + bh * 0.35, 3 * s, 3.4 * s, st.hi); }
    else if (st.tail === 'long') { g.strokeStyle = OUTLINE; g.lineWidth = 3.6 * s; g.beginPath(); g.moveTo(cx, cy); g.quadraticCurveTo(cx + swing * 2, cy + bh * 0.8, cx - swing * 2, cy + bh + 4); g.stroke(); g.strokeStyle = st.sh; g.lineWidth = 2 * s; g.stroke(); }
    else if (st.tail === 'puff') oval(g, cx, cy + bh * 0.3, 2.8 * s, 2.8 * s, '#f4efe4', OUTLINE);
    else if (st.tail === 'thin' || st.tail === 'curl') { g.strokeStyle = st.sh; g.lineWidth = 1.6; g.beginPath(); g.moveTo(cx, cy + bh * 0.1); g.quadraticCurveTo(cx + 2, cy + bh * 0.7, cx - 1 + swing, cy + bh + 3); g.stroke(); }
  }
  // head above the body (a touch lower when the carriage is low)
  const hr = (st.headR ?? 5.5) * s;
  const hy = cy - bh - hr * (st.headLow ? 0.35 : 0.6) + (st.longneck || st.horsemane ? -4 * s : 0);
  if (st.longneck || st.horsemane) { g.strokeStyle = OUTLINE; g.lineWidth = 5.5 * s; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx, cy - bh * 0.4); g.lineTo(cx, hy + hr * 0.4); g.stroke(); g.strokeStyle = st.body; g.lineWidth = 4.2 * s; g.stroke(); }
  oval(g, cx, hy, hr * 0.95, hr, st.body, OUTLINE);
  if (front) oval(g, cx, hy - hr * 0.3, hr * 0.55, hr * 0.45, st.hi);
  // ears ride both sides
  if (st.ears === 'tall') for (const sd of [-1, 1]) { oval(g, cx + sd * hr * 0.55, hy - hr - 2.5, 1.7 * s, 4.4 * s, st.body, OUTLINE); if (front) oval(g, cx + sd * hr * 0.55, hy - hr - 2.5, 0.8 * s, 2.8 * s, '#e8b0b0'); }
  else if (st.ears === 'point') for (const sd of [-1, 1]) { g.fillStyle = OUTLINE; g.beginPath(); g.moveTo(cx + sd * hr * 0.8 - 2, hy - hr + 2); g.lineTo(cx + sd * hr * 0.8, hy - hr - 4); g.lineTo(cx + sd * hr * 0.8 + 2, hy - hr + 2); g.fill(); g.fillStyle = st.sh; g.beginPath(); g.moveTo(cx + sd * hr * 0.8 - 1, hy - hr + 1.4); g.lineTo(cx + sd * hr * 0.8, hy - hr - 2.4); g.lineTo(cx + sd * hr * 0.8 + 1, hy - hr + 1.4); g.fill(); }
  else if (st.ears === 'round') for (const sd of [-1, 1]) oval(g, cx + sd * hr * 0.75, hy - hr * 0.95, 2 * s, 2 * s, st.body, OUTLINE);
  else if (st.ears === 'flop') for (const sd of [-1, 1]) { g.fillStyle = st.sh; g.beginPath(); g.ellipse(cx + sd * hr * 0.85, hy - hr * 0.2, 1.7 * s, 3.2 * s, sd * 0.4, 0, 7); g.fill(); g.strokeStyle = OUTLINE; g.lineWidth = 0.8; g.stroke(); }
  if (st.horns === 'curl') for (const sd of [-1, 1]) { g.strokeStyle = '#e8dcc0'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(cx + sd * hr * 0.5, hy - hr + 1); g.quadraticCurveTo(cx + sd * (hr + 4), hy - hr - 4, cx + sd * (hr + 2), hy - hr - 7); g.stroke(); }
  if (st.antlers) { g.strokeStyle = '#b98a3c'; g.lineWidth = 2; for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(cx + sd * hr * 0.5, hy - hr); g.lineTo(cx + sd * (hr * 0.5 + 3), hy - hr - 7); g.moveTo(cx + sd * (hr * 0.5 + 1.5), hy - hr - 4); g.lineTo(cx + sd * (hr * 0.5 + 5), hy - hr - 5); g.stroke(); } }
  if (st.mane || st.horsemane) { g.fillStyle = st.sh; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(cx + i * 2.6, hy - hr + (front ? 0 : 1)); g.lineTo(cx + i * 2.6 + 1.3, hy - hr - 4); g.lineTo(cx + i * 2.6 + 2.6, hy - hr + (front ? 0 : 1)); g.fill(); } }
  if (front) {
    // the face: both eyes, a centred snout, and species trimmings
    if (st.stripes) for (const sd of [-1, 1]) px(g, cx + sd * hr * 0.45 - 0.8, hy - hr * 0.8, 1.6, hr * 1.4, '#e8e8ec');
    if (pose.hurt > 0.3) { eyeX(g, cx - hr * 0.45, hy - hr * 0.15); eyeX(g, cx + hr * 0.45, hy - hr * 0.15); }
    else { eye(g, cx - hr * 0.45, hy - hr * 0.15, st.sleek ? 1.7 : 1.5); eye(g, cx + hr * 0.45, hy - hr * 0.15, st.sleek ? 1.7 : 1.5); }
    if (st.snout === 'boar' || st.snout === 'long') { oval(g, cx, hy + hr * 0.45, 2.6 * s, 1.9 * s, st.hi, OUTLINE); px(g, cx - 1.4, hy + hr * 0.45, 1, 1.4, '#1c1418'); px(g, cx + 0.6, hy + hr * 0.45, 1, 1.4, '#1c1418'); }
    else if (st.snout === 'point') { g.fillStyle = st.sh; g.beginPath(); g.moveTo(cx - 1.6, hy + hr * 0.2); g.lineTo(cx, hy + hr * 0.75); g.lineTo(cx + 1.6, hy + hr * 0.2); g.fill(); px(g, cx - 0.7, hy + hr * 0.62, 1.4, 1.4, '#d99'); }
    else oval(g, cx, hy + hr * 0.5, 1.8 * s, 1.3 * s, st.hi);
    if (st.tusks) { px(g, cx - hr * 0.5, hy + hr * 0.45, 1.4, 3, '#f4ecd8'); px(g, cx + hr * 0.5 - 1.4, hy + hr * 0.45, 1.4, 3, '#f4ecd8'); }
    if (st.beard) px(g, cx - 1, hy + hr * 0.8, 2, 4, '#e8e0d0');
    if (pose.atk > 0.35) maw(g, cx, hy + hr * 0.75, 2 * s, pose.atk);
  } else {
    // walking away: just the back of the skull and a neck-ridge shade
    g.strokeStyle = st.sh; g.lineWidth = 1.2; g.globalAlpha = 0.6;
    g.beginPath(); g.moveTo(cx, hy - hr * 0.6); g.lineTo(cx, hy + hr * 0.5); g.stroke();
    g.globalAlpha = 1;
  }
}

function drawQuad(g, st, s, swing, bob, type, pose = {}) {
  if (pose.dir === 0 || pose.dir === 2) return drawQuadFB(g, st, s, swing, bob, type, pose);
  const cx = 30, cy = 40 - bob;
  // Per-species build: length/height/leg carve a recognisable silhouette rather
  // than one shared oval. Unset falls back to the old generic proportions.
  const bw = (st.len ?? 15) * s, bh = (st.ht ?? 8) * s;
  const legY = cy + bh - 1;
  const legLen = (st.leg ?? 6) * s, legW = Math.max(2, (st.legW ?? 3) * s);
  const hoof = st.hoof || '#241c16';
  const gait = swing * 2.4 * s;
  // ground contact shadow
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.beginPath(); g.ellipse(cx, legY + legLen + 1, bw * 0.92, 2.4 * s, 0, 0, 7); g.fill();
  // one leg: outline, shaft, then a darker paw/hoof; strides with the gait phase
  const drawLeg = (lx, off, shade) => {
    const lift = Math.max(0, off) * 0.5, ly = legY - lift, ll = legLen - lift;
    px(g, lx + off - legW / 2 - 1, ly, legW + 2, ll + 1, OUTLINE);
    px(g, lx + off - legW / 2, ly, legW, ll, shade);
    const hh = Math.max(2, ll * 0.3);
    px(g, lx + off - legW / 2, ly + ll - hh, legW, hh, hoof);
  };
  // far legs sit behind the body and read a shade darker for depth
  drawLeg(cx - bw * 0.46, gait, st.sh);
  drawLeg(cx + bw * 0.5, gait, st.sh);
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
  // body: rear haunch + barrel + front chest give real shoulders and a rump
  blobs(g, [
    [cx - bw * 0.42, cy - bh * 0.04, bw * 0.6, bh * 1.02],   // haunch
    [cx, cy, bw * 0.86, bh],                                 // barrel
    [cx + bw * 0.44, cy + bh * 0.02, bw * 0.58, bh * 0.94],  // chest
  ], st.body, OUTLINE);
  // form shading + coat texture, clipped to the barrel so it never spills
  g.save();
  g.beginPath(); g.ellipse(cx, cy, bw * 0.9, bh * 1.02, 0, 0, 7); g.clip();
  oval(g, cx, cy + bh * 0.6, bw * 0.85, bh * 0.55, st.sh);                 // belly in shadow
  g.globalAlpha = 0.85; oval(g, cx - bw * 0.06, cy - bh * 0.5, bw * 0.72, bh * 0.44, st.hi); g.globalAlpha = 1; // sunlit back
  g.strokeStyle = st.sh; g.globalAlpha = 0.32; g.lineWidth = 1; g.lineCap = 'round';
  for (let i = 0; i < 22; i++) {                                          // deterministic coat flecks
    const a = i * 2.3999, rr = ((i * 37) % 100) / 100;
    const fx = cx + Math.cos(a) * bw * 0.72 * (0.35 + rr * 0.6), fy = cy + Math.sin(a) * bh * 0.78 * (0.35 + rr * 0.6);
    g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx - 2.4, fy - 0.6); g.stroke();
  }
  g.globalAlpha = 1; g.restore();
  // crisp rim light along the top-back edge
  g.strokeStyle = st.hi; g.globalAlpha = 0.6; g.lineWidth = 1.2;
  g.beginPath(); g.ellipse(cx, cy, bw * 0.86, bh * 0.98, 0, Math.PI * 1.05, Math.PI * 1.92); g.stroke(); g.globalAlpha = 1;
  // near legs sit in front of the body, striding opposite the far pair
  drawLeg(cx - bw * 0.6, -gait, st.sh);
  drawLeg(cx + bw * 0.62, -gait, st.sh);
  if (st.hump) { oval(g, cx - bw * 0.25, cy - bh * 0.66, bw * 0.62, bh * 0.66, st.body, OUTLINE); oval(g, cx - bw * 0.3, cy - bh * 0.8, bw * 0.4, bh * 0.35, st.hi); }
  if (st.spikes) { g.fillStyle = st.sh; for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(cx + i * 2.6, cy - bh + 1); g.lineTo(cx + i * 2.6 + 1, cy - bh - 5); g.lineTo(cx + i * 2.6 + 2.6, cy - bh + 1); g.fill(); } }
  if (st.shell) { oval(g, cx - bw * 0.1, cy - bh * 0.55, bw * 0.78, bh * 0.85, st.sh, OUTLINE); g.strokeStyle = st.hi; g.lineWidth = 1; g.beginPath(); g.moveTo(cx - bw * 0.5, cy - bh * 0.5); g.lineTo(cx + bw * 0.4, cy - bh * 0.5); g.moveTo(cx - bw * 0.3, cy - bh * 0.95); g.lineTo(cx - bw * 0.3, cy - bh * 0.1); g.moveTo(cx + bw * 0.15, cy - bh * 0.95); g.lineTo(cx + bw * 0.15, cy - bh * 0.1); g.stroke(); }
  if (st.stripes) { g.fillStyle = st.hi; oval(g, cx, cy - bh * 0.5, bw * 0.7, bh * 0.22, st.hi); }
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
  const hr = (st.headR ?? 5.5) * s;
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
  if (pose.hurt > 0.3) eyeX(g, hx + hr * 0.4, hy - 0.5);
  else { eye(g, hx + hr * 0.4, hy - 0.5, st.sleek ? 1.8 : 1.6); if (st.sleek) { g.strokeStyle = '#4c9a4c'; g.lineWidth = 1; g.beginPath(); g.moveTo(hx + hr * 0.4 - 2, hy - 1); g.lineTo(hx + hr * 0.4 + 2, hy - 1); g.stroke(); } }
  if (pose.atk > 0.35) maw(g, hx + hr + 1.5, hy + hr * 0.6, 2.2 * s, pose.atk);   // bared jaws on the lunge
  // features
  if (st.tusks) { px(g, hx + hr + 1, hy + 3, 1.5, 3, '#f4ecd8'); px(g, hx + hr + 3, hy + 3, 1.5, 3, '#f4ecd8'); }
  if (st.beard) px(g, hx - 1, hy + hr - 1, 2, 4, '#e8e0d0');
  if (st.horns === 'curl') { for (const dx of [-1, 4]) { g.strokeStyle = '#e8dcc0'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(hx + dx, hy - hr + 1); g.quadraticCurveTo(hx + dx - 4, hy - hr - 5, hx + dx + 2, hy - hr - 7); g.stroke(); } }
  if (st.antlers) { g.strokeStyle = '#b98a3c'; g.lineWidth = 2; g.shadowColor = '#ffe08a'; g.shadowBlur = 6; for (const dx of [-2, 4]) { g.beginPath(); g.moveTo(hx + dx, hy - hr); g.lineTo(hx + dx - 2, hy - hr - 7); g.moveTo(hx + dx - 2, hy - hr - 4); g.lineTo(hx + dx - 5, hy - hr - 5); g.moveTo(hx + dx - 1, hy - hr - 6); g.lineTo(hx + dx + 2, hy - hr - 9); g.stroke(); } g.shadowBlur = 0; }
}

function drawBird(g, st, s, swing, pose = {}) {
  const cx = 32, cy = 36;
  const flap = swing * 6;
  if (pose.dir === 0 || pose.dir === 2) {
    const front = pose.dir === 2;
    // symmetric wings beating either side of a foreshortened body
    for (const sd of [-1, 1]) {
      g.fillStyle = sd < 0 ? st.sh : st.body;
      g.beginPath(); g.moveTo(cx + sd * 3, cy - 2);
      g.quadraticCurveTo(cx + sd * 16, cy - 8 - flap, cx + sd * 21, cy + 2 - flap);
      g.quadraticCurveTo(cx + sd * 11, cy + 3, cx + sd * 3, cy + 2); g.closePath(); g.fill();
      g.strokeStyle = OUTLINE; g.lineWidth = 1; g.stroke();
    }
    oval(g, cx, cy + 1, 5.5 * s, 8 * s, st.body, OUTLINE);
    oval(g, cx, cy + 4, 3.6 * s, 4 * s, front ? st.hi : st.sh);
    oval(g, cx, cy - 8 * s, 4 * s, 4 * s, st.body, OUTLINE);
    if (front) {
      eye(g, cx - 2, cy - 8 * s - 1, 1.3); eye(g, cx + 2, cy - 8 * s - 1, 1.3);
      g.fillStyle = '#e0a83c'; g.beginPath(); g.moveTo(cx - 1.6, cy - 7 * s); g.lineTo(cx, cy - 5 * s); g.lineTo(cx + 1.6, cy - 7 * s); g.fill();
    } else {
      g.fillStyle = st.sh; g.beginPath(); g.moveTo(cx - 3, cy + 8); g.lineTo(cx, cy + 15); g.lineTo(cx + 3, cy + 8); g.fill();
      g.strokeStyle = OUTLINE; g.lineWidth = 0.8; g.stroke();
    }
    return;
  }
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

function drawSnake(g, st, s, frame, pose = {}) {
  if (pose.dir === 0 || pose.dir === 2) {
    const front = pose.dir === 2;
    // slither along the depth axis: a vertical serpentine, head nearest (front)
    // or farthest (back)
    const path = (lw, col, off = 0) => {
      g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round'; g.beginPath();
      for (let i = 0; i <= 8; i++) {
        const y = 22 + i * 4.2, x = 32 + Math.sin(i * 0.9 + frame * 0.5) * 4 * s + off;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
    };
    path(9 * s, OUTLINE); path(6.5 * s, st.body); path(2 * s, st.hi, -1);
    const hy = front ? 22 + 8 * 4.2 : 22;
    const hx = 32 + Math.sin((front ? 8 : 0) * 0.9 + frame * 0.5) * 4 * s;
    oval(g, hx, hy + (front ? 2 : -2), 4.2 * s, 3.4 * s, st.body, OUTLINE);
    if (front) {
      eye(g, hx - 1.8, hy + 1, 1.2); eye(g, hx + 1.8, hy + 1, 1.2);
      g.strokeStyle = '#d33'; g.lineWidth = 1; g.beginPath(); g.moveTo(hx, hy + 5); g.lineTo(hx - 1.4, hy + 8); g.moveTo(hx, hy + 5); g.lineTo(hx + 1.4, hy + 8); g.stroke();
    }
    return;
  }
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

function drawWorm(g, st, s, frame, pose = {}) {
  if (pose.dir === 0 || pose.dir === 2) {
    const front = pose.dir === 2;
    // segments stacked along the depth axis; the head segment faces the camera
    for (let i = 0; i <= 6; i++) {
      const k = front ? i : 6 - i;                           // draw far-to-near
      const y = front ? 26 + k * 4 : 50 - k * 4;
      const x = 32 + Math.sin(k * 0.8 + frame * 0.6) * 2.4 * s;
      const r = (k === 6 ? 6 : 3.6 + k * 0.35) * s;
      oval(g, x, y, r, r * 0.85, k === 6 ? st.hi : st.body, OUTLINE);
      if (k === 6 && front) {
        eye(g, x - 2, y - 1.5, 1.2); eye(g, x + 2, y - 1.5, 1.2);
        oval(g, x, y + 2, 2, 2.2, '#7a1f1f');                // sucker mouth
      }
    }
    return;
  }
  for (let i = 6; i >= 0; i--) {
    const x = 18 + i * 4, y = 42 - Math.sin(i * 0.8 + frame * 0.6) * 3 * s;
    const r = (i === 6 ? 6 : 5 - i * 0.2) * s;
    oval(g, x, y, r, r * 0.9, i === 6 ? st.hi : st.body, OUTLINE);
  }
  eye(g, 18 + 6 * 4 + 2, 42 - Math.sin(6 * 0.8 + frame * 0.6) * 3 * s - 1, 1.3);
  // sucker mouth
  oval(g, 18 + 6 * 4 + 4, 42, 2, 2.4, '#7a1f1f');
}

function drawTreant(g, st, s, swing, pose = {}) {
  const cx = 32;
  const away = pose.dir === 0;   // seen from behind: bark, no face
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
  // face on the near side only; from behind it's just weathered bark
  if (!away) {
    eye(g, cx - 3, 40, 1.8); eye(g, cx + 3, 40, 1.8);
    g.fillStyle = '#e6c890'; px(g, cx - 3, 40 - 2, 1, 1, '#e6c890'); px(g, cx + 3, 40 - 2, 1, 1, '#e6c890');
    g.strokeStyle = '#2a1e12'; g.lineWidth = 1.4; g.beginPath(); g.arc(cx, 44, 3, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  } else {
    g.strokeStyle = st.barkHi; g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx - 3, 34); g.lineTo(cx - 4, 47); g.moveTo(cx + 3, 33); g.lineTo(cx + 4, 46); g.stroke();
  }
}

function drawBrute(g, st, s, swing, bob, pose = {}) {
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
  const away = pose.dir === 0;   // seen from behind: hulking shoulders, no face
  if (!away) {
    oval(g, cx - 2, top + 3, 3.5 * s, 3 * s, st.hi);
    if (pose.hurt > 0.3) { eyeX(g, cx - 3, top + 6); eyeX(g, cx + 3, top + 6); }
    else { eye(g, cx - 3, top + 6, 1.6); eye(g, cx + 3, top + 6, 1.6); }
    // brow + mouth (a roaring maw on the attack lunge)
    g.strokeStyle = st.sh; g.lineWidth = 2; g.beginPath(); g.moveTo(cx - 6, top + 3); g.lineTo(cx + 6, top + 3); g.stroke();
    if (pose.atk > 0.35) { g.fillStyle = '#2a0e10'; oval(g, cx, top + 10, 3, 1.4 + pose.atk * 2, '#2a0e10'); }
    else { g.strokeStyle = '#2a1a1a'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(cx - 4, top + 10); g.lineTo(cx + 4, top + 10); g.stroke(); }
    // tusks
    px(g, cx - 3, top + 9, 1.5, 3, '#f4ecd8'); px(g, cx + 2, top + 9, 1.5, 3, '#f4ecd8');
  } else {
    // back of the skull + a spine ridge down the torso
    oval(g, cx, top + 4, 4 * s, 2.6 * s, st.sh);
    g.strokeStyle = st.sh; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(cx, top + 12); g.lineTo(cx, 44); g.stroke();
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(cx - 3, top + 16 + i * 7); g.lineTo(cx + 3, top + 16 + i * 7); g.stroke(); }
  }
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

function drawSpider(g, st, s, swing, pose = {}) {
  const cx = 32, cy = 40;
  if (pose.dir === 0 || pose.dir === 2) {
    const front = pose.dir === 2;
    // scuttling along the depth axis: symmetric legs, head near (front) or far
    g.strokeStyle = OUTLINE; g.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const ph = ((i % 2) ? swing : -swing) * 3;
      const ly = cy - 5 + i * 3;
      g.beginPath(); g.moveTo(cx - 3, ly); g.lineTo(cx - 12, ly - 4 + ph); g.stroke();
      g.beginPath(); g.moveTo(cx + 3, ly); g.lineTo(cx + 12, ly - 4 - ph); g.stroke();
    }
    oval(g, cx, cy - (front ? 2 : -1), 7.5 * s, 6.5 * s, st.body, OUTLINE);   // abdomen
    oval(g, cx - 2, cy - (front ? 4 : 1), 3.6 * s, 2.8 * s, st.hi);
    const hy = front ? cy + 5.5 * s : cy - 6.5 * s;
    oval(g, cx, hy, 4 * s, 3.4 * s, st.body, OUTLINE);                        // head
    if (front) {
      eye(g, cx - 1.6, hy - 1, 1.1); eye(g, cx + 1.6, hy - 1, 1.1);
      px(g, cx - 2.4, hy + 1, 1, 1, '#a33'); px(g, cx + 1.4, hy + 1, 1, 1, '#a33');
      g.strokeStyle = OUTLINE; g.lineWidth = 1.2;                             // fangs
      g.beginPath(); g.moveTo(cx - 1.4, hy + 2.4); g.lineTo(cx - 1, hy + 4.4); g.moveTo(cx + 1.4, hy + 2.4); g.lineTo(cx + 1, hy + 4.4); g.stroke();
    }
    return;
  }
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
// ---- HD trees: one hand-drawn model per wood type -------------------------------
// leaf palette: [outline, dark, mid, lite]; trunk palette: [dark, mid, lite]
const TREE_STYLE = {
  tree:           { trunk: ['#5c4c32', '#7d6a4a', '#9a8a66'], leaf: ['#2c4a1e', '#4f7f31', '#6fa348', '#95c86a'] },
  oak_tree:       { trunk: ['#3f2d1a', '#5c4326', '#7a5c38'], leaf: ['#1e3812', '#33581f', '#4f7f31', '#74a548'] },
  willow_tree:    { trunk: ['#4a3c26', '#6b5a3c', '#8a7852'], leaf: ['#3c5c30', '#5c8050', '#7ea468', '#a8cc8a'] },
  maple_tree:     { trunk: ['#3f2d1a', '#5c4326', '#7a5c38'], leaf: ['#5c2410', '#9c4a24', '#c9702e', '#e8a84c'] },
  yew_tree:       { trunk: ['#32271a', '#4a3826', '#665032'], leaf: ['#101f0b', '#1f3618', '#32512a', '#4a7040'] },
  elm_tree:       { trunk: ['#42341f', '#5f4c30', '#7d6844'], leaf: ['#26421a', '#3f6028', '#5c8438', '#82ac52'] },
  frostpine_tree: { trunk: ['#33291c', '#4c3f2e', '#665844'], leaf: ['#2c463f', '#4a6c60', '#74998c', '#cfe0da'] },
};
const ROCK_STYLE = {
  copper_rock:    { rock: ['#4c3a2c', '#7a5c44', '#96755c'], vein: '#c9803c', extra: 'patina' },
  tin_rock:       { rock: ['#3c4046', '#6e747c', '#8b919a'], vein: '#c8ccd4', extra: 'fleck' },
  iron_rock:      { rock: ['#42342a', '#6e523c', '#87654b'], vein: '#b06a3c', extra: 'bands' },
  coal_rock:      { rock: ['#17171c', '#2e2e36', '#45454f'], vein: '#0e0e12', extra: 'gloss' },
  silver_rock:    { rock: ['#4a4e58', '#7d828e', '#a3a9b5'], vein: '#eef2fa', extra: 'glint' },
  mithril_rock:   { rock: ['#3a4258', '#5a6a8e', '#7d90b5'], vein: '#6a8ae8', extra: 'glint' },
  gold_rock:      { rock: ['#5c5648', '#948c74', '#c2bca4'], vein: '#e8c24e', extra: 'glint' },
  sylvanite_rock: { rock: ['#2c3a28', '#4a5c40', '#66805a'], vein: '#7fe07f', extra: 'glow' },
  essence_rock:   { rock: ['#3a3348', '#5c5372', '#7d7394'], vein: '#c09fe8', extra: 'glow' },
};
function sprng(seed) {
  let a = seed >>> 0;
  return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; };
}
// a textured foliage mass: dark ring, body, then dozens of leaf lobes
function leafCluster(g, rnd, cx, cy, r, [outline, dark, mid, lite], squash = 1) {
  const blob = (rr, col) => { g.fillStyle = col; g.beginPath(); g.ellipse(cx, cy, rr, rr * squash, 0, 0, 7); g.fill(); };
  blob(r + 1.5, outline); blob(r, dark);
  g.fillStyle = mid; g.beginPath(); g.ellipse(cx - r * 0.22, cy - r * 0.2, r * 0.8, r * 0.8 * squash, 0, 0, 7); g.fill();
  for (let i = 0; i < r * 1.7; i++) {
    const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * r * 0.88;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * squash;
    const up = y < cy - r * squash * 0.05;
    g.fillStyle = up ? (rnd() > 0.4 ? lite : mid) : (rnd() > 0.72 ? mid : dark);
    g.globalAlpha = 0.45 + rnd() * 0.5;
    g.beginPath(); g.arc(x, y, 1.1 + rnd() * 1.7, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
}
// a tapered trunk with root flare, bark striations and a side shadow
function trunkHD(g, rnd, x, topY, baseY, wTop, wBase, [dark, mid, lite], lean = 0) {
  const tx = x + lean;
  g.fillStyle = dark;
  g.beginPath();
  g.moveTo(tx - wTop / 2, topY);
  g.lineTo(x - wBase / 2 - 1, baseY - 6);
  g.lineTo(x - wBase / 2 - 5, baseY);       // left root flare
  g.lineTo(x + wBase / 2 + 5, baseY);       // right root flare
  g.lineTo(x + wBase / 2 + 1, baseY - 6);
  g.lineTo(tx + wTop / 2, topY);
  g.closePath(); g.fill();
  g.fillStyle = mid;
  g.beginPath();
  g.moveTo(tx - wTop / 2 + 1.2, topY);
  g.lineTo(x - wBase / 2, baseY - 5);
  g.lineTo(x - wBase / 2 - 3, baseY);
  g.lineTo(x + wBase / 2 + 2, baseY);
  g.lineTo(x + wBase / 2 - 0.5, baseY - 6);
  g.lineTo(tx + wTop / 2 - 1, topY);
  g.closePath(); g.fill();
  // highlight strip + bark striations + a knot
  g.strokeStyle = lite; g.lineWidth = 1.6; g.globalAlpha = 0.8;
  g.beginPath(); g.moveTo(tx - wTop * 0.15, topY + 3); g.lineTo(x - wBase * 0.15, baseY - 4); g.stroke();
  g.strokeStyle = dark; g.lineWidth = 1; g.globalAlpha = 0.65;
  for (let i = 0; i < 4; i++) {
    const f = (i + 1) / 5;
    const bx = tx + (x - tx) * 0.5 + (f - 0.5) * wBase * 0.8;
    g.beginPath(); g.moveTo(bx + (rnd() - 0.5) * 2, topY + 6);
    g.quadraticCurveTo(bx + (rnd() - 0.5) * 4, (topY + baseY) / 2, bx + (rnd() - 0.5) * 3, baseY - 6);
    g.stroke();
  }
  g.globalAlpha = 1;
  if (rnd() > 0.5) { g.fillStyle = dark; g.beginPath(); g.ellipse(x + (rnd() - 0.5) * wBase * 0.5, (topY + baseY) / 2 + rnd() * 10, 1.6, 2.4, 0, 0, 7); g.fill(); }
}
// One detailed model per species, drawn on a 96x128 canvas (ground line y=116).
function drawTreeHD(g, type) {
  const spec = TREE_STYLE[type];
  const rnd = sprng([...type].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0);
  const L = spec.leaf, T = spec.trunk;
  g.fillStyle = '#00000032';
  g.beginPath(); g.ellipse(48, 116, 24, 7, 0, 0, 7); g.fill();
  switch (type) {
    case 'tree': // Ash: slender pale trunk, airy open canopy
      trunkHD(g, rnd, 48, 54, 116, 5, 9, T);
      g.strokeStyle = T[1]; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(48, 58); g.lineTo(38, 46); g.moveTo(48, 56); g.lineTo(58, 44); g.stroke();
      leafCluster(g, rnd, 36, 44, 14, L);
      leafCluster(g, rnd, 61, 41, 13, L);
      leafCluster(g, rnd, 48, 27, 16, L);
      break;
    case 'oak_tree': { // Oak: massive gnarled trunk, broad dense crown, acorns
      trunkHD(g, rnd, 48, 60, 116, 10, 16, T);
      g.strokeStyle = T[1]; g.lineWidth = 4;
      g.beginPath(); g.moveTo(48, 64); g.lineTo(32, 50); g.moveTo(48, 62); g.lineTo(64, 48); g.stroke();
      leafCluster(g, rnd, 27, 50, 14, L);
      leafCluster(g, rnd, 69, 48, 14, L);
      leafCluster(g, rnd, 37, 33, 15, L);
      leafCluster(g, rnd, 60, 32, 14, L);
      leafCluster(g, rnd, 48, 43, 17, L);
      g.fillStyle = '#a8823c';
      for (let i = 0; i < 4; i++) g.fillRect(30 + rnd() * 36, 40 + rnd() * 16, 2, 2);
      break;
    }
    case 'willow_tree': { // Willow: leaning trunk, cascading fronds
      trunkHD(g, rnd, 50, 58, 116, 6, 10, T, -7);
      leafCluster(g, rnd, 37, 48, 13, L, 0.85);
      leafCluster(g, rnd, 59, 46, 13, L, 0.85);
      leafCluster(g, rnd, 47, 37, 16, L, 0.85);
      for (let i = 0; i < 10; i++) { // weeping fronds
        const x0 = 26 + i * 5 + (rnd() - 0.5) * 3, y0 = 44 + rnd() * 8;
        const drop = 34 + rnd() * 22, sway = (rnd() - 0.5) * 10;
        g.strokeStyle = i % 2 ? L[2] : L[3]; g.lineWidth = 1.6; g.globalAlpha = 0.85;
        g.beginPath(); g.moveTo(x0, y0);
        g.quadraticCurveTo(x0 + sway, y0 + drop * 0.6, x0 + sway * 0.6, y0 + drop);
        g.stroke();
        g.fillStyle = L[3];
        g.fillRect(x0 + sway * 0.6 - 1, y0 + drop - 1, 2, 2);
      }
      g.globalAlpha = 1;
      break;
    }
    case 'maple_tree': { // Maple: layered autumn crown, drifting leaves
      trunkHD(g, rnd, 48, 62, 116, 6, 11, T);
      leafCluster(g, rnd, 48, 56, 18, L, 0.8);
      leafCluster(g, rnd, 48, 42, 16, L, 0.85);
      leafCluster(g, rnd, 48, 28, 12, L, 0.9);
      g.fillStyle = L[3]; g.globalAlpha = 0.9; // drifting leaves
      g.fillRect(72, 66, 2, 2); g.fillRect(26, 78, 2, 2); g.fillRect(68, 92, 2, 2);
      g.globalAlpha = 1;
      break;
    }
    case 'yew_tree': { // Yew: twin dark trunk, brooding crown, red arils
      trunkHD(g, rnd, 44, 62, 116, 6, 9, T);
      trunkHD(g, rnd, 53, 66, 116, 5, 8, T, 3);
      leafCluster(g, rnd, 33, 52, 15, L, 0.85);
      leafCluster(g, rnd, 63, 50, 15, L, 0.85);
      leafCluster(g, rnd, 48, 38, 18, L, 0.85);
      leafCluster(g, rnd, 48, 55, 14, L, 0.8);
      g.fillStyle = '#d03a3a';
      for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(30 + rnd() * 36, 44 + rnd() * 16, 1.2, 0, 7); g.fill(); }
      break;
    }
    case 'elm_tree': { // Great elm: tall vase of limbs, crown held high
      trunkHD(g, rnd, 48, 66, 116, 7, 12, T);
      g.strokeStyle = T[1]; g.lineWidth = 3.4;
      g.beginPath(); g.moveTo(48, 70); g.quadraticCurveTo(38, 52, 33, 38); g.stroke();
      g.beginPath(); g.moveTo(48, 68); g.quadraticCurveTo(58, 50, 63, 37); g.stroke();
      g.beginPath(); g.moveTo(48, 70); g.lineTo(48, 32); g.stroke();
      leafCluster(g, rnd, 33, 30, 13, L);
      leafCluster(g, rnd, 63, 29, 13, L);
      leafCluster(g, rnd, 48, 18, 14, L);
      leafCluster(g, rnd, 48, 34, 13, L);
      break;
    }
    case 'frostpine_tree': { // Frostpine: snow-capped conifer tiers
      trunkHD(g, rnd, 48, 96, 118, 5, 8, T);
      for (let i = 4; i >= 0; i--) {
        const y0 = 14 + i * 17, w = 11 + i * 5.5, y1 = y0 + 22;
        g.fillStyle = L[0];
        g.beginPath(); g.moveTo(48, y0 - 2); g.lineTo(48 - w - 1.5, y1 + 1.5); g.lineTo(48 + w + 1.5, y1 + 1.5); g.closePath(); g.fill();
        g.fillStyle = L[1];
        g.beginPath(); g.moveTo(48, y0); g.lineTo(48 - w, y1); g.lineTo(48 + w, y1); g.closePath(); g.fill();
        g.fillStyle = L[2];
        g.beginPath(); g.moveTo(48, y0); g.lineTo(48 - w * 0.6, y0 + 15); g.lineTo(48 + w * 0.15, y0 + 15); g.closePath(); g.fill();
        // snow on the tier's shoulders
        g.fillStyle = '#eef4f8';
        g.beginPath(); g.moveTo(48, y0); g.lineTo(48 - w * 0.55, y0 + 12); g.lineTo(48 - w * 0.28, y0 + 12); g.lineTo(48, y0 + 4); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(48, y0); g.lineTo(48 + w * 0.5, y0 + 11); g.lineTo(48 + w * 0.22, y0 + 11); g.lineTo(48, y0 + 4); g.closePath(); g.fill();
        for (let s = 0; s < 4; s++) { g.fillRect(48 - w + rnd() * w * 2, y1 - 3 + rnd() * 2, 2, 1); }
      }
      g.fillStyle = '#eef4f8';   // snow mound at the base
      g.beginPath(); g.ellipse(48, 114, 12, 3.5, 0, 0, 7); g.fill();
      break;
    }
  }
}
// A distinct HD boulder per ore: silhouette, facets, cracks, veins & crystals.
function drawRockHD(g, type, off) {
  const spec = ROCK_STYLE[type];
  const rnd = sprng([...type].reduce((a, c) => a * 37 + c.charCodeAt(0), 11) >>> 0);
  const [dark, mid, lite] = off ? ['#3a3a36', '#55504a', '#615c54'] : spec.rock;
  // irregular boulder silhouette
  const pts = [];
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = 19 + rnd() * 7;
    pts.push([32 + Math.cos(a) * rr * 1.16, 52 + Math.sin(a) * rr * 0.68]);
  }
  g.fillStyle = '#26221c';
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1] + 1.5);
  for (const [x, y] of pts) g.lineTo(x + (x > 32 ? 1.5 : -1.5), y + 1);
  g.closePath(); g.fill();
  g.fillStyle = mid;
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts) g.lineTo(x, y);
  g.closePath(); g.fill();
  g.save();
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts) g.lineTo(x, y);
  g.closePath(); g.clip();
  // lit top-left facet + shaded base
  g.fillStyle = lite;
  g.beginPath(); g.moveTo(12, 46); g.lineTo(30, 34); g.lineTo(46, 40); g.lineTo(30, 52); g.closePath(); g.fill();
  g.fillStyle = dark; g.globalAlpha = 0.7;
  g.beginPath(); g.moveTo(10, 62); g.lineTo(56, 54); g.lineTo(56, 70); g.lineTo(10, 70); g.closePath(); g.fill();
  g.globalAlpha = 1;
  // cracks
  g.strokeStyle = '#00000055'; g.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    let x = 16 + rnd() * 30, y = 40 + rnd() * 20;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 3; s++) { x += (rnd() - 0.4) * 9; y += (rnd() - 0.3) * 6; g.lineTo(x, y); }
    g.stroke();
  }
  if (!off) {
    const glow = spec.extra === 'glow';
    // mineral veins snaking across the face
    g.strokeStyle = spec.vein; g.lineWidth = 1.6;
    if (glow) { g.shadowColor = spec.vein; g.shadowBlur = 5; }
    g.globalAlpha = 0.85;
    for (let i = 0; i < 2; i++) {
      let x = 14 + rnd() * 14, y = 42 + rnd() * 16;
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 3; s++) { x += 7 + rnd() * 7; y += (rnd() - 0.5) * 8; g.lineTo(x, y); }
      g.stroke();
    }
    g.globalAlpha = 1;
    if (spec.extra === 'bands') {           // rust strata
      g.fillStyle = spec.vein; g.globalAlpha = 0.5;
      g.fillRect(12, 44 + rnd() * 4, 40, 2.4); g.fillRect(14, 54 + rnd() * 4, 36, 2);
      g.globalAlpha = 1;
    } else if (spec.extra === 'patina') {   // oxidised green blooms
      g.fillStyle = '#5aa06a'; g.globalAlpha = 0.4;
      for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(16 + rnd() * 32, 40 + rnd() * 22, 2.5 + rnd() * 2.5, 0, 7); g.fill(); }
      g.globalAlpha = 1;
    } else if (spec.extra === 'fleck') {    // silvery flecks
      g.fillStyle = spec.vein;
      for (let i = 0; i < 12; i++) { g.globalAlpha = 0.5 + rnd() * 0.5; g.fillRect(14 + rnd() * 36, 38 + rnd() * 24, 1, 1); }
      g.globalAlpha = 1;
    } else if (spec.extra === 'gloss') {    // anthracite sheen
      g.strokeStyle = '#6a6a78'; g.lineWidth = 2; g.globalAlpha = 0.6;
      g.beginPath(); g.moveTo(20, 38); g.lineTo(34, 48); g.stroke();
      g.globalAlpha = 1;
    }
    // ore crystals / nuggets with glints
    if (glow) { g.shadowColor = spec.vein; g.shadowBlur = 6; } else { g.shadowBlur = 0; }
    for (const [ox, oy, s2] of [[24, 52, 5], [37, 47, 6], [30, 60, 4], [45, 56, 4.5]]) {
      g.fillStyle = spec.vein;
      g.beginPath(); g.moveTo(ox, oy - s2 / 2); g.lineTo(ox + s2 / 2, oy); g.lineTo(ox, oy + s2 / 2); g.lineTo(ox - s2 / 2, oy); g.closePath(); g.fill();
      g.fillStyle = '#ffffffb0'; g.fillRect(ox - 1, oy - s2 / 2 + 1, 1, 1);
    }
    g.shadowBlur = 0;
  }
  g.restore();
  // moss tuft + base pebbles ground the boulder
  if (!off) {
    g.fillStyle = '#4f7f31'; g.globalAlpha = 0.7;
    g.beginPath(); g.ellipse(15, 63, 4, 2, 0, 0, 7); g.fill();
    g.globalAlpha = 1;
  }
  g.fillStyle = '#55504a';
  g.beginPath(); g.ellipse(50, 68, 2.5, 1.4, 0, 0, 7); g.fill();
  g.beginPath(); g.ellipse(13, 68.5, 2, 1.2, 0, 0, 7); g.fill();
}
export function nodeSprite(type, off = false) {
  const key = `nd:${type}:${off ? 1 : 0}`;
  // living trees are tall 96x128 sprites; everything else stays 64x80
  if (TREE_STYLE[type] && !off) return proc(key, 96, 128, (g) => drawTreeHD(g, type));
  return proc(key, 64, 80, (g) => {
    // soft ground shadow under every node
    g.fillStyle = '#00000030';
    g.beginPath(); g.ellipse(32, 68, 15, 5, 0, 0, 7); g.fill();
    if (TREE_STYLE[type]) { // felled: a fresh stump with growth rings
      g.fillStyle = '#5a442c'; g.beginPath(); g.ellipse(32, 64, 8, 5, 0, 0, 7); g.fill();
      px(g, 24, 58, 16, 7, '#6e522f');
      g.fillStyle = '#c9ac7c'; g.beginPath(); g.ellipse(32, 58, 8, 5, 0, 0, 7); g.fill();
      g.strokeStyle = '#9a7c50'; g.lineWidth = 1;
      g.beginPath(); g.ellipse(32, 58, 5, 3, 0, 0, 7); g.stroke();
      g.beginPath(); g.ellipse(32, 58, 2.4, 1.4, 0, 0, 7); g.stroke();
      return;
    }
    if (ROCK_STYLE[type]) { drawRockHD(g, type, off); return; }
    switch (type) {
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
      case 'bakery_stall': case 'fur_stall': case 'silver_stall': case 'gem_stall': case 'cloth_stall': case 'spice_stall': {
        const c = { bakery_stall: '#e0b93c', fur_stall: '#a8703c', silver_stall: '#cfd4dc', gem_stall: '#7fd0e0', cloth_stall: '#8a6ab8', spice_stall: '#c8762a' }[type];
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
      // ---- town furniture -------------------------------------------------------
      case 'well': {
        // round stone kerb, twin posts, a peaked shingle roof and a bucket
        g.fillStyle = '#6e6862'; g.beginPath(); g.ellipse(32, 60, 15, 7, 0, 0, 7); g.fill();
        g.fillStyle = '#8a847c'; g.beginPath(); g.ellipse(32, 57, 14, 6.5, 0, 0, 7); g.fill();
        g.fillStyle = '#2a2620'; g.beginPath(); g.ellipse(32, 56, 9, 4.2, 0, 0, 7); g.fill();   // dark shaft
        g.strokeStyle = '#4a453e'; g.lineWidth = 1;
        for (let a = 0; a < 7; a++) { const an = a / 7 * 6.28; g.beginPath(); g.moveTo(32 + Math.cos(an) * 10, 57 + Math.sin(an) * 4.6); g.lineTo(32 + Math.cos(an) * 14, 57 + Math.sin(an) * 6.4); g.stroke(); }
        px(g, 20, 30, 3, 26, '#6e522f'); px(g, 41, 30, 3, 26, '#6e522f');
        g.fillStyle = '#8a3a2a'; g.beginPath(); g.moveTo(32, 14); g.lineTo(48, 32); g.lineTo(16, 32); g.closePath(); g.fill();
        g.fillStyle = '#a04a34'; g.beginPath(); g.moveTo(32, 16); g.lineTo(44, 31); g.lineTo(20, 31); g.closePath(); g.fill();
        for (let i = 0; i < 4; i++) { g.strokeStyle = '#7a2e20'; g.beginPath(); g.moveTo(20 + i * 3, 31); g.lineTo(24 + i * 3, 22); g.stroke(); }
        px(g, 30, 20, 4, 2, '#5a4327'); // winch axle
        px(g, 29, 42, 6, 6, '#5a4327'); px(g, 30, 43, 4, 4, '#3a2d1a'); // bucket
        g.strokeStyle = '#e8dcc0'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(32, 22); g.lineTo(32, 42); g.stroke();
        break;
      }
      case 'fountain': {
        // two-tier stone basin with a spout and rippling water
        g.fillStyle = '#7a7468'; g.beginPath(); g.ellipse(32, 60, 18, 8, 0, 0, 7); g.fill();
        g.fillStyle = '#9a948a'; g.beginPath(); g.ellipse(32, 58, 16, 7, 0, 0, 7); g.fill();
        g.fillStyle = '#5a8fb0'; g.beginPath(); g.ellipse(32, 57, 13, 5.4, 0, 0, 7); g.fill();
        g.fillStyle = '#8fc4dc'; g.beginPath(); g.ellipse(30, 55.5, 7, 2.6, 0, 0, 7); g.fill();
        g.fillStyle = '#7a7468'; g.beginPath(); g.ellipse(32, 48, 6, 3, 0, 0, 7); g.fill(); px(g, 30, 36, 4, 13, '#8a847c'); // pillar
        g.fillStyle = '#9a948a'; g.beginPath(); g.ellipse(32, 40, 9, 4, 0, 0, 7); g.fill();
        g.fillStyle = '#6aa8c8'; g.beginPath(); g.ellipse(32, 39, 6, 2.4, 0, 0, 7); g.fill();
        g.shadowColor = '#bfe0f0'; g.shadowBlur = 5; g.strokeStyle = '#cfeaf6'; g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(32, 30); g.quadraticCurveTo(26, 40, 24, 50); g.moveTo(32, 30); g.quadraticCurveTo(38, 40, 40, 50); g.stroke();
        px(g, 31, 26, 2, 6, '#cfeaf6'); g.shadowBlur = 0;
        break;
      }
      case 'lamp_post': {
        px(g, 30, 24, 3, 40, '#2e2c2a'); px(g, 26, 62, 11, 3, '#26241f');       // post + base
        g.strokeStyle = '#2e2c2a'; g.lineWidth = 2; g.beginPath(); g.moveTo(31, 26); g.lineTo(38, 22); g.stroke();
        g.shadowColor = '#ffcf6a'; g.shadowBlur = 10;
        g.fillStyle = '#3a3630'; px(g, 27, 18, 10, 12, '#3a3630');               // lantern housing
        g.fillStyle = '#ffdf8a'; px(g, 29, 20, 6, 8, '#ffdf8a');                 // glowing glass
        g.fillStyle = '#fff3c0'; px(g, 30, 21, 3, 5, '#fff3c0');
        g.shadowBlur = 0; g.fillStyle = '#26241f'; px(g, 27, 15, 10, 3, '#26241f'); px(g, 30, 12, 4, 3, '#26241f'); // cap
        break;
      }
      case 'park_bench': {
        for (const lx of [22, 42]) { px(g, lx, 52, 3, 12, '#3a3630'); }          // iron legs
        g.fillStyle = '#7a5a34'; px(g, 18, 50, 28, 4, '#7a5a34'); px(g, 18, 50, 28, 1.4, '#9a734a'); // seat
        for (let i = 0; i < 5; i++) px(g, 20 + i * 5.4, 40, 3, 11, '#7a5a34');   // back slats
        px(g, 18, 39, 28, 2, '#5a4327'); px(g, 18, 39, 28, 0.8, '#9a734a');      // top rail
        g.strokeStyle = '#2a2620'; g.lineWidth = 0.6; g.strokeRect(18, 50, 28, 4);
        break;
      }
      case 'flower_bed': {
        g.fillStyle = '#5a4327'; px(g, 16, 52, 32, 12, '#5a4327'); px(g, 16, 52, 32, 2, '#6e522f'); // planter box
        px(g, 16, 62, 32, 2, '#3e2f1a');
        g.fillStyle = '#3f6028'; px(g, 18, 48, 28, 8, '#3f6028');                // foliage
        const cols = ['#e05a6a', '#ffd75e', '#e08adc', '#7ac8f0', '#ff9b4a'];
        for (let i = 0; i < 10; i++) { const fx = 20 + (i % 5) * 5.4, fy = 46 + ((i / 5) | 0) * 5; g.fillStyle = cols[i % cols.length]; g.beginPath(); g.arc(fx, fy, 1.8, 0, 7); g.fill(); px(g, fx - 0.5, fy - 0.5, 1, 1, '#fff6c0'); }
        break;
      }
      case 'barrel': {
        g.fillStyle = '#6e522f'; px(g, 24, 42, 16, 24, '#6e522f');
        g.fillStyle = '#7d6238'; px(g, 26, 42, 12, 24, '#7d6238');
        g.fillStyle = '#8a6d42'; px(g, 27, 43, 4, 22, '#8a6d42');
        g.fillStyle = '#3a2d1a'; for (const by of [45, 53, 62]) px(g, 24, by, 16, 2, '#3a2d1a');
        g.fillStyle = '#9a7a48'; g.beginPath(); g.ellipse(32, 42, 8, 3, 0, 0, 7); g.fill();
        g.fillStyle = '#5a4327'; g.beginPath(); g.ellipse(32, 42, 5, 1.8, 0, 0, 7); g.fill();
        break;
      }
      case 'crate': {
        g.fillStyle = '#7d6238'; px(g, 23, 44, 18, 20, '#7d6238');
        g.fillStyle = '#6e522f'; px(g, 23, 44, 18, 2, '#8a6d42'); px(g, 23, 62, 18, 2, '#5a4327');
        g.strokeStyle = '#5a4327'; g.lineWidth = 1.4;
        g.strokeRect(23, 44, 18, 20); g.beginPath(); g.moveTo(23, 44); g.lineTo(41, 64); g.moveTo(41, 44); g.lineTo(23, 64); g.stroke();
        break;
      }
      case 'market_cart': {
        g.fillStyle = '#6e522f'; px(g, 16, 46, 32, 12, '#6e522f'); px(g, 16, 46, 32, 2, '#8a6d42'); // bed
        g.fillStyle = '#3a2d1a'; g.beginPath(); g.arc(23, 60, 5, 0, 7); g.fill(); g.beginPath(); g.arc(41, 60, 5, 0, 7); g.fill();
        g.fillStyle = '#5a4327'; g.beginPath(); g.arc(23, 60, 2, 0, 7); g.fill(); g.beginPath(); g.arc(41, 60, 2, 0, 7); g.fill();
        px(g, 18, 26, 3, 20, '#5a4327'); px(g, 43, 26, 3, 20, '#5a4327'); // awning posts
        g.fillStyle = '#a34a3a'; px(g, 14, 24, 36, 6, '#a34a3a');
        for (let i = 0; i < 6; i++) px(g, 15 + i * 6, 24, 3, 6, '#c86a52');
        g.fillStyle = '#e0b93c'; g.beginPath(); g.arc(24, 44, 2.4, 0, 7); g.fill(); // wares
        g.fillStyle = '#c03a3a'; g.beginPath(); g.arc(30, 45, 2.4, 0, 7); g.fill();
        g.fillStyle = '#6fc04a'; g.beginPath(); g.arc(36, 44, 2.4, 0, 7); g.fill();
        g.fillStyle = '#e8a84c'; g.beginPath(); g.arc(42, 45, 2.4, 0, 7); g.fill();
        break;
      }
      case 'signpost': {
        px(g, 30, 30, 3, 34, '#6e522f');
        g.fillStyle = '#7d6238'; px(g, 20, 32, 22, 8, '#7d6238'); px(g, 20, 32, 22, 1.4, '#9a734a');
        g.beginPath(); g.moveTo(42, 32); g.lineTo(47, 36); g.lineTo(42, 40); g.closePath(); g.fill();
        g.strokeStyle = '#4a3a1c'; g.lineWidth = 1; g.strokeRect(20, 32, 22, 8);
        g.strokeStyle = '#e8dcc0'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(23, 36); g.lineTo(38, 36); g.stroke();
        break;
      }
      case 'shop_sign': {
        // a bracketed hanging sign at a shop door: post, iron arm, swinging board
        px(g, 30, 26, 3, 38, '#4a3a24'); px(g, 27, 62, 9, 3, '#3a2d1a');          // post + base
        g.strokeStyle = '#2e2c2a'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(31, 28); g.lineTo(44, 28); g.stroke();             // iron arm
        g.beginPath(); g.moveTo(31, 34); g.lineTo(40, 28); g.stroke();             // brace
        g.strokeStyle = '#57534c'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(36, 28); g.lineTo(36, 32); g.moveTo(43, 28); g.lineTo(43, 32); g.stroke(); // chains
        g.fillStyle = '#6e522f'; px(g, 33, 32, 13, 10, '#6e522f');                 // board
        g.fillStyle = '#7d6238'; px(g, 34, 33, 11, 8, '#7d6238');
        g.strokeStyle = '#e8c86a'; g.lineWidth = 1; g.strokeRect(34.5, 33.5, 10, 7); // gilt border
        g.fillStyle = '#e8c86a'; g.beginPath(); g.arc(39.5, 37, 2, 0, 7); g.fill(); // painted device
        break;
      }
      case 'hay_bale': {
        g.fillStyle = '#c9a83c'; g.beginPath(); g.ellipse(32, 56, 15, 10, 0, 0, 7); g.fill();
        g.fillStyle = '#d8ba52'; g.beginPath(); g.ellipse(30, 53, 12, 8, 0, 0, 7); g.fill();
        g.strokeStyle = '#a8862e'; g.lineWidth = 0.8;
        for (let i = -2; i <= 2; i++) { g.beginPath(); g.ellipse(32, 56, 15 - Math.abs(i) * 2, 10, 0, 0, 7); g.stroke(); }
        g.strokeStyle = '#8a6d1d'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(22, 48); g.lineTo(24, 64); g.moveTo(42, 48); g.lineTo(40, 64); g.stroke();
        break;
      }
      default: { px(g, 26, 50, 12, 12, '#8a8474'); }
    }
  });
}


// Item icons live in their own module; re-exported here for existing importers.
export { itemIcon } from "./icons.js";

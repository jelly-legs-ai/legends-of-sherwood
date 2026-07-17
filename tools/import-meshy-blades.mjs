// Meshy blade import (#131): turn the image-to-3d renders of the 10 wired
// unique swords into full LPC weapon sheets. For every frame of each base
// weapon's sheets (composite fg + per-anim slash/walk fg/bg), the old blade's
// pose is measured (PCA axis + grip/tip ends) and the Meshy blade is drawn in
// its place via a similarity transform, masked to the old silhouette so the
// body occlusion split stays exact, then palette-snapped to the source icon's
// own colours so it reads as crisp pixel art. Each result registers under an
// exact-colour key (u_<name>) that weaponFiles/drawOversize already resolve.
// Usage: node tools/import-meshy-blades.mjs
import fs from 'node:fs';
import path from 'node:path';
import { decode, encode, makeImage } from './png.mjs';

const LPC = path.resolve('client/assets/lpc');
const manifest = JSON.parse(fs.readFileSync(path.join(LPC, 'manifest.json'), 'utf8'));

// icon index -> item id, base weapon type, unique colour key
const BLADES = [
  [1, 'blade_of_the_burrow', 'saber', 'u_burrow'],
  [8, 'hellrender', 'glowsword', 'u_hellrender'],
  [11, 'fanged_ripper', 'scimitar', 'u_ripper'],
  [14, 'gollux_greatblade', 'longsword_alt', 'u_gollux'],
  [20, 'dragonbane_greatsword', 'longsword_alt', 'u_dragonbane'],  // greatsword aliases longsword_alt
  [25, 'glacier_edge', 'glowsword', 'u_glacier'],
  [27, 'rexfang_saber', 'longsword', 'u_rexfang'],
  [29, 'glacial_reaver', 'glowsword', 'u_reaver'],
  [34, 'abyssal_edge', 'glowsword', 'u_abyssal'],
  [39, 'tyrants_cleaver', 'scimitar', 'u_tyrant'],
];

const A = (im, x, y) => (x >= 0 && y >= 0 && x < im.w && y < im.h) ? im.data[(y * im.w + x) * 4 + 3] : 0;
function trim(im) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (A(im, x, y) > 40) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const o = makeImage(x1 - x0 + 1, y1 - y0 + 1);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++)
    for (let k = 0; k < 4; k++) o.data[(y * o.w + x) * 4 + k] = im.data[((y + y0) * im.w + x + x0) * 4 + k];
  return o;
}
// principal axis of opaque pixels: returns { cx, cy, ux, uy, min, max } where
// (ux,uy) is the unit axis and min/max the extents of projections along it
function axisOf(im, alphaAt, requireElongated = true) {
  let n = 0, sx = 0, sy = 0;
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (alphaAt(x, y) > 40) { n++; sx += x; sy += y; }
  if (n < 25) return null;
  const cx = sx / n, cy = sy / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (alphaAt(x, y) > 40) {
    const dx = x - cx, dy = y - cy;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
  }
  const tr = sxx + syy, det = sxx * syy - sxy * sxy;
  const l1 = tr / 2 + Math.sqrt(Math.max(0, tr * tr / 4 - det));
  const l2 = tr - l1;
  if (requireElongated && l2 > 0 && l1 / l2 < 1.6) return null;   // not elongated: not a blade pose
  let ux = sxy, uy = l1 - sxx;
  const len = Math.hypot(ux, uy) || 1;
  ux /= len; uy /= len;
  let min = 1e9, max = -1e9;
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (alphaAt(x, y) > 40) {
    const t = (x - cx) * ux + (y - cy) * uy;
    if (t < min) min = t; if (t > max) max = t;
  }
  return { cx, cy, ux, uy, min, max, n };
}
// average widths near each axis end — the narrower end is the tip
function endWidths(im, ax) {
  const span = ax.max - ax.min;
  let wLo = 0, nLo = 0, wHi = 0, nHi = 0;
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (A(im, x, y) > 40) {
    const t = (x - ax.cx) * ax.ux + (y - ax.cy) * ax.uy;
    const s = Math.abs(-(x - ax.cx) * ax.uy + (y - ax.cy) * ax.ux);
    if (t < ax.min + span * 0.25) { wLo += s; nLo++; }
    if (t > ax.max - span * 0.25) { wHi += s; nHi++; }
  }
  return { lo: nLo ? wLo / nLo : 0, hi: nHi ? wHi / nHi : 0 };
}

// remap one sheet: for each frame cell, measure the old blade (union alpha),
// then draw the Meshy blade over it via similarity transform, masked to the
// layer's own silhouette
function remapSheet(sheetIm, cellW, cellH, unionAt, blade, bladeGrip, bladeTip, palette) {
  const out = makeImage(sheetIm.w, sheetIm.h);
  const cols = sheetIm.w / cellW, rows = sheetIm.h / cellH;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const ox = c * cellW, oy = r * cellH;
    const ax = axisOf({ w: cellW, h: cellH }, (x, y) => unionAt(ox + x, oy + y));
    if (!ax) continue;                                   // empty/round frame: leave blank
    // grip end = axis end nearest the body anchor (frame centre, low)
    const bx = cellW / 2, by = cellH * 0.58;
    const pLo = { x: ax.cx + ax.ux * ax.min, y: ax.cy + ax.uy * ax.min };
    const pHi = { x: ax.cx + ax.ux * ax.max, y: ax.cy + ax.uy * ax.max };
    const dLo = Math.hypot(pLo.x - bx, pLo.y - by), dHi = Math.hypot(pHi.x - bx, pHi.y - by);
    const grip = dLo < dHi ? pLo : pHi, tip = dLo < dHi ? pHi : pLo;
    // similarity transform mapping bladeGrip->grip, bladeTip->tip
    const sdx = bladeTip.x - bladeGrip.x, sdy = bladeTip.y - bladeGrip.y;
    const ddx = tip.x - grip.x, ddy = tip.y - grip.y;
    const sLen = Math.hypot(sdx, sdy) || 1, dLen = Math.hypot(ddx, ddy) || 1;
    const scale = dLen / sLen;
    const cosT = (sdx * ddx + sdy * ddy) / (sLen * dLen);
    const sinT = (sdx * ddy - sdy * ddx) / (sLen * dLen);
    // inverse-sample: for each dest px inside the old silhouette, pull from blade
    for (let y = 0; y < cellH; y++) for (let x = 0; x < cellW; x++) {
      const layerA = sheetIm.data[((oy + y) * sheetIm.w + ox + x) * 4 + 3];
      if (layerA <= 40) continue;                        // stay inside the old silhouette
      const rx = x - grip.x, ry = y - grip.y;
      const sx2 = (rx * cosT + ry * sinT) / scale + bladeGrip.x;
      const sy2 = (-rx * sinT + ry * cosT) / scale + bladeGrip.y;
      const ix = Math.round(sx2), iy = Math.round(sy2);
      if (ix < 0 || iy < 0 || ix >= blade.w || iy >= blade.h) continue;
      const so = (iy * blade.w + ix) * 4;
      if (blade.data[so + 3] <= 40) continue;
      // palette-snap to the icon's own colours
      let best = 0, bd = 1e9;
      for (let p = 0; p < palette.length; p += 3) {
        const d = (blade.data[so] - palette[p]) ** 2 + (blade.data[so + 1] - palette[p + 1]) ** 2 + (blade.data[so + 2] - palette[p + 2]) ** 2;
        if (d < bd) { bd = d; best = p; }
      }
      const dof = ((oy + y) * out.w + ox + x) * 4;
      out.data[dof] = palette[best]; out.data[dof + 1] = palette[best + 1]; out.data[dof + 2] = palette[best + 2];
      out.data[dof + 3] = 255;
    }
  }
  return out;
}

const neutralOf = (dict) => dict && (dict.steel || dict.iron || Object.values(dict).find(Boolean));

for (const [icon, itemId, baseType, key] of BLADES) {
  const blade = trim(decode(fs.readFileSync(`model assets/meshy/renders/blade_${icon}.png`)));
  const bAx = axisOf(blade, (x, y) => A(blade, x, y), false);
  const bw = endWidths(blade, bAx);
  const pLo = { x: bAx.cx + bAx.ux * bAx.min, y: bAx.cy + bAx.uy * bAx.min };
  const pHi = { x: bAx.cx + bAx.ux * bAx.max, y: bAx.cy + bAx.uy * bAx.max };
  const bladeTip = bw.lo < bw.hi ? pLo : pHi;            // narrower end is the tip
  const bladeGrip = bw.lo < bw.hi ? pHi : pLo;
  // icon palette (distinct colours from the 32px source)
  const ic = decode(fs.readFileSync(`client/assets/icons/swords/Icon28_${String(icon).padStart(2, '0')}.png`));
  const seen = new Set(); const palette = [];
  for (let p = 0; p < ic.data.length; p += 4) {
    if (ic.data[p + 3] < 200) continue;
    const k2 = ic.data[p] + ',' + ic.data[p + 1] + ',' + ic.data[p + 2];
    if (!seen.has(k2)) { seen.add(k2); palette.push(ic.data[p], ic.data[p + 1], ic.data[p + 2]); }
  }
  const w = manifest.weapons[baseType];
  const emit = (srcFile, tag, unionFiles) => {
    const sheet = decode(fs.readFileSync(path.join(LPC, srcFile)));
    const cellH = sheet.h % 64 === 0 && sheet.w === 832 ? 64 : sheet.h / 4;
    const cellW = cellH;
    // union alpha across fg+bg of the same anim keeps the pose measurement whole
    const unions = unionFiles.map(f => decode(fs.readFileSync(path.join(LPC, f))));
    const unionAt = (x, y) => Math.max(...unions.map(u => A(u, x, y)));
    const outIm = remapSheet(sheet, cellW, cellH, unionAt, blade, bladeGrip, bladeTip, palette);
    const outFile = `uweap_${key}_${tag}.png`;
    fs.writeFileSync(path.join(LPC, outFile), encode(outIm.w, outIm.h, outIm.data));
    return outFile;
  };
  // composite fg (universal layout), if the base has one
  const fgN = neutralOf(w.fg);
  if (fgN) { w.fg[key] = emit(fgN, 'fg', [fgN]); }
  // per-anim sheets (slash, walk, …): remap fg and bg with a shared union
  for (const [anim, parts] of Object.entries(w.perAnim || {})) {
    const files = ['fg', 'bg'].map(p => neutralOf(parts[p])).filter(Boolean);
    for (const part of ['fg', 'bg']) {
      const n = neutralOf(parts[part]);
      if (n) parts[part][key] = emit(n, `${anim}_${part}`, files);
    }
  }
  console.log(itemId.padEnd(24), '->', key);
}

fs.writeFileSync(path.join(LPC, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log('manifest updated');

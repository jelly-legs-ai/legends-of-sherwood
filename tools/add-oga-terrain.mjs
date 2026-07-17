// Terrain-pack import (#123): TMW mountain massifs as landmark billboards,
// LPC animated waterfall frames + open-water sparkle overlays, and the
// 4-season grass palette sampled for the seasonal ground tint.
//   - mountains-v6-tmw(.snow).png: the sheet's assembled example mounds are cut
//     into massif billboards; interior transparent holes (where the example was
//     hollowed) are inpainted from their row neighbours so each cut is solid.
//   - wateranimate2/3.png: 4-frame waterfall columns sliced into 64px 'mid'
//     body strips + 'base' plunge strips for the cliff-spill overlay; the flat
//     animated-water blocks are thresholded to bright ripple pixels and squashed
//     into diamond sparkle overlays for open water.
//   - 4-season Grass PNGs: mean colour per season printed (drives the client's
//     seasonal tint constants).
// Usage: node tools/add-oga-terrain.mjs <scratchpad/oga dir>
import fs from 'node:fs';
import path from 'node:path';
import { decode, encode, makeImage, blit } from './png.mjs';

const O = process.argv[2];
const ENV = path.resolve('client/assets/env');
const MEDIA = path.resolve('client/assets/media.json');
const media = JSON.parse(fs.readFileSync(MEDIA, 'utf8'));

const A = (im, x, y) => im.data[(y * im.w + x) * 4 + 3];
const px = (im, x, y) => im.data.subarray((y * im.w + x) * 4, (y * im.w + x) * 4 + 4);
function crop(im, x, y, w, h) { const o = makeImage(w, h); blit(o, 0, 0, im, x, y, w, h); return o; }
function trim(im) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (A(im, x, y) > 20) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (x1 < 0) return im;
  const o = makeImage(x1 - x0 + 1, y1 - y0 + 1);
  blit(o, 0, 0, im, x0, y0, o.w, o.h);
  return o;
}
// fill interior transparent holes row-wise from the nearest opaque neighbours
function inpaint(im) {
  for (let y = 0; y < im.h; y++) {
    let x = 0;
    while (x < im.w) {
      if (A(im, x, y) > 20) { x++; continue; }
      const start = x;
      while (x < im.w && A(im, x, y) <= 20) x++;
      if (start === 0 || x >= im.w) continue;          // touches the silhouette edge: keep transparent
      const L = px(im, start - 1, y), R = px(im, x, y);
      for (let i = start; i < x; i++) {
        const t = (i - start + 1) / (x - start + 1);
        const d = im.data, o = (y * im.w + i) * 4;
        const jig = ((i * 7 + y * 13) % 5) - 2;        // slight dither so fills aren't banded
        d[o] = Math.max(0, Math.min(255, L[0] + (R[0] - L[0]) * t + jig));
        d[o + 1] = Math.max(0, Math.min(255, L[1] + (R[1] - L[1]) * t + jig));
        d[o + 2] = Math.max(0, Math.min(255, L[2] + (R[2] - L[2]) * t + jig));
        d[o + 3] = 255;
      }
    }
  }
  return im;
}
// fill ENCLOSED transparent holes with a tiled plateau texture patch (the
// assembled example mounds were hollowed out; row-smearing looks bad on the
// pale rock, so the fill re-lays the plateau gravel instead)
function fillWithTexture(im, patch) {
  // a pixel is "interior" if opaque content exists on all four sides
  const W = im.w, H = im.h;
  const leftOp = new Uint8Array(W * H), rightOp = new Uint8Array(W * H);
  const upOp = new Uint8Array(W * H), downOp = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    let seen = 0;
    for (let x = 0; x < W; x++) { if (A(im, x, y) > 20) seen = 1; leftOp[y * W + x] = seen; }
    seen = 0;
    for (let x = W - 1; x >= 0; x--) { if (A(im, x, y) > 20) seen = 1; rightOp[y * W + x] = seen; }
  }
  for (let x = 0; x < W; x++) {
    let seen = 0;
    for (let y = 0; y < H; y++) { if (A(im, x, y) > 20) seen = 1; upOp[y * W + x] = seen; }
    seen = 0;
    for (let y = H - 1; y >= 0; y--) { if (A(im, x, y) > 20) seen = 1; downOp[y * W + x] = seen; }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (A(im, x, y) > 20 || !leftOp[i] || !rightOp[i] || !upOp[i] || !downOp[i]) continue;
    const p = px(patch, x % patch.w, y % patch.h);
    const d = im.data, o = i * 4;
    d[o] = p[0]; d[o + 1] = p[1]; d[o + 2] = p[2]; d[o + 3] = 255;
  }
  return im;
}
// soften a straight cut line: fade alpha over the top n rows
function featherTop(im, n = 12) {
  for (let y = 0; y < n; y++) {
    const f = y / n;
    for (let x = 0; x < im.w; x++) im.data[(y * im.w + x) * 4 + 3] *= f;
  }
  return im;
}
function save(name, im, group = 'trees') {
  const t = trim(im);
  const file = `env/${name}.png`;
  fs.writeFileSync(path.join(ENV, `${name}.png`), encode(t.w, t.h, t.data));
  if (group === 'trees') media.trees[name] = { file, w: t.w, h: t.h };
  console.log(name.padEnd(22), t.w + 'x' + t.h);
  return file;
}

// ---- mountains: solid massifs + natural crescent ridges, grey / dark / snow --
// The source mounds are hollow ring examples with stray inner-wall fragments.
// A chamfer distance transform over the silhouette finds the rim (near the
// outline) vs the interior: the massif keeps its rim and re-lays the whole
// interior as clean plateau; the ridges keep only the front/east rim crescent
// so every edge follows the rock's own silhouette (no straight cuts).
{
  const grey = decode(fs.readFileSync(path.join(O, 'lpc-mountains-from-the-mana-world/mountains-v6-tmw.png')));
  const snow = decode(fs.readFileSync(path.join(O, 'lpc-mountains-from-the-mana-world/mountains-v6-tmw-snow.png')));

  // L1 chamfer distance to the true OUTSIDE (transparent pixels reachable from
  // the border) — interior holes are NOT outside, so hole edges and the stray
  // inner-wall fragments measure as deep interior and get cleaned up
  function distField(im) {
    const W = im.w, H = im.h, INF = 1e9;
    const outside = new Uint8Array(W * H);
    const stack = [];
    const tryPush = (x, y) => { const i = y * W + x; if (!outside[i] && im.data[i * 4 + 3] <= 20) { outside[i] = 1; stack.push(i); } };
    for (let x = 0; x < W; x++) { tryPush(x, 0); tryPush(x, H - 1); }
    for (let y = 0; y < H; y++) { tryPush(0, y); tryPush(W - 1, y); }
    while (stack.length) {
      const i = stack.pop(), x = i % W, y = (i / W) | 0;
      if (x > 0) tryPush(x - 1, y);
      if (x < W - 1) tryPush(x + 1, y);
      if (y > 0) tryPush(x, y - 1);
      if (y < H - 1) tryPush(x, y + 1);
    }
    const d = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) d[i] = outside[i] ? 0 : INF;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (x > 0) d[i] = Math.min(d[i], d[i - 1] + 1);
      if (y > 0) d[i] = Math.min(d[i], d[i - W] + 1);
    }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (x < W - 1) d[i] = Math.min(d[i], d[i + 1] + 1);
      if (y < H - 1) d[i] = Math.min(d[i], d[i + W] + 1);
    }
    return d;
  }
  const RIM = 30;
  // massif: rim kept, everything deeper (holes AND stray fragments) re-laid
  // as clean plateau gravel
  function massif(im, patch) {
    const d = distField(im);
    for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
      const i = y * im.w + x;
      if (d[i] <= RIM) continue;
      // jitter the patch phase per cell so the gravel doesn't tile in a grid
      const cx2 = (x / patch.w) | 0, cy2 = (y / patch.h) | 0;
      const jx = ((cx2 * 73856093 ^ cy2 * 19349663) >>> 0) % patch.w;
      const jy = ((cx2 * 83492791 ^ cy2 * 2654435761) >>> 0) % patch.h;
      const p = px(patch, (x + jx) % patch.w, (y + jy) % patch.h);
      const o = i * 4;
      im.data[o] = p[0]; im.data[o + 1] = p[1]; im.data[o + 2] = p[2]; im.data[o + 3] = 255;
    }
    return im;
  }
  // ridge: only the rim band on the given side survives, fading out at the tips
  function ridge(im, side) {
    const d = distField(im), W = im.w, H = im.h;
    const yMid = H * 0.42, xMid = W * 0.5, FADE = 18;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, o = i * 4;
      if (!im.data[o + 3]) continue;
      if (d[i] > RIM) { im.data[o + 3] = 0; continue; }         // interior gone
      const keep = side === 'south' ? y - yMid : x - xMid;      // signed distance past the cut
      if (keep < 0) im.data[o + 3] = keep > -FADE ? im.data[o + 3] * (1 + keep / FADE) : 0;
    }
    return im;
  }

  const MOUND_PALE = [608, 1188, 388, 336], MOUND_DARK = [608, 1700, 388, 332];
  const patchPale = crop(grey, 668, 1248, 64, 48);
  const patchSnow = crop(snow, 668, 1248, 64, 48);
  const patchDark = crop(grey, 668, 1760, 64, 48);
  for (const [tag, sheet, mound, patch] of [
    ['grey', grey, MOUND_PALE, patchPale],
    ['snow', snow, MOUND_PALE, patchSnow],
    ['dark', grey, MOUND_DARK, patchDark],
  ]) {
    save(`mountain_${tag}_0`, massif(crop(sheet, ...mound), patch));
    save(`mountain_${tag}_1`, ridge(crop(sheet, ...mound), 'south'));
    save(`mountain_${tag}_2`, ridge(crop(sheet, ...mound), 'east'));
  }
}

// ---- waterfalls: 4-frame lip + tall scrolling body + plunge strips -----------
// The client scrolls the 64px body band downward through the frame cycle so the
// water genuinely pours; the lip band carries the bright over-the-edge streaks
// and the base the plunge + splash ring.
{
  const im = decode(fs.readFileSync(path.join(O, 'lpc-animated-water-and-waterfalls/wateranimate2.png')));
  const COLS = [17, 111, 209, 304];       // left edge of each 64px frame column
  const tops = [], mids = [], bases = [];
  COLS.forEach((x0, f) => {
    const top = crop(im, x0, 6, 64, 34);    // the lip: bright streaks over the edge
    const mid = crop(im, x0, 40, 64, 64);   // tall body band (scrolled by the client)
    const base = crop(im, x0, 112, 64, 52); // plunge + splash ring
    fs.writeFileSync(path.join(ENV, `waterfall_top_${f}.png`), encode(top.w, top.h, top.data));
    fs.writeFileSync(path.join(ENV, `waterfall_mid_${f}.png`), encode(mid.w, mid.h, mid.data));
    fs.writeFileSync(path.join(ENV, `waterfall_base_${f}.png`), encode(base.w, base.h, base.data));
    tops.push(`env/waterfall_top_${f}.png`); mids.push(`env/waterfall_mid_${f}.png`); bases.push(`env/waterfall_base_${f}.png`);
    console.log(`waterfall frame ${f}`, 'top 64x34 mid 64x64 base 64x52');
  });
  media.sheets.waterfall = { top: tops, mid: mids, base: bases };
}

// ---- open-water sparkle: bright ripple pixels -> squashed diamond overlays ---
{
  const im3 = decode(fs.readFileSync(path.join(O, 'lpc-animated-water-and-waterfalls/wateranimate3.png')));
  const im2 = decode(fs.readFileSync(path.join(O, 'lpc-animated-water-and-waterfalls/wateranimate2.png')));
  // four 64x64 samples across the two sheets' flat-water blocks
  const samples = [
    [im3, 416, 160], [im3, 384, 224], [im2, 384, 256], [im2, 384, 224],
  ];
  const files = [];
  samples.forEach(([src, sx, sy], f) => {
    const s = crop(src, sx, sy, 64, 64);
    const o = makeImage(64, 32);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) {
      // diamond mask
      const dx = Math.abs(x - 32) / 32, dy = Math.abs(y - 16) / 16;
      if (dx + dy > 1) continue;
      const p = px(s, x, y * 2);           // vertical squash 2:1
      // keep only the bright ripple crests (teal water, lightened wave tips)
      if (p[2] > 110 && p[2] > p[0] + 30 && p[1] > 150) {
        const d = o.data, i = (y * o.w + x) * 4;
        d[i] = 225; d[i + 1] = 245; d[i + 2] = 252; d[i + 3] = 150;
      }
    }
    fs.writeFileSync(path.join(ENV, `water_sparkle_${f}.png`), encode(o.w, o.h, o.data));
    files.push(`env/water_sparkle_${f}.png`);
    console.log(`water_sparkle_${f}`, '64x32');
  });
  media.sheets.water_sparkle = files;
}

// ---- 4-season grass palette: report mean colours for the client tint --------
{
  const T = path.join(O, 'lpc-revised-4-season-terrain/unz_4-season_terrain/Terrain');
  for (const season of ['Spring', 'Summer', 'Autumn', 'Winter']) {
    const im = decode(fs.readFileSync(path.join(T, `Grass (${season}).png`)));
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = 0; y < im.h; y += 2) for (let x = 0; x < im.w; x += 2) {
      if (A(im, x, y) < 200) continue;
      const p = px(im, x, y); r += p[0]; g += p[1]; b += p[2]; n++;
    }
    console.log(`season ${season}: rgb(${(r / n) | 0},${(g / n) | 0},${(b / n) | 0})`);
  }
}

fs.writeFileSync(MEDIA, JSON.stringify(media, null, 1));
console.log('media.json updated');

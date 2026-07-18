// LPC Medieval Fantasy character sprites (wulax, CC-BY-SA/GPL) import:
// - assembles the pack's per-animation layer strips into our 832x1344
//   universal sheets
// - RANGER SET: leather torso+shoulders+bracers flattened into one torso
//   sheet, plus the leather hat and greenish pants; dyed hide (brown),
//   blue, red, green and aethereal
// - SKELETON body (+ blank head so the skull isn't overdrawn) for the
//   bone-legion mobs, composited like any other skin
// Usage: node tools/add-lpc-medieval.mjs <scratchpad/oga dir>
import fs from 'node:fs';
import path from 'node:path';
import { decode, encode, makeImage } from './png.mjs';

const O = process.argv[2];
const SRC = path.join(O, 'lpc-medieval/entry/lpc_entry/png');
const EXP = path.join(O, 'lpc-medieval/expansion/expansion_pack-0.04/png/64x64');
const LPC = path.resolve('client/assets/lpc');
const MANIFEST = path.join(LPC, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

// universal layout: [folder, frames, first row]
const ANIMS = [
  ['spellcast', 7, 0], ['thrust', 8, 4], ['walkcycle', 9, 8],
  ['slash', 6, 12], ['bow', 13, 16], ['hurt', 6, 20],
];

function pasteStrip(dst, srcFile, row0) {
  if (!fs.existsSync(srcFile)) return false;
  const s = decode(fs.readFileSync(srcFile));
  const y0 = row0 * 64;
  for (let y = 0; y < s.h && y0 + y < dst.h; y++)
    for (let x = 0; x < s.w && x < dst.w; x++) {
      const si = (y * s.w + x) * 4, di = ((y0 + y) * dst.w + x) * 4;
      const a = s.data[si + 3];
      if (!a) continue;
      // source-over blend so multi-piece flattening layers correctly
      const da = dst.data[di + 3];
      const oa = a + da * (255 - a) / 255;
      for (let k = 0; k < 3; k++)
        dst.data[di + k] = (s.data[si + k] * a + dst.data[di + k] * da * (255 - a) / 255) / (oa || 1);
      dst.data[di + 3] = oa;
    }
  return true;
}

// assemble one universal sheet from per-anim files; nameByAnim maps folder ->
// filename (missing entries leave that band transparent)
function assemble(nameByAnim, ...more) {
  const im = makeImage(832, 1344);
  for (const [anim, , row0] of ANIMS) {
    for (const nm of [nameByAnim, ...more]) {
      const f = nm[anim];
      if (f) pasteStrip(im, f, row0);
    }
  }
  return im;
}
const inAll = (file) => Object.fromEntries(ANIMS.map(([a]) => [a, path.join(SRC, a, file)]));

// ---- dyes -------------------------------------------------------------------
function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) {
    if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return [(h + 360) % 360, s, l];
}
function hsl2rgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  let rr, gg, bb;
  if (h < 60) [rr, gg, bb] = [c, x, 0]; else if (h < 120) [rr, gg, bb] = [x, c, 0];
  else if (h < 180) [rr, gg, bb] = [0, c, x]; else if (h < 240) [rr, gg, bb] = [0, x, c];
  else if (h < 300) [rr, gg, bb] = [x, 0, c]; else [rr, gg, bb] = [c, 0, x];
  return [(rr + m) * 255, (gg + m) * 255, (bb + m) * 255];
}
// re-dye every saturated pixel to the target hue (outlines and grey buckles
// keep); aethereal instead washes the hide pale and spectral
function dye(im, spec) {
  const out = makeImage(im.w, im.h);
  out.data.set(im.data);
  for (let p = 0; p < out.data.length; p += 4) {
    if (out.data[p + 3] < 10) continue;
    const [h, s, l] = rgb2hsl(out.data[p], out.data[p + 1], out.data[p + 2]);
    if (s < 0.12) continue;
    let [nh, ns, nl] = spec.aethereal
      ? [205, Math.min(1, s * 0.3 + 0.1), Math.min(1, l * 1.35)]
      : [spec.hue, Math.min(1, s * (spec.sat ?? 1)), Math.min(1, l * (spec.lum ?? 1))];
    const [r, g, b] = hsl2rgb(nh, ns, nl);
    out.data[p] = r; out.data[p + 1] = g; out.data[p + 2] = b;
  }
  return out;
}
const DYES = {
  hide: null,                                    // the pack's own brown leather
  green: { hue: 115, sat: 0.85, lum: 0.9 },      // forest-green high set
  blue: { hue: 215, sat: 0.9 },                  // blue dragon mid set
  red: { hue: 356, sat: 0.95, lum: 0.95 },       // red dragon set
  aethereal: { aethereal: true },                // pale spectral wash
};

const save = (name, im) => { fs.writeFileSync(path.join(LPC, name), encode(im.w, im.h, im.data)); console.log(' ', name, im.w + 'x' + im.h); };

// ---- ranger set -------------------------------------------------------------
console.log('ranger set:');
const torso = assemble(inAll('TORSO_leather_armor_torso.png'), inAll('TORSO_leather_armor_shoulders.png'), inAll('TORSO_leather_armor_bracers.png'));
const hat = assemble(inAll('HEAD_leather_armor_hat.png'));
const legs = assemble(inAll('LEGS_pants_greenish.png'));
const gearEntry = (prefix) => ({});
const reg = { torso: {}, head: {}, legs: {} };
for (const [color, spec] of Object.entries(DYES)) {
  const t = spec ? dye(torso, spec) : torso;
  const h = spec ? dye(hat, spec) : hat;
  const l = spec ? dye(legs, spec) : legs;
  save(`gear_torso_wulaxranger_male_${color}.png`, t);
  save(`gear_head_rangerhat_male_${color}.png`, h);
  save(`gear_legs_ranger_male_${color}.png`, l);
  reg.torso[color] = `gear_torso_wulaxranger_male_${color}.png`;
  reg.head[color] = `gear_head_rangerhat_male_${color}.png`;
  reg.legs[color] = `gear_legs_ranger_male_${color}.png`;
}
manifest.gear['torso/wulax_ranger'] = { male: reg.torso, female: reg.torso };
manifest.gear['head/ranger_hat'] = { male: reg.head, female: reg.head };
manifest.gear['legs/ranger'] = { male: reg.legs, female: reg.legs };

// ---- skeleton body ----------------------------------------------------------
console.log('skeleton:');
const skel = assemble({
  spellcast: path.join(SRC, 'spellcast/BODY_skeleton.png'),
  walkcycle: path.join(SRC, 'walkcycle/BODY_skeleton.png'),
  slash: path.join(SRC, 'slash/BODY_skeleton.png'),
  hurt: path.join(SRC, 'hurt/BODY_skeleton.png'),
  bow: path.join(EXP, 'bow/BODY_skeleton.png'),
});
save('body_male_skeleton.png', skel);
const blank = makeImage(832, 1344);
save('head_skeleton_blank.png', blank);
manifest.bodies.male.skeleton = 'body_male_skeleton.png';
manifest.bodies.female.skeleton = 'body_male_skeleton.png';
manifest.heads.male.skeleton = 'head_skeleton_blank.png';
manifest.heads.female.skeleton = 'head_skeleton_blank.png';

fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
console.log('manifest updated');

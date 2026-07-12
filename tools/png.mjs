// Minimal PNG codec for the asset pipeline: decode (bit depth 8, color types
// 0/2/3/4/6, no interlace) to RGBA, encode RGBA, plus blit/downscale helpers.
// Lets build-media.mjs assemble frame-folder packs into sheets without deps.
import zlib from 'node:zlib';

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function decode(buf) {
  if (!SIG.equals(buf.subarray(0, 8))) throw new Error('not a png');
  let off = 8, w = 0, h = 0, depth = 8, ct = 6;
  const idat = []; let plte = null, trns = null;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; ct = data[9];
      if (data[12]) throw new Error('interlaced png unsupported');
      if (depth !== 8 && !(ct === 3 && depth <= 8)) throw new Error(`bit depth ${depth} ct ${ct} unsupported`);
    } else if (type === 'PLTE') plte = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct];
  const bpp = ct === 3 && depth < 8 ? 1 : ch;                    // filter unit in bytes
  const stride = ct === 3 && depth < 8 ? Math.ceil(w * depth / 8) : w * ch;
  const lines = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const out = lines.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[x] = v & 0xff;
    }
    prev = out;
  }
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    if (ct === 6) { const i = y * stride + x * 4; rgba[o] = lines[i]; rgba[o + 1] = lines[i + 1]; rgba[o + 2] = lines[i + 2]; rgba[o + 3] = lines[i + 3]; }
    else if (ct === 2) { const i = y * stride + x * 3; rgba[o] = lines[i]; rgba[o + 1] = lines[i + 1]; rgba[o + 2] = lines[i + 2]; rgba[o + 3] = 255; }
    else if (ct === 4) { const i = y * stride + x * 2; rgba[o] = rgba[o + 1] = rgba[o + 2] = lines[i]; rgba[o + 3] = lines[i + 1]; }
    else if (ct === 0) { const v = lines[y * stride + x]; rgba[o] = rgba[o + 1] = rgba[o + 2] = v; rgba[o + 3] = 255; }
    else { // palette, depth 1/2/4/8
      let idx;
      if (depth === 8) idx = lines[y * stride + x];
      else { const bits = depth, per = 8 / bits, b = lines[y * stride + (x / per | 0)]; idx = (b >> (8 - bits * (x % per + 1))) & ((1 << bits) - 1); }
      rgba[o] = plte[idx * 3]; rgba[o + 1] = plte[idx * 3 + 1]; rgba[o + 2] = plte[idx * 3 + 2];
      rgba[o + 3] = trns && idx < trns.length ? trns[idx] : 255;
    }
  }
  return { w, h, data: rgba };
}

const crcTable = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = (buf) => { let c = -1; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => {
  const b = Buffer.alloc(12 + data.length);
  b.writeUInt32BE(data.length, 0); b.write(type, 4, 'latin1'); data.copy ? data.copy(b, 8) : Buffer.from(data).copy(b, 8);
  b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length);
  return b;
};

export function encode(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

export const makeImage = (w, h) => ({ w, h, data: new Uint8Array(w * h * 4) });

// Copy a rect from src into dst (no blending — frames don't overlap).
export function blit(dst, dx, dy, src, sx = 0, sy = 0, sw = src.w, sh = src.h) {
  for (let y = 0; y < sh; y++) {
    const dyy = dy + y, syy = sy + y;
    if (dyy < 0 || dyy >= dst.h || syy < 0 || syy >= src.h) continue;
    for (let x = 0; x < sw; x++) {
      const dxx = dx + x, sxx = sx + x;
      if (dxx < 0 || dxx >= dst.w || sxx < 0 || sxx >= src.w) continue;
      const si = (syy * src.w + sxx) * 4, di = (dyy * dst.w + dxx) * 4;
      dst.data[di] = src.data[si]; dst.data[di + 1] = src.data[si + 1];
      dst.data[di + 2] = src.data[si + 2]; dst.data[di + 3] = src.data[si + 3];
    }
  }
}

// Alpha-over blend a rect from src onto dst (for layered composites).
export function blend(dst, dx, dy, src) {
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const dxx = dx + x, dyy = dy + y;
    if (dxx < 0 || dyy < 0 || dxx >= dst.w || dyy >= dst.h) continue;
    const si = (y * src.w + x) * 4, di = (dyy * dst.w + dxx) * 4;
    const sa = src.data[si + 3] / 255; if (!sa) continue;
    const da = dst.data[di + 3] / 255, oa = sa + da * (1 - sa);
    for (let c = 0; c < 3; c++) dst.data[di + c] = Math.round((src.data[si + c] * sa + dst.data[di + c] * da * (1 - sa)) / (oa || 1));
    dst.data[di + 3] = Math.round(oa * 255);
  }
}

// Integer box-filter downscale (alpha-weighted) — crisp for pixel/painted art.
export function downscale(src, factor) {
  const w = Math.floor(src.w / factor), h = Math.floor(src.h / factor);
  const out = makeImage(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let yy = 0; yy < factor; yy++) for (let xx = 0; xx < factor; xx++) {
      const i = ((y * factor + yy) * src.w + x * factor + xx) * 4;
      const al = src.data[i + 3];
      r += src.data[i] * al; g += src.data[i + 1] * al; b += src.data[i + 2] * al; a += al;
    }
    const o = (y * w + x) * 4;
    if (a) { out.data[o] = Math.round(r / a); out.data[o + 1] = Math.round(g / a); out.data[o + 2] = Math.round(b / a); out.data[o + 3] = Math.round(a / (factor * factor)); }
  }
  return out;
}

export function crop(src, sx, sy, w, h) {
  const out = makeImage(w, h);
  blit(out, 0, 0, src, sx, sy, w, h);
  return out;
}

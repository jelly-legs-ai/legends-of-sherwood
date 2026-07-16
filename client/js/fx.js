// FX: projectiles, particles, hit splats, floating text, level-up bursts.
import { FX } from '/shared/constants.js';
import { drawFxSprite, drawGoldNumber } from './media.js';

// arrow/bolt heads glint with their metal; the shaft stays wood
const AMMO_TINT = { copper: '#c87a3a', bronze: '#bd8a52', iron: '#9198a2', steel: '#cfd6de', brass: '#d8b45e', silver: '#e6ecf5', gold: '#e8c84e' };
const PROJ_STYLE = {
  arrow: { color: '#e8ddc0', trail: '#7a5a34', len: 20 },
  air: { color: '#cfe8f8', trail: '#9ad2e8', orb: 4 },
  earth: { color: '#b08a4c', trail: '#8a6a3c', orb: 5 },
  water: { color: '#6ab0e0', trail: '#4c8ab0', orb: 5 },
  fire: { color: '#ffb02a', trail: '#e06a2a', orb: 6 },
  nature: { color: '#7fd05f', trail: '#5aa03c', orb: 6 },
  holy: { color: '#fff3b0', trail: '#ffd75e', orb: 6 },
  blood: { color: '#ff5a5a', trail: '#a02a2a', orb: 6 },
  sherwood: { color: '#a0ff8a', trail: '#3ca03c', orb: 8 },
};

export class Fx {
  constructor() { this.projectiles = []; this.particles = []; this.texts = []; this.splats = []; this.markers = []; }

  spawn(msg, entities) {
    const now = performance.now();
    switch (msg.fx) {
      case FX.ARROW: case FX.FIREBOLT: case FX.ICEBOLT: case FX.HOLYBOLT: case FX.NATURE: {
        const from = entities.get(msg.from);
        const style = msg.fx === FX.ARROW ? 'arrow' : (msg.proj || (msg.fx === FX.ICEBOLT ? 'water' : msg.fx === FX.HOLYBOLT ? 'holy' : msg.fx === FX.NATURE ? 'nature' : 'fire'));
        // 'sheet:key:variant' projectiles play an animated sprite along the arc
        const sheet = style.startsWith?.('sheet:') ? style.slice(6) : null;
        this.projectiles.push({
          x0: from ? from.rx : msg.x, y0: from ? from.ry - 0.6 : msg.y, x1: msg.tx, y1: msg.ty,
          toId: msg.to, t0: now, dur: sheet ? 420 : 320, style, sheet,
          headCol: msg.fx === FX.ARROW ? (AMMO_TINT[msg.metal] || '#e8ddc0') : null, bolt: !!msg.bolt,
        });
        break;
      }
      case FX.LEVELUP: this.burst(msg, entities, '#ffd75e', 26, 3); this.burst(msg, entities, '#fff3b0', 14, 2); break;
      case FX.SHILLING: this.burst(msg, entities, '#ffd75e', 18, 2.4); this.text(msg, entities, '✦ $LoS', '#ffd75e'); break;
      case FX.HEAL: this.burst(msg, entities, '#7fd05f', 10, 1.6); break;
      case FX.TELEPORT: {
        // The Anima channel: the 30-frame anima effect stretched across the full
        // 6-second cast (one slow playthrough), with rising arcane motes.
        const dur = msg.channel ? 6000 : 1200;
        this.markers.push({ x: msg.x, y: msg.y, spec: 'anima', t0: now, dur, size: 150, dy: -26, single: true });
        for (let i = 0; i < (msg.channel ? 20 : 12); i++) {
          const a = Math.random() * Math.PI * 2, r = 0.3 + Math.random() * 0.6;
          this.particles.push({ x: msg.x + Math.cos(a) * r, y: msg.y - 0.4, vx: Math.cos(a) * 0.22, vy: -0.45 - Math.random() * 0.6, t0: now + i * (msg.channel ? 260 : 50), dur: 1000 + Math.random() * 600, color: i % 2 ? '#c77ce7' : '#9fd8ef', size: 2 + Math.random() * 2 });
        }
        break;
      }
      case FX.IMPACT: {   // a VFX burst on the struck target (spell/melee/ranged)
        const e = msg.id ? entities.get(msg.id) : null;
        const wx = e ? e.rx : msg.x, wy = e ? e.ry : msg.y;
        if (wx !== undefined) this.markers.push({ id: msg.id, x: wx, y: wy, spec: msg.spec || 'vfx_impact', tint: msg.tint || null, t0: now, dur: msg.dur || 520, size: msg.size || 70, dy: -20 });
        break;
      }
      case FX.PRAYFX: {   // a divine effect over the praying player
        this.markers.push({ id: msg.id, spec: msg.spec || 'aura_ring', tint: msg.tint || '#fff3b0', t0: now, dur: 900, size: 90, dy: -22, single: true });
        break;
      }
      case FX.CASTFX: {   // a channel effect on a spell/action caster
        this.markers.push({ id: msg.id, spec: msg.spec || 'aura_charged', tint: msg.tint || null, t0: now, dur: msg.dur || 700, size: msg.size || 72, dy: -18 });
        break;
      }
      case FX.SPLASH: this.burst(msg, entities, '#9ad2e8', 6, 1.4); break;
      case FX.CHOP: this.burst(msg, entities, '#a8d06a', 6, 1.5); break;
      case FX.MINE: this.burst(msg, entities, '#c8c4b8', 6, 1.5); break;
      case FX.SPARK: this.burst(msg, entities, '#ffe27a', 8, 1.8); break;
      case FX.BONES: this.burst(msg, entities, '#e8e0d0', 8, 1.5); break;
      case FX.SUMMON: this.burst(msg, entities, '#9fe0cf', 18, 2.4); break;
      case FX.TRAP: this.burst(msg, entities, '#c8a26a', 8, 1.5); break;
      case FX.DIG: this.burst(msg, entities, '#b0946a', 8, 1.5); break;
      case FX.CRIT: this.burst(msg, entities, '#ff8a3a', 16, 2.6); break;
      case FX.BLOCK: {
        this.burst(msg, entities, '#9ab8c8', 12, 2);
        // magic-pack turtleshell flashes over a successful block
        this.markers.push({ id: msg.id, x: msg.x, y: msg.y, spec: 'magic_turtleshell', t0: now, dur: 600, size: 76, dy: -18 });
        break;
      }
      case FX.STUN: this.text(msg, entities, '✶ stunned', '#e0e0e0'); break;
      case FX.FIRE: this.burst(msg, entities, '#ff9b2a', 12, 2); break;
      case FX.COOK: this.burst(msg, entities, '#ffb86a', 6, 1.4); break;
      case FX.CRAFT: case FX.BUILD: this.burst(msg, entities, '#c8b48a', 8, 1.6); break;
      case FX.POT: this.burst(msg, entities, '#b07fe0', 8, 1.6); break;
      case FX.RUNE: this.burst(msg, entities, '#b09fe0', 14, 2.2); break;
      case FX.ARCH: this.burst(msg, entities, '#d8cfa8', 8, 1.6); break;
      case FX.THORNS: this.burst(msg, entities, '#5aa03c', 10, 2); break;
      case FX.POISON: this.burst(msg, entities, '#7fa03c', 8, 1.5); break;
    }
  }
  burst(msg, entities, color, n, speed) {
    const e = msg.id ? entities.get(msg.id) : null;
    const x = e ? e.rx : msg.x, y = e ? e.ry : msg.y;
    if (x === undefined) return;
    const now = performance.now();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.4 + Math.random()) * speed;
      this.particles.push({ x, y: y - 0.4, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.2, t0: now, dur: 500 + Math.random() * 400, color, size: 2 + Math.random() * 2.5 });
    }
  }
  text(msg, entities, str, color) {
    const e = msg.id ? entities.get(msg.id) : null;
    const x = e ? e.rx : msg.x, y = e ? e.ry : msg.y;
    if (x === undefined) return;
    this.texts.push({ x, y, str, color, t0: performance.now(), dur: 1300 });
  }
  floatText(x, y, str, color, big = false) {
    this.texts.push({ x, y, str, color, t0: performance.now(), dur: 1400, big });
  }
  hit(msg, entities) {
    const e = entities.get(msg.id);
    if (!e) return;
    this.splats.push({ id: msg.id, dmg: msg.dmg, crit: msg.crit, t0: performance.now(), dur: 900, dx: (Math.random() - 0.5) * 14 });
    if (msg.dmg > 0) this.burst({ id: msg.id }, entities, '#c03a3a', Math.min(10, 3 + msg.dmg / 3), 1.6);
    // crits detonate an animated blood hitmarker on the victim
    if (msg.crit && msg.dmg > 0) this.markers.push({ id: msg.id, spec: `hitmarker:${[2, 4, 5][Math.random() * 3 | 0]}`, t0: performance.now(), dur: 560, size: 54, dy: -26 });
  }

  draw(ctx, R, nowMs) {
    const now = performance.now();
    // projectiles
    this.projectiles = this.projectiles.filter(p => now - p.t0 < p.dur);
    for (const p of this.projectiles) {
      const t = (now - p.t0) / p.dur;
      const x = p.x0 + (p.x1 - p.x0) * t, y = p.y0 + (p.y1 - p.y0) * t;
      const arc = Math.sin(t * Math.PI) * 10;          // pixel-space flight arc
      const [sx, sy0] = R.screenOf(0, x, y);
      const sy = sy0 - 22 - arc;                        // draw at torso height, arcing
      const st = PROJ_STYLE[p.style] || PROJ_STYLE.fire;
      // on-screen flight direction, from the projected endpoints (correct in iso)
      const [ax, ay] = R.screenOf(0, p.x0, p.y0), [bx, by] = R.screenOf(0, p.x1, p.y1);
      const ang = Math.atan2(by - ay, bx - ax);
      if (p.sheet) { // animated sheet projectile (spell packs)
        const big = p.sheet.startsWith('twisted');
        if (drawFxSprite(ctx, p.sheet, t, sx, sy, big ? 130 : 64, big ? 0 : ang)) continue;
      }
      if (st.len) { // a real arrow/bolt: shaft + metal head + fletching
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(ang);
        const L = p.bolt ? 13 : st.len, h = L / 2;      // bolts are stubby quarrels
        const head = p.headCol || st.color;
        // shaft
        ctx.strokeStyle = st.trail; ctx.lineWidth = p.bolt ? 2.2 : 1.6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-h, 0); ctx.lineTo(h - 3, 0); ctx.stroke();
        // arrowhead (filled triangle at the leading end)
        ctx.fillStyle = head;
        ctx.beginPath(); ctx.moveTo(h + 2, 0); ctx.lineTo(h - 4, -2.6); ctx.lineTo(h - 4, 2.6); ctx.closePath(); ctx.fill();
        // fletching (two feathers at the tail)
        ctx.strokeStyle = p.bolt ? '#c9c2b0' : head; ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(-h, 0); ctx.lineTo(-h - 3, -2.4);
        ctx.moveTo(-h, 0); ctx.lineTo(-h - 3, 2.4);
        ctx.moveTo(-h + 2, 0); ctx.lineTo(-h - 1, -2.4);
        ctx.moveTo(-h + 2, 0); ctx.lineTo(-h - 1, 2.4);
        ctx.stroke();
        ctx.restore();
      } else { // magic bolt: glowing orb with a short trail
        ctx.shadowColor = st.color; ctx.shadowBlur = 8;
        ctx.fillStyle = st.color;
        ctx.beginPath(); ctx.arc(sx, sy, st.orb, 0, 7); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = st.trail + '88';
        ctx.beginPath(); ctx.arc(sx - Math.cos(ang) * st.orb * 1.6, sy - Math.sin(ang) * st.orb * 1.6, st.orb * 0.6, 0, 7); ctx.fill();
      }
    }
    // particles
    this.particles = this.particles.filter(p => now - p.t0 < p.dur);
    for (const p of this.particles) {
      const t = (now - p.t0) / p.dur;
      const x = p.x + p.vx * t, y = p.y + p.vy * t + t * t * 2;
      const [sx, sy] = R.screenOf(0, x, y);
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = p.color;
      ctx.fillRect(sx, sy - 24, p.size, p.size);
      ctx.globalAlpha = 1;
    }
    // floating text
    this.texts = this.texts.filter(p => now - p.t0 < p.dur);
    for (const p of this.texts) {
      const t = (now - p.t0) / p.dur;
      const [sx, sy] = R.screenOf(0, p.x, p.y);
      ctx.globalAlpha = 1 - t * t;
      ctx.font = (p.big ? 'bold 16px' : 'bold 12px') + ' Georgia';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#000';
      ctx.fillText(p.str, sx + 1, sy - 46 - t * 30 + 1);
      ctx.fillStyle = p.color;
      ctx.fillText(p.str, sx, sy - 46 - t * 30);
      ctx.globalAlpha = 1;
    }
    // sheet-anim markers: crit hitmarkers on entities, teleport swirls at spots
    this.markers = this.markers.filter(p => now - p.t0 < p.dur);
    for (const p of this.markers) {
      let wx = p.x, wy = p.y;
      if (p.id !== undefined) {
        const e = R._ents?.get(p.id);
        if (e) { wx = e.rx; wy = e.ry; }
        else if (wx === undefined) continue;      // entity gone, no fallback spot
      }
      const el = now - p.t0;
      const f = el / p.dur;
      // single: one slow playthrough across the whole duration (anima teleport).
      // slow: loops the sheet gently. else: plays once over dur.
      const t = p.single ? f : p.slow ? (el % 900) / 900 : f;
      let a = 1;
      if (p.single || p.slow) a = Math.min(1, f * 8) * Math.min(1, (1 - f) * 8);
      const [sx, sy] = R.screenOf(0, wx, wy);
      ctx.globalAlpha = a;
      drawFxSprite(ctx, p.spec, t, sx, sy + (p.dy || 0), p.size || 54, 0, p.tint);
      ctx.globalAlpha = 1;
    }
    // hit splats (drawn near entity if still present)
    this.splats = this.splats.filter(p => now - p.t0 < p.dur);
    for (const p of this.splats) {
      const e = R._ents?.get(p.id);
      if (!e) continue;
      const t = (now - p.t0) / p.dur;
      const [sx, sy] = R.screenOf(0, e.rx, e.ry);
      const y = sy - 34 - t * 16;
      ctx.globalAlpha = 1 - t * t;
      if (p.dmg > 0 && p.crit) {
        // crits: big gold bitmap digits punching upward
        const s = 20 + Math.min(10, p.dmg / 4);
        if (!drawGoldNumber(ctx, p.dmg, sx + p.dx, y, s + (1 - t) * 4)) {
          ctx.fillStyle = '#ff8a2a';
          ctx.beginPath(); ctx.arc(sx + p.dx, y, 11, 0, 7); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.font = 'bold 12px Georgia'; ctx.textAlign = 'center';
          ctx.fillText(p.dmg, sx + p.dx, y + 4);
        }
      } else if (p.dmg > 0) {
        ctx.fillStyle = '#c81e1e';
        ctx.beginPath(); ctx.arc(sx + p.dx, y, 9, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px Georgia'; ctx.textAlign = 'center';
        ctx.fillText(p.dmg, sx + p.dx, y + 4);
      } else {
        ctx.fillStyle = '#2a4a8a';
        ctx.beginPath(); ctx.arc(sx + p.dx, y, 8, 0, 7); ctx.fill();
        ctx.fillStyle = '#cfe0f8';
        ctx.font = 'bold 10px Georgia'; ctx.textAlign = 'center';
        ctx.fillText('0', sx + p.dx, y + 3);
      }
      ctx.globalAlpha = 1;
    }
  }
}

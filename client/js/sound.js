// Zero-asset soundscape: every effect is synthesized in WebAudio at call time
// (short oscillator/noise gestures), so the game gains audio without shipping
// a single sample. Honours the Settings mute (G.muted) and the browser's
// autoplay policy (the context wakes on the first pointer/key gesture).

let ctx = null, master = null, muted = () => false;

export function initSound(isMuted) {
  muted = isMuted || muted;
  const wake = () => {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
  };
  window.addEventListener('pointerdown', wake, { passive: true });
  window.addEventListener('keydown', wake, { passive: true });
}

const ready = () => ctx && ctx.state === 'running' && !muted();

// one enveloped oscillator gesture
function tone(freq, dur, { type = 'sine', vol = 1, glide = 0, delay = 0 } = {}) {
  if (!ready()) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + glide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
// filtered noise burst (thuds, slashes, splashes)
function noise(dur, { freq = 1200, q = 1, vol = 1, delay = 0, sweep = 0 } = {}) {
  if (!ready()) return;
  const t0 = ctx.currentTime + delay;
  const n = Math.max(1, (dur * ctx.sampleRate) | 0);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass'; f.Q.value = q;
  f.frequency.setValueAtTime(freq, t0);
  if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t0);
}

// ---- the game's vocabulary --------------------------------------------------
const throttle = {};
function gate(key, ms) { const now = performance.now(); if (now - (throttle[key] || 0) < ms) return false; throttle[key] = now; return true; }

export const sfx = {
  hit(me) {           // a landed blow — meatier when it's yours or on you
    if (!gate('hit', 70)) return;
    noise(0.09, { freq: me ? 420 : 700, q: 0.8, vol: me ? 0.9 : 0.4, sweep: -300 });
    if (me) tone(90, 0.1, { type: 'triangle', vol: 0.5, glide: -40 });
  },
  whiff() { if (gate('hit', 70)) noise(0.06, { freq: 1800, q: 0.6, vol: 0.15, sweep: -900 }); },
  levelup() {         // rising fanfare arpeggio
    [392, 494, 587, 784].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.6, delay: i * 0.09 }));
  },
  coin(big) {         // $LoS / loot ding
    if (!gate('coin', 120)) return;
    tone(1318, 0.09, { type: 'square', vol: 0.18 });
    tone(1760, 0.14, { type: 'square', vol: 0.15, delay: 0.06 });
    if (big) tone(2217, 0.2, { type: 'square', vol: 0.14, delay: 0.12 });
  },
  spell() { if (gate('spell', 150)) { noise(0.28, { freq: 900, q: 2, vol: 0.3, sweep: 1400 }); tone(520, 0.25, { type: 'sine', vol: 0.2, glide: 350 }); } },
  death() {           // slow descending knell
    [330, 262, 196, 131].forEach((f, i) => tone(f, 0.4, { type: 'triangle', vol: 0.55, delay: i * 0.22 }));
  },
  eat() { if (gate('eat', 200)) noise(0.1, { freq: 500, q: 1.2, vol: 0.35, sweep: -200 }); },
  teleport() { tone(200, 0.5, { type: 'sine', vol: 0.35, glide: 900 }); noise(0.5, { freq: 1500, q: 3, vol: 0.2, sweep: 2000 }); },
  gate() { noise(0.4, { freq: 300, q: 1.5, vol: 0.4, sweep: -180 }); tone(110, 0.35, { type: 'triangle', vol: 0.3, glide: -50 }); },
  milestone() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, { type: 'sine', vol: 0.5, delay: i * 0.11 })); },
  // per-skill gathering gestures, fired from XP gains
  skill(name) {
    if (!gate('skill', 180)) return;
    switch (name) {
      case 'woodcutting': noise(0.09, { freq: 320, q: 1.4, vol: 0.5, sweep: -140 }); tone(110, 0.08, { type: 'triangle', vol: 0.3, glide: -30 }); break;   // axe thock
      case 'mining': tone(1450 + Math.random() * 500, 0.09, { type: 'triangle', vol: 0.3, glide: -300 }); noise(0.05, { freq: 2600, q: 2, vol: 0.2 }); break;   // pick clink
      case 'fishing': noise(0.22, { freq: 750, q: 1, vol: 0.35, sweep: -520 }); break;                                                                    // splash
      case 'cooking': noise(0.3, { freq: 3400, q: 0.6, vol: 0.16 }); break;                                                                               // sizzle
      case 'smithing': tone(820, 0.14, { type: 'square', vol: 0.22, glide: -200 }); noise(0.06, { freq: 1900, q: 2.5, vol: 0.2 }); break;                 // hammer clang
      case 'crafting': case 'fletching': noise(0.05, { freq: 1300, q: 2, vol: 0.22, sweep: -400 }); break;                                                // work tap
      case 'farming': case 'hunter': case 'herblore': noise(0.14, { freq: 900, q: 0.7, vol: 0.2, sweep: -300 }); break;                                   // rustle
      case 'agility': noise(0.1, { freq: 1600, q: 0.7, vol: 0.18, sweep: 500 }); break;                                                                   // whoosh up
      case 'prayer': tone(880, 0.35, { type: 'sine', vol: 0.2 }); tone(1108, 0.3, { type: 'sine', vol: 0.14, delay: 0.05 }); break;                       // soft chord
      case 'magic': case 'runecrafting': this.spell(); break;
    }
  },
};

// ---- ambient beds -----------------------------------------------------------
// Two location-aware background layers, both synthesized: a looped noise bed
// (wind outdoors, tectonic rumble underground) plus sparse scheduled one-shots
// (birdsong / water drips). ambientTick(mode) crossfades whenever the player's
// surroundings change; mode null (or mute) fades everything out.
let amb = null;

function makeLoopNoise(freq, q) {
  const buf = ctx.createBuffer(1, (2 * ctx.sampleRate) | 0, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf; src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = freq; f.Q.value = q;
  src.connect(f);
  src.start();
  return { src, f };
}

function startAmbient(mode) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 1.6);
  g.connect(master);
  const a = { mode, g, stops: [], timer: 0 };
  const loop = (fn, min, max) => {   // sparse one-shots on a drifting clock
    const tick = () => { if (amb !== a) return; fn(); a.timer = setTimeout(tick, min + Math.random() * (max - min)); };
    a.timer = setTimeout(tick, min + Math.random() * (max - min));
  };
  if (mode === 'overworld') {
    const wind = makeLoopNoise(340, 0.6);
    const wg = ctx.createGain(); wg.gain.value = 0.055;
    wind.f.connect(wg); wg.connect(g);
    // slow gusting: an LFO breathes the filter open and closed
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = ctx.createGain(); lg.gain.value = 140;
    lfo.connect(lg); lg.connect(wind.f.frequency); lfo.start();
    a.stops.push(() => { wind.src.stop(); lfo.stop(); });
    loop(() => {   // birdsong: a few quick sweet chirps
      const n = 2 + (Math.random() * 3 | 0), base = 1900 + Math.random() * 1300;
      for (let i = 0; i < n; i++) {
        const t0 = ctx.currentTime + i * (0.09 + Math.random() * 0.06);
        const o = ctx.createOscillator(), og = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(base + Math.random() * 300, t0);
        o.frequency.exponentialRampToValueAtTime(base * (Math.random() < 0.5 ? 1.35 : 0.75), t0 + 0.07);
        og.gain.setValueAtTime(0.0001, t0);
        og.gain.exponentialRampToValueAtTime(0.05, t0 + 0.015);
        og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
        o.connect(og); og.connect(g); o.start(t0); o.stop(t0 + 0.12);
      }
    }, 2500, 9000);
  } else if (mode === 'cave') {
    const rumble = makeLoopNoise(110, 0.8);
    const rg = ctx.createGain(); rg.gain.value = 0.10;
    rumble.f.connect(rg); rg.connect(g);
    a.stops.push(() => rumble.src.stop());
    loop(() => {   // a drip falls, then its echo answers
      const plink = (t0, vol) => {
        const o = ctx.createOscillator(), og = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(820 + Math.random() * 500, t0);
        o.frequency.exponentialRampToValueAtTime(240, t0 + 0.11);
        og.gain.setValueAtTime(0.0001, t0);
        og.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
        og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
        o.connect(og); og.connect(g); o.start(t0); o.stop(t0 + 0.2);
      };
      plink(ctx.currentTime, 0.12);
      plink(ctx.currentTime + 0.16, 0.045);
    }, 1800, 6500);
  }
  return a;
}

export function ambientTick(mode) {
  if (!ctx) return;                                  // audio wakes on the first gesture
  const want = (muted() || ctx.state !== 'running') ? null : mode;
  if ((amb?.mode ?? null) === want) return;
  if (amb) {                                         // let the old bed breathe out
    const old = amb;
    old.g.gain.cancelScheduledValues(ctx.currentTime);
    old.g.gain.setValueAtTime(Math.max(0.0001, old.g.gain.value), ctx.currentTime);
    old.g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2);
    clearTimeout(old.timer);
    setTimeout(() => { for (const s of old.stops) try { s(); } catch {} old.g.disconnect(); }, 1400);
  }
  amb = want ? startAmbient(want) : null;
}

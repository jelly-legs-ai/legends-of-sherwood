// Shared environmental clock: day/night and weather derive from wall time
// alone, so every client renders the identical sky with zero network traffic.

// One full day-night cycle. Long enough that night feels like a place, short
// enough that a session sees both.
export const DAY_MS = 48 * 60000;

// 0 = midnight. Full dark until dawn breaks at 0.20, day 0.30-0.75, dusk
// 0.75-0.85, then night again. `dark` slides 0..1 through the transitions.
export function dayPhase(now = Date.now()) {
  const t = (now % DAY_MS) / DAY_MS;
  if (t < 0.20) return { t, phase: 'night', dark: 1 };
  if (t < 0.30) return { t, phase: 'dawn', dark: 1 - (t - 0.20) / 0.10 };
  if (t < 0.75) return { t, phase: 'day', dark: 0 };
  if (t < 0.85) return { t, phase: 'dusk', dark: (t - 0.75) / 0.10 };
  return { t, phase: 'night', dark: 1 };
}

// Weather fronts: the map is carved into coarse cells (pass x>>6, y>>6) and
// time into 4-minute blocks; each (cell, block) hashes to a sky. Fronts feel
// regional — walk far enough and you can leave the rain behind.
export function weatherAt(cx, cy, now = Date.now()) {
  const block = Math.floor(now / (4 * 60000));
  let h = (block * 374761393 + cx * 668265263 + cy * 2246822519) >>> 0;
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
  const r = (h >>> 8) / 16777216;
  if (r < 0.62) return 'clear';
  if (r < 0.87) return 'rain';
  return 'storm';
}

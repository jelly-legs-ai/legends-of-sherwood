// Legends of Sherwood — client entry: login, game state, input, main loop.
import { MSG, PLANE, WILDERNESS_Y, REGIONS, TILE } from '/shared/constants.js';
import { computeWorld, regionAt, dungeonFloor, worldTile } from '/shared/mapgen.js';
import { QUESTS } from '/shared/data/quests.js';
import { ITEMS } from '/shared/data/items.js';
import { MOBS } from '/shared/data/mobs.js';
import { NPCS } from '/shared/data/npcs.js';
import { SPELLS, NODES } from '/shared/data/skills.js';
import { Net } from './net.js';
import { loadManifest, composite, drawChar } from './sprites.js';
import { loadMedia } from './media.js';
import { Renderer, drawMinimap, MM_RANGE } from './renderer.js';
import { Fx } from './fx.js';
import * as UI from './ui.js';

const $ = (s) => document.querySelector(s);

const G = {
  net: new Net(), entities: new Map(), me: null, self: null,
  xp: {}, inv: [], equip: {}, quests: {}, milestones: {}, bal: 0,
  prayersOn: new Set(), cooldowns: {}, tab: 'inv', selSpell: null, selectedSeed: null,
  depletedNodes: new Set(), houseFurniture: {}, style: 'balanced', hoverId: null,
  abilityKeys: [],
};
window.G = G; // debug

const canvas = $('#game');
const R = new Renderer(canvas);
const fx = new Fx();
window.R = R; // debug

// ---------------- login ----------------
async function boot() {
  await Promise.all([loadManifest(), loadMedia()]);
  computeWorld(); // warm map cache before first frame
  // restore last look
  try {
    const saved = JSON.parse(localStorage.getItem('los-look') || '{}');
    if (saved.name) $('#name').value = saved.name;
    for (const k of ['sex', 'skin', 'hairstyle', 'haircolor']) if (saved[k]) $('#' + k).value = saved[k];
  } catch { }
  const pv = $('#preview').getContext('2d');
  pv.imageSmoothingEnabled = false;
  setInterval(() => { // animated preview
    pv.clearRect(0, 0, 128, 128);
    const vis = currentLook();
    const comp = composite(vis);
    const frame = Math.floor(performance.now() / 120) % 9;
    pv.save(); pv.scale(2, 2);
    drawChar(pv, comp, 'walk', 2, frame, 32, 56, 1);
    pv.restore();
  }, 120);
  $('#play').onclick = join;
  $('#name').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
}
function currentLook() {
  return {
    sex: $('#sex').value, skin: $('#skin').value,
    hair: [$('#hairstyle').value, $('#haircolor').value],
    torso: ['longsleeve', 'white'], legs: ['pants', 'brown'], feet: ['boots', 'brown'],
  };
}
async function join() {
  const name = $('#name').value.trim();
  if (name.length < 2) { $('#login-status').textContent = 'Pick a name first, outlaw.'; return; }
  $('#login-status').textContent = 'Connecting…';
  try {
    if (!G.net.connected) await G.net.connect((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  } catch { $('#login-status').textContent = 'Cannot reach the realm. Is the server running?'; return; }
  localStorage.setItem('los-look', JSON.stringify({ name, sex: $('#sex').value, skin: $('#skin').value, hairstyle: $('#hairstyle').value, haircolor: $('#haircolor').value }));
  G.net.send({ t: MSG.HELLO, name, sex: $('#sex').value, skin: $('#skin').value, hair: [$('#hairstyle').value, $('#haircolor').value] });
}

// ---------------- network handlers ----------------
G.net.on(MSG.WELCOME, (m) => {
  G.myId = m.id; G.myName = m.name;
  G.xp = m.xp; G.inv = m.inv; G.equip = m.equip; G.quests = m.quests;
  G.bal = m.bal; G.coinPouch = m.coinPouch || 0; G.milestones = m.milestones || {}; G.style = m.style;
  G.houseFurniture = (m.house && m.house.furniture) || {};
  G.pets = m.pets || []; G.activePet = m.activePet ?? null;
  G.social = m.social || { friends: [], blocked: [], guild: null };
  G.seed = m.seed;
  try { G.muted = !!localStorage.getItem('los_muted'); } catch { }
  $('#login').classList.add('hidden');
  $('#hud').classList.remove('hidden');
  UI.initUI(G);
  $('#map-btn').onclick = () => UI.openWorldMap();
  // click the minimap to walk there (it shows MM_RANGE tiles in each direction)
  $('#minimap').onclick = (e) => {
    if (!G.me || !G.self) return;
    const r = e.target.getBoundingClientRect();
    const sc = e.target.width / (2 * MM_RANGE + 1);
    const dx = (e.clientX - r.left) * (e.target.width / r.width) / sc - MM_RANGE;
    const dy = (e.clientY - r.top) * (e.target.height / r.height) / sc - MM_RANGE;
    const tx = Math.round(G.self.x + dx), ty = Math.round(G.self.y + dy);
    G.net.send({ t: MSG.MOVE, x: tx, y: ty, run: true });
    UI.toast('Heading there…');
  };
  UI.renderAbilities();
  UI.chatLine(`<span class="sys">Welcome to Sherwood, ${m.name}. Robin Hood awaits in Loxley — look for the ❗</span>`);
  UI.updateOrbs();
});
G.net.on('social', (m) => { G.social = m.social || G.social; if (String(G.tab || '').startsWith('sys_')) UI.renderPanel(); });
G.net.on(MSG.SNAP, (m) => {
  const now = performance.now();
  for (const d of m.enter) {
    const e = { ...d, rx: d.x, ry: d.y, px: d.x, py: d.y, tx: d.x, ty: d.y, tUpd: now, animStart: now, plane: undefined };
    G.entities.set(d.id, e);
    if (d.id === G.myId) { G.me = e; }
  }
  for (const u of m.up) {
    const e = G.entities.get(u[0]);
    if (!e) continue;
    // snap on teleport / big jumps rather than sliding across the map
    if (Math.hypot(u[1] - e.rx, u[2] - e.ry) > 6) { e.rx = u[1]; e.ry = u[2]; }
    e.px = e.rx; e.py = e.ry;
    e.tx = u[1]; e.ty = u[2];
    e.dir = u[3];
    if (u[5] !== e.seq || u[4] !== e.anim) { e.animStart = now; }
    e.anim = u[4]; e.seq = u[5];
    if (u[6] >= 0) e.hp = u[6];
    if (u[7]) e.vis = u[7];
    // lerp over the real measured snapshot interval so network jitter
    // doesn't cause freeze-then-jump motion
    e.lerpMs = Math.min(220, Math.max(60, now - e.tUpd));
    e.tUpd = now;
  }
  for (const id of m.leave) { G.entities.delete(id); if (id === G.myId) G.me = null; }
  if (m.self) {
    G.self = m.self;
    if (G.me) {
      G.me.plane = undefined; G.mePlane = m.self.plane;
      // authoritative reconciliation: on a big jump (cross-plane teleport,
      // respawn), snap both the avatar AND the camera to the server position.
      if (Math.hypot(m.self.x - G.me.rx, m.self.y - G.me.ry) > 6) {
        G.me.rx = G.me.px = G.me.tx = m.self.x;
        G.me.ry = G.me.py = G.me.ty = m.self.y;
      }
      if (Math.hypot(m.self.x - R.cam.x, m.self.y - R.cam.y) > 12) {
        R.cam.x = m.self.x; R.cam.y = m.self.y;
      }
    }
    UI.updateOrbs();
  }
});
G.net.on(MSG.MSGBOX, (m) => {
  if (m.kind === 'milestone') { UI.toast(m.m, 'milestone'); UI.chatLine(`<span class="tok">${m.m}</span>`); }
  else if (m.kind === 'level') UI.chatLine(`<span class="lvl">${m.m}</span>`);
  else if (m.kind === 'loot') UI.chatLine(`<span class="sys">+${m.m}</span>`);
  else { UI.toast(m.m); UI.chatLine(`<span class="sys">${m.m}</span>`); }
});
G.net.on(MSG.DIALOGUE, (m) => UI.showDialogue(m));
G.net.on(MSG.FX, (m) => fx.spawn(m, G.entities));
G.net.on(MSG.HIT, (m) => fx.hit(m, G.entities));
G.net.on(MSG.LEVELUP, (m) => { UI.toast(`⬆ ${m.skill} is now level ${m.level}!`); UI.renderAbilities(); if (G.tab === 'skills') UI.renderPanel(); });
G.net.on('xp', (m) => {
  G.xp[m.skill] = m.xp;
  if (G.me) fx.floatText(G.me.rx, G.me.ry, `+${m.gain} ${m.skill}`, '#8fd6ff');
  if (G.tab === 'skills') UI.renderPanel();
});
G.net.on(MSG.TOKEN, (m) => {
  if (m.bal !== undefined) G.bal = m.bal;
  if (m.delta > 0) {
    UI.toast(`+${m.delta} $LoS ${m.risk ? '(in pouch — bank it!)' : ''} — ${m.reason || ''}`, 'milestone');
    UI.chatLine(`<span class="tok">+${m.delta} $LoS (${m.reason || 'earned'})</span>`);
    if (G.me) fx.floatText(G.me.rx, G.me.ry, `+${m.delta} $LoS`, '#ffd75e', true);
  }
  UI.updateOrbs();
});
G.net.on('inv', (m) => { G.inv = m.inv; G.equip = m.equip; if (G.tab === 'inv' || G.tab === 'equip') UI.renderPanel(); });
G.net.on('coinpouch', (m) => { G.coinPouch = m.coins; UI.updateOrbs(); if (G._coinPouchRedraw && !$('#bigwin').classList.contains('hidden')) G._coinPouchRedraw(); });
G.net.on(MSG.DEATH, (m) => {
  const e = G.entities.get(m.id);
  if (e) { e.anim = 'hurt'; e.animStart = performance.now(); e.hp = 0; }
  if (m.id === G.myId) UI.toast('Oh dear, you are dead. You awaken in Loxley…');
});
G.net.on(MSG.RESPAWN, () => UI.toast('You wake by the Loxley square.'));
G.net.on(MSG.EVENT, (m) => { UI.eventBanner(m.m); UI.chatLine(`<span class="tok">${m.m}</span>`); });
G.net.on('ride', (m) => {
  const e = G.entities.get(m.id);
  if (e) { e.mnt = m.mnt || null; e.aura = m.aura || null; }
});
G.net.on('chat', (m) => {
  const e = G.entities.get(m.id);
  if (e) { e.bubble = m.m; e.bubbleUntil = performance.now() + 4500; }
  UI.chatLine(`${m.yell ? '<span class="yell">[yell]</span> ' : ''}<b>${m.name}:</b> ${escapeHtml(m.m)}`);
});
G.net.on('quest', (m) => {
  G.quests[m.id] = G.quests[m.id] || { step: 0, n: 0 };
  G.quests[m.id].step = m.step; G.quests[m.id].n = m.n;
  if (m.hint) UI.toast('📜 ' + m.hint);
  if (G.tab === 'quests') UI.renderPanel();
});
G.net.on('questStart', (m) => { G.quests[m.id] = { step: 0, n: 0 }; UI.toast(`📜 Quest started: ${m.name}`); UI.chatLine(`<span class="sys">${m.intro}</span>`); if (m.hint) UI.toast('📜 ' + m.hint); UI.renderPanel(); });
G.net.on('questDone', (m) => { G.quests[m.id] = { ...(G.quests[m.id] || {}), done: true }; UI.toast(`📜 Quest complete: ${m.name}!`, 'milestone'); UI.chatLine(`<span class="tok">${m.outro}</span>`); if (G.tab === 'quests') UI.renderPanel(); });
G.net.on('duelInvite', (m) => UI.duelInvite(m));
G.net.on('duelStart', (m) => UI.toast(`⚔ Duel vs ${m.vs} — ${m.stake} $LoS staked. Fight begins in 3…`));
G.net.on('ge', (m) => UI.openGE(m));
G.net.on('cooldown', (m) => { G.cooldowns[m.ability] = m.until; });
G.net.on('pets', (m) => { G.pets = m.pets || []; G.activePet = m.activePet ?? null; if (G.tab === 'pets') UI.renderPanel(); });
G.net.on('petXp', (m) => { if (G.pets && G.pets[m.idx]) G.pets[m.idx].xp = m.xp; if (G.tab === 'pets') UI.renderPanel(); });
G.net.on('petLevel', (m) => UI.toast(`🐾 Your ${String(m.id).replace(/_/g, ' ')} reached level ${m.level}!`));
G.net.on(MSG.SELF, (m) => { if (m.prayersOn) { G.prayersOn = new Set(m.prayersOn); if (G.tab === 'prayer') UI.renderPanel(); UI.renderAbilities(); } });
G.net.on('node', (m) => { const k = m.x + ',' + m.y; if (m.off) G.depletedNodes.add(k); else G.depletedNodes.delete(k); });
G.net.on(MSG.INTERFACE, (m) => {
  switch (m.iface) {
    case 'bank': UI.openBank(m.bank); break;
    case 'dungeon': UI.openDungeon(m.best); break;
    case 'house': G.houseFurniture = m.furniture || {}; UI.openHouse(G.houseFurniture); break;
    case 'obelisk': UI.openStation('obelisk', '🗿 Summoning Obelisk'); break;
    case 'bench': UI.openStation('bench', '🏺 Restoration Bench'); break;
    case 'station': UI.openStation(m.station); break;
  }
});
G.net.on('__close', () => { UI.toast('Connection lost — refresh to rejoin.'); });

// ---------------- input ----------------
const keys = {};
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  keys[e.key.toLowerCase()] = true;
  if (e.key === 'Enter') { $('#chat-in').focus(); e.preventDefault(); }
  if (e.key === 'Escape') { UI.closeWin(); UI.hideDialogue(); G.selSpell = null; }
  if (e.key === 'm' || e.key === 'M') G.net.send({ t: 'mount' });
  const n = parseInt(e.key);
  if (n >= 1 && n <= 9) UI.triggerHotbar(n - 1);
});
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
setInterval(() => {
  if (!G.me || document.activeElement === $('#chat-in')) return;
  let vx = 0, vy = 0;
  // screen-relative: W = up-left+up-right in iso => tile -x,-y
  if (keys.w || keys.arrowup) { vx -= 1; vy -= 1; }
  if (keys.s || keys.arrowdown) { vx += 1; vy += 1; }
  if (keys.a || keys.arrowleft) { vx -= 1; vy += 1; }
  if (keys.d || keys.arrowright) { vx += 1; vy -= 1; }
  if (vx || vy) G.net.send({ t: MSG.MOVE, vx, vy, run: !keys.shift });
}, 100);

canvas.addEventListener('mousemove', (e) => {
  G.mouse = { x: e.clientX, y: e.clientY };
  G.hoverId = hitTest(e.clientX, e.clientY)?.id || null;
  canvas.style.cursor = G.hoverId ? 'pointer' : 'default';
});
canvas.addEventListener('click', (e) => {
  UI.hideCtx();
  if (!G.me) return;
  const ent = hitTest(e.clientX, e.clientY);
  if (ent) return clickEntity(ent, e, false);
  clickGround(e, false);
});
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (!G.me) return;
  const ent = hitTest(e.clientX, e.clientY);
  if (ent) return clickEntity(ent, e, true);
  clickGround(e, true);
});

function hitTest(sx, sy) {
  // Elliptical hit regions matched to what's actually drawn: characters are
  // tall sprites standing ABOVE their ground anchor; ground items sit low.
  let best = null, bestScore = 1;
  for (const e of G.entities.values()) {
    if (e.id === G.myId) continue;
    const scale = e.scale || 1;
    const [ex, ey] = R.screenOf(0, e.rx, e.ry);
    const small = e.k === 'item' || e.k === 'shil' || e.k === 'fire';
    const ground = e.k === 'chest' || e.k === 'geode';   // squat ground objects
    const cx = ex, cy = ey - (small ? 8 : ground ? 20 : 28 * scale);   // sprite body centre
    const rx = small ? 14 : ground ? 24 : 18 * Math.max(1, scale);
    const ry = small ? 12 : ground ? 26 : 32 * scale;
    const score = Math.hypot((sx - cx) / rx, (sy - cy) / ry);
    if (score < bestScore) { bestScore = score; best = e; }
  }
  return best;
}
window._hitTest = hitTest; // debug
function clickEntity(ent, e, menu) {
  const send = G.net.send.bind(G.net);
  if (G.selSpell && (ent.k === 'mob' || ent.k === 'player')) {
    send({ t: MSG.CAST, spell: G.selSpell, target: ent.id });
    return;
  }
  const opts = [];
  if (ent.k === 'mob') {
    // farm animals: offer Milk/Shear (when you carry the tool) before Attack
    const farm = MOBS[ent.type]?.farm;
    const hasTool = (t) => (G.inv || []).some(s => s && s.id === t) || Object.values(G.equip || {}).some(e2 => e2 && e2.id === t);
    if (farm?.milk && hasTool('bucket')) opts.push(['🪣 Milk ' + ent.name, () => send({ t: MSG.ACTION, milk: ent.id })]);
    if (farm?.wool && hasTool('shears')) opts.push(['✂ Shear ' + ent.name, () => send({ t: MSG.ACTION, shear: ent.id })]);
    opts.push(['⚔ Attack ' + ent.name, () => send({ t: MSG.ATTACK, id: ent.id })]);
  }
  if (ent.k === 'npc') {
    opts.push(['💬 Talk to ' + ent.name, () => send({ t: MSG.TALK, id: ent.id })]);
    opts.push(['🖐 Pickpocket', () => send({ t: MSG.ACTION, pickpocket: ent.id })]);
  }
  if (ent.k === 'item') {
    // Gather every item on this tile so a pile (e.g. a death drop) can be
    // cherry-picked. Right-click lists them all; left-click grabs the top one.
    const gx = Math.floor(ent.rx), gy = Math.floor(ent.ry);
    const pile = [...G.entities.values()].filter(o => o.k === 'item' && Math.floor(o.rx) === gx && Math.floor(o.ry) === gy);
    if (pile.length > 1) {
      pile.sort((a, b) => (ITEMS[b.item]?.value || 0) * b.qty - (ITEMS[a.item]?.value || 0) * a.qty);
      for (const o of pile) opts.push(['Take ' + (ITEMS[o.item]?.name || o.item) + (o.qty > 1 ? ` ×${o.qty}` : ''), () => send({ t: MSG.PICKUP, id: o.id })]);
      opts.push([`⇊ Take all (${pile.length})`, () => { for (const o of pile) send({ t: MSG.PICKUP, id: o.id }); }]);
    } else {
      opts.push(['Take ' + (ITEMS[ent.item]?.name || ent.item), () => send({ t: MSG.PICKUP, id: ent.id })]);
    }
  }
  if (ent.k === 'shil') opts.push(['✦ Take $LoS', () => send({ t: MSG.PICKUP, id: ent.id })]);
  if (ent.k === 'evbox') opts.push(['Open strongbox', () => send({ t: MSG.ACTION, evbox: ent.id })]);
  if (ent.k === 'chest') opts.push([(ent.locked ? '🔒 Unlock ' : '🧰 Open ') + ent.name, () => send({ t: MSG.ACTION, chest: ent.id })]);
  if (ent.k === 'geode') opts.push([`⛏ Mine ${ent.name}`, () => send({ t: MSG.ACTION, geode: ent.id })]);
  if (ent.k === 'player') {
    const inWild = G.me && G.self && G.self.plane === 0 && G.self.y < WILDERNESS_Y;
    if (inWild) opts.push(['⚔ Attack ' + ent.name, () => send({ t: MSG.ATTACK, id: ent.id })]);
    opts.push(['🏟 Challenge to duel', () => {
      const stake = parseInt(prompt(`Stake in $LoS vs ${ent.name}? (you have ${G.bal})`, '10')) || 0;
      if (stake > 0) send({ t: MSG.DUEL, challenge: ent.name, stake });
    }]);
  }
  if (menu || opts.length > 1 && ent.k === 'player') ctxWithWalk(e, opts, examineEntity(ent));
  else if (opts.length) opts[0][1]();
  else if (menu) ctxWithWalk(e, [], examineEntity(ent));
}
function clickGround(e, menu) {
  const [tx, ty] = R.tileFromScreen(e.clientX, e.clientY);
  const x = Math.floor(tx), y = Math.floor(ty);
  const plane = G.self?.plane ?? 0;
  const send = G.net.send.bind(G.net);
  // node? Check the clicked tile first, then the tiles "in front" (south-east)
  // whose tall sprites — tree canopies, rock tops — visually cover the click.
  let nodeType = null, nodeX = x, nodeY = y;
  if (plane === PLANE.OVERWORLD) {
    const { nodes } = computeWorld();
    for (let k = 0; k <= 2 && !nodeType; k++) {
      const cx2 = x + k, cy2 = y + k;
      const type = nodes.get(cx2 + ',' + cy2);
      if (!type) continue;
      if (k > 0) { // only claim the click if that node's sprite really covers it
        const [ex, ey] = R.screenOf(0, cx2 + 0.5, cy2 + 0.5);
        if (Math.abs(e.clientX - ex) > 40 || e.clientY < ey - 106 || e.clientY > ey + 14) continue;
      }
      nodeType = type; nodeX = cx2; nodeY = cy2;
    }
  } else if (plane >= PLANE.DUNGEON_BASE) {
    const f = dungeonFloor(plane - PLANE.DUNGEON_BASE);
    if (Math.hypot(x - f.entrance.x, y - f.entrance.y) < 2 || Math.hypot(x - f.exit.x, y - f.exit.y) < 2) nodeType = 'dungeon_ladder';
  } else if (plane >= PLANE.HOUSE_BASE) {
    UI.openHouse(G.houseFurniture);
    return;
  }
  const decor = nodeType && DECOR[nodeType];   // town furniture is examine-only
  if (nodeType && !decor && !menu) {
    send({ t: MSG.ACTION, x: nodeX, y: nodeY, seed: G.selectedSeed });
    return;
  }
  if (menu) {
    const opts = [['🚶 Walk here', () => send({ t: MSG.MOVE, x, y, run: false })], ['🏃 Run here', () => send({ t: MSG.MOVE, x, y, run: true })]];
    if (nodeType && !decor) opts.unshift([actionLabel(nodeType), () => send({ t: MSG.ACTION, x: nodeX, y: nodeY, seed: G.selectedSeed })]);
    ctxWithWalk(e, opts, decor || (nodeType ? examineNode(nodeType) : examineTile(x, y)));
    return;
  }
  send({ t: MSG.MOVE, x, y, run: true });
  clickMarker = { x: tx, y: ty, t0: performance.now() };
}
// Every world right-click menu ends with Examine (flavour text) then Cancel.
function ctxWithWalk(e, opts, examine) {
  const full = [...opts];
  if (examine) full.push(['🔍 Examine', () => UI.chatLine(`<span class="sys">${examine}</span>`)]);
  full.push(['✖ Cancel', () => { }]);
  UI.ctxMenu(e.clientX, e.clientY, full);
}
// The node's proper display name — trees gain a trailing "tree" (Oak -> Oak tree).
// Purely decorative town furniture: examine-only, no gather action.
const DECOR = {
  well: 'A stone village well. The water is cold and sweet.',
  fountain: 'A carved fountain — its waters catch the light.',
  lamp_post: 'A wrought-iron lamp, lit against the dark.',
  park_bench: 'A sturdy bench, worn smooth by weary travellers.',
  flower_bed: 'A tended bed of wildflowers brightening the square.',
  barrel: 'A stout oak barrel, hooped and sealed tight.',
  crate: 'A wooden crate of market goods.',
  market_cart: "A trader's cart, its striped awning shading the wares.",
  signpost: 'A weathered signpost pointing the way.',
  hay_bale: 'A bale of sweet-smelling hay.',
  shop_sign: 'A painted trade sign swinging on iron chains.',
  archery_butt: "A straw archery butt on the contest green. The Sheriff's men practise here.",
  // OGA decor pass: waymarks, graves, farmstead clutter and standing stones
  signpost_arrow: 'A carved fingerpost pointing down the road.',
  signpost_board: 'A plank notice-board, its letters long faded.',
  signpost_cross: 'A crossroads waymark, arms flung to the four winds.',
  scarecrow: 'A ragged scarecrow keeping the crows honest.',
  grave_board: 'A humble wooden grave marker. Someone tends it still.',
  grave_slab: 'A moss-eaten grave slab, its name lost to the years.',
  grave_cross: 'A weathered grave cross leaning with the wind.',
  wash_line: 'A washing line strung between posts, linens flapping.',
  wash_line_full: 'A full washing line — someone did the whole household.',
  rocks_grey: 'A tumble of grey boulders.', rocks_dark: 'Dark weathered boulders.',
  rocks_black: 'Coal-black rocks, sharp underfoot.', rocks_sand: 'Sun-baked sandstone boulders.',
  spire_grey: 'Wind-carved stone spires.', spire_dark: 'Jagged dark spires.',
  spire_black: 'Needles of black rock.', spire_sand: 'Sandstone needles rising from the drift.',
  dolmen_grey: 'An ancient dolmen — older than any kingdom.', dolmen_dark: 'A brooding dolmen of dark stone.',
  dolmen_black: 'A black dolmen. The air hums strangely here.', dolmen_sand: 'A sandstone dolmen half-buried in drift.',
  crag_grey: 'A great grey crag.', crag_dark: 'A looming dark crag.',
  crag_black: 'A jagged black crag.', crag_sand: 'A wind-worn sandstone crag.',
};
function nodeDisplayName(type) {
  const n = NODES[type];
  if (!n) return type.replace(/_/g, ' ');
  let name = n.name;
  if (type.includes('tree') && !/tree/i.test(name)) name += ' tree';
  return name;
}
const SKILL_VERB = { woodcutting: ['🪓', 'Chop'], mining: ['⛏', 'Mine'], hunter: ['🪤', 'Trap'], archaeology: ['🗿', 'Excavate'], runecrafting: ['✨', 'Craft runes at'], farming: ['🌱', 'Tend'], agility: ['🤸', 'Traverse'] };
function actionLabel(type) {
  const n = NODES[type];
  if (!n) return '✋ Use';
  const name = nodeDisplayName(type);
  if (type.includes('spot')) { const g = /net/.test(type) ? 'net' : /rod/.test(type) ? 'rod' : 'harpoon'; return `🎣 Fish (${g})`; }
  if (n.stall) return `🖐 Steal from ${name}`;
  if (n.altar || n.rune) return `✨ ${n.rune ? 'Craft runes at' : 'Pray at'} ${name}`;
  if (n.bank) return '🏦 Bank';
  if (n.ge) return '⚖ Exchange';
  if (n.house) return '🏠 Enter house portal';
  if (n.dungeon) return '⚔ Descend the Depths';
  if (n.obelisk) return '✦ Commune with the obelisk';
  if (n.bench) return '🔧 Restore at the bench';
  if (n.patch) return `🌱 Farm the ${name}`;
  if (n.station) return `🔥 Use ${name}`;
  if (n.shortcut) return `🤸 Cross the ${name}`;
  const v = SKILL_VERB[n.skill];
  return v ? `${v[0]} ${v[1]} ${name}` : `✋ Use ${name}`;
}
// Short flavour lines for Examine.
function examineNode(type) {
  const n = NODES[type];
  if (!n) return 'You see nothing of interest.';
  const name = nodeDisplayName(type);
  const req = n.lvl > 1 ? ` It needs ${n.skill} level ${n.lvl}.` : '';
  if (type.includes('tree')) return `${name}. A hatchet will fell it for ${ITEMS[n.yield]?.name || 'logs'}.${req}`;
  if (type.includes('rock')) return `${name}. A pickaxe will chip out ${ITEMS[n.yield]?.name || 'ore'}.${req}`;
  if (type.includes('spot')) return `A shimmer of fish beneath the surface.${req}`;
  if (n.stall) return `${name}. Light fingers could lift its wares.${req}`;
  if (n.altar || n.rune) return `${name}. Rune essence hums with power here.${req}`;
  if (n.station || n.bench) return `${name}. A place to ply an honest craft.`;
  if (n.bank) return 'A bank booth — your goods are safe here.';
  if (n.ge) return 'The Grand Exchange — buy, sell, and cash out $LoS.';
  return `${name}.${req}`;
}
const TILE_DESC = {
  [TILE.OCEAN]: 'The open sea, cold and deep.', [TILE.WATER]: 'A still pool of water.', [TILE.RIVER]: 'Fast-running river water.',
  [TILE.WATER_SWAMP]: 'Stagnant fenwater, dark and reeking.', [TILE.SAND]: 'Soft coastal sand.', [TILE.GRASS]: 'Green grass underfoot.',
  [TILE.MEADOW]: 'A flowering meadow.', [TILE.DIRT]: 'Bare, trodden earth.', [TILE.FOREST]: 'The forest floor.', [TILE.DEEPFOREST]: 'Deep, shadowed woodland.',
  [TILE.SWAMP]: 'Squelching swamp ground.', [TILE.JUNGLE]: 'Dense wildwood undergrowth.', [TILE.ROCK]: 'Bare mountain rock.', [TILE.SCREE]: 'Loose mountain scree.',
  [TILE.TUNDRA]: 'Frozen tundra.', [TILE.SNOW]: 'Deep, crisp snow.', [TILE.ICE]: 'Treacherous ice.', [TILE.ROAD]: 'A well-worn road.', [TILE.BRIDGE]: 'A sturdy bridge across the water.',
  [TILE.FARM]: 'Ploughed farmland.', [TILE.PATH]: 'A neatly cobbled street.',
};
function examineTile(x, y) {
  const t = worldTile(x, y);
  return TILE_DESC[t] || 'You see nothing of interest.';
}
function examineEntity(ent) {
  if (ent.k === 'mob') { const m = MOBS[ent.type]; return `${ent.name}. A level ${ent.lvl} ${m?.aggro ? 'and hostile ' : ''}creature.`; }
  if (ent.k === 'npc') { const d = NPCS[ent.type]; return `${ent.name}. ${d?.tutor ? 'A master worth learning from.' : d?.shop ? 'A trader with wares to sell.' : d?.quest ? 'They seem to have a task in mind.' : 'A soul of Sherwood.'}`; }
  if (ent.k === 'item') { const it = ITEMS[ent.item]; return `${it?.name || ent.item}. ${it?.examine || 'Left lying on the ground.'}`; }
  if (ent.k === 'player') return `${ent.name}. A fellow adventurer${ent.cb ? ` of combat level ${ent.cb}` : ''}.`;
  if (ent.k === 'chest') return `${ent.name}. ${ent.locked ? 'Locked tight — a key or lockpick is needed.' : 'It might hold treasure.'}`;
  if (ent.k === 'geode') return `${ent.name}. Crack it open for gems.`;
  if (ent.k === 'shil') return 'A glint of $LoS on the ground.';
  return 'You see nothing of interest.';
}
let clickMarker = null;

// ---------------- zone label ----------------
function zoneName() {
  if (!G.self) return '';
  const plane = G.self.plane;
  if (plane === PLANE.COLOSSEUM) return '🏟 The Colosseum';
  if (plane >= PLANE.DUNGEON_BASE) return `⚒ Abyssal Depths — Floor ${plane - PLANE.DUNGEON_BASE}`;
  if (plane >= PLANE.HOUSE_BASE) return '🏠 Your Hideout';
  const reg = regionAt(G.self.x | 0, G.self.y | 0);
  const r = REGIONS[reg];
  return r ? (r.pvp ? '☠ ' + r.name + ' — PvP!' : r.name) : '';
}

// ---------------- main loop ----------------
function loop() {
  // rAF pauses in hidden tabs; fall back to timers so the world keeps ticking
  if (document.hidden) setTimeout(loop, 100);
  else requestAnimationFrame(loop);
  const now = performance.now();
  // interpolate entities over each one's measured snapshot interval
  for (const e of G.entities.values()) {
    const t = Math.min(1, (now - e.tUpd) / (e.lerpMs || 100));
    e.rx = e.px + (e.tx - e.px) * t;
    e.ry = e.py + (e.ty - e.py) * t;
  }
  R._ents = G.entities;
  if (G.me && G.self) {
    G.me.plane = undefined;
    R.draw({ entities: G.entities, me: Object.assign(G.me, { plane: G.self.plane }), fx, now, depletedNodes: G.depletedNodes, houseFurniture: G.houseFurniture, hoverId: G.hoverId });
    // click marker
    if (clickMarker && now - clickMarker.t0 < 600) {
      const [sx, sy] = R.screenOf(0, clickMarker.x, clickMarker.y);
      const t = (now - clickMarker.t0) / 600;
      R.ctx.strokeStyle = `rgba(255,231,122,${1 - t})`;
      R.ctx.lineWidth = 2;
      R.ctx.beginPath(); R.ctx.ellipse(sx, sy, 16 * (1 - t) + 4, 8 * (1 - t) + 2, 0, 0, 7); R.ctx.stroke();
    }
    $('#zone-name').textContent = zoneName();
    if (now - (G._mm || 0) > 400) { drawMinimap($('#minimap'), Object.assign(G.me, { plane: G.self.plane }), G.entities); G._mm = now; }
    UI.tickCooldowns();
  }
}

boot().then(() => loop());
function escapeHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

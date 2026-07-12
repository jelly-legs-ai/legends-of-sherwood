// All client->server message handling: login, movement, combat commands,
// every skill interaction, dialogue/quests/shops, bank, GE, duels, dungeons,
// housing, events, chat.

import { MSG, PLANE, FX, SHILLING, WILDERNESS_Y, COLOSSEUM, XP_TABLE, WORLD, COMBAT } from '../../shared/constants.js';
import { ITEMS } from '../../shared/data/items.js';
import { NODES, RECIPES, SPELLS, PRAYERS, ABILITIES, FAMILIARS, DUNGEON, FURNITURE } from '../../shared/data/skills.js';
import { MOBS } from '../../shared/data/mobs.js';
import { NPCS } from '../../shared/data/npcs.js';
import { QUESTS, TASKS } from '../../shared/data/quests.js';
import { CROPS } from '../../shared/data/items.js';
import { SHORTCUTS, ANCHORS, ARENA, HOUSE } from '../../shared/data/world.js';
import { computeWorld, isBlocked, dungeonFloor } from '../../shared/mapgen.js';
import { Player } from './player.js';
import { castSpellAt, useAbility, pvpAllowed } from './combat.js';
import { GrandExchange } from './economy.js';

const RECIPE_BY_ID = Object.fromEntries(RECIPES.map(r => [r.id, r]));

export function installHooks(world) {
  world.ge = new GrandExchange(world);
  world.duelDeath = (p) => duelEnd(world, p, 'death');
}

export function handleMessage(world, ws, msg) {
  if (!world.ge) installHooks(world);
  if (msg.t === MSG.HELLO) return onHello(world, ws, msg);
  const p = ws.player;
  if (!p || p.hp <= 0 && msg.t !== MSG.CHAT) return;
  switch (msg.t) {
    case MSG.MOVE: return onMove(world, p, msg);
    case MSG.STOP: p.path = null; p.vel = null; return;
    case MSG.ATTACK: return onAttack(world, p, msg);
    case MSG.ACTION: return onAction(world, p, msg);
    case MSG.MAKE: return onMake(world, p, msg);
    case MSG.TALK: return onTalk(world, p, msg);
    case MSG.DIALOG: return onDialog(world, p, msg);
    case MSG.EQUIP: return p.equipItem(msg.slot | 0);
    case MSG.UNEQUIP: return p.addItemFromEquip(String(msg.slot)) && p.invDirty();
    case MSG.DROP: return onDrop(world, p, msg);
    case MSG.PICKUP: return onPickup(world, p, msg);
    case MSG.EAT: return onEat(world, p, msg);
    case MSG.USE_ITEM: return onUse(world, p, msg);
    case MSG.BURY: return onBury(world, p, msg);
    case MSG.CAST: return onCast(world, p, msg);
    case MSG.PRAYER: return onPrayer(world, p, msg);
    case MSG.ABILITY: return useAbility(world, p, String(msg.id));
    case MSG.STYLE: if (['balanced', 'accurate', 'aggressive', 'defensive'].includes(msg.style)) p.style = msg.style; return;
    case MSG.GE: return onGE(world, p, msg);
    case MSG.DUEL: return onDuel(world, p, msg);
    case MSG.BANK: return onBank(world, p, msg);
    case MSG.QUEST: return onQuest(world, p, msg);
    case MSG.DUNGEON: return onDungeon(world, p, msg);
    case MSG.SUMMON: return onSummon(world, p, msg);
    case MSG.HOUSE: return onHouse(world, p, msg);
    case MSG.CHAT: return onChat(world, p, msg);
    case MSG.EMOTE: p.anim = 'spellcast'; p.animSeq++; return;
    case 'pet': return onPet(world, p, msg);
    case 'devgrant': if (process.argv.includes('--dev')) {
      if (msg.item && ITEMS[msg.item]) p.addItem(String(msg.item), Math.max(1, msg.qty | 0));
      if (msg.amt) { world.ledger.mint(p.name, msg.amt | 0, 'dev'); world.send(p, { t: MSG.TOKEN, bal: world.ledger.balance(p.name), delta: msg.amt | 0, reason: 'dev grant' }); }
      if (msg.xp && msg.xp.skill) p.addXp(String(msg.xp.skill), Math.max(0, msg.xp.amount | 0));
      if (msg.tp) {
        p.plane = msg.tp.plane ?? PLANE.OVERWORLD;
        p.x = (msg.tp.x | 0) + 0.5; p.y = (msg.tp.y | 0) + 0.5;
        p.path = null; p.target = null; world.gridMove(p);
        world.send(p, { t: MSG.RESPAWN, x: p.x, y: p.y });
      }
      if (msg.find) { // teleport to the nearest entity of a kind/type
        let best = null, bd = 1e9;
        for (const e of world.entities.values()) {
          if (e.kind !== msg.find && e.type !== msg.find) continue;
          const d = Math.hypot(e.x - p.x, e.y - p.y) + (e.plane !== p.plane ? 5000 : 0);
          if (d < bd) { bd = d; best = e; }
        }
        if (best) {
          p.plane = best.plane; p.x = best.x + 1.5; p.y = best.y + 1.5;
          p.path = null; p.target = null; world.gridMove(p);
          world.send(p, { t: MSG.RESPAWN, x: p.x, y: p.y });
        } else world.send(p, { t: MSG.MSGBOX, m: `dev: no entity '${msg.find}' found` });
      }
    } return;
  }
}

export function onDisconnect(world, ws) {
  const p = ws.player;
  if (!p) return;
  if (p.duelId) duelEnd(world, p, 'forfeit');
  world.players.delete(p.name);
  world.sockets.delete(p.id);
  if (p.familiar) { const f = world.entities.get(p.familiar); if (f) world.removeEntity(f); }
  if (p.activePetEnt) { const pe = world.entities.get(p.activePetEnt); if (pe) world.removeEntity(pe); p.activePetEnt = null; }
  world.removeEntity(p);
  // durably persist this player's final state immediately, then flush ledger/meta
  world.persistPlayer(p).then(() => world.ledger.save()).catch(e => console.error('logout save', e.message));
}

// ---------------- login ----------------
function onHello(world, ws, msg) {
  const name = String(msg.name || '').trim().slice(0, 16).replace(/[^\w \-]/g, '');
  if (name.length < 2) return ws.send(JSON.stringify({ t: MSG.MSGBOX, m: 'Pick a name (2-16 letters).' }));
  const existing = world.players.get(name);
  if (existing) { // reconnect takes over the old session
    const oldWs = world.sockets.get(existing.id);
    if (oldWs && oldWs !== ws) try { oldWs.close(); } catch { }
    world.sockets.set(existing.id, ws);
    ws.player = existing;
    return sendWelcome(world, existing);
  }
  const isNew = !world.saved[name];
  const p = new Player(world, name, world.saved[name], { sex: msg.sex, skin: msg.skin, hair: msg.hair });
  if (isBlocked(p.plane, p.x | 0, p.y | 0)) { p.x = COMBAT.PLAYER_RESPAWN.x + 0.5; p.y = COMBAT.PLAYER_RESPAWN.y + 0.5; }
  world.addEntity(p);
  world.players.set(name, p);
  world.sockets.set(p.id, ws);
  ws.player = p;
  delete world.saved[name]; // now online; authoritative copy is the live Player
  if (isNew) {
    p.addItem('bread', 3); p.addItem('coins', 25);
    p.equip.torso = { id: 'peasant_shirt', qty: 1 };
    p.equip.legs = { id: 'peasant_trousers', qty: 1 };
    p.equip.feet = { id: 'leather_boots', qty: 1 };
    p.quests.a_legend_begins = { step: 0, n: 0 };
    const q = QUESTS.a_legend_begins;
    for (const [id, qty] of Object.entries(q.steps[0].give || {})) p.addItem(id, qty);
  }
  sendWelcome(world, p);
  world.announce(`${p.name} has entered Sherwood.`);
}
function sendWelcome(world, p) {
  world.send(p, {
    t: MSG.WELCOME, id: p.id, name: p.name, seed: world.seed,
    xp: p.xp, inv: p.inv, equip: p.equip, quests: p.quests, style: p.style,
    bal: world.ledger.balance(p.name), pouch: p.pouch, sex: p.sex, skin: p.skin, hair: p.hair,
    milestones: p.milestonesPaid, dungeonBest: p.dungeonBest, house: p.house, task: p.task,
    pets: p.pets, activePet: p.activePet,
    x: p.x, y: p.y, plane: p.plane,
  });
  // respawn the active pet on (re)connect
  if (p.activePet !== null && p.pets[p.activePet] && !p.activePetEnt) world.spawnPet(p, p.activePet);
}

// ---------------- movement ----------------
function onMove(world, p, msg) {
  if (msg.vx !== undefined) { // steering (WASD / joystick)
    const L = Math.hypot(msg.vx, msg.vy) || 1;
    p.vel = { x: msg.vx / L, y: msg.vy / L };
    p.velT = Date.now();
    p.run = !!msg.run;
    p.pendingAction = null;
    return;
  }
  const tx = Math.max(0, Math.min(WORLD.W - 1, msg.x | 0)), ty = Math.max(0, Math.min(WORLD.H - 1, msg.y | 0));
  p.run = !!msg.run;
  p.vel = null;
  p.pendingAction = null;
  p.path = findPath(p.plane, p.x | 0, p.y | 0, tx, ty);
  p.target = null;
  p.action = null;
}

// Bounded A* over a 56x56 window; falls back to straight-line.
export function findPath(plane, sx, sy, tx, ty) {
  if (isBlocked(plane, tx, ty)) {
    // aim at the nearest walkable neighbour instead
    let ok = null;
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]])
      if (!isBlocked(plane, tx + dx, ty + dy)) { ok = [tx + dx, ty + dy]; break; }
    if (!ok) return null;
    tx = ok[0]; ty = ok[1];
  }
  const R = 44;
  if (Math.abs(tx - sx) > R || Math.abs(ty - sy) > R) return [{ x: tx, y: ty }]; // long hauls steer straight
  const x0 = Math.min(sx, tx) - 10, y0 = Math.min(sy, ty) - 10;
  const w = Math.abs(tx - sx) + 21, h = Math.abs(ty - sy) + 21;
  const key = (x, y) => (y - y0) * w + (x - x0);
  const open = [{ x: sx, y: sy, g: 0, f: 0 }];
  const came = new Map(), gs = new Map([[key(sx, sy), 0]]), closed = new Set();
  let found = false;
  let guard = 0;
  while (open.length && guard++ < 20000) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open[bi];
    open[bi] = open[open.length - 1]; open.pop();
    const ck = key(cur.x, cur.y);
    if (closed.has(ck)) continue;
    closed.add(ck);
    if (cur.x === tx && cur.y === ty) { found = true; break; }
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (nx < x0 || ny < y0 || nx >= x0 + w || ny >= y0 + h) continue;
      const k = key(nx, ny);
      if (closed.has(k)) continue;
      if (isBlocked(plane, nx, ny)) continue;
      if (dx && dy && (isBlocked(plane, cur.x + dx, cur.y) || isBlocked(plane, cur.x, cur.y + dy))) continue;
      const g = gs.get(ck) + (dx && dy ? 1.41 : 1);
      if (g < (gs.get(k) ?? Infinity)) {
        gs.set(k, g);
        came.set(k, cur);
        open.push({ x: nx, y: ny, g, f: g + Math.hypot(tx - nx, ty - ny) });
      }
    }
  }
  if (!found) return [{ x: tx, y: ty }];
  const path = [];
  let cur = { x: tx, y: ty };
  while (cur && !(cur.x === sx && cur.y === sy)) { path.unshift({ x: cur.x, y: cur.y }); cur = came.get(key(cur.x, cur.y)); }
  return smoothPath(plane, sx, sy, path);
}

// String-pulling: collapse A* staircase zigzags into straight runs wherever the
// direct line between waypoints stays walkable (with body clearance). Diagonal
// travel becomes one smooth segment with a stable facing instead of tile-by-tile
// direction flips.
function smoothPath(plane, sx, sy, path) {
  if (!path || path.length < 3) return path;
  const pts = [{ x: sx, y: sy }, ...path];
  const out = [];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !lineWalkable(plane, pts[i].x + 0.5, pts[i].y + 0.5, pts[j].x + 0.5, pts[j].y + 0.5)) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}
function lineWalkable(plane, x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(d * 4));
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    // sample with ~0.3-tile clearance so smoothed paths never hug corners
    if (isBlocked(plane, x | 0, y | 0)) return false;
    if (isBlocked(plane, (x + 0.3) | 0, y | 0) || isBlocked(plane, (x - 0.3) | 0, y | 0)) return false;
    if (isBlocked(plane, x | 0, (y + 0.3) | 0) || isBlocked(plane, x | 0, (y - 0.3) | 0)) return false;
  }
  return true;
}

// ---------------- combat ----------------
function onAttack(world, p, msg) {
  const t = world.entities.get(msg.id | 0);
  if (!t || t.hp === undefined || t.hp <= 0) return;
  if (t.kind === 'npc') return;
  if (t.kind === 'player') {
    if (!pvpAllowed(world, p, t)) return world.send(p, { t: MSG.MSGBOX, m: 'You may only fight players in the Wild Lands or the Colosseum.' });
  }
  p.target = t.id;
  p.action = null;
  p.pendingAction = null;
}

// ---------------- generic node interactions ----------------
function nodeAtTile(world, x, y) {
  const { nodes } = computeWorld();
  return nodes.get((x | 0) + ',' + (y | 0)) || null;
}
function near(p, x, y, r = 1.9) { return Math.hypot(p.x - (x + 0.5), p.y - (y + 0.5)) <= r; }
function walkThen(world, p, x, y, fn) {
  if (near(p, x, y)) return fn();
  p.path = findPath(p.plane, p.x | 0, p.y | 0, x, y);
  const until = Date.now() + 10000;
  p.pendingAction = (now) => {
    if (now > until) { p.pendingAction = null; return; }
    if (near(p, x, y)) { p.pendingAction = null; p.path = null; fn(); }
  };
}

function onAction(world, p, msg) {
  p.target = null; // interacting with the world stops fighting
  if (msg.pickpocket) return pickpocket(world, p, msg.pickpocket | 0);
  if (msg.evbox) return openEventBox(world, p, msg.evbox | 0);
  if (msg.geode) return mineGeode(world, p, msg.geode | 0);
  if (msg.chest) return openChestEnt(world, p, msg.chest | 0);
  const x = msg.x | 0, y = msg.y | 0;
  // dungeon exit ladder
  if (p.plane >= PLANE.DUNGEON_BASE) return dungeonAction(world, p, x, y, msg);
  if (p.plane >= PLANE.HOUSE_BASE) return; // house build via HOUSE msg
  if (p.plane === PLANE.COLOSSEUM) return;
  const type = nodeAtTile(world, x, y);
  if (!type) return;
  const node = NODES[type];
  if (!node) return;
  walkThen(world, p, x, y, () => doNode(world, p, type, node, x, y, msg));
}

function doNode(world, p, type, node, x, y, msg) {
  const now = Date.now();
  p.dir = Math.abs(x + 0.5 - p.x) > Math.abs(y + 0.5 - p.y) ? (x + 0.5 > p.x ? 3 : 1) : (y + 0.5 > p.y ? 2 : 0);
  // --- special stations ---
  if (node.bank) return openBank(world, p);
  if (node.ge) return world.ge.sync(p);
  if (node.altar) { p.prayerPts = p.level('prayer'); world.fx(p.plane, p.x, p.y, FX.HOLYBOLT, { id: p.id }); world.send(p, { t: MSG.MSGBOX, m: 'You feel renewed faith.' }); p.questProgress('node', type); return; }
  if (node.house) return enterHouse(world, p);
  if (node.dungeon) return world.send(p, { t: MSG.INTERFACE, iface: 'dungeon', best: p.dungeonBest, req: DUNGEON.floorReq, max: DUNGEON.MAX_FLOOR });
  if (node.obelisk) return world.send(p, { t: MSG.INTERFACE, iface: 'obelisk' });
  if (node.bench) return world.send(p, { t: MSG.INTERFACE, iface: 'bench' });
  if (node.station) return world.send(p, { t: MSG.INTERFACE, iface: 'station', station: node.station });
  if (node.rune) return runecraft(world, p, type, node);
  if (node.patch) return farmPatch(world, p, type, node, x, y, msg);
  if (node.shortcut) return useShortcut(world, p, type, node, x, y);
  if (type === 'archery_butt') return archeryShot(world, p, x, y);

  // --- gathering / stalls ---
  if (world.isDepleted(x, y)) return world.send(p, { t: MSG.MSGBOX, m: 'Nothing left here — give it a moment.' });
  const lvl = p.level(node.skill);
  if (lvl < node.lvl) return world.send(p, { t: MSG.MSGBOX, m: `You need ${node.skill} level ${node.lvl}.` });
  if (node.tool && !p.hasTool(node.tool)) return world.send(p, { t: MSG.MSGBOX, m: `You need a ${node.tool.replace(/_/g, ' ')}.` });
  if (p.freeSlots() === 0 && !node.stall) return world.send(p, { t: MSG.MSGBOX, m: 'Your pack is full.' });

  const interval = node.stall ? 1500 : 2200;
  p.action = {
    type, x, y, next: now + interval,
    step: (nw) => {
      if (!near(p, x, y, 2.2) || world.isDepleted(x, y)) { p.action = null; p.anim = 'idle'; return; }
      p.anim = node.anim || 'thrust'; p.animSeq++;
      world.fx(p.plane, x + 0.5, y + 0.5, FX[node.fx] || FX.SPARK, {});
      p.action.next = nw + interval;
      const L = p.level(node.skill);
      const chance = Math.min(0.95, 0.45 + (L - node.lvl) * 0.013);
      if (Math.random() > chance) {
        if (node.stall) { // caught!
          const dmg = 1 + (Math.random() * 3 | 0);
          p.hp = Math.max(1, p.hp - dmg);
          world.broadcastNear(p.plane, p.x, p.y, { t: MSG.HIT, id: p.id, dmg, src: 0 });
          world.send(p, { t: MSG.MSGBOX, m: 'A guard clips your ear! You stumble back.' });
          p.action = null; p.anim = 'idle';
        }
        return;
      }
      // success
      let itemId = node.yield, xp = node.xp;
      if (node.table) {
        const options = node.table.filter(([, req]) => L >= req);
        const pick = options[Math.random() * options.length | 0];
        itemId = pick[0]; xp = pick[2];
      }
      if (p.freeSlots() === 0 && !ITEMS[itemId]?.stack) { world.send(p, { t: MSG.MSGBOX, m: 'Your pack is full.' }); p.action = null; return; }
      p.addItem(itemId, 1);
      p.addXp(node.skill, xp);
      p.questProgress('node', type);
      // extra rolls
      if (node.gem && Math.random() < node.gem) { p.addItem(['sapphire', 'emerald', 'ruby', 'diamond'][Math.random() * 4 | 0], 1); world.send(p, { t: MSG.MSGBOX, m: 'You uncover a gem!' }); }
      if (node.rare && Math.random() < node.rare[1]) { p.addItem(node.rare[0], 1); world.announce(`⚔ Unbelievable! ${p.name} fished up ${ITEMS[node.rare[0]].name}!`); }
      if (node.skill === 'fishing' && Math.random() < 1 / 4000) { world.dropShillings(p.plane, p.x, p.y, 1, p.id); world.send(p, { t: MSG.MSGBOX, m: 'Something glints in the net — a $Shilling!' }); }
      // deplete?
      const stay = node.multi && Math.random() < node.multi;
      if (!stay && node.respawnMs > 1) { world.deplete(x, y, node.respawnMs); p.action = null; p.anim = 'idle'; }
    },
  };
}

function runecraft(world, p, type, node) {
  if (p.level('runecrafting') < node.lvl) return world.send(p, { t: MSG.MSGBOX, m: `You need runecrafting ${node.lvl}.` });
  const ess = p.countItem('rune_essence');
  if (!ess) return world.send(p, { t: MSG.MSGBOX, m: 'You have no rune essence.' });
  p.removeItem('rune_essence', ess);
  const mult = 1 + Math.floor(Math.max(0, p.level('runecrafting') - node.lvl) / 20);
  p.addItem(node.rune, ess * mult);
  p.addXp('runecrafting', node.xp * ess);
  p.anim = 'spellcast'; p.animSeq++;
  world.fx(p.plane, p.x, p.y, FX.RUNE, { id: p.id });
  p.questProgress('node', type);
}

function farmPatch(world, p, type, node, x, y, msg) {
  const key = x + ',' + y;
  const st = p.farm[key];
  const now = Date.now();
  if (st) {
    const crop = CROPS.find(c => c.id === st.crop);
    if (now - st.t0 >= crop.growMs) {
      delete p.farm[key];
      const yieldId = crop.herb ? `grimy_${crop.herb}` : crop.id;
      p.addItem(yieldId, crop.yield);
      p.addXp('farming', crop.xp);
      p.anim = 'thrust'; p.animSeq++;
      world.fx(p.plane, x + 0.5, y + 0.5, FX.NATURE, {});
      world.send(p, { t: MSG.MSGBOX, m: `You harvest ${crop.yield} × ${ITEMS[yieldId].name}.` });
      p.questProgress('node', type);
    } else world.send(p, { t: MSG.MSGBOX, m: `Still growing… ${Math.ceil((crop.growMs - (now - st.t0)) / 1000)}s to go.` });
    return;
  }
  // plant: pick the seed (client passes seed id, else first seed found)
  const seedId = msg.seed || (p.inv.find(s => s && s.id.endsWith('_seed')) || {}).id;
  const crop = CROPS.find(c => c.seed === seedId);
  if (!crop) return world.send(p, { t: MSG.MSGBOX, m: 'You need seeds to plant here.' });
  if (node.patch === 'herb' && !crop.herb) return world.send(p, { t: MSG.MSGBOX, m: 'This patch is for herbs.' });
  if (node.patch === 'allotment' && crop.herb) return world.send(p, { t: MSG.MSGBOX, m: 'Herbs go in the herb patch.' });
  if (p.level('farming') < crop.lvl) return world.send(p, { t: MSG.MSGBOX, m: `You need farming ${crop.lvl}.` });
  if (!p.removeItem(seedId, 1)) return;
  p.farm[key] = { crop: crop.id, t0: now };
  p.anim = 'thrust'; p.animSeq++;
  world.fx(p.plane, x + 0.5, y + 0.5, FX.NATURE, {});
  world.send(p, { t: MSG.MSGBOX, m: `You plant ${ITEMS[seedId].name}. (${crop.growMs / 1000}s)` });
  p.addXp('farming', Math.ceil(crop.xp * 0.3));
}

function useShortcut(world, p, type, node, x, y) {
  if (p.level('agility') < node.lvl) return world.send(p, { t: MSG.MSGBOX, m: `You need agility ${node.lvl}.` });
  const sc = SHORTCUTS.find(s => s[0] === type && ((s[1] === x && s[2] === y) || (s[3] === x && s[4] === y)));
  if (!sc) return;
  const [, x1, y1, x2, y2] = sc;
  const dest = (x === x1 && y === y1) ? { x: x2, y: y2 } : { x: x1, y: y1 };
  p.anim = 'walk'; p.animSeq++;
  world.fx(p.plane, x + 0.5, y + 0.5, FX.SPARK, {});
  setTimeout(() => {
    p.x = dest.x + 0.5; p.y = dest.y + 0.5; p.path = null;
    world.gridMove(p);
    p.addXp('agility', node.xp);
    world.fx(p.plane, p.x, p.y, FX.SPARK, { id: p.id });
  }, 900);
}

function pickpocket(world, p, npcEntId) {
  const e = world.entities.get(npcEntId);
  if (!e || e.kind !== 'npc') return;
  const def = NPCS[e.type];
  if (!def?.pickpocket) return world.send(p, { t: MSG.MSGBOX, m: 'They have nothing worth taking.' });
  if (Math.hypot(e.x - p.x, e.y - p.y) > 2) return walkThen(world, p, e.x | 0, e.y | 0, () => pickpocket(world, p, npcEntId));
  const pk = def.pickpocket;
  if (p.level('thieving') < pk.lvl) return world.send(p, { t: MSG.MSGBOX, m: `You need thieving ${pk.lvl}.` });
  const now = Date.now();
  if (now - (p.lastSteal || 0) < 1500) return;
  p.lastSteal = now;
  p.anim = 'spellcast'; p.animSeq++;
  const chance = Math.min(0.95, 0.55 + (p.level('thieving') - pk.lvl) * 0.012);
  if (Math.random() > chance) {
    const dmg = 1 + (Math.random() * 3 | 0);
    p.hp = Math.max(1, p.hp - dmg);
    world.broadcastNear(p.plane, p.x, p.y, { t: MSG.HIT, id: p.id, dmg, src: e.id });
    world.fx(p.plane, p.x, p.y, FX.STUN, { id: p.id });
    return world.send(p, { t: MSG.MSGBOX, m: `${def.name} catches your hand! "Oi!"` });
  }
  for (const [item, q, ch] of pk.loot) {
    if (ch !== undefined && Math.random() > ch) continue;
    const qty = Array.isArray(q) ? q[0] + (Math.random() * (q[1] - q[0] + 1) | 0) : q;
    p.addItem(item, qty);
  }
  p.addXp('thieving', pk.xp);
  world.fx(p.plane, p.x, p.y, FX.SPARK, { id: p.id });
}

function archeryShot(world, p, x, y) {
  const st = world.eventState.archery_contest;
  const w = ITEMS[p.equip.weapon?.id];
  if (!w || w.style !== 'ranged') return world.send(p, { t: MSG.MSGBOX, m: 'You need a bow for the butts.' });
  if (!p.equip.ammo) return world.send(p, { t: MSG.MSGBOX, m: 'You need arrows.' });
  p.equip.ammo.qty--; if (p.equip.ammo.qty <= 0) delete p.equip.ammo;
  p.invDirty();
  p.anim = 'shoot'; p.animSeq++;
  world.fx(p.plane, p.x, p.y, FX.ARROW, { tx: x + 0.5, ty: y + 0.5, from: p.id });
  p.addXp('ranged', 15);
  if (st?.active) {
    const claimed = st.claims.get(p.name) || 0;
    if (claimed < 5 && Math.random() < 0.2) {
      st.claims.set(p.name, claimed + 1);
      world.earn(p, 1, 'event:archery');
    }
  }
}

function openEventBox(world, p, id) {
  const e = world.entities.get(id);
  if (!e || e.kind !== 'evbox') return;
  if (Math.hypot(e.x - p.x, e.y - p.y) > 2.2) return walkThen(world, p, e.x | 0, e.y | 0, () => openEventBox(world, p, id));
  const st = world.eventState.convoy;
  if (!st?.active) return;
  // guards must be dealt with first
  if ((st.ents || []).some(g => world.entities.has(g.id) && g.hp > 0 && Math.hypot(g.x - e.x, g.y - e.y) < 8)) {
    return world.send(p, { t: MSG.MSGBOX, m: 'The convoy guards block your way!' });
  }
  if (st.claims.get(p.name)) return world.send(p, { t: MSG.MSGBOX, m: 'You already claimed your share.' });
  st.claims.set(p.name, 1);
  const amt = SHILLING.EVENT_PAYOUT_BASE + (Math.random() * 4 | 0);
  world.earn(p, amt, 'event:convoy');
  world.fx(p.plane, e.x, e.y, FX.SHILLING, {});
  world.send(p, { t: MSG.MSGBOX, m: `You pry open the strongbox — ${amt} $SHL!` });
}

// Wandering gem geodes: high-level mining nodes that yield gems per swing.
function mineGeode(world, p, id) {
  const e = world.entities.get(id);
  if (!e || e.kind !== 'geode') return;
  if (Math.hypot(e.x - p.x, e.y - p.y) > 2.2) return walkThen(world, p, e.x | 0, e.y | 0, () => mineGeode(world, p, id));
  const lvl = p.level('mining');
  if (lvl < e.lvl) return world.send(p, { t: MSG.MSGBOX, m: `This ${e.gem} geode needs mining level ${e.lvl}.` });
  if (!p.hasTool('pickaxe')) return world.send(p, { t: MSG.MSGBOX, m: 'You need a pickaxe.' });
  if (p.freeSlots() === 0) return world.send(p, { t: MSG.MSGBOX, m: 'Your pack is full.' });
  const now = Date.now();
  p.action = {
    type: 'geode', next: now + 2200,
    step: (nw) => {
      if (!world.entities.has(e.id) || Math.hypot(e.x - p.x, e.y - p.y) > 2.4) { p.action = null; p.anim = 'idle'; return; }
      p.anim = 'slash'; p.animSeq++;
      p.dir = Math.abs(e.x - p.x) > Math.abs(e.y - p.y) ? (e.x > p.x ? 3 : 1) : (e.y > p.y ? 2 : 0);
      world.fx(p.plane, e.x, e.y, FX.MINE, {});
      p.action.next = nw + 2200;
      const chance = Math.min(0.9, 0.4 + (p.level('mining') - e.lvl) * 0.02);
      if (Math.random() > chance) return;
      p.addItem(e.gem, 1);
      p.addXp('mining', 120 + e.lvl * 3);
      world.send(p, { t: MSG.MSGBOX, kind: 'loot', m: `You chip a ${e.gem} from the geode!` });
      p.questProgress('mine', e.gem);
      if (--e.charges <= 0) {
        world.send(p, { t: MSG.MSGBOX, m: 'The geode crumbles and sinks back into the earth.' });
        world.depleteGeode(e);
        p.action = null; p.anim = 'idle';
      }
    },
  };
}

// Treasure chests: walk over, open, loot bursts out (ornate ones need a key).
function openChestEnt(world, p, id) {
  const e = world.entities.get(id);
  if (!e || e.kind !== 'chest' || e.opened) return;
  if (Math.hypot(e.x - p.x, e.y - p.y) > 2.0) return walkThen(world, p, e.x | 0, e.y | 0, () => openChestEnt(world, p, id));
  if (e.locked) {
    if (p.countItem('dungeon_key') < 1) return world.send(p, { t: MSG.MSGBOX, m: 'This ornate chest is locked tight — it needs an Abyssal key.' });
    p.removeItem('dungeon_key', 1);
  }
  p.anim = 'thrust'; p.animSeq++;
  world.fx(p.plane, e.x, e.y, FX.SPARK, {});
  world.openChest(e, p);
}

// ---------------- crafting / production ----------------
function stationNearby(world, p, station) {
  if (!station) return true;
  if (p.plane >= PLANE.HOUSE_BASE && p.plane < PLANE.DUNGEON_BASE) {
    const f = p.house.furniture;
    if (station === 'fire' || station === 'range') return !!f.stone_range;
    if (station === 'anvil' || station === 'furnace') return !!f.workbench;
    if (station === 'house') return true;
    return false;
  }
  const { nodes } = computeWorld();
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const type = nodes.get(((p.x | 0) + dx) + ',' + ((p.y | 0) + dy));
    if (!type) continue;
    if (type === station) return true;
    if (station === 'fire' && (type === 'campfire' || type === 'range')) return true;
    if (station === 'range' && type === 'range') return true;
    if (station === 'bench' && type === 'museum_bench') return true;
    if (station === 'obelisk' && type === 'obelisk') return true;
  }
  // player-lit campfires are entities
  if (station === 'fire') for (const e of world.near(p.plane, p.x, p.y, 2.5)) if (e.kind === 'fire') return true;
  return false;
}

function onMake(world, p, msg) {
  const r = RECIPE_BY_ID[String(msg.recipe)];
  if (!r) return;
  p.target = null;
  let count = Math.max(1, Math.min(28, msg.count | 0 || 1));
  if (p.level(r.skill) < r.lvl) return world.send(p, { t: MSG.MSGBOX, m: `You need ${r.skill} level ${r.lvl}.` });
  if (!stationNearby(world, p, r.station)) return world.send(p, { t: MSG.MSGBOX, m: `You must be at a ${r.station === 'fire' ? 'fire or range' : r.station}.` });
  if (r.tool && !p.hasTool(r.tool)) return world.send(p, { t: MSG.MSGBOX, m: `You need a ${r.tool}.` });
  const step = () => {
    for (const [id, q] of Object.entries(r.inputs)) {
      const need = q === 0 ? 1 : q; // qty 0 = "must be carried"
      if (p.countItem(id) < need && !(q === 0 && p.hasTool(ITEMS[id]?.tool))) { world.send(p, { t: MSG.MSGBOX, m: `You need ${ITEMS[id]?.name || id}.` }); p.action = null; return; }
    }
    for (const [id, q] of Object.entries(r.inputs)) if (q > 0) p.removeItem(id, q);
    let xp = r.xp;
    if (r.burnable) {
      const burnChance = Math.max(0, 0.34 - (p.level('cooking') - r.lvl) * 0.02);
      if (Math.random() < burnChance) {
        p.addItem(r.burnable, 1);
        world.send(p, { t: MSG.MSGBOX, m: 'You accidentally burn it!' });
        xp = 0;
      } else for (const [id, q] of Object.entries(r.output)) p.addItem(id, q);
    } else if (r.furniture) {
      p.house.furniture[r.furniture] = true;
      world.send(p, { t: MSG.INTERFACE, iface: 'house', furniture: p.house.furniture });
    } else for (const [id, q] of Object.entries(r.output)) p.addItem(id, q);
    if (xp) p.addXp(r.skill, xp);
    p.anim = r.station === 'anvil' ? 'slash' : 'spellcast'; p.animSeq++;
    world.fx(p.plane, p.x, p.y, r.skill === 'cooking' ? FX.COOK : r.skill === 'smithing' ? FX.SPARK : r.skill === 'herblore' ? FX.POT : r.skill === 'construction' ? FX.BUILD : FX.CRAFT, { id: p.id });
    p.questProgress('make', r.id);
    if (--count > 0) p.action = { next: Date.now() + 1300, step };
    else { p.action = null; p.anim = 'idle'; }
  };
  p.action = { next: Date.now() + 600, step };
}

// ---------------- items ----------------
function onDrop(world, p, msg) {
  const s = p.inv[msg.slot | 0];
  if (!s) return;
  const qty = Math.min(s.qty, msg.qty | 0 || s.qty);
  p.removeItem(s.id, qty) && world.dropItem(p.plane, p.x, p.y, s.id, qty, p.id);
}
function onPickup(world, p, msg) {
  const e = world.entities.get(msg.id | 0);
  if (!e || (e.kind !== 'item' && e.kind !== 'shil')) return;
  if (Math.hypot(e.x - p.x, e.y - p.y) > 2) return walkThen(world, p, e.x | 0, e.y | 0, () => onPickup(world, p, msg));
  const age = Date.now() - e.t0;
  if (e.owner && e.owner !== p.id && age < 30000) return world.send(p, { t: MSG.MSGBOX, m: "That's not yours to take. Yet." });
  if (e.kind === 'shil') {
    world.removeEntity(e);
    world.fx(p.plane, p.x, p.y, FX.SHILLING, { id: p.id });
    world.earn(p, e.amt, 'drop:pickup');
  } else {
    if (!p.addItem(e.item, e.qty)) return world.send(p, { t: MSG.MSGBOX, m: 'Your pack is full.' });
    world.removeEntity(e);
  }
}
function onEat(world, p, msg) {
  const s = p.inv[msg.slot | 0];
  if (!s) return;
  const def = ITEMS[s.id];
  if (def?.food) {
    p.removeItem(s.id, 1);
    p.hp = Math.min(p.maxHp, p.hp + (def.heal || 2));
    world.fx(p.plane, p.x, p.y, FX.HEAL, { id: p.id });
  } else if (def?.potion) {
    p.removeItem(s.id, 1);
    if (def.boost) for (const [sk, amt] of Object.entries(def.boost)) p.boosts[sk] = { amt, until: Date.now() + 120000 };
    if (def.restore === 'prayer') p.prayerPts = p.level('prayer');
    world.fx(p.plane, p.x, p.y, FX.POT, { id: p.id });
    world.send(p, { t: MSG.MSGBOX, m: `You drink the ${def.name}.` });
  }
}
function onUse(world, p, msg) {
  const s = p.inv[msg.slot | 0];
  if (!s) return;
  const def = ITEMS[s.id];
  if (s.id === 'tinderbox' || LOG_DEFS[s.id]) {
    // firemaking: tinderbox + logs (either order)
    const logsSlot = s.id === 'tinderbox' ? msg.onSlot | 0 : msg.slot | 0;
    const logs = p.inv[logsSlot];
    const L = logs && LOG_DEFS[logs.id];
    if (!L) return world.send(p, { t: MSG.MSGBOX, m: 'Use the tinderbox on logs to make a fire.' });
    if (p.level('firemaking') < L.fm) return world.send(p, { t: MSG.MSGBOX, m: `You need firemaking ${L.fm}.` });
    if (!p.hasTool('tinderbox')) return world.send(p, { t: MSG.MSGBOX, m: 'You need a tinderbox.' });
    p.removeItem(logs.id, 1);
    p.addXp('firemaking', L.fmxp);
    const fire = world.addEntity({ kind: 'fire', plane: p.plane, x: p.x, y: p.y, dir: 2, anim: 'idle', animSeq: 0, t0: Date.now() });
    world.fx(p.plane, p.x, p.y, FX.FIRE, {});
    setTimeout(() => world.entities.has(fire.id) && world.removeEntity(fire), 60000);
    return;
  }
  if (def?.pouch) return onSummon(world, p, { pouch: s.id });
  if (def?.bones) return onBury(world, p, { slot: msg.slot });
  if (def?.tome) { // skill tomes: a burst of XP scaled to your current level
    const sk = def.tome;
    const xp = 800 + p.level(sk) * 140;
    p.removeItem(s.id, 1);
    p.anim = 'spellcast'; p.animSeq++;
    world.fx(p.plane, p.x, p.y, FX.LEVELUP, { id: p.id });
    p.addXp(sk, xp);
    world.send(p, { t: MSG.MSGBOX, kind: 'loot', m: `You study the ${def.name} — ${xp.toLocaleString()} ${sk} XP!` });
    return;
  }
  if (def?.food || def?.potion) return onEat(world, p, msg);
}
import { LOGS as _LOGS } from '../../shared/data/items.js';
const LOG_DEFS = Object.fromEntries(_LOGS.map(l => [l.id, l]));

function onBury(world, p, msg) {
  const s = p.inv[msg.slot | 0];
  if (!s || !ITEMS[s.id]?.bones) return;
  const xp = ITEMS[s.id].prayerXp;
  p.removeItem(s.id, 1);
  p.anim = 'spellcast'; p.animSeq++;
  world.fx(p.plane, p.x, p.y, FX.BONES, { id: p.id });
  p.addXp('prayer', xp);
  p.questProgress('bury', 'bones');
}

function onCast(world, p, msg) {
  const s = SPELLS[String(msg.spell)];
  if (!s) return;
  if (p.level('magic') < s.lvl) return world.send(p, { t: MSG.MSGBOX, m: `You need magic level ${s.lvl}.` });
  const t = msg.target ? world.entities.get(msg.target | 0) : null;
  if (t && t.kind === 'player' && !pvpAllowed(world, p, t)) return;
  if (t && t.kind === 'npc') return;
  const now = Date.now();
  if (now - (p.lastAttack || 0) < 1800) return;
  castSpellAt(world, p, String(msg.spell), t);
  if (s.dmg && t) p.target = t.id;
}

function onPrayer(world, p, msg) {
  const id = String(msg.id);
  const pr = PRAYERS[id];
  if (!pr) return;
  if (p.baseLevel('prayer') < pr.lvl) return world.send(p, { t: MSG.MSGBOX, m: `You need prayer level ${pr.lvl}.` });
  if (p.prayersOn.has(id)) p.prayersOn.delete(id);
  else {
    if (p.prayerPts <= 0) return world.send(p, { t: MSG.MSGBOX, m: 'Your prayers are spent — visit an altar.' });
    // protection prayers are mutually exclusive
    if (pr.protect) for (const o of [...p.prayersOn]) if (PRAYERS[o].protect) p.prayersOn.delete(o);
    p.prayersOn.add(id);
  }
  world.send(p, { t: MSG.SELF, prayersOn: [...p.prayersOn] });
}

// ---------------- dialogue / shops / quests ----------------
function onTalk(world, p, msg) {
  const e = world.entities.get(msg.id | 0);
  if (!e || e.kind !== 'npc') return;
  if (Math.hypot(e.x - p.x, e.y - p.y) > 3) return walkThen(world, p, e.x | 0, e.y | 0, () => onTalk(world, p, msg));
  const def = NPCS[e.type];
  p.dir = e.x > p.x ? 3 : 1;
  // quest turn-in / progress on talk steps
  for (const [qid, st] of Object.entries(p.quests)) {
    if (st.done) continue;
    const q = QUESTS[qid];
    const step = q.steps[st.step];
    if (step?.type === 'talk' && step.npc === e.type) {
      if (step.take) for (const [id, qq] of Object.entries(step.take)) p.removeItem(id, qq);
      p.advanceQuest(qid);
      return;
    }
    if (step?.type === 'collect' && q.giver === e.type && p.countItem(step.item) >= step.count) {
      if (step.consume) p.removeItem(step.item, step.count);
      p.advanceQuest(qid);
      return;
    }
  }
  // offer quest?
  const opts = [];
  if (def.quest && QUESTS[def.quest] && !p.quests[def.quest]) opts.push({ id: 'quest_accept', label: `Quest: ${QUESTS[def.quest].name}` });
  if (def.shop) opts.push({ id: 'shop', label: 'Trade' });
  if (def.banker) opts.push({ id: 'bank', label: 'Bank' });
  if (def.geClerk) opts.push({ id: 'ge', label: 'Grand Exchange' });
  if (def.marshal) opts.push({ id: 'duel_info', label: 'Colosseum duels' });
  if (def.taskboard) {
    if (p.task && p.task.done) opts.push({ id: 'task_turnin', label: 'Turn in task' });
    else if (!p.task) opts.push({ id: 'task_take', label: 'Take a task' });
    else opts.push({ id: 'task_status', label: 'Task progress' });
  }
  if (def.pickpocket) opts.push({ id: 'pickpocket', label: 'Pickpocket' });
  // active quest hint from this giver
  let line = def.lines[Math.random() * def.lines.length | 0];
  const active = Object.entries(p.quests).find(([qid, st]) => !st.done && QUESTS[qid].giver === e.type);
  if (active) {
    const q = QUESTS[active[0]];
    line = q.steps[active[1].step]?.hint || line;
  }
  world.send(p, { t: MSG.DIALOGUE, npc: e.id, type: e.type, name: def.name, line, opts, shop: def.shop });
}

function onDialog(world, p, msg) {
  const e = world.entities.get(msg.npc | 0);
  if (!e || e.kind !== 'npc' || Math.hypot(e.x - p.x, e.y - p.y) > 4) return;
  const def = NPCS[e.type];
  switch (msg.opt) {
    case 'quest_accept': {
      const q = QUESTS[def.quest];
      if (!q || p.quests[def.quest]) return;
      if (p.combatLevel() < (q.level || 1)) return world.send(p, { t: MSG.MSGBOX, m: `Come back at combat level ${q.level}.` });
      p.quests[def.quest] = { step: 0, n: 0 };
      const s0 = q.steps[0];
      for (const [id, qq] of Object.entries(s0.give || {})) p.addItem(id, qq);
      world.send(p, { t: 'questStart', id: def.quest, name: q.name, intro: q.intro, hint: s0.hint });
      return;
    }
    case 'bank': return openBank(world, p);
    case 'ge': return world.ge.sync(p);
    case 'duel_info': return world.send(p, { t: MSG.MSGBOX, m: 'Challenge someone: click a player and choose Duel, or /duel <name> <stake>. Winner takes the pot (5% rake).' });
    case 'pickpocket': return pickpocket(world, p, e.id);
    case 'task_take': {
      const cl = p.combatLevel();
      const suitable = TASKS.filter(t => !t.kill || (MOBS[t.kill].lvl < cl * 1.6 + 10));
      const task = suitable[Math.random() * suitable.length | 0];
      p.task = { ...task, n: 0, done: !task.kill };
      world.send(p, { t: MSG.MSGBOX, kind: 'task', m: `Task: ${task.desc}.` });
      if (!task.kill) p.task.done = false; // gather tasks complete on turn-in check
      return;
    }
    case 'task_status': return world.send(p, { t: MSG.MSGBOX, kind: 'task', m: p.task ? `Task: ${p.task.desc} — ${p.task.n || 0}/${p.task.count}` : 'No task.' });
    case 'task_turnin': {
      const t = p.task;
      if (!t) return;
      if (t.item) { // gather task
        if (p.countItem(t.item) < t.count) return world.send(p, { t: MSG.MSGBOX, kind: 'task', m: `You still need ${t.count - p.countItem(t.item)} more.` });
        p.removeItem(t.item, t.count);
      } else if (!t.done) return world.send(p, { t: MSG.MSGBOX, kind: 'task', m: 'Not finished yet.' });
      p.addItem('coins', t.coins);
      if (t.shillings) world.earn(p, t.shillings, `task:${t.id}`);
      for (const [sk, amt] of Object.entries(t.xp || {})) p.addXp(sk, amt);
      p.task = null;
      world.send(p, { t: MSG.MSGBOX, kind: 'task', m: 'Task complete — payment received. Take another whenever you like.' });
      return;
    }
    case 'buy': {
      const entry = (def.shop || []).find(s => s[0] === msg.item);
      if (!entry) return;
      const qty = Math.max(1, Math.min(500, msg.qty | 0 || 1));
      const cost = entry[1] * qty;
      if (p.countItem('coins') < cost) return world.send(p, { t: MSG.MSGBOX, m: 'Not enough coins.' });
      if (!ITEMS[entry[0]].stack && p.freeSlots() < qty) return world.send(p, { t: MSG.MSGBOX, m: 'Not enough space.' });
      p.removeItem('coins', cost);
      p.addItem(entry[0], qty);
      return;
    }
    case 'sell': {
      const s = p.inv[msg.slot | 0];
      if (!s || !ITEMS[s.id]?.tradeable) return;
      const qty = Math.max(1, Math.min(s.qty, msg.qty | 0 || 1));
      const price = Math.max(1, Math.floor((ITEMS[s.id].value || 1) * 0.4)) * qty;
      p.removeItem(s.id, qty);
      p.addItem('coins', price);
      return;
    }
  }
}

function onQuest(world, p, msg) {
  // client asks for quest log detail
  world.send(p, { t: 'questLog', quests: p.quests });
}

// ---------------- bank ----------------
function nearBank(world, p) {
  const { nodes } = computeWorld();
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++)
    if (nodes.get(((p.x | 0) + dx) + ',' + ((p.y | 0) + dy)) === 'bank_booth') return true;
  for (const e of world.near(p.plane, p.x, p.y, 4)) if (e.kind === 'npc' && NPCS[e.type]?.banker) return true;
  return false;
}
function openBank(world, p) {
  world.bankPouch(p);
  world.send(p, { t: MSG.INTERFACE, iface: 'bank', bank: p.bank });
}
function onBank(world, p, msg) {
  if (!nearBank(world, p)) return world.send(p, { t: MSG.MSGBOX, m: 'You must be at a bank.' });
  if (msg.deposit !== undefined) {
    const s = p.inv[msg.deposit | 0];
    if (!s) return;
    const qty = Math.min(s.qty, msg.qty | 0 || s.qty);
    if (p.removeItem(s.id, qty)) p.bank[s.id] = (p.bank[s.id] || 0) + qty;
  } else if (msg.withdraw) {
    const id = String(msg.withdraw);
    const have = p.bank[id] || 0;
    const qty = Math.min(have, msg.qty | 0 || 1);
    if (qty <= 0) return;
    const stack = ITEMS[id]?.stack;
    const can = stack ? qty : Math.min(qty, p.freeSlots());
    if (can <= 0) return world.send(p, { t: MSG.MSGBOX, m: 'No space.' });
    p.bank[id] -= can;
    if (p.bank[id] <= 0) delete p.bank[id];
    p.addItem(id, can);
  } else if (msg.depositAll) {
    for (let i = 0; i < p.inv.length; i++) {
      const s = p.inv[i];
      if (!s) continue;
      p.bank[s.id] = (p.bank[s.id] || 0) + s.qty;
      p.inv[i] = null;
    }
    p.invDirty();
  }
  world.send(p, { t: MSG.INTERFACE, iface: 'bank', bank: p.bank });
}

// ---------------- Grand Exchange ----------------
function onGE(world, p, msg) {
  if (msg.place) {
    const { type, item, qty, price } = msg.place;
    world.ge.place(p, type === 'buy' ? 'buy' : 'sell', String(item), qty | 0, price | 0);
  } else if (msg.cancel) world.ge.cancel(p, msg.cancel | 0);
  else world.ge.sync(p);
}

// ---------------- Colosseum duels ----------------
function onDuel(world, p, msg) {
  if (msg.challenge) {
    const target = world.players.get(String(msg.challenge));
    const stake = Math.max(COLOSSEUM.MIN_WAGER, Math.min(COLOSSEUM.MAX_WAGER, msg.stake | 0));
    if (!target || target === p) return world.send(p, { t: MSG.MSGBOX, m: 'No such warrior online.' });
    if (world.ledger.balance(p.name) < stake) return world.send(p, { t: MSG.MSGBOX, m: `You need ${stake} $SHL to stake.` });
    target.duelInvite = { from: p.name, stake, at: Date.now() };
    world.send(target, { t: 'duelInvite', from: p.name, stake });
    world.send(p, { t: MSG.MSGBOX, m: `Challenge sent to ${target.name} for ${stake} $SHL.` });
  } else if (msg.accept) {
    const inv = p.duelInvite;
    if (!inv || inv.from !== msg.accept || Date.now() - inv.at > 60000) return;
    const a = world.players.get(inv.from);
    if (!a) return;
    const stake = inv.stake;
    const L = world.ledger;
    if (L.balance(a.name) < stake || L.balance(p.name) < stake) return world.send(p, { t: MSG.MSGBOX, m: 'One of you lacks the stake.' });
    L.burn(a.name, stake, 'duel:escrow'); L.burn(p.name, stake, 'duel:escrow');
    world.send(a, { t: MSG.TOKEN, bal: L.balance(a.name), delta: -stake, reason: 'duel stake' });
    world.send(p, { t: MSG.TOKEN, bal: L.balance(p.name), delta: -stake, reason: 'duel stake' });
    const duel = { id: 'd' + Date.now(), a: a.name, b: p.name, stake, started: false };
    world.duels.set(duel.id, duel);
    for (const [pl, spawn] of [[a, ARENA.spawnA], [p, ARENA.spawnB]]) {
      pl.duelId = duel.id;
      pl.plane = PLANE.COLOSSEUM;
      pl.x = spawn.x + 0.5; pl.y = spawn.y + 0.5;
      pl.path = null; pl.target = null; pl.hp = pl.maxHp;
      world.gridMove(pl);
      world.send(pl, { t: 'duelStart', stake, vs: pl === a ? p.name : a.name, in: 3000 });
    }
    p.duelInvite = null;
    setTimeout(() => { duel.started = true; for (const nm of [duel.a, duel.b]) { const pl = world.players.get(nm); if (pl) world.send(pl, { t: MSG.MSGBOX, m: 'FIGHT!' }); } }, 3000);
    world.announce(`⚔ Colosseum: ${a.name} vs ${p.name} — ${stake} $SHL each. Winner takes the pot!`);
  } else if (msg.decline) p.duelInvite = null;
}
function duelEnd(world, loser, how) {
  const duel = world.duels.get(loser.duelId);
  if (!duel) return;
  world.duels.delete(loser.duelId);
  const winnerName = duel.a === loser.name ? duel.b : duel.a;
  const winner = world.players.get(winnerName);
  const pot = duel.stake * 2;
  const rake = Math.floor(pot * SHILLING.COLOSSEUM_RAKE);
  world.ledger.mint(winnerName, pot - rake, `duel:won:${loser.name}`);
  world.ledger.log.push([Date.now(), 'burn', 'arena', rake, 'duel:rake']);
  world.ledger.burned += rake;
  world.announce(`⚔ ${winnerName} defeats ${loser.name} in the Colosseum and claims ${pot - rake} $SHL!`);
  for (const nm of [duel.a, duel.b]) {
    const pl = world.players.get(nm);
    if (!pl) continue;
    pl.duelId = null;
    pl.plane = PLANE.OVERWORLD;
    const lob = ANCHORS.colosseum_lobby;
    pl.x = lob.x + 0.5; pl.y = lob.y + 0.5;
    pl.hp = Math.max(pl.hp, Math.ceil(pl.maxHp / 2));
    pl.target = null; pl.path = null;
    world.gridMove(pl);
    if (winner) world.send(pl, { t: MSG.TOKEN, bal: world.ledger.balance(nm), delta: nm === winnerName ? pot - rake : -duel.stake, reason: 'duel' });
  }
}

// ---------------- dungeons ----------------
function onDungeon(world, p, msg) {
  if (msg.leave) {
    if (p.plane < PLANE.DUNGEON_BASE) return;
    exitDungeon(world, p);
    return;
  }
  const floor = Math.max(1, Math.min(DUNGEON.MAX_FLOOR, msg.floor | 0));
  if (p.plane >= PLANE.DUNGEON_BASE) return;
  if (floor > p.dungeonBest + 1) return world.send(p, { t: MSG.MSGBOX, m: `Clear floor ${p.dungeonBest + 1} first.` });
  if (p.baseLevel('dungeoneering') < DUNGEON.floorReq(floor)) return world.send(p, { t: MSG.MSGBOX, m: `You need dungeoneering ${DUNGEON.floorReq(floor)}.` });
  world.ensureDungeonFloor(floor);
  const f = dungeonFloor(floor);
  p.returnTo = { x: p.x, y: p.y };
  p.plane = PLANE.DUNGEON_BASE + floor;
  p.x = f.entrance.x + 0.5; p.y = f.entrance.y + 0.5;
  p.path = null; p.target = null;
  world.gridMove(p);
  world.fx(p.plane, p.x, p.y, FX.TELEPORT, { id: p.id });
  world.send(p, { t: MSG.MSGBOX, m: `Floor ${floor}. Find the sealed stair (you'll need an Abyssal key from the creatures here).` });
}
function dungeonAction(world, p, x, y, msg) {
  const floor = p.plane - PLANE.DUNGEON_BASE;
  const f = dungeonFloor(floor);
  if (Math.hypot(x - f.entrance.x, y - f.entrance.y) < 2) return exitDungeon(world, p);
  if (Math.hypot(x - f.exit.x, y - f.exit.y) < 2) {
    if (!near(p, x, y, 2.5)) return walkThen(world, p, x, y, () => dungeonAction(world, p, x, y, msg));
    if (p.countItem('dungeon_key') < 1) return world.send(p, { t: MSG.MSGBOX, m: 'The stair is sealed — an Abyssal key will open it.' });
    p.removeItem('dungeon_key', 1);
    const tokens = DUNGEON.tokenReward(floor);
    world.earn(p, tokens, `dungeon:floor:${floor}`);
    p.addXp('dungeoneering', DUNGEON.xpReward(floor));
    p.dungeonBest = Math.max(p.dungeonBest, floor);
    p.questProgress('dungeon', floor);
    world.announce(`⚒ ${p.name} cleared Abyssal Depths floor ${floor} (+${tokens} $SHL)!`);
    world.dungeonPop.delete(floor); // repopulate for the next runner
    for (const e of [...world.entities.values()]) if (e.kind === 'mob' && e.plane === p.plane) world.removeEntity(e);
    exitDungeon(world, p);
  }
}
function exitDungeon(world, p) {
  p.plane = PLANE.OVERWORLD;
  const back = p.returnTo || { x: 362.5, y: 290.5 };
  p.x = back.x; p.y = back.y;
  p.path = null; p.target = null;
  world.gridMove(p);
  world.fx(p.plane, p.x, p.y, FX.TELEPORT, { id: p.id });
}

// ---------------- pets ----------------
import { PETS } from '../../shared/data/pets.js';
function onPet(world, p, msg) {
  if (msg.claim !== undefined) {
    // claiming converts the tradable item into a bound roster pet (permanent)
    const s = p.inv[msg.claim | 0];
    const petId = s && ITEMS[s.id]?.pet;
    if (!petId || !PETS[petId]) return;
    if (p.pets.length >= 12) return world.send(p, { t: MSG.MSGBOX, m: 'Your pet roster is full (12).' });
    p.removeItem(s.id, 1);
    p.pets.push({ id: petId, xp: 0 });
    world.send(p, { t: 'pets', pets: p.pets, activePet: p.activePet });
    world.send(p, { t: MSG.MSGBOX, kind: 'milestone', m: `${PETS[petId].name} is now bound to you — a companion for life.` });
    world.persistPlayer(p).catch(() => {});
    return;
  }
  if (msg.activate !== undefined) {
    const idx = msg.activate | 0;
    if (!p.pets[idx]) return;
    if (p.activePetEnt) { const old = world.entities.get(p.activePetEnt); if (old) world.removeEntity(old); p.activePetEnt = null; }
    world.spawnPet(p, idx);
    world.send(p, { t: 'pets', pets: p.pets, activePet: p.activePet });
    return;
  }
  if (msg.dismiss) {
    if (p.activePetEnt) { const old = world.entities.get(p.activePetEnt); if (old) world.removeEntity(old); }
    p.activePetEnt = null; p.activePet = null;
    world.send(p, { t: 'pets', pets: p.pets, activePet: null });
  }
}

// ---------------- summoning ----------------
function onSummon(world, p, msg) {
  if (msg.dismiss) {
    if (p.familiar) { const f = world.entities.get(p.familiar); if (f) world.removeEntity(f); p.familiar = null; }
    return;
  }
  const pouchId = String(msg.pouch);
  const fam = FAMILIARS[pouchId];
  if (!fam) return;
  if (p.baseLevel('summoning') < fam.lvl) return world.send(p, { t: MSG.MSGBOX, m: `You need summoning ${fam.lvl}.` });
  if (p.countItem(pouchId) < 1) return;
  if (p.familiar) { const f = world.entities.get(p.familiar); if (f) world.removeEntity(f); }
  p.removeItem(pouchId, 1);
  const f = world.addEntity({
    kind: 'familiar', type: pouchId, name: fam.name, critter: pouchId === 'hawk_pouch' ? 'hawk' : pouchId.includes('wolf') ? 'wolf' : pouchId === 'boar_pouch' ? 'boar' : pouchId === 'bear_pouch' ? 'troll' : pouchId === 'stag_pouch' ? 'stag' : 'treant',
    owner: p.id, plane: p.plane, x: p.x + 1, y: p.y, dir: 2, anim: 'idle', animSeq: 0,
    hp: fam.life, maxHp: fam.life, atk: fam.atk, expires: Date.now() + fam.mins * 60000,
  });
  p.familiar = f.id;
  for (const [sk, amt] of Object.entries(fam.bonus || {})) p.boosts[sk] = { amt, until: Date.now() + fam.mins * 60000 };
  p.addXp('summoning', fam.lvl * 4 + 10);
  world.fx(p.plane, p.x, p.y, FX.SUMMON, { id: p.id });
}

// ---------------- housing ----------------
function enterHouse(world, p) {
  if (p.houseIdx === undefined) {
    const idx = Object.keys(world.houseIdx).length + 1;
    world.houseIdx[p.name] = world.houseIdx[p.name] ?? idx;
    p.houseIdx = world.houseIdx[p.name];
  }
  p.returnTo = { x: p.x, y: p.y };
  p.plane = PLANE.HOUSE_BASE + p.houseIdx;
  p.x = HOUSE.door.x + 0.5; p.y = HOUSE.door.y + 0.5;
  p.path = null; p.target = null;
  world.gridMove(p);
  world.send(p, { t: MSG.INTERFACE, iface: 'house', furniture: p.house.furniture, hotspots: HOUSE.hotspots });
  world.fx(p.plane, p.x, p.y, FX.TELEPORT, { id: p.id });
}
function onHouse(world, p, msg) {
  if (msg.leave) {
    if (p.plane < PLANE.HOUSE_BASE || p.plane >= PLANE.DUNGEON_BASE) return;
    p.plane = PLANE.OVERWORLD;
    const back = p.returnTo || { x: 240.5, y: 330.5 };
    p.x = back.x; p.y = back.y;
    world.gridMove(p);
    world.fx(p.plane, p.x, p.y, FX.TELEPORT, { id: p.id });
  }
  // building happens through MAKE with construction recipes (station: 'house')
}

// ---------------- chat ----------------
function onChat(world, p, msg) {
  let m = String(msg.m || '').slice(0, 200).trim();
  if (!m) return;
  if (m.startsWith('/duel ')) {
    const [, name, stake] = m.split(/\s+/);
    return onDuel(world, p, { challenge: name, stake: parseInt(stake) || 1 });
  }
  if (m.startsWith('/y ')) {
    m = m.slice(3);
    const s = JSON.stringify({ t: 'chat', id: p.id, name: p.name, m, yell: 1 });
    for (const ws2 of world.sockets.values()) if (ws2.readyState === 1) ws2.send(s);
    return;
  }
  world.broadcastNear(p.plane, p.x, p.y, { t: 'chat', id: p.id, name: p.name, m });
}

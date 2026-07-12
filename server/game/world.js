// The single-channel world: entity store, spatial hash, area-of-interest
// streaming, mob AI, ground loot, node depletion, world events.
// Scalability model: network cost per client is bounded by AOI density, never
// by total world population — one shared channel, many players.

import { WORLD, PLANE, MSG, GROUND, SHILLING, TILE, COMBAT, WILDERNESS_Y } from '../../shared/constants.js';
import { computeWorld, isBlocked, dungeonFloor, tileAtPlane, regionAt } from '../../shared/mapgen.js';
import { MOBS } from '../../shared/data/mobs.js';
import { NPCS } from '../../shared/data/npcs.js';
import { NODES } from '../../shared/data/skills.js';
import { ITEMS } from '../../shared/data/items.js';
import { SPAWNS, BOSS_SPAWNS, EVENTS, ANCHORS, ARENA } from '../../shared/data/world.js';
import { PETS, PET_DROPS, PET_ODDS, PET_POWER, petLevel } from '../../shared/data/pets.js';
import { Ledger } from './economy.js';
import { tickCombat, mobAttack } from './combat.js';
import { createStore } from './store.js';
import fs from 'node:fs';
import path from 'node:path';

const CELL = 8; // spatial hash cell (tiles)

export class World {
  constructor(dataDir) {
    this.seed = WORLD.SEED;
    this.dataDir = dataDir;
    fs.mkdirSync(dataDir, { recursive: true });
    computeWorld(); // warm the map cache
    this.entities = new Map();       // id -> entity
    this.grid = new Map();           // "plane:cx,cy" -> Set<entity>
    this.players = new Map();        // name -> player entity (online)
    this.sockets = new Map();        // player entity id -> ws
    this.nextId = 1;
    this.depleted = new Map();       // "x,y" -> respawn timestamp (overworld nodes)
    this.campfires = new Map();      // "plane:x,y" -> expiry
    this.saved = {};                 // offline players (name -> serialized data)
    this.tickN = 0;
    this.eventState = {};            // eventId -> {until, data}
    this.duels = new Map();          // duelId -> duel
    this.dungeonPop = new Map();     // floor -> mobs spawned flag
    this.houseIdx = {};
    this._saving = false;
  }

  // Async setup: durable store, player/ledger load, then world population.
  async init() {
    this.store = await createStore(this.dataDir);
    const { players, houseIdx } = await this.store.loadPlayers();
    this.saved = players;
    this.houseIdx = houseIdx || {};
    this.ledger = new Ledger(this.store);
    this.ledger.load(await this.store.loadLedger());
    this.spawnMobs();
    this.spawnNpcs();
    this.spawnGeodes();
    this.spawnChests();
    return this;
  }

  // ---------------- entity plumbing ----------------
  cellKey(plane, x, y) { return plane + ':' + ((x / CELL) | 0) + ',' + ((y / CELL) | 0); }
  addEntity(e) {
    e.id = e.id || this.nextId++;
    this.entities.set(e.id, e);
    this.gridInsert(e);
    return e;
  }
  removeEntity(e) {
    this.entities.delete(e.id);
    this.gridRemove(e);
    for (const [id, p] of this.players) if (p.known && p.known.has(e.id)) { p.leaves.push(e.id); p.known.delete(e.id); }
  }
  gridInsert(e) {
    e._cell = this.cellKey(e.plane, e.x, e.y);
    let s = this.grid.get(e._cell);
    if (!s) this.grid.set(e._cell, s = new Set());
    s.add(e);
  }
  gridRemove(e) { const s = this.grid.get(e._cell); if (s) s.delete(e); }
  gridMove(e) {
    const k = this.cellKey(e.plane, e.x, e.y);
    if (k !== e._cell) { this.gridRemove(e); e._cell = k; let s = this.grid.get(k); if (!s) this.grid.set(k, s = new Set()); s.add(e); }
  }
  *near(plane, x, y, r) {
    const c0x = ((x - r) / CELL) | 0, c1x = ((x + r) / CELL) | 0;
    const c0y = ((y - r) / CELL) | 0, c1y = ((y + r) / CELL) | 0;
    for (let cy = c0y; cy <= c1y; cy++) for (let cx = c0x; cx <= c1x; cx++) {
      const s = this.grid.get(plane + ':' + cx + ',' + cy);
      if (s) for (const e of s) {
        const dx = e.x - x, dy = e.y - y;
        if (dx * dx + dy * dy <= r * r) yield e;
      }
    }
  }

  // ---------------- spawning ----------------
  spawnMobs() {
    for (const z of SPAWNS) for (let i = 0; i < z.n; i++) this.spawnMob(z.mob, z, PLANE.OVERWORLD);
    for (const b of BOSS_SPAWNS) this.spawnMob(b.mob, { x: b.x, y: b.y, r: 2, n: 1 }, PLANE.OVERWORLD);
  }
  spawnMob(type, zone, plane, lvlScale = 1) {
    const def = MOBS[type];
    let x = zone.x, y = zone.y;
    for (let tries = 0; tries < 24; tries++) {
      const ax = zone.x + (Math.random() * 2 - 1) * zone.r, ay = zone.y + (Math.random() * 2 - 1) * zone.r;
      if (!isBlocked(plane, ax | 0, ay | 0)) { x = ax; y = ay; break; }
    }
    return this.addEntity({
      kind: 'mob', type, plane, x, y, dir: 2, anim: 'idle', animSeq: 0,
      hp: Math.round(def.life * lvlScale), maxHp: Math.round(def.life * lvlScale), lvl: Math.round(def.lvl * lvlScale),
      zone, home: { x, y }, target: null, lastAttack: 0, damagers: new Map(), lvlScale,
    });
  }
  spawnNpcs() {
    for (const id in NPCS) {
      const n = NPCS[id];
      this.addEntity({ kind: 'npc', type: id, plane: PLANE.OVERWORLD, x: n.x + 0.5, y: n.y + 0.5, dir: 2, anim: 'idle', animSeq: 0, home: { x: n.x + 0.5, y: n.y + 0.5 } });
    }
  }

  mobCount() { let n = 0; for (const e of this.entities.values()) if (e.kind === 'mob') n++; return n; }

  // ---------------- ground items & tokens ----------------
  dropItem(plane, x, y, itemId, qty, owner) {
    this.addEntity({ kind: 'item', plane, x: x + (Math.random() * 0.6 - 0.3), y: y + (Math.random() * 0.6 - 0.3), item: itemId, qty, owner, t0: Date.now() });
  }
  dropShillings(plane, x, y, amount, owner) {
    this.addEntity({ kind: 'shil', plane, x, y, amt: amount, owner, t0: Date.now() });
  }
  rollMobDrops(mob, killer) {
    const def = MOBS[mob.type];
    const scale = mob.lvlScale || 1;
    for (const [item, q, chance] of def.drops || []) {
      if (Math.random() >= (chance ?? 1)) continue;
      const qty = Array.isArray(q) ? q[0] + (Math.random() * (q[1] - q[0] + 1) | 0) : q;
      if (item === 'coins') {
        killer.addItem && killer.addItem('coins', Math.ceil(qty * scale));
        this.send(killer, { t: MSG.MSGBOX, kind: 'loot', m: `${Math.ceil(qty * scale)} coins` });
      } else this.dropItem(mob.plane, mob.x, mob.y, item, qty, killer.id);
    }
    // The very rare $Shilling drop — scaled by mob level, zone and mob multiplier
    const wild = mob.plane === PLANE.OVERWORLD && mob.y < WILDERNESS_Y ? SHILLING.WILDERNESS_BONUS : 1;
    const p = SHILLING.MOB_DROP_CHANCE_BASE * (1 + mob.lvl / 12) * (def.shil || 1) * wild;
    if (Math.random() < p) {
      const amt = 1 + (Math.random() * (1 + mob.lvl / 25) | 0);
      this.dropShillings(mob.plane, mob.x, mob.y, amt, killer.id);
      this.announce(`✦ ${killer.name} struck lucky — a $Shilling drop from ${def.name}!`);
    }
    // Pet drops: [superRare, ultraRare] pool per mob; bosses roll far better odds.
    const petPool = PET_DROPS[mob.type];
    if (petPool) {
      const superOdds = def.boss ? PET_ODDS.bossSuper : PET_ODDS.superRare;
      const ultraOdds = def.boss ? PET_ODDS.bossUltra : PET_ODDS.ultraRare;
      let dropped = null;
      if (petPool[1] && Math.random() < ultraOdds) dropped = petPool[1];
      else if (petPool[0] && Math.random() < superOdds) dropped = petPool[0];
      if (dropped) {
        this.dropItem(mob.plane, mob.x, mob.y, `pet_${dropped}`, 1, killer.id);
        this.announce(`🐾 ${killer.name} found a ${PETS[dropped].name} pet — ${petPool[1] === dropped ? 'an ULTRA RARE' : 'a super rare'} companion from ${def.name}!`);
      }
    }
    if (def.boss) this.payBossBounty(mob, def);
    if (mob.type === 'golden_stag') {
      for (const [pid, dmg] of mob.damagers) {
        const pl = this.entities.get(pid);
        if (!pl || pl.kind !== 'player' || dmg < mob.maxHp * 0.05) continue;
        const amt = SHILLING.EVENT_PAYOUT_BASE + (Math.random() * 5 | 0);
        this.earn(pl, amt, 'event:golden_stag');
      }
      this.announce('⚑ The Golden Stag has fallen — its blessing is shared among the hunters.');
    }
  }
  payBossBounty(mob, def) {
    for (const [pid, dmg] of mob.damagers) {
      const pl = this.entities.get(pid);
      if (!pl || pl.kind !== 'player' || dmg < mob.maxHp * 0.05) continue;
      let amt = SHILLING.BOSS_BOUNTY_BASE * (def.tier || 1);
      if (Math.random() < SHILLING.BOSS_JACKPOT_CHANCE) {
        amt += SHILLING.BOSS_JACKPOT;
        this.announce(`✦✦ JACKPOT! ${pl.name} claims a bounty of ${amt} $SHL from ${def.name}!`);
      }
      this.earn(pl, amt, `boss:${def.id}`);
    }
  }
  earn(player, amount, reason) {
    if (amount <= 0) return;
    const inWild = player.plane === PLANE.OVERWORLD && player.y < WILDERNESS_Y;
    if (inWild) {
      player.pouch = (player.pouch || 0) + amount;
      this.send(player, { t: MSG.TOKEN, pouch: player.pouch, delta: amount, reason, risk: true });
    } else {
      this.ledger.mint(player.name, amount, reason);
      this.send(player, { t: MSG.TOKEN, bal: this.ledger.balance(player.name), delta: amount, reason });
    }
  }
  bankPouch(player) {
    if (player.pouch > 0) {
      this.ledger.mint(player.name, player.pouch, 'pouch:banked');
      this.send(player, { t: MSG.TOKEN, bal: this.ledger.balance(player.name), delta: player.pouch, reason: 'pouch banked' });
      player.pouch = 0;
    }
  }

  // ---------------- node depletion ----------------
  nodeKey(x, y) { return (x | 0) + ',' + (y | 0); }
  isDepleted(x, y) { const t = this.depleted.get(this.nodeKey(x, y)); return t !== undefined && t > Date.now(); }
  deplete(x, y, ms) {
    this.depleted.set(this.nodeKey(x, y), Date.now() + ms);
    this.broadcastNear(PLANE.OVERWORLD, x, y, { t: 'node', x: x | 0, y: y | 0, off: 1 });
    setTimeout(() => this.broadcastNear(PLANE.OVERWORLD, x, y, { t: 'node', x: x | 0, y: y | 0, off: 0 }), ms);
  }

  // ---------------- wandering gem geodes ----------------
  // Ultra-rare mineable crystal nodes that surface at random spots in the
  // wilds, yield a handful of gems, then sink away and re-emerge elsewhere.
  spawnGeodes() { for (let i = 0; i < 3; i++) this.spawnGeode(); }
  spawnGeode() {
    const GEODE_GEMS = [
      { gem: 'citrine', row: 2, lvl: 50 }, { gem: 'sapphire', row: 3, lvl: 55 },
      { gem: 'emerald', row: 0, lvl: 62 }, { gem: 'amethyst', row: 1, lvl: 70 },
      { gem: 'ruby', row: 5, lvl: 78 }, { gem: 'diamond', row: 4, lvl: 88 },
    ];
    let x = 300, y = 300;
    for (let tries = 0; tries < 300; tries++) {
      const ax = 40 + Math.random() * (WORLD.W - 80) | 0, ay = 40 + Math.random() * (WORLD.H - 80) | 0;
      if (!isBlocked(PLANE.OVERWORLD, ax, ay)) { x = ax; y = ay; break; }
    }
    const g = GEODE_GEMS[Math.random() * GEODE_GEMS.length | 0];
    const ent = this.addEntity({
      kind: 'geode', plane: PLANE.OVERWORLD, x: x + 0.5, y: y + 0.5, dir: 2, anim: 'idle', animSeq: 0,
      gem: g.gem, gemRow: g.row, gemCol: 9 + (Math.random() * 6 | 0), lvl: g.lvl,
      charges: 4 + (Math.random() * 4 | 0), hp: 1, maxHp: 1,
    });
    const region = regionAt(x, y);
    this.announce(`💎 Prospectors whisper of a ${g.gem} geode surfacing somewhere in ${String(region || 'the wilds').toLowerCase().replace(/_/g, ' ')}…`);
    // it sinks away on its own if nobody finds it
    ent._sinkTimer = setTimeout(() => { if (this.entities.has(ent.id)) { this.removeEntity(ent); this.spawnGeode(); } }, 10 * 60000 + Math.random() * 8 * 60000);
    return ent;
  }
  depleteGeode(ent) {
    clearTimeout(ent._sinkTimer);
    this.fx(ent.plane, ent.x, ent.y, 11 /* MINE */, {});
    this.removeEntity(ent);
    setTimeout(() => this.spawnGeode(), 5 * 60000 + Math.random() * 6 * 60000);
  }

  // ---------------- animated treasure chests ----------------
  // Chests surface across the overworld (fancier ones in dangerous places) and
  // on every dungeon floor. Ornate chests need an Abyssal key.
  spawnChests() { for (let i = 0; i < 8; i++) this.spawnChest(); }
  spawnChest() {
    let x = 300, y = 300;
    for (let tries = 0; tries < 300; tries++) {
      const ax = 30 + Math.random() * (WORLD.W - 60) | 0, ay = 30 + Math.random() * (WORLD.H - 60) | 0;
      if (!isBlocked(PLANE.OVERWORLD, ax, ay)) { x = ax; y = ay; break; }
    }
    // danger scales tier: far north = better chests
    const danger = 1 - y / WORLD.H;                      // 0 south .. 1 north
    const roll = Math.random() + danger * 0.7;
    const variant = roll > 1.25 ? 3 : roll > 0.95 ? 2 : roll > 0.6 ? 1 : 0;
    return this.addEntity({
      kind: 'chest', plane: PLANE.OVERWORLD, x: x + 0.5, y: y + 0.5, dir: 2, anim: 'idle', animSeq: 0,
      variant, snow: y < WORLD.H * 0.3, locked: variant === 3, tier: variant, hp: 1, maxHp: 1,
    });
  }
  openChest(ent, p) {
    if (ent.opened) return;
    ent.opened = true;
    ent.anim = 'open'; ent.animSeq++;
    const tier = ent.tier || 0;
    const loot = this.rollChestLoot(tier, ent.floor || 0);
    setTimeout(() => {
      for (const [item, qty] of loot) {
        if (item === 'coins') p.addItem('coins', qty);
        else this.dropItem(ent.plane, ent.x, ent.y, item, qty, p.id);
      }
      this.send(p, { t: MSG.MSGBOX, kind: 'loot', m: `The chest creaks open — ${loot.map(l => (l[1] > 1 ? l[1] + '× ' : '') + (ITEMS[l[0]]?.name || l[0])).join(', ')}.` });
      if (loot.some(l => ITEMS[l[0]]?.micon?.[0] === 'rareSwords')) this.announce(`⚔ ${p.name} pulls a legendary blade from a treasure chest!`);
      p.questProgress && p.questProgress('chest', tier);
    }, 450);
    setTimeout(() => {
      if (!this.entities.has(ent.id)) return;
      this.removeEntity(ent);
      if (ent.plane === PLANE.OVERWORLD) setTimeout(() => this.spawnChest(), 4 * 60000 + Math.random() * 5 * 60000);
    }, 1600);
  }
  rollChestLoot(tier, floor = 0) {
    const mult = 1 + tier * 0.9 + floor * 0.25;
    const loot = [['coins', Math.ceil((40 + Math.random() * 160) * mult)]];
    const P = (chance, item, qty = 1) => { if (Math.random() < chance) loot.push([item, Array.isArray(qty) ? qty[0] + (Math.random() * (qty[1] - qty[0] + 1) | 0) : qty]); };
    P(0.5, ['attack_potion', 'strength_potion', 'defence_potion', 'ranging_potion', 'magic_potion', 'titan_brew'][Math.min(5, tier + (Math.random() * 3 | 0))]);
    P(0.4, ['air_rune', 'water_rune', 'earth_rune', 'fire_rune', 'nature_rune', 'cosmic_rune', 'blood_rune'][Math.min(6, tier * 2 + (Math.random() * 2 | 0))], [4, 14]);
    P(0.12 + tier * 0.06, ['sapphire', 'citrine', 'emerald', 'amethyst', 'ruby', 'diamond'][Math.min(5, tier + (Math.random() * 2 | 0))]);
    P(0.02 + tier * 0.02, `tome_${['attack', 'strength', 'defence', 'ranged', 'magic', 'mining', 'fishing', 'woodcutting', 'cooking', 'crafting', 'herblore', 'prayer'][Math.random() * 12 | 0]}`);
    P(tier >= 2 ? 0.012 + tier * 0.004 : 0.002, ['blade_of_the_burrow', 'tidebreaker_cutlass', 'fanged_ripper', 'glacier_edge', 'abyssal_edge'][Math.min(4, tier + (Math.random() * 2 | 0))]);
    P(0.25, 'bread', [1, 3]);
    if (floor > 0) { P(0.6, 'cosmic_rune', [3, 9]); P(0.25, 'abyssal_pearl'); P(0.35, 'dungeon_key'); }
    return loot;
  }

  // ---------------- messaging ----------------
  send(player, obj) { const ws = this.sockets.get(player.id); if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }
  broadcastNear(plane, x, y, obj) {
    const s = JSON.stringify(obj);
    for (const e of this.near(plane, x, y, WORLD.AOI_TILES)) if (e.kind === 'player') { const ws = this.sockets.get(e.id); if (ws && ws.readyState === 1) ws.send(s); }
  }
  announce(m) {
    const s = JSON.stringify({ t: MSG.EVENT, m });
    for (const ws of this.sockets.values()) if (ws.readyState === 1) ws.send(s);
  }
  fx(plane, x, y, fxId, extra = {}) { this.broadcastNear(plane, x, y, { t: MSG.FX, fx: fxId, x, y, ...extra }); }

  // ---------------- main loop ----------------
  start() {
    this.timer = setInterval(() => {
      try { this.tick(); } catch (e) { console.error('tick error', e); }
    }, WORLD.TICK_MS);
    this.saveTimer = setInterval(() => { this.saveAll().catch(e => console.error('autosave', e.message)); }, 30000);
  }
  tick() {
    const now = Date.now();
    const dt = WORLD.TICK_MS / 1000;
    this.tickN++;
    for (const e of [...this.entities.values()]) {
      if (e.kind === 'player') this.tickPlayer(e, now, dt);
      else if (e.kind === 'mob') this.tickMob(e, now, dt);
      else if (e.kind === 'npc') this.tickNpc(e, now, dt);
      else if (e.kind === 'familiar') this.tickFamiliar(e, now, dt);
      else if (e.kind === 'pet') this.tickPet(e, now, dt);
      else if (e.kind === 'item' || e.kind === 'shil') {
        if (now - e.t0 > GROUND.OWNER_MS + GROUND.SHARED_MS) this.removeEntity(e);
      }
    }
    if (this.tickN % 10 === 0) this.tickEvents(now);
    this.streamSnapshots();
  }

  moveEntity(e, tx, ty, speed, dt) {
    const dx = tx - e.x, dy = ty - e.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.05) return true;
    const step = Math.min(d, speed * dt);
    let nx = e.x + (dx / d) * step, ny = e.y + (dy / d) * step;
    if (isBlocked(e.plane, nx | 0, ny | 0)) {
      if (!isBlocked(e.plane, nx | 0, e.y | 0)) ny = e.y;
      else if (!isBlocked(e.plane, e.x | 0, ny | 0)) nx = e.x;
      else return true; // stuck
    }
    e.x = nx; e.y = ny;
    e.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 3 : 1) : (dy > 0 ? 2 : 0); // 0 up,1 left,2 down,3 right
    this.gridMove(e);
    return false;
  }

  // Follow a waypoint path with a per-tick distance budget that carries across
  // waypoints — crossing a waypoint never eats the rest of the tick's movement,
  // so diagonal travel stays perfectly smooth instead of stutter-stepping.
  followPath(e, speed, dt) {
    let budget = speed * dt;
    let movedAny = false;
    let guard = 0;
    while (budget > 0.002 && e.path && e.path.length && guard++ < 8) {
      const wp = e.path[0];
      const tx = wp.x + 0.5, ty = wp.y + 0.5;
      const dx = tx - e.x, dy = ty - e.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.05) { e.path.shift(); continue; }
      const step = Math.min(d, budget);
      let nx = e.x + (dx / d) * step, ny = e.y + (dy / d) * step;
      if (isBlocked(e.plane, nx | 0, ny | 0)) {
        if (!isBlocked(e.plane, nx | 0, e.y | 0)) ny = e.y;
        else if (!isBlocked(e.plane, e.x | 0, ny | 0)) nx = e.x;
        else { e.path.shift(); continue; }        // blocked toward this waypoint; try the next
      }
      const consumed = Math.hypot(nx - e.x, ny - e.y);
      if (consumed < 0.001) { e.path.shift(); continue; } // sliding made no progress
      e.x = nx; e.y = ny;
      e.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 3 : 1) : (dy > 0 ? 2 : 0);
      budget -= consumed;
      movedAny = true;
    }
    if (movedAny) this.gridMove(e);
    return movedAny;
  }

  tickPlayer(p, now, dt) {
    tickCombat(this, p, now);
    // movement: follow path or velocity
    let moved = false;
    if (p.vel && now - p.velT < 400) {
      const speed = p.run && p.energy > 0 ? WORLD.RUN_SPEED : WORLD.WALK_SPEED;
      const nx = p.x + p.vel.x * speed * dt, ny = p.y + p.vel.y * speed * dt;
      const before = p.x + ',' + p.y;
      this.moveEntity(p, nx, ny, speed, dt);
      moved = before !== p.x + ',' + p.y;
      if (moved) p.path = null;
    } else if (p.path && p.path.length) {
      const speed = p.run && p.energy > 0 ? WORLD.RUN_SPEED : WORLD.WALK_SPEED;
      moved = this.followPath(p, speed, dt);
    }
    if (moved) {
      p.anim = 'walk';
      if (p.action) { p.action = null; }               // moving cancels skilling
      if (p.run) p.energy = Math.max(0, p.energy - 0.9 * dt * 4);
      // leaving the wilderness banks your pouch
      if (p.pouch > 0 && (p.plane !== PLANE.OVERWORLD || p.y >= WILDERNESS_Y + 2)) this.bankPouch(p);
    } else if (p.anim === 'walk') p.anim = 'idle';
    // energy regen (agility)
    const agi = p.level('agility');
    p.energy = Math.min(100, p.energy + (0.35 + 0.02 * agi) * dt * 2);
    // prayer drain
    if (p.prayersOn.size) {
      let drain = 0;
      for (const pr of p.prayersOn) drain += (p.PRAYERS[pr]?.drain || 1);
      p.prayerPts -= drain * dt / 6;
      if (p.prayerPts <= 0) { p.prayerPts = 0; p.prayersOn.clear(); this.send(p, { t: MSG.SELF, prayersOn: [] }); }
    }
    // passive hp regen
    if (p.hp < p.maxHp && this.tickN % 30 === 0) p.hp = Math.min(p.maxHp, p.hp + 1 + (p.prayersOn.has('rapid_heal') ? 2 : 0));
    // deferred interactions (walk-then-act)
    if (p.pendingAction) p.pendingAction(now);
    // timed action progress (gathering / making)
    if (p.action && now >= p.action.next) p.action.step(now);
  }

  tickMob(m, now, dt) {
    const def = MOBS[m.type];
    if (m.hp <= 0) return;
    // acquire target
    if (def.aggro && !m.target && this.tickN % 5 === 0) {
      for (const e of this.near(m.plane, m.x, m.y, COMBAT.AGGRO_RADIUS)) {
        if (e.kind === 'player' && e.hp > 0 && !e.safe) { m.target = e.id; break; }
      }
    }
    const t = m.target ? this.entities.get(m.target) : null;
    if (t && (t.hp <= 0 || t.plane !== m.plane || Math.hypot(t.x - m.x, t.y - m.y) > 14)) { m.target = null; }
    else if (t) {
      const range = def.style === 'melee' ? 1.5 : 6;
      const d = Math.hypot(t.x - m.x, t.y - m.y);
      if (d > range) this.moveEntity(m, t.x, t.y, def.speed || 2.2, dt), m.anim = 'walk';
      else { m.anim = 'idle'; mobAttack(this, m, t, now); }
      return;
    }
    // leash home / wander
    if (Math.hypot(m.home.x - m.x, m.home.y - m.y) > (m.zone.r + 6)) this.moveEntity(m, m.home.x, m.home.y, def.speed || 2.2, dt), m.anim = 'walk';
    else if (Math.random() < 0.01) {
      const wx = m.home.x + (Math.random() * 2 - 1) * Math.min(4, m.zone.r), wy = m.home.y + (Math.random() * 2 - 1) * Math.min(4, m.zone.r);
      m.wander = { x: wx, y: wy };
    }
    if (m.wander) {
      if (this.moveEntity(m, m.wander.x, m.wander.y, (def.speed || 2.2) * 0.5, dt)) m.wander = null, m.anim = 'idle';
      else m.anim = 'walk';
    } else m.anim = 'idle';
  }

  tickNpc(n, now, dt) {
    const def = NPCS[n.type];
    if (!def.wander) return;
    if (Math.random() < 0.008) n.wander = { x: n.home.x + (Math.random() * 2 - 1) * def.wander, y: n.home.y + (Math.random() * 2 - 1) * def.wander };
    if (n.wander) {
      if (this.moveEntity(n, n.wander.x, n.wander.y, 1.2, dt)) n.wander = null, n.anim = 'idle';
      else n.anim = 'walk';
    }
  }

  // ---------------- player pets ----------------
  spawnPet(owner, rosterIdx) {
    const rec = owner.pets[rosterIdx];
    if (!rec) return null;
    const def = PETS[rec.id];
    const pet = this.addEntity({
      kind: 'pet', type: rec.id, name: def.name, critter: def.critter, cls: def.cls,
      owner: owner.id, rosterIdx, plane: owner.plane, x: owner.x + 1, y: owner.y,
      dir: 2, anim: 'idle', animSeq: 0, hp: 1, maxHp: 1, lastAttack: 0, lastUtility: 0,
    });
    owner.activePetEnt = pet.id;
    owner.activePet = rosterIdx;
    return pet;
  }
  tickPet(pt, now, dt) {
    const owner = this.entities.get(pt.owner);
    if (!owner || owner.activePetEnt !== pt.id) { this.removeEntity(pt); return; }
    if (owner.plane !== pt.plane) { // follow through teleports
      pt.plane = owner.plane; pt.x = owner.x + 1; pt.y = owner.y; this.gridMove(pt);
    }
    const rec = owner.pets[pt.rosterIdx];
    if (!rec) { this.removeEntity(pt); owner.activePetEnt = null; return; }
    const L = petLevel(rec.xp);
    const d = Math.hypot(owner.x - pt.x, owner.y - pt.y);
    const tgt = owner.target ? this.entities.get(owner.target) : null;
    const canAttack = pt.cls === 'offense' || pt.cls === 'utility';
    if (canAttack && tgt && tgt.kind === 'mob' && tgt.hp > 0 && Math.hypot(tgt.x - pt.x, tgt.y - pt.y) < 10) {
      const dd = Math.hypot(tgt.x - pt.x, tgt.y - pt.y);
      if (dd > 1.4) this.moveEntity(pt, tgt.x, tgt.y, 4.5, dt), pt.anim = 'walk';
      else if (now - pt.lastAttack > PET_POWER.attackSpeedMs(pt.cls)) {
        pt.lastAttack = now;
        pt.anim = 'slash'; pt.animSeq++;
        const dmg = 1 + (Math.random() * PET_POWER.attackDamage(pt.cls, L) | 0);
        this.applyMobDamage(tgt, dmg, owner);
        this.broadcastNear(pt.plane, pt.x, pt.y, { t: MSG.HIT, id: tgt.id, dmg, src: pt.id });
        this.petGainXp(owner, rec, dmg * 2);
      }
    } else if (d > 2.2) { this.moveEntity(pt, owner.x, owner.y, 5.5, dt); pt.anim = 'walk'; }
    else pt.anim = 'idle';
    // utility pets: feed a hurt owner from their pack, retrieve their drops
    if (pt.cls === 'utility' && now - pt.lastUtility > 8000) {
      if (owner.hp < owner.maxHp * 0.6) {
        const foodIdx = owner.inv.findIndex(s => s && ITEMS[s.id]?.food);
        if (foodIdx >= 0) {
          const heal = ITEMS[owner.inv[foodIdx].id].heal || 2;
          owner.removeItem(owner.inv[foodIdx].id, 1);
          owner.hp = Math.min(owner.maxHp, owner.hp + heal);
          this.fx(owner.plane, owner.x, owner.y, FX.HEAL, { id: owner.id });
          this.send(owner, { t: MSG.MSGBOX, m: `${pt.name} fetches food from your pack.` });
          pt.lastUtility = now;
          this.petGainXp(owner, rec, 20);
        }
      } else {
        for (const e of this.near(pt.plane, pt.x, pt.y, 5)) {
          if (e.kind !== 'item' || e.owner !== owner.id) continue;
          if (!owner.addItem(e.item, e.qty)) break;
          this.removeEntity(e);
          this.send(owner, { t: MSG.MSGBOX, m: `${pt.name} retrieves your ${ITEMS[e.item]?.name || e.item}.` });
          pt.lastUtility = now;
          this.petGainXp(owner, rec, 8);
          break;
        }
      }
    }
  }
  petGainXp(owner, rec, amount) {
    const before = petLevel(rec.xp);
    rec.xp += Math.round(amount);
    const after = petLevel(rec.xp);
    if (after > before) {
      this.send(owner, { t: 'petLevel', id: rec.id, level: after });
      this.fx(owner.plane, owner.x, owner.y, FX.LEVELUP, { id: owner.activePetEnt });
      if (after === 150) this.announce(`🐾 ${owner.name}'s ${PETS[rec.id].name} reached the maximum level 150!`);
    }
    this.send(owner, { t: 'petXp', idx: owner.activePet, xp: rec.xp });
  }

  tickFamiliar(f, now, dt) {
    const owner = this.entities.get(f.owner);
    if (!owner || now > f.expires || owner.plane !== f.plane) { this.removeEntity(f); if (owner) owner.familiar = null; return; }
    const d = Math.hypot(owner.x - f.x, owner.y - f.y);
    const tgt = owner.target ? this.entities.get(owner.target) : null;
    if (tgt && tgt.kind === 'mob' && tgt.hp > 0 && Math.hypot(tgt.x - f.x, tgt.y - f.y) < 10) {
      const dd = Math.hypot(tgt.x - f.x, tgt.y - f.y);
      if (dd > 1.4) this.moveEntity(f, tgt.x, tgt.y, 4, dt), f.anim = 'walk';
      else if (now - (f.lastAttack || 0) > 2600) {
        f.lastAttack = now; f.anim = 'slash'; f.animSeq++;
        const dmg = 1 + (Math.random() * f.atk | 0);
        this.applyMobDamage(tgt, dmg, owner);
        this.broadcastNear(f.plane, f.x, f.y, { t: MSG.HIT, id: tgt.id, dmg, src: f.id });
      }
    } else if (d > 2.2) this.moveEntity(f, owner.x, owner.y, 5.5, dt), f.anim = 'walk';
    else f.anim = 'idle';
  }

  applyMobDamage(mob, dmg, player) {
    mob.hp -= dmg;
    mob.damagers.set(player.id, (mob.damagers.get(player.id) || 0) + dmg);
    if (!mob.target) mob.target = player.id;
    if (mob.hp <= 0) this.killMob(mob, player);
  }
  killMob(mob, killer) {
    mob.hp = 0;
    this.broadcastNear(mob.plane, mob.x, mob.y, { t: MSG.DEATH, id: mob.id });
    this.rollMobDrops(mob, killer);
    for (const p of this.players.values()) p.onKill && p.onKill(mob.type);
    const def = MOBS[mob.type];
    // sheet-animated creatures linger briefly so their death animation plays
    if (def.sheet) { mob.target = null; setTimeout(() => { if (this.entities.has(mob.id)) this.removeEntity(mob); }, 1400); }
    else this.removeEntity(mob);
    if (!mob.noRespawn) setTimeout(() => {
      if (mob.plane >= PLANE.DUNGEON_BASE) return;      // dungeon mobs respawn with the instance
      this.spawnMob(mob.type, mob.zone, mob.plane, mob.lvlScale);
    }, def.respawnMs || 8000);
  }

  // ---------------- dungeons ----------------
  ensureDungeonFloor(floor) {
    if (this.dungeonPop.get(floor)) return;
    this.dungeonPop.set(floor, true);
    const plane = PLANE.DUNGEON_BASE + floor;
    const f = dungeonFloor(floor);
    const scale = 1 + floor * 0.35;
    // deeper floors phase in the new sheet-animated horrors
    const types = floor >= 8 ? ['cursed_skull', 'abyssal_sentinel', 'abyssal_crawler', 'cursed_skull']
      : floor >= 4 ? ['abyssal_crawler', 'cursed_skull', 'depth_keeper', 'cave_bat']
        : ['abyssal_crawler', 'abyssal_crawler', 'depth_keeper', 'cave_bat'];
    let placed = 0, guard = 0;
    while (placed < 10 + floor && guard++ < 400) {
      const x = 2 + Math.random() * (f.size - 4) | 0, y = 2 + Math.random() * (f.size - 4) | 0;
      if (f.tiles[y * f.size + x] !== TILE.CAVE) continue;
      if (Math.hypot(x - f.entrance.x, y - f.entrance.y) < 6) continue;
      this.spawnMob(types[placed % types.length], { x, y, r: 2, n: 1 }, plane, scale);
      placed++;
    }
    // boss floors: rotate through the abyssal bosses as you descend
    if (floor % 5 === 0) {
      const abyssBoss = floor >= 15 ? 'hellbeast' : floor >= 10 ? 'queen_aracnyx' : 'abyssal_horror';
      const bs = floor >= 10 ? 1 + (floor - 10) * 0.08 : 1 + floor * 0.2;
      this.spawnMob(abyssBoss, { x: f.exit.x, y: f.exit.y, r: 2, n: 1 }, plane, bs);
    }
    // treasure chests hidden on every floor (ornate ones need an Abyssal key)
    let chests = 0; guard = 0;
    while (chests < 2 && guard++ < 200) {
      const x = 2 + Math.random() * (f.size - 4) | 0, y = 2 + Math.random() * (f.size - 4) | 0;
      if (f.tiles[y * f.size + x] !== TILE.CAVE) continue;
      this.addEntity({
        kind: 'chest', plane, x: x + 0.5, y: y + 0.5, dir: 2, anim: 'idle', animSeq: 0,
        variant: chests === 0 ? 3 : 2, snow: 0, locked: chests === 0, tier: 2 + (chests === 0 ? 1 : 0), floor, hp: 1, maxHp: 1,
      });
      chests++;
    }
  }

  // ---------------- world events ----------------
  tickEvents(now) {
    for (const ev of EVENTS) {
      const st = this.eventState[ev.id] || (this.eventState[ev.id] = { next: now + ev.everyMin * 60000 * (0.3 + Math.random() * 0.5), until: 0 });
      if (!st.active && now >= st.next) {
        st.active = true; st.until = now + ev.durMin * 60000; st.claims = new Map();
        this.announce(`⚑ EVENT — ${ev.name}: ${ev.desc}`);
        if (ev.id === 'convoy') {
          st.ents = [];
          for (let i = 0; i < 4; i++) st.ents.push(this.spawnMob('sheriffs_guard', { x: ev.x, y: ev.y, r: 3, n: 1 }, PLANE.OVERWORLD, 1.5));
          const box = this.addEntity({ kind: 'evbox', ev: 'convoy', plane: PLANE.OVERWORLD, x: ev.x + 0.5, y: ev.y + 0.5, anim: 'idle', animSeq: 0, dir: 2, hp: 1, maxHp: 1 });
          st.box = box;
        } else if (ev.id === 'golden_stag') {
          const stag = this.spawnMob('golden_stag', { x: ev.x, y: ev.y, r: 8, n: 1 }, PLANE.OVERWORLD);
          stag.noRespawn = true; st.stag = stag;
        }
      }
      if (st.active && now >= st.until) {
        st.active = false;
        st.next = now + ev.everyMin * 60000 * (0.8 + Math.random() * 0.4);
        if (st.box) this.removeEntity(st.box), st.box = null;
        if (st.stag && this.entities.has(st.stag.id)) this.removeEntity(st.stag), st.stag = null;
        for (const e of st.ents || []) if (this.entities.has(e.id)) this.removeEntity(e);
        st.ents = [];
        this.announce(`⚑ ${ev.name} has ended.`);
      }
    }
  }

  // ---------------- AOI snapshots ----------------
  describe(e) {
    const d = { id: e.id, k: e.kind, x: +e.x.toFixed(2), y: +e.y.toFixed(2), dir: e.dir || 2, anim: e.anim || 'idle', seq: e.animSeq || 0 };
    if (e.kind === 'player') Object.assign(d, { name: e.name, hp: e.hp, mhp: e.maxHp, vis: e.visual(), cb: e.combatLevel(), skull: e.plane === 0 && e.y < WILDERNESS_Y });
    else if (e.kind === 'mob') { const m = MOBS[e.type]; Object.assign(d, { type: e.type, name: m.name, lvl: e.lvl, hp: e.hp, mhp: e.maxHp, vis: m.vis, critter: m.critter, sheet: m.sheet, boss: m.boss, scale: m.scale }); }
    else if (e.kind === 'geode') Object.assign(d, { name: `Gem geode (${e.gem})`, gem: e.gem, gemRow: e.gemRow, gemCol: e.gemCol, lvl: e.lvl });
    else if (e.kind === 'chest') Object.assign(d, { name: e.locked ? 'Ornate chest' : 'Treasure chest', variant: e.variant, snow: e.snow ? 1 : 0, locked: e.locked ? 1 : 0 });
    else if (e.kind === 'npc') { const n = NPCS[e.type]; Object.assign(d, { type: e.type, name: n.name, vis: n.vis, npc: 1, shop: !!n.shop, quest: n.quest }); }
    else if (e.kind === 'item') Object.assign(d, { item: e.item, qty: e.qty });
    else if (e.kind === 'shil') Object.assign(d, { amt: e.amt });
    else if (e.kind === 'familiar') Object.assign(d, { type: e.type, name: e.name, critter: e.critter, hp: e.hp, mhp: e.maxHp });
    else if (e.kind === 'evbox') Object.assign(d, { ev: e.ev, name: 'Convoy strongbox' });
    else if (e.kind === 'fire') Object.assign(d, { fire: 1 });
    else if (e.kind === 'pet') {
      const owner = this.entities.get(e.owner);
      const rec = owner?.pets?.[e.rosterIdx];
      Object.assign(d, { type: e.type, name: e.name, critter: e.critter, pet: 1, lvl: rec ? petLevel(rec.xp) : 1, cls: e.cls });
    }
    return d;
  }
  streamSnapshots() {
    for (const p of this.players.values()) {
      const ws = this.sockets.get(p.id);
      if (!ws || ws.readyState !== 1) continue;
      if (!p.known) { p.known = new Set(); p.leaves = []; }
      const seen = new Set();
      const enter = [], up = [];
      for (const e of this.near(p.plane, p.x, p.y, WORLD.AOI_TILES)) {
        seen.add(e.id);
        if (!p.known.has(e.id)) { p.known.add(e.id); enter.push(this.describe(e)); }
        else {
          const u = [e.id, +e.x.toFixed(2), +e.y.toFixed(2), e.dir || 2, e.anim || 'idle', e.animSeq || 0, e.hp !== undefined ? e.hp : -1];
          if (e.visDirty) { u.push(e.visual()); e.visDirty = false; }
          up.push(u);
        }
      }
      const leave = [];
      for (const id of p.known) if (!seen.has(id)) { leave.push(id); p.known.delete(id); }
      for (const id of p.leaves) leave.push(id);
      p.leaves = [];
      // depleted nodes near player (sent on entry into AOI once per key)
      ws.send(JSON.stringify({ t: MSG.SNAP, enter, up, leave, self: p.selfState() }));
    }
  }

  // Persist every online player (each in its own atomic write), plus meta and
  // ledger. Offline players already live durably in the store.
  async saveAll() {
    if (this._saving || !this.store) return;
    this._saving = true;
    try {
      for (const p of this.players.values()) {
        try { await this.store.savePlayer(p.name, p.serialize()); } catch (e) { console.error('[save]', p.name, e.message); }
      }
      try { await this.store.saveMeta(this.houseIdx); } catch (e) { console.error('[save] meta', e.message); }
      try { await this.ledger.save(); } catch (e) { console.error('[save] ledger', e.message); }
    } finally { this._saving = false; }
  }

  // Durably persist one player right now (used on logout / important moments).
  async persistPlayer(p) {
    if (!this.store) return;
    try { await this.store.savePlayer(p.name, p.serialize()); this.saved[p.name] = p.serialize(); } catch (e) { console.error('[persist]', p.name, e.message); }
  }

  async shutdown() {
    if (this.timer) clearInterval(this.timer);
    if (this.saveTimer) clearInterval(this.saveTimer);
    await this.saveAll();
    if (this.store) await this.store.close();
  }
}
export { ANCHORS, ARENA };

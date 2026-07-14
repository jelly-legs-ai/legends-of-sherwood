// Player entity: skills/xp/milestones, inventory, equipment, bank, quests,
// serialization. All mutation happens here so the rules live in one place.

import { SKILLS, XP_TABLE, levelForXp, MAX_LEVEL, MILESTONE_LEVELS, MILESTONE_SHILLINGS, combatLevel, MSG, PLANE, FX, COMBAT } from '../../shared/constants.js';
import { ITEMS } from '../../shared/data/items.js';
import { PRAYERS, ABILITIES, RELICS } from '../../shared/data/skills.js';
import { QUESTS } from '../../shared/data/quests.js';

const INV_SIZE = 28;
export const EQUIP_SLOTS = ['head', 'torso', 'legs', 'feet', 'hands', 'weapon', 'shield', 'neck', 'cape', 'ammo', 'aura', 'mount'];

export class Player {
  constructor(world, name, saved, look = {}) {
    this.world = world;
    this.kind = 'player';
    this.name = name;
    this.wallet = null;              // bound Robinhood-chain sign-in wallet (rh1…); withdrawals go only here
    this.plane = PLANE.OVERWORLD;
    this.x = COMBAT.PLAYER_RESPAWN.x + 0.5; this.y = COMBAT.PLAYER_RESPAWN.y + 0.5;
    this.dir = 2; this.anim = 'idle'; this.animSeq = 0;
    this.sex = look.sex === 'female' ? 'female' : 'male';
    this.skin = look.skin || 'light';
    this.hair = look.hair || ['plain', 'dark_brown'];
    this.xp = Object.fromEntries(SKILLS.map(s => [s, 0]));
    this.xp.constitution = XP_TABLE[10]; // start with 10 constitution
    this.inv = new Array(INV_SIZE).fill(null);   // {id, qty}
    this.equip = {};                              // slot -> {id, qty}
    this.bank = {};                               // id -> qty
    this.quests = {};                             // id -> {step, n, done}
    this.kills = {};                              // mobType -> count
    this.milestonesPaid = {};                     // skill -> [levels]
    this.boosts = {};                             // skill -> {amt, until}
    this.prayersOn = new Set();
    this.prayerPts = this.level('prayer');
    this.energy = 100; this.run = true;
    this.pouch = 0;                               // at-risk $LoS pouch (wilderness)
    this.coinPouch = 0;                           // coins kept on the person; safe on death
    this.farm = {};                               // "x,y" -> {crop, t0}
    this.house = { furniture: {} };
    this.relics = {};
    this.dungeonBest = 0;
    this.task = null;                             // taskboard {id, n}
    this.pets = [];                               // claimed roster [{id, xp}] — untradable
    this.activePet = null;                        // roster index of the active pet
    this.activePetEnt = null;                     // live pet entity id (not persisted)
    this.abilityCds = {};
    this.effects = {};                            // shield/berserk timers
    this.style = 'balanced';
    this.PRAYERS = PRAYERS;
    if (saved) this.load(saved);
    this.hp = this.hp ?? this.maxHp;
  }

  get maxHp() { return 10 + this.level('constitution'); }
  level(skill) {
    let l = levelForXp(this.xp[skill] || 0);
    const b = this.boosts[skill];
    if (b && b.until > Date.now()) l += b.amt;
    return Math.min(MAX_LEVEL + 5, l);
  }
  baseLevel(skill) { return levelForXp(this.xp[skill] || 0); }
  combatLevel() {
    return combatLevel(Object.fromEntries(['attack', 'strength', 'defence', 'constitution', 'ranged', 'magic', 'prayer', 'summoning'].map(s => [s, this.baseLevel(s)])));
  }

  addXp(skill, amount) {
    if (!SKILLS.includes(skill) || amount <= 0) return;
    const before = this.baseLevel(skill);
    this.xp[skill] = Math.min(200000000, (this.xp[skill] || 0) + Math.round(amount));
    const after = this.baseLevel(skill);
    this.world.send(this, { t: 'xp', skill, xp: this.xp[skill], gain: Math.round(amount) });
    if (after > before) {
      this.world.send(this, { t: MSG.LEVELUP, skill, level: after });
      this.world.fx(this.plane, this.x, this.y, FX.LEVELUP, { id: this.id });
      this.world.broadcastNear(this.plane, this.x, this.y, { t: MSG.MSGBOX, kind: 'level', m: `${this.name} reached ${skill} level ${after}!` });
      if (skill === 'constitution') this.hp = Math.min(this.maxHp, this.hp + (after - before));
      if (skill === 'prayer') this.prayerPts = Math.min(after, this.prayerPts + 1);
      // $LoS milestones — 5,10,20,25,50,75,99, gradually increasing; 99 pays big
      const paid = this.milestonesPaid[skill] || (this.milestonesPaid[skill] = []);
      for (const ml of MILESTONE_LEVELS) {
        if (after >= ml && !paid.includes(ml)) {
          paid.push(ml);
          this.world.earn(this, MILESTONE_SHILLINGS[ml], `milestone:${skill}:${ml}`);
          this.world.send(this, { t: MSG.MSGBOX, kind: 'milestone', m: `Milestone! ${skill} ${ml} — ${MILESTONE_SHILLINGS[ml]} $LoS earned.` });
          if (ml === 99) this.world.announce(`♛ ${this.name} has achieved level 99 ${skill} — a true Legend of Sherwood! (+${MILESTONE_SHILLINGS[99]} $LoS)`);
        }
      }
    }
  }

  // ---------------- inventory ----------------
  countItem(id) {
    let n = 0;
    for (const s of this.inv) if (s && s.id === id) n += s.qty;
    return n;
  }
  hasTool(tool) {
    if (this.equip.weapon && (ITEMS[this.equip.weapon.id]?.tool === tool)) return ITEMS[this.equip.weapon.id];
    for (const s of this.inv) if (s && ITEMS[s.id]?.tool === tool) return ITEMS[s.id];
    return null;
  }
  addItem(id, qty = 1) {
    const def = ITEMS[id];
    if (!def) return false;
    if (def.stack) {
      for (const s of this.inv) if (s && s.id === id) { s.qty += qty; this.invDirty(); return true; }
      const i = this.inv.findIndex(s => !s);
      if (i < 0) return false;
      this.inv[i] = { id, qty };
      this.invDirty(); return true;
    }
    let need = qty;
    for (let i = 0; i < this.inv.length && need > 0; i++) if (!this.inv[i]) { this.inv[i] = { id, qty: 1 }; need--; }
    this.invDirty();
    return need === 0;
  }
  removeItem(id, qty = 1) {
    if (this.countItem(id) < qty) return false;
    let need = qty;
    for (let i = 0; i < this.inv.length && need > 0; i++) {
      const s = this.inv[i];
      if (s && s.id === id) {
        const take = Math.min(need, s.qty);
        s.qty -= take; need -= take;
        if (s.qty <= 0) this.inv[i] = null;
      }
    }
    this.invDirty();
    return true;
  }
  freeSlots() { return this.inv.filter(s => !s).length; }
  invDirty() { this.world.send(this, { t: 'inv', inv: this.inv, equip: this.equip }); }

  meetsReq(def) {
    for (const [sk, lv] of Object.entries(def.req || {})) if (this.baseLevel(sk) < lv) return `Requires ${sk} ${lv}`;
    return null;
  }
  equipItem(slotIdx) {
    const s = this.inv[slotIdx];
    if (!s) return;
    const def = ITEMS[s.id];
    if (!def || !def.slot) return this.world.send(this, { t: MSG.MSGBOX, m: "You can't wear that." });
    const bad = this.meetsReq(def);
    if (bad) return this.world.send(this, { t: MSG.MSGBOX, m: bad });
    const slot = def.slot;
    if (def.twoHand && this.equip.shield) { if (!this.addItemFromEquip('shield')) return; }
    if (slot === 'shield' && this.equip.weapon && ITEMS[this.equip.weapon.id]?.twoHand) { if (!this.addItemFromEquip('weapon')) return; }
    const prev = this.equip[slot];
    this.inv[slotIdx] = null;
    if (def.stack && prev && prev.id === s.id) prev.qty += s.qty;
    else {
      this.equip[slot] = { id: s.id, qty: s.qty };
      if (prev) this.inv[slotIdx] = prev;
    }
    this.visDirty = true;
    this.invDirty();
    if (slot === 'mount' || slot === 'aura') {
      if (slot === 'mount') this.mounted = false;      // a new mount starts stabled
      this.world.syncRide?.(this);
    }
    this.questProgress('equip', s.id);
  }
  addItemFromEquip(slot) {
    const e = this.equip[slot];
    if (!e) return true;
    if (this.freeSlots() === 0 && !(ITEMS[e.id].stack && this.countItem(e.id))) { this.world.send(this, { t: MSG.MSGBOX, m: 'No inventory space.' }); return false; }
    delete this.equip[slot];
    this.addItem(e.id, e.qty);
    this.visDirty = true;
    if (slot === 'mount' || slot === 'aura') {
      if (slot === 'mount') this.mounted = false;      // unsaddling dismounts
      this.world.syncRide?.(this);
    }
    return true;
  }

  bonuses() {
    const b = { acc: 0, str: 0, def: 0, racc: 0, rstr: 0, macc: 0, mdmg: 0 };
    for (const slot of Object.keys(this.equip)) {
      const def = ITEMS[this.equip[slot].id];
      if (def?.bonus) for (const k of Object.keys(def.bonus)) b[k] = (b[k] || 0) + def.bonus[k];
    }
    return b;
  }
  combatStyle() {
    const w = this.equip.weapon ? ITEMS[this.equip.weapon.id] : null;
    return w?.style || 'melee';
  }
  weaponSpeed() {
    const w = this.equip.weapon ? ITEMS[this.equip.weapon.id] : null;
    return w?.speed || 2400;
  }
  prayerBoost(skill) {
    let m = 1;
    for (const pid of this.prayersOn) {
      const pr = PRAYERS[pid];
      if (pr?.boost?.[skill]) m += pr.boost[skill];
    }
    return m;
  }
  protectedFrom(style) {
    for (const pid of this.prayersOn) if (PRAYERS[pid]?.protect === style) return true;
    return false;
  }

  // Visual descriptor for the client paperdoll compositor
  visual() {
    const v = { sex: this.sex, skin: this.skin, hair: this.hair };
    const map = (slot, layer) => {
      const e = this.equip[slot];
      if (!e) return;
      const def = ITEMS[e.id];
      if (def?.vis) v[layer] = def.vis.layer === 'weapon' ? [def.vis.type, def.vis.color, def.vis.glow] : [def.vis.sheet, def.vis.color, def.vis.glow, def.vis.fx];
    };
    map('torso', 'torso'); map('legs', 'legs'); map('feet', 'feet'); map('hands', 'hands');
    map('head', 'head'); map('weapon', 'weapon'); map('shield', 'shield'); map('cape', 'behind');
    return v;
  }

  selfState() {
    return {
      hp: this.hp, mhp: this.maxHp, pray: +this.prayerPts.toFixed(1), energy: this.energy | 0,
      x: +this.x.toFixed(2), y: +this.y.toFixed(2), plane: this.plane, pouch: this.pouch,
    };
  }

  onKill(mobType) {
    this.kills[mobType] = (this.kills[mobType] || 0) + 1;
    // quest + task hooks
    for (const [qid, st] of Object.entries(this.quests)) {
      if (st.done) continue;
      const step = QUESTS[qid]?.steps[st.step];
      if (step?.type === 'kill' && step.mob === mobType) {
        st.n = (st.n || 0) + 1;
        this.world.send(this, { t: 'quest', id: qid, step: st.step, n: st.n, of: step.count });
        if (st.n >= step.count) this.advanceQuest(qid);
      }
    }
    if (this.task && !this.task.done && this.task.kill === mobType) {
      this.task.n++;
      this.world.send(this, { t: MSG.MSGBOX, kind: 'task', m: `Task: ${this.task.n}/${this.task.count}` });
      if (this.task.n >= this.task.count) { this.task.done = true; this.world.send(this, { t: MSG.MSGBOX, kind: 'task', m: 'Task complete! Return to Taskmaster Gil.' }); }
    }
  }
  questProgress(type, key, n = 1) {
    for (const [qid, st] of Object.entries(this.quests)) {
      if (st.done) continue;
      const step = QUESTS[qid]?.steps[st.step];
      if (!step || step.type !== type) continue;
      const match = (type === 'node' && step.node === key) || (type === 'cast' && step.spell === key)
        || (type === 'make' && step.recipe === key) || (type === 'bury') || (type === 'equip' && (!step.item || key === step.item))
        || (type === 'dungeon' && key >= step.floor);
      if (!match) continue;
      st.n = (st.n || 0) + n;
      const need = step.count || 1;
      this.world.send(this, { t: 'quest', id: qid, step: st.step, n: st.n, of: need });
      if (st.n >= need) this.advanceQuest(qid);
    }
  }
  advanceQuest(qid) {
    const q = QUESTS[qid];
    const st = this.quests[qid];
    st.step++; st.n = 0;
    if (st.step >= q.steps.length) {
      st.done = true;
      const r = q.rewards || {};
      if (r.coins) this.addItem('coins', r.coins);
      if (r.shillings) this.world.earn(this, r.shillings, `quest:${qid}`);
      for (const [id, qty] of Object.entries(r.items || {})) this.addItem(id, qty);
      for (const [sk, amt] of Object.entries(r.xp || {})) this.addXp(sk, amt);
      this.world.send(this, { t: 'questDone', id: qid, name: q.name, outro: q.outro });
      this.world.announce(`${this.name} completed the quest "${q.name}"!`);
    } else {
      const step = q.steps[st.step];
      for (const [id, qty] of Object.entries(step.give || {})) this.addItem(id, qty);
      this.world.send(this, { t: 'quest', id: qid, step: st.step, n: 0, of: step.count || 1, hint: step.hint });
    }
  }

  serialize() {
    return {
      sex: this.sex, skin: this.skin, hair: this.hair, xp: this.xp, inv: this.inv, equip: this.equip,
      bank: this.bank, quests: this.quests, kills: this.kills, milestonesPaid: this.milestonesPaid,
      pouch: this.pouch, coinPouch: this.coinPouch, farm: this.farm, house: this.house, relics: this.relics, dungeonBest: this.dungeonBest,
      task: this.task, x: this.x, y: this.y, hp: this.hp, style: this.style,
      pets: this.pets, activePet: this.activePet, wallet: this.wallet,
    };
  }
  load(s) {
    Object.assign(this, {
      sex: s.sex ?? this.sex, skin: s.skin ?? this.skin, hair: s.hair ?? this.hair,
      xp: { ...this.xp, ...s.xp }, inv: s.inv ?? this.inv, equip: s.equip ?? {}, bank: s.bank ?? {},
      quests: s.quests ?? {}, kills: s.kills ?? {}, milestonesPaid: s.milestonesPaid ?? {},
      pouch: s.pouch ?? 0, coinPouch: s.coinPouch ?? 0, farm: s.farm ?? {}, house: s.house ?? { furniture: {} }, relics: s.relics ?? {},
      dungeonBest: s.dungeonBest ?? 0, task: s.task ?? null, hp: s.hp, style: s.style ?? 'balanced',
      pets: Array.isArray(s.pets) ? s.pets : [], activePet: s.activePet ?? null,
      wallet: s.wallet ?? this.wallet,
    });
    if (typeof s.x === 'number' && typeof s.y === 'number') { this.x = s.x; this.y = s.y; }
    this.plane = PLANE.OVERWORLD; // always rejoin the overworld
    while (this.inv.length < INV_SIZE) this.inv.push(null);
  }
}
export { ABILITIES, RELICS };

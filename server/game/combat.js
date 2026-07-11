// Combat resolution: melee / ranged / magic, PvE and PvP, projectiles as FX,
// XP awards per damage, death and loot transfer.

import { COMBAT, MSG, FX, PLANE, WILDERNESS_Y } from '../../shared/constants.js';
import { MOBS } from '../../shared/data/mobs.js';
import { ITEMS } from '../../shared/data/items.js';
import { SPELLS, ABILITIES } from '../../shared/data/skills.js';
import { ANCHORS } from '../../shared/data/world.js';

function roll(attRoll, defRoll) { return Math.random() < COMBAT.ACCURACY(attRoll, defRoll); }

export function playerAttackRolls(p) {
  const b = p.bonuses();
  const style = p.combatStyle();
  if (style === 'ranged') return { style, acc: COMBAT.ROLL(p.level('ranged') * p.prayerBoost('ranged'), b.racc), max: COMBAT.MAX_HIT(p.level('ranged') * p.prayerBoost('ranged'), b.rstr) };
  if (style === 'magic') return { style, acc: COMBAT.ROLL(p.level('magic') * p.prayerBoost('magic'), b.macc), max: 0 };
  return { style, acc: COMBAT.ROLL(p.level('attack') * p.prayerBoost('attack'), b.acc), max: COMBAT.MAX_HIT(p.level('strength') * p.prayerBoost('strength'), b.str) };
}
export function playerDefRoll(p) {
  const b = p.bonuses();
  return COMBAT.ROLL(p.level('defence') * p.prayerBoost('defence'), b.def);
}

function grantCombatXp(p, style, dmg) {
  const per = 4 * dmg;
  if (style === 'melee') {
    if (p.style === 'accurate') p.addXp('attack', per);
    else if (p.style === 'aggressive') p.addXp('strength', per);
    else if (p.style === 'defensive') p.addXp('defence', per);
    else { p.addXp('attack', per / 3); p.addXp('strength', per / 3); p.addXp('defence', per / 3); }
  } else if (style === 'ranged') p.addXp('ranged', per);
  else if (style === 'magic') p.addXp('magic', per);
  p.addXp('constitution', dmg * 1.33);
}

const RANGE = { melee: 1.7, ranged: 8, magic: 9 };

export function tickCombat(world, p, now) {
  if (!p.target || p.hp <= 0) return;
  const t = world.entities.get(p.target);
  if (!t || t.hp <= 0 || t.plane !== p.plane) { p.target = null; return; }
  // PvP legality
  if (t.kind === 'player' && !pvpAllowed(world, p, t)) { p.target = null; return; }
  if (t.kind === 'npc') { p.target = null; return; }
  const style = p.combatStyle();
  const d = Math.hypot(t.x - p.x, t.y - p.y);
  if (d > RANGE[style]) {
    // walk toward target
    if (!p.vel || now - p.velT > 400) { p.path = [{ x: t.x | 0, y: t.y | 0 }]; }
    return;
  }
  p.path = null;
  const speed = p.weaponSpeed() * (p.effects.haste && p.effects.haste > now ? 0.7 : 1);
  if (now - (p.lastAttack || 0) < speed) return;
  p.lastAttack = now;
  p.dir = Math.abs(t.x - p.x) > Math.abs(t.y - p.y) ? (t.x > p.x ? 3 : 1) : (t.y > p.y ? 2 : 0);

  if (style === 'ranged') {
    const ammo = p.equip.ammo;
    const w = ITEMS[p.equip.weapon?.id];
    if (w?.usesAmmo && (!ammo || ammo.qty < 1)) { world.send(p, { t: MSG.MSGBOX, m: 'Out of arrows!' }); p.target = null; return; }
    if (w?.usesAmmo) { ammo.qty--; if (ammo.qty <= 0) delete p.equip.ammo; p.invDirty(); }
    p.anim = 'shoot'; p.animSeq++;
    world.fx(p.plane, p.x, p.y, FX.ARROW, { tx: t.x, ty: t.y, from: p.id, to: t.id });
    setTimeout(() => resolveHit(world, p, t, 'ranged'), 300);
  } else if (style === 'magic') {
    // staff auto-attacks use the best affordable damage spell
    const spell = bestSpell(p);
    if (!spell) { world.send(p, { t: MSG.MSGBOX, m: 'You have no runes for any spell.' }); p.target = null; return; }
    castSpellAt(world, p, spell, t);
  } else {
    const w = ITEMS[p.equip.weapon?.id];
    p.anim = w?.anim === 'thrust' ? 'thrust' : 'slash'; p.animSeq++;
    resolveHit(world, p, t, 'melee');
  }
}

function bestSpell(p) {
  let best = null;
  for (const [id, s] of Object.entries(SPELLS)) {
    if (!s.dmg || p.level('magic') < s.lvl) continue;
    let ok = true;
    for (const [r, q] of Object.entries(s.runes)) if (p.countItem(r) < q) { ok = false; break; }
    if (ok && (!best || s.dmg > SPELLS[best].dmg)) best = id;
  }
  return best;
}

export function castSpellAt(world, p, spellId, target) {
  const s = SPELLS[spellId];
  const now = Date.now();
  for (const [r, q] of Object.entries(s.runes)) if (p.countItem(r) < q) { world.send(p, { t: MSG.MSGBOX, m: 'Not enough runes.' }); return false; }
  for (const [r, q] of Object.entries(s.runes)) p.removeItem(r, q);
  // Staff wielders jab-cast (the LPC staff sheets carry thrust art, not spellcast)
  p.anim = ITEMS[p.equip.weapon?.id]?.kind === 'staff' ? 'thrust' : 'spellcast';
  p.animSeq++; p.lastAttack = now;
  if (s.teleport) {
    const a = ANCHORS[s.teleport];
    world.fx(p.plane, p.x, p.y, FX.TELEPORT, { id: p.id });
    p.plane = PLANE.OVERWORLD; p.x = a.x + 0.5; p.y = a.y + 0.5; p.path = null; p.target = null;
    world.gridMove(p);
    p.addXp('magic', s.xp);
    world.fx(p.plane, p.x, p.y, FX.TELEPORT, { id: p.id });
    p.questProgress('cast', spellId);
    return true;
  }
  if (s.heal) {
    p.hp = Math.min(p.maxHp, p.hp + Math.ceil(p.maxHp * s.heal));
    world.fx(p.plane, p.x, p.y, FX.HEAL, { id: p.id });
    p.addXp('magic', s.xp);
    p.questProgress('cast', spellId);
    return true;
  }
  if (!target || target.hp <= 0) { world.send(p, { t: MSG.MSGBOX, m: 'No target.' }); return false; }
  world.fx(p.plane, p.x, p.y, FX[s.fx] || FX.FIREBOLT, { tx: target.x, ty: target.y, from: p.id, to: target.id, proj: s.proj });
  p.addXp('magic', s.xp); // base cast xp; damage xp lands with the hit
  setTimeout(() => resolveHit(world, p, target, 'magic', s), 350);
  p.questProgress('cast', spellId);
  return true;
}

export function resolveHit(world, p, t, style, spell) {
  if (!world.entities.has(t.id) || t.hp <= 0 || p.hp <= 0) return;
  const rolls = playerAttackRolls(p);
  let defRoll;
  if (t.kind === 'player') defRoll = playerDefRoll(t);
  else { const m = MOBS[t.type]; defRoll = COMBAT.ROLL(m.def * (t.lvlScale || 1), 24); }
  let dmg = 0;
  const hit = roll(rolls.acc, defRoll);
  if (hit) {
    if (style === 'magic') {
      const base = spell.dmg * (1 + p.level('magic') / 150) + p.bonuses().mdmg / 8;
      dmg = 1 + (Math.random() * base | 0);
      if (spell.leech) p.hp = Math.min(p.maxHp, p.hp + Math.ceil(dmg * spell.leech));
    } else dmg = 1 + (Math.random() * rolls.max | 0);
    if (p.effects.berserk > Date.now() && style === 'melee') dmg = Math.ceil(dmg * 1.3);
    if (p.effects.bigshot) { dmg = Math.ceil(dmg * p.effects.bigshot); p.effects.bigshot = 0; }
    if (t.kind === 'player') {
      if (t.protectedFrom(style)) dmg = Math.ceil(dmg * 0.4);
      if (t.effects?.shield > Date.now()) dmg = Math.ceil(dmg * 0.5);
    }
  }
  world.broadcastNear(p.plane, t.x, t.y, { t: MSG.HIT, id: t.id, dmg, src: p.id, crit: dmg > rolls.max * 0.85 });
  if (dmg > 0) {
    grantCombatXp(p, style, dmg);
    if (t.kind === 'player') applyPlayerDamage(world, t, dmg, p);
    else world.applyMobDamage(t, dmg, p);
  }
}

export function mobAttack(world, m, t, now) {
  const def = MOBS[m.type];
  if (now - (m.lastAttack || 0) < 2800) return;
  if (t.kind !== 'player' || t.hp <= 0) return;
  m.lastAttack = now;
  m.dir = Math.abs(t.x - m.x) > Math.abs(t.y - m.y) ? (t.x > m.x ? 3 : 1) : (t.y > m.y ? 2 : 0);
  m.anim = def.style === 'ranged' ? 'shoot' : def.style === 'magic' ? 'spellcast' : 'slash';
  m.animSeq++;
  if (def.style !== 'melee') world.fx(m.plane, m.x, m.y, def.style === 'magic' ? FX.FIREBOLT : FX.ARROW, { tx: t.x, ty: t.y, from: m.id, to: t.id });
  const scale = m.lvlScale || 1;
  const acc = COMBAT.ROLL(def.atk * scale, 20);
  const defRoll = playerDefRoll(t);
  let dmg = 0;
  if (roll(acc, defRoll)) {
    dmg = 1 + (Math.random() * COMBAT.MAX_HIT(def.atk * scale, 8) | 0);
    if (t.protectedFrom(def.style)) dmg = Math.ceil(dmg * 0.35);
    if (t.effects?.shield > Date.now()) dmg = Math.ceil(dmg * 0.5);
  }
  setTimeout(() => {
    if (t.hp <= 0) return;
    world.broadcastNear(m.plane, t.x, t.y, { t: MSG.HIT, id: t.id, dmg, src: m.id });
    if (dmg > 0) applyPlayerDamage(world, t, dmg, m);
  }, def.style === 'melee' ? 120 : 350);
}

export function applyPlayerDamage(world, p, dmg, source) {
  p.hp -= dmg;
  if (p.hp > 0) {
    // auto-retaliate
    if (!p.target && source && source.kind !== 'player') p.target = source.id;
    return;
  }
  p.hp = 0;
  p.target = null; p.path = null; p.action = null;
  world.broadcastNear(p.plane, p.x, p.y, { t: MSG.DEATH, id: p.id });
  const killer = source && source.kind === 'player' ? source : null;
  const inWild = p.plane === PLANE.OVERWORLD && p.y < WILDERNESS_Y;
  const inArena = p.plane === PLANE.COLOSSEUM;

  if (inArena) { world.duelDeath && world.duelDeath(p); return; }
  if (inWild && killer) {
    // killer takes the victim's shilling pouch + their five most valuable carried items
    if (p.pouch > 0) { world.earn(killer, p.pouch, `pvp:${p.name}`); world.send(killer, { t: MSG.MSGBOX, m: `You loot ${p.pouch} $SHL from ${p.name}'s pouch!` }); p.pouch = 0; }
    const carried = p.inv.map((s, i) => s && { ...s, i, v: (ITEMS[s.id]?.value || 0) * s.qty }).filter(Boolean).sort((a, b) => b.v - a.v);
    for (const s of carried.slice(0, 5)) { world.dropItem(p.plane, p.x, p.y, s.id, s.qty, killer.id); p.inv[s.i] = null; }
    p.invDirty();
    world.announce(`☠ ${killer.name} has slain ${p.name} in the Wild Lands!`);
  }
  const dead = { plane: p.plane, x: p.x, y: p.y };
  setTimeout(() => {
    if (!world.players.has(p.name)) return;
    p.plane = PLANE.OVERWORLD;
    p.x = COMBAT.PLAYER_RESPAWN.x + 0.5; p.y = COMBAT.PLAYER_RESPAWN.y + 0.5;
    p.hp = p.maxHp; p.prayerPts = Math.min(p.level('prayer'), p.prayerPts + 5);
    world.gridMove(p);
    world.send(p, { t: MSG.RESPAWN, x: p.x, y: p.y });
  }, COMBAT.RESPAWN_MS);
  return dead;
}

export function pvpAllowed(world, a, b) {
  if (a.plane === PLANE.COLOSSEUM && b.plane === PLANE.COLOSSEUM) {
    const duel = world.duels.get(a.duelId);
    return duel && a.duelId === b.duelId && duel.started;
  }
  return a.plane === PLANE.OVERWORLD && b.plane === PLANE.OVERWORLD && a.y < WILDERNESS_Y && b.y < WILDERNESS_Y;
}

export function useAbility(world, p, abilityId) {
  const ab = ABILITIES[abilityId];
  if (!ab) return;
  if (p.baseLevel(ab.skill) < ab.lvl) return world.send(p, { t: MSG.MSGBOX, m: `Requires ${ab.skill} ${ab.lvl}.` });
  const now = Date.now();
  if ((p.abilityCds[abilityId] || 0) > now) return world.send(p, { t: MSG.MSGBOX, m: 'Not ready yet.' });
  p.abilityCds[abilityId] = now + ab.cd;
  world.send(p, { t: 'cooldown', ability: abilityId, until: p.abilityCds[abilityId] });
  const t = p.target ? world.entities.get(p.target) : null;
  switch (ab.effect) {
    case 'heal': p.hp = Math.min(p.maxHp, p.hp + Math.ceil(p.maxHp * ab.mult)); world.fx(p.plane, p.x, p.y, FX.HEAL, { id: p.id }); break;
    case 'famHeal': if (p.familiar) { p.hp = Math.min(p.maxHp, p.hp + Math.ceil(p.maxHp * ab.mult)); world.fx(p.plane, p.x, p.y, FX.SUMMON, { id: p.id }); } break;
    case 'shield': p.effects.shield = now + ab.dur; world.fx(p.plane, p.x, p.y, FX.BLOCK, { id: p.id }); break;
    case 'strBoost': p.effects.berserk = now + ab.dur; world.fx(p.plane, p.x, p.y, FX.CRIT, { id: p.id }); break;
    case 'accBoost': p.effects.haste = now + 8000; world.fx(p.plane, p.x, p.y, FX.SPARK, { id: p.id }); break;
    case 'bigshot': p.effects.bigshot = ab.mult; world.fx(p.plane, p.x, p.y, FX.CRIT, { id: p.id }); break;
    case 'aoe': {
      p.anim = p.combatStyle() === 'ranged' ? 'shoot' : p.combatStyle() === 'magic' ? 'spellcast' : 'slash';
      p.animSeq++;
      let hits = 0;
      for (const e of world.near(p.plane, p.x, p.y, 3.2)) {
        if (e.kind !== 'mob' || e.hp <= 0) continue;
        const rolls = playerAttackRolls(p);
        const dmg = Math.ceil((1 + Math.random() * Math.max(4, rolls.max)) * ab.mult);
        world.broadcastNear(p.plane, e.x, e.y, { t: MSG.HIT, id: e.id, dmg, src: p.id });
        grantCombatXp(p, rolls.style, dmg);
        world.applyMobDamage(e, dmg, p);
        if (++hits >= 6) break;
      }
      world.fx(p.plane, p.x, p.y, FX.CRIT, { id: p.id, aoe: 1 });
      break;
    }
  }
}

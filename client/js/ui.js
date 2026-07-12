// DOM UI: side panels, big windows (bank/GE/shop/dungeon/house), dialogue,
// context menus, chat, toasts, HUD orbs, ability bar.

import { SKILLS, XP_TABLE, MSG, MILESTONE_LEVELS, MILESTONE_SHILLINGS, levelForXp } from '/shared/constants.js';
import { ITEMS } from '/shared/data/items.js';
import { RECIPES, SPELLS, PRAYERS, ABILITIES, DUNGEON, FURNITURE } from '/shared/data/skills.js';
import { QUESTS } from '/shared/data/quests.js';
import { itemIcon } from './sprites.js';
import { worldMapCanvas } from './renderer.js';
import { TOWNS } from '/shared/data/world.js';
import { REGIONS, WILDERNESS_Y, WORLD } from '/shared/constants.js';

const $ = (s) => document.querySelector(s);
let G = null; // game state ref

export function initUI(game) {
  G = game;
  for (const b of document.querySelectorAll('#tabs button'))
    b.onclick = () => { document.querySelectorAll('#tabs button').forEach(x => x.classList.remove('on')); b.classList.add('on'); G.tab = b.dataset.tab; renderPanel(); };
  $('#bigwin-x').onclick = () => closeWin();
  $('#chat-in').addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      const v = e.target.value.trim();
      if (v) G.net.send({ t: MSG.CHAT, m: v });
      e.target.value = '';
      e.target.blur();
    }
    if (e.key === 'Escape') e.target.blur();
  });
  document.addEventListener('click', () => hideCtx());
  renderPanel();
}

// ---------------- side panel ----------------
export function renderPanel() {
  if (!G || !G.me) return;
  const p = $('#panel');
  switch (G.tab || 'inv') {
    case 'inv': return renderInv(p);
    case 'equip': return renderEquip(p);
    case 'skills': return renderSkills(p);
    case 'quests': return renderQuests(p);
    case 'prayer': return renderPrayers(p);
    case 'magic': return renderMagic(p);
    case 'craft': return renderCraft(p);
    case 'pets': return renderPets(p);
  }
}

function iconCanvas(id) {
  const src = itemIcon(id);
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}

function renderInv(p) {
  p.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'inv-grid';
  G.inv.forEach((s, i) => {
    const d = document.createElement('div');
    d.className = 'inv-slot';
    if (s) {
      d.appendChild(iconCanvas(s.id));
      if (s.qty > 1) { const q = document.createElement('span'); q.className = 'qty'; q.textContent = fmt(s.qty); d.appendChild(q); }
      d.onmouseenter = (e) => tooltip(e, itemTip(s.id, s.qty));
      d.onmouseleave = hideTooltip;
      // left-click: perform the item's primary action; right-click: full menu
      d.onclick = (e) => { e.stopPropagation(); invPrimary(s, i, e); };
      d.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); invMenu(e, s, i); };
    }
    grid.appendChild(d);
  });
  p.appendChild(grid);
}
// One-click primary action per item category (bank/shop contexts still apply).
function invPrimary(s, i, e) {
  const def = ITEMS[s.id] || {};
  if (G.bankOpen) return G.net.send({ t: MSG.BANK, deposit: i });
  if (def.pet) return confirmClaimPet(s, i);   // warn: claiming binds it forever
  if (def.slot) return G.net.send({ t: MSG.EQUIP, slot: i });
  if (def.food || def.potion) return G.net.send({ t: MSG.EAT, slot: i });
  if (def.bones) return G.net.send({ t: MSG.BURY, slot: i });
  if (def.pouch) return G.net.send({ t: MSG.SUMMON, pouch: s.id });
  if (s.id.endsWith('_logs') || s.id === 'logs') return G.net.send({ t: MSG.USE_ITEM, slot: i });
  if (s.id.endsWith('_seed')) { G.selectedSeed = s.id; return toast(`You'll plant ${def.name} next.`); }
  invMenu(e, s, i); // no obvious primary — show the menu
}

function invMenu(e, s, i) {
  const def = ITEMS[s.id] || {};
  const opts = [];
  if (def.pet) opts.push(['🐾 Claim (binds forever)', () => confirmClaimPet(s, i)]);
  if (def.slot) opts.push(['Wear / Wield', () => G.net.send({ t: MSG.EQUIP, slot: i })]);
  if (def.food) opts.push(['Eat', () => G.net.send({ t: MSG.EAT, slot: i })]);
  if (def.potion) opts.push(['Drink', () => G.net.send({ t: MSG.EAT, slot: i })]);
  if (def.bones) opts.push(['Bury', () => G.net.send({ t: MSG.BURY, slot: i })]);
  if (def.pouch) opts.push(['Summon', () => G.net.send({ t: MSG.SUMMON, pouch: s.id })]);
  if (s.id.endsWith('_logs') || s.id === 'logs') opts.push(['Light fire', () => G.net.send({ t: MSG.USE_ITEM, slot: i })]);
  if (s.id.endsWith('_seed')) opts.push(['Select for planting', () => { G.selectedSeed = s.id; toast(`You'll plant ${def.name} next.`); }]);
  if (G.bankOpen) opts.push(['Deposit 1', () => G.net.send({ t: MSG.BANK, deposit: i, qty: 1 })], ['Deposit all', () => G.net.send({ t: MSG.BANK, deposit: i })]);
  if (G.shopOpen) opts.push(['Sell 1', () => G.net.send({ t: MSG.DIALOG, npc: G.shopOpen, opt: 'sell', slot: i, qty: 1 })], ['Sell 5', () => G.net.send({ t: MSG.DIALOG, npc: G.shopOpen, opt: 'sell', slot: i, qty: 5 })]);
  opts.push(['Drop', () => G.net.send({ t: MSG.DROP, slot: i })]);
  ctxMenu(e.clientX, e.clientY, opts);
}
function renderEquip(p) {
  p.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'equip-grid';
  const slots = [null, 'head', null, 'cape', 'torso', 'neck', 'weapon', 'legs', 'shield', 'hands', 'feet', 'ammo'];
  for (const sl of slots) {
    const d = document.createElement('div');
    if (!sl) { d.style.visibility = 'hidden'; grid.appendChild(d); continue; }
    d.className = 'equip-slot';
    const e = G.equip[sl];
    if (e) {
      d.classList.add('filled');
      d.appendChild(iconCanvas(e.id));
      const t = document.createElement('div');
      t.textContent = (ITEMS[e.id]?.name || e.id) + (e.qty > 1 ? ` ×${fmt(e.qty)}` : '');
      d.appendChild(t);
      d.onclick = () => G.net.send({ t: MSG.UNEQUIP, slot: sl });
      d.onmouseenter = (ev) => tooltip(ev, itemTip(e.id, e.qty));
      d.onmouseleave = hideTooltip;
    } else d.textContent = sl;
    grid.appendChild(d);
  }
  p.appendChild(grid);
  const styleRow = document.createElement('div');
  styleRow.style.marginTop = '8px';
  styleRow.innerHTML = `<div class="craft-cat">Combat style</div>`;
  for (const st of ['balanced', 'accurate', 'aggressive', 'defensive']) {
    const b = document.createElement('button');
    b.className = 'pray-btn' + (G.style === st ? ' on' : '');
    b.style.marginRight = '4px';
    b.textContent = st;
    b.onclick = () => { G.style = st; G.net.send({ t: MSG.STYLE, style: st }); renderPanel(); };
    styleRow.appendChild(b);
  }
  p.appendChild(styleRow);
}
function renderSkills(p) {
  p.innerHTML = '';
  let total = 0;
  for (const sk of SKILLS) {
    const xp = G.xp[sk] || 0;
    const lvl = levelForXp(xp);
    total += lvl;
    const row = document.createElement('div');
    row.className = 'skill-row';
    const cur = XP_TABLE[lvl], next = XP_TABLE[Math.min(99, lvl + 1)];
    const pct = lvl >= 99 ? 100 : Math.floor(100 * (xp - cur) / Math.max(1, next - cur));
    row.innerHTML = `<div style="flex:1"><div style="display:flex;justify-content:space-between"><span>${sk[0].toUpperCase() + sk.slice(1)}</span><span class="lv">${lvl}</span></div><div class="bar"><i style="width:${pct}%"></i></div></div>`;
    row.onmouseenter = (e) => {
      const paid = (G.milestones[sk] || []);
      const nextMile = MILESTONE_LEVELS.find(m => !paid.includes(m) && m > lvl);
      tooltip(e, `<b>${sk}</b> — level ${lvl}<br>XP: ${fmt(xp)} / next lvl: ${lvl >= 99 ? 'MAX' : fmt(next - xp)}<br>` +
        `Milestones paid: ${paid.join(', ') || 'none'}<br>` +
        (nextMile ? `Next milestone: lvl ${nextMile} → <b>${MILESTONE_SHILLINGS[nextMile]} $SHL</b>` : 'All milestones earned!') +
        (lvl < 99 ? `<br>Level 99 pays <b>${MILESTONE_SHILLINGS[99]} $SHL</b>` : ''));
    };
    row.onmouseleave = hideTooltip;
    p.appendChild(row);
  }
  const tot = document.createElement('div');
  tot.style.cssText = 'margin-top:6px;text-align:center;color:#ffd75e';
  tot.textContent = `Total level: ${total}`;
  p.appendChild(tot);
}
function renderQuests(p) {
  p.innerHTML = '';
  const entries = Object.entries(G.quests);
  if (!entries.length) p.innerHTML = '<i>No quests yet — look for ❗ above folk of Sherwood.</i>';
  for (const [qid, st] of entries) {
    const q = QUESTS[qid];
    if (!q) continue;
    const d = document.createElement('div');
    d.className = 'quest-item' + (st.done ? ' done' : '');
    const step = q.steps[st.step];
    d.innerHTML = `<div class="qname">${q.name}</div>` +
      (st.done ? '<div class="hint">Complete ✓</div>'
        : `<div class="hint">${step?.hint || ''} ${step?.count > 1 ? `(${st.n || 0}/${step.count})` : ''}</div>`);
    p.appendChild(d);
  }
}
function renderPrayers(p) {
  p.innerHTML = `<div class="craft-cat">Prayer points: ${G.self?.pray ?? 0}</div>`;
  const grid = document.createElement('div');
  grid.className = 'pray-grid';
  const plvl = levelForXp(G.xp.prayer || 0);
  for (const [id, pr] of Object.entries(PRAYERS)) {
    const b = document.createElement('button');
    b.className = 'pray-btn' + (G.prayersOn.has(id) ? ' on' : '');
    b.disabled = plvl < pr.lvl;
    b.innerHTML = `${pr.name}<br><small>lvl ${pr.lvl}</small>`;
    b.onclick = () => G.net.send({ t: MSG.PRAYER, id });
    b.onmouseenter = (e) => tooltip(e, `<b>${pr.name}</b> (prayer ${pr.lvl})<br>${pr.boost ? Object.entries(pr.boost).map(([k, v]) => `+${Math.round(v * 100)}% ${k}`).join(', ') : ''}${pr.protect ? 'Protects from ' + pr.protect : ''}${pr.regen ? 'Speeds healing' : ''}<br>Drain: ${pr.drain}/tick`);
    b.onmouseleave = hideTooltip;
    grid.appendChild(b);
  }
  p.appendChild(grid);
}
function renderMagic(p) {
  p.innerHTML = `<div class="craft-cat">Spellbook ${G.selSpell ? '— casting: ' + SPELLS[G.selSpell].name : ''}</div>`;
  const grid = document.createElement('div');
  grid.className = 'spell-grid';
  const mlvl = levelForXp(G.xp.magic || 0);
  for (const [id, s] of Object.entries(SPELLS)) {
    const b = document.createElement('button');
    b.className = 'spell-btn' + (G.selSpell === id ? ' sel' : '');
    b.disabled = mlvl < s.lvl;
    b.innerHTML = `${s.name}<br><small>lvl ${s.lvl}</small>`;
    b.onclick = () => {
      if (s.teleport || s.heal) G.net.send({ t: MSG.CAST, spell: id });
      else { G.selSpell = G.selSpell === id ? null : id; renderPanel(); toast(G.selSpell ? `Click a target to cast ${s.name}.` : 'Spell deselected.'); }
    };
    b.onmouseenter = (e) => tooltip(e, `<b>${s.name}</b> (magic ${s.lvl})<br>${s.dmg ? 'Damage spell — base ' + s.dmg : s.teleport ? 'Teleport to ' + s.teleport : 'Heals 20% LP'}<br>Runes: ${Object.entries(s.runes).map(([r, q]) => q + ' ' + r.replace('_rune', '')).join(', ')}`);
    b.onmouseleave = hideTooltip;
    grid.appendChild(b);
  }
  p.appendChild(grid);
}
function renderCraft(p) {
  p.innerHTML = '';
  const bySkill = {};
  for (const r of RECIPES) (bySkill[r.skill] = bySkill[r.skill] || []).push(r);
  for (const [sk, list] of Object.entries(bySkill)) {
    const lvl = levelForXp(G.xp[sk] || 0);
    const cat = document.createElement('div');
    cat.className = 'craft-cat';
    cat.textContent = sk[0].toUpperCase() + sk.slice(1) + ` (lvl ${lvl})`;
    p.appendChild(cat);
    let shown = 0;
    for (const r of list) {
      const locked = lvl < r.lvl;
      if (locked && shown > 14) continue;
      const row = document.createElement('div');
      row.className = 'craft-row' + (locked ? ' locked' : '');
      row.innerHTML = `<span class="nm">${r.name} <small style="color:#8d7a4b">lvl ${r.lvl}${r.station ? ' @' + r.station : ''}</small></span>`;
      if (!locked) {
        for (const n of [1, 5]) {
          const b = document.createElement('button');
          b.textContent = '×' + n;
          b.onclick = () => G.net.send({ t: MSG.MAKE, recipe: r.id, count: n });
          row.appendChild(b);
        }
      }
      row.onmouseenter = (e) => tooltip(e, `<b>${r.name}</b> — ${r.skill} ${r.lvl}, ${r.xp}xp<br>Needs: ${Object.entries(r.inputs).map(([id, q]) => (q || '') + ' ' + (ITEMS[id]?.name || id)).join(', ')}${r.tool ? ' + ' + r.tool : ''}${r.station ? '<br>At: ' + r.station : ''}`);
      row.onmouseleave = hideTooltip;
      p.appendChild(row);
      shown++;
    }
  }
}

// ---------------- pets ----------------
import { PETS, PET_XP, petLevel, PET_MAX_LEVEL, PET_POWER } from '/shared/data/pets.js';
const CLS_INFO = {
  defense: ['🛡 Defense', 'Guards you: reduces damage taken and can block hits outright. Never attacks.'],
  offense: ['⚔ Offense', 'Fights beside you: attacks your target. Never blocks.'],
  utility: ['🎒 Utility', 'Fetches food when you are hurt, retrieves your drops, and both blocks and attacks (weaker).'],
};
function renderPets(p) {
  p.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'craft-cat';
  head.textContent = `Pet roster (${(G.pets || []).length}/12)`;
  p.appendChild(head);
  if (!(G.pets || []).length) {
    const i = document.createElement('div');
    i.style.cssText = 'color:#b3a06d;font-size:12px;line-height:1.5';
    i.innerHTML = 'No pets yet. Pets drop as <b>super-rare</b> and <b>ultra-rare</b> finds from creatures across Sherwood — the mightiest come from bosses. Pet items can be traded on the Grand Exchange until claimed.';
    p.appendChild(i);
    return;
  }
  G.pets.forEach((rec, idx) => {
    const def = PETS[rec.id];
    if (!def) return;
    const lvl = petLevel(rec.xp);
    const cur = PET_XP[lvl], next = PET_XP[Math.min(PET_MAX_LEVEL, lvl + 1)];
    const pct = lvl >= PET_MAX_LEVEL ? 100 : Math.floor(100 * (rec.xp - cur) / Math.max(1, next - cur));
    const active = G.activePet === idx;
    const row = document.createElement('div');
    row.className = 'quest-item';
    row.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
      <span class="qname">${active ? '● ' : ''}${def.name} <small style="color:#8ae0b0">Lv.${lvl}${lvl >= PET_MAX_LEVEL ? ' MAX' : ''}</small></span>
      <span style="font-size:11px;color:#b3a06d">${CLS_INFO[def.cls][0]}</span></div>
      <div class="bar" style="margin-top:3px"><i style="width:${pct}%"></i></div>`;
    const btns = document.createElement('div');
    btns.style.marginTop = '5px';
    const b = document.createElement('button');
    b.className = 'pray-btn' + (active ? ' on' : '');
    b.textContent = active ? 'Dismiss' : 'Summon';
    b.onclick = () => G.net.send(active ? { t: 'pet', dismiss: 1 } : { t: 'pet', activate: idx });
    btns.appendChild(b);
    row.appendChild(btns);
    row.onmouseenter = (e) => tooltip(e, `<b>${def.name}</b> — Tier ${def.tier} ${CLS_INFO[def.cls][0]}<br>${CLS_INFO[def.cls][1]}<br>` +
      (def.cls !== 'defense' ? `Hit: ~${PET_POWER.attackDamage(def.cls, lvl).toFixed(0)} ` : '') +
      (def.cls !== 'offense' ? `Guard: -${Math.round(PET_POWER.damageReduction(def.cls, lvl) * 100)}% dmg, ${Math.round(PET_POWER.blockChance(def.cls, lvl) * 100)}% block` : '') +
      `<br>Levels up while active as you fight (max ${PET_MAX_LEVEL}).`);
    row.onmouseleave = hideTooltip;
    p.appendChild(row);
  });
}
// First-claim warning: claiming binds the pet forever (it becomes untradable).
export function confirmClaimPet(s, i) {
  const petId = ITEMS[s.id]?.pet;
  const def = PETS[petId];
  if (!def) return;
  $('#dialogue').classList.remove('hidden');
  $('#dlg-name').textContent = `Claim ${def.name}?`;
  $('#dlg-line').textContent = `This ${CLS_INFO[def.cls][0]} pet is currently a tradable item. Claiming it binds it to you PERMANENTLY — it becomes untradable and can never be sold on the Grand Exchange. Claim it as your companion?`;
  const opts = $('#dlg-opts');
  opts.innerHTML = '';
  const yes = document.createElement('button');
  yes.textContent = '🐾 Claim forever';
  yes.onclick = () => { hideDialogue(); G.net.send({ t: 'pet', claim: i }); G.tab = 'pets'; document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x.dataset.tab === 'pets')); };
  const no = document.createElement('button');
  no.textContent = 'Keep it tradable';
  no.onclick = hideDialogue;
  opts.append(yes, no);
}

// ---------------- ability bar ----------------
export function renderAbilities() {
  const bar = $('#ability-bar');
  bar.innerHTML = '';
  let key = 1;
  G.abilityKeys = [];
  for (const [id, ab] of Object.entries(ABILITIES)) {
    const lvl = levelForXp(G.xp[ab.skill] || 0);
    if (lvl < ab.lvl) continue;
    if (key > 9) break;
    const b = document.createElement('button');
    b.className = 'ab-btn';
    b.dataset.ab = id;
    b.innerHTML = `<span class="key">${key}</span>${ab.name.split(' ')[0]}<div class="cd"></div>`;
    b.onclick = () => G.net.send({ t: MSG.ABILITY, id });
    b.onmouseenter = (e) => tooltip(e, `<b>${ab.name}</b> (${ab.skill} ${ab.lvl})<br>${ab.desc}<br>Cooldown ${ab.cd / 1000}s — key [${key}]`);
    b.onmouseleave = hideTooltip;
    bar.appendChild(b);
    G.abilityKeys.push(id);
    key++;
  }
}
export function tickCooldowns() {
  const now = Date.now();
  for (const b of document.querySelectorAll('.ab-btn')) {
    const until = G.cooldowns[b.dataset.ab] || 0;
    if (until > now) { b.classList.add('oncd'); b.querySelector('.cd').textContent = Math.ceil((until - now) / 1000); }
    else b.classList.remove('oncd');
  }
}

// ---------------- big windows ----------------
export function openWin(title, bodyFn) {
  $('#bigwin-title').textContent = title;
  const body = $('#bigwin-body');
  body.innerHTML = '';
  bodyFn(body);
  $('#bigwin').classList.remove('hidden');
}
export function closeWin() {
  $('#bigwin').classList.add('hidden');
  G.bankOpen = false; G.shopOpen = null;
}

export function openBank(bank) {
  G.bankOpen = true;
  openWin('🏦 Bank of Sherwood', (body) => {
    const info = document.createElement('div');
    info.style.marginBottom = '8px';
    info.innerHTML = `Click items to withdraw. Your pack: click items in the side panel to deposit. <button id="depall">Deposit all</button>`;
    body.appendChild(info);
    info.querySelector('#depall').onclick = () => G.net.send({ t: MSG.BANK, depositAll: 1 });
    const grid = document.createElement('div');
    grid.className = 'bank-grid';
    const entries = Object.entries(bank);
    if (!entries.length) grid.innerHTML = '<i>Empty vault.</i>';
    for (const [id, qty] of entries) {
      const d = document.createElement('div');
      d.className = 'inv-slot';
      d.appendChild(iconCanvas(id));
      const q = document.createElement('span'); q.className = 'qty'; q.textContent = fmt(qty); d.appendChild(q);
      d.onmouseenter = (e) => tooltip(e, itemTip(id, qty));
      d.onmouseleave = hideTooltip;
      d.onclick = (e) => { e.stopPropagation(); ctxMenu(e.clientX, e.clientY, [
        ['Withdraw 1', () => G.net.send({ t: MSG.BANK, withdraw: id, qty: 1 })],
        ['Withdraw 5', () => G.net.send({ t: MSG.BANK, withdraw: id, qty: 5 })],
        ['Withdraw all', () => G.net.send({ t: MSG.BANK, withdraw: id, qty: qty })],
      ]); };
      grid.appendChild(d);
    }
    body.appendChild(grid);
  });
}

export function openShop(npcEntId, npcName, shop) {
  G.shopOpen = npcEntId;
  openWin('🛒 ' + npcName, (body) => {
    body.innerHTML = `<div style="margin-bottom:6px;color:#b3a06d">Buy with copper coins (you have ${fmt(countInv('coins'))}). Sell from your pack via the side panel.</div>`;
    for (const [id, price] of shop) {
      const row = document.createElement('div');
      row.className = 'craft-row';
      const c = iconCanvas(id);
      c.style.cssText = 'width:22px;height:22px;margin-right:6px';
      row.appendChild(c);
      const nm = document.createElement('span');
      nm.className = 'nm';
      nm.innerHTML = `${ITEMS[id]?.name || id} — <span style="color:#ffd75e">${price}c</span>`;
      row.appendChild(nm);
      for (const n of [1, 5, 50]) {
        const b = document.createElement('button');
        b.textContent = '×' + n;
        b.onclick = () => G.net.send({ t: MSG.DIALOG, npc: npcEntId, opt: 'buy', item: id, qty: n });
        row.appendChild(b);
      }
      body.appendChild(row);
    }
  });
}

export function openGE(data) {
  openWin('⚖ Grand Exchange — balance: ' + fmt(data.bal) + ' $SHL', (body) => {
    const form = document.createElement('div');
    form.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px';
    form.innerHTML = `
      <select id="ge-type"><option value="buy">Buy</option><option value="sell">Sell</option></select>
      <input id="ge-item" list="ge-items" placeholder="item id" style="width:150px">
      <datalist id="ge-items">${Object.values(ITEMS).filter(i => i.tradeable).map(i => `<option value="${i.id}">${i.name}</option>`).join('')}</datalist>
      <input id="ge-qty" type="number" min="1" value="1" style="width:64px" title="quantity">
      <input id="ge-price" type="number" min="1" value="1" style="width:80px" title="price each ($SHL)">
      <button id="ge-place">Place offer</button>`;
    body.appendChild(form);
    form.querySelector('#ge-place').onclick = () => {
      G.net.send({ t: MSG.GE, place: { type: $('#ge-type').value, item: $('#ge-item').value.trim(), qty: +$('#ge-qty').value, price: +$('#ge-price').value } });
    };
    const hist = document.createElement('div');
    hist.style.cssText = 'font-size:11px;color:#8d7a4b;margin-bottom:8px';
    const prices = Object.entries(data.prices || {});
    hist.textContent = prices.length ? 'Recent prices: ' + prices.slice(-6).map(([i, p]) => `${ITEMS[i]?.name || i} @ ${p}` ).join(' · ') : 'No trades yet — set the market!';
    body.appendChild(hist);
    const head = document.createElement('div');
    head.className = 'craft-cat';
    head.textContent = 'Your offers';
    body.appendChild(head);
    if (!data.offers.length) body.appendChild(Object.assign(document.createElement('i'), { textContent: 'None open.' }));
    for (const o of data.offers) {
      const row = document.createElement('div');
      row.className = 'ge-offer';
      row.innerHTML = `<span>${o.type.toUpperCase()} ${o.left}/${o.qty} × ${ITEMS[o.item]?.name || o.item} @ ${o.price} $SHL</span>`;
      const b = document.createElement('button');
      b.textContent = 'Cancel';
      b.onclick = () => G.net.send({ t: MSG.GE, cancel: o.id });
      row.appendChild(b);
      body.appendChild(row);
    }
  });
}

export function openDungeon(best) {
  openWin('⚒ The Abyssal Depths', (body) => {
    body.innerHTML = `<div style="margin-bottom:8px">Cleared floors pay $Shillings — deeper pays more. You must clear floors in order; the stair needs an <b>Abyssal key</b> from the floor's creatures. Best floor: <b>${best}</b>.</div>`;
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(5,1fr);gap:6px';
    for (let f = 1; f <= DUNGEON.MAX_FLOOR; f++) {
      const b = document.createElement('button');
      const req = DUNGEON.floorReq(f);
      b.textContent = `Floor ${f}` + (f % 5 === 0 ? ' ☠' : '');
      b.disabled = f > best + 1 || levelForXp(G.xp.dungeoneering || 0) < req;
      b.title = `Requires dungeoneering ${req} — pays ${DUNGEON.tokenReward(f)} $SHL`;
      b.onclick = () => { G.net.send({ t: MSG.DUNGEON, floor: f }); closeWin(); };
      grid.appendChild(b);
    }
    body.appendChild(grid);
  });
}

export function openHouse(furniture) {
  openWin('🏠 Your Hideout', (body) => {
    body.innerHTML = `<div style="margin-bottom:8px">Build at the marked hotspots (Construction + hammer + materials). A Stone range lets you cook at home; a Master workbench works as a forge.</div>`;
    for (const f of FURNITURE) {
      const built = furniture[f.id];
      const row = document.createElement('div');
      row.className = 'craft-row' + (levelForXp(G.xp.construction || 0) < f.lvl ? ' locked' : '');
      row.innerHTML = `<span class="nm">${built ? '✓ ' : ''}${f.name} <small style="color:#8d7a4b">lvl ${f.lvl} — ${Object.entries(f.inputs).map(([id, q]) => q + ' ' + (ITEMS[id]?.name || id)).join(', ')}</small></span>`;
      if (!built && levelForXp(G.xp.construction || 0) >= f.lvl) {
        const b = document.createElement('button');
        b.textContent = 'Build';
        b.onclick = () => G.net.send({ t: MSG.MAKE, recipe: 'build_' + f.id, count: 1 });
        row.appendChild(b);
      }
      body.appendChild(row);
    }
    const leave = document.createElement('button');
    leave.textContent = 'Leave house';
    leave.style.marginTop = '10px';
    leave.onclick = () => { G.net.send({ t: MSG.HOUSE, leave: 1 }); closeWin(); };
    body.appendChild(leave);
  });
}

// ---------------- world map ----------------
const REGION_LABELS = [
  ['The Wild Lands ☠', 288, 48], ['Northmoor', 240, 170], ['The Grey Peaks', 490, 240],
  ['Sherwood Forest', 290, 285], ['Barnsdale Meadows', 130, 300], ['The Fenwold', 465, 455],
  ['Elderglade Wildwood', 270, 505],
];
export function openWorldMap() {
  openWin('🌐 Map of Sherwood & the North', (body) => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;width:520px;margin:0 auto';
    const c = document.createElement('canvas');
    c.width = 520; c.height = 520;
    c.style.cssText = 'width:520px;height:520px;border:2px solid #55431c;border-radius:6px;image-rendering:auto';
    const g = c.getContext('2d');
    const sc = 520 / WORLD.W;
    const lsc = sc * (WORLD.SCALE || 1); // labels are authored on the 576 grid
    g.drawImage(worldMapCanvas(), 0, 0, WORLD.W, WORLD.W, 0, 0, 520, 520);
    // region names
    g.font = 'italic 13px Georgia'; g.textAlign = 'center';
    for (const [name, x, y] of REGION_LABELS) {
      g.fillStyle = '#00000090'; g.fillText(name, x * lsc + 1, y * lsc + 1);
      g.fillStyle = '#f4e9c8'; g.fillText(name, x * lsc, y * lsc);
    }
    // towns
    g.font = 'bold 12px Georgia';
    for (const t of Object.values(TOWNS)) {
      g.fillStyle = '#ffd75e'; g.strokeStyle = '#000'; g.lineWidth = 1;
      g.beginPath(); g.arc(t.cx * sc, t.cy * sc, 4, 0, 7); g.fill(); g.stroke();
      g.fillStyle = '#00000090'; g.fillText(t.name, t.cx * sc + 1, t.cy * sc - 8 + 1);
      g.fillStyle = '#ffe98a'; g.fillText(t.name, t.cx * sc, t.cy * sc - 8);
    }
    // player marker
    if (G.self && G.self.plane === 0) {
      const px = G.self.x * sc, py = G.self.y * sc;
      g.fillStyle = '#ffffff'; g.strokeStyle = '#000';
      g.beginPath(); g.arc(px, py, 5, 0, 7); g.fill(); g.stroke();
      g.fillStyle = '#00000090'; g.fillText('You', px + 1, py - 9 + 1);
      g.fillStyle = '#ffffff'; g.fillText('You', px, py - 9);
    }
    wrap.appendChild(c);
    const note = document.createElement('div');
    note.style.cssText = 'text-align:center;color:#b3a06d;font-size:12px;margin-top:6px';
    note.textContent = 'North of the red line lies the Wild Lands — PvP is enabled and your $Shilling pouch is at risk.';
    body.appendChild(wrap);
    body.appendChild(note);
  });
}

// ---------------- dialogue ----------------
export function showDialogue(msg) {
  $('#dialogue').classList.remove('hidden');
  $('#dlg-name').textContent = msg.name;
  $('#dlg-line').textContent = msg.line;
  const opts = $('#dlg-opts');
  opts.innerHTML = '';
  for (const o of msg.opts || []) {
    const b = document.createElement('button');
    b.textContent = o.label;
    b.onclick = () => {
      hideDialogue();
      if (o.id === 'shop') openShop(msg.npc, msg.name, msg.shop);
      else G.net.send({ t: MSG.DIALOG, npc: msg.npc, opt: o.id });
    };
    opts.appendChild(b);
  }
  const x = document.createElement('button');
  x.textContent = 'Farewell';
  x.onclick = hideDialogue;
  opts.appendChild(x);
}
export function hideDialogue() { $('#dialogue').classList.add('hidden'); }

export function duelInvite(msg) {
  $('#dialogue').classList.remove('hidden');
  $('#dlg-name').textContent = 'Colosseum challenge!';
  $('#dlg-line').textContent = `${msg.from} challenges you to a duel for ${msg.stake} $SHL. Winner takes the pot.`;
  const opts = $('#dlg-opts');
  opts.innerHTML = '';
  const a = document.createElement('button');
  a.textContent = '⚔ Accept';
  a.onclick = () => { hideDialogue(); G.net.send({ t: MSG.DUEL, accept: msg.from }); };
  const d = document.createElement('button');
  d.textContent = 'Decline';
  d.onclick = () => { hideDialogue(); G.net.send({ t: MSG.DUEL, decline: 1 }); };
  opts.append(a, d);
}

// ---------------- misc ----------------
export function ctxMenu(x, y, opts) {
  const m = $('#ctx');
  m.innerHTML = '';
  for (const [label, fn] of opts) {
    const d = document.createElement('div');
    d.textContent = label;
    d.onclick = (e) => { e.stopPropagation(); hideCtx(); fn(); };
    m.appendChild(d);
  }
  m.classList.remove('hidden');
  m.style.left = Math.min(x, window.innerWidth - 170) + 'px';
  m.style.top = Math.min(y, window.innerHeight - opts.length * 32 - 10) + 'px';
}
export function hideCtx() { $('#ctx').classList.add('hidden'); }

let tipEl = null;
export function tooltip(e, html) {
  hideTooltip();
  tipEl = document.createElement('div');
  tipEl.className = 'tooltip';
  tipEl.innerHTML = html;
  document.body.appendChild(tipEl);
  const r = tipEl.getBoundingClientRect();
  tipEl.style.left = Math.min(e.clientX + 14, window.innerWidth - r.width - 8) + 'px';
  tipEl.style.top = Math.min(e.clientY + 10, window.innerHeight - r.height - 8) + 'px';
}
export function hideTooltip() { if (tipEl) { tipEl.remove(); tipEl = null; } }

function itemTip(id, qty) {
  const d = ITEMS[id] || {};
  let s = `<b>${d.name || id}</b>${qty > 1 ? ' ×' + fmt(qty) : ''}`;
  if (d.bonus) s += '<br>' + Object.entries(d.bonus).filter(([, v]) => v).map(([k, v]) => `${k}: +${v}`).join(', ');
  if (d.req && Object.keys(d.req).length) s += '<br>Req: ' + Object.entries(d.req).map(([k, v]) => `${k} ${v}`).join(', ');
  if (d.heal) s += `<br>Heals ${d.heal} LP`;
  if (d.speed) s += `<br>Speed: ${(d.speed / 1000).toFixed(1)}s`;
  s += `<br><span style="color:#8d7a4b">Value: ${fmt(d.value || 0)}c</span>`;
  return s;
}
export function toast(m, cls = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + cls;
  t.textContent = m;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 4200);
}
export function chatLine(html, cls = '') {
  const log = $('#chat-log');
  const d = document.createElement('div');
  if (cls) d.className = cls;
  d.innerHTML = html;
  log.appendChild(d);
  while (log.children.length > 120) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}
export function updateOrbs() {
  if (!G.self) return;
  const s = G.self;
  const hpP = Math.max(0, Math.min(100, 100 * s.hp / s.mhp));
  document.querySelector('.orb.hp .fill').style.height = hpP + '%';
  $('#hp-txt').textContent = s.hp;
  const prayMax = Math.max(1, levelForXp(G.xp.prayer || 0));
  document.querySelector('.orb.pray .fill').style.height = Math.min(100, 100 * s.pray / prayMax) + '%';
  $('#pray-txt').textContent = Math.floor(s.pray);
  document.querySelector('.orb.energy .fill').style.height = s.energy + '%';
  $('#energy-txt').textContent = s.energy;
  $('#shl').textContent = fmt(G.bal);
  $('#pouch').textContent = s.pouch > 0 ? ` +${s.pouch}⚠` : '';
}
export function eventBanner(m) {
  const b = $('#event-banner');
  b.textContent = m;
  b.classList.remove('hidden');
  clearTimeout(b._t);
  b._t = setTimeout(() => b.classList.add('hidden'), 12000);
}
function countInv(id) { let n = 0; for (const s of G.inv) if (s && s.id === id) n += s.qty; return n; }
export function fmt(n) {
  n = Math.floor(n);
  if (n >= 10000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 100000) return (n / 1000).toFixed(0) + 'K';
  return n.toLocaleString();
}

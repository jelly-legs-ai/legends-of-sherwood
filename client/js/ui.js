// DOM UI: side panels, big windows (bank/GE/shop/dungeon/house), dialogue,
// context menus, chat, toasts, HUD orbs, ability bar.

import { SKILLS, XP_TABLE, MSG, MILESTONE_LEVELS, MILESTONE_SHILLINGS, levelForXp } from '/shared/constants.js';
import { ITEMS } from '/shared/data/items.js';
import { RECIPES, SPELLS, PRAYERS, ABILITIES, DUNGEON, FURNITURE, NODES } from '/shared/data/skills.js';
import { QUESTS } from '/shared/data/quests.js';
import { itemIcon, nodeSprite } from './sprites.js';
import { worldMapCanvas } from './renderer.js';
import { TOWNS } from '/shared/data/world.js';
import { REGIONS, WILDERNESS_Y, WORLD } from '/shared/constants.js';
import { drawFxSprite, drawMediaIcon } from './media.js';

const $ = (s) => document.querySelector(s);

// ---- Animated pixel HUD bars (sliced from assets/ui/hudbars.png) ----
// Column 0 of each colour row is a hollow beveled casing (bbox x6-43); its
// interior is transparent. So we paint the coloured fill first, clipped to the
// current fraction, then stamp the casing frame on top — the frame masks the
// fill's edges and its hollow shows the fill through.
const hudBarsImg = new Image();
hudBarsImg.src = 'assets/ui/hudbars.png';
hudBarsImg.onload = () => { try { if (G && G.self) updateOrbs(); } catch { } };
const BAR_ROW = { hp: 131, pray: 147, energy: 163 };   // y of each colour row on the sheet
const CASE = { x: 6, w: 38, h: 11 };                   // casing bbox within col 0
const CASE_INNER = { x: 3, y: 2, w: 32, h: 7 };        // fillable hollow, relative to the casing
const BAR_GRAD = { hp: ['#f0454f', '#9c0f18'], pray: ['#4fc6f7', '#0a6ea0'], energy: ['#ffd75e', '#bf8618'] };
function drawStatBar(canvas, frac, kind) {
  if (!canvas) return;
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  g.clearRect(0, 0, W, H);
  if (!hudBarsImg.complete || !hudBarsImg.naturalWidth) return;
  const S = W / CASE.w;
  frac = Math.max(0, Math.min(1, frac));
  if (frac > 0) {                                        // coloured fill inside the socket
    const fx = CASE_INNER.x * S, fy = CASE_INNER.y * S, fh = CASE_INNER.h * S;
    const fw = CASE_INNER.w * S * frac;
    const [c0, c1] = BAR_GRAD[kind];
    const grad = g.createLinearGradient(0, fy, 0, fy + fh);
    grad.addColorStop(0, c0); grad.addColorStop(1, c1);
    g.fillStyle = grad;
    g.fillRect(fx, fy, fw, fh);
  }
  g.imageSmoothingEnabled = false;
  g.drawImage(hudBarsImg, CASE.x, BAR_ROW[kind], CASE.w, CASE.h, 0, 0, W, H);   // casing on top
}

let G = null; // game state ref
let _devcmd = null; // lazily imported to keep the ui<->devcmd dependency acyclic
const devcmd = async () => (_devcmd ??= await import('./devcmd.js'));

export function initUI(game) {
  G = game;
  for (const b of document.querySelectorAll('#tabs button'))
    b.onclick = () => { setActiveTab(b.dataset.tab); };
  // bottom system rail: social + settings. Logout leaves immediately; the rest
  // open a system panel in the same side pane.
  for (const b of document.querySelectorAll('#systabs button'))
    b.onclick = () => {
      const s = b.dataset.sys;
      if (s === 'logout') { if (confirm('Log out of Sherwood?')) location.reload(); return; }
      setActiveTab('sys_' + s);
    };
  $('#bigwin-x').onclick = () => closeWin();
  $('#cpouch-wrap').onclick = () => openCoinPouch();
  $('#chat-in').addEventListener('keydown', async (e) => {
    e.stopPropagation();
    const dev = await devcmd();
    if (dev.suggestKeydown(e)) return;                 // tab/arrows consumed by autocomplete
    if (e.key === 'Enter') {
      const v = e.target.value.trim();
      if (v.startsWith('//')) dev.runCommand(G, v);
      else if (v) G.net.send({ t: MSG.CHAT, m: v });
      e.target.value = '';
      dev.hideSuggestions();
      e.target.blur();
    }
    if (e.key === 'Escape') { e.target.blur(); dev.hideSuggestions(); }
  });
  $('#chat-in').addEventListener('input', async (e) => (await devcmd()).updateSuggestions(e.target));
  $('#chat-in').addEventListener('blur', async () => setTimeout(async () => (await devcmd()).hideSuggestions(), 150));
  document.addEventListener('click', () => hideCtx());
  renderPanel();
}

// Light up the correct rail (top OR bottom) for the active tab and re-render.
function setActiveTab(tab) {
  G.tab = tab;
  const sys = tab.startsWith('sys_') ? tab.slice(4) : null;
  document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', !sys && x.dataset.tab === tab));
  document.querySelectorAll('#systabs button').forEach(x => x.classList.toggle('on', sys && x.dataset.sys === sys));
  renderPanel();
}

// ---------------- side panel ----------------
export function renderPanel() {
  if (!G || !G.me) return;
  hideTooltip();                       // panel swaps orphan hover tooltips
  const p = $('#panel');
  switch (G.tab || 'inv') {
    case 'inv': return renderInv(p);
    case 'equip': return renderEquip(p);
    case 'skills': return renderSkills(p);
    case 'quests': return renderQuests(p);
    case 'prayer': return renderPrayers(p);
    case 'magic': return renderMagic(p);
    case 'pets': return renderPets(p);
    case 'sys_friends': return renderFriends(p);
    case 'sys_blocked': return renderBlocked(p);
    case 'sys_guild': return renderGuild(p);
    case 'sys_settings': return renderSettings(p);
  }
}

// ---------------- system panels (bottom rail) ----------------
function renderSettings(p) {
  p.innerHTML = '<div class="craft-cat">Settings</div>';
  const wrap = document.createElement('div'); wrap.className = 'sys-panel';
  // Player stuck? — asks the server to relocate onto solid ground
  const stuck = document.createElement('div'); stuck.className = 'sys-row';
  stuck.innerHTML = '<div><b>🧍 Player stuck?</b><div class="sys-note">Wedged on an obstacle or spawn point? Pop free onto solid ground.</div></div>';
  const btn = document.createElement('button'); btn.className = 'wood-btn'; btn.textContent = 'Free me';
  btn.onclick = () => { G.net.send({ t: MSG.UNSTUCK }); toast('Wriggling free…'); };
  stuck.appendChild(btn); wrap.appendChild(stuck);
  // sound toggle (client-side)
  const snd = document.createElement('div'); snd.className = 'sys-row';
  const on = G.muted ? 'Off' : 'On';
  snd.innerHTML = `<div><b>🔊 Sound</b></div>`;
  const sb = document.createElement('button'); sb.className = 'wood-btn'; sb.textContent = on;
  sb.onclick = () => { G.muted = !G.muted; sb.textContent = G.muted ? 'Off' : 'On'; try { localStorage.setItem('los_muted', G.muted ? '1' : ''); } catch { } };
  snd.appendChild(sb); wrap.appendChild(snd);
  const info = document.createElement('div'); info.className = 'sys-note';
  info.innerHTML = `Signed in as <b>${G.me?.name || '?'}</b> · world seed ${G.seed ?? '—'}`;
  wrap.appendChild(info);
  p.appendChild(wrap);
}
function socialPanel(p, title, kind, empty) {
  p.innerHTML = `<div class="craft-cat">${title}</div>`;
  const wrap = document.createElement('div'); wrap.className = 'sys-panel';
  const list = (G.social && G.social[kind]) || [];
  if (!list.length) { const n = document.createElement('div'); n.className = 'sys-note'; n.textContent = empty; wrap.appendChild(n); }
  else for (const name of list) {
    const row = document.createElement('div'); row.className = 'sys-row';
    row.innerHTML = `<span>${name}</span>`;
    const rm = document.createElement('button'); rm.className = 'wood-btn'; rm.textContent = '✕';
    rm.onclick = () => { G.net.send({ t: 'social', op: 'remove', kind, name }); };
    row.appendChild(rm); wrap.appendChild(row);
  }
  const add = document.createElement('div'); add.className = 'sys-row';
  const inp = document.createElement('input'); inp.placeholder = kind === 'blocked' ? 'Block a player…' : 'Add a player…';
  inp.maxLength = 20; inp.style.cssText = 'flex:1;min-width:0;background:#0d0a05;border:1px solid var(--trim);color:#e8dcc0;padding:4px 6px;border-radius:4px';
  const go = document.createElement('button'); go.className = 'wood-btn'; go.textContent = '+';
  go.onclick = () => { const v = inp.value.trim(); if (v) { G.net.send({ t: 'social', op: 'add', kind, name: v }); inp.value = ''; } };
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') go.click(); });
  add.appendChild(inp); add.appendChild(go); wrap.appendChild(add);
  p.appendChild(wrap);
}
function renderFriends(p) { socialPanel(p, 'Friends', 'friends', 'No friends added yet. Add a player by name to see when they are online.'); }
function renderBlocked(p) { socialPanel(p, 'Blocked', 'blocked', 'No one blocked. Blocked players cannot message or duel-invite you.'); }
function renderGuild(p) {
  p.innerHTML = '<div class="craft-cat">Guild</div>';
  const wrap = document.createElement('div'); wrap.className = 'sys-panel';
  const g = G.social && G.social.guild;
  if (g && g.name) {
    const row = document.createElement('div'); row.className = 'sys-row';
    row.innerHTML = `<div><b>🛡️ ${g.name}</b><div class="sys-note">${(g.members || []).length} members</div></div>`;
    const leave = document.createElement('button'); leave.className = 'wood-btn'; leave.textContent = 'Leave';
    leave.onclick = () => { if (confirm(`Leave ${g.name}?`)) G.net.send({ t: 'social', op: 'guildLeave' }); };
    row.appendChild(leave); wrap.appendChild(row);
  } else {
    const n = document.createElement('div'); n.className = 'sys-note';
    n.textContent = 'You are not in a guild. Found one or join an existing band of outlaws.';
    wrap.appendChild(n);
    const row = document.createElement('div'); row.className = 'sys-row';
    const inp = document.createElement('input'); inp.placeholder = 'Guild name…'; inp.maxLength = 24;
    inp.style.cssText = 'flex:1;min-width:0;background:#0d0a05;border:1px solid var(--trim);color:#e8dcc0;padding:4px 6px;border-radius:4px';
    inp.addEventListener('keydown', e => e.stopPropagation());
    const found = document.createElement('button'); found.className = 'wood-btn'; found.textContent = 'Found';
    found.onclick = () => { const v = inp.value.trim(); if (v) G.net.send({ t: 'social', op: 'guildFound', name: v }); };
    row.appendChild(inp); row.appendChild(found); wrap.appendChild(row);
  }
  p.appendChild(wrap);
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
      // consumables drag onto the hotbar
      const def = ITEMS[s.id] || {};
      if (def.food || def.potion || def.bones || def.tome) {
        d.draggable = true;
        d.ondragstart = (e) => e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'item', id: s.id }));
      }
    }
    grid.appendChild(d);
  });
  p.appendChild(grid);
  // tool-in-hand crafting (knife work, potions, cleaning herbs…)
  const hc = document.createElement('button');
  hc.className = 'wood-btn handcraft';
  hc.textContent = '🔨 Handcraft';
  hc.onclick = () => openStation(null);
  p.appendChild(hc);
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
  if (s.id === 'coins') opts.push(['👛 Store in pouch', () => G.net.send({ t: 'coinpouch', deposit: s.qty })]);
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
  const slots = [null, 'head', null, 'cape', 'torso', 'neck', 'weapon', 'legs', 'shield', 'hands', 'feet', 'ammo', 'aura', null, 'mount'];
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
// Each skill is a tile fronted by a representative item icon; clicking a tile
// opens that skill's full guide (unlocks, nodes, recipes, quests).
const SKILL_REP = {
  attack: 'steel_sword', strength: 'steel_waraxe', defence: 'steel_shield', constitution: 'cooked_trout',
  ranged: 'yew_bow', magic: 'druid_staff', prayer: 'bones', summoning: 'wolf_pup_pouch',
  mining: 'steel_pickaxe', fishing: 'raw_trout', woodcutting: 'steel_hatchet', farming: 'potato_seed',
  hunter: 'box_trap', archaeology: 'trowel', smithing: 'steel_bar', cooking: 'bread',
  crafting: 'needle', firemaking: 'tinderbox', fletching: 'headless_arrows', runecrafting: 'cosmic_rune',
  herblore: 'attack_potion', construction: 'hammer', agility: 'leather_boots', thieving: 'coins',
  dungeoneering: 'dungeon_key',
};
function renderSkills(p) {
  p.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'skill-tiles';
  let total = 0;
  for (const sk of SKILLS) {
    const xp = G.xp[sk] || 0;
    const lvl = levelForXp(xp);
    total += lvl;
    const cur = XP_TABLE[lvl], next = XP_TABLE[Math.min(99, lvl + 1)];
    const pct = lvl >= 99 ? 100 : Math.floor(100 * (xp - cur) / Math.max(1, next - cur));
    const t = document.createElement('div');
    t.className = 'skill-tile' + (lvl >= 99 ? ' maxed' : '');
    t.appendChild(iconCanvas(SKILL_REP[sk] || 'coins'));
    const nm = document.createElement('div'); nm.className = 'sk-name'; nm.textContent = sk[0].toUpperCase() + sk.slice(1);
    const lv = document.createElement('div'); lv.className = 'sk-lv'; lv.textContent = lvl;
    const bar = document.createElement('div'); bar.className = 'sk-bar'; bar.innerHTML = `<i style="width:${pct}%"></i>`;
    t.append(nm, lv, bar);
    t.onclick = () => openSkillGuide(sk);
    t.onmouseenter = (e) => {
      const paid = (G.milestones[sk] || []);
      const nextMile = MILESTONE_LEVELS.find(m => !paid.includes(m) && m > lvl);
      tooltip(e, `<b>${sk[0].toUpperCase() + sk.slice(1)}</b> — level ${lvl}<br>XP: ${fmt(xp)}${lvl < 99 ? ` (${fmt(next - xp)} to next)` : ' — MAX'}<br>` +
        (nextMile ? `Next milestone: lvl ${nextMile} → <b>${MILESTONE_SHILLINGS[nextMile]} $LoS</b><br>` : '') +
        `<i>Click for the ${sk} guide</i>`);
    };
    t.onmouseleave = hideTooltip;
    grid.appendChild(t);
  }
  p.appendChild(grid);
  const tot = document.createElement('div');
  tot.style.cssText = 'margin-top:6px;text-align:center;color:#ffd75e';
  tot.textContent = `Total level: ${total}`;
  p.appendChild(tot);
}

// ---------------- skill guide ----------------
// Everything a skill unlocks, on one data-driven timeline: gear, gathering
// nodes, recipes (with their stations), spells/prayers/abilities and quests.
function openSkillGuide(sk) {
  const lvl = levelForXp(G.xp[sk] || 0);
  const rows = [];
  for (const it of Object.values(ITEMS))
    if (it.req && it.req[sk]) rows.push({ lvl: it.req[sk], icon: () => iconCanvas(it.id), label: it.name, kind: 'Wear/Wield' });
  for (const r of RECIPES)
    if (r.skill === sk) rows.push({ lvl: r.lvl, icon: () => iconCanvas(Object.keys(r.output || {})[0] || 'coins'), label: `${r.name || r.id}${r.station ? ` — at the ${r.station.replace(/_/g, ' ')}` : r.tool ? ` — with a ${r.tool}` : ''}`, kind: 'Make' });
  for (const [nid, n] of Object.entries(NODES))
    if (n.skill === sk) rows.push({ lvl: n.lvl || 1, icon: () => n.yield ? iconCanvas(n.yield) : nodeThumb(nid), label: `${n.name || nid.replace(/_/g, ' ')}${n.tool ? ` (needs ${n.tool.replace(/_/g, ' ')})` : ''}`, kind: 'Gather' });
  if (sk === 'magic') for (const [id, s] of Object.entries(SPELLS)) rows.push({ lvl: s.lvl, icon: () => spellIconCanvas(id), label: s.name, kind: 'Cast' });
  if (sk === 'prayer') for (const [id, pr] of Object.entries(PRAYERS)) rows.push({ lvl: pr.lvl, icon: () => prayerIconCanvas(id), label: pr.name, kind: 'Pray' });
  for (const [id, ab] of Object.entries(ABILITIES))
    if (ab.skill === sk) rows.push({ lvl: ab.lvl, icon: null, label: `${ab.name} (hotbar ability)`, kind: 'Ability' });
  for (const [qid, q] of Object.entries(QUESTS)) {
    for (const st of q.steps) if (st.type === 'skill' && st.skill === sk) rows.push({ lvl: st.level, icon: null, label: `Quest: ${q.name}`, kind: 'Quest' });
  }
  rows.sort((a, b) => a.lvl - b.lvl);
  openWin(`📖 ${sk[0].toUpperCase() + sk.slice(1)} guide — level ${lvl}`, (body) => {
    body.classList.add('scroll-bg');   // the guide unrolls on parchment (#128)
    const head = document.createElement('div');
    head.className = 'guide-head';
    const paid = (G.milestones[sk] || []);
    const nextMile = MILESTONE_LEVELS.find(m => !paid.includes(m) && m > lvl);
    head.innerHTML = `XP <b>${fmt(G.xp[sk] || 0)}</b>${lvl < 99 ? ` — ${fmt(XP_TABLE[lvl + 1] - (G.xp[sk] || 0))} to level ${lvl + 1}` : ' — <b>MASTERED</b>'}` +
      (nextMile ? ` &nbsp;·&nbsp; next $LoS milestone at <b>lvl ${nextMile}</b> (+${MILESTONE_SHILLINGS[nextMile]})` : '');
    body.appendChild(head);
    if (!rows.length) { body.insertAdjacentHTML('beforeend', '<i>This skill learns by doing — no listed unlocks.</i>'); return; }
    const list = document.createElement('div');
    list.className = 'guide-list';
    for (const r of rows) {
      const d = document.createElement('div');
      d.className = 'guide-row' + (lvl >= r.lvl ? ' got' : ' need');
      const ic = document.createElement('div'); ic.className = 'g-ic';
      if (r.icon) ic.appendChild(r.icon());
      d.appendChild(ic);
      d.insertAdjacentHTML('beforeend', `<span class="g-lvl">${r.lvl}</span><span class="g-kind">${r.kind}</span><span class="g-label">${r.label}</span>`);
      list.appendChild(d);
    }
    body.appendChild(list);
  });
}
function nodeThumb(type) {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  try { c.getContext('2d').drawImage(nodeSprite(type), 0, 0, 64, 64, 0, -6, 32, 32); } catch { }
  return c;
}
// Quest journal: EVERY quest in the game, colour-coded — red not started,
// yellow in progress, green complete. Click one for its full requirements.
function renderQuests(p) {
  p.innerHTML = '<div class="craft-cat">Quest journal</div>';
  const order = Object.entries(QUESTS).sort((a, b) => (a[1].level || 1) - (b[1].level || 1));
  for (const [qid, q] of order) {
    const st = G.quests[qid];
    const status = st?.done ? 'done' : st ? 'active' : 'locked';
    const d = document.createElement('div');
    d.className = `quest-item q-${status}`;
    const step = st && !st.done ? q.steps[st.step] : null;
    d.innerHTML = `<div class="qname">${status === 'done' ? '✔ ' : status === 'active' ? '➤ ' : ''}${q.name}</div>` +
      (status === 'done' ? ''
        : status === 'active' ? `<div class="hint">${step?.hint || ''} ${step?.count > 1 ? `(${st.n || 0}/${step.count})` : ''}</div>`
          : `<div class="hint">Speak to ${prettyNpc(q.giver)} — recommended level ${q.level || 1}</div>`);
    d.onclick = () => openQuestInfo(qid);
    p.appendChild(d);
  }
}
function prettyNpc(id) { return String(id || 'someone').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
function openQuestInfo(qid) {
  const q = QUESTS[qid];
  const st = G.quests[qid];
  openWin(`📜 ${q.name}`, (body) => {
    const status = st?.done ? '<span style="color:#7fd05f">Complete ✔</span>' : st ? '<span style="color:#ffd75e">In progress</span>' : '<span style="color:#ff8a7a">Not started</span>';
    body.insertAdjacentHTML('beforeend', `<div class="guide-head">${status} &nbsp;·&nbsp; Started with <b>${prettyNpc(q.giver)}</b> &nbsp;·&nbsp; recommended level <b>${q.level || 1}</b></div>`);
    // requirements distilled from the quest's own steps
    const reqs = [];
    for (const s of q.steps) {
      if (s.type === 'skill') reqs.push(`${s.skill} level ${s.level}`);
      if (s.type === 'dungeon') reqs.push(`clear dungeon floor ${s.floor}`);
    }
    if (q.requires) for (const pre of [].concat(q.requires)) reqs.push(`quest: ${QUESTS[pre]?.name || pre}`);
    if (reqs.length) body.insertAdjacentHTML('beforeend', `<div class="craft-cat">Requirements</div><div class="q-reqs">${reqs.map(r => `• ${r}`).join('<br>')}</div>`);
    // journey
    body.insertAdjacentHTML('beforeend', '<div class="craft-cat">The journey</div>');
    const list = document.createElement('div');
    list.className = 'guide-list';
    q.steps.forEach((s, i) => {
      const passed = st && (st.done || i < st.step);
      const current = st && !st.done && i === st.step;
      const d = document.createElement('div');
      d.className = 'guide-row' + (passed ? ' got' : current ? ' now' : ' need');
      d.innerHTML = `<span class="g-lvl">${passed ? '✔' : i + 1}</span><span class="g-label">${current || passed || !st ? (s.hint || s.type) : '…'}</span>`;
      list.appendChild(d);
    });
    body.appendChild(list);
    // rewards
    if (q.rewards) {
      body.insertAdjacentHTML('beforeend', '<div class="craft-cat">Rewards</div>');
      const row = document.createElement('div');
      row.className = 'q-rewards';
      if (q.rewards.shillings) row.insertAdjacentHTML('beforeend', `<span class="tok">✦ ${q.rewards.shillings} $LoS</span> `);
      if (q.rewards.coins) row.insertAdjacentHTML('beforeend', `<span>${fmt(q.rewards.coins)} coins</span> `);
      for (const [id, qty] of Object.entries(q.rewards.items || {})) {
        const chip = document.createElement('span'); chip.className = 'q-chip';
        chip.appendChild(iconCanvas(id));
        chip.insertAdjacentHTML('beforeend', `${qty > 1 ? qty + '× ' : ''}${ITEMS[id]?.name || id}`);
        row.appendChild(chip);
      }
      for (const [skl, amt] of Object.entries(q.rewards.xp || {})) row.insertAdjacentHTML('beforeend', `<span class="lvl">+${fmt(amt)} ${skl} xp</span> `);
      body.appendChild(row);
    }
  });
}
// ---------------- spell / prayer icon art ----------------
// Spell icons are lifted straight from each spell's own projectile FX sheet;
// prayers use the stat-badge cells of the skills icon pack.
const _spellIcons = new Map();
export function spellIconCanvas(id) {
  let c = _spellIcons.get(id);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const g = c.getContext('2d');
  const s = SPELLS[id];
  g.fillStyle = '#100d16'; g.beginPath(); g.arc(16, 16, 15, 0, 7); g.fill();
  let ok = true;
  if (s.teleport) {
    ok = drawFxSprite(g, 'anima', 0.5, 16, 16, 30);
    g.fillStyle = '#ffd75e'; g.font = 'bold 13px Georgia'; g.textAlign = 'center';
    g.fillText('➤', 16, 21);
  } else if (s.heal) {
    g.strokeStyle = '#6fc04a'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(16, 8); g.lineTo(16, 24); g.moveTo(8, 16); g.lineTo(24, 16); g.stroke();
    g.strokeStyle = '#b8f09a'; g.lineWidth = 2; g.stroke();
  } else {
    const spec = s.proj?.startsWith('sheet:') ? s.proj.slice(6) : null;
    if (spec) ok = drawFxSprite(g, spec, spec.startsWith('twisted') ? 0.35 : 0.4, 16, 16, spec.startsWith('twisted') ? 30 : 26);
    else { // legacy orb spells: coloured glow
      const col = { air: '#cfe8f8', earth: '#b08a4c', water: '#6ab0e0', fire: '#ffb02a', nature: '#7fd05f', holy: '#fff3b0' }[s.proj] || '#ffb02a';
      g.shadowColor = col; g.shadowBlur = 8; g.fillStyle = col;
      g.beginPath(); g.arc(16, 16, 8, 0, 7); g.fill(); g.shadowBlur = 0;
      g.fillStyle = '#ffffffaa'; g.beginPath(); g.arc(13, 13, 3, 0, 7); g.fill();
    }
  }
  g.strokeStyle = '#0d0a05'; g.lineWidth = 1.5; g.beginPath(); g.arc(16, 16, 14.6, 0, 7); g.stroke();
  if (ok) _spellIcons.set(id, c);
  return c;
}
const PRAYER_CELL = {
  thick_skin: [5, 3], rock_skin: [8, 4], clarity: [4, 5], improved_reflexes: [5, 5],
  sharp_eye: [7, 3], hawk_eye: [8, 3], eagle_eye: [3, 4],
  mystic_will: [6, 0], mystic_lore: [7, 0], mystic_might: [8, 0],
  burst_strength: [4, 6], superhuman_strength: [4, 7],
  rapid_heal: [2, 6], protect_magic: [0, 1], protect_missiles: [8, 1], protect_melee: [1, 1],
  piety: [2, 7], rigour: [3, 7], augury: [5, 7],
};
const _prayerIcons = new Map();
export function prayerIconCanvas(id) {
  let c = _prayerIcons.get(id);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#1a1408'; g.beginPath(); g.arc(16, 16, 15, 0, 7); g.fill();
  const cell = PRAYER_CELL[id] || [0, 3];
  const ok = drawMediaIcon(g, ['icons_skills', cell[0], cell[1]], 2, 2, 28);
  g.strokeStyle = '#6b5322'; g.lineWidth = 1.5; g.beginPath(); g.arc(16, 16, 14.6, 0, 7); g.stroke();
  if (ok) _prayerIcons.set(id, c);
  return c;
}

// Prayers & spells are compact icon strips: images packed side by side, no
// card frames or names — a tiny level badge and full info on hover.
function renderPrayers(p) {
  p.innerHTML = `<div class="craft-cat">Prayer points: ${G.self?.pray ?? 0}</div>`;
  const grid = document.createElement('div');
  grid.className = 'spell-strip';
  const plvl = levelForXp(G.xp.prayer || 0);
  for (const [id, pr] of Object.entries(PRAYERS)) {
    const b = document.createElement('button');
    b.className = 'spell-cell' + (G.prayersOn.has(id) ? ' on' : '') + (plvl < pr.lvl ? ' locked' : '');
    b.appendChild(prayerIconCanvas(id));
    b.insertAdjacentHTML('beforeend', `<span class="sc-lvl">${pr.lvl}</span>`);
    if (plvl >= pr.lvl) {
      b.draggable = true;
      b.ondragstart = (e) => e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'prayer', id }));
      b.onclick = () => G.net.send({ t: MSG.PRAYER, id });
    }
    b.onmouseenter = (e) => tooltip(e, `<b>${pr.name}</b> (prayer ${pr.lvl})<br>${pr.boost ? Object.entries(pr.boost).map(([k, v]) => `+${Math.round(v * 100)}% ${k}`).join(', ') : ''}${pr.protect ? 'Protects from ' + pr.protect : ''}${pr.regen ? 'Speeds healing' : ''}<br>Drain: ${pr.drain}/tick — drag to hotbar`);
    b.onmouseleave = hideTooltip;
    grid.appendChild(b);
  }
  p.appendChild(grid);
}
function renderMagic(p) {
  p.innerHTML = `<div class="craft-cat">Spellbook ${G.selSpell ? '— casting: ' + SPELLS[G.selSpell].name : ''}</div>`;
  const grid = document.createElement('div');
  grid.className = 'spell-strip';
  const mlvl = levelForXp(G.xp.magic || 0);
  for (const [id, s] of Object.entries(SPELLS)) {
    const b = document.createElement('button');
    b.className = 'spell-cell' + (G.selSpell === id ? ' on' : '') + (mlvl < s.lvl ? ' locked' : '');
    b.appendChild(spellIconCanvas(id));
    b.insertAdjacentHTML('beforeend', `<span class="sc-lvl">${s.lvl}</span>`);
    if (mlvl >= s.lvl) {
      b.draggable = true;
      b.ondragstart = (e) => e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'spell', id }));
      b.onclick = () => {
        if (s.teleport || s.heal) G.net.send({ t: MSG.CAST, spell: id });
        else { G.selSpell = G.selSpell === id ? null : id; renderPanel(); toast(G.selSpell ? `Click a target to cast ${s.name}.` : 'Spell deselected.'); }
      };
    }
    b.onmouseenter = (e) => tooltip(e, `<b>${s.name}</b> (magic ${s.lvl})<br>${s.dmg ? 'Damage spell — base ' + s.dmg : s.teleport ? 'Teleport to ' + s.teleport : 'Heals 20% LP'}<br>Runes: ${Object.entries(s.runes).map(([r, q]) => q + ' ' + r.replace('_rune', '')).join(', ')}<br><i>drag to hotbar</i>`);
    b.onmouseleave = hideTooltip;
    grid.appendChild(b);
  }
  p.appendChild(grid);
}
// Crafting lives at the WORKSTATIONS now: walk to a furnace/anvil/range/etc and
// its own window opens. Only tool-in-hand recipes (knife work, herblore) are
// craftable anywhere, via the Handcraft button on the inventory panel.
export function openStation(station, title) {
  const list = RECIPES.filter(r => (station ? r.station === station : !r.station));
  openWin(title || `🔨 ${String(station || 'Handcraft').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`, (body) => {
    if (!station) body.insertAdjacentHTML('beforeend', '<div class="guide-head">Simple work you can do anywhere with the right tool in your pack. Smelting, smithing, cooking and the rest need their workstations.</div>');
    const bySkill = {};
    for (const r of list) (bySkill[r.skill] = bySkill[r.skill] || []).push(r);
    for (const [sk, rs] of Object.entries(bySkill)) {
      const lvl = levelForXp(G.xp[sk] || 0);
      body.insertAdjacentHTML('beforeend', `<div class="craft-cat">${sk[0].toUpperCase() + sk.slice(1)} (lvl ${lvl})</div>`);
      for (const r of rs.sort((a, b) => a.lvl - b.lvl)) {
        const locked = lvl < r.lvl;
        const row = document.createElement('div');
        row.className = 'craft-row' + (locked ? ' locked' : '');
        const ic = document.createElement('span'); ic.className = 'craft-ic';
        ic.appendChild(iconCanvas(Object.keys(r.output || {})[0] || 'coins'));
        row.appendChild(ic);
        row.insertAdjacentHTML('beforeend', `<span class="nm">${r.name} <small style="color:#8d7a4b">lvl ${r.lvl}${r.tool ? ' · ' + r.tool : ''}</small></span>`);
        if (!locked) {
          for (const n of [1, 5, 28]) {
            const b = document.createElement('button');
            b.textContent = '×' + n;
            b.onclick = () => G.net.send({ t: MSG.MAKE, recipe: r.id, count: n });
            row.appendChild(b);
          }
        }
        row.onmouseenter = (e) => tooltip(e, `<b>${r.name}</b> — ${r.skill} ${r.lvl}, ${r.xp}xp<br>Needs: ${Object.entries(r.inputs).map(([id, q]) => (q || '') + ' ' + (ITEMS[id]?.name || id)).join(', ')}${r.tool ? ' + ' + r.tool : ''}`);
        row.onmouseleave = hideTooltip;
        body.appendChild(row);
      }
    }
    if (!list.length) body.insertAdjacentHTML('beforeend', '<i>Nothing to make here.</i>');
  });
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
  head.textContent = `Pet roster (${(G.pets || []).length}/24) — one companion at your side at a time`;
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

// ---------------- hotbar ----------------
// Nine slots on keys 1-9. Abilities fill free slots by default; spells,
// prayers and consumables can be dragged in from their panels. Right-click
// clears a slot. Layout persists per character.
function hotbarKey() { return 'los-hotbar-' + (G.myName || ''); }
function loadHotbar() {
  try { G.hotbar = JSON.parse(localStorage.getItem(hotbarKey())) || []; } catch { G.hotbar = []; }
  if (!Array.isArray(G.hotbar)) G.hotbar = [];
  G.hotbar.length = 9;
}
function saveHotbar() { try { localStorage.setItem(hotbarKey(), JSON.stringify(G.hotbar)); } catch { } }
export function renderAbilities() {
  if (!G.hotbar) loadHotbar();
  // default-fill empty slots with unlocked abilities (never displacing customs)
  const placed = new Set(G.hotbar.filter(Boolean).map(h => h.type + ':' + h.id));
  let cursor = 0;
  for (const [id, ab] of Object.entries(ABILITIES)) {
    if (levelForXp(G.xp[ab.skill] || 0) < ab.lvl) continue;
    if (placed.has('ability:' + id)) continue;
    while (cursor < 9 && G.hotbar[cursor]) cursor++;
    if (cursor >= 9) break;
    G.hotbar[cursor] = { type: 'ability', id };
    placed.add('ability:' + id);
  }
  const bar = $('#ability-bar');
  bar.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const h = G.hotbar[i];
    const b = document.createElement('button');
    b.className = 'ab-btn' + (h ? '' : ' empty');
    b.innerHTML = `<span class="key">${i + 1}</span><div class="cd"></div>`;
    if (h) {
      if (h.type === 'ability') { b.dataset.ab = h.id; b.insertAdjacentHTML('afterbegin', `<span class="ab-nm">${(ABILITIES[h.id]?.name || h.id).split(' ')[0]}</span>`); }
      else if (h.type === 'spell') b.insertAdjacentElement('afterbegin', spellIconCanvas(h.id));
      else if (h.type === 'prayer') b.insertAdjacentElement('afterbegin', prayerIconCanvas(h.id));
      else if (h.type === 'item') b.insertAdjacentElement('afterbegin', iconCanvas(h.id));
      if (h.type === 'prayer' && G.prayersOn.has(h.id)) b.classList.add('on');
      if (h.type === 'spell' && G.selSpell === h.id) b.classList.add('on');
      b.onmouseenter = (e) => tooltip(e, hotbarTip(h, i));
      b.onmouseleave = hideTooltip;
      b.onclick = () => triggerHotbar(i);
      b.oncontextmenu = (e) => { e.preventDefault(); G.hotbar[i] = null; saveHotbar(); renderAbilities(); };
    }
    b.ondragover = (e) => e.preventDefault();
    b.ondrop = (e) => {
      e.preventDefault();
      try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        if (data && data.type && data.id) { G.hotbar[i] = { type: data.type, id: data.id }; saveHotbar(); renderAbilities(); }
      } catch { }
    };
    bar.appendChild(b);
  }
}
function hotbarTip(h, i) {
  const key = `key [${i + 1}] — right-click to clear`;
  if (h.type === 'ability') { const ab = ABILITIES[h.id]; return `<b>${ab.name}</b> (${ab.skill} ${ab.lvl})<br>${ab.desc}<br>Cooldown ${ab.cd / 1000}s — ${key}`; }
  if (h.type === 'spell') return `<b>${SPELLS[h.id]?.name}</b> — cast — ${key}`;
  if (h.type === 'prayer') return `<b>${PRAYERS[h.id]?.name}</b> — toggle — ${key}`;
  return `<b>${ITEMS[h.id]?.name || h.id}</b> — use one from your pack — ${key}`;
}
export function triggerHotbar(i) {
  const h = G.hotbar?.[i];
  if (!h) return;
  if (h.type === 'ability') return G.net.send({ t: MSG.ABILITY, id: h.id });
  if (h.type === 'prayer') return G.net.send({ t: MSG.PRAYER, id: h.id });
  if (h.type === 'spell') {
    const s = SPELLS[h.id];
    if (s.teleport || s.heal) return G.net.send({ t: MSG.CAST, spell: h.id });
    G.selSpell = G.selSpell === h.id ? null : h.id;
    renderAbilities();
    return toast(G.selSpell ? `Click a target to cast ${s.name}.` : 'Spell deselected.');
  }
  if (h.type === 'item') {
    const idx = G.inv.findIndex(s => s && s.id === h.id);
    if (idx < 0) return toast(`No ${ITEMS[h.id]?.name || h.id} in your pack.`);
    const def = ITEMS[h.id] || {};
    if (def.food || def.potion) return G.net.send({ t: MSG.EAT, slot: idx });
    if (def.bones) return G.net.send({ t: MSG.BURY, slot: idx });
    if (def.tome) return G.net.send({ t: MSG.USE_ITEM, slot: idx });
    return G.net.send({ t: MSG.USE_ITEM, slot: idx });
  }
}
export function tickCooldowns() {
  const now = Date.now();
  for (const b of document.querySelectorAll('.ab-btn[data-ab]')) {
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
  G.bankOpen = false; G.shopOpen = null; geOpen = false;
}

export function openBank(bank) {
  G.bankOpen = true;
  openWin('🏦 Bank of Sherwood', (body) => {
    const info = document.createElement('div');
    info.style.marginBottom = '8px';
    info.innerHTML = `Click items to withdraw. Your pack: click items in the side panel to deposit. <button id="depall">Deposit all</button>
      <div class="craft-cat" style="margin-top:8px">$LoS balance — ${fmt(G.bal || 0)}</div>
      <div style="font-size:10.5px;color:#8d7a5b;margin-top:3px">To cash out $LoS to your wallet, visit the <b>Grand Exchange</b> in the grounds of Nottingham Castle — the only place withdrawals to the chain are made.</div>`;
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

// ---------------- Grand Exchange (RS-style: 8 offer slots, buy/sell setup) ----
let geData = null, geView = 'main', geSel = null, geOpen = false;
function guidePrice(id) { return Math.max(1, (geData && geData.prices && geData.prices[id]) || ITEMS[id]?.value || 1); }
export function openGE(data) {
  geData = data;
  const fresh = !geOpen;
  if (fresh) { geOpen = true; geView = 'main'; geSel = null; openWin('⚖ Grand Exchange', () => {}); }
  // On a background sync only refresh the main board; don't disturb a setup form.
  if (fresh || geView === 'main') renderGE();
}
function renderGE() {
  const body = $('#bigwin-body'); if (!body) return;
  $('#bigwin-title').textContent = '⚖ Grand Exchange';
  body.innerHTML = '';
  if (geView === 'sellpick') return geSellPick(body);
  if (geView === 'buysearch') return geBuySearch(body);
  if (geView === 'setup') return geSetup(body);
  geMain(body);
}
function geBack(body, title, onBack) {
  const h = document.createElement('div'); h.className = 'ge-head';
  h.innerHTML = `<button class="ge-backbtn">←</button><span>${title}</span>`;
  h.querySelector('.ge-backbtn').onclick = onBack;
  body.appendChild(h);
}
function geWithdrawPanel() {
  const wd = document.createElement('div'); wd.className = 'ge-withdraw';
  const w = geData.wallet, shortW = w ? w.slice(0, 10) + '…' + w.slice(-4) : '—';
  wd.innerHTML = `<div class="craft-cat" style="margin:0 0 5px">⛓ Withdraw $LoS to your wallet</div>
    <div style="font-size:11px;color:#c9b487;margin-bottom:5px">Paid to your sign-in wallet <b title="${w || ''}">${shortW}</b> — funds can go to no other account.</div>
    <div style="display:flex;gap:5px;align-items:center;font-size:12px">
      <input id="wd-amt" type="number" min="5" placeholder="amount" style="width:90px">
      <button id="wd-go" ${w ? '' : 'disabled'}>Withdraw ⛓</button></div>
    <div style="font-size:10.5px;color:#8d7a5b;margin-top:3px">Screened by the Vault Wardens — large or rapid transactions are held for review.</div>`;
  wd.querySelector('#wd-go').onclick = () => { const a = parseInt(wd.querySelector('#wd-amt').value) || 0; if (a > 0) G.net.send({ t: 'withdraw', amount: a }); else toast('Enter an amount to withdraw.'); };
  return wd;
}
function geMain(body) {
  const d = geData, offers = d.offers || [];
  const hdr = document.createElement('div'); hdr.className = 'ge-topbar';
  hdr.innerHTML = `<button id="ge-hist">History</button>
    <div class="ge-bal">Balance: <b>${fmt(d.bal)}</b> $LoS</div>
    <button id="ge-collect">Collect all</button>`;
  body.appendChild(hdr);
  const note = document.createElement('div'); note.className = 'ge-note';
  note.textContent = 'Select an empty slot to set up a Buy or Sell offer.';
  body.appendChild(note);
  const grid = document.createElement('div'); grid.className = 'ge-slots';
  for (let i = 0; i < 8; i++) {
    const o = offers[i], slot = document.createElement('div'); slot.className = 'ge-slot';
    if (o) {
      const pct = Math.round(100 * o.filled / o.qty), col = o.type === 'buy' ? '#c0392b' : '#2e8b57';
      slot.innerHTML = `<div class="ge-slot-h ${o.type}">${o.type.toUpperCase()}</div>
        <div class="ge-slot-item"></div>
        <div class="ge-slot-name">${ITEMS[o.item]?.name || o.item} <span style="color:#c9b487">×${fmt(o.qty)}</span></div>
        <div class="ge-bar"><div style="width:${pct}%;background:${col}"></div></div>
        <div class="ge-slot-price">${fmt(o.price)} $LoS ea · ${o.filled >= o.qty ? 'complete' : pct + '%'}</div>
        <button class="wood-btn ge-cancel">Cancel / Collect</button>`;
      slot.querySelector('.ge-slot-item').appendChild(iconCanvas(o.item));
      slot.querySelector('.ge-cancel').onclick = () => G.net.send({ t: MSG.GE, cancel: o.id });
    } else {
      slot.classList.add('empty');
      slot.innerHTML = `<div class="ge-slot-h" style="color:#8d7a4b">Empty</div><div class="ge-empty-btns"></div>`;
      const bb = document.createElement('button'); bb.className = 'wood-btn ge-buy'; bb.innerHTML = '⬇ Buy';
      bb.onclick = () => { geView = 'buysearch'; geSel = null; renderGE(); };
      const sb = document.createElement('button'); sb.className = 'wood-btn ge-sell'; sb.innerHTML = '⬆ Sell';
      sb.onclick = () => { geView = 'sellpick'; geSel = null; renderGE(); };
      slot.querySelector('.ge-empty-btns').append(bb, sb);
    }
    grid.appendChild(slot);
  }
  body.appendChild(grid);
  body.appendChild(geWithdrawPanel());
  hdr.querySelector('#ge-collect').onclick = () => { for (const o of offers) G.net.send({ t: MSG.GE, cancel: o.id }); };
  hdr.querySelector('#ge-hist').onclick = () => {
    const ps = Object.entries(d.prices || {});
    toast(ps.length ? 'Recent: ' + ps.slice(-6).map(([i, p]) => `${ITEMS[i]?.name || i} @ ${p}`).join(' · ') : 'No trades recorded yet.');
  };
}
function geSellPick(body) {
  geBack(body, 'Sell Offer — choose an item from your pack', () => { geView = 'main'; renderGE(); });
  const grid = document.createElement('div'); grid.className = 'bank-grid';
  let any = false;
  (G.inv || []).forEach((s) => {
    if (!s || !ITEMS[s.id]?.tradeable) return; any = true;
    const d = document.createElement('div'); d.className = 'inv-slot'; d.appendChild(iconCanvas(s.id));
    const q = document.createElement('span'); q.className = 'qty'; q.textContent = fmt(s.qty); d.appendChild(q);
    d.onmouseenter = (e) => tooltip(e, itemTip(s.id, s.qty)); d.onmouseleave = hideTooltip;
    d.onclick = () => { geSel = { type: 'sell', item: s.id, maxQty: s.qty }; geView = 'setup'; renderGE(); };
    grid.appendChild(d);
  });
  if (!any) grid.innerHTML = '<i style="color:#8d7a4b">No tradeable items in your pack.</i>';
  body.appendChild(grid);
}
function geBuySearch(body) {
  geBack(body, 'Buy Offer — search for an item', () => { geView = 'main'; renderGE(); });
  const search = document.createElement('input'); search.className = 'ge-search'; search.placeholder = 'Type part of an item name…';
  body.appendChild(search);
  const results = document.createElement('div'); results.className = 'ge-results'; body.appendChild(results);
  const all = Object.values(ITEMS).filter(it => it.tradeable);
  const fill = (q) => {
    results.innerHTML = ''; const ql = q.toLowerCase().trim();
    const list = (ql ? all.filter(it => it.name.toLowerCase().includes(ql)) : all).slice(0, 60);
    if (!list.length) { results.innerHTML = '<i style="color:#8d7a4b">No matches — try another name.</i>'; return; }
    for (const it of list) {
      const r = document.createElement('div'); r.className = 'ge-result';
      r.appendChild(iconCanvas(it.id));
      const nm = document.createElement('span'); nm.className = 'ge-rname'; nm.textContent = it.name; r.appendChild(nm);
      const gp = document.createElement('span'); gp.className = 'ge-guide'; gp.textContent = fmt(guidePrice(it.id)) + ' $LoS'; r.appendChild(gp);
      r.onclick = () => { geSel = { type: 'buy', item: it.id }; geView = 'setup'; renderGE(); };
      results.appendChild(r);
    }
  };
  search.oninput = () => fill(search.value);   // auto-populates as you type
  fill(''); setTimeout(() => search.focus(), 0);
}
function geSetup(body) {
  const it = ITEMS[geSel.item], isBuy = geSel.type === 'buy', guide = guidePrice(geSel.item);
  geBack(body, (isBuy ? 'Buy Offer' : 'Sell Offer') + ' — ' + it.name, () => { geView = isBuy ? 'buysearch' : 'sellpick'; renderGE(); });
  const wrap = document.createElement('div'); wrap.className = 'ge-setup';
  wrap.innerHTML = `
    <div class="ge-setup-top"><div class="ge-setup-icon"></div>
      <div><b>${it.name}</b><div class="ge-examine">${it.examine || ''}</div>
      <div class="ge-guideline">Guide price: ${fmt(guide)} $LoS${geSel.maxQty ? ` · you have ${fmt(geSel.maxQty)}` : ''}</div></div></div>
    <div class="ge-setup-grid">
      <div><div class="craft-cat">Quantity</div>
        <div class="ge-stepper"><button data-q="-1">−</button><input id="ge-q" type="number" min="1" value="1"><button data-q="1">+</button></div>
        <div class="ge-quick">${(isBuy ? ['+1', '+10', '+100', '+1K'] : ['1', '10', '100', 'All']).map(l => `<button data-ql="${l}">${l}</button>`).join('')}</div></div>
      <div><div class="craft-cat">Price per item ($LoS)</div>
        <div class="ge-stepper"><button data-p="-1">−</button><input id="ge-p" type="number" min="1" value="${guide}"><button data-p="1">+</button></div>
        <div class="ge-quick">${['-5%', 'guide', '+5%'].map(l => `<button data-pl="${l}">${l}</button>`).join('')}</div></div>
    </div>
    <div class="ge-total">Total: <b id="ge-total">0</b> $LoS</div>
    <button id="ge-confirm" class="wood-btn ge-confirm">Confirm Offer</button>`;
  body.appendChild(wrap);
  wrap.querySelector('.ge-setup-icon').appendChild(iconCanvas(geSel.item));
  const qEl = wrap.querySelector('#ge-q'), pEl = wrap.querySelector('#ge-p');
  const clampQ = () => { if (!isBuy && geSel.maxQty) qEl.value = Math.min(+qEl.value || 1, geSel.maxQty); };
  const upd = () => { $('#ge-total').textContent = fmt((+qEl.value || 0) * (+pEl.value || 0)); };
  wrap.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { qEl.value = Math.max(1, (+qEl.value || 1) + (+b.dataset.q)); clampQ(); upd(); });
  wrap.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { pEl.value = Math.max(1, (+pEl.value || 1) + (+b.dataset.p)); upd(); });
  wrap.querySelectorAll('[data-ql]').forEach(b => b.onclick = () => {
    const l = b.dataset.ql;
    if (l === 'All') qEl.value = geSel.maxQty || 1;
    else if (l[0] === '+') qEl.value = (+qEl.value || 0) + (l === '+1K' ? 1000 : +l.slice(1));
    else qEl.value = +l;
    clampQ(); upd();
  });
  wrap.querySelectorAll('[data-pl]').forEach(b => b.onclick = () => {
    const l = b.dataset.pl;
    pEl.value = l === 'guide' ? guide : Math.max(1, Math.round((+pEl.value || guide) * (l === '-5%' ? 0.95 : 1.05)));
    upd();
  });
  qEl.oninput = () => { clampQ(); upd(); }; pEl.oninput = upd; upd();
  wrap.querySelector('#ge-confirm').onclick = () => {
    const qty = +qEl.value || 0, price = +pEl.value || 0;
    if (qty < 1 || price < 1) return toast('Enter a quantity and price.');
    if (isBuy && qty * price > (geData.bal || 0)) return toast('Not enough $LoS for that buy offer.');
    if (!isBuy && geSel.maxQty && qty > geSel.maxQty) return toast('You do not have that many.');
    G.net.send({ t: MSG.GE, place: { type: geSel.type, item: geSel.item, qty, price } });
    geView = 'main'; geSel = null; renderGE();
  };
}

export function openDungeon(best) {
  openWin('⚒ The Abyssal Depths', (body) => {
    body.innerHTML = `<div style="margin-bottom:8px">Cleared floors pay $LoS — deeper pays more. You must clear floors in order; the stair needs an <b>Abyssal key</b> from the floor's creatures. Best floor: <b>${best}</b>.</div>`;
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(5,1fr);gap:6px';
    for (let f = 1; f <= DUNGEON.MAX_FLOOR; f++) {
      const b = document.createElement('button');
      const req = DUNGEON.floorReq(f);
      b.textContent = `Floor ${f}` + (f % 5 === 0 ? ' ☠' : '');
      b.disabled = f > best + 1 || levelForXp(G.xp.dungeoneering || 0) < req;
      b.title = `Requires dungeoneering ${req} — pays ${DUNGEON.tokenReward(f)} $LoS`;
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
    // player marker (pulsing ring)
    if (G.self && G.self.plane === 0) {
      const px = G.self.x * sc, py = G.self.y * sc;
      g.strokeStyle = '#ffffffcc'; g.lineWidth = 2; g.beginPath(); g.arc(px, py, 8, 0, 7); g.stroke();
      g.fillStyle = '#ffffff'; g.strokeStyle = '#000'; g.lineWidth = 1;
      g.beginPath(); g.arc(px, py, 4, 0, 7); g.fill(); g.stroke();
      g.fillStyle = '#00000090'; g.fillText('You', px + 1, py - 11 + 1);
      g.fillStyle = '#ffffff'; g.fillText('You', px, py - 11);
    }
    // compass rose (top-right)
    const cx = 480, cy = 42, rr = 22;
    g.save();
    g.translate(cx, cy);
    g.fillStyle = '#1c130888'; g.beginPath(); g.arc(0, 0, rr + 4, 0, 7); g.fill();
    g.strokeStyle = '#caa64e'; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, rr, 0, 7); g.stroke();
    for (const [ang, lab, col] of [[-Math.PI / 2, 'N', '#ff6a5a'], [Math.PI / 2, 'S', '#e8dcc0'], [0, 'E', '#e8dcc0'], [Math.PI, 'W', '#e8dcc0']]) {
      g.fillStyle = col;
      g.beginPath(); g.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
      g.lineTo(Math.cos(ang + 0.35) * 5, Math.sin(ang + 0.35) * 5);
      g.lineTo(Math.cos(ang - 0.35) * 5, Math.sin(ang - 0.35) * 5); g.closePath(); g.fill();
      g.font = 'bold 10px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#f4e9c8'; g.fillText(lab, Math.cos(ang) * (rr - 9), Math.sin(ang) * (rr - 9));
    }
    g.textBaseline = 'alphabetic';
    g.restore();
    // scale bar (bottom-left): 100 tiles
    const barPx = 100 * sc;
    g.strokeStyle = '#1c1308'; g.lineWidth = 3; g.beginPath(); g.moveTo(16, 502); g.lineTo(16 + barPx, 502); g.stroke();
    g.strokeStyle = '#f4e9c8'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(16, 502); g.lineTo(16 + barPx, 502); g.stroke();
    g.fillStyle = '#f4e9c8'; g.font = '10px Georgia'; g.textAlign = 'left'; g.fillText('100 tiles', 16, 498);
    // ornate double frame
    g.strokeStyle = '#caa64e'; g.lineWidth = 3; g.strokeRect(2, 2, 516, 516);
    g.strokeStyle = '#3a2a12'; g.lineWidth = 1; g.strokeRect(6, 6, 508, 508);
    wrap.appendChild(c);
    const note = document.createElement('div');
    note.style.cssText = 'text-align:center;color:#b3a06d;font-size:12px;margin-top:6px';
    note.textContent = 'North of the red line lies the Wild Lands — PvP is enabled and your $LoS pouch is at risk.';
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
  $('#dlg-line').textContent = `${msg.from} challenges you to a duel for ${msg.stake} $LoS. Winner takes the pot.`;
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
  drawStatBar($('.statbar.hp canvas'), s.hp / s.mhp, 'hp');
  $('#hp-txt').textContent = s.hp;
  const prayMax = Math.max(1, levelForXp(G.xp.prayer || 0));
  drawStatBar($('.statbar.pray canvas'), s.pray / prayMax, 'pray');
  $('#pray-txt').textContent = Math.floor(s.pray);
  drawStatBar($('.statbar.energy canvas'), s.energy / 100, 'energy');
  $('#energy-txt').textContent = s.energy;
  $('#shl').textContent = fmt(G.bal);
  $('#pouch').textContent = s.pouch > 0 ? ` +${s.pouch}⚠` : '';
  $('#cpouch').textContent = fmt(G.coinPouch || 0);
}

// Coin pouch: a small always-on store for coins, kept safe when you die.
function invCoins() { return (G.inv || []).reduce((n, s) => n + (s && s.id === 'coins' ? s.qty : 0), 0); }
export function openCoinPouch() {
  openWin('👛 Coin pouch', (body) => {
    const draw = () => {
      const inPack = invCoins(), inPouch = G.coinPouch || 0;
      body.innerHTML = `<p style="margin-bottom:8px">Coins on your person are <b>safe when you die</b>. Coins left in your pack spill onto the ground.</p>
        <div class="craft-cat">In pouch: ${fmt(inPouch)} · In pack: ${fmt(inPack)}</div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:8px 0">
          <input id="cp-dep" type="number" min="1" placeholder="amount" style="width:90px">
          <button id="cp-dep-go">Deposit</button><button id="cp-dep-all">Deposit all</button>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <input id="cp-wd" type="number" min="1" placeholder="amount" style="width:90px">
          <button id="cp-wd-go">Withdraw</button><button id="cp-wd-all">Withdraw all</button>
        </div>`;
      body.querySelector('#cp-dep-go').onclick = () => { const n = parseInt(body.querySelector('#cp-dep').value) || 0; if (n > 0) G.net.send({ t: 'coinpouch', deposit: n }); };
      body.querySelector('#cp-dep-all').onclick = () => { if (inPack > 0) G.net.send({ t: 'coinpouch', deposit: inPack }); };
      body.querySelector('#cp-wd-go').onclick = () => { const n = parseInt(body.querySelector('#cp-wd').value) || 0; if (n > 0) G.net.send({ t: 'coinpouch', withdraw: n }); };
      body.querySelector('#cp-wd-all').onclick = () => { if (inPouch > 0) G.net.send({ t: 'coinpouch', withdraw: inPouch }); };
    };
    draw();
    G._coinPouchRedraw = draw;   // refreshed when a coinpouch update arrives
  });
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

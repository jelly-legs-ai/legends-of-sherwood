// Sherwood Admin Studio: server terminal, economy audit, PDA-vault review,
// world-event designer and an asset compositor that renders every item, icon,
// creature (animated), FX and equipped weapon through the GAME'S OWN modules —
// what you preview here is exactly what ships.

import { ITEMS, registerCustomItems, gearGuideline } from '/shared/data/items.js';
import { MOBS } from '/shared/data/mobs.js';
import { PETS } from '/shared/data/pets.js';
import { SPELLS, PRAYERS, NODES } from '/shared/data/skills.js';
import { TILE } from '/shared/constants.js';
import { computeWorld, worldTile, heightAt, regionAt, applyMapOverrides, MAP_OVERRIDES, WORLD_W, WORLD_H, syncTile, syncNode } from '/shared/mapgen.js';
import { SPAWNS, BOSS_SPAWNS, TOWNS } from '/shared/data/world.js';
import { loadMedia, MEDIA, drawCreature, drawFrame, drawFxSprite, drawFxBand, customLayerPos } from './media.js';
import { loadManifest, composite, drawChar, drawOversize, critterSprite, nodeSprite, ANIMS, gearCatalog, registerCustomWeaponArt, weaponList, weaponSheetFile } from './sprites.js';
import { itemIcon } from './icons.js';
import { Renderer, flushChunkCache, flushChunkAt } from './renderer.js';
import { Fx } from './fx.js';

const $ = (s) => document.querySelector(s);
const key = new URLSearchParams(location.search).get('key') || '';
const main = $('#main');
let ws, view = 'dash', raf = 0;

// ---------------- socket ----------------
function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/adminws?key=${encodeURIComponent(key)}`);
  ws.onopen = () => { $('#conn').textContent = '● connected'; $('#conn').className = 'conn ok'; render(); };
  ws.onclose = () => { $('#conn').textContent = '○ disconnected — retrying'; $('#conn').className = 'conn'; setTimeout(connect, 2500); };
  ws.onmessage = (e) => { try { onMsg(JSON.parse(e.data)); } catch { } };
}
const send = (o) => { if (ws?.readyState === 1) ws.send(JSON.stringify(o)); };

const state = { status: null, ledger: null, vault: null, events: null, security: [], term: [], treasury: null, token: null, sim: null, econ: null };
function onMsg(m) {
  if (m.t === 'status') { state.status = m; if (view === 'dash') render(); }
  else if (m.t === 'ledger') { state.ledger = m; if (view === 'eco') render(); }
  else if (m.t === 'vault') { state.vault = m; if (view === 'vault') render(); }
  else if (m.t === 'events') { state.events = m; if (view === 'events') render(); }
  else if (m.t === 'treasury') { state.treasury = m; if (m.econ) state.econ = m.econ; if (view === 'treasury') render(); }
  else if (m.t === 'rewards') { state.econ = m.econ; if (view === 'treasury') render(); }
  else if (m.t === 'token') { state.token = m; if (view === 'token') render(); }
  else if (m.t === 'simulate') { state.sim = m.result; if (view === 'sim') render(); }
  else if (m.t === 'securityLog') { state.security = m.log; if (view === 'dash') render(); }
  else if (m.t === 'security') { state.security.unshift(m.entry); if (view === 'dash') render(); }
  else if (m.t === 'cmd') { state.term.push({ text: m.out, cls: '' }); termOut(m.out); }
  else if (m.t === 'mapedit') { state.mapedit = m.overrides; msOnServerOverrides(m.overrides); }
  else if (m.t === 'spawnzones') { state.spawns = m; if (view === 'map' && MS.mobMode) msSide(); }
  else if (m.t === 'customItems') { state.customItems = m.items; registerCustomItems(m.items); registerCustomWeaponArt(m.items); if (view === 'comp' && (compMode === 'create' || compMode === 'gearsheet')) renderComp(); }
  else if (m.t === 'customAnims') { state.customAnims = m.anims; if (view === 'comp' && compMode === 'anims') renderComp(); }
  else if (m.t === 'dropTables') { state.dropTables = m; if (view === 'drops') render(); if (view === 'comp' && compMode === 'gearsheet') gsFillSources(); }
  else if (m.t === 'deployedGear') { state.deployedGear = m.gear; registerCustomItems(m.gear); registerCustomWeaponArt(m.gear); }
}

// ---------------- nav ----------------
for (const b of document.querySelectorAll('#nav button')) {
  b.onclick = () => {
    document.querySelectorAll('#nav button').forEach(x => x.classList.toggle('on', x === b));
    view = b.dataset.v;
    cancelAnimationFrame(raf);
    render();
  };
}
const fmtT = (t) => new Date(t).toLocaleTimeString();

// ---------------- views ----------------
function render() {
  cancelAnimationFrame(raf);
  if (view === 'dash') return renderDash();
  if (view === 'term') return renderTerm();
  if (view === 'eco') return renderEco();
  if (view === 'treasury') return renderTreasury();
  if (view === 'token') return renderToken();
  if (view === 'sim') return renderSim();
  if (view === 'vault') return renderVault();
  if (view === 'events') return renderEvents();
  if (view === 'map') return renderMapStudio();
  if (view === 'comp') return renderComp();
  if (view === 'drops') return renderDrops();
}

// ---------------- drop-table browser ----------------
// Every place items enter the world — mob loot, boss loot, quest rewards, and
// crafting recipes — categorized and searchable, from the live server tables
// (so studio-deployed weapons show up alongside the built-ins).
const dropView = { q: '', tab: 'mobs' };
function renderDrops() {
  const dt = state.dropTables;
  if (!dt) { main.innerHTML = '<h2>Drop tables</h2><p style="color:var(--dim)">loading the world\'s loot tables…</p>'; send({ t: 'dropTables' }); return; }
  const tabs = [['mobs', `Mobs (${dt.mobs.length})`], ['bosses', `Bosses (${dt.bosses.length})`], ['quests', `Quests (${dt.quests.length})`], ['recipes', `Recipes (${dt.recipes.length})`]];
  const q = dropView.q.trim().toLowerCase();
  const match = (s) => !q || (s || '').toLowerCase().includes(q);
  const pct = (c) => (c >= 1 ? '100%' : (c * 100 < 1 ? (c * 100).toFixed(2) : (c * 100).toFixed(1)) + '%');
  const rar = (c) => c >= 0.5 ? '#9fe08a' : c >= 0.1 ? '#e8d27a' : c >= 0.02 ? '#e8a05a' : '#e0748a';   // common→rare
  let bodyHtml = '';
  if (dropView.tab === 'mobs' || dropView.tab === 'bosses') {
    // a mob matches if its name OR any dropped item name matches the query
    const rows = dt[dropView.tab].filter(m => match(m.name) || m.drops.some(d => match(d.name) || match(d.item)));
    bodyHtml = rows.length ? rows.map(m => `<div style="border:1px solid var(--trim);border-radius:7px;padding:8px 10px;margin-bottom:7px;background:#181f1a">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
          <b style="color:var(--gold)">${m.name}</b><span style="font-size:11px;color:var(--dim)">lv ${m.lvl} · <code style="color:var(--dim)">${m.id}</code></span></div>
        <table style="width:100%;margin-top:5px;font-size:12px"><tr style="color:var(--dim)"><th style="text-align:left">item</th><th style="text-align:right">qty</th><th style="text-align:right">rate</th></tr>
        ${m.drops.length ? m.drops.map(d => `<tr><td>${match(d.name) && q ? `<mark style="background:#4a5a2a;color:#fff">${d.name}</mark>` : d.name} <code style="color:#5f6a5f;font-size:10px">${d.item}</code></td><td style="text-align:right">${Array.isArray(d.qty) ? d.qty.join('–') : d.qty}</td><td style="text-align:right;color:${rar(d.chance)}">${pct(d.chance)}</td></tr>`).join('') : '<tr><td colspan=3 style="color:var(--dim)"><i>no drops</i></td></tr>'}
        </table></div>`).join('') : '<p style="color:var(--dim)">no matches</p>';
  } else if (dropView.tab === 'quests') {
    const rows = dt.quests.filter(qq => match(qq.name) || qq.items.some(i => match(i.name)));
    bodyHtml = rows.length ? rows.map(qq => `<div style="border:1px solid var(--trim);border-radius:7px;padding:8px 10px;margin-bottom:7px;background:#181f1a">
        <b style="color:var(--gold)">${qq.name}</b>
        <div style="font-size:12px;margin-top:4px">${qq.items.map(i => `${i.qty}× ${i.name} <code style="color:#5f6a5f;font-size:10px">${i.item}</code>`).join(' · ') || '<span style="color:var(--dim)">no item rewards</span>'}</div>
        ${(qq.coins || qq.shillings) ? `<div style="font-size:11px;color:var(--dim);margin-top:2px">${qq.coins ? qq.coins + ' coins' : ''}${qq.coins && qq.shillings ? ' · ' : ''}${qq.shillings ? qq.shillings + ' $LoS' : ''}</div>` : ''}</div>`).join('') : '<p style="color:var(--dim)">no matches</p>';
  } else {
    const rows = dt.recipes.filter(r => match(r.name) || match(r.output));
    bodyHtml = `<table style="width:100%;font-size:12px"><tr style="color:var(--dim)"><th style="text-align:left">makes</th><th style="text-align:left">skill</th><th style="text-align:right">lvl</th><th style="text-align:left">station</th><th style="text-align:left">materials</th></tr>
      ${rows.length ? rows.map(r => `<tr><td><b>${r.name}</b> <code style="color:#5f6a5f;font-size:10px">${r.output}</code></td><td>${r.skill}</td><td style="text-align:right">${r.lvl}</td><td>${r.station || 'anywhere'}</td><td>${Object.entries(r.inputs || {}).filter(([, q2]) => q2 > 0).map(([it, q2]) => `${q2}× ${it}`).join(', ')}</td></tr>`).join('') : '<tr><td colspan=5 style="color:var(--dim)">no matches</td></tr>'}</table>`;
  }
  main.innerHTML = `<h2>Drop tables &amp; item sources</h2>
    <p style="color:var(--dim);margin-bottom:10px">Every source that grants an item — read live from the server, so studio-deployed gear appears here too. Search by monster, reward, or recipe.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
      ${tabs.map(([k, label]) => `<button class="act ${dropView.tab === k ? 'on' : ''}" data-dtab="${k}">${label}</button>`).join('')}
      <input id="drop-q" placeholder="search item / mob / recipe…" value="${dropView.q.replace(/"/g, '&quot;')}" style="flex:1;min-width:180px;margin-left:auto">
      <button class="act" id="drop-refresh" title="reload live tables">↻</button>
    </div>
    <div>${bodyHtml}</div>`;
  for (const b of main.querySelectorAll('[data-dtab]')) b.onclick = () => { dropView.tab = b.dataset.dtab; renderDrops(); };
  main.querySelector('#drop-refresh').onclick = () => send({ t: 'dropTables' });
  const qi = main.querySelector('#drop-q');
  qi.oninput = () => { dropView.q = qi.value; renderDrops(); const f = main.querySelector('#drop-q'); if (f) { f.focus(); f.setSelectionRange(qi.value.length, qi.value.length); } };
}

function renderTreasury() {
  const t = state.treasury;
  const e = state.econ || {};
  const oneIn = e.mobDropChance ? Math.round(1 / e.mobDropChance) : 900;
  const frozen = t && t.frozen;
  main.innerHTML = `<h2>Protocol treasury</h2>
    <div class="cards">
      <div class="card"><b style="color:var(--gold)">${t ? t.balance.toLocaleString() : '…'}</b><span>$LoS in treasury</span></div>
      <div class="card"><b>${t ? (t.taxBps / 100) : '…'}%</b><span>GE trade tax</span></div>
      <div class="card"><b>×${e.distMult ?? '…'}</b><span>distribution rate</span></div>
    </div>
    <p style="color:var(--dim);margin-bottom:10px">The treasury grows solely from the ${t ? t.taxBps / 100 : 5}% Grand Exchange trade tax. Buyback-and-burn and creator-wallet transfers are handled physically by the operator, off-platform.</p>

    <h2>Emergency controls</h2>
    <div style="border:1px solid ${frozen ? '#e0304a' : 'var(--line,#3a3a44)'};border-radius:8px;padding:12px 14px;margin-bottom:16px;background:${frozen ? 'rgba(224,48,74,0.10)' : 'transparent'}">
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <div style="font-size:22px">${frozen ? '🧊' : '🛡'}</div>
        <div style="flex:1;min-width:200px">
          <b style="color:${frozen ? '#ff6a7a' : 'var(--gold)'}">Vault status: ${frozen ? 'FROZEN — all withdrawals suspended' : 'Live — withdrawals processing normally'}</b>
          <div style="color:var(--dim);font-size:12px;margin-top:2px">A freeze halts every PDA-vault withdrawal and release at once. Player balances stay safe on the ledger; lift the freeze to resume.</div>
        </div>
        <button class="act" id="tr-freeze" style="${frozen ? 'background:#2e7d46;border-color:#2e7d46' : 'background:#c0243a;border-color:#c0243a'};color:#fff;font-weight:700;padding:10px 18px">${frozen ? '✅ Lift freeze' : '🧊 FREEZE vault'}</button>
      </div>
    </div>

    <h2>$LoS award rates</h2>
    <p style="color:var(--dim);margin-bottom:8px">Adjust the base rates at which $LoS is minted to players. The <b>distribution multiplier</b> scales every payout; the rest are per-category base rates.</p>
    <form class="ev" id="rw-form" style="grid-template-columns:repeat(3,1fr);max-width:720px">
      <label>Distribution multiplier (×)<input name="distMult" type="number" step="0.5" min="0" value="${e.distMult ?? 1}"></label>
      <label>Boss bounty (base $LoS)<input name="bossBounty" type="number" step="1" min="0" value="${e.bossBounty ?? 3}"></label>
      <label>Mob $LoS drop — 1 in<input name="mobDropOneIn" type="number" step="1" min="1" value="${oneIn}"></label>
      <label>Dungeon floor (base $LoS)<input name="dungeonFloor" type="number" step="1" min="0" value="${e.dungeonFloor ?? 2}"></label>
      <label>Event payout (base $LoS)<input name="eventPayout" type="number" step="1" min="0" value="${e.eventPayout ?? 5}"></label>
      <label style="justify-content:end"><button class="act" type="submit">Save reward rates</button></label>
    </form>

    <h2>Recent inflows</h2>
    <table><tr><th>time</th><th>source</th><th>amount</th></tr>
    ${t ? t.inflows.map(l => `<tr><td>${fmtT(l[0])}</td><td>${l[2]}</td><td class="mint">+${l[3]}</td></tr>`).join('') || '<tr><td colspan=3><i>no inflows yet</i></td></tr>' : ''}</table>`;
  main.querySelector('#rw-form').onsubmit = (ev) => {
    ev.preventDefault();
    const f = Object.fromEntries(new FormData(ev.target).entries());
    const oneInN = Math.max(1, parseFloat(f.mobDropOneIn) || 900);
    send({ t: 'rewards', set: {
      distMult: parseFloat(f.distMult) || 0,
      bossBounty: parseFloat(f.bossBounty) || 0,
      mobDropChance: 1 / oneInN,
      dungeonFloor: parseFloat(f.dungeonFloor) || 0,
      eventPayout: parseFloat(f.eventPayout) || 0,
    } });
  };
  const fb = main.querySelector('#tr-freeze');
  if (fb) fb.onclick = () => {
    send({ t: 'vault', freeze: !frozen });                 // toggle the emergency freeze
    setTimeout(() => send({ t: 'treasury' }), 200);        // refresh the panel state
  };
  send({ t: 'treasury' });
}

function renderToken() {
  const tk = state.token;
  const c = tk?.config || {};
  main.innerHTML = `<h2>$LoS token migration</h2>
    <p style="color:var(--dim);margin-bottom:12px">Launch or migrate to your on-chain token: enter its contract (or mint authority) address and the treasury address. The vault and contract config adapt automatically — releases below the review threshold auto-settle on-chain, larger ones still await admin review. A deployment manifest is generated for the operator to sign & deploy (no private keys are handled here).</p>
    <div class="card" style="margin-bottom:14px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;max-width:640px">
        <label style="font-size:12px;color:var(--dim)">Ticker<br><input id="tk-sym" value="${c.symbol || '$LoS'}" style="width:100%"></label>
        <label style="font-size:12px;color:var(--dim)">Chain<br><input id="tk-chain" value="${c.chain || 'robinhood'}" style="width:100%"></label>
        <label style="font-size:12px;color:var(--dim)">Contract address<br><input id="tk-contract" value="${c.contract || ''}" placeholder="0x… or rh1…" style="width:100%"></label>
        <label style="font-size:12px;color:var(--dim)">Mint authority (optional)<br><input id="tk-mint" value="${c.mintAuthority || ''}" placeholder="mint address" style="width:100%"></label>
        <label style="font-size:12px;color:var(--dim)">Treasury address<br><input id="tk-treas" value="${c.treasuryAddress || ''}" placeholder="treasury wallet" style="width:100%"></label>
        <div style="align-self:end"><button class="act" id="tk-go">${c.migrated ? 'Update migration' : 'Configure & generate deploy'}</button></div>
      </div>
      <div style="margin-top:8px;font-size:12px">${c.migrated ? `<span class="released">● LIVE</span> migrated ${c.migratedAt ? new Date(c.migratedAt).toLocaleString() : ''} — releases under threshold auto-settle to <b>${c.contract || c.mintAuthority}</b>` : '<span style="color:var(--dim)">○ not yet migrated (custodial off-chain ledger active)</span>'}</div>
    </div>
    <h2>Deployment manifest</h2>
    <pre style="background:#010409;border:1px solid var(--line);border-radius:8px;padding:12px;overflow:auto;max-height:340px">${tk ? JSON.stringify(tk.manifest, null, 2) : '…'}</pre>`;
  main.querySelector('#tk-go').onclick = () => send({ t: 'token', migrate: {
    symbol: main.querySelector('#tk-sym').value.trim(), chain: main.querySelector('#tk-chain').value.trim(),
    contract: main.querySelector('#tk-contract').value.trim(), mintAuthority: main.querySelector('#tk-mint').value.trim(),
    treasuryAddress: main.querySelector('#tk-treas').value.trim(),
  } });
  send({ t: 'token' });
}

function renderSim() {
  const r = state.sim;
  main.innerHTML = `<h2>Economy sustainability simulation</h2>
    <p style="color:var(--dim);margin-bottom:10px">Projects $LoS emission (mob drops, boss bounties, dungeons, events, milestones) against sinks (GE treasury tax, burns, player withdrawals) using the live reward constants. Tune the activity assumptions and run.</p>
    <div style="margin-bottom:8px">
      <span style="color:var(--dim);font-size:12px;margin-right:6px">Distribution rate:</span>
      ${[1, 2, 3, 4, 5, 10].map(n => `<button class="act dm-preset" data-m="${n}">${n === 1 ? 'base' : '×' + n}</button>`).join(' ')}
      <button class="act dm-preset" data-m="custom">custom…</button>
    </div>
    <form class="ev" id="sim-form" style="grid-template-columns:repeat(3,1fr)">
      <label>Players<input name="players" type="number" value="${r?.assumptions.players || 200}"></label>
      <label>Days<input name="days" type="number" value="${r?.assumptions.days || 30}"></label>
      <label>Hours/player/day<input name="hoursPerDay" type="number" step="0.5" value="${r?.assumptions.hoursPerDay || 2}"></label>
      <label>GE volume /player/day ($LoS)<input name="tradeVolPerPlayerDay" type="number" value="${r?.assumptions.tradeVolPerPlayerDay || 300}"></label>
      <label>Withdraw fraction (0–1)<input name="withdrawFrac" type="number" step="0.05" value="${r?.assumptions.withdrawFrac ?? 0.25}"></label>
      <label>Distribution multiplier (×)<input name="distMult" type="number" step="0.5" min="0" value="${r?.assumptions.distMult ?? 1}"></label>
      <label style="justify-content:end"><button class="act" type="submit">Run simulation</button></label>
    </form>
    ${r ? `<div class="cards">
      <div class="card"><b>${r.daily.emission.toLocaleString()}</b><span>daily emission</span></div>
      <div class="card"><b class="mint">${r.daily.tax.toLocaleString()}</b><span>daily treasury tax</span></div>
      <div class="card"><b class="burn">${(r.daily.burns + r.daily.withdrawals).toLocaleString()}</b><span>daily sinks (burn+withdraw)</span></div>
      <div class="card"><b style="color:${r.daily.net > 0 ? 'var(--gold)' : 'var(--green)'}">${r.daily.net > 0 ? '+' : ''}${r.daily.net.toLocaleString()}</b><span>net daily supply</span></div>
      <div class="card"><b>${r.annualisedInflationPct}%</b><span>annualised inflation</span></div>
    </div>
    <div class="card" style="margin-bottom:14px;border-color:${r.daily.net <= 0 ? 'var(--green)' : r.verdict[0] === 'S' ? 'var(--gold)' : 'var(--red)'}"><b style="font-size:14px">${r.verdict}</b></div>
    <h2>Projection (per player-hour emission: ${r.perPlayerHour} $LoS)</h2>
    <table><tr><th>day</th><th>circulating</th><th>treasury</th></tr>
    ${r.series.map(s => `<tr><td>${s.day}</td><td>${s.circulating.toLocaleString()}</td><td>${s.treasury.toLocaleString()}</td></tr>`).join('')}</table>` : '<p style="color:var(--dim)">Run a simulation to see results.</p>'}`;
  const runSim = () => {
    const f = Object.fromEntries(new FormData(main.querySelector('#sim-form')).entries());
    for (const k in f) f[k] = parseFloat(f[k]) || 0;
    send({ t: 'simulate', params: f });
  };
  main.querySelector('#sim-form').onsubmit = (e) => { e.preventDefault(); runSim(); };
  for (const b of main.querySelectorAll('.dm-preset')) b.onclick = () => {
    const dm = main.querySelector('input[name="distMult"]');
    if (b.dataset.m === 'custom') { dm.focus(); dm.select(); return; }
    dm.value = b.dataset.m;
    runSim();
  };
}

function renderDash() {
  const s = state.status;
  main.innerHTML = `<h2>Realm dashboard</h2>
    <div class="cards">
      <div class="card"><b>${s ? s.players.length : '…'}</b><span>players online</span></div>
      <div class="card"><b>${s ? s.mobs : '…'}</b><span>mobs</span></div>
      <div class="card"><b>${s ? s.entities : '…'}</b><span>entities</span></div>
      <div class="card"><b>${s ? s.chests + '/' + s.geodes : '…'}</b><span>chests / geodes</span></div>
      <div class="card"><b style="color:var(--gold)">${s ? s.supply : '…'}</b><span>$LoS supply</span></div>
      <div class="card"><b style="color:var(--gold)">${s ? (s.treasury || 0).toLocaleString() : '…'}</b><span>treasury</span></div>
      <div class="card"><b style="color:${s && s.migrated ? 'var(--green)' : 'var(--dim)'}">${s ? (s.migrated ? 'LIVE' : 'off-chain') : '…'}</b><span>token status</span></div>
      <div class="card"><b>${s ? Object.keys(s.bans).length : '…'}</b><span>active bans</span></div>
      <div class="card"><b>${s ? Math.floor(s.up / 60) + 'm' : '…'}</b><span>uptime</span></div>
    </div>
    <h2>Online</h2><div>${s ? s.players.join(', ') || '<i>empty realm</i>' : ''}</div>
    <h2 style="margin-top:16px">Security feed</h2>
    <div class="sec">${state.security.slice(0, 30).map(e => `<div><span style="color:var(--dim)">${fmtT(e.t)}</span> <span class="${e.kind}">[${e.kind}]</span> ${e.msg}</div>`).join('') || '<i>quiet so far</i>'}</div>`;
  send({ t: 'status' }); // refresh on view; server replies async
  if (!renderDash._loop) { renderDash._loop = setInterval(() => { if (view === 'dash') { send({ t: 'status' }); send({ t: 'security' }); } }, 5000); send({ t: 'security' }); }
}

function termOut(text, cls = '') {
  const log = $('#term-log');
  if (!log) return;
  const d = document.createElement('div');
  if (cls) d.className = cls;
  d.textContent = text;
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
}
function renderTerm() {
  main.innerHTML = `<h2>Server terminal</h2>
    <div id="term-log"></div>
    <input id="term-in" placeholder="type a command — 'help' lists them ('give JellyLegs hellrender', 'ban Cheater 48 macroing', …)">`;
  for (const line of state.term) termOut(line.text, line.cls);
  const inp = $('#term-in');
  inp.focus();
  inp.onkeydown = (e) => {
    if (e.key !== 'Enter' || !inp.value.trim()) return;
    const line = inp.value.trim();
    state.term.push({ text: '> ' + line, cls: 'in' });
    termOut('> ' + line, 'in');
    send({ t: 'cmd', line });
    inp.value = '';
  };
}

function renderEco() {
  const l = state.ledger;
  main.innerHTML = `<h2>$LoS economy</h2>
    <div class="cards">
      <div class="card"><b class="mint">${l ? l.log.filter(e => e[1] === 'mint').length : '…'}</b><span>mints (recent)</span></div>
      <div class="card"><b class="burn">${l ? l.log.filter(e => e[1] === 'burn').length : '…'}</b><span>burns (recent)</span></div>
      <div class="card"><b>${l ? Object.keys(l.balances).length : '…'}</b><span>accounts</span></div>
    </div>
    <h2>Audit log</h2>
    <table><tr><th>time</th><th>op</th><th>who</th><th>amt</th><th>reason</th></tr>
    ${l ? l.log.map(e => `<tr><td>${fmtT(e[0])}</td><td class="${e[1]}">${e[1]}</td><td>${e[2]}</td><td>${e[3]}</td><td>${e[4] || ''}</td></tr>`).join('') : ''}</table>
    <h2 style="margin-top:14px">Balances</h2>
    <table><tr><th>player</th><th>$LoS</th></tr>
    ${l ? Object.entries(l.balances).sort((a, b) => b[1] - a[1]).map(([n, v]) => `<tr><td>${n}</td><td>${v}</td></tr>`).join('') : ''}</table>`;
  if (!l) send({ t: 'ledger', n: 150 });
}

function renderVault() {
  const v = state.vault;
  main.innerHTML = `<h2>PDA Vault — Robinhood-chain withdrawals</h2>
    <p style="color:var(--dim);margin-bottom:12px">Flags: single withdrawal ≥ 1,000,000 $LoS · &gt;3 withdrawals per hour · any anti-cheat flag. Frozen transactions keep funds on the ledger and temp-ban the account until reviewed here.</p>
    <table><tr><th>#</th><th>time</th><th>player</th><th>amount</th><th>address</th><th>status</th><th>flags</th><th></th></tr>
    ${v ? v.requests.map(r => `<tr><td>${r.id}</td><td>${fmtT(r.t)}</td><td>${r.name}</td><td>${r.amount}</td><td>${r.address.slice(0, 18)}…</td>
      <td class="${r.status}">${r.status.toUpperCase()}</td><td>${(r.reasons || []).join('; ')}</td>
      <td>${r.status === 'frozen' ? `<button class="act" data-ap="${r.id}">approve</button> <button class="act" data-dn="${r.id}">deny</button>` : ''}</td></tr>`).join('') : ''}</table>`;
  for (const b of main.querySelectorAll('[data-ap]')) b.onclick = () => send({ t: 'vault', review: +b.dataset.ap, approve: true });
  for (const b of main.querySelectorAll('[data-dn]')) b.onclick = () => send({ t: 'vault', review: +b.dataset.dn, approve: false });
  if (!v) send({ t: 'vault' });
}

function renderEvents() {
  const ev = state.events;
  main.innerHTML = `<h2>World events</h2>
    <form class="ev" id="evform">
      <label>id <input name="id" placeholder="goblin_moot"></label>
      <label>name <input name="name" placeholder="The Goblin Moot"></label>
      <label>announcement <input name="desc" placeholder="Goblins mass on the north road!"></label>
      <label>mob <select name="mob"><option value="">(none)</option>${Object.keys(MOBS).map(m => `<option>${m}</option>`).join('')}</select></label>
      <label>count <input name="n" type="number" value="6" min="0" max="12"></label>
      <label>x <input name="x" type="number" value="600"></label>
      <label>y <input name="y" type="number" value="640"></label>
      <label>every (min) <input name="everyMin" type="number" value="30"></label>
      <label>duration (min) <input name="durMin" type="number" value="6"></label>
      <label>$LoS pool <input name="shl" type="number" value="0" min="0" title="$LoS shared among participants who fell the event's mobs"></label>
      <label style="justify-content:end"><button class="act" type="submit">Create / update</button></label>
    </form>
    <table><tr><th>id</th><th>name</th><th>where</th><th>cadence</th><th>$LoS</th><th>state</th><th></th></tr>
    ${ev ? [...ev.builtin.map(e => ({ ...e, builtin: true })), ...ev.custom].map(e => `<tr>
      <td>${e.id}${e.builtin ? ' <span style="color:var(--dim)">(built-in)</span>' : ''}</td><td>${e.name}</td>
      <td>${e.x},${e.y}</td><td>every ${e.everyMin}m for ${e.durMin}m</td>
      <td>${e.builtin ? '<span style="color:var(--dim)">base</span>' : (e.shl || 0)}</td>
      <td>${ev.state[e.id]?.active ? '<span class="released">ACTIVE</span>' : 'idle'}</td>
      <td><button class="act" data-tr="${e.id}">trigger</button>${e.builtin ? '' : ` <button class="act" data-rm="${e.id}">delete</button>`}</td></tr>`).join('') : ''}</table>`;
  $('#evform').onsubmit = (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target).entries());
    send({ t: 'events', create: f });
  };
  for (const b of main.querySelectorAll('[data-tr]')) b.onclick = () => send({ t: 'events', trigger: b.dataset.tr });
  for (const b of main.querySelectorAll('[data-rm]')) b.onclick = () => send({ t: 'events', remove: b.dataset.rm });
  if (!ev) send({ t: 'events' });
}

// ---------------- compositor ----------------
let assetsReady = false;
async function ensureAssets() {
  if (assetsReady) return;
  await Promise.all([loadMedia(), loadManifest()]);
  assetsReady = true;
}
let compTab = 'items', compSel = null, compMode = 'browse';
function renderComp() {
  main.innerHTML = `<h2>Asset compositor <span style="color:--dim;font-size:11px;color:var(--dim)">— rendered by the live game modules</span></h2>
    <div class="tabs2">${[['browse', 'Browse'], ['create', 'Creation menu'], ['anims', 'Animations creator'], ['gearsheet', 'Gear sheet maker']].map(([m, l]) => `<button data-m="${m}" class="${compMode === m ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div id="comp-body"></div>`;
  for (const b of main.querySelectorAll('[data-m]')) b.onclick = () => { compMode = b.dataset.m; cancelAnimationFrame(raf); renderComp(); };
  if (compMode === 'browse') renderCompBrowse();
  else if (compMode === 'create') ensureAssets().then(renderCompCreate);
  else if (compMode === 'gearsheet') ensureAssets().then(renderGearSheet);
  else ensureAssets().then(renderCompAnims);
}
function renderCompBrowse() {
  $('#comp-body').innerHTML = `
    <div class="tabs2">${['items', 'gear', 'weapons', 'creatures', 'fx', 'pets', 'spells'].map(t => `<button data-t="${t}" class="${compTab === t ? 'on' : ''}">${t}</button>`).join('')}
      <input id="comp-q" placeholder="filter…" style="margin-left:auto">
    </div>
    <div id="preview"><i style="color:var(--dim)">select an asset below to preview it</i></div>
    <div class="grid" id="comp-grid"></div>`;
  for (const b of $('#comp-body').querySelectorAll('[data-t]')) b.onclick = () => { compTab = b.dataset.t; compSel = null; renderComp(); };
  $('#comp-q').oninput = () => fillGrid($('#comp-q').value.toLowerCase());
  ensureAssets().then(() => { fillGrid(''); if (compSel) preview(compSel); });
}
function cellDiv(label, canvas, onClick) {
  const d = document.createElement('div');
  d.className = 'cell';
  if (canvas) d.appendChild(canvas);
  const t = document.createElement('div');
  t.textContent = label;
  d.appendChild(t);
  d.onclick = onClick;
  return d;
}
function fillGrid(q) {
  const grid = $('#comp-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const add = (label, canvas, sel) => { if (!q || label.toLowerCase().includes(q)) grid.appendChild(cellDiv(label, canvas, () => preview(sel))); };
  if (compTab === 'items') for (const id of Object.keys(ITEMS)) add(id, scaled(itemIcon(id), 40), { kind: 'item', id });
  // the full LPC wardrobe: every equipment slot/type, worn on a mannequin
  if (compTab === 'gear') {
    for (const [key, colors] of Object.entries(gearCatalog())) {
      const [slot, type] = key.split('/');
      add(key, gearThumb(slot, type, colors[0]), { kind: 'gear', key, slot, type, color: colors[0], colors });
    }
    // the mannequin sheets stream in lazily — refresh the thumbnails once
    if (!MS._gearRefreshed) { MS._gearRefreshed = true; setTimeout(() => { if (compTab === 'gear') fillGrid($('#comp-q')?.value.toLowerCase() || ''); }, 700); }
  }
  if (compTab === 'creatures') for (const id of Object.keys(MOBS)) add(id, null, { kind: 'creature', id });
  if (compTab === 'weapons') for (const [id, it] of Object.entries(ITEMS)) if (it.vis?.layer === 'weapon') add(id, scaled(itemIcon(id), 40), { kind: 'weapon', id });
  if (compTab === 'fx') for (const id of Object.keys(MEDIA.fx || {})) { const f = MEDIA.fx[id]; for (let v = 0; v < (f.variants || 1); v++) add(`${id}:${v}`, null, { kind: 'fx', id: `${id}:${v}` }); }
  if (compTab === 'pets') for (const id of Object.keys(PETS)) add(id, null, { kind: 'pet', id });
  if (compTab === 'spells') for (const id of Object.keys(SPELLS)) add(id, null, { kind: 'spell', id });
}
function scaled(src, size) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, size, size);
  return c;
}
// A plain LPC mannequin wearing one gear piece in the given slot (head gear
// hides the hair). Shared by the Gear browser's thumbnails and preview.
function gearVis(slot, type, color, sex = 'male') {
  const vis = { sex, skin: 'light', hair: ['plain', 'dark_brown'], torso: ['tunic', 'green'], legs: ['pants', 'brown'], feet: ['shoes', 'brown'] };
  if (slot === 'head') delete vis.hair;
  vis[slot] = [type, color];
  return vis;
}
function gearThumb(slot, type, color, size = 40) {
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  try {
    const vis = gearVis(slot, type, color);
    const comp = composite(vis);
    drawChar(g, comp, 'walk', 2, 0, size / 2, size * 0.94, size / 46);
    drawOversize(g, comp, vis, 'walk', 2, 0, size / 2, size * 0.94, size / 46);
  } catch { }
  return c;
}
function preview(sel) {
  compSel = sel;
  const pv = $('#preview');
  pv.innerHTML = '';
  const c = document.createElement('canvas');
  c.width = 260; c.height = 200;
  pv.appendChild(c);
  const info = document.createElement('pre');
  pv.appendChild(info);
  const g = c.getContext('2d');
  cancelAnimationFrame(raf);

  if (sel.kind === 'item') {
    const it = ITEMS[sel.id];
    info.textContent = JSON.stringify(it, null, 1);
    // Pet tokens preview the actual companion critter, not the inventory token.
    // Equippable items are shown worn on an LPC paperdoll (helmet on the head,
    // armour on the body, weapon in hand). Everything else keeps its icon — that
    // IS how it looks in-game.
    if (it.pet && PETS[it.pet]) {
      previewCritterDef(g, PETS[it.pet], () => compSel === sel);
    } else if (it.aura) {
      previewAura(g, it.aura, () => compSel === sel);
    } else if (it.mount) {
      previewMount(g, it.mount, () => compSel === sel);
    } else if (it.vis && it.vis.layer) {
      previewEquipped(g, it, () => compSel === sel);
    } else {
      g.imageSmoothingEnabled = false;
      g.drawImage(itemIcon(sel.id), 66, 36, 128, 128);
    }
    return;
  }
  if (sel.kind === 'fx') {
    info.textContent = `fx sheet variant — ${sel.id}\n${JSON.stringify(MEDIA.fx[sel.id.split(':')[0]], null, 1).slice(0, 400)}`;
    const loop = (now) => { g.clearRect(0, 0, 260, 200); drawFxSprite(g, sel.id, (now % 1600) / 1600, 130, 100, 170); if (compSel === sel) raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return;
  }
  if (sel.kind === 'spell') {
    const s = SPELLS[sel.id];
    info.textContent = JSON.stringify(s, null, 1);
    previewSpell(g, s, () => compSel === sel);
    return;
  }
  if (sel.kind === 'creature' || sel.kind === 'pet') {
    const def = sel.kind === 'pet' ? PETS[sel.id] : MOBS[sel.id];
    info.textContent = JSON.stringify(def, null, 1).slice(0, 900);
    // Render through whichever visual system the creature actually uses in-game:
    // an animated media sheet, a procedural critter, or an LPC-composited humanoid.
    const system = def.sheet ? 'sheet' : def.critter ? 'critter' : def.vis ? 'vis' : 'none';
    const animSets = {
      sheet: ['idle', 'walk', 'attack', 'special', 'death'],
      critter: ['idle', 'walk', 'attack', 'hurt'],
      vis: ['idle', 'walk', 'slash', 'thrust', 'spellcast', 'shoot', 'hurt'],
      none: [],
    };
    let anim = 'idle', animStart = performance.now(), dirState = 2;
    const sels = document.createElement('div');
    sels.style.marginTop = '6px';
    sels.innerHTML = animSets[system].map(a => `<button class="act" data-a="${a}">${a}</button>`).join(' ')
      || '<i style="color:var(--dim)">no visual defined</i>';
    pv.appendChild(sels);
    for (const b of sels.querySelectorAll('button')) b.onclick = () => { anim = b.dataset.a; animStart = performance.now(); };
    // direction row (critters/creatures) so facing can be tested
    if (system === 'critter' || system === 'sheet') {
      const dirs = document.createElement('div'); dirs.style.marginTop = '4px';
      dirs.innerHTML = [['↑ up', 0], ['← left', 1], ['↓ down', 2], ['→ right', 3]].map(([l, d]) => `<button class="act" data-d="${d}">${l}</button>`).join(' ');
      pv.appendChild(dirs);
      for (const b of dirs.querySelectorAll('button')) b.onclick = () => { dirState = +b.dataset.d; };
    }
    const cx = 130, cy = 178;
    const fake = { id: 7, dir: 2, hp: 1, tint: def.tint, animStart };
    const loop = (now) => {
      g.clearRect(0, 0, 260, 200);
      g.imageSmoothingEnabled = false;
      fake.dir = dirState;   // let the direction buttons steer the facing
      if (system === 'sheet') {
        fake.anim = anim;
        fake.hp = anim === 'death' ? 0 : 1;
        fake.deathStart = anim === 'death' ? animStart : 0;
        if (anim === 'attack' || anim === 'special') { if (now - (fake._last || 0) > 1400) { fake.animStart = animStart = now; fake._last = now; } }
        else fake.animStart = animStart;
        drawCreature(g, def.sheet, fake, anim, now, cx, cy + 4, def.scale || 1);
      } else if (system === 'critter') {
        const wf = anim === 'walk' ? Math.floor(now / 70) % 9
          : anim === 'attack' ? Math.floor((now % 720) / 120)
            : anim === 'hurt' ? Math.floor((now % 720) / 120)
              : Math.floor(now / 650) % 2;
        const sc = (def.scale || 1) * 1.7;
        const spr = critterSprite(def.critter, wf, dirState, anim, false);
        const S = 64 * sc;
        g.save();
        if (dirState === 1) { g.translate(cx, 0); g.scale(-1, 1); g.translate(-cx, 0); }   // mirror left-facers
        g.drawImage(spr, cx - S / 2, cy - S + 14 * sc, S, S);
        g.restore();
      } else if (system === 'vis') {
        const ai = ANIMS[anim] || ANIMS.idle;
        let frame;
        if (ai.once) { const el = now - animStart; frame = Math.min(ai.frames - 1, Math.floor(el / ai.ms)); }
        else frame = Math.floor(now / ai.ms) % ai.frames;
        const sc = (def.scale || 1) * 1.9;
        const comp = composite(def.vis);
        drawChar(g, comp, anim, 2, frame, cx, cy, sc);
        drawOversize(g, comp, def.vis, anim, 2, frame, cx, cy, sc);
      } else {
        g.fillStyle = '#8b949e'; g.font = '12px monospace';
        g.fillText('no visual defined for ' + sel.id, 20, 100);
      }
      if (compSel === sel) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return;
  }
  if (sel.kind === 'weapon') {
    const it = ITEMS[sel.id];
    info.textContent = JSON.stringify(it, null, 1);
    previewEquipped(g, it, () => compSel === sel);
  }
  if (sel.kind === 'gear') {
    info.textContent = `LPC gear · ${sel.slot} / ${sel.type}\ndye colours: ${sel.colors.join(', ')}`;
    const vis = gearVis(sel.slot, sel.type, sel.color);
    const comp = composite(vis);
    const loop = (now) => {
      g.clearRect(0, 0, 260, 200);
      g.imageSmoothingEnabled = false;
      const wf = Math.floor(now / 110) % ANIMS.walk.frames;
      drawChar(g, comp, 'walk', 2, wf, 74, 176, 2.1);
      drawOversize(g, comp, vis, 'walk', 2, wf, 74, 176, 2.1);
      const ai = ANIMS.slash, sf = Math.floor(now / 90) % ai.frames;   // a combat pose too, for shields/behind gear
      drawChar(g, comp, 'slash', 2, sf, 190, 176, 2.1);
      drawOversize(g, comp, vis, 'slash', 2, sf, 190, 176, 2.1);
      if (compSel === sel) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    // dye swatches: click to re-dye and re-preview the same piece
    const sw = document.createElement('div');
    sw.style = 'display:flex;gap:4px;flex-wrap:wrap;margin-top:6px';
    for (const col of sel.colors) {
      const b = document.createElement('button'); b.className = 'act'; b.textContent = col;
      b.style.cssText = 'padding:2px 6px;font-size:10px' + (col === sel.color ? ';outline:2px solid var(--gold)' : '');
      b.onclick = () => preview({ ...sel, color: col });
      sw.appendChild(b);
    }
    pv.appendChild(sw);
  }
}

// Render a pet/creature def (sheet or procedural critter) walking, for pet tokens.
function previewCritterDef(g, def, alive) {
  const loop = (now) => {
    g.clearRect(0, 0, 260, 200);
    g.imageSmoothingEnabled = false;
    if (def.sheet) {
      drawCreature(g, def.sheet, { id: 7, dir: 2, hp: 1, tint: def.tint, anim: 'walk', animStart: 0 }, 'walk', now, 130, 182, def.scale || 1);
    } else if (def.critter) {
      const sc = (def.scale || 1) * 1.9;
      const spr = critterSprite(def.critter, Math.floor(now / 70) % 9, 2, 'walk', false);
      const S = 64 * sc;
      g.drawImage(spr, 130 - S / 2, 178 - S + 14 * sc, S, S);
    }
    if (alive()) raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}

// Render an equippable item exactly as it loads in-game: worn on an LPC paperdoll,
// with a walk cycle beside its action pose (weapon swing / bow shot / spell cast).
function previewEquipped(g, it, alive) {
  const vis = {
    sex: 'male', skin: 'light', hair: ['plain', 'dark_brown'],
    torso: ['tunic', 'green'], legs: ['pants', 'brown'], feet: ['shoes', 'brown'],
  };
  vis[it.vis.layer] = [it.vis.sheet || it.vis.type, it.vis.color, it.vis.glow, it.vis.fx];
  const isWeapon = it.vis.layer === 'weapon';
  // honour the weapon's OWN combat pose: daggers/halberds/tridents/spears
  // thrust, staves jab-cast on the thrust rows, bows draw, the rest slash
  const actAnim = !isWeapon ? 'walk'
    : it.anim === 'shoot' ? 'shoot'
      : (it.anim === 'thrust' || it.anim === 'spellcast') ? 'thrust' : 'slash';
  const comp = composite(vis);
  const loop = (now) => {
    g.clearRect(0, 0, 260, 200);
    g.imageSmoothingEnabled = false;
    const wf = Math.floor(now / 110) % ANIMS.walk.frames;
    drawChar(g, comp, 'walk', 2, wf, 78, 172, 2);
    drawOversize(g, comp, vis, 'walk', 2, wf, 78, 172, 2);
    const ai = ANIMS[actAnim] || ANIMS.slash;
    const af = Math.floor(now / ai.ms) % ai.frames;
    drawChar(g, comp, actAnim, 2, af, 186, 172, 2);
    drawOversize(g, comp, vis, actAnim, 2, af, 186, 172, 2);
    // signature bloom for a glowing rare/unique weapon
    if (isWeapon && it.vis.glow) for (const cx of [78, 186]) {
      g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5 + 0.3 * Math.sin(now / 300);
      const gy = 172 - 64, gr = g.createRadialGradient(cx, gy, 0, cx, gy, 40);
      gr.addColorStop(0, it.vis.glow); gr.addColorStop(1, it.vis.glow + '00');
      g.fillStyle = gr; g.beginPath(); g.arc(cx, gy, 40, 0, 7); g.fill(); g.restore();
    }
    if (alive()) raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}

const BASE_VIS = { sex: 'male', skin: 'light', hair: ['plain', 'dark_brown'], torso: ['tunic', 'green'], legs: ['pants', 'brown'], feet: ['boots', 'brown'] };
// An aura worn on a character: the looping elemental FX around an idle figure.
function previewAura(g, aura, alive) {
  const comp = composite(BASE_VIS);
  const loop = (now) => {
    g.clearRect(0, 0, 260, 200);
    g.imageSmoothingEnabled = false;
    const f = Math.floor(now / 650) % ANIMS.idle.frames;
    // aura first (behind the back), fitted head→feet exactly as in-game
    g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.9;
    drawFxBand(g, aura.fx, ((now) % 1600) / 1600, 130, 176 - 42 * 2.2, 176 + 9 * 2.2, aura.tint);
    g.restore();
    drawChar(g, comp, 'idle', 2, f, 130, 176, 2.2);
    if (alive()) raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}
// A mount ridden by a character: the beast with a seated rider, exactly as in-game.
function previewMount(g, mount, alive) {
  const comp = composite(BASE_VIS);
  const loop = (now) => {
    g.clearRect(0, 0, 260, 200);
    g.imageSmoothingEnabled = false;
    const bob = mount.fly ? Math.sin(now / 320) * 3 + 10 : 0;
    const fake = { id: 7, dir: 2, hp: 1, tint: mount.tint, animStart: 0, anim: 'walk' };
    const mh = drawCreature(g, mount.sheet, fake, 'walk', now, 130, 176 - bob, 1.5);
    const lift = (mh ? mh * 0.42 : 15) + bob;
    drawChar(g, comp, 'idle', 2, 0, 130, 176 - lift, 2);
    g.save(); g.beginPath(); g.rect(130 - 46, 176 - lift - 8, 92, 46); g.clip();
    drawCreature(g, mount.sheet, fake, 'walk', now, 130, 176 - bob, 1.5);
    g.restore();
    if (alive()) raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}
// Every spell previews its full cast: a staff-caster on the left, the projectile
// (sheet or elemental orb) arcing to a dummy, then an impact burst — or the
// teleport channel / self heal for non-damage spells.
const SPELL_ORB = { air: '#cfe8f8', earth: '#b08a4c', water: '#6ab0e0', fire: '#ffb02a', nature: '#7fd05f', holy: '#fff3b0', blood: '#ff5a5a' };
function previewSpell(g, s, alive) {
  const sheet = s.proj && s.proj.startsWith('sheet:') ? s.proj.slice(6) : null;
  const orb = SPELL_ORB[s.proj] || '#c08aff';
  const caster = { sex: 'male', skin: 'light', hair: ['plain', 'dark_brown'], torso: ['robe', 'blue'], legs: ['pants', 'blue'], weapon: ['staff', 'light'] };
  const comp = composite(caster);
  const cast = ANIMS.thrust;
  const loop = (now) => {
    g.clearRect(0, 0, 260, 200);
    g.imageSmoothingEnabled = false;
    const cf = Math.floor((now % (cast.frames * cast.ms)) / cast.ms);
    drawChar(g, comp, 'thrust', 3, cf, 58, 172, 1.9);
    drawOversize(g, comp, caster, 'thrust', 3, cf, 58, 172, 1.9);
    const cyc = (now % 1400) / 1400;
    if (s.teleport) {
      drawFxSprite(g, 'anima', cyc, 150, 120, 150);
    } else if (s.heal || s.self) {
      g.save(); g.globalCompositeOperation = 'lighter';
      drawFxSprite(g, 'aura_charged', cyc, 70, 150, 100, 0, '#7fd05f');
      g.restore();
    } else {
      const t = Math.min(1, cyc * 1.45);
      const x = 92 + (214 - 92) * t, y = 118 - Math.sin(t * Math.PI) * 20;
      if (t < 1) {
        if (sheet) { if (!drawFxSprite(g, sheet, cyc, x, y, 60, 0)) orbAt(g, x, y, orb); }
        else orbAt(g, x, y, orb);
      } else {
        g.save(); g.globalCompositeOperation = 'lighter';
        if (!drawFxSprite(g, 'vfx_impact', (cyc - 0.69) / 0.31, 214, 118, 74, 0, orb)) {
          g.fillStyle = orb; for (let i = 0; i < 8; i++) { const a = i / 8 * 7; g.beginPath(); g.arc(214 + Math.cos(a) * 13, 118 + Math.sin(a) * 13, 3, 0, 7); g.fill(); }
        }
        g.restore();
      }
    }
    if (alive()) raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}
function orbAt(g, x, y, col) {
  g.save(); g.shadowColor = col; g.shadowBlur = 10; g.fillStyle = col;
  g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); g.restore();
}

// ============================================================================
// MAP STUDIO — live visual world editor. Renders the generated world 1px/tile
// into a base canvas, then pans (WASD / drag) and zooms over it. Edits stage
// locally as a sparse patch and hot-apply on Save: the server persists them,
// updates live collision, and every game client loads them at boot.
// ============================================================================
const TILE_META = [
  [TILE.OCEAN, 'Ocean', '#173a5e'], [TILE.WATER, 'Water', '#2d6da8'], [TILE.RIVER, 'River', '#3f86c2'],
  [TILE.SAND, 'Sand', '#dbc384'], [TILE.GRASS, 'Grass', '#5d9440'], [TILE.MEADOW, 'Meadow', '#79a84e'],
  [TILE.DIRT, 'Dirt', '#8a6a44'], [TILE.FOREST, 'Forest', '#3f7031'], [TILE.DEEPFOREST, 'Deep forest', '#2c5426'],
  [TILE.SWAMP, 'Swamp', '#5c6b3c'], [TILE.JUNGLE, 'Jungle', '#2f6b3a'], [TILE.ROCK, 'Rock', '#7d7d85'],
  [TILE.SCREE, 'Scree', '#9a9a8e'], [TILE.TUNDRA, 'Tundra', '#a8b09a'], [TILE.SNOW, 'Snow', '#e8edf2'],
  [TILE.ICE, 'Ice', '#bcdcec'], [TILE.ROAD, 'Road', '#a08054'], [TILE.BRIDGE, 'Bridge', '#8a5c30'],
  [TILE.PATH, 'Cobble path', '#9a8f80'], [TILE.FARM, 'Farm soil', '#6b4a2c'],
  [TILE.FLOOR_WOOD, 'Wood floor', '#7c5a34'], [TILE.FLOOR_STONE, 'Stone floor', '#8c8c94'],
  [TILE.WALL, 'Stone wall', '#4a4a52'], [TILE.WALL_WOOD, 'Wood wall', '#5c3f22'],
  [TILE.CAVE, 'Cave floor', '#54465c'], [TILE.LAVA_ROCK, 'Lava rock', '#4a2c2c'],
  [TILE.WATER_SWAMP, 'Bog water', '#41543e'],
];
const TILE_RGB = {}; const TILE_NAME = {};
for (const [t, n, c] of TILE_META) { TILE_NAME[t] = n; TILE_RGB[t] = [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
// Every placeable asset in the game, organized by build intent: the whole
// MEDIA.trees prop registry (trees, signs, stalls, formations, ruins…), the
// procedural station/decor sprites, and the grid packs ('prop:<pack>:<idx>')
// for cave & dungeon dressing. A catch-all row keeps future registry
// additions from silently vanishing.
const MS_CATALOG = () => {
  const T = Object.keys(MEDIA.trees || {});
  const used = new Set();
  const pick = (re) => T.filter(k => re.test(k) && !used.has(k) && (used.add(k) || true));
  const grid = (pack) => {
    const sh = MEDIA.sheets?.[pack];
    if (!sh) return [];
    let n;
    if (Array.isArray(sh)) n = sh.length;
    else if (sh.cols && sh.rows) n = sh.cols * sh.rows;
    else { const cw = sh.cellW || sh.cell || 32, ch = sh.cellH || sh.cell || 32; n = Math.floor(sh.w / cw) * Math.floor(sh.h / ch); }
    return Array.from({ length: n }, (_, i) => `prop:${pack}:${i}`);
  };
  const cat = {
    'Trees': pick(/(^|_)tree$/).filter(k => !/jungle/.test(k)),
    'Ores & mining': Object.keys(NODES).filter(k => NODES[k].skill === 'mining'),
    'Fishing': Object.keys(NODES).filter(k => NODES[k].skill === 'fishing'),
    'Farming & hunter': Object.keys(NODES).filter(k => ['farming', 'hunter'].includes(NODES[k].skill)),
    'Agility & POI': Object.keys(NODES).filter(k => ['agility', 'archaeology'].includes(NODES[k].skill)),
    'Stations': ['anvil', 'furnace', 'range', 'loom', 'spinning_wheel', 'chapel_altar', 'bank_booth', 'ge_booth', 'campfire', 'well', 'obelisk', 'museum_bench'],
    'Town & village': pick(/^sign_|^signpost|wash_line|scarecrow|_stall$|smith_anvil|quench|toolbench/),
    'Graves & waymarks': pick(/grave/).concat(['dungeon_entrance', 'cliff_ladder', 'ge_rope']),
    'Stone formations': pick(/^rocks_|^spire_|^dolmen_|^crag_/),
    'Mountains': pick(/^mountain_/),
    'Jungle & ruins': pick(/jungle|^ruin_|pitcher|heliconia|potted_palm/),
    'Desert & adobe': pick(/adobe|sun_rug/),
    'Cave & dungeon decor': [...grid('undeadDecor'), ...grid('geo_objects'), ...grid('geo_rocks')],
    'Abyssal dungeon tiles': grid('geo_tiles'),
    'Isometric tileset': grid('iso_tiles'),
  };
  const rest = T.filter(k => !used.has(k) && !/(^|_)tree$/.test(k) && !NODES[k]);
  if (rest.length) cat['More props'] = rest;
  return cat;
};
const MS = {
  vp: { x: 600, y: 420, z: 4 }, tool: 'pan', terrain: TILE.GRASS, elevDelta: +1,
  node: 'tree', brush: 1, level: null, mobMode: false, zoneSel: null,
  pending: { tiles: {}, elev: {}, nodes: {}, levels: {}, spawns: {} }, dirty: 0,
  previewBackup: { tiles: {}, elev: {}, nodes: {} },   // pre-edit override values, for Discard
  base: null, baseRows: 0, drag: null, mouse: null, thumbs: new Map(), inited: false,
  view: '2d', isoR: null, isoFx: null, isoEnts: new Map(), isoDep: new Set(), sel: null, hover: null,
  isoZoom: 1, isoBuf: null,   // rendered-view zoom (offscreen buffer sized canvas/zoom)
};
// Live rendered preview: as the brush paints (terrain, elevation, models), poke
// the edit straight into the override layer + cached world and re-bake only the
// touched chunk, so the iso "Rendered view" shows the true result immediately —
// not just a highlight. Discard restores the snapshotted originals.
function msPreviewPoke(x, y) {
  const k = msKey(x, y);
  if (!(k in MS.previewBackup.tiles)) MS.previewBackup.tiles[k] = k in MAP_OVERRIDES.tiles ? MAP_OVERRIDES.tiles[k] : undefined;
  if (!(k in MS.previewBackup.elev)) MS.previewBackup.elev[k] = k in MAP_OVERRIDES.elev ? MAP_OVERRIDES.elev[k] : undefined;
  if (!(k in MS.previewBackup.nodes)) MS.previewBackup.nodes[k] = k in MAP_OVERRIDES.nodes ? MAP_OVERRIDES.nodes[k] : undefined;
  if (MS.pending.tiles[k] !== undefined) { MAP_OVERRIDES.tiles[k] = MS.pending.tiles[k]; syncTile(x, y); }
  if (MS.pending.elev[k] !== undefined) MAP_OVERRIDES.elev[k] = MS.pending.elev[k];
  if (MS.pending.nodes[k] !== undefined) { MAP_OVERRIDES.nodes[k] = MS.pending.nodes[k]; syncNode(x, y); }
  flushChunkAt(0, x, y);
}
function msRevertPreview() {
  for (const store of ['tiles', 'elev', 'nodes']) {
    for (const k of Object.keys(MS.previewBackup[store])) {
      const v = MS.previewBackup[store][k];
      if (v === undefined) delete MAP_OVERRIDES[store][k]; else MAP_OVERRIDES[store][k] = v;
    }
  }
  MS.previewBackup = { tiles: {}, elev: {}, nodes: {} };
  applyMapOverrides({});   // null the cached world so procedural tiles/nodes restore cleanly
  flushChunkCache();
}
// Selector tool: what asset sits at a tile? Checks the plane the studio is
// looking at — a placed node/prop/tree/station, or a spawn zone covering it.
function msAssetAt(x, y) {
  const lv = MS.level && !MS.gateArm && msLevels()[MS.level];
  if (lv) {
    const cur = MS.pending.levels[MS.level] || lv;
    const t = cur.nodes?.[msKey(x, y)];
    return t ? { kind: 'levelnode', x, y, type: t, level: MS.level } : null;
  }
  const n = msNodeAt(x, y);
  if (n) return { kind: 'node', x, y, type: n };
  const zones = { ...(state.spawns?.custom || {}), ...MS.pending.spawns };
  let best = null, bd = 1e9;
  for (const [id, z] of Object.entries(zones)) {
    if (!z || (z.plane | 0) !== 0) continue;
    const d = Math.hypot(z.x - x, z.y - y);
    if (d <= Math.max(1.5, z.r) && d < bd) { bd = d; best = { kind: 'spawn', id, zone: z, x: z.x, y: z.y }; }
  }
  return best;
}
// Screen-space centre of a tile in whichever view is active (iso or flat).
function msTileToScreen(cv, tx, ty) {
  if (MS.view === 'iso' && (!MS.level || MS.gateArm) && MS.isoR) { const [px, py] = MS.isoR.screenOf(0, tx + 0.5, ty + 0.5); return [px * MS.isoZoom, py * MS.isoZoom]; }
  const z = MS.vp.z, sx = MS.vp.x - cv.width / 2 / z, sy = MS.vp.y - cv.height / 2 / z;
  return [(tx + 0.5 - sx) * z, (ty + 0.5 - sy) * z];
}
// Hover (cyan) + selection (gold) outlines drawn over any view.
function msDrawSelection(g, cv) {
  const iso = MS.view === 'iso' && (!MS.level || MS.gateArm);
  const ring = (a, color, lw) => {
    if (!a) return;
    const [cx, cy] = msTileToScreen(cv, a.x, a.y);
    g.strokeStyle = color; g.lineWidth = lw;
    if (a.kind === 'spawn') { g.beginPath(); g.arc(cx, cy, Math.max(8, a.zone.r * (iso ? 20 : MS.vp.z)), 0, 7); g.stroke(); return; }
    if (iso) { g.beginPath(); g.moveTo(cx, cy - 18); g.lineTo(cx + 34, cy); g.lineTo(cx, cy + 18); g.lineTo(cx - 34, cy); g.closePath(); g.stroke(); }
    else { const z = MS.vp.z; g.strokeRect(cx - z / 2, cy - z / 2, z, z); }
  };
  ring(MS.hover, '#7cd6ff', 2);
  ring(MS.sel, '#ffd75e', 2.5);
}
function msAssetName(type) {
  if (type.startsWith('prop:')) { const [, pack, i] = type.split(':'); return `Prop · ${pack} #${i}`; }
  return NODES[type]?.name || MEDIA.trees?.[type]?.name || type.replace(/_/g, ' ');
}
function msSelCard(a) {
  if (a.kind === 'spawn') {
    const d = MOBS[a.zone.mob];
    return `<h3>${d?.name || a.zone.mob} pack</h3>
      <div style="font-size:11.5px">zone @ ${a.zone.x},${a.zone.y} · radius ${a.zone.r} · count ${a.zone.n}${a.zone.plane ? ` · plane ${a.zone.plane}` : ''}</div>
      ${d ? `<div style="font-size:11px;color:var(--dim)">level ${d.lvl} · ${d.style}${d.aggro ? ' · aggro' : ''}</div>` : ''}
      <div class="ms-row" style="margin-top:8px"><button class="act" id="ms-sel-del" style="flex:1">🗑 Delete zone</button></div>`;
  }
  return `<h3>${msAssetName(a.type)}</h3>
    <div style="font-size:11.5px">${a.type} @ ${a.x},${a.y}${a.level ? ` · in ${a.level}` : ''}</div>
    <div style="font-size:11px;color:var(--dim)">${NODES[a.type]?.skill ? `${NODES[a.type].skill} node` : a.type.startsWith('prop:') ? 'decorative prop' : 'world model'}</div>
    <div class="ms-row" style="margin-top:8px"><button class="act" id="ms-sel-del" style="flex:1">🗑 Delete</button></div>`;
}
function msBindSelCard(side, a) {
  const del = side.querySelector('#ms-sel-del');
  if (!del) return;
  del.onclick = () => {
    if (a.kind === 'spawn') {
      MS.pending.spawns[a.id] = null;           // stop it respawning; ring disappears
    } else if (a.kind === 'levelnode') {
      const lv = msLevels()[a.level] || {};
      const cur = MS.pending.levels[a.level] || { ...lv, tiles: { ...(lv.tiles || {}) }, nodes: { ...(lv.nodes || {}) } };
      cur.nodes = { ...(cur.nodes || {}) }; delete cur.nodes[msKey(a.x, a.y)];
      MS.pending.levels[a.level] = cur;
    } else {
      MS.pending.nodes[msKey(a.x, a.y)] = null; // overworld node → removed
      msPreviewPoke(a.x, a.y);                  // vanishes from the rendered view at once
    }
    MS.sel = null; MS.hover = null; msSide();
  };
}
function msPendingCount() { return Object.keys(MS.pending.tiles).length + Object.keys(MS.pending.elev).length + Object.keys(MS.pending.nodes).length + Object.keys(MS.pending.levels).length + Object.keys(MS.pending.spawns || {}).length; }
function msOnServerOverrides(ov) {
  if (MS.inited) return;                       // first load only: apply saved edits
  MS.inited = true;
  applyMapOverrides(ov);
  MS.base = null; MS.baseRows = 0;             // rebuild the base image with them
}
const msKey = (x, y) => x + ',' + y;
function msTileAt(x, y) { const v = MS.pending.tiles[msKey(x, y)]; return v !== undefined ? v : worldTile(x, y); }
function msElevAt(x, y) { const v = MS.pending.elev[msKey(x, y)]; return v !== undefined ? v : heightAt(x, y); }
function msNodeAt(x, y) { const k = msKey(x, y); return MS.pending.nodes[k] !== undefined ? MS.pending.nodes[k] : computeWorld().nodes.get(k); }
function msPixel(x, y) {
  // base-canvas pixel colour for one tile: terrain tinted by elevation
  const t = msTileAt(x, y), h = msElevAt(x, y);
  const c = TILE_RGB[t] || [255, 0, 255];
  const f = 0.82 + h * 0.045;
  return `rgb(${Math.min(255, c[0] * f) | 0},${Math.min(255, c[1] * f) | 0},${Math.min(255, c[2] * f) | 0})`;
}
function msPatchBase(x, y) { if (MS.base) { const g = MS.base.getContext('2d'); g.fillStyle = msPixel(x, y); g.fillRect(x, y, 1, 1); } }
function msThumb(type) {
  let c = MS.thumbs.get(type);
  if (!c) {
    c = document.createElement('canvas'); c.width = 26; c.height = 26;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    if (type.startsWith('prop:')) { // pack prop: one decor file or one grid cell
      const [, pack, is] = type.split(':');
      const sh = MEDIA.sheets?.[pack]; const idx = +is || 0;
      const spec = sh && (Array.isArray(sh)
        ? sh[idx] && { file: sh[idx].file, sx: 0, sy: 0, w: sh[idx].w, h: sh[idx].h }
        : (() => { const cw = sh.cellW || sh.cell || 32, ch = sh.cellH || sh.cell || 32, cols = sh.cols || Math.max(1, (sh.w / cw) | 0); return { file: sh.file, sx: (idx % cols) * cw, sy: ((idx / cols) | 0) * ch, w: cw, h: ch }; })());
      if (spec) {
        const im = new Image();
        im.src = spec.file.startsWith('assets') ? spec.file : 'assets/' + spec.file;
        im.onload = () => { const g2 = c.getContext('2d'); g2.imageSmoothingEnabled = false; g2.drawImage(im, spec.sx, spec.sy, spec.w, spec.h, 0, 0, 26, 26); };
      }
    } else if (MEDIA.trees?.[type]) { // registry prop image from media
      const tm = MEDIA.trees[type]; const im = new Image();
      im.src = tm.file.startsWith('assets') ? tm.file : 'assets/' + tm.file;
      im.onload = () => { const g2 = c.getContext('2d'); g2.imageSmoothingEnabled = false; g2.drawImage(im, 0, 0, 26, 26); };
    } else {
      const src = nodeSprite(type);
      if (src) g.drawImage(src, 0, 0, src.width, src.height, 0, 0, 26, 26);
    }
    MS.thumbs.set(type, c);
  }
  return c;
}
function renderMapStudio() {
  const lv = MS.level && msLevels()[MS.level];
  main.innerHTML = `<h2 style="margin-bottom:8px">Map Studio ${lv ? `— level <span style="color:var(--tx)">${MS.level}</span>` : '— overworld'}
    <span style="color:var(--dim);font-size:11px;margin-left:10px">WASD pan · wheel/± zoom · drag to use tool</span></h2>
  <div id="ms">
    <div id="ms-tools">
      ${[['pan', '✋', 'Pan / inspect'], ['select', '🎯', 'Select — hover to highlight any asset, click for options'], ['terrain', '🖌', 'Paint terrain'], ['elev', '⛰', 'Raise/lower ground'], ['node', '🌳', 'Place model'], ['erase', '⌫', 'Erase model'], ['mob', '👹', 'Mob mode'], ['view', '🎬', 'Rendered view — edit while seeing the world as the game draws it']].map(([t, ic, tip]) => `<button data-tool="${t}" title="${tip}" class="${(t === 'mob' ? MS.mobMode : t === 'view' ? MS.view === 'iso' : MS.tool === t && !MS.mobMode) ? 'on' : ''}">${ic}</button>`).join('')}
      <div style="flex:1"></div>
      <button id="ms-zin" title="zoom in">＋</button><button id="ms-zout" title="zoom out">－</button>
    </div>
    <div id="ms-mid">
      <canvas id="ms-canvas"></canvas>
      <div id="ms-status">building world…</div>
    </div>
    <div id="ms-side"></div>
  </div>`;
  for (const b of main.querySelectorAll('[data-tool]')) b.onclick = () => {
    if (b.dataset.tool === 'mob') { MS.mobMode = !MS.mobMode; if (MS.mobMode) send({ t: 'spawnzones' }); }
    else if (b.dataset.tool === 'view') { MS.view = MS.view === 'iso' ? '2d' : 'iso'; flushChunkCache(); }
    else { MS.tool = b.dataset.tool; MS.mobMode = false; MS.hover = null; if (b.dataset.tool !== 'select') MS.sel = null; }
    renderMapStudio();
  };
  $('#ms-zin').onclick = () => msZoom(1.5); $('#ms-zout').onclick = () => msZoom(1 / 1.5);
  msSide();
  const cv = $('#ms-canvas');
  msBindInput(cv);
  ensureAssets().then(() => { if (!state.mapedit) send({ t: 'mapedit' }); msLoop(cv); });
}
function msLevels() { return { ...(state.mapedit?.levels || MAP_OVERRIDES.levels), ...MS.pending.levels }; }
function msSide() {
  const side = $('#ms-side');
  if (!side) return;
  const levels = msLevels();
  if (MS.tool === 'select') {
    const a = MS.sel;
    side.innerHTML = `<h3>Selector</h3>
      <div style="font-size:11.5px;color:var(--dim)">Hover any asset to highlight it; click to select. Targets every node, prop, tree, station and spawn zone in the world${MS.level ? ' — and this level' : ''}.</div>
      ${a ? msSelCard(a) : '<div style="margin-top:12px;color:var(--dim)"><i>nothing selected — click an asset on the map</i></div>'}`;
    if (a) msBindSelCard(side, a);
    return;
  }
  if (MS.mobMode) {
    const z = MS.zoneSel;
    const def = z && MOBS[z.mob];
    const custom = { ...(state.spawns?.custom || {}), ...MS.pending.spawns };
    const lv = MS.level && msLevels()[MS.level];
    const canPlaceHere = !MS.level || lv?.slot !== undefined;
    side.innerHTML = `<h3>Mob mode</h3>
      <div style="font-size:11.5px;color:var(--dim)">Click a zone for details. Arm the placer below, then click the map to set a pack down${MS.level ? ' inside this level' : ''}.</div>
      <div class="ms-row"><button class="act" id="ms-save" style="flex:1">💾 Save ${msPendingCount() ? `(${msPendingCount()} edits)` : ''}</button></div>
      <h3>Place a spawn zone</h3>
      <div class="ms-row"><select id="ms-spawn-mob">${Object.keys(MOBS).sort().map(m => `<option ${MS.spawnMob === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
      <div class="ms-row">count <input id="ms-spawn-n" type="number" min="1" max="12" value="${MS.spawnN || 3}" style="width:56px">
        radius <input id="ms-spawn-r" type="number" min="1" max="40" value="${MS.spawnR || 8}" style="width:56px">
        <button class="act ${MS.spawnArm ? 'on' : ''}" id="ms-spawn-arm" ${canPlaceHere ? '' : 'disabled title="save the level first"'}>${MS.spawnArm ? '● placing' : 'place'}</button></div>
      ${z ? `<h3>${def?.name || z.mob}</h3><div id="ms-inspect">
        zone: ${z.x},${z.y} r${z.r} × ${z.n}${z.plane ? ` · plane ${z.plane}` : ''}<br>
        level ${def?.lvl} — ${def?.life} hp, atk ${def?.atk}, def ${def?.def}<br>
        style ${def?.style}${def?.aggro ? ' · aggro' : ''}${def?.howl ? ' · howls' : ''}${def?.alpha ? ' · ALPHA' : ''}<br>
        live in world: ${state.spawns?.live?.[z.mob] ?? '…'}<br>
        drops: ${(def?.drops || []).slice(0, 6).map(d => d[0]).join(', ')}</div>` : ''}
      <h3>Studio zones ${Object.keys(custom).length ? `(${Object.keys(custom).length})` : ''}</h3>
      <div style="font-size:11px;max-height:170px;overflow:auto">${Object.entries(custom).map(([id, s]) => s ? `<div style="display:flex;justify-content:space-between;padding:1px 0"><span style="cursor:pointer" data-cz="${id}">${s.mob} ×${s.n} @ ${s.x},${s.y}${s.plane ? ' · L' + s.plane : ''}${MS.pending.spawns[id] ? ' ✎' : ''}</span><button class="act" data-czrm="${id}" style="padding:0 6px">✕</button></div>` : '').join('') || '<i style="color:var(--dim)">none yet — place one above</i>'}</div>
      <h3>World zones</h3>
      <div style="font-size:11px;max-height:230px;overflow:auto">${(state.spawns?.spawns || []).map((s, i) => `<div style="cursor:pointer;padding:1px 0" data-z="${i}">${s.mob} ×${s.n} @ ${s.x},${s.y}</div>`).join('')}</div>`;
    for (const d of side.querySelectorAll('[data-z]')) d.onclick = () => { const s = state.spawns.spawns[+d.dataset.z]; MS.zoneSel = s; MS.vp.x = s.x; MS.vp.y = s.y; msSide(); };
    for (const d of side.querySelectorAll('[data-cz]')) d.onclick = () => {
      const s = custom[d.dataset.cz]; MS.zoneSel = s;
      // jump the viewport when the zone lives on the plane we're looking at
      const lvv = MS.level && msLevels()[MS.level];
      const cp = lvv?.slot !== undefined ? -10 - lvv.slot : 0;
      if ((s.plane | 0) === cp) { MS.vp.x = s.x; MS.vp.y = s.y; }
      msSide();
    };
    for (const b of side.querySelectorAll('[data-czrm]')) b.onclick = () => { MS.pending.spawns[b.dataset.czrm] = null; msSide(); };
    const mobSel = $('#ms-spawn-mob');
    mobSel.onchange = () => MS.spawnMob = mobSel.value;
    $('#ms-spawn-n').oninput = (e) => MS.spawnN = +e.target.value || 3;
    $('#ms-spawn-r').oninput = (e) => MS.spawnR = +e.target.value || 8;
    $('#ms-spawn-arm').onclick = () => { MS.spawnArm = !MS.spawnArm; MS.spawnMob = mobSel.value; msSide(); };
    $('#ms-save').onclick = msSave;
    return;
  }
  const cat = MS_CATALOG();
  side.innerHTML = `
    <h3>Save</h3>
    <div class="ms-row"><button class="act" id="ms-save" style="flex:1">💾 Save ${msPendingCount() ? `(${msPendingCount()} edits)` : ''}</button>
    <button class="act" id="ms-discard" title="discard pending">↩</button></div>
    <h3>Levels</h3>
    <div class="ms-row"><select id="ms-level"><option value="">overworld</option>${Object.keys(levels).map(id => `<option ${MS.level === id ? 'selected' : ''}>${id}</option>`).join('')}</select>
    <button class="act" id="ms-newlevel" title="new dungeon/cave level">＋</button></div>
    ${MS.level ? `<div class="ms-row"><button class="act ${MS.gateArm ? 'on' : ''}" id="ms-gate" style="flex:1">${MS.gateArm ? '● click the overworld to set the gate' : '⛩ place world entrance'}</button></div>
    <div style="font-size:10.5px;color:var(--dim)">${levels[MS.level]?.gate ? `gate at ${levels[MS.level].gate.x},${levels[MS.level].gate.y} — players click it to enter, and leave via the glowing pad inside` : 'no gate yet — place one so players can walk in'}</div>` : ''}
    <div style="font-size:10.5px;color:var(--dim)">Admin shortcut: terminal <b>level &lt;player&gt; &lt;id&gt;</b></div>
    <h3>Terrain brush</h3>
    <div class="ms-cat">${TILE_META.map(([t, n, c]) => `<div class="ms-cell ${MS.terrain === t ? 'on' : ''}" data-terr="${t}" title="${n}"><div class="ms-swatch" style="background:${c}"></div><div>${n}</div></div>`).join('')}</div>
    <div class="ms-row">brush <input id="ms-brush" type="range" min="1" max="6" value="${MS.brush}" style="flex:1"> ${MS.brush}×${MS.brush}</div>
    <h3>Elevation</h3>
    <div class="ms-row"><button class="act ${MS.elevDelta === 1 ? 'on' : ''}" data-ed="1" style="flex:1">raise +1</button>
    <button class="act ${MS.elevDelta === -1 ? 'on' : ''}" data-ed="-1" style="flex:1">lower −1</button>
    <button class="act ${MS.elevDelta === 0 ? 'on' : ''}" data-ed="0" style="flex:1">flatten 0</button></div>
    ${Object.entries(cat).map(([name, list]) => `<h3>${name}</h3><div class="ms-cat">${list.map(k => `<div class="ms-cell ${MS.node === k ? 'on' : ''}" draggable="true" data-node="${k}" title="${NODES[k]?.name || k}"></div>`).join('')}</div>`).join('')}`;
  $('#ms-save').onclick = msSave;
  $('#ms-discard').onclick = () => { msRevertPreview(); MS.pending = { tiles: {}, elev: {}, nodes: {}, levels: {}, spawns: {} }; MS.base = null; MS.baseRows = 0; renderMapStudio(); };
  $('#ms-level').onchange = (e) => {
    MS.level = e.target.value || null; MS.gateArm = false;
    // snap the viewport onto the picked level so it never opens off-screen
    const lv = MS.level && msLevels()[MS.level];
    if (lv?.size) { MS.vp.x = lv.size / 2; MS.vp.y = lv.size / 2; MS.vp.z = Math.max(4, Math.min(14, 560 / lv.size)); }
    renderMapStudio();
  };
  const gateBtn = $('#ms-gate');
  if (gateBtn) gateBtn.onclick = () => { MS.gateArm = !MS.gateArm; msSide(); };
  $('#ms-newlevel').onclick = () => {
    const id = prompt('Level id (letters/numbers/_):', 'cave_1'); if (!id) return;
    const size = Math.min(160, Math.max(16, parseInt(prompt('Size (tiles, 16–160):', '64')) || 64));
    const fill = confirm('OK = cave floor, Cancel = stone floor') ? TILE.CAVE : TILE.FLOOR_STONE;
    MS.pending.levels[id.replace(/\W/g, '_')] = { name: id, size, fill, tiles: {} };
    MS.level = id.replace(/\W/g, '_');
    renderMapStudio();
  };
  for (const d of side.querySelectorAll('[data-terr]')) d.onclick = () => { MS.terrain = +d.dataset.terr; MS.tool = 'terrain'; renderMapStudio(); };
  for (const b of side.querySelectorAll('[data-ed]')) b.onclick = () => { MS.elevDelta = +b.dataset.ed; MS.tool = 'elev'; renderMapStudio(); };
  const brush = $('#ms-brush'); if (brush) brush.oninput = () => { MS.brush = +brush.value; };
  ensureAssets().then(() => {
    for (const d of side.querySelectorAll('[data-node]')) {
      d.appendChild(msThumb(d.dataset.node));
      const lbl = document.createElement('div'); lbl.textContent = NODES[d.dataset.node]?.name || d.dataset.node; d.appendChild(lbl);
      d.onclick = () => { MS.node = d.dataset.node; MS.tool = 'node'; renderMapStudio(); };
      d.ondragstart = (ev) => { ev.dataTransfer.setData('text/node', d.dataset.node); };
    }
  });
}
function msSave() {
  if (!msPendingCount()) return;
  send({ t: 'mapedit', set: MS.pending });
  applyMapOverrides(MS.pending);               // local hot-apply (recomputes world)
  flushChunkCache();                           // the rendered view rebakes next frame
  MS.pending = { tiles: {}, elev: {}, nodes: {}, levels: {}, spawns: {} };
  MS.previewBackup = { tiles: {}, elev: {}, nodes: {} };  // edits are permanent now — no revert
  setTimeout(() => send({ t: 'spawnzones' }), 300);   // refresh zone list + census
  msSide();
}
function msZoom(f) {
  if (MS.view === 'iso' && (!MS.level || MS.gateArm)) MS.isoZoom = Math.max(0.4, Math.min(3, MS.isoZoom * f));
  else MS.vp.z = Math.max(1, Math.min(40, MS.vp.z * f));
}
function msScreenToTile(cv, mx, my) {
  if (MS.view === 'iso' && (!MS.level || MS.gateArm) && MS.isoR) {
    // invert the game's iso projection about the studio camera (elevation
    // lift is ignored — clicks on tall ground land a whisker south). the render
    // is drawn zoomed, so undo the zoom about the canvas centre first.
    const z = MS.isoZoom;
    const camWx = (MS.isoR.cam.x - MS.isoR.cam.y) * 32, camWy = (MS.isoR.cam.x + MS.isoR.cam.y) * 16;
    const wx = (mx - cv.width / 2) / z + camWx, wy = (my - cv.height / 2) / z + camWy;
    return [Math.floor(wx / 64 + wy / 32), Math.floor(wy / 32 - wx / 64)];
  }
  const z = MS.vp.z;
  return [Math.floor(MS.vp.x + (mx - cv.width / 2) / z), Math.floor(MS.vp.y + (my - cv.height / 2) / z)];
}
function msApplyTool(cv, mx, my) {
  const [tx, ty] = msScreenToTile(cv, mx, my);
  const lv = MS.level && msLevels()[MS.level];
  const B = MS.tool === 'terrain' || MS.tool === 'elev' ? MS.brush : 1;
  for (let dy = 0; dy < B; dy++) for (let dx = 0; dx < B; dx++) {
    const x = tx + dx - (B >> 1), y = ty + dy - (B >> 1);
    if (lv) {   // painting inside a custom level: terrain, nodes and erasing
      if (x < 1 || y < 1 || x >= lv.size - 1 || y >= lv.size - 1) continue;
      const cur = MS.pending.levels[MS.level] || (MS.pending.levels[MS.level] = { ...lv, tiles: { ...lv.tiles }, nodes: { ...(lv.nodes || {}) } });
      cur.nodes = cur.nodes || { ...(lv.nodes || {}) };
      if (MS.tool === 'terrain') cur.tiles[msKey(x, y)] = MS.terrain;
      else if (MS.tool === 'node' && !MS.drag?.painted?.has(msKey(x, y))) { cur.nodes[msKey(x, y)] = MS.node; MS.drag?.painted?.add(msKey(x, y)); }
      else if (MS.tool === 'erase') delete cur.nodes[msKey(x, y)];
      continue;
    }
    if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) continue;
    const k = msKey(x, y);
    if (MS.tool === 'terrain') { MS.pending.tiles[k] = MS.terrain; msPatchBase(x, y); msPreviewPoke(x, y); }
    else if (MS.tool === 'elev') {
      MS.pending.elev[k] = MS.elevDelta === 0 ? 0 : Math.max(0, Math.min(8, msElevAt(x, y) + MS.elevDelta));
      msPatchBase(x, y); msPreviewPoke(x, y);
    }
    else if (MS.tool === 'node' && !MS.drag?.painted?.has(k)) { MS.pending.nodes[k] = MS.node; (MS.drag?.painted || new Set()).add?.(k); msPreviewPoke(x, y); }
    else if (MS.tool === 'erase') { MS.pending.nodes[k] = null; msPreviewPoke(x, y); }
  }
}
function msBindInput(cv) {
  cv.onwheel = (e) => { e.preventDefault(); msZoom(e.deltaY < 0 ? 1.25 : 0.8); };
  cv.onmousedown = (e) => {
    const r = cv.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    if (MS.mobMode) {   // armed: place a pack; otherwise select the nearest zone
      const [tx, ty] = msScreenToTile(cv, mx, my);
      if (MS.spawnArm && MS.spawnMob) {
        const lv = MS.level && msLevels()[MS.level];
        const plane = lv?.slot !== undefined ? -10 - lv.slot : 0;
        MS.pending.spawns['z_' + Date.now().toString(36)] = { mob: MS.spawnMob, x: tx, y: ty, r: MS.spawnR || 8, n: MS.spawnN || 3, plane };
        msSide(); return;
      }
      let best = null, bd = 1e9;
      // selection matches whichever plane the studio is looking at
      const lvSel = MS.level && msLevels()[MS.level];
      const curPlane = lvSel?.slot !== undefined ? -10 - lvSel.slot : 0;
      const cands = [...(curPlane === 0 ? state.spawns?.spawns || [] : []), ...Object.values({ ...(state.spawns?.custom || {}), ...MS.pending.spawns }).filter(z => z && (z.plane | 0) === curPlane)];
      for (const z of cands) { const d = Math.hypot(z.x - tx, z.y - ty); if (d < Math.max(6, z.r + 3) && d < bd) { bd = d; best = z; } }
      MS.zoneSel = best; msSide(); return;
    }
    // armed gate placement: the click drops the selected level's world entrance
    // (the studio shows the OVERWORLD while a gate is armed, whatever level is picked)
    if (MS.gateArm && MS.level) {
      const [tx, ty] = msScreenToTile(cv, mx, my);
      const lv = msLevels()[MS.level] || {};
      MS.pending.levels[MS.level] = { ...lv, tiles: { ...(lv.tiles || {}) }, gate: { x: tx, y: ty } };
      MS.gateArm = false;
      msSide(); return;
    }
    if (MS.tool === 'select') {   // pick the asset under the cursor, show its options
      const [tx, ty] = msScreenToTile(cv, mx, my);
      MS.sel = msAssetAt(tx, ty); msSide(); return;
    }
    MS.drag = { mx, my, vx: MS.vp.x, vy: MS.vp.y, painted: new Set() };
    if (MS.tool !== 'pan') msApplyTool(cv, mx, my);
  };
  cv.onmousemove = (e) => {
    const r = cv.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    MS.mouse = [mx, my];
    if (MS.tool === 'select' && !MS.drag) { const [tx, ty] = msScreenToTile(cv, mx, my); MS.hover = msAssetAt(tx, ty); }
    if (!MS.drag) return;
    if (MS.tool === 'pan' || MS.mobMode) {
      const dmx = mx - MS.drag.mx, dmy = my - MS.drag.my;
      if (MS.view === 'iso' && (!MS.level || MS.gateArm)) { const zx = dmx / MS.isoZoom, zy = dmy / MS.isoZoom; MS.vp.x = MS.drag.vx - (zx / 64 + zy / 32); MS.vp.y = MS.drag.vy - (zy / 32 - zx / 64); }
      else { MS.vp.x = MS.drag.vx - dmx / MS.vp.z; MS.vp.y = MS.drag.vy - dmy / MS.vp.z; }
    }
    else msApplyTool(cv, mx, my);
  };
  window.onmouseup = () => { if (MS.drag && MS.tool !== 'pan' && !MS.mobMode) msSide(); MS.drag = null; };
  cv.ondragover = (e) => e.preventDefault();
  cv.ondrop = (e) => {   // drag & drop a model from the catalog into the world
    e.preventDefault();
    const type = e.dataTransfer.getData('text/node');
    if (!type) return;
    const r = cv.getBoundingClientRect();
    const [tx, ty] = msScreenToTile(cv, e.clientX - r.left, e.clientY - r.top);
    MS.pending.nodes[msKey(tx, ty)] = type;
    if (!MS.level) msPreviewPoke(tx, ty);
    msSide();
  };
  window.onkeydown = (e) => {
    if (view !== 'map' || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
    const step = 14 / MS.vp.z * 4;
    if (e.key === 'w' || e.key === 'W') MS.vp.y -= step;
    else if (e.key === 's' || e.key === 'S') MS.vp.y += step;
    else if (e.key === 'a' || e.key === 'A') MS.vp.x -= step;
    else if (e.key === 'd' || e.key === 'D') MS.vp.x += step;
    else if (e.key === '+' || e.key === '=') msZoom(1.25);
    else if (e.key === '-') msZoom(0.8);
  };
}
function msLoop(cv) {
  if (view !== 'map' || !document.body.contains(cv)) return;
  const box = cv.parentElement.getBoundingClientRect();
  if (cv.width !== (box.width | 0)) { cv.width = box.width | 0; }
  if (cv.height !== ((box.height - 24) | 0)) { cv.height = Math.max(200, (box.height - 24) | 0); }
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#04070c'; g.fillRect(0, 0, cv.width, cv.height);
  // an armed gate placer always shows the OVERWORLD, whatever level is picked
  const lv = MS.level && !MS.gateArm && msLevels()[MS.level];
  if (lv) msDrawLevel(g, cv, lv);
  else if (MS.view === 'iso') msDrawIso(cv);
  else msDrawWorld(g, cv);
  if (MS.tool === 'select') msDrawSelection(g, cv);
  raf = requestAnimationFrame(() => msLoop(cv));
}
// Rendered editing view: the world drawn by the ACTUAL game renderer (chunk
// bake, live water, falls, nodes, elevation), with every studio tool live on
// top. Pending edits glow as diamonds; Save rebakes so the render catches up.
function msDrawIso(cv) {
  // Zoom: render the world at native scale into an offscreen buffer sized
  // canvas/zoom, then blit it scaled to fit — zooming in shows less world bigger,
  // out shows more world smaller. Overlays draw in buffer space under a matching
  // scale transform, so the existing overlay code needs no changes.
  const z = MS.isoZoom;
  if (!MS.isoBuf) MS.isoBuf = document.createElement('canvas');
  const buf = MS.isoBuf;
  const bw = Math.max(64, Math.round(cv.width / z)), bh = Math.max(64, Math.round(cv.height / z));
  if (buf.width !== bw || buf.height !== bh) { buf.width = bw; buf.height = bh; MS.isoR = null; }
  if (!MS.isoR || MS.isoR.canvas !== buf) {
    MS.isoR = new Renderer(buf);
    MS.isoR.resize = () => {};        // the studio sizes its own canvas
    MS.isoR._elevOn = true;
    MS.isoFx = MS.isoFx || new Fx();
  }
  const R = MS.isoR;
  R.draw({
    entities: MS.isoEnts, fx: MS.isoFx, now: performance.now(), depletedNodes: MS.isoDep,
    me: { id: -1, rx: MS.vp.x, ry: MS.vp.y, x: MS.vp.x, y: MS.vp.y, plane: 0, hp: 1 },
  });
  const ctx = cv.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#0b0f0a'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(buf, 0, 0, bw, bh, 0, 0, cv.width, cv.height);
  ctx.save();
  ctx.setTransform(z, 0, 0, z, 0, 0);   // overlays are in buffer space; the zoom maps them onto the render
  const mark = (k, col) => {
    const [tx, ty] = k.split(',').map(Number);
    const [px, py] = R.screenOf(0, tx + 0.5, ty + 0.5);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(px, py - 15); ctx.lineTo(px + 31, py); ctx.lineTo(px, py + 15); ctx.lineTo(px - 31, py); ctx.closePath(); ctx.fill();
  };
  for (const k of Object.keys(MS.pending.tiles)) mark(k, 'rgba(227,179,65,0.28)');
  for (const k of Object.keys(MS.pending.elev)) mark(k, 'rgba(88,166,255,0.28)');
  for (const [k, v] of Object.entries(MS.pending.nodes)) mark(k, v === null ? 'rgba(248,81,73,0.34)' : 'rgba(63,185,80,0.34)');
  if (MS.mobMode && state.spawns) {
    const all = [...(state.spawns.spawns || []).map(z => [null, z]), ...Object.entries({ ...(state.spawns.custom || {}), ...MS.pending.spawns })];
    for (const [id, zn] of all) {
      if (!zn || zn.plane) continue;
      const [px, py] = R.screenOf(0, zn.x, zn.y);
      if (px < -100 || py < -100 || px > cv.width + 100 || py > cv.height + 100) continue;
      const mine = id !== null;
      if (mine && MS.pending.spawns[id]) ctx.setLineDash([6, 4]);
      ctx.strokeStyle = mine ? '#e3b341cc' : '#f85149aa';
      ctx.beginPath(); ctx.ellipse(px, py, zn.r * 32, zn.r * 16, 0, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = mine ? '#ffe27a' : '#ffb8b2'; ctx.font = '11px monospace'; ctx.textAlign = 'center'; ctx.fillText(`${zn.mob}×${zn.n}`, px, py - zn.r * 16 - 4);
    }
  }
  if (MS.mouse) {
    const [tx, ty] = msScreenToTile(cv, MS.mouse[0], MS.mouse[1]);
    const [px, py] = R.screenOf(0, tx + 0.5, ty + 0.5);
    ctx.strokeStyle = '#e3b341'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(px, py - 16); ctx.lineTo(px + 32, py); ctx.lineTo(px, py + 16); ctx.lineTo(px - 32, py); ctx.closePath(); ctx.stroke();
    const st = $('#ms-status');
    if (st) {
      const n = msNodeAt(tx, ty);
      st.textContent = `RENDERED VIEW — ${tx},${ty} · ${TILE_NAME[msTileAt(tx, ty)] || '?'} h${msElevAt(tx, ty)} · ${regionAt(tx, ty)}${n ? ' · ' + n : ''}` +
        `  |  tool: ${MS.mobMode ? 'mob mode' : MS.tool}${MS.tool === 'node' ? ' (' + MS.node + ')' : ''}  |  zoom ${MS.isoZoom.toFixed(2)}×  |  pending edits glow — Save to bake them into the render${msPendingCount() ? `  |  ✎ ${msPendingCount()} unsaved` : ''}`;
    }
  }
  ctx.restore();   // end the zoom transform used for the overlays
}
function msDrawWorld(g, cv) {
  // lazily build the 1px/tile base image, a band of rows per frame
  if (!MS.base) { MS.base = document.createElement('canvas'); MS.base.width = WORLD_W; MS.base.height = WORLD_H; MS.baseRows = 0; computeWorld(); }
  if (MS.baseRows < WORLD_H) {
    const bg = MS.base.getContext('2d');
    const until = Math.min(WORLD_H, MS.baseRows + 48);
    for (let y = MS.baseRows; y < until; y++) for (let x = 0; x < WORLD_W; x++) { bg.fillStyle = msPixel(x, y); bg.fillRect(x, y, 1, 1); }
    MS.baseRows = until;
  }
  const z = MS.vp.z;
  const sx = MS.vp.x - cv.width / 2 / z, sy = MS.vp.y - cv.height / 2 / z;
  g.drawImage(MS.base, sx, sy, cv.width / z, cv.height / z, 0, 0, cv.width, cv.height);
  const toScr = (tx, ty) => [(tx - sx) * z, (ty - sy) * z];
  // nodes render as sprites once you're close enough to work with them
  if (z >= 10) {
    const { nodes } = computeWorld();
    const x0 = Math.floor(sx), x1 = Math.ceil(sx + cv.width / z), y0 = Math.floor(sy), y1 = Math.ceil(sy + cv.height / z);
    g.strokeStyle = 'rgba(255,255,255,0.05)';
    for (let x = x0; x <= x1; x++) { const [px] = toScr(x, 0); g.beginPath(); g.moveTo(px, 0); g.lineTo(px, cv.height); g.stroke(); }
    for (let y = y0; y <= y1; y++) { const [, py] = toScr(0, y); g.beginPath(); g.moveTo(0, py); g.lineTo(cv.width, py); g.stroke(); }
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const n = msNodeAt(x, y);
      if (!n) continue;
      const [px, py] = toScr(x, y);
      const th = msThumb(n);
      g.drawImage(th, px + z / 2 - z * 0.45, py + z / 2 - z * 0.7, z * 0.9, z * 0.9);
    }
  } else {
    // far out: pending node edits ping as gold dots so nothing gets lost
    for (const [k, v] of Object.entries(MS.pending.nodes)) {
      const [x, y] = k.split(',').map(Number); const [px, py] = toScr(x, y);
      g.fillStyle = v === null ? '#f8514988' : '#e3b341';
      g.fillRect(px - 1, py - 1, 3, 3);
    }
  }
  // town labels keep you oriented
  g.font = '11px monospace'; g.textAlign = 'center';
  for (const key in TOWNS) {
    const t = TOWNS[key]; const [px, py] = toScr(t.cx, t.cy);
    if (px < 0 || py < 0 || px > cv.width || py > cv.height) continue;
    g.fillStyle = '#00000090'; g.fillRect(px - 34, py - 8, 68, 13);
    g.fillStyle = '#e3b341'; g.fillText(t.name || key, px, py + 2);
  }
  if (MS.mobMode && state.spawns) msDrawZones(g, toScr);
  // cursor tile + status readout
  if (MS.mouse) {
    const [tx, ty] = msScreenToTile(cv, MS.mouse[0], MS.mouse[1]);
    const [px, py] = toScr(tx, ty);
    g.strokeStyle = '#e3b341'; g.strokeRect(px, py, z, z);
    const st = $('#ms-status');
    if (st) {
      const n = msNodeAt(tx, ty);
      st.textContent = `${tx},${ty} — ${TILE_NAME[msTileAt(tx, ty)] || '?'} h${msElevAt(tx, ty)} · ${regionAt(tx, ty)}${n ? ' · ' + n : ''}` +
        `  |  tool: ${MS.mobMode ? 'mob mode' : MS.tool}${MS.tool === 'node' ? ' (' + MS.node + ')' : ''}  |  zoom ${z.toFixed(1)}px/tile${msPendingCount() ? `  |  ✎ ${msPendingCount()} unsaved` : ''}`;
    }
  }
}
function msDrawZones(g, toScr) {
  for (const zn of state.spawns.spawns || []) {
    const [px, py] = toScr(zn.x, zn.y);
    const r = Math.max(4, zn.r * MS.vp.z);
    g.beginPath(); g.arc(px, py, r, 0, 7);
    g.fillStyle = zn === MS.zoneSel ? 'rgba(227,179,65,0.25)' : 'rgba(248,81,73,0.12)';
    g.fill();
    g.strokeStyle = zn === MS.zoneSel ? '#e3b341' : '#f8514966'; g.stroke();
    if (MS.vp.z >= 3) { g.fillStyle = '#ffb8b2'; g.font = '10px monospace'; g.textAlign = 'center'; g.fillText(`${zn.mob}×${zn.n}`, px, py - r - 3); }
  }
  for (const b of state.spawns.bosses || []) {
    const [px, py] = toScr(b.x, b.y);
    g.fillStyle = '#e3b341'; g.font = `${Math.max(10, MS.vp.z * 1.4)}px monospace`; g.textAlign = 'center';
    g.fillText('★', px, py + 4);
    if (MS.vp.z >= 3) { g.font = '10px monospace'; g.fillText(b.mob, px, py + 16); }
  }
  // studio-authored zones ring gold (pending ones dashed until saved)
  for (const [id, zn] of Object.entries({ ...(state.spawns.custom || {}), ...MS.pending.spawns })) {
    if (!zn || zn.plane) continue;
    const [px, py] = toScr(zn.x, zn.y);
    const r = Math.max(4, zn.r * MS.vp.z);
    g.setLineDash(MS.pending.spawns[id] ? [5, 4] : []);
    g.strokeStyle = '#e3b341'; g.beginPath(); g.arc(px, py, r, 0, 7); g.stroke();
    g.setLineDash([]);
    g.fillStyle = 'rgba(227,179,65,0.10)'; g.fill();
    if (MS.vp.z >= 3) { g.fillStyle = '#ffe27a'; g.font = '10px monospace'; g.textAlign = 'center'; g.fillText(`${zn.mob}×${zn.n}`, px, py - r - 3); }
  }
}
function msDrawLevel(g, cv, lv) {
  const z = MS.vp.z;
  const sx = MS.vp.x - cv.width / 2 / z, sy = MS.vp.y - cv.height / 2 / z;
  const cur = MS.pending.levels[MS.level] || lv;
  for (let y = 0; y < lv.size; y++) for (let x = 0; x < lv.size; x++) {
    const border = x === 0 || y === 0 || x === lv.size - 1 || y === lv.size - 1;
    const t = border ? TILE.WALL : (cur.tiles?.[msKey(x, y)] ?? lv.fill ?? TILE.CAVE);
    const c = TILE_RGB[t] || [200, 0, 200];
    g.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
    g.fillRect((x - sx) * z, (y - sy) * z, z + 1, z + 1);
  }
  // studio-placed nodes ride on top so caves read as furnished
  for (const [k, t] of Object.entries(cur.nodes || {})) {
    const [nx, ny] = k.split(',').map(Number);
    if (z >= 8) g.drawImage(msThumb(t), (nx - sx) * z + z * 0.05, (ny - sy) * z - z * 0.3, z * 0.9, z * 0.9);
    else { g.fillStyle = '#3fb950'; g.fillRect((nx - sx) * z, (ny - sy) * z, Math.max(2, z * 0.5), Math.max(2, z * 0.5)); }
  }
  // the exit pad marks itself so you never wall it in
  { const en = { x: lv.size >> 1, y: lv.size - 3 };
    g.strokeStyle = '#7cd6ff'; g.lineWidth = 2;
    g.strokeRect((en.x - sx) * z, (en.y - sy) * z, z, z); }
  // mob mode: spawn zones living on THIS level ring gold (pending dashed)
  if (MS.mobMode && state.spawns && lv.slot !== undefined) {
    const plane = -10 - lv.slot;
    for (const [id, zn] of Object.entries({ ...(state.spawns.custom || {}), ...MS.pending.spawns })) {
      if (!zn || (zn.plane | 0) !== plane) continue;
      const px = (zn.x - sx) * z, py = (zn.y - sy) * z;
      const r = Math.max(4, zn.r * z);
      g.setLineDash(MS.pending.spawns[id] ? [5, 4] : []);
      g.strokeStyle = zn === MS.zoneSel ? '#ffe27a' : '#e3b341'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(px, py, r, 0, 7); g.stroke();
      g.setLineDash([]);
      g.fillStyle = 'rgba(227,179,65,0.10)'; g.fill();
      if (z >= 3) { g.fillStyle = '#ffe27a'; g.font = '10px monospace'; g.textAlign = 'center'; g.fillText(`${zn.mob}×${zn.n}`, px, py - r - 3); }
    }
  }
  if (MS.mouse) {
    const [tx, ty] = msScreenToTile(cv, MS.mouse[0], MS.mouse[1]);
    g.strokeStyle = '#e3b341'; g.strokeRect((tx - sx) * z, (ty - sy) * z, z, z);
    const st = $('#ms-status');
    if (st) st.textContent = `level ${MS.level} — ${tx},${ty} · ${lv.size}×${lv.size} · terrain + nodes${msPendingCount() ? `  |  ✎ ${msPendingCount()} unsaved` : ''}`;
  }
}

// ============================================================================
// COMPOSITOR — Creation menu: build new items by layering, transforming,
// mirroring and tinting existing game art. Saved items register into ITEMS on
// the server (usable via give/drops) and clients compose the icon on load.
// ============================================================================
const CC = { name: 'My relic', value: 100, layers: [], sel: -1, pick: false, q: '' };
function ccCompose(g, size = 128) {
  g.clearRect(0, 0, size, size);
  const s = size / 32;
  g.imageSmoothingEnabled = false;
  for (const l of CC.layers) {
    g.save();
    g.translate((16 + (l.x || 0)) * s, (16 + (l.y || 0)) * s);
    g.rotate((l.rot || 0) * Math.PI / 180);
    g.scale((l.mx ? -1 : 1) * (l.scale || 1), (l.my ? -1 : 1) * (l.scale || 1));
    g.globalAlpha = l.alpha ?? 1;
    g.drawImage(itemIcon(l.id), -16 * s, -16 * s, 32 * s, 32 * s);
    g.restore();
  }
}
function renderCompCreate() {
  const body = $('#comp-body');
  const items = state.customItems || {};
  body.innerHTML = `<div class="cc-wrap">
    <div class="cc-left">
      <canvas id="cc-preview" width="128" height="128"></canvas>
      <div class="ms-row">name <input id="cc-name" value="${CC.name}"></div>
      <div class="ms-row">value <input id="cc-value" type="number" value="${CC.value}" style="width:80px"></div>
      <div class="ms-row"><button class="act" id="cc-save" style="flex:1">💾 Save item</button></div>
      <h3 style="color:var(--gold);font-size:12px;margin-top:14px">Saved custom items</h3>
      <div style="font-size:11.5px;max-width:220px">${Object.entries(items).map(([id, d]) => `<div style="display:flex;justify-content:space-between;padding:2px 0"><span>${d.name}</span><button class="act" data-rm="${id}" style="padding:0 6px">✕</button></div>`).join('') || '<i style="color:var(--dim)">none yet</i>'}</div>
    </div>
    <div class="cc-layers">
      <div class="ms-row"><button class="act" id="cc-add">＋ add layer from game items</button></div>
      <div id="cc-picker" style="display:${CC.pick ? 'block' : 'none'}">
        <input id="cc-q" placeholder="filter items…" value="${CC.q}" style="width:100%;margin-bottom:6px">
        <div class="grid" id="cc-grid" style="max-height:220px;overflow:auto"></div>
      </div>
      <div id="cc-list"></div>
    </div>
  </div>`;
  const pv = $('#cc-preview').getContext('2d');
  const redraw = () => ccCompose(pv);
  redraw();
  $('#cc-name').oninput = (e) => CC.name = e.target.value;
  $('#cc-value').oninput = (e) => CC.value = +e.target.value || 1;
  $('#cc-add').onclick = () => { CC.pick = !CC.pick; renderCompCreate(); };
  $('#cc-save').onclick = () => {
    if (!CC.layers.length) return alert('add at least one layer');
    send({ t: 'customItems', create: { id: CC.name, name: CC.name, value: CC.value, layers: CC.layers } });
  };
  for (const b of body.querySelectorAll('[data-rm]')) b.onclick = () => send({ t: 'customItems', remove: b.dataset.rm });
  if (CC.pick) {
    const fill = () => {
      const grid = $('#cc-grid'); grid.innerHTML = '';
      for (const id of Object.keys(ITEMS)) {
        if (CC.q && !id.includes(CC.q)) continue;
        grid.appendChild(cellDiv(id, scaled(itemIcon(id), 34), () => { CC.layers.push({ id, x: 0, y: 0, scale: 1, rot: 0, mx: 0, my: 0, alpha: 1 }); CC.sel = CC.layers.length - 1; CC.pick = false; renderCompCreate(); }));
        if (grid.children.length > 120) break;
      }
    };
    $('#cc-q').oninput = (e) => { CC.q = e.target.value.toLowerCase(); fill(); };
    fill();
  }
  const list = $('#cc-list');
  list.innerHTML = CC.layers.map((l, i) => `<div class="cc-layer">
    <b>${i + 1}. ${l.id}</b>
    <button class="act" data-up="${i}" style="padding:0 6px">▲</button><button class="act" data-dn="${i}" style="padding:0 6px">▼</button>
    <button class="act" data-del="${i}" style="padding:0 6px;float:right">✕</button>
    <div class="ms-row">x <input data-f="x" data-i="${i}" type="range" min="-16" max="16" value="${l.x}"> y <input data-f="y" data-i="${i}" type="range" min="-16" max="16" value="${l.y}"></div>
    <div class="ms-row">scale <input data-f="scale" data-i="${i}" type="range" min="0.2" max="3" step="0.05" value="${l.scale}"> rot <input data-f="rot" data-i="${i}" type="range" min="-180" max="180" value="${l.rot}"></div>
    <div class="ms-row">alpha <input data-f="alpha" data-i="${i}" type="range" min="0.1" max="1" step="0.05" value="${l.alpha}">
      <label><input data-f="mx" data-i="${i}" type="checkbox" ${l.mx ? 'checked' : ''}> mirror↔</label>
      <label><input data-f="my" data-i="${i}" type="checkbox" ${l.my ? 'checked' : ''}> mirror↕</label></div>
  </div>`).join('') || '<i style="color:var(--dim)">no layers — add one to begin compositing</i>';
  for (const inp of list.querySelectorAll('input')) inp.oninput = () => {
    const l = CC.layers[+inp.dataset.i];
    l[inp.dataset.f] = inp.type === 'checkbox' ? (inp.checked ? 1 : 0) : +inp.value;
    redraw();
  };
  for (const b of list.querySelectorAll('[data-del]')) b.onclick = () => { CC.layers.splice(+b.dataset.del, 1); renderCompCreate(); };
  for (const b of list.querySelectorAll('[data-up]')) b.onclick = () => { const i = +b.dataset.up; if (i > 0) { [CC.layers[i - 1], CC.layers[i]] = [CC.layers[i], CC.layers[i - 1]]; renderCompCreate(); } };
  for (const b of list.querySelectorAll('[data-dn]')) b.onclick = () => { const i = +b.dataset.dn; if (i < CC.layers.length - 1) { [CC.layers[i + 1], CC.layers[i]] = [CC.layers[i], CC.layers[i + 1]]; renderCompCreate(); } };
  if (!state.customItems) send({ t: 'customItems' });
}

// ============================================================================
// COMPOSITOR — Animations creator: scrub any creature animation frame by frame
// and layer FX over it, positioning each layer per frame by clicking the stage.
// A layer labelled 'projectile' smart-tracks: after its last frame it launches
// out of the animation toward the target, exactly as the game renders it.
// ============================================================================
const CA = { base: '', anim: 'attack', frame: 0, play: false, layers: [], sel: -1, name: 'special_attack' };
function caTotal(def, m) {
  if (!def || !m) return 1;
  return (def.kind === 'grid' && m.rows > 1 && !m.cols) ? m.frames : m.cols ? m.frames : m.frames * (m.rows > 1 ? m.rows : 1);
}
function renderCompAnims() {
  const body = $('#comp-body');
  const creatures = Object.keys(MEDIA.creatures || {}).sort();
  if (!CA.base) CA.base = creatures.find(c => c.startsWith('dragon')) || creatures[0] || '';
  const def = MEDIA.creatures?.[CA.base];
  const anims = def ? Object.keys(def.anims) : [];
  if (def && !def.anims[CA.anim]) CA.anim = anims[0];
  const m = def?.anims[CA.anim];
  const total = caTotal(def, m);
  const savedA = state.customAnims || {};
  body.innerHTML = `<div class="cc-wrap">
    <div class="cc-left">
      <canvas id="ca-canvas" width="300" height="260"></canvas>
      <div class="ms-row">frame <input id="ca-frame" type="range" min="0" max="${total - 1}" value="${Math.min(CA.frame, total - 1)}" style="flex:1"> <span id="ca-fno">${CA.frame}/${total - 1}</span></div>
      <div class="ms-row"><button class="act" id="ca-play">${CA.play ? '⏸ pause' : '▶ play'}</button>
        <span style="font-size:10.5px;color:var(--dim)">click the stage to place the selected FX at this frame</span></div>
      <div class="ms-row">id <input id="ca-name" value="${CA.name}"></div>
      <div class="ms-row"><button class="act" id="ca-save" style="flex:1">💾 Save animation</button></div>
      <h3 style="color:var(--gold);font-size:12px;margin-top:10px">Saved animations</h3>
      <div style="font-size:11.5px">${Object.entries(savedA).map(([id, d]) => `<div style="display:flex;justify-content:space-between;padding:2px 0"><span>${id} <small style="color:var(--dim)">${d.base}:${d.anim}</small></span><button class="act" data-rma="${id}" style="padding:0 6px">✕</button></div>`).join('') || '<i style="color:var(--dim)">none yet</i>'}</div>
    </div>
    <div class="cc-layers">
      <div class="ms-row">creature <select id="ca-base">${creatures.map(c => `<option ${c === CA.base ? 'selected' : ''}>${c}</option>`).join('')}</select>
        anim <select id="ca-anim">${anims.map(a => `<option ${a === CA.anim ? 'selected' : ''}>${a}</option>`).join('')}</select></div>
      <div class="ms-row"><select id="ca-fx">${Object.keys(MEDIA.fx || {}).sort().flatMap(k => Array.from({ length: MEDIA.fx[k].variants || 1 }, (_, v) => `<option>${k}:${v}</option>`)).join('')}</select>
        <button class="act" id="ca-add">＋ layer this effect</button></div>
      <div id="ca-list"></div>
    </div>
  </div>`;
  const cv = $('#ca-canvas');
  const g = cv.getContext('2d');
  $('#ca-base').onchange = (e) => { CA.base = e.target.value; CA.layers = []; renderCompAnims(); };
  $('#ca-anim').onchange = (e) => { CA.anim = e.target.value; CA.frame = 0; renderCompAnims(); };
  $('#ca-frame').oninput = (e) => { CA.frame = +e.target.value; CA.play = false; $('#ca-fno').textContent = `${CA.frame}/${total - 1}`; };
  $('#ca-play').onclick = () => { CA.play = !CA.play; $('#ca-play').textContent = CA.play ? '⏸ pause' : '▶ play'; };
  $('#ca-name').oninput = (e) => CA.name = e.target.value;
  $('#ca-add').onclick = () => {
    const fx = $('#ca-fx').value; if (!fx) return;
    CA.layers.push({ fx, from: 0, to: total - 1, size: 48, label: '', projectile: 0, offsets: { 0: [0, -30] } });
    CA.sel = CA.layers.length - 1;
    renderCompAnims();
  };
  $('#ca-save').onclick = () => {
    if (!CA.layers.length) return alert('add at least one FX layer');
    send({ t: 'customAnims', create: { id: CA.name, base: CA.base, anim: CA.anim, layers: CA.layers } });
  };
  for (const b of body.querySelectorAll('[data-rma]')) b.onclick = () => send({ t: 'customAnims', remove: b.dataset.rma });
  cv.onclick = (e) => {   // position the selected layer's FX at the current frame
    if (CA.sel < 0 || !CA.layers[CA.sel]) return;
    const r = cv.getBoundingClientRect();
    const dx = (e.clientX - r.left) - 150, dy = (e.clientY - r.top) - 210;
    CA.layers[CA.sel].offsets[CA.frame] = [Math.round(dx), Math.round(dy)];
    renderCaList();
  };
  const renderCaList = () => {
    const list = $('#ca-list');
    list.innerHTML = CA.layers.map((l, i) => `<div class="cc-layer" style="${i === CA.sel ? 'border-color:var(--gold)' : ''}">
      <b data-sel="${i}" style="cursor:pointer">${i + 1}. ${l.fx}</b> <button class="act" data-dela="${i}" style="padding:0 6px;float:right">✕</button>
      <div class="ms-row">from <input data-af="from" data-ai="${i}" type="number" min="0" max="${total - 1}" value="${l.from}" style="width:52px">
        to <input data-af="to" data-ai="${i}" type="number" min="0" max="${total - 1}" value="${l.to}" style="width:52px">
        size <input data-af="size" data-ai="${i}" type="number" min="8" max="200" value="${l.size}" style="width:56px"></div>
      <div class="ms-row">label <input data-af="label" data-ai="${i}" value="${l.label}" placeholder="e.g. projectile" style="flex:1"></div>
      <div style="font-size:10.5px;color:${l.projectile ? 'var(--green)' : 'var(--dim)'}">${l.projectile ? '⤿ smart tracking ON — launches as a projectile after its last frame' : 'keyed positions: ' + Object.keys(l.offsets).join(', ')}</div>
    </div>`).join('') || '<i style="color:var(--dim)">no FX layers yet</i>';
    for (const b of list.querySelectorAll('[data-sel]')) b.onclick = () => { CA.sel = +b.dataset.sel; renderCaList(); };
    for (const b of list.querySelectorAll('[data-dela]')) b.onclick = () => { CA.layers.splice(+b.dataset.dela, 1); CA.sel = -1; renderCompAnims(); };
    for (const inp of list.querySelectorAll('input')) inp.oninput = () => {
      const l = CA.layers[+inp.dataset.ai];
      const f = inp.dataset.af;
      l[f] = f === 'label' ? inp.value : +inp.value;
      if (f === 'label') l.projectile = /projectile/i.test(inp.value) ? 1 : 0;   // smart tracking
      renderCaList();
    };
  };
  renderCaList();
  let lastAdv = 0;
  const fake = { id: 7, dir: 2, hp: 1 };
  const loop = (now) => {
    if (view !== 'comp' || compMode !== 'anims' || !document.body.contains(cv)) return;
    if (CA.play && now - lastAdv > 130) { CA.frame = (CA.frame + 1) % (total + (CA.layers.some(l => l.projectile) ? 6 : 0)); lastAdv = now; const s = $('#ca-frame'); if (s) { s.value = Math.min(CA.frame, total - 1); $('#ca-fno').textContent = `${Math.min(CA.frame, total - 1)}/${total - 1}`; } }
    g.clearRect(0, 0, 300, 260);
    g.fillStyle = '#23422a'; g.fillRect(0, 0, 300, 260);
    g.strokeStyle = '#ffffff22'; g.strokeRect(150 - 40, 210 - 60, 80, 60);   // target dummy zone
    if (def && m) {
      const fi = Math.min(CA.frame, total - 1);
      drawFrame(g, def, m, fake, CA.anim, now, 150, 210, 1.6, fi);
      for (const l of CA.layers) {
        if (CA.frame >= l.from && CA.frame <= l.to) {
          const [dx, dy] = customLayerPos(l, CA.frame);
          drawFxSprite(g, l.fx, (CA.frame - l.from) / Math.max(1, l.to - l.from), 150 + dx, 210 + dy, l.size);
        } else if (l.projectile && CA.frame > l.to) {
          const t = Math.min(1, (CA.frame - l.to) / 6);
          const [dx, dy] = customLayerPos(l, l.to);
          g.save(); g.globalAlpha = 1 - t * 0.5;
          drawFxSprite(g, l.fx, t, 150 + dx + t * 130, 210 + dy - t * 12, l.size);
          g.restore();
        }
      }
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  if (!state.customAnims) send({ t: 'customAnims' });
}

// ============================================================================
// GEAR SHEET MAKER — turn a single equipment image into a full LPC-compatible
// weapon sheet. A reference weapon sheet (the game's own sword) is the grip
// template: for every animation frame we read where its blade sits (centroid,
// principal angle, extent) and stamp YOUR image there. You align your art to
// the guideline on one frame; the maker propagates that fit across all frames.
// ============================================================================
const GS = {
  img: null, imgName: '', body: null, gen: null, refs: {},
  x: 0, y: 0, scale: 1, rot: 0, trackRot: true, flipX: false, flipY: false,
  sizeLock: true,    // keep the weapon a constant size across all frames/directions
  target: 'carry',   // which sheet we're compiling (see GS_TEMPLATES)
  sheets: {},        // captured PNG dataURLs per target, for deploy
  deploy: { open: false, kind: 'sword', level: 10, drops: [] },   // deployment-table state
};
// capture the current target's generated sheet as a PNG, ready to deploy
function gsCapture() { if (GS.gen) GS.sheets[GS.target] = GS.gen.toDataURL(); }
// The input weapon's own grip + blade axis: the handle is the blade end nearest
// the image's bottom-centre, the tip is the far end. gsGenerate maps this grip
// onto each reference cell's HAND and rotates the blade so its axis matches that
// cell's reference blade — so a generated weapon takes the working sheet's exact
// grip and per-frame angle in every facing. Cached per source image.
function gsInputGrip() {
  const im = GS.img; if (!im) return null;
  if (GS._grip && GS._gripFor === im) return GS._grip;
  const W = im.naturalWidth || im.width, H = im.naturalHeight || im.height;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.drawImage(im, 0, 0);
  const data = g.getImageData(0, 0, W, H).data; const pts = []; let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > 40) { pts.push([x, y]); sx += x; sy += y; n++; }
  GS._gripFor = im;
  if (!n) return (GS._grip = { gux: W / 2, guy: H, uAng: -Math.PI / 2, uExt: H / 2 });
  const cx = sx / n, cy = sy / n; let mxx = 0, myy = 0, mxy = 0;
  for (const [x, y] of pts) { const dx = x - cx, dy = y - cy; mxx += dx * dx; myy += dy * dy; mxy += dx * dy; }
  mxx /= n; myy /= n; mxy /= n;
  const ang = 0.5 * Math.atan2(2 * mxy, mxx - myy), ux = Math.cos(ang), uy = Math.sin(ang);
  let pmin = Infinity, pmax = -Infinity, a = pts[0], b = pts[0];
  for (const [x, y] of pts) { const p = (x - cx) * ux + (y - cy) * uy; if (p < pmin) { pmin = p; a = [x, y]; } if (p > pmax) { pmax = p; b = [x, y]; } }
  const bcx = W / 2, bcy = H;                                     // handle sits at the image's bottom centre
  const dA = Math.hypot(a[0] - bcx, a[1] - bcy), dB = Math.hypot(b[0] - bcx, b[1] - bcy);
  const grip = dA <= dB ? a : b, tip = dA <= dB ? b : a;
  return (GS._grip = { gux: grip[0], guy: grip[1], uAng: Math.atan2(tip[1] - grip[1], tip[0] - grip[0]), uExt: Math.hypot(tip[0] - grip[0], tip[1] - grip[1]) || 1 });
}
// import an existing in-game weapon: lift the clearest single frame of its own
// sheet as the input art, so you can re-position / resize / re-deploy it
function gsImportWeapon(type) {
  const file = weaponSheetFile(type, 'fg') || weaponSheetFile(type, 'bg');
  if (!file) return;
  const im = new Image();
  im.onload = () => {
    const W = im.naturalWidth, H = im.naturalHeight, fs = 64;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'); g.drawImage(im, 0, 0);
    const data = g.getImageData(0, 0, W, H).data;
    const opaque = (x, y) => data[(y * W + x) * 4 + 3] > 60;
    // pick the 64px cell holding the most of the weapon (its clearest view)
    let best = null, bestN = 0;
    for (let r = 0; r < H / fs | 0; r++) for (let c = 0; c < W / fs | 0; c++) {
      let n = 0; for (let y = 0; y < fs; y++) for (let x = 0; x < fs; x++) if (opaque(c * fs + x, r * fs + y)) n++;
      if (n > bestN) { bestN = n; best = [c * fs, r * fs]; }
    }
    if (!best) return;
    const [ox, oy] = best; let mnx = fs, mny = fs, mxx = 0, mxy = 0;
    for (let y = 0; y < fs; y++) for (let x = 0; x < fs; x++) if (opaque(ox + x, oy + y)) { if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y; }
    const w = mxx - mnx + 1, h = mxy - mny + 1, pad = 2;
    const crop = document.createElement('canvas'); crop.width = w + pad * 2; crop.height = h + pad * 2;
    crop.getContext('2d').drawImage(cv, ox + mnx, oy + mny, w, h, pad, pad, w, h);
    GS.img = crop; GS.imgName = type; GS._grip = null;
    // the maker anchors the input's grip on the hand and auto-orients to the
    // reference blade, so the offsets start neutral — tweak only if needed
    GS.x = 0; GS.y = 0; GS.scale = 1; GS.rot = 0; GS.flipX = false; GS.flipY = false;
    for (const k of ['x', 'y', 'scale', 'rot']) { const e = $(`#gs-${k}`); if (e) e.value = GS[k]; }
    gsGenerate(); gsCapture(); gsCaps();
  };
  im.src = 'assets/lpc/' + file;
}
// The reference templates the maker traces. `fs` is the LPC frame size: 'carry'
// is the weapon's base walk/idle sheet (64px — the game's bg/fg), the attack
// targets are oversize overlays the game reads as perAnim.{slash,thrust}. For
// every reference cell we read the blade's centroid / principal angle / extent
// and stamp YOUR art there, so one alignment propagates across the animation.
// `bodyRow` is the body sheet's animation row the preview plays underneath.
const GS_TEMPLATES = {
  carry: { label: 'Walk / carry', bg: 'wep_sword_bg_iron.png', fg: 'wep_sword_fg_iron.png', fs: 64, over: false, align: { r: 10, c: 6 }, bodyRow: 8, frames: 9, ms: 120, deploy: 'base' },
  slash: { label: '1H slash', bg: 'wep_sword_attack_slash_bg_iron.png', fg: 'wep_sword_attack_slash_fg_iron.png', fs: 128, over: true, align: { r: 2, c: 3 }, bodyRow: 12, frames: 6, ms: 90, deploy: 'slash' },
  thrust: { label: 'Thrust / stab', bg: 'wep_spear_thrust_bg_iron.png', fg: 'wep_spear_thrust_fg_iron.png', fs: 192, over: true, align: { r: 2, c: 4 }, bodyRow: 4, frames: 8, ms: 90, deploy: 'thrust' },
};
function gsTpl() { return GS_TEMPLATES[GS.target] || GS_TEMPLATES.carry; }
function gsRef() { return GS.refs[GS.target]; }
function gsExtractCells(img, fs) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const W = img.width, H = img.height, cols = W / fs | 0, rows = H / fs | 0;
  const data = g.getImageData(0, 0, W, H).data;
  const cells = [];
  const bcx = fs / 2, bcy = fs * 0.5;   // approx. character centre within the cell
  for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) {
    const ox = col * fs, oy = r * fs; let n = 0, sx = 0, sy = 0; const pts = [];
    for (let y = 0; y < fs; y++) for (let x = 0; x < fs; x++) { const a = data[((oy + y) * W + (ox + x)) * 4 + 3]; if (a > 50) { n++; sx += x; sy += y; pts.push([x, y]); } }
    if (n < 6) { cells.push(null); continue; }
    const cx = sx / n, cy = sy / n; let mxx = 0, myy = 0, mxy = 0;
    for (const [x, y] of pts) { const dx = x - cx, dy = y - cy; mxx += dx * dx; myy += dy * dy; mxy += dx * dy; }
    mxx /= n; myy /= n; mxy /= n;
    // principal axis, then resolve the blade's *tip direction* (the 180°-ambiguous
    // axis is why non-south frames used to flip): project onto the axis, take the
    // two ends, and call the end nearer the body the grip and the far end the tip.
    const ang = 0.5 * Math.atan2(2 * mxy, mxx - myy), ux = Math.cos(ang), uy = Math.sin(ang);
    let pmin = Infinity, pmax = -Infinity, gpMin = pts[0], gpMax = pts[0];
    for (const [x, y] of pts) { const p = (x - cx) * ux + (y - cy) * uy; if (p < pmin) { pmin = p; gpMin = [x, y]; } if (p > pmax) { pmax = p; gpMax = [x, y]; } }
    const dMin = Math.hypot(gpMin[0] - bcx, gpMin[1] - bcy), dMax = Math.hypot(gpMax[0] - bcx, gpMax[1] - bcy);
    const grip = dMin <= dMax ? gpMin : gpMax, tip = dMin <= dMax ? gpMax : gpMin;
    const bladeDir = Math.atan2(tip[1] - grip[1], tip[0] - grip[0]);
    cells.push({ row: r, col, cx, cy, gx: grip[0], gy: grip[1], angle: bladeDir, ext: Math.hypot(tip[0] - grip[0], tip[1] - grip[1]) });
  }
  const rc = { cells, cols, rows, W, H, fs };
  return rc;
}
function gsAlignCell() {
  const ref = gsRef(); if (!ref) return null; const t = gsTpl();
  const at = ref.cells[t.align.r * ref.cols + t.align.c];
  if (at) return at;
  // fall back to the most-extended blade in the same (south) row, else any cell
  let best = null;
  for (let col = 0; col < ref.cols; col++) { const cell = ref.cells[t.align.r * ref.cols + col]; if (cell && (!best || cell.ext > best.ext)) best = cell; }
  return best || ref.cells.find(c => c);
}
// build (once, cached) the bg+fg composite reference for a target and trace its
// cells — fg alone is just the sliver in front of the hand, so we need both
function gsEnsureRef(target, cb) {
  if (GS.refs[target]) { cb && cb(); return; }
  const t = GS_TEMPLATES[target]; let bg = null, fg = null;
  const build = () => {
    if (!bg || !fg) return;
    const c = document.createElement('canvas'); c.width = bg.width; c.height = bg.height;
    const g = c.getContext('2d'); g.drawImage(bg, 0, 0); g.drawImage(fg, 0, 0);
    const rc = gsExtractCells(c, t.fs); rc.canvas = c; GS.refs[target] = rc;
    cb && cb();
  };
  const lb = new Image(); lb.onload = () => { bg = lb; build(); }; lb.src = 'assets/lpc/' + t.bg;
  const lf = new Image(); lf.onload = () => { fg = lf; build(); }; lf.src = 'assets/lpc/' + t.fg;
}
function gsGenerate() {
  const ref = gsRef(); if (!ref || !GS.img) return;
  const align = gsAlignCell(); if (!align) return;
  const gi = gsInputGrip(); if (!gi) return;
  const fs = ref.fs;
  // The input blade's own axis. gsGenerate rotates it so that axis matches EACH
  // reference cell's blade angle, and pins the input's grip onto that cell's hand
  // — reproducing the working weapon sheet's exact grips and per-frame angles in
  // every facing (walk carried at the side, slash/thrust swinging through the arc).
  let uAng = gi.uAng;
  if (GS.flipX) uAng = Math.PI - uAng;
  if (GS.flipY) uAng = -uAng;
  const out = document.createElement('canvas'); out.width = ref.W; out.height = ref.H;
  const g = out.getContext('2d'); g.imageSmoothingEnabled = false;
  for (const cell of ref.cells) {
    if (!cell) continue;
    const dRot = GS.trackRot ? cell.angle - uAng : 0;   // align input blade → reference blade
    // size-lock keeps a constant size across frames; unlocked, it matches the
    // reference blade's per-frame length
    const dScale = GS.sizeLock ? 1 : cell.ext / (align.ext || 1);
    g.save();
    // clip to THIS frame's cell so a stamp can never bleed into a neighbour
    g.beginPath(); g.rect(cell.col * fs, cell.row * fs, fs, fs); g.clip();
    // pin the input's grip onto the reference HAND, then pivot/scale about it
    g.translate(cell.col * fs + cell.gx, cell.row * fs + cell.gy);
    g.rotate(dRot); g.scale(dScale, dScale);
    g.translate(GS.x, GS.y); g.rotate(GS.rot * Math.PI / 180); g.scale(GS.scale, GS.scale);
    g.scale(GS.flipX ? -1 : 1, GS.flipY ? -1 : 1);   // mirror the input art (grip stays pinned)
    g.drawImage(GS.img, -gi.gux, -gi.guy);
    g.restore();
  }
  GS.gen = out;
}
function renderGearSheet() {
  const body = $('#comp-body');
  const tgtBtns = Object.entries(GS_TEMPLATES).map(([k, t]) => `<button class="act ${GS.target === k ? 'on' : ''}" data-gst="${k}" style="padding:2px 7px;font-size:10px">${t.label}</button>`).join('');
  body.innerHTML = `<div style="display:flex;gap:16px;flex-wrap:wrap">
    <div style="min-width:270px">
      <h3 style="color:var(--gold);font-size:12px">1 · Import equipment art</h3>
      <div class="ms-row"><input type="file" id="gs-file" accept="image/*"></div>
      <div style="font-size:11px;color:var(--dim)">A single weapon image (PNG, transparent). Point the blade UP for best results.</div>
      <div class="ms-row" style="gap:4px;margin-top:5px">…or edit an existing weapon:
        <select id="gs-import" style="flex:1"><option value="">— pick a weapon —</option>${weaponList().map((w) => `<option value="${w}">${w}</option>`).join('')}</select></div>
      <h3 style="color:var(--gold);font-size:12px;margin-top:12px">2 · Choose the combat animation</h3>
      <div class="ms-row" style="flex-wrap:wrap;gap:4px">${tgtBtns}</div>
      <div style="font-size:11px;color:var(--dim)">Carry is the base walk/idle sheet; slash &amp; thrust are the attack overlays. Compile whichever your weapon needs.</div>
      <h3 style="color:var(--gold);font-size:12px;margin-top:12px">3 · Align to the grip guideline</h3>
      <canvas id="gs-align" width="256" height="256" style="background:#20331f;border:1px solid var(--trim);border-radius:6px;cursor:move"></canvas>
      <div class="ms-row">X <input id="gs-x" type="range" min="-40" max="40" step="0.5" value="${GS.x}" style="flex:1"></div>
      <div class="ms-row">Y <input id="gs-y" type="range" min="-40" max="40" step="0.5" value="${GS.y}" style="flex:1"></div>
      <div class="ms-row">scale <input id="gs-scale" type="range" min="0.2" max="3" step="0.02" value="${GS.scale}" style="flex:1"></div>
      <div class="ms-row">rotate <input id="gs-rot" type="range" min="-180" max="180" step="1" value="${GS.rot}" style="flex:1"></div>
      <div class="ms-row" style="gap:12px;flex-wrap:wrap">
        <label style="font-size:11.5px"><input type="checkbox" id="gs-flipx" ${GS.flipX ? 'checked' : ''}> mirror ↔</label>
        <label style="font-size:11.5px"><input type="checkbox" id="gs-flipy" ${GS.flipY ? 'checked' : ''}> flip ↕</label>
        <label style="font-size:11.5px"><input type="checkbox" id="gs-track" ${GS.trackRot ? 'checked' : ''}> track swing</label>
        <label style="font-size:11.5px" title="keep the weapon the same size in every frame &amp; direction"><input type="checkbox" id="gs-lock" ${GS.sizeLock ? 'checked' : ''}> 🔒 size lock</label></div>
      <div class="ms-row"><button class="act" id="gs-gen" style="flex:1">⚙ Generate sheet</button>
        <button class="act" id="gs-dl">⬇ PNG</button></div>
    </div>
    <div style="min-width:270px">
      <h3 style="color:var(--gold);font-size:12px">4 · Preview on the character</h3>
      <canvas id="gs-preview" width="220" height="240" style="background:#23422a;border:1px solid var(--trim);border-radius:6px"></canvas>
      <div style="font-size:11px;color:var(--dim);margin-top:6px">The grip template is the game's own weapon sheet for this animation — your art inherits its exact per-frame hand positions. Align once; the maker fits it to every frame and clips each stamp to its cell.</div>
      <div id="gs-status" style="font-size:11px;color:var(--dim);margin-top:8px"></div>
      <div id="gs-caps" style="font-size:11px;color:var(--dim);margin-top:4px"></div>
      <h3 style="color:var(--gold);font-size:12px;margin-top:12px">5 · Ship it</h3>
      <div class="ms-row"><button class="act" id="gs-deploy-toggle" style="flex:1">🚀 Deploy to the game…</button></div>
      <div style="font-size:11px;color:var(--dim)">Or use ⬇ PNG (step&nbsp;3) to save the sheet to your files.</div>
      <div id="gs-deploy"></div>
    </div>
  </div>`;
  gsEnsureRef(GS.target, () => {
    const ref = gsRef(); const s = $('#gs-status');
    if (s && ref) s.textContent = `${gsTpl().label} template ready: ${ref.cols}×${ref.rows} frames @ ${ref.fs}px`;
    if (GS.img) gsGenerate();
  });
  if (!GS.body) { const b = new Image(); b.onload = () => { GS.body = b; }; b.src = 'assets/lpc/body_male_light.png'; }
  $('#gs-file').onchange = (e) => { const f = e.target.files[0]; if (!f) return; const im = new Image(); im.onload = () => { GS.img = im; GS.imgName = f.name.replace(/\.\w+$/, ''); GS._grip = null; GS.x = 0; GS.y = 0; GS.scale = 1; GS.rot = 0; for (const k of ['x', 'y', 'scale', 'rot']) { const el = $(`#gs-${k}`); if (el) el.value = GS[k]; } gsGenerate(); }; im.src = URL.createObjectURL(f); };
  $('#gs-import').onchange = (e) => { if (e.target.value) gsImportWeapon(e.target.value); };
  for (const k of ['x', 'y', 'scale', 'rot']) $(`#gs-${k}`).oninput = (e) => { GS[k] = +e.target.value; gsGenerate(); };
  $('#gs-track').onchange = (e) => { GS.trackRot = e.target.checked; gsGenerate(); };
  $('#gs-lock').onchange = (e) => { GS.sizeLock = e.target.checked; gsGenerate(); };
  $('#gs-flipx').onchange = (e) => { GS.flipX = e.target.checked; gsGenerate(); };
  $('#gs-flipy').onchange = (e) => { GS.flipY = e.target.checked; gsGenerate(); };
  $('#gs-gen').onclick = () => { gsGenerate(); gsCapture(); gsCaps(); $('#gs-status').textContent = GS.gen ? 'sheet generated & captured — see the preview' : 'import an image first'; };
  $('#gs-dl').onclick = () => { if (!GS.gen) return; gsCapture(); gsCaps(); const a = document.createElement('a'); a.download = (GS.imgName || 'weapon') + '_' + GS.target + '_lpc.png'; a.href = GS.gen.toDataURL(); a.click(); };
  // switching targets captures the outgoing sheet first, so a multi-animation
  // weapon (carry + slash, say) keeps every compiled sheet ready to deploy
  for (const b of body.querySelectorAll('[data-gst]')) b.onclick = () => { gsCapture(); GS.target = b.dataset.gst; renderGearSheet(); };
  $('#gs-deploy-toggle').onclick = () => { GS.deploy.open = !GS.deploy.open; renderDeploy(); };
  if (!state.dropTables) send({ t: 'dropTables' });
  gsCaps(); renderDeploy();
  // drag on the align canvas moves the base image
  const ac = $('#gs-align'); let drag = null;
  ac.onmousedown = (e) => { drag = { mx: e.offsetX, my: e.offsetY, x: GS.x, y: GS.y }; };
  window.addEventListener('mousemove', (e) => { if (!drag) return; const r = ac.getBoundingClientRect(); const z = 256 / gsTpl().fs; GS.x = drag.x + (e.clientX - r.left - drag.mx) / z; GS.y = drag.y + (e.clientY - r.top - drag.my) / z; $('#gs-x').value = GS.x; $('#gs-y').value = GS.y; gsGenerate(); });
  window.addEventListener('mouseup', () => drag = null);
  gsLoop();
}
// which compiled sheets are captured & ready to deploy
function gsCaps() {
  const el = $('#gs-caps'); if (!el) return;
  const have = Object.keys(GS.sheets);
  el.innerHTML = 'Compiled: ' + Object.keys(GS_TEMPLATES).map(k =>
    `<span style="color:${have.includes(k) ? 'var(--good,#7ecb5a)' : 'var(--dim)'}">${GS_TEMPLATES[k].label}${have.includes(k) ? ' ✓' : ''}</span>`).join(' · ');
}
function gsFillSources() { if (GS.deploy.open) renderDeploy(); }
// The deployment table — item level → auto-balanced stats (per the shared gear
// guideline), editable requirements, and the source wiring (drop tables with
// rate%, a crafting recipe, a quest note). Deploy POSTs the compiled sheet(s) +
// spec to the server, which saves the art and registers a live equippable item.
function renderDeploy() {
  const host = $('#gs-deploy'); if (!host) return;
  const d = GS.deploy;
  if (!d.open) { host.innerHTML = ''; return; }
  if (d.name == null) d.name = (GS.imgName || '').replace(/_/g, ' ').trim() || 'Custom weapon';
  const gl = gearGuideline(d.kind, d.level);
  if (!d.value) d.value = gl.value;
  if (!d.req) d.req = { ...gl.req };
  const dt = state.dropTables;
  const mobOpts = (list) => (list || []).map(m => `<option value="${m.id}">${m.name} (lv ${m.lvl})</option>`).join('');
  const srcSelect = dt
    ? `<select class="dp-mob" style="flex:1;font-size:11px"><option value="">— pick a source —</option><optgroup label="Bosses">${mobOpts(dt.bosses)}</optgroup><optgroup label="Mobs">${mobOpts(dt.mobs)}</optgroup></select>`
    : `<span style="font-size:11px;color:var(--dim)">loading sources…</span>`;
  const kinds = ['sword', 'dagger', 'spear', 'mace', 'waraxe', 'greatsword'];
  const bonusStr = Object.entries(gl.bonus).map(([k, v]) => `${k} ${v}`).join(', ');
  const dropRows = d.drops.map((r, i) => `<div class="ms-row" style="gap:4px" data-drow="${i}">
      <span style="flex:1;font-size:11px;color:var(--fg)">${r.id || '(none)'}</span>
      <input type="number" class="dp-rate" data-i="${i}" value="${r.rate ?? 2}" min="0" max="100" step="0.1" style="width:56px" title="drop rate %"><span style="font-size:11px">%</span>
      <button class="act" data-drrm="${i}" style="padding:1px 6px">✕</button></div>`).join('');
  host.innerHTML = `<div style="margin-top:8px;border:1px solid var(--trim);border-radius:6px;padding:9px;background:#1a2a1c">
    <div class="ms-row">name <input id="dp-name" value="${d.name.replace(/"/g, '&quot;')}" style="flex:1"></div>
    <div class="ms-row">weapon <select id="dp-kind" style="flex:1">${kinds.map(k => `<option ${k === d.kind ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
    <div class="ms-row">item level <input id="dp-level" type="number" min="1" max="99" value="${d.level}" style="width:64px"></div>
    <div style="font-size:11px;color:var(--dim);margin:2px 0 6px">Auto-balanced: <b style="color:var(--gold)">${bonusStr}</b> · speed ${gl.speed}ms${gl.twoHand ? ' · 2H' : ''} · style ${gl.style}/${gl.anim}</div>
    <div class="ms-row">value <input id="dp-value" type="number" min="1" value="${d.value}" style="width:90px"> $LoS</div>
    <div class="ms-row">req: att <input id="dp-req-attack" type="number" min="0" value="${d.req.attack || 0}" style="width:52px">
      str <input id="dp-req-strength" type="number" min="0" value="${d.req.strength || 0}" style="width:52px">
      def <input id="dp-req-defence" type="number" min="0" value="${d.req.defence || 0}" style="width:52px"></div>
    <h4 style="color:var(--gold);font-size:11.5px;margin:8px 0 3px">Drop sources</h4>
    <div id="dp-droplist">${dropRows || '<div style="font-size:11px;color:var(--dim)">no drop sources — add one below</div>'}</div>
    <div class="ms-row" style="gap:4px">${srcSelect}<button class="act" id="dp-addrop" style="padding:2px 7px">+ add</button></div>
    <h4 style="color:var(--gold);font-size:11.5px;margin:8px 0 3px">Crafting recipe <label style="font-weight:normal;font-size:10.5px"><input type="checkbox" id="dp-craft-on" ${d.craftOn ? 'checked' : ''}> enable</label></h4>
    <div id="dp-craftbox" style="${d.craftOn ? '' : 'display:none'}">
      <div class="ms-row">skill <select id="dp-craft-skill" style="flex:1">${['smithing', 'crafting', 'fletching'].map(s => `<option ${s === (d.craftSkill || 'smithing') ? 'selected' : ''}>${s}</option>`).join('')}</select>
        lvl <input id="dp-craft-lvl" type="number" min="1" max="99" value="${d.craftLvl || d.level}" style="width:52px"></div>
      <div class="ms-row">station <select id="dp-craft-station" style="flex:1">${['anvil', 'furnace', 'none'].map(s => `<option ${s === (d.craftStation || 'anvil') ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="ms-row">materials <input id="dp-craft-mats" value="${d.craftMats || ''}" placeholder="iron_bar:3, coal:2" style="flex:1"></div>
    </div>
    <h4 style="color:var(--gold);font-size:11.5px;margin:8px 0 3px">Quest reward (note)</h4>
    <div class="ms-row"><input id="dp-quest" value="${(d.quest || '').replace(/"/g, '&quot;')}" placeholder="e.g. reward for 'The Sheriff's Bane'" style="flex:1"></div>
    <div class="ms-row" style="margin-top:8px"><button class="act on" id="dp-deploy" style="flex:1">🚀 Deploy to the game</button></div>
    <div id="dp-status" style="font-size:11px;color:var(--dim);margin-top:6px"></div>
  </div>`;
  $('#dp-name').onchange = (e) => d.name = e.target.value;
  $('#dp-kind').onchange = (e) => { d.kind = e.target.value; d.value = 0; d.req = null; renderDeploy(); };
  $('#dp-level').onchange = (e) => { d.level = Math.max(1, Math.min(99, +e.target.value | 0)); d.value = 0; d.req = null; renderDeploy(); };
  $('#dp-value').onchange = (e) => d.value = Math.max(1, +e.target.value | 0);
  for (const k of ['attack', 'strength', 'defence']) $(`#dp-req-${k}`).onchange = (e) => { d.req = d.req || {}; d.req[k] = Math.max(0, +e.target.value | 0); };
  $('#dp-addrop').onclick = () => { const sel = host.querySelector('.dp-mob'); const id = sel && sel.value; if (id && !d.drops.some(x => x.id === id)) d.drops.push({ id, rate: 2 }); renderDeploy(); };
  for (const b of host.querySelectorAll('[data-drrm]')) b.onclick = () => { d.drops.splice(+b.dataset.drrm, 1); renderDeploy(); };
  for (const e of host.querySelectorAll('.dp-rate')) e.onchange = () => { d.drops[+e.dataset.i].rate = Math.max(0, Math.min(100, +e.value)); };
  $('#dp-craft-on').onchange = (e) => { d.craftOn = e.target.checked; renderDeploy(); };
  for (const [id, k] of [['#dp-craft-skill', 'craftSkill'], ['#dp-craft-lvl', 'craftLvl'], ['#dp-craft-station', 'craftStation'], ['#dp-craft-mats', 'craftMats']]) { const e = $(id); if (e) e.onchange = () => d[k] = e.value; }
  $('#dp-quest').onchange = (e) => d.quest = e.target.value;
  $('#dp-deploy').onclick = () => gsDeploy();
}
// compile EVERY animation (carry + slash + thrust) from the current alignment so
// a deployed weapon animates in combat, not just when walking. The same align
// offsets + size-lock apply to each target's own grip template.
function gsCompileAll() {
  return new Promise((resolve) => {
    const targets = Object.keys(GS_TEMPLATES);
    let pending = targets.length;
    const done = () => {
      const save = GS.target;
      for (const t of targets) { GS.target = t; gsGenerate(); if (GS.gen) GS.sheets[t] = GS.gen.toDataURL(); }
      GS.target = save; gsGenerate();
      resolve();
    };
    targets.forEach((t) => gsEnsureRef(t, () => { if (--pending === 0) done(); }));
  });
}
async function gsDeploy() {
  const d = GS.deploy, st = $('#dp-status');
  if (!GS.img) { st.textContent = '⚠ import a weapon image first.'; return; }
  st.textContent = 'compiling walk + slash + thrust…';
  await gsCompileAll();   // ship all animations so combat is wired, not just walk
  gsCaps();
  if (!GS.sheets.carry) { st.textContent = '⚠ compile the Walk/carry sheet first (it is the held look).'; return; }
  const gl = gearGuideline(d.kind, d.level);
  const req = {}; for (const k of ['attack', 'strength', 'defence']) if (d.req?.[k] > 0) req[k] = d.req[k];
  const bossIds = new Set((state.dropTables?.bosses || []).map(b => b.id));
  const craftMats = {};
  if (d.craftOn && d.craftMats) for (const part of d.craftMats.split(',')) { const [it, q] = part.split(':').map(s => s.trim()); if (it) craftMats[it] = Math.max(1, +q || 1); }
  const spec = {
    id: d.name, name: d.name, value: d.value || gl.value,
    gear: { kind: d.kind, style: gl.style, anim: gl.anim, twoHand: gl.twoHand, speed: gl.speed, color: 'steel', level: d.level, bonus: gl.bonus, req },
    sources: {
      drops: d.drops.filter(r => r.id).map(r => ({ src: bossIds.has(r.id) ? 'boss' : 'mob', id: r.id, rate: Math.max(0, +r.rate || 0) / 100 })),
      craft: d.craftOn && Object.keys(craftMats).length ? { skill: d.craftSkill || 'smithing', lvl: +d.craftLvl || d.level, station: (d.craftStation === 'none' ? null : d.craftStation || 'anvil'), inputs: craftMats } : null,
      quest: d.quest || null,
    },
  };
  st.textContent = 'deploying…';
  try {
    const r = await fetch(`/admin/deploy-gear?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spec, sheets: GS.sheets }) });
    const txt = await r.text();
    if (!r.ok) { st.textContent = '✗ ' + txt; return; }
    const res = JSON.parse(txt);
    st.innerHTML = `<span style="color:var(--good,#7ecb5a)">✓ deployed as <b>${res.id}</b> — live in the game now.</span>`;
  } catch (e) { st.textContent = '✗ ' + e.message; }
}
function gsLoop() {
  if (view !== 'comp' || compMode !== 'gearsheet') return;
  const ac = $('#gs-align'), pc = $('#gs-preview');
  if (!ac || !pc) return;
  const now = performance.now();
  const t = gsTpl(), ref = gsRef(), align = gsAlignCell();
  // --- alignment canvas: reference grip guideline (cyan) + your art, zoomed ---
  const ag = ac.getContext('2d'); ag.imageSmoothingEnabled = false; ag.clearRect(0, 0, 256, 256);
  if (ref && align) {
    const z = 256 / ref.fs;
    ag.save(); ag.globalAlpha = 0.5; ag.filter = 'hue-rotate(160deg) saturate(3)';
    ag.drawImage(ref.canvas, align.col * ref.fs, align.row * ref.fs, ref.fs, ref.fs, 0, 0, 256, 256);
    ag.restore();
    if (GS.img) {
      const gi = gsInputGrip();
      let uAng = gi.uAng; if (GS.flipX) uAng = Math.PI - uAng; if (GS.flipY) uAng = -uAng;
      const dRot = GS.trackRot ? align.angle - uAng : 0;   // auto-orient to the reference blade, matching gsGenerate
      ag.save(); ag.translate(align.gx * z, align.gy * z);   // pin the input grip onto the reference hand
      ag.rotate(dRot);
      ag.translate(GS.x * z, GS.y * z); ag.rotate(GS.rot * Math.PI / 180); ag.scale(GS.scale * z, GS.scale * z);
      ag.scale(GS.flipX ? -1 : 1, GS.flipY ? -1 : 1);
      ag.drawImage(GS.img, -gi.gux, -gi.guy);
      ag.restore();
    }
  }
  // --- preview: body performing the target animation + the generated weapon ---
  const pg = pc.getContext('2d'); pg.imageSmoothingEnabled = false; pg.clearRect(0, 0, 220, 240);
  const nf = t.frames, fi = Math.floor(now / t.ms) % nf, dir = 2;   // south-facing
  const pk = 190 / t.fs, cx = 110, feet = 216;   // shared body+weapon scale (mimics in-game geometry)
  if (GS.body) { const S = 64 * pk; pg.drawImage(GS.body, fi * 64, (t.bodyRow + dir) * 64, 64, 64, cx - S / 2, feet - S + 12 * pk, S, S); }
  if (GS.gen) {
    if (t.over) { const Sw = t.fs * pk; pg.drawImage(GS.gen, fi * t.fs, dir * t.fs, t.fs, t.fs, cx - Sw / 2, feet - (t.fs / 2 + 20) * pk, Sw, Sw); }
    else { const S = 64 * pk; pg.drawImage(GS.gen, fi * 64, (t.bodyRow + dir) * 64, 64, 64, cx - S / 2, feet - S + 12 * pk, S, S); }
  }
  raf = requestAnimationFrame(gsLoop);
}

connect();
render();

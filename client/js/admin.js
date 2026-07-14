// Sherwood Admin Studio: server terminal, economy audit, PDA-vault review,
// world-event designer and an asset compositor that renders every item, icon,
// creature (animated), FX and equipped weapon through the GAME'S OWN modules —
// what you preview here is exactly what ships.

import { ITEMS } from '/shared/data/items.js';
import { MOBS } from '/shared/data/mobs.js';
import { PETS } from '/shared/data/pets.js';
import { SPELLS, PRAYERS } from '/shared/data/skills.js';
import { loadMedia, MEDIA, drawCreature, drawFxSprite } from './media.js';
import { loadManifest, composite, drawChar, drawOversize, drawHeldShield, shieldBehind, critterSprite, ANIMS } from './sprites.js';
import { itemIcon } from './icons.js';

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
  if (view === 'comp') return renderComp();
}

function renderTreasury() {
  const t = state.treasury;
  const e = state.econ || {};
  const oneIn = e.mobDropChance ? Math.round(1 / e.mobDropChance) : 900;
  main.innerHTML = `<h2>Protocol treasury</h2>
    <div class="cards">
      <div class="card"><b style="color:var(--gold)">${t ? t.balance.toLocaleString() : '…'}</b><span>$LoS in treasury</span></div>
      <div class="card"><b>${t ? (t.taxBps / 100) : '…'}%</b><span>GE trade tax</span></div>
      <div class="card"><b>×${e.distMult ?? '…'}</b><span>distribution rate</span></div>
    </div>
    <p style="color:var(--dim);margin-bottom:10px">The treasury grows solely from the ${t ? t.taxBps / 100 : 5}% Grand Exchange trade tax. Buyback-and-burn and creator-wallet transfers are handled physically by the operator, off-platform.</p>

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
let compTab = 'items', compSel = null;
function renderComp() {
  main.innerHTML = `<h2>Asset compositor <span style="color:var(--dim);font-size:11px">— rendered by the live game modules</span></h2>
    <div class="tabs2">${['items', 'creatures', 'weapons', 'fx', 'pets', 'spells'].map(t => `<button data-t="${t}" class="${compTab === t ? 'on' : ''}">${t}</button>`).join('')}
      <input id="comp-q" placeholder="filter…" style="margin-left:auto">
    </div>
    <div id="preview"><i style="color:var(--dim)">select an asset below to preview it</i></div>
    <div class="grid" id="comp-grid"></div>`;
  for (const b of main.querySelectorAll('.tabs2 button')) b.onclick = () => { compTab = b.dataset.t; compSel = null; renderComp(); };
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
  vis[it.vis.layer] = [it.vis.sheet || it.vis.type, it.vis.color];
  const isWeapon = it.vis.layer === 'weapon';
  const actAnim = !isWeapon ? 'walk'
    : it.vis.type === 'bow' ? 'shoot'
      : ['staff', 'crossbow'].includes(it.vis.type) ? 'thrust' : 'slash';   // staves & crossbows use the thrust rows (that's where their art lives)
  const comp = composite(vis);
  const loop = (now) => {
    g.clearRect(0, 0, 260, 200);
    g.imageSmoothingEnabled = false;
    const shieldCol = vis.shield && vis.shield[1];
    const wf = Math.floor(now / 110) % ANIMS.walk.frames;
    if (shieldCol && shieldBehind(2)) drawHeldShield(g, shieldCol, 2, 78, 172, 2);
    drawChar(g, comp, 'walk', 2, wf, 78, 172, 2);
    drawOversize(g, comp, vis, 'walk', 2, wf, 78, 172, 2);
    if (shieldCol && !shieldBehind(2)) drawHeldShield(g, shieldCol, 2, 78, 172, 2);
    const ai = ANIMS[actAnim] || ANIMS.slash;
    const af = Math.floor(now / ai.ms) % ai.frames;
    if (shieldCol && shieldBehind(2)) drawHeldShield(g, shieldCol, 2, 186, 172, 2);
    drawChar(g, comp, actAnim, 2, af, 186, 172, 2);
    drawOversize(g, comp, vis, actAnim, 2, af, 186, 172, 2);
    if (shieldCol && !shieldBehind(2)) drawHeldShield(g, shieldCol, 2, 186, 172, 2);
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
    drawChar(g, comp, 'idle', 2, f, 130, 176, 2.2);
    g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.9;
    drawFxSprite(g, aura.fx, ((now) % 1600) / 1600, 130, 120, 150, 0, aura.tint);
    g.restore();
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

connect();
render();

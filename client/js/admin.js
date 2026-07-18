// Sherwood Admin Studio: server terminal, economy audit, PDA-vault review,
// world-event designer and an asset compositor that renders every item, icon,
// creature (animated), FX and equipped weapon through the GAME'S OWN modules —
// what you preview here is exactly what ships.

import { ITEMS, registerCustomItems } from '/shared/data/items.js';
import { MOBS } from '/shared/data/mobs.js';
import { PETS } from '/shared/data/pets.js';
import { SPELLS, PRAYERS, NODES } from '/shared/data/skills.js';
import { TILE } from '/shared/constants.js';
import { computeWorld, worldTile, heightAt, regionAt, applyMapOverrides, MAP_OVERRIDES, WORLD_W, WORLD_H } from '/shared/mapgen.js';
import { SPAWNS, BOSS_SPAWNS, TOWNS } from '/shared/data/world.js';
import { loadMedia, MEDIA, drawCreature, drawFrame, drawFxSprite, drawFxBand, customLayerPos } from './media.js';
import { loadManifest, composite, drawChar, drawOversize, critterSprite, nodeSprite, ANIMS } from './sprites.js';
import { itemIcon } from './icons.js';
import { Renderer, flushChunkCache } from './renderer.js';
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
  else if (m.t === 'customItems') { state.customItems = m.items; registerCustomItems(m.items); if (view === 'comp' && compMode === 'create') renderComp(); }
  else if (m.t === 'customAnims') { state.customAnims = m.anims; if (view === 'comp' && compMode === 'anims') renderComp(); }
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
    <div class="tabs2">${[['browse', 'Browse'], ['create', 'Creation menu'], ['anims', 'Animations creator']].map(([m, l]) => `<button data-m="${m}" class="${compMode === m ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div id="comp-body"></div>`;
  for (const b of main.querySelectorAll('[data-m]')) b.onclick = () => { compMode = b.dataset.m; cancelAnimationFrame(raf); renderComp(); };
  if (compMode === 'browse') renderCompBrowse();
  else if (compMode === 'create') ensureAssets().then(renderCompCreate);
  else ensureAssets().then(renderCompAnims);
}
function renderCompBrowse() {
  $('#comp-body').innerHTML = `
    <div class="tabs2">${['items', 'creatures', 'weapons', 'fx', 'pets', 'spells'].map(t => `<button data-t="${t}" class="${compTab === t ? 'on' : ''}">${t}</button>`).join('')}
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
const MS_CATALOG = () => ({
  'Trees': Object.keys(MEDIA.trees || {}),
  'Ores & mining': Object.keys(NODES).filter(k => NODES[k].skill === 'mining'),
  'Fishing': Object.keys(NODES).filter(k => NODES[k].skill === 'fishing'),
  'Farming & hunter': Object.keys(NODES).filter(k => ['farming', 'hunter'].includes(NODES[k].skill)),
  'Agility & POI': Object.keys(NODES).filter(k => ['agility', 'archaeology'].includes(NODES[k].skill)),
  'Stations': ['anvil', 'furnace', 'range', 'loom', 'spinning_wheel', 'chapel_altar', 'bank_booth', 'ge_booth', 'campfire', 'well', 'obelisk', 'museum_bench', 'bakery_stall', 'gem_stall'],
  'Formations (pack)': ['rocks_grey', 'rocks_black', 'rocks_sand', 'spire_grey', 'spire_black', 'spire_sand', 'crag_grey', 'crag_black', 'crag_sand', 'dolmen_grey', 'mountain_grey_0', 'mountain_grey_1', 'mountain_grey_2', 'mountain_snow_0', 'mountain_snow_1', 'mountain_snow_2'],
  'Decor': ['signpost', 'grave', 'scarecrow', 'wash_line', 'shop_sign', 'dungeon_entrance', 'cliff_ladder', 'ge_rope'],
});
const MS = {
  vp: { x: 600, y: 420, z: 4 }, tool: 'pan', terrain: TILE.GRASS, elevDelta: +1,
  node: 'tree', brush: 1, level: null, mobMode: false, zoneSel: null,
  pending: { tiles: {}, elev: {}, nodes: {}, levels: {}, spawns: {} }, dirty: 0,
  base: null, baseRows: 0, drag: null, mouse: null, thumbs: new Map(), inited: false,
  view: '2d', isoR: null, isoFx: null, isoEnts: new Map(), isoDep: new Set(),
};
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
    const src = MEDIA.trees?.[type] ? null : nodeSprite(type);
    c = document.createElement('canvas'); c.width = 26; c.height = 26;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    if (src) g.drawImage(src, 0, 0, src.width, src.height, 0, 0, 26, 26);
    else { // tree image from media
      const tm = MEDIA.trees[type]; const im = tm && new Image();
      if (im) { im.src = tm.file.startsWith('assets') ? tm.file : 'assets/' + tm.file; im.onload = () => { const g2 = c.getContext('2d'); g2.imageSmoothingEnabled = false; g2.drawImage(im, 0, 0, 26, 26); }; }
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
      ${[['pan', '✋', 'Pan / inspect'], ['terrain', '🖌', 'Paint terrain'], ['elev', '⛰', 'Raise/lower ground'], ['node', '🌳', 'Place model'], ['erase', '⌫', 'Erase model'], ['mob', '👹', 'Mob mode'], ['view', '🎬', 'Rendered view — edit while seeing the world as the game draws it']].map(([t, ic, tip]) => `<button data-tool="${t}" title="${tip}" class="${(t === 'mob' ? MS.mobMode : t === 'view' ? MS.view === 'iso' : MS.tool === t && !MS.mobMode) ? 'on' : ''}">${ic}</button>`).join('')}
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
    else { MS.tool = b.dataset.tool; MS.mobMode = false; }
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
  $('#ms-discard').onclick = () => { MS.pending = { tiles: {}, elev: {}, nodes: {}, levels: {}, spawns: {} }; MS.base = null; MS.baseRows = 0; renderMapStudio(); };
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
  setTimeout(() => send({ t: 'spawnzones' }), 300);   // refresh zone list + census
  msSide();
}
function msZoom(f) { MS.vp.z = Math.max(1, Math.min(40, MS.vp.z * f)); }
function msScreenToTile(cv, mx, my) {
  if (MS.view === 'iso' && (!MS.level || MS.gateArm) && MS.isoR) {
    // invert the game's iso projection about the studio camera (elevation
    // lift is ignored — clicks on tall ground land a whisker south)
    const camWx = (MS.isoR.cam.x - MS.isoR.cam.y) * 32, camWy = (MS.isoR.cam.x + MS.isoR.cam.y) * 16;
    const wx = mx - cv.width / 2 + camWx, wy = my - cv.height / 2 + camWy;
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
    if (MS.tool === 'terrain') { MS.pending.tiles[k] = MS.terrain; msPatchBase(x, y); }
    else if (MS.tool === 'elev') {
      MS.pending.elev[k] = MS.elevDelta === 0 ? 0 : Math.max(0, Math.min(8, msElevAt(x, y) + MS.elevDelta));
      msPatchBase(x, y);
    }
    else if (MS.tool === 'node' && !MS.drag?.painted?.has(k)) { MS.pending.nodes[k] = MS.node; (MS.drag?.painted || new Set()).add?.(k); }
    else if (MS.tool === 'erase') MS.pending.nodes[k] = null;
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
    MS.drag = { mx, my, vx: MS.vp.x, vy: MS.vp.y, painted: new Set() };
    if (MS.tool !== 'pan') msApplyTool(cv, mx, my);
  };
  cv.onmousemove = (e) => {
    const r = cv.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    MS.mouse = [mx, my];
    if (!MS.drag) return;
    if (MS.tool === 'pan' || MS.mobMode) {
      const dmx = mx - MS.drag.mx, dmy = my - MS.drag.my;
      if (MS.view === 'iso' && (!MS.level || MS.gateArm)) { MS.vp.x = MS.drag.vx - (dmx / 64 + dmy / 32); MS.vp.y = MS.drag.vy - (dmy / 32 - dmx / 64); }
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
  raf = requestAnimationFrame(() => msLoop(cv));
}
// Rendered editing view: the world drawn by the ACTUAL game renderer (chunk
// bake, live water, falls, nodes, elevation), with every studio tool live on
// top. Pending edits glow as diamonds; Save rebakes so the render catches up.
function msDrawIso(cv) {
  if (!MS.isoR || MS.isoR.canvas !== cv) {
    MS.isoR = new Renderer(cv);
    MS.isoR.resize = () => {};        // the studio sizes its own canvas
    MS.isoR._elevOn = true;
    MS.isoFx = new Fx();
  }
  const R = MS.isoR;
  R.draw({
    entities: MS.isoEnts, fx: MS.isoFx, now: performance.now(), depletedNodes: MS.isoDep,
    me: { id: -1, rx: MS.vp.x, ry: MS.vp.y, x: MS.vp.x, y: MS.vp.y, plane: 0, hp: 1 },
  });
  const ctx = cv.getContext('2d');
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
        `  |  tool: ${MS.mobMode ? 'mob mode' : MS.tool}${MS.tool === 'node' ? ' (' + MS.node + ')' : ''}  |  pending edits glow — Save to bake them into the render${msPendingCount() ? `  |  ✎ ${msPendingCount()} unsaved` : ''}`;
    }
  }
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

connect();
render();

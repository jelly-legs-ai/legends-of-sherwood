// Sherwood Admin Studio: server terminal, economy audit, PDA-vault review,
// world-event designer and an asset compositor that renders every item, icon,
// creature (animated), FX and equipped weapon through the GAME'S OWN modules —
// what you preview here is exactly what ships.

import { ITEMS } from '/shared/data/items.js';
import { MOBS } from '/shared/data/mobs.js';
import { PETS } from '/shared/data/pets.js';
import { SPELLS, PRAYERS } from '/shared/data/skills.js';
import { loadMedia, MEDIA, drawCreature, drawFxSprite } from './media.js';
import { loadManifest, composite, drawChar } from './sprites.js';
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

const state = { status: null, ledger: null, vault: null, events: null, security: [], term: [] };
function onMsg(m) {
  if (m.t === 'status') { state.status = m; if (view === 'dash') render(); }
  else if (m.t === 'ledger') { state.ledger = m; if (view === 'eco') render(); }
  else if (m.t === 'vault') { state.vault = m; if (view === 'vault') render(); }
  else if (m.t === 'events') { state.events = m; if (view === 'events') render(); }
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
  if (view === 'vault') return renderVault();
  if (view === 'events') return renderEvents();
  if (view === 'comp') return renderComp();
}

function renderDash() {
  const s = state.status;
  main.innerHTML = `<h2>Realm dashboard</h2>
    <div class="cards">
      <div class="card"><b>${s ? s.players.length : '…'}</b><span>players online</span></div>
      <div class="card"><b>${s ? s.mobs : '…'}</b><span>mobs</span></div>
      <div class="card"><b>${s ? s.entities : '…'}</b><span>entities</span></div>
      <div class="card"><b>${s ? s.chests + '/' + s.geodes : '…'}</b><span>chests / geodes</span></div>
      <div class="card"><b style="color:var(--gold)">${s ? s.supply : '…'}</b><span>$SHL supply</span></div>
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
  main.innerHTML = `<h2>$Shilling economy</h2>
    <div class="cards">
      <div class="card"><b class="mint">${l ? l.log.filter(e => e[1] === 'mint').length : '…'}</b><span>mints (recent)</span></div>
      <div class="card"><b class="burn">${l ? l.log.filter(e => e[1] === 'burn').length : '…'}</b><span>burns (recent)</span></div>
      <div class="card"><b>${l ? Object.keys(l.balances).length : '…'}</b><span>accounts</span></div>
    </div>
    <h2>Audit log</h2>
    <table><tr><th>time</th><th>op</th><th>who</th><th>amt</th><th>reason</th></tr>
    ${l ? l.log.map(e => `<tr><td>${fmtT(e[0])}</td><td class="${e[1]}">${e[1]}</td><td>${e[2]}</td><td>${e[3]}</td><td>${e[4] || ''}</td></tr>`).join('') : ''}</table>
    <h2 style="margin-top:14px">Balances</h2>
    <table><tr><th>player</th><th>$SHL</th></tr>
    ${l ? Object.entries(l.balances).sort((a, b) => b[1] - a[1]).map(([n, v]) => `<tr><td>${n}</td><td>${v}</td></tr>`).join('') : ''}</table>`;
  if (!l) send({ t: 'ledger', n: 150 });
}

function renderVault() {
  const v = state.vault;
  main.innerHTML = `<h2>PDA Vault — Robinhood-chain withdrawals</h2>
    <p style="color:var(--dim);margin-bottom:12px">Flags: single withdrawal ≥ 500 $SHL · &gt;3 withdrawals per hour · any anti-cheat flag. Frozen transactions keep funds on the ledger and temp-ban the account until reviewed here.</p>
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
      <label style="justify-content:end"><button class="act" type="submit">Create / update</button></label>
    </form>
    <table><tr><th>id</th><th>name</th><th>where</th><th>cadence</th><th>state</th><th></th></tr>
    ${ev ? [...ev.builtin.map(e => ({ ...e, builtin: true })), ...ev.custom].map(e => `<tr>
      <td>${e.id}${e.builtin ? ' <span style="color:var(--dim)">(built-in)</span>' : ''}</td><td>${e.name}</td>
      <td>${e.x},${e.y}</td><td>every ${e.everyMin}m for ${e.durMin}m</td>
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
    info.textContent = JSON.stringify(ITEMS[sel.id], null, 1);
    g.imageSmoothingEnabled = false;
    g.drawImage(itemIcon(sel.id), 66, 36, 128, 128);
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
    const spec = s.proj?.startsWith('sheet:') ? s.proj.slice(6) : null;
    if (spec) { const loop = (now) => { g.clearRect(0, 0, 260, 200); drawFxSprite(g, spec, (now % 1600) / 1600, 130, 100, 170); if (compSel === sel) raf = requestAnimationFrame(loop); }; raf = requestAnimationFrame(loop); }
    return;
  }
  if (sel.kind === 'creature' || sel.kind === 'pet') {
    const def = sel.kind === 'pet' ? PETS[sel.id] : MOBS[sel.id];
    info.textContent = JSON.stringify(def, null, 1).slice(0, 900);
    const sheet = def.sheet, tint = def.tint;
    let anim = 'idle';
    const sels = document.createElement('div');
    sels.innerHTML = ['idle', 'walk', 'attack', 'special', 'death'].map(a => `<button class="act" data-a="${a}">${a}</button>`).join(' ');
    pv.appendChild(sels);
    for (const b of sels.querySelectorAll('button')) b.onclick = () => { anim = b.dataset.a; };
    const fake = { id: 7, dir: 2, hp: 1, tint, animStart: performance.now() };
    const loop = (now) => {
      g.clearRect(0, 0, 260, 200);
      if (sheet) {
        fake.anim = anim;
        if (anim === 'attack' || anim === 'special') { if (!fake._last || now - fake._last > 1400) { fake.animStart = now; fake._last = now; } }
        drawCreature(g, sheet, fake, anim, now, 130, 180, def.scale || 1);
      } else { g.fillStyle = '#8b949e'; g.font = '12px monospace'; g.fillText('procedural critter: ' + (def.critter || def.vis && 'LPC humanoid' || '?'), 20, 100); }
      if (compSel === sel) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return;
  }
  if (sel.kind === 'weapon') {
    const it = ITEMS[sel.id];
    info.textContent = JSON.stringify(it, null, 1);
    const vis = { sex: 'male', skin: 'light', hair: ['plain', 'dark_brown'], torso: ['tunic', 'green'], legs: ['pants', 'brown'], weapon: [it.vis.type, it.vis.color] };
    const comp = composite(vis);
    const loop = (now) => {
      g.clearRect(0, 0, 260, 200);
      g.imageSmoothingEnabled = false;
      const frame = Math.floor(now / 110) % 9;
      drawChar(g, comp, 'walk', 2, frame, 90, 170, 2);
      drawChar(g, comp, 'slash', 2, Math.floor(now / 120) % 6, 190, 170, 2);
      if (compSel === sel) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }
}

connect();
render();

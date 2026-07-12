// Dev chat commands: type // in chat for a full test harness with live
// autocomplete over item / mob / skill ids. Server side is --dev gated;
// on production servers the commands simply do nothing.

import { ITEMS } from '/shared/data/items.js';
import { MOBS } from '/shared/data/mobs.js';
import { SKILLS } from '/shared/constants.js';
import { chatLine } from './ui.js';

const $ = (s) => document.querySelector(s);

// arg types drive autocomplete: item | mob | skill | number | text
export const COMMANDS = {
  give: { args: ['item', 'number'], desc: 'give <item> [qty] — add an item to your pack' },
  find: { args: ['mob'], desc: 'find <mob|kind> — teleport to the nearest one (geode, chest, …)' },
  spawn: { args: ['mob', 'number'], desc: 'spawn <mob> [n] — spawn mobs at your feet' },
  tp: { args: ['number', 'number', 'number'], desc: 'tp <x> <y> [plane] — teleport to coordinates' },
  xp: { args: ['skill', 'number'], desc: 'xp <skill> <amount> — grant experience' },
  lvl: { args: ['skill', 'number'], desc: 'lvl <skill> <level> — set a skill level' },
  shl: { args: ['number'], desc: 'shl <amount> — mint $LoS' },
  heal: { args: [], desc: 'heal — restore hp/prayer/energy' },
  killtarget: { args: [], desc: 'killtarget — slay your current target' },
  items: { args: ['text'], desc: 'items <filter> — list matching item ids', local: true },
  mobs: { args: ['text'], desc: 'mobs <filter> — list matching mob ids', local: true },
  help: { args: [], desc: 'help — list all commands', local: true },
};

function pool(type) {
  if (type === 'item') return Object.keys(ITEMS);
  if (type === 'mob') return [...Object.keys(MOBS), 'geode', 'chest'];
  if (type === 'skill') return SKILLS;
  return [];
}

// ---------------- autocomplete ----------------
let box = null, matches = [], sel = 0, curInput = null;
function ensureBox() {
  if (box) return box;
  box = document.createElement('div');
  box.id = 'cmd-suggest';
  document.body.appendChild(box);
  return box;
}
function hide() { if (box) box.style.display = 'none'; matches = []; }

export function updateSuggestions(input) {
  curInput = input;
  const v = input.value;
  if (!v.startsWith('//')) return hide();
  const parts = v.slice(2).split(/\s+/);
  const cmd = parts[0] || '';
  let cands = [], prefixLen;
  if (parts.length <= 1) {                      // completing the command itself
    cands = Object.keys(COMMANDS).filter(c => c.startsWith(cmd.toLowerCase()));
    prefixLen = cmd.length;
  } else {                                      // completing an argument
    const spec = COMMANDS[cmd.toLowerCase()];
    if (!spec) return hide();
    const argIdx = parts.length - 2;
    const type = spec.args[Math.min(argIdx, spec.args.length - 1)];
    const cur = parts[parts.length - 1].toLowerCase();
    cands = pool(type).filter(id => id.includes(cur)).sort((a, b) => a.startsWith(cur) === b.startsWith(cur) ? a.localeCompare(b) : a.startsWith(cur) ? -1 : 1);
    prefixLen = cur.length;
  }
  matches = cands.slice(0, 9);
  sel = 0;
  if (!matches.length) return hide();
  const b = ensureBox();
  b.style.display = 'block';
  b.innerHTML = matches.map((m, i) =>
    `<div class="opt${i === sel ? ' sel' : ''}" data-i="${i}"><b>${m.slice(0, prefixLen)}</b>${m.slice(prefixLen)}${parts.length <= 1 && COMMANDS[m] ? `<span class="hint"> — ${COMMANDS[m].desc.split('—')[1] || ''}</span>` : ''}</div>`).join('');
  for (const el of b.querySelectorAll('.opt'))
    el.onmousedown = (e) => { e.preventDefault(); sel = +el.dataset.i; accept(); };
}
function accept() {
  if (!matches.length || !curInput) return;
  const v = curInput.value;
  const parts = v.slice(2).split(/\s+/);
  parts[parts.length - 1] = matches[sel];
  curInput.value = '//' + parts.join(' ') + (parts.length === 1 ? ' ' : ' ');
  updateSuggestions(curInput);
}
export function suggestKeydown(e) {
  if (!matches.length) return false;
  if (e.key === 'Tab' || (e.key === 'Enter' && matches.length && !e.target.value.endsWith(' ') && matches[sel] !== e.target.value.slice(2).split(/\s+/).pop())) {
    e.preventDefault(); accept(); return true;
  }
  if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % matches.length; refreshSel(); return true; }
  if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + matches.length - 1) % matches.length; refreshSel(); return true; }
  return false;
}
function refreshSel() {
  if (!box) return;
  box.querySelectorAll('.opt').forEach((el, i) => el.classList.toggle('sel', i === sel));
}
export function hideSuggestions() { hide(); }

// ---------------- execution ----------------
export function runCommand(G, v) {
  const parts = v.slice(2).trim().split(/\s+/);
  const cmd = (parts.shift() || '').toLowerCase();
  const spec = COMMANDS[cmd];
  if (!spec) { chatLine(`<span class="sys">Unknown command //${cmd} — try //help</span>`); return; }
  if (cmd === 'help') {
    for (const c of Object.values(COMMANDS)) chatLine(`<span class="sys">//${c.desc}</span>`);
    return;
  }
  if (cmd === 'items' || cmd === 'mobs') {
    const f = (parts[0] || '').toLowerCase();
    const src = cmd === 'items' ? Object.keys(ITEMS) : Object.keys(MOBS);
    const hits = src.filter(id => id.includes(f)).slice(0, 24);
    chatLine(`<span class="sys">${hits.length ? hits.join(', ') : 'no matches'}</span>`);
    return;
  }
  G.net.send({ t: 'devcmd', cmd, args: parts });
}

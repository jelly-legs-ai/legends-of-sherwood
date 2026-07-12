// Admin channel: powers the /admin dev-studio. Allowlisted terminal commands,
// economy/security log feeds, vault review, and a live world-event designer.
// Auth happens at the WebSocket upgrade (see server/index.js) — everything
// here assumes the socket already proved the admin key.

import fs from 'node:fs';
import path from 'node:path';
import { MSG } from '../../shared/constants.js';
import { ITEMS } from '../../shared/data/items.js';
import { MOBS } from '../../shared/data/mobs.js';
import { XP_TABLE, PLANE } from '../../shared/constants.js';

const HELP = [
  'players — list online players',
  'give <player> <item> [qty]',
  'shl <player> <amount> — mint $SHL',
  'xp <player> <skill> <amount>',
  'tp <player> <x> <y> — move a player',
  'heal <player>',
  'kick <player>',
  'ban <player> [hours] [reason…]',
  'unban <player>',
  'spawn <mob> <x> <y> [n]',
  'announce <message…>',
  'help',
];

export function loadCustomEvents(dataDir) {
  try { return JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8')).events || []; } catch { return []; }
}
export function saveCustomEvents(dataDir, events) {
  try { fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify({ events }, null, 1)); } catch (e) { console.error('[admin] config save', e.message); }
}

export function handleAdminMessage(world, ws, msg) {
  const send = (obj) => { try { ws.send(JSON.stringify(obj)); } catch { } };
  switch (msg.t) {
    case 'status': {
      let mobs = 0, chests = 0, geodes = 0;
      for (const e of world.entities.values()) {
        if (e.kind === 'mob') mobs++;
        else if (e.kind === 'chest') chests++;
        else if (e.kind === 'geode') geodes++;
      }
      return send({
        t: 'status',
        up: Math.floor(process.uptime()),
        players: [...world.players.keys()],
        entities: world.entities.size, mobs, chests, geodes,
        minted: world.ledger.minted, burned: world.ledger.burned,
        supply: world.ledger.minted - world.ledger.burned,
        bans: world.vault.bans, flags: Object.keys(world.vault.flags).length,
      });
    }
    case 'ledger':
      return send({ t: 'ledger', log: world.ledger.log.slice(-(msg.n || 120)).reverse(), balances: world.ledger.balances });
    case 'security':
      return send({ t: 'securityLog', log: world.vault.security.slice(-150).reverse() });
    case 'vault':
      if (msg.review) world.vault.review(msg.review | 0, !!msg.approve);
      return send({ t: 'vault', requests: world.vault.requests.slice(-150).reverse(), rules: { large: 500, freqN: 3 } });
    case 'events': {
      if (msg.create) {
        const e = msg.create;
        const ev = {
          id: String(e.id || 'custom_' + Date.now()).replace(/\W/g, '_').slice(0, 40),
          name: String(e.name || 'Unnamed Event').slice(0, 60),
          desc: String(e.desc || '').slice(0, 200),
          x: e.x | 0, y: e.y | 0, everyMin: Math.max(5, e.everyMin | 0 || 30), durMin: Math.max(1, e.durMin | 0 || 5),
          custom: true, mob: MOBS[e.mob] ? e.mob : null, n: Math.min(12, Math.max(0, e.n | 0)),
          shl: Math.min(50, Math.max(0, e.shl | 0)),
        };
        world.customEvents = world.customEvents.filter(x => x.id !== ev.id);
        world.customEvents.push(ev);
        saveCustomEvents(world.dataDir, world.customEvents);
        world.vault.alert('event', `admin created event '${ev.id}'`);
      }
      if (msg.remove) {
        world.customEvents = world.customEvents.filter(x => x.id !== msg.remove);
        delete world.eventState[msg.remove];
        saveCustomEvents(world.dataDir, world.customEvents);
      }
      if (msg.trigger) {
        const st = world.eventState[msg.trigger];
        if (st) { st.next = 0; st.active = false; }
        else world.eventState[msg.trigger] = { next: 0, until: 0 };
      }
      return send({ t: 'events', builtin: world.builtinEvents(), custom: world.customEvents, state: Object.fromEntries(Object.entries(world.eventState).map(([k, v]) => [k, { active: !!v.active }])) });
    }
    case 'cmd': return send({ t: 'cmd', out: runCommand(world, String(msg.line || '')) });
  }
}

function runCommand(world, line) {
  const [cmd, ...args] = line.trim().split(/\s+/);
  const P = (name) => world.players.get(name);
  try {
    switch ((cmd || '').toLowerCase()) {
      case 'help': return HELP.join('\n');
      case 'players': {
        const out = [...world.players.values()].map(p => `${p.name} — lvl ${p.combatLevel()} @ ${p.x | 0},${p.y | 0} plane ${p.plane} — ${world.ledger.balance(p.name)} $SHL`);
        return out.join('\n') || 'nobody online';
      }
      case 'give': {
        const p = P(args[0]); if (!p) return `no player '${args[0]}'`;
        if (!ITEMS[args[1]]) return `no item '${args[1]}'`;
        p.addItem(args[1], Math.max(1, parseInt(args[2]) || 1));
        return `gave ${args[2] || 1}× ${args[1]} to ${p.name}`;
      }
      case 'shl': {
        const p = args[0]; const amt = parseInt(args[1]) || 0;
        if (amt <= 0) return 'usage: shl <player> <amount>';
        world.ledger.mint(p, amt, 'admin');
        const pl = P(p); if (pl) world.send(pl, { t: MSG.TOKEN, bal: world.ledger.balance(p), delta: amt, reason: 'admin grant' });
        return `minted ${amt} $SHL to ${p}`;
      }
      case 'xp': {
        const p = P(args[0]); if (!p) return `no player '${args[0]}'`;
        p.addXp(args[1], Math.max(0, parseInt(args[2]) || 0));
        return `+${args[2]} ${args[1]} xp to ${p.name}`;
      }
      case 'tp': {
        const p = P(args[0]); if (!p) return `no player '${args[0]}'`;
        p.x = (parseInt(args[1]) || 0) + 0.5; p.y = (parseInt(args[2]) || 0) + 0.5;
        p.path = null; world.gridMove(p);
        world.send(p, { t: MSG.RESPAWN, x: p.x, y: p.y });
        return `warped ${p.name} to ${args[1]},${args[2]}`;
      }
      case 'heal': {
        const p = P(args[0]); if (!p) return `no player '${args[0]}'`;
        p.hp = p.maxHp; p.energy = 100;
        return `${p.name} restored`;
      }
      case 'kick': {
        const p = P(args[0]); if (!p) return `no player '${args[0]}'`;
        try { world.sockets.get(p.id)?.close(); } catch { }
        return `kicked ${p.name}`;
      }
      case 'ban': {
        const hours = parseFloat(args[1]) || 24;
        world.vault.tempBan(args[0], args.slice(2).join(' ') || 'admin ban', hours * 3600000);
        return `banned ${args[0]} for ${hours}h`;
      }
      case 'unban': world.vault.unban(args[0]); return `unbanned ${args[0]}`;
      case 'spawn': {
        if (!MOBS[args[0]]) return `no mob '${args[0]}'`;
        const n = Math.min(12, parseInt(args[3]) || 1);
        for (let i = 0; i < n; i++) world.spawnMob(args[0], { x: parseInt(args[1]) || 0, y: parseInt(args[2]) || 0, r: 2, n: 1 }, PLANE.OVERWORLD).noRespawn = true;
        return `spawned ${n}× ${args[0]}`;
      }
      case 'announce': world.announce('📣 ' + args.join(' ')); return 'announced';
      default: return `unknown command '${cmd}' — try help`;
    }
  } catch (e) { return 'error: ' + e.message; }
}

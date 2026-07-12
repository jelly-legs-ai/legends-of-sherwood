// Admin channel: powers the /admin dev-studio. Allowlisted terminal commands,
// economy/security log feeds, vault review, and a live world-event designer.
// Auth happens at the WebSocket upgrade (see server/index.js) — everything
// here assumes the socket already proved the admin key.

import fs from 'node:fs';
import path from 'node:path';
import { MSG, SHILLING, MILESTONE_LEVELS, MILESTONE_SHILLINGS } from '../../shared/constants.js';
import { ITEMS } from '../../shared/data/items.js';
import { MOBS } from '../../shared/data/mobs.js';
import { XP_TABLE, PLANE } from '../../shared/constants.js';

const HELP = [
  'players — list online players',
  'give <player> <item> [qty]',
  'los <player> <amount> — mint $LoS',
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
export function loadTokenConfig(dataDir) {
  try { return JSON.parse(fs.readFileSync(path.join(dataDir, 'token.json'), 'utf8')); }
  catch { return { migrated: false, symbol: SHILLING.SYMBOL, contract: '', treasuryAddress: '', mintAuthority: '', chain: 'robinhood' }; }
}
export function saveTokenConfig(dataDir, cfg) {
  try { fs.writeFileSync(path.join(dataDir, 'token.json'), JSON.stringify(cfg, null, 1)); } catch (e) { console.error('[admin] token save', e.message); }
}

// Build the on-chain deployment manifest the operator (or an automated deployer)
// applies: the ERC-20 constructor, treasury wiring and the PDA-vault bridge
// config, all derived from the migration inputs. Nothing here holds a private
// key — it describes WHAT to deploy, so signing stays with the operator.
function buildDeployManifest(cfg) {
  return {
    contract: 'contracts/LoS.sol',
    symbol: cfg.symbol || SHILLING.SYMBOL,
    name: 'Legends of Sherwood',
    decimals: 18,
    maxSupply: '21000000',
    chain: cfg.chain || 'robinhood',
    constructor: { treasury: cfg.mintAuthority || cfg.contract, protocolTreasury: cfg.treasuryAddress },
    vaultBridge: {
      tokenAddress: cfg.contract,
      mintAuthority: cfg.mintAuthority || cfg.contract,
      autoSettleUnder: 500,               // releases under the review threshold settle automatically
      reviewThreshold: 500,
      treasuryTaxBps: Math.round(SHILLING.GE_TREASURY_TAX * 10000),
    },
    steps: [
      'Deploy contracts/LoS.sol with the constructor args above.',
      'Call setProtocolTreasury(treasuryAddress).',
      'Grant the PDA vault mintAuthority as the game treasury (setTreasury → acceptTreasury).',
      'Point the vault bridge at tokenAddress; releases below the threshold auto-settle, the rest await admin review.',
    ],
  };
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
        treasury: world.ledger.treasuryBalance(),
        migrated: !!world.tokenConfig?.migrated,
        bans: world.vault.bans, flags: Object.keys(world.vault.flags).length,
      });
    }
    case 'ledger':
      return send({ t: 'ledger', log: world.ledger.log.slice(-(msg.n || 120)).reverse(), balances: world.ledger.balances });
    case 'token': {
      // $LoS migration: point the vault/contract at a launched token by address
      if (msg.migrate) {
        const m = msg.migrate;
        world.tokenConfig = {
          migrated: !!(m.contract || m.mintAuthority),
          symbol: (m.symbol || SHILLING.SYMBOL).slice(0, 12),
          contract: String(m.contract || '').slice(0, 80),
          treasuryAddress: String(m.treasuryAddress || '').slice(0, 80),
          mintAuthority: String(m.mintAuthority || '').slice(0, 80),
          chain: String(m.chain || 'robinhood').slice(0, 24),
          migratedAt: Date.now(),
        };
        saveTokenConfig(world.dataDir, world.tokenConfig);
        world.vault.tokenConfig = world.tokenConfig;
        world.vault.alert('token', `migration configured → ${world.tokenConfig.symbol} @ ${world.tokenConfig.contract || 'mint:' + world.tokenConfig.mintAuthority}`);
      }
      return send({ t: 'token', config: world.tokenConfig, manifest: buildDeployManifest(world.tokenConfig || {}) });
    }
    case 'treasury': {
      if (msg.buyback) world.ledger.treasuryBuyback(msg.buyback | 0);
      if (msg.creatorFrom && msg.creatorAmt) world.ledger.creatorTransfer(String(msg.creatorFrom).slice(0, 32), msg.creatorAmt | 0);
      const inflows = world.ledger.log.filter(l => l[1] === 'treasury').slice(-40).reverse();
      return send({ t: 'treasury', balance: world.ledger.treasuryBalance(), taxBps: Math.round(SHILLING.GE_TREASURY_TAX * 10000), inflows });
    }
    case 'simulate': return send({ t: 'simulate', result: runEconSim(world, msg.params || {}) });
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

// ---------------- economic simulation ----------------
// Projects the $LoS economy forward from the actual reward/sink constants and a
// handful of activity assumptions, so admins can gauge sustainability before a
// token launch: emission (faucets) vs sinks (GE tax to treasury, burns,
// player withdrawals to chain), circulating supply and treasury growth.
function runEconSim(world, p) {
  const players = Math.max(1, p.players | 0 || Math.max(50, world.players.size));
  const days = Math.min(365, Math.max(1, p.days | 0 || 30));
  const hoursPerDay = Math.max(0.1, +p.hoursPerDay || 2);
  const tradeVolPerPlayerDay = Math.max(0, p.tradeVolPerPlayerDay | 0 || 300);   // $LoS traded on the GE per active player/day
  const withdrawFrac = Math.min(1, Math.max(0, p.withdrawFrac ?? 0.25));          // fraction of earnings cashed out to chain
  const dailyBuyback = Math.max(0, p.dailyBuyback | 0 || 0);

  // Per-player-hour emission estimated from the reward constants + typical play.
  const em = {
    mobDrops: 40 * SHILLING.MOB_DROP_CHANCE_BASE * (1 + 40 / 12) * 1.5,           // ~kills/hr × rare-drop odds × avg amount
    bossBounty: 0.5 * SHILLING.BOSS_BOUNTY_BASE * 3,                              // ~½ boss/hr × base × avg tier
    dungeon: 1.5 * (SHILLING.DUNGEON_FLOOR_BASE + 5),                             // floor clears/hr (only some players dungeoneer)
    events: 0.3 * SHILLING.EVENT_PAYOUT_BASE,                                     // event payouts/hr
    milestones: 0.6,                                                              // amortised level-up milestones
  };
  const emissionPerPlayerHour = Object.values(em).reduce((a, b) => a + b, 0);

  const dailyEmission = players * hoursPerDay * emissionPerPlayerHour;
  const dailyGE = players * tradeVolPerPlayerDay;
  const dailyTax = dailyGE * SHILLING.GE_TREASURY_TAX;                            // to treasury (out of player circulation)
  const dailyBurnFees = dailyGE * SHILLING.GE_LISTING_FEE;                        // burned sink
  const dailyWithdraw = dailyEmission * withdrawFrac;                            // leaves the ledger for chain
  const dailySinks = dailyTax + dailyBurnFees + dailyWithdraw + dailyBuyback;
  const netDaily = dailyEmission - dailySinks;

  let circulating = world.ledger.minted - world.ledger.burned - world.ledger.treasuryBalance();
  let treasury = world.ledger.treasuryBalance();
  const series = [];
  for (let d = 1; d <= days; d++) {
    circulating += netDaily;
    treasury += dailyTax + dailyBuyback * 0;                                      // buyback burns, doesn't add to treasury
    if (d % Math.ceil(days / 12) === 0 || d === days) series.push({ day: d, circulating: Math.round(circulating), treasury: Math.round(treasury) });
  }
  // Annualise against the PROJECTED end supply (a bootstrapping economy starting
  // near zero would otherwise divide by ~0 and report absurd percentages).
  const inflationPct = circulating > 0 ? (netDaily * 365) / Math.max(circulating, dailyEmission * 30) * 100 : 0;
  const verdict = netDaily <= 0 ? 'DEFLATIONARY — sinks meet or exceed emission; supply is sustainable.'
    : netDaily < dailyEmission * 0.35 ? 'STABLE — mild net inflation, well within healthy bounds.'
      : 'INFLATIONARY — emission outpaces sinks; raise the GE tax, add sinks, or throttle rewards.';
  return {
    assumptions: { players, days, hoursPerDay, tradeVolPerPlayerDay, withdrawFrac, dailyBuyback },
    perPlayerHour: Math.round(emissionPerPlayerHour * 100) / 100,
    daily: {
      emission: Math.round(dailyEmission), tax: Math.round(dailyTax), burns: Math.round(dailyBurnFees),
      withdrawals: Math.round(dailyWithdraw), buyback: dailyBuyback, net: Math.round(netDaily),
    },
    series, endCirculating: Math.round(circulating), endTreasury: Math.round(treasury),
    annualisedInflationPct: Math.round(inflationPct * 10) / 10, verdict,
  };
}

function runCommand(world, line) {
  const [cmd, ...args] = line.trim().split(/\s+/);
  const P = (name) => world.players.get(name);
  try {
    switch ((cmd || '').toLowerCase()) {
      case 'help': return HELP.join('\n');
      case 'players': {
        const out = [...world.players.values()].map(p => `${p.name} — lvl ${p.combatLevel()} @ ${p.x | 0},${p.y | 0} plane ${p.plane} — ${world.ledger.balance(p.name)} $LoS`);
        return out.join('\n') || 'nobody online';
      }
      case 'give': {
        const p = P(args[0]); if (!p) return `no player '${args[0]}'`;
        if (!ITEMS[args[1]]) return `no item '${args[1]}'`;
        p.addItem(args[1], Math.max(1, parseInt(args[2]) || 1));
        return `gave ${args[2] || 1}× ${args[1]} to ${p.name}`;
      }
      case 'los': case 'shl': {
        const p = args[0]; const amt = parseInt(args[1]) || 0;
        if (amt <= 0) return 'usage: los <player> <amount>';
        world.ledger.mint(p, amt, 'admin');
        const pl = P(p); if (pl) world.send(pl, { t: MSG.TOKEN, bal: world.ledger.balance(p), delta: amt, reason: 'admin grant' });
        return `minted ${amt} $LoS to ${p}`;
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

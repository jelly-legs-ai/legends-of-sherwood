// PDA Vault: custodial gateway between the in-game $Shilling ledger and the
// Robinhood-chain payout queue. Every withdrawal passes the security screen —
// large or rapid-fire withdrawals and any anti-cheat flag freeze the
// transaction AND temp-ban the account pending review, with admins notified
// on the admin terminal and in game. Frozen funds never leave the ledger.

import fs from 'node:fs';
import path from 'node:path';
import { MSG } from '../../shared/constants.js';

export const VAULT_RULES = {
  LARGE: 500,                    // single withdrawal >= this flags
  FREQ_N: 3,                     // more than this many withdrawals...
  FREQ_WINDOW_MS: 60 * 60000,    // ...within this window flags
  BAN_MS: 24 * 3600000,          // temp-ban length pending investigation
  MIN: 5,                        // dust threshold
};

let nextReq = 1;

export class Vault {
  constructor(world, dataDir) {
    this.world = world;
    this.file = path.join(dataDir, 'vault.json');
    this.requests = [];            // {id, name, amount, address, t, status, reasons}
    this.bans = {};                // name -> {until, reason}
    this.flags = {};               // name -> [{t, reason}]
    this.security = [];            // audit trail of alerts
    this.load();
  }
  load() {
    try {
      const d = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.requests = d.requests || [];
      this.bans = d.bans || {};
      this.flags = d.flags || {};
      this.security = d.security || [];
      nextReq = d.nextReq || (this.requests.length + 1);
    } catch { /* first boot */ }
  }
  save() {
    try {
      if (this.security.length > 400) this.security = this.security.slice(-200);
      fs.writeFileSync(this.file, JSON.stringify({ requests: this.requests.slice(-500), bans: this.bans, flags: this.flags, security: this.security, nextReq }, null, 1));
    } catch (e) { console.error('[vault] save', e.message); }
  }

  // ---------------- security primitives ----------------
  isBanned(name) {
    const b = this.bans[name];
    if (!b) return null;
    if (b.until <= Date.now()) { delete this.bans[name]; this.save(); return null; }
    return b;
  }
  alert(kind, msg) {
    const entry = { t: Date.now(), kind, msg };
    this.security.push(entry);
    this.world.adminBroadcast?.({ t: 'security', entry });
    console.log(`[SECURITY] ${kind}: ${msg}`);
    this.save();
  }
  flagCheat(name, reason) {
    (this.flags[name] = this.flags[name] || []).push({ t: Date.now(), reason });
    this.alert('anticheat', `${name}: ${reason}`);
  }
  tempBan(name, reason, ms = VAULT_RULES.BAN_MS) {
    this.bans[name] = { until: Date.now() + ms, reason };
    const p = this.world.players.get(name);
    if (p) {
      this.world.send(p, { t: MSG.MSGBOX, m: `⚠ Your account has been temporarily suspended pending review: ${reason}` });
      const ws = this.world.sockets.get(p.id);
      setTimeout(() => { try { ws?.close(); } catch { } }, 800);
    }
    this.alert('ban', `${name} temp-banned ${Math.round(ms / 3600000)}h — ${reason}`);
  }
  unban(name) { delete this.bans[name]; this.alert('unban', `${name} unbanned by admin`); }

  // ---------------- withdrawals ----------------
  requestWithdraw(p, amount, address) {
    amount = Math.floor(amount);
    address = String(address || '').slice(0, 64);
    const bal = this.world.ledger.balance(p.name);
    if (!(amount >= VAULT_RULES.MIN)) return this.world.send(p, { t: MSG.MSGBOX, m: `Withdrawals start at ${VAULT_RULES.MIN} $SHL.` });
    if (amount > bal) return this.world.send(p, { t: MSG.MSGBOX, m: 'You do not hold that many $Shillings.' });
    if (!/^rh1[a-zA-Z0-9]{8,}$/.test(address)) return this.world.send(p, { t: MSG.MSGBOX, m: 'That is not a valid Robinhood-chain address (rh1…).' });

    const now = Date.now();
    const recent = this.requests.filter(r => r.name === p.name && now - r.t < VAULT_RULES.FREQ_WINDOW_MS);
    const reasons = [];
    if (amount >= VAULT_RULES.LARGE) reasons.push(`large withdrawal (${amount} $SHL)`);
    if (recent.length + 1 > VAULT_RULES.FREQ_N) reasons.push(`${recent.length + 1} withdrawals inside an hour`);
    if ((this.flags[p.name] || []).length) reasons.push('outstanding anti-cheat flags');

    const req = { id: nextReq++, name: p.name, amount, address, t: now, status: reasons.length ? 'frozen' : 'released', reasons };
    this.requests.push(req);

    if (req.status === 'frozen') {
      // funds stay on the ledger; the account is iced while admins investigate
      this.tempBan(p.name, reasons.join('; '));
      this.alert('vault', `FROZEN #${req.id}: ${p.name} → ${amount} $SHL to ${address} (${reasons.join('; ')})`);
      this.world.announce(`🛡 The Vault Wardens froze a suspicious transaction — the realm's treasury stands protected.`);
    } else {
      this.world.ledger.burn(p.name, amount, `vault:withdraw#${req.id}:${address}`);
      this.world.send(p, { t: MSG.TOKEN, bal: this.world.ledger.balance(p.name), delta: -amount, reason: 'withdrawn to chain' });
      this.world.send(p, { t: MSG.MSGBOX, kind: 'milestone', m: `✦ ${amount} $SHL queued for the Robinhood chain (${address.slice(0, 12)}…).` });
      this.alert('vault', `released #${req.id}: ${p.name} → ${amount} $SHL to ${address}`);
    }
    this.save();
    return req;
  }
  // Admin review of a frozen request
  review(id, approve) {
    const req = this.requests.find(r => r.id === id);
    if (!req || req.status !== 'frozen') return false;
    if (approve) {
      if (!this.world.ledger.burn(req.name, req.amount, `vault:withdraw#${req.id}:${req.address}`)) return false;
      req.status = 'released';
      this.unban(req.name);
      this.alert('vault', `admin APPROVED #${req.id}: ${req.name} → ${req.amount} $SHL`);
    } else {
      req.status = 'denied';
      this.alert('vault', `admin DENIED #${req.id}: ${req.name} (funds returned, ban stands)`);
    }
    this.save();
    return true;
  }
}

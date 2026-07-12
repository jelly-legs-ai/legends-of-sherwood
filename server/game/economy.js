// $LoS ledger (custodial, double-entry with audit log) + Grand Exchange.
// The ledger mirrors what contracts/Shilling.sol would do on-chain; a bridge
// would replay `log` entries as mint/burn/transfer calls.

import { SHILLING, MSG, GE } from '../../shared/constants.js';
import { ITEMS } from '../../shared/data/items.js';

export class Ledger {
  constructor(store) {
    this.store = store;
    this.balances = {};
    this.log = [];
    this.burned = 0;
    this.minted = 0;
    this._dirty = false;
  }
  // Populate from a loaded snapshot ({balances, log, burned, minted}).
  load(data) {
    if (data && typeof data === 'object') {
      this.balances = data.balances || {};
      this.log = Array.isArray(data.log) ? data.log : [];
      this.burned = data.burned || 0;
      this.minted = data.minted || 0;
    }
  }
  balance(who) { return this.balances[who] || 0; }
  mint(who, amt, reason) {
    amt = Math.floor(amt);
    if (amt <= 0) return;
    this.balances[who] = (this.balances[who] || 0) + amt;
    this.minted += amt;
    this.log.push([Date.now(), 'mint', who, amt, reason]);
  }
  burn(who, amt, reason) {
    amt = Math.floor(amt);
    if (amt <= 0 || this.balance(who) < amt) return false;
    this.balances[who] -= amt;
    this.burned += amt;
    this.log.push([Date.now(), 'burn', who, amt, reason]);
    return true;
  }
  transfer(from, to, amt, reason) {
    amt = Math.floor(amt);
    if (amt <= 0 || this.balance(from) < amt) return false;
    this.balances[from] -= amt;
    this.balances[to] = (this.balances[to] || 0) + amt;
    this.log.push([Date.now(), 'xfer', from + '>' + to, amt, reason]);
    return true;
  }
  async save() {
    if (this.log.length > 50000) this.log = this.log.slice(-20000);
    if (this.store) await this.store.saveLedger({ balances: this.balances, log: this.log, burned: this.burned, minted: this.minted });
  }
}

// ---------------- Grand Exchange ----------------
// Order book per item; offers escrow items (sell) or shillings (buy).
export class GrandExchange {
  constructor(world) {
    this.world = world;
    this.offers = new Map(); // offerId -> offer
    this.nextOffer = 1;
    this.history = {};       // itemId -> last price
  }
  playerOffers(name) { return [...this.offers.values()].filter(o => o.player === name); }

  place(p, type, itemId, qty, price) {
    qty = Math.floor(qty); price = Math.floor(price);
    const def = ITEMS[itemId];
    if (!def || !def.tradeable || qty < 1 || price < 1) return this.err(p, 'Invalid offer.');
    if (this.playerOffers(p.name).length >= GE.MAX_OFFERS) return this.err(p, 'Too many open offers.');
    const L = this.world.ledger;
    if (type === 'sell') {
      if (p.countItem(itemId) < qty) return this.err(p, "You don't have those.");
      p.removeItem(itemId, qty);
      // No upfront fee — the sink is taken from proceeds at match time so a
      // penniless player can always sell loot for their first $LoS.
    } else {
      const cost = qty * price;
      if (L.balance(p.name) < cost) return this.err(p, 'Not enough $LoS.');
      L.burn(p.name, cost, 'ge:escrow'); // escrowed (re-minted on cancel/fill)
    }
    const offer = { id: this.nextOffer++, player: p.name, type, item: itemId, qty, left: qty, price, filled: 0, escrow: type === 'buy' ? qty * price : 0 };
    this.offers.set(offer.id, offer);
    this.match(offer);
    this.sync(p);
    return offer;
  }
  match(offer) {
    const book = [...this.offers.values()].filter(o =>
      o.item === offer.item && o.type !== offer.type && o.left > 0 && o.player !== offer.player &&
      (offer.type === 'buy' ? o.price <= offer.price : o.price >= offer.price));
    book.sort((a, b) => offer.type === 'buy' ? a.price - b.price : b.price - a.price);
    for (const other of book) {
      if (offer.left <= 0) break;
      const n = Math.min(offer.left, other.left);
      const price = other.price; // maker's price
      const buy = offer.type === 'buy' ? offer : other;
      const sell = offer.type === 'sell' ? offer : other;
      buy.left -= n; buy.filled += n;
      sell.left -= n; sell.filled += n;
      this.history[offer.item] = price;
      // pay the seller from the buyer's escrow, minus the burned listing fee (sink)
      const proceeds = n * price;
      const fee = Math.floor(proceeds * SHILLING.GE_LISTING_FEE);
      this.world.ledger.mint(sell.player, proceeds - fee, `ge:sold:${offer.item}`);
      if (fee > 0) { this.world.ledger.log.push([Date.now(), 'burn', 'ge', fee, 'ge:fee']); this.world.ledger.burned += fee; }
      buy.escrow -= proceeds;
      // deliver items to buyer
      this.deliver(buy.player, offer.item, n);
      // refund buyer's overpay (their limit was >= maker price) when buy completes
      if (buy.left === 0 && buy.escrow > 0) { this.world.ledger.mint(buy.player, buy.escrow, 'ge:refund'); buy.escrow = 0; }
      for (const nm of [buy.player, sell.player]) {
        const pl = this.world.players.get(nm);
        if (pl) { this.world.send(pl, { t: MSG.MSGBOX, kind: 'ge', m: `GE: ${n} × ${ITEMS[offer.item].name} @ ${price} $LoS` }); this.sync(pl); }
      }
      if (other.left === 0 && other.escrow <= 0) this.offers.delete(other.id);
    }
    if (offer.left === 0 && offer.escrow <= 0) this.offers.delete(offer.id);
  }
  deliver(name, itemId, qty) {
    const pl = this.world.players.get(name);
    if (pl) {
      if (!pl.addItem(itemId, qty)) { pl.bank[itemId] = (pl.bank[itemId] || 0) + qty; this.world.send(pl, { t: MSG.MSGBOX, m: 'GE purchase sent to your bank.' }); }
    } else {
      const saved = this.world.saved[name];
      if (saved) {
        saved.bank = saved.bank || {};
        saved.bank[itemId] = (saved.bank[itemId] || 0) + qty;
        // durably persist the offline recipient's bank so the purchase can't be lost
        if (this.world.store) this.world.store.savePlayer(name, saved).catch(() => {});
      }
    }
  }
  cancel(p, offerId) {
    const o = this.offers.get(offerId);
    if (!o || o.player !== p.name) return;
    if (o.type === 'sell') { if (!p.addItem(o.item, o.left)) { p.bank[o.item] = (p.bank[o.item] || 0) + o.left; } }
    else if (o.escrow > 0) this.world.ledger.mint(p.name, o.escrow, 'ge:cancel');
    this.offers.delete(offerId);
    this.sync(p);
  }
  sync(p) {
    this.world.send(p, {
      t: 'ge', offers: this.playerOffers(p.name), bal: this.world.ledger.balance(p.name),
      prices: this.history,
    });
  }
  err(p, m) { this.world.send(p, { t: MSG.MSGBOX, kind: 'ge', m }); return null; }
}

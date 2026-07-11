// Durable persistence with backups and corruption recovery.
//
// Player data is the one thing we must never lose. This module provides a
// single `Store` interface with two backends chosen automatically:
//
//   1. PostgreSQL  — used when DATABASE_URL is set (e.g. Replit's managed
//      PostgreSQL, which itself does continuous backups / point-in-time
//      restore). Each player is one row (JSONB), written in its own
//      transaction, so a bad write can never corrupt other players.
//
//   2. Hardened file store — the zero-dependency default. Each player is one
//      file, written atomically (temp file + fsync + atomic rename) so a crash
//      mid-write can never leave a torn file. A rotating set of timestamped
//      full backups is kept, and if any record fails to parse on load it is
//      quarantined and auto-recovered from the newest backup that parses.
//
// Both backends share the same async API used by world.js / economy.js.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const BACKUP_KEEP = 24;            // rotating full backups to retain
const BACKUP_INTERVAL_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
export async function createStore(dataDir) {
  if (process.env.DATABASE_URL) {
    try {
      const store = new PgStore(process.env.DATABASE_URL, dataDir);
      await store.init();
      console.log('[store] using PostgreSQL (DATABASE_URL) with managed backups');
      return store;
    } catch (e) {
      console.error('[store] PostgreSQL unavailable, falling back to file store:', e.message);
    }
  }
  const store = new FileStore(dataDir);
  await store.init();
  console.log('[store] using hardened file store with rotating backups at', store.dir);
  return store;
}

function isValidPlayer(d) {
  return d && typeof d === 'object' && d.xp && typeof d.xp === 'object' && Array.isArray(d.inv);
}

// ---------------------------------------------------------------------------
// Hardened file store
// ---------------------------------------------------------------------------
class FileStore {
  constructor(dataDir) {
    this.dir = dataDir;
    this.playersDir = path.join(dataDir, 'players');
    this.backupsDir = path.join(dataDir, 'backups');
    this.metaFile = path.join(dataDir, 'meta.json');
    this.ledgerFile = path.join(dataDir, 'ledger.json');
    this._writing = new Map(); // name -> queued write promise (serialise per player)
  }

  async init() {
    for (const d of [this.dir, this.playersDir, this.backupsDir]) await fsp.mkdir(d, { recursive: true });
    // migrate a legacy single players.json into per-player files
    const legacy = path.join(this.dir, 'players.json');
    if (fs.existsSync(legacy) && !fs.existsSync(path.join(this.playersDir, '.migrated'))) {
      try {
        const all = JSON.parse(await fsp.readFile(legacy, 'utf8'));
        for (const [name, data] of Object.entries(all)) {
          if (name === '__houseIdx') { await this._atomicWrite(this.metaFile, JSON.stringify({ houseIdx: data })); continue; }
          if (isValidPlayer(data)) await this.savePlayer(name, data);
        }
        await fsp.writeFile(path.join(this.playersDir, '.migrated'), '1');
        await fsp.rename(legacy, legacy + '.imported');
        console.log('[store] migrated legacy players.json to per-player files');
      } catch (e) { console.error('[store] legacy migration failed:', e.message); }
    }
    this._backupTimer = setInterval(() => this.backup().catch(() => {}), BACKUP_INTERVAL_MS);
    if (this._backupTimer.unref) this._backupTimer.unref();
  }

  _safeName(name) { return encodeURIComponent(name).replace(/[^a-zA-Z0-9_%.-]/g, '_'); }
  _playerFile(name) { return path.join(this.playersDir, this._safeName(name) + '.json'); }

  // Atomic write: temp file in same dir, fsync, then rename over the target.
  async _atomicWrite(file, contents) {
    const tmp = file + '.' + process.pid + '.' + Date.now() + '.tmp';
    const fh = await fsp.open(tmp, 'w');
    try {
      await fh.writeFile(contents);
      await fh.sync();               // flush to disk before rename
    } finally { await fh.close(); }
    await fsp.rename(tmp, file);      // atomic on POSIX and Windows
  }

  async loadPlayers() {
    const out = {};
    let files = [];
    try { files = (await fsp.readdir(this.playersDir)).filter(f => f.endsWith('.json')); } catch { }
    for (const f of files) {
      const full = path.join(this.playersDir, f);
      const rec = await this._loadRecordWithRecovery(full, f, isValidPlayer);
      if (rec) out[decodeURIComponent(f.replace(/\.json$/, ''))] = rec;
    }
    // meta (house indices)
    let houseIdx = {};
    const meta = await this._loadRecordWithRecovery(this.metaFile, 'meta.json', d => d && typeof d === 'object');
    if (meta && meta.houseIdx) houseIdx = meta.houseIdx;
    return { players: out, houseIdx };
  }

  // Parse a JSON record; on failure, hunt through newest→oldest backups for a
  // version that parses and restore it, so one torn file never loses the record.
  async _loadRecordWithRecovery(fullPath, relName, validate) {
    try {
      const raw = await fsp.readFile(fullPath, 'utf8');
      const d = JSON.parse(raw);
      if (validate(d)) return d;
      throw new Error('failed validation');
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      console.error(`[store] record ${relName} unreadable (${e.message}); attempting backup recovery`);
      const recovered = await this._recoverFromBackups(relName, validate);
      if (recovered) {
        try { await this._atomicWrite(fullPath, JSON.stringify(recovered)); } catch { }
        console.log(`[store] recovered ${relName} from backup`);
        return recovered;
      }
      // quarantine the corrupt file so it isn't re-read as valid later
      try { await fsp.rename(fullPath, fullPath + '.corrupt.' + Date.now()); } catch { }
      console.error(`[store] could not recover ${relName}; quarantined`);
      return null;
    }
  }

  async _recoverFromBackups(relName, validate) {
    let dirs = [];
    try { dirs = (await fsp.readdir(this.backupsDir)).filter(d => /^\d+/.test(d)).sort().reverse(); } catch { return null; }
    const sub = relName === 'meta.json' || relName === 'ledger.json' ? '' : 'players';
    for (const d of dirs) {
      const p = path.join(this.backupsDir, d, sub, relName);
      try {
        const raw = await fsp.readFile(p, 'utf8');
        const parsed = JSON.parse(raw);
        if (validate(parsed)) return parsed;
      } catch { }
    }
    return null;
  }

  async savePlayer(name, data) {
    if (!isValidPlayer(data)) { console.error('[store] refusing to save invalid record for', name); return; }
    // serialise writes per player to avoid interleaving temp files
    const prev = this._writing.get(name) || Promise.resolve();
    const next = prev.catch(() => {}).then(() => this._atomicWrite(this._playerFile(name), JSON.stringify(data)));
    this._writing.set(name, next);
    try { await next; } finally { if (this._writing.get(name) === next) this._writing.delete(name); }
  }

  async saveMeta(houseIdx) { await this._atomicWrite(this.metaFile, JSON.stringify({ houseIdx })); }

  async loadLedger() {
    const d = await this._loadRecordWithRecovery(this.ledgerFile, 'ledger.json', x => x && typeof x === 'object' && x.balances);
    return d || { balances: {}, log: [], burned: 0, minted: 0 };
  }
  async saveLedger(obj) { await this._atomicWrite(this.ledgerFile, JSON.stringify(obj)); }

  // Full snapshot into backups/<timestamp>/, keeping the most recent BACKUP_KEEP.
  async backup() {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(this.backupsDir, stamp);
    await fsp.mkdir(path.join(dest, 'players'), { recursive: true });
    try {
      const files = (await fsp.readdir(this.playersDir)).filter(f => f.endsWith('.json'));
      for (const f of files) await fsp.copyFile(path.join(this.playersDir, f), path.join(dest, 'players', f));
      for (const f of ['meta.json', 'ledger.json']) {
        const src = path.join(this.dir, f);
        if (fs.existsSync(src)) await fsp.copyFile(src, path.join(dest, f));
      }
    } catch (e) { console.error('[store] backup error:', e.message); }
    // rotate
    try {
      const dirs = (await fsp.readdir(this.backupsDir)).filter(d => /^\d/.test(d)).sort();
      while (dirs.length > BACKUP_KEEP) {
        const old = dirs.shift();
        await fsp.rm(path.join(this.backupsDir, old), { recursive: true, force: true });
      }
    } catch { }
    return dest;
  }

  async close() { if (this._backupTimer) clearInterval(this._backupTimer); await this.backup().catch(() => {}); }
}

// ---------------------------------------------------------------------------
// PostgreSQL store (Replit managed DB, or any Postgres via DATABASE_URL)
// ---------------------------------------------------------------------------
class PgStore {
  constructor(url, dataDir) { this.url = url; this.dir = dataDir; }

  async init() {
    const { default: pg } = await import('pg');
    const ssl = /localhost|127\.0\.0\.1/.test(this.url) ? false : { rejectUnauthorized: false };
    this.pool = new pg.Pool({ connectionString: this.url, ssl, max: 4 });
    await this.pool.query('SELECT 1'); // fail fast if unreachable
    await this.pool.query(`CREATE TABLE IF NOT EXISTS players (
      name TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await this.pool.query(`CREATE TABLE IF NOT EXISTS kv (
      k TEXT PRIMARY KEY, v JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    // A safety-net second copy of every player write, append-only, for auditing / recovery.
    await this.pool.query(`CREATE TABLE IF NOT EXISTS player_history (
      id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, data JSONB NOT NULL, saved_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    // Self-check: prove we can actually write and read a player round-trip before
    // trusting this backend. If anything is wrong, throw so the factory falls
    // back to the hardened file store rather than risk silent data loss.
    const probe = { xp: { _probe: 1 }, inv: [], __probe: true };
    await this.savePlayer('__healthcheck__', probe);
    const back = await this.pool.query('SELECT data FROM players WHERE name=$1', ['__healthcheck__']);
    if (!back.rows[0] || !back.rows[0].data || back.rows[0].data.xp._probe !== 1) throw new Error('write/read self-check failed');
    await this.pool.query('DELETE FROM players WHERE name=$1', ['__healthcheck__']);
    await this.pool.query('DELETE FROM player_history WHERE name=$1', ['__healthcheck__']);
    // migrate legacy file data if the DB is empty
    const { rows } = await this.pool.query('SELECT count(*)::int AS n FROM players');
    if (rows[0].n === 0) await this._migrateFromFiles();
  }

  async _migrateFromFiles() {
    const legacy = path.join(this.dir, 'players.json');
    const perDir = path.join(this.dir, 'players');
    try {
      if (fs.existsSync(legacy)) {
        const all = JSON.parse(fs.readFileSync(legacy, 'utf8'));
        for (const [name, data] of Object.entries(all)) {
          if (name === '__houseIdx') { await this.saveMeta(data); continue; }
          if (isValidPlayer(data)) await this.savePlayer(name, data);
        }
        console.log('[store] migrated legacy players.json into PostgreSQL');
      } else if (fs.existsSync(perDir)) {
        for (const f of fs.readdirSync(perDir)) {
          if (!f.endsWith('.json')) continue;
          try { const d = JSON.parse(fs.readFileSync(path.join(perDir, f), 'utf8')); if (isValidPlayer(d)) await this.savePlayer(decodeURIComponent(f.replace(/\.json$/, '')), d); } catch { }
        }
        console.log('[store] migrated per-player files into PostgreSQL');
      }
    } catch (e) { console.error('[store] pg migration:', e.message); }
  }

  async loadPlayers() {
    const out = {};
    const { rows } = await this.pool.query('SELECT name, data FROM players');
    for (const r of rows) if (isValidPlayer(r.data)) out[r.name] = r.data;
    let houseIdx = {};
    const m = await this.pool.query(`SELECT v FROM kv WHERE k='houseIdx'`);
    if (m.rows[0]) houseIdx = m.rows[0].v;
    return { players: out, houseIdx };
  }
  async savePlayer(name, data) {
    if (!isValidPlayer(data)) return;
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`INSERT INTO players(name,data,updated_at) VALUES($1,$2,now())
        ON CONFLICT(name) DO UPDATE SET data=$2, updated_at=now()`, [name, data]);
      await c.query('INSERT INTO player_history(name,data) VALUES($1,$2)', [name, data]);
      await c.query('COMMIT');
    } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  }
  async saveMeta(houseIdx) {
    await this.pool.query(`INSERT INTO kv(k,v,updated_at) VALUES('houseIdx',$1,now())
      ON CONFLICT(k) DO UPDATE SET v=$1, updated_at=now()`, [houseIdx]);
  }
  async loadLedger() {
    const r = await this.pool.query(`SELECT v FROM kv WHERE k='ledger'`);
    return r.rows[0] ? r.rows[0].v : { balances: {}, log: [], burned: 0, minted: 0 };
  }
  async saveLedger(obj) {
    await this.pool.query(`INSERT INTO kv(k,v,updated_at) VALUES('ledger',$1,now())
      ON CONFLICT(k) DO UPDATE SET v=$1, updated_at=now()`, [obj]);
  }
  async backup() {
    // Managed Postgres (Replit/Neon) does continuous backups; also prune history.
    try { await this.pool.query(`DELETE FROM player_history WHERE saved_at < now() - interval '7 days'`); } catch { }
    return 'postgres-managed';
  }
  async close() { if (this.pool) await this.pool.end().catch(() => {}); }
}

// Legends of Sherwood — server entry: static file host + WebSocket gateway.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { World } from './game/world.js';
import { handleMessage, onDisconnect, installHooks } from './game/handlers.js';
import { handleAdminMessage, wireCustomSources, unwireCustomSources } from './game/admin.js';
import { applyMapOverrides } from '../shared/mapgen.js';
import { registerCustomItems } from '../shared/data/items.js';
import { armCustomAnims } from '../shared/data/mobs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 8123;
// Admin studio auth: explicit key in production, 'dev' under --dev.
const ADMIN_KEY = process.env.ADMIN_KEY || (process.argv.includes('--dev') ? 'dev' : null);
const adminOk = (u) => ADMIN_KEY && new URL(u, 'http://x').searchParams.get('key') === ADMIN_KEY;
const HOST = process.env.HOST || '0.0.0.0'; // bind all interfaces (required on Replit)

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.csv': 'text/csv', '.txt': 'text/plain',
};

const server = http.createServer((req, res) => {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (req.method === 'POST' && url === '/debug/shot' && process.argv.includes('--dev')) {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 20e6) req.destroy(); });
    req.on('end', () => {
      try {
        const b64 = body.replace(/^data:image\/\w+;base64,/, '');
        fs.writeFileSync(path.join(ROOT, 'data', 'shot.png'), Buffer.from(b64, 'base64'));
        res.writeHead(200); res.end('ok');
      } catch { res.writeHead(400); res.end('bad'); }
    });
    return;
  }
  // Dev asset pipeline: browser-side packer reads raw packs from /rawassets and
  // writes finished sheets into client/assets via /debug/save.
  if (req.method === 'POST' && url === '/debug/save' && process.argv.includes('--dev')) {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 40e6) req.destroy(); });
    req.on('end', () => {
      try {
        const { file, dataUrl } = JSON.parse(body);
        const safe = String(file).replace(/\.\./g, '');
        const dest = path.normalize(path.join(ROOT, 'client', 'assets', safe));
        if (!dest.startsWith(path.join(ROOT, 'client', 'assets'))) { res.writeHead(403); return res.end('no'); }
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, Buffer.from(dataUrl.replace(/^data:\w+\/\w+;base64,/, ''), 'base64'));
        res.writeHead(200); res.end('ok');
      } catch (e) { res.writeHead(400); res.end(String(e.message)); }
    });
    return;
  }
  // Deploy a gear-sheet weapon straight into the live game: save its compiled
  // LPC sheet(s), register the statted equippable item, and wire its drop / craft
  // sources. Key-gated (works in production, not just --dev). HTTP (not the WS)
  // because the sheet PNGs exceed the admin socket's payload cap.
  if (req.method === 'POST' && url === '/admin/deploy-gear') {
    if (!adminOk(req.url)) { res.writeHead(403); return res.end('admin key required (?key=…)'); }
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 40e6) req.destroy(); });
    req.on('end', () => {
      try {
        const { spec, sheets } = JSON.parse(body);
        const id = String(spec.id || spec.name || 'gear').toLowerCase().replace(/\W+/g, '_').slice(0, 40);
        if (!id) { res.writeHead(400); return res.end('bad id'); }
        // sheets land beside every other equipment sheet, in a TRACKED folder, so
        // deployed gear is committed and ships like the built-in weapons
        const saved = {};
        for (const [tgt, dataUrl] of Object.entries(sheets || {})) {
          if (typeof dataUrl !== 'string' || !/^data:image\/png;base64,/.test(dataUrl)) continue;
          const file = `deployed/${id}_${String(tgt).replace(/\W+/g, '')}.png`;
          const dest = path.join(ROOT, 'client', 'assets', 'lpc', file);
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, Buffer.from(dataUrl.replace(/^data:\w+\/\w+;base64,/, ''), 'base64'));
          saved[tgt] = file;
        }
        if (!saved.carry) { res.writeHead(400); return res.end('a Walk/carry sheet is required'); }
        const g = spec.gear || {};
        const entry = {
          name: String(spec.name || id).slice(0, 60), value: Math.max(1, spec.value | 0),
          gear: { slot: 'weapon', kind: g.kind || 'sword', style: g.style || 'melee', anim: g.anim || 'slash',
            twoHand: !!g.twoHand, speed: g.speed || 2400, color: g.color || 'steel', level: g.level | 0,
            bonus: g.bonus || {}, req: g.req || {}, sheets: saved },
          sources: {
            drops: Array.isArray(spec.sources?.drops) ? spec.sources.drops.slice(0, 24) : [],
            craft: spec.sources?.craft || null,
            quest: spec.sources?.quest || null,
          },
        };
        world.deployedGear[id] = entry;
        registerCustomItems({ [id]: entry });
        unwireCustomSources(id); wireCustomSources(entry, id);
        // the spec is written to a TRACKED source file (shared/data), so committing
        // it ships the item the same way the rest of the equipment database does
        fs.writeFileSync(DEPLOYED_GEAR, JSON.stringify(world.deployedGear, null, 1));
        for (const ws of world.adminSockets) { try { ws.send(JSON.stringify({ t: 'deployedGear', gear: world.deployedGear })); } catch { } }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, id, sheets: saved }));
      } catch (e) { res.writeHead(400); res.end(String(e.message)); }
    });
    return;
  }
  if (url.startsWith('/rawassets/') && process.argv.includes('--dev')) {
    const rel = decodeURIComponent(url.slice('/rawassets/'.length));
    const file = path.normalize(path.join(ROOT, 'model assets', rel));
    if (!file.startsWith(path.join(ROOT, 'model assets'))) { res.writeHead(403); return res.end('no'); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('nf'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
    return;
  }
  // Live world data authored in the admin studio: map overrides + custom
  // items/anims. Served to every game client so both sides share one world.
  if (url === '/map-overrides.json' || url === '/custom-items.json' || url === '/custom-anims.json') {
    return fs.readFile(path.join(DATA_DIR, url.slice(1)), (err, data) => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      res.end(err ? '{}' : data);
    });
  }
  // Admin dev-studio (key-gated; the page itself holds no secrets)
  if (url === '/admin') {
    if (!adminOk(req.url)) { res.writeHead(403); return res.end('admin key required (?key=…)'); }
    return fs.readFile(path.join(ROOT, 'client', 'admin.html'), (err, data) => {
      if (err) { res.writeHead(404); return res.end('nf'); }
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  }
  if (url === '/') url = '/client/index.html';
  if (!/^\/(client|shared)\//.test(url)) url = '/client' + url; // page-relative assets
  const file = path.normalize(path.join(ROOT, url));
  if (!file.startsWith(ROOT) || !/^[/\\](client|shared)[/\\]/.test(url)) {
    res.writeHead(403); res.end('forbidden'); return;
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const DEPLOYED_GEAR = path.join(ROOT, 'shared', 'data', 'deployed-gear.json');   // tracked source file
const world = new World(DATA_DIR);
// Map Studio overrides + custom content authored in the admin studio apply
// BEFORE init() so collision, nodes, levels and authored spawn zones are all
// in force when the world first spawns its mobs.
const loadJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
world.mapOverrides = loadJson(path.join(DATA_DIR, 'map-overrides.json')) || { tiles: {}, elev: {}, nodes: {}, levels: {}, spawns: {} };
world.mapOverrides.spawns = world.mapOverrides.spawns || {};
applyMapOverrides(world.mapOverrides);
world.customItems = loadJson(path.join(DATA_DIR, 'custom-items.json')) || {};
registerCustomItems(world.customItems);
// Deployed gear-sheet weapons live in a TRACKED source file (committed + shipped
// like the built-in equipment), separate from the runtime cosmetic customs.
world.deployedGear = loadJson(DEPLOYED_GEAR) || {};
registerCustomItems(world.deployedGear);
for (const [id, e] of Object.entries(world.deployedGear)) if (e && e.gear) wireCustomSources(e, id);
world.customAnims = loadJson(path.join(DATA_DIR, 'custom-anims.json')) || {};
armCustomAnims(world.customAnims);   // studio projectiles fight for real
await world.init();          // load durable store (Postgres or hardened files) before serving
installHooks(world);
world.start();

const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });
wss.on('connection', (ws, req) => {
  // admin studio channel: separate path, key-gated at upgrade time
  if ((req.url || '').startsWith('/adminws')) {
    if (!adminOk(req.url)) { ws.close(); return; }
    world.adminSockets.add(ws);
    ws.on('message', (buf) => {
      let msg;
      try { msg = JSON.parse(buf.toString()); } catch { return; }
      try { handleAdminMessage(world, ws, msg); } catch (e) { console.error('admin handler:', e); }
    });
    ws.on('close', () => world.adminSockets.delete(ws));
    ws.on('error', () => {});
    return;
  }
  ws.rateBucket = 40;
  ws.on('message', (buf) => {
    if (--ws.rateBucket < 0) return;               // flood guard, refilled each tick
    let msg;
    try { msg = JSON.parse(buf.toString()); } catch { return; }
    try { handleMessage(world, ws, msg); } catch (e) { console.error('handler error:', e); }
  });
  ws.on('close', () => onDisconnect(world, ws));
  ws.on('error', () => {});
});
setInterval(() => { for (const c of wss.clients) c.rateBucket = 40; }, 1000);

server.listen(PORT, HOST, () => {
  console.log(`Legends of Sherwood listening on http://${HOST}:${PORT}`);
  console.log(`World seed ${world.seed}; ${world.mobCount()} mobs stalking the realm.`);
});

let closing = false;
async function gracefulExit() {
  if (closing) return;
  closing = true;
  console.log('[shutdown] saving world…');
  try { await world.shutdown(); } catch (e) { console.error('[shutdown]', e.message); }
  process.exit(0);
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, gracefulExit);
process.on('uncaughtException', (e) => { console.error('uncaught:', e); world.saveAll().finally(() => process.exit(1)); });

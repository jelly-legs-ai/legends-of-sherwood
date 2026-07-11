// Legends of Sherwood — server entry: static file host + WebSocket gateway.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { World } from './game/world.js';
import { handleMessage, onDisconnect, installHooks } from './game/handlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 8123;
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
const world = new World(DATA_DIR);
await world.init();          // load durable store (Postgres or hardened files) before serving
installHooks(world);
world.start();

const wss = new WebSocketServer({ server, maxPayload: 16 * 1024 });
wss.on('connection', (ws) => {
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

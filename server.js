'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { Game } = require('./src/game');
const OST = require('./public/js/shared.js');

const PORT = Number(process.env.PORT) || 8080;
const HOST = '0.0.0.0';
const PUBLIC = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.json': 'application/json'
};

const game = new Game();
const sockets = new Map(); // ws -> playerId

function send(ws, obj) {
  if (ws.readyState === 1) {
    try { ws.send(JSON.stringify(obj)); } catch (_) { /* ignore */ }
  }
}

function broadcast(obj) {
  const s = JSON.stringify(obj);
  for (const ws of sockets.keys()) {
    if (ws.readyState === 1) {
      try { ws.send(s); } catch (_) { /* ignore */ }
    }
  }
}

function syncMeta() {
  for (const [ws, id] of sockets) send(ws, game.hello(id));
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  if (urlPath.includes('..')) {
    res.writeHead(400); res.end(); return;
  }
  const file = path.join(PUBLIC, urlPath);
  if (!file.startsWith(PUBLIC)) {
    res.writeHead(403); res.end(); return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' || ext === '.js' || ext === '.css' ? 'no-cache' : 'public, max-age=86400'
    });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  const id = game.connect();
  sockets.set(ws, id);
  send(ws, game.hello(id));

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    const before = game.phase;
    game.handle(id, msg);
    if (msg.t === 'cmd') return;
    syncMeta();
    if (game.phase === 'playing' && before !== 'playing') {
      broadcast(game.serialize());
    }
  });

  ws.on('close', () => {
    sockets.delete(ws);
    game.disconnect(id);
    syncMeta();
  });

  ws.on('error', () => { /* ignore */ });
});

setInterval(() => {
  if (game.phase !== 'playing' && game.phase !== 'ended') return;
  if (game.phase === 'playing') game.tick(1 / OST.TICK);
    const snap = JSON.stringify(game.serialize());
    for (const [ws, id] of sockets) {
      if (game.canSee(id) && ws.readyState === 1) {
        try { ws.send(snap); } catch (_) { /* ignore */ }
      }
    }
    if (game.phase === 'ended') {
    // allow victory screen, then reset after a few seconds of ticks
    if (game.endedAt && Date.now() - game.endedAt > 14000) {
      game.resetMenu();
      syncMeta();
    }
  }
}, 1000 / OST.TICK);

server.listen(PORT, HOST, () => {
  console.log('OSTFRONT http://' + HOST + ':' + PORT);
});

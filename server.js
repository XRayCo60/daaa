'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

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

const room = { next: 1, hostId: null, cmds: [], snap: { hellos: {}, state: null } };

function json(res, obj, code) {
  const s = JSON.stringify(obj);
  res.writeHead(code || 200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(s);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); }
      catch { resolve({}); }
    });
  });
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath.startsWith('/api/')) {
    const done = (p) => p.catch(() => json(res, { ok: false }, 400));
    if (urlPath === '/api/join' && req.method === 'POST') {
      const id = 'p' + room.next++;
      const host = !room.hostId;
      if (host) room.hostId = id;
      json(res, { id, host });
      return;
    }
    if (urlPath === '/api/cmd' && req.method === 'POST') {
      done(readBody(req).then((b) => { room.cmds.push(b); json(res, { ok: true }); }));
      return;
    }
    if (urlPath === '/api/cmds') {
      const cmds = room.cmds.splice(0, room.cmds.length);
      json(res, { cmds });
      return;
    }
    if (urlPath === '/api/snap' && req.method === 'POST') {
      done(readBody(req).then((b) => { room.snap = b; json(res, { ok: true }); }));
      return;
    }
    if (urlPath === '/api/snap') {
      json(res, room.snap || { hellos: {}, state: null });
      return;
    }
    json(res, { error: 'nope' }, 404);
    return;
  }
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

server.listen(PORT, HOST, () => {
  console.log('OSTFRONT http://' + HOST + ':' + PORT);
});

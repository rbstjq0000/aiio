// STYX.io 서버: 정적 파일 + WebSocket 게임 서버
// 실행: npm start  (PORT 환경변수로 포트 지정, 기본 8080)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { RoomManager } from './rooms.js';
import { DT } from '../shared/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
const ALLOWED = ['client', 'shared'];

const manager = new RoomManager();

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/status') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(manager.publicInfo()));
    return;
  }
  let p = decodeURIComponent(url.pathname);
  if (p === '/' || p === '/client') {
    res.writeHead(302, { location: '/client/' });
    res.end();
    return;
  }
  if (p.endsWith('/')) p += 'index.html';
  const full = path.normalize(path.join(ROOT, p));
  const rel = path.relative(ROOT, full);
  if (rel.startsWith('..') || !ALLOWED.includes(rel.split(path.sep)[0])) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(full)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer(serveStatic);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });

wss.on('connection', (ws) => {
  const client = {
    ws,
    room: null,
    pid: 0,
    name: '',
    weapon: 'greatsword',
    cos: null,
    uiVer: -1,
    msgCount: 0,
    send(obj) {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
    },
  };
  ws.on('message', (data) => {
    // 초당 메시지 수 제한 (입력은 30/초)
    if (++client.msgCount > 90) return;
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'in':
        if (client.room && client.room.game && client.pid) client.room.game.setInput(client.pid, msg);
        break;
      case 'join':
        manager.join(client, msg);
        break;
      case 'start':
      case 'roomcfg':
        manager.hostCommand(client, msg);
        break;
      case 'spec':
        if (client.room && client.room.game && client.pid) client.room.game.spectate(client.pid, msg.d === -1 ? -1 : 1);
        break;
      case 'leave':
        manager.leave(client);
        break;
      case 'ping':
        client.send({ t: 'pong', c: msg.c });
        break;
      default:
        break;
    }
  });
  ws.on('close', () => manager.leave(client));
  ws.on('error', () => manager.leave(client));
  client._reset = setInterval(() => {
    client.msgCount = 0;
  }, 1000);
  ws.on('close', () => clearInterval(client._reset));
});

// 고정 30틱 게임 루프 (지연 누적 보정)
let last = performance.now();
let acc = 0;
setInterval(() => {
  const now = performance.now();
  acc += (now - last) / 1000;
  last = now;
  let steps = 0;
  while (acc >= DT && steps < 4) {
    manager.tick(DT);
    acc -= DT;
    steps++;
  }
  if (acc > DT * 4) acc = 0;
}, 1000 / 60);

server.listen(PORT, () => {
  console.log(`STYX.io 서버 실행 중: http://localhost:${PORT}`);
});

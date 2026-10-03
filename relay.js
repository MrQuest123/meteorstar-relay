/*
 * Meteor Star — сервер онлайн-игры (relay).
 * Сводит двух игроков по 6-значному коду лобби и пересылает их сообщения.
 * Физику считает телефон хозяина лобби — сервер только «труба», поэтому он лёгкий
 * и помещается в бесплатный тариф Render.
 *
 * Протокол (текстовые сообщения WebSocket, путь /ws):
 *   клиент → сервер:  HOST|<код>|<ник>|<версия>   создать лобби
 *                     JOIN|<код>|<ник>|<версия>   войти по коду
 *                     @PING|<метка>               замер пинга
 *   сервер → клиент:  @ROOM_OK  @PEER|<ник>  @PEER_LEFT  @PONG|<метка>
 *                     @ERR|CODE_TAKEN|NO_ROOM|ROOM_FULL|BAD_CODE|VERSION|SERVER_FULL
 *   всё остальное пересылается сопернику без изменений.
 */
'use strict';
const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const PROTO = '1';
const MAX_ROOMS = 2000;
const MAX_MSG_PER_SEC = 240;          // ~60 Гц × 3 потока + запас
const WAIT_ROOM_TTL_MS = 30 * 60 * 1000;

const rooms = new Map();              // код → { code, host, guest, hostNick, guestNick, created }

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url.startsWith('/health')) {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('Meteor Star relay: ok, rooms=' + rooms.size);
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096, perMessageDeflate: false });

function send(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(msg);
}

function cleanNick(s) {
  return String(s || 'Игрок').replace(/[|\r\n]/g, '').trim().slice(0, 24) || 'Игрок';
}

function hello(ws, msg) {
  const p = msg.split('|');
  if (p.length < 4 || (p[0] !== 'HOST' && p[0] !== 'JOIN')) return ws.close(4001, 'bad hello');
  if (p[3] !== PROTO) { send(ws, '@ERR|VERSION'); return ws.close(4002, 'version'); }
  const code = p[1];
  if (!/^\d{6}$/.test(code)) { send(ws, '@ERR|BAD_CODE'); return ws.close(4003, 'code'); }
  const nick = cleanNick(p[2]);

  if (p[0] === 'HOST') {
    if (rooms.has(code)) { send(ws, '@ERR|CODE_TAKEN'); return ws.close(4004, 'taken'); }
    if (rooms.size >= MAX_ROOMS) { send(ws, '@ERR|SERVER_FULL'); return ws.close(4005, 'full'); }
    const room = { code, host: ws, guest: null, hostNick: nick, guestNick: '', created: Date.now() };
    rooms.set(code, room);
    ws.room = room;
    ws.role = 'host';
    send(ws, '@ROOM_OK');
    return;
  }

  const room = rooms.get(code);
  if (!room) { send(ws, '@ERR|NO_ROOM'); return ws.close(4006, 'no room'); }
  if (room.guest) { send(ws, '@ERR|ROOM_FULL'); return ws.close(4007, 'room full'); }
  room.guest = ws;
  room.guestNick = nick;
  ws.room = room;
  ws.role = 'guest';
  send(ws, '@ROOM_OK');
  send(ws, '@PEER|' + room.hostNick);
  send(room.host, '@PEER|' + nick);
}

function leave(ws) {
  const room = ws.room;
  if (!room) return;
  ws.room = null;
  if (ws.role === 'host') {
    rooms.delete(room.code);
    if (room.guest) {
      send(room.guest, '@PEER_LEFT');
      room.guest.room = null;
      room.guest.close(1000, 'host left');
    }
  } else if (room.guest === ws) {
    room.guest = null;
    room.guestNick = '';
    send(room.host, '@PEER_LEFT');
  }
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.room = null;
  ws.role = null;
  ws.win = Date.now();
  ws.count = 0;
  if (ws._socket) ws._socket.setNoDelay(true);          // минимальная задержка отправки

  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data) => {
    const now = Date.now();
    if (now - ws.win >= 1000) { ws.win = now; ws.count = 0; }
    if (++ws.count > MAX_MSG_PER_SEC) return;           // защита от спама
    const msg = data.toString();
    if (!ws.room) return hello(ws, msg);
    if (msg.startsWith('@PING|')) { send(ws, '@PONG|' + msg.slice(6)); return; }
    const room = ws.room;
    send(ws.role === 'host' ? room.guest : room.host, msg);
  });
  ws.on('close', () => leave(ws));
  ws.on('error', () => {});
  setTimeout(() => { if (!ws.room && ws.readyState === 1) ws.close(4008, 'hello timeout'); }, 10000);
});

// Проверка живых соединений и уборка забытых лобби
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
  const now = Date.now();
  for (const room of rooms.values()) {
    if (!room.guest && now - room.created > WAIT_ROOM_TTL_MS) {
      rooms.delete(room.code);
      if (room.host) { room.host.room = null; room.host.close(1000, 'expired'); }
    }
  }
}, 15000);

server.listen(PORT, () => console.log('Meteor Star relay on port ' + PORT));

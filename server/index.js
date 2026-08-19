'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const D = require('./data');
const W = require('./world');
const G = require('./game');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

const server = http.createServer((req, res) => {
  const rel = req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ server });
let nextId = 1;

wss.on('connection', (ws) => {
  let player = null;
  const send = (obj) => ws.readyState === 1 && ws.send(JSON.stringify(obj));

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.t === 'join') {
      if (player) return;
      player = G.createPlayer('p' + nextId++, String(msg.name || ''));
      G.state.players.set(player.id, player);
      ws.player = player;
      send({
        t: 'init', id: player.id, lore: D.LORE, chapters: D.CHAPTERS,
        map: W.map, tile: W.TILE, mw: W.W, mh: W.H,
        npcs: D.NPCS, towers: D.TOWERS, mobDefs: D.MOBS,
      });
      G.log(player, D.LORE.intro);
      G.announce(`${player.name} 醒来了。`);
      return;
    }
    if (!player) return;

    switch (msg.t) {
      case 'input': player.input = { up: !!msg.up, down: !!msg.down, left: !!msg.left, right: !!msg.right }; break;
      case 'attack': player.wantAttack = true; break;
      case 'interact': { const r = G.interact(player); if (r) send({ t: 'dialog', ...r }); break; }
      case 'quest': G.questAction(player, msg.id, msg.action); break;
      case 'use': G.useItem(player, msg.id); break;
      case 'chat': {
        const text = String(msg.text || '').slice(0, 120).trim();
        if (text) broadcast({ t: 'chat', name: player.name, text });
        break;
      }
    }
  });

  ws.on('close', () => {
    if (player) G.state.players.delete(player.id);
  });
});

function broadcast(obj) {
  const s = JSON.stringify(obj);
  for (const c of wss.clients) if (c.readyState === 1) c.send(s);
}

// ---- 主循环 ----
G.initWorld();
let last = Date.now();

setInterval(() => {
  const now = Date.now();
  const dt = Math.min((now - last) / 1000, 0.2);
  last = now;

  G.tick(now, dt);

  const fx = G.state.fx.splice(0);
  const events = G.state.events.splice(0);

  for (const c of wss.clients) {
    const p = c.player;
    if (c.readyState !== 1 || !p) continue;
    const snap = G.snapshotFor(p, now);
    snap.fx = fx.filter((f) => Math.abs(f.x - p.x) < 700 && Math.abs(f.y - p.y) < 700);
    c.send(JSON.stringify(snap));
    if (p.dirty) { c.send(JSON.stringify(G.selfView(p))); p.dirty = false; }
    if (p.logs.length) { c.send(JSON.stringify({ t: 'log', lines: p.logs.splice(0) })); }
    if (events.length) c.send(JSON.stringify({ t: 'event', lines: events }));
  }
}, G.TICK_MS);

// 血量/状态定期同步给客户端（hp 变化不走 dirty）
setInterval(() => { for (const p of G.state.players.values()) p.dirty = true; }, 500);

server.listen(PORT, () => console.log(`提亚兰服务器启动: http://localhost:${PORT}`));

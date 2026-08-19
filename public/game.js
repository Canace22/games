'use strict';
/* 客户端：输入 -> 服务端；渲染服务端快照（本地预测 + 平滑插值） */

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
let VW = 0, VH = 0;
function resize() { VW = cv.width = innerWidth; VH = cv.height = innerHeight; }
addEventListener('resize', resize); resize();

const G = {
  ws: null, myId: null, world: null,
  players: new Map(), mobs: new Map(),
  self: null, chapter: 0, towersLit: [],
  floaters: [], swings: [],
  cam: { x: 0, y: 0 },
  pred: null,           // 本地预测坐标
  keys: {}, chatting: false,
};

const BLOCKED = new Set([2, 3, 4]);
const TILE_COLOR = ['#3f5c3a', '#3a5636', '#2c4a63', '#22361f', '#48504d', '#6b5f45'];

// ---------- 连接 ----------
function connect(name) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}`);
  G.ws = ws;
  ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name }));
  ws.onmessage = (e) => handle(JSON.parse(e.data));
  ws.onclose = () => pushLog('与服务器断开了连接。', 'red');
}

const send = (o) => G.ws && G.ws.readyState === 1 && G.ws.send(JSON.stringify(o));

function handle(m) {
  switch (m.t) {
    case 'init':
      G.myId = m.id; G.world = m;
      document.getElementById('login').classList.add('hidden');
      document.getElementById('ui').classList.remove('hidden');
      break;
    case 'state': applyState(m); break;
    case 'self': applySelf(m); break;
    case 'log': m.lines.forEach((l) => pushLog(l, 'gold')); break;
    case 'event': m.lines.forEach((l) => pushLog('『世界』' + l, 'gold')); break;
    case 'chat': pushChat(m.name, m.text); break;
    case 'dialog': showDialog(m); break;
  }
}

function applyState(m) {
  G.chapter = m.chapter; G.towersLit = m.towers;
  syncEntities(G.players, m.players);
  syncEntities(G.mobs, m.mobs);
  const me = G.players.get(G.myId);
  if (me && G.pred) reconcile(me);
  else if (me) G.pred = { x: me.x, y: me.y };
  for (const f of m.fx || []) {
    if (f.type === 'hit') G.floaters.push({ x: f.x, y: f.y - 18, v: f.v, p: f.p, life: 1 });
    else G.swings.push({ x: f.x, y: f.y, life: 1 });
  }
}

/** 更新实体列表并保留渲染插值坐标 */
function syncEntities(store, list) {
  const seen = new Set();
  for (const e of list) {
    seen.add(e.id);
    const old = store.get(e.id);
    if (old) { e.rx = old.rx; e.ry = old.ry; }
    else { e.rx = e.x; e.ry = e.y; }
    store.set(e.id, e);
  }
  for (const id of [...store.keys()]) if (!seen.has(id)) store.delete(id);
}

/** 本地预测与服务端结果对账 */
function reconcile(me) {
  const d = Math.hypot(me.x - G.pred.x, me.y - G.pred.y);
  if (d > 60 || me.d) { G.pred.x = me.x; G.pred.y = me.y; }
  else { G.pred.x += (me.x - G.pred.x) * 0.15; G.pred.y += (me.y - G.pred.y) * 0.15; }
}

function applySelf(s) {
  G.self = s;
  const q = (id) => document.getElementById(id);
  q('pname').textContent = s.name;
  q('plv').textContent = 'Lv.' + s.lv;
  q('hpfill').style.width = Math.max(0, (s.hp / s.maxHp) * 100) + '%';
  q('hptext').textContent = `${Math.max(0, s.hp)} / ${s.maxHp}`;
  q('expfill').style.width = (s.exp / s.expNext) * 100 + '%';
  q('stats').textContent = `攻 ${s.atk}　防 ${s.def}　经验 ${s.exp}/${s.expNext}`;
  q('deadmask').classList.toggle('hidden', !s.dead);
  renderQuests(s.quests);
  if (!q('bag').classList.contains('hidden')) renderBag();
}

// ---------- UI ----------
function renderQuests(qs) {
  const ul = document.getElementById('questlist');
  ul.innerHTML = qs.length ? '' : '<li style="color:#5e6875">去找守林长老聊聊。</li>';
  for (const q of qs) {
    const li = document.createElement('li');
    li.innerHTML = `<b>${q.name}</b>${q.text} ${q.cur}/${q.max}`;
    ul.appendChild(li);
  }
}

function renderBag() {
  const box = document.getElementById('bagitems');
  box.innerHTML = '';
  if (!G.self.inv.length) box.innerHTML = '<div style="color:#5e6875">空空如也。</div>';
  for (const it of G.self.inv) {
    const eq = G.self.equip.weapon === it.id || G.self.equip.armor === it.id;
    const div = document.createElement('div');
    div.className = 'item' + (eq ? ' equipped' : '');
    const act = it.type === 'consumable' ? '使用' : (it.type === 'weapon' || it.type === 'armor') ? (eq ? '已装备' : '装备') : '';
    div.innerHTML = `<span>${it.name} ×${it.n}<br><span class="d">${it.desc || ''}</span></span><span class="d">${act}</span>`;
    div.onclick = () => send({ t: 'use', id: it.id });
    box.appendChild(div);
  }
}

function showDialog(d) {
  const box = document.getElementById('dialog');
  document.getElementById('dlgname').textContent = d.name;
  const body = document.getElementById('dlgbody');
  body.innerHTML = '';
  if (!d.options.length) body.innerHTML = '<p>他只是看了你一眼。</p>';
  for (const o of d.options) {
    const p = document.createElement('p');
    p.textContent = o.text;
    body.appendChild(p);
    if (o.action === 'accept' || o.action === 'turnin') {
      const b = document.createElement('button');
      b.textContent = o.action === 'accept' ? `接受「${o.name}」` : `交付「${o.name}」`;
      b.onclick = () => { send({ t: 'quest', id: o.id, action: o.action }); box.classList.add('hidden'); };
      body.appendChild(b);
    }
  }
  box.classList.remove('hidden');
}

function pushLog(text, cls) {
  const box = document.getElementById('log');
  const d = document.createElement('div');
  d.textContent = text; if (cls) d.className = cls;
  box.appendChild(d);
  while (box.children.length > 8) box.removeChild(box.firstChild);
  setTimeout(() => d.remove(), 12000);
}

function pushChat(name, text) {
  const box = document.getElementById('chatlog');
  const d = document.createElement('div');
  d.innerHTML = `<b>${esc(name)}：</b>${esc(text)}`;
  box.appendChild(d);
  while (box.children.length > 6) box.removeChild(box.firstChild);
}

const esc = (s) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

// ---------- 输入 ----------
const chatInput = document.getElementById('chatinput');

addEventListener('keydown', (e) => {
  if (G.chatting) {
    if (e.key === 'Enter') {
      const v = chatInput.value.trim();
      if (v) send({ t: 'chat', text: v });
      chatInput.value = ''; chatInput.classList.add('hidden'); G.chatting = false;
    } else if (e.key === 'Escape') { chatInput.classList.add('hidden'); G.chatting = false; }
    return;
  }
  G.keys[e.key.toLowerCase()] = true;
  switch (e.key.toLowerCase()) {
    case 'enter': G.chatting = true; chatInput.classList.remove('hidden'); chatInput.focus(); break;
    case 'e': send({ t: 'interact' }); break;
    case 'b': toggle('bag', renderBag); break;
    case 'q': toggle('questbox'); break;
    case 'escape': document.getElementById('dialog').classList.add('hidden'); break;
    case 'j': case ' ': send({ t: 'attack' }); break;
  }
});
addEventListener('keyup', (e) => { G.keys[e.key.toLowerCase()] = false; });
addEventListener('mousedown', (e) => { if (e.target === cv) send({ t: 'attack' }); });

function toggle(id, onShow) {
  const el = document.getElementById(id);
  el.classList.toggle('hidden');
  if (!el.classList.contains('hidden') && onShow) onShow();
}

document.getElementById('dlgclose').onclick = () => document.getElementById('dialog').classList.add('hidden');
document.getElementById('go').onclick = start;
document.getElementById('name').onkeydown = (e) => e.key === 'Enter' && start();
function start() {
  const n = document.getElementById('name').value.trim() || '守望者';
  connect(n);
}

let lastInput = '';
function pollInput() {
  const k = G.keys;
  const i = {
    up: k['w'] || k['arrowup'] ? 1 : 0, down: k['s'] || k['arrowdown'] ? 1 : 0,
    left: k['a'] || k['arrowleft'] ? 1 : 0, right: k['d'] || k['arrowright'] ? 1 : 0,
  };
  const sig = `${i.up}${i.down}${i.left}${i.right}`;
  if (sig !== lastInput) { lastInput = sig; send({ t: 'input', ...i }); }
  return i;
}

// ---------- 本地预测移动（与服务端同一套碰撞规则） ----------
function walkable(px, py, r) {
  const { map, tile, mw, mh } = G.world;
  for (const [dx, dy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
    const tx = (px + dx) / tile | 0, ty = (py + dy) / tile | 0;
    if (tx < 0 || ty < 0 || tx >= mw || ty >= mh) return false;
    if (BLOCKED.has(map[ty * mw + tx])) return false;
  }
  return true;
}

function predictMove(i, dt) {
  if (!G.pred || !G.self || G.self.dead) return;
  let dx = i.right - i.left, dy = i.down - i.up;
  if (!dx && !dy) return;
  const len = Math.hypot(dx, dy); dx /= len; dy /= len;
  const step = 130 * dt;
  const p = G.pred;
  if (walkable(p.x + dx * step, p.y, 10)) p.x += dx * step;
  if (walkable(p.x, p.y + dy * step, 10)) p.y += dy * step;
}

// ---------- 渲染 ----------
let lastT = performance.now();
function loop(now) {
  const dt = Math.min((now - lastT) / 1000, 0.1); lastT = now;
  requestAnimationFrame(loop);
  if (!G.world) return;

  const input = pollInput();
  predictMove(input, dt);
  updateCamera();
  draw(dt);
}
requestAnimationFrame(loop);

function updateCamera() {
  const me = G.pred || { x: 0, y: 0 };
  G.cam.x = me.x - VW / 2;
  G.cam.y = me.y - VH / 2;
}

function draw(dt) {
  const { tile, mw, mh, map } = G.world;
  ctx.fillStyle = '#0d1015'; ctx.fillRect(0, 0, VW, VH);
  ctx.save();
  ctx.translate(-Math.round(G.cam.x), -Math.round(G.cam.y));

  // 地图
  const x0 = Math.max(0, (G.cam.x / tile | 0) - 1), y0 = Math.max(0, (G.cam.y / tile | 0) - 1);
  const x1 = Math.min(mw, x0 + (VW / tile | 0) + 3), y1 = Math.min(mh, y0 + (VH / tile | 0) + 3);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const t = map[y * mw + x];
      ctx.fillStyle = TILE_COLOR[t];
      ctx.fillRect(x * tile, y * tile, tile, tile);
      if (t === 3) drawTree(x * tile, y * tile, tile);
      if (t === 4) drawRock(x * tile, y * tile, tile);
      if (t === 1) drawGrass(x * tile, y * tile, tile);
    }
  }

  G.world.towers.forEach(drawTower);
  G.world.npcs.forEach(drawNpc);
  for (const m of G.mobs.values()) drawMob(m, dt);
  for (const p of G.players.values()) drawPlayer(p, dt);
  drawEffects(dt);

  ctx.restore();
  document.getElementById('chapter').textContent =
    (G.world.chapters[G.chapter] || {}).title + '　守望塔 ' + G.towersLit.length + '/3';
}

function drawRock(x, y, t) {
  ctx.fillStyle = '#565c64'; ellipse(x + t / 2, y + t / 2 + 2, t * 0.34, t * 0.26);
  ctx.fillStyle = '#6a7079'; ellipse(x + t / 2 - 3, y + t / 2 - 2, t * 0.2, t * 0.14);
}

function drawGrass(x, y, t) {
  ctx.fillStyle = '#44603d';
  ctx.fillRect(x + 7, y + 20, 2, 7);
  ctx.fillRect(x + 19, y + 14, 2, 9);
}

function drawTree(x, y, t) {
  ctx.fillStyle = '#3b2b1c'; ctx.fillRect(x + t / 2 - 3, y + t - 12, 6, 10);
  ctx.fillStyle = '#2f5b2c'; circle(x + t / 2, y + t / 2, t * 0.42);
  ctx.fillStyle = '#3d7038'; circle(x + t / 2 - 3, y + t / 2 - 4, t * 0.26);
}

function drawTower(tw) {
  const lit = G.towersLit.includes(tw.id);
  ctx.fillStyle = '#4b4f57'; ctx.fillRect(tw.x - 16, tw.y - 40, 32, 52);
  ctx.fillStyle = lit ? '#ffe9a3' : '#2a2e36';
  ctx.fillRect(tw.x - 9, tw.y - 34, 18, 18);
  if (lit) { ctx.globalAlpha = 0.28; ctx.fillStyle = '#ffe9a3'; circle(tw.x, tw.y - 25, 46); ctx.globalAlpha = 1; }
  label(tw.name, tw.x, tw.y - 50, lit ? '#ffe9a3' : '#9aa4b0');
}

function drawNpc(n) {
  ctx.fillStyle = n.color; circle(n.x, n.y, 11);
  ctx.fillStyle = '#00000055'; ctx.fillRect(n.x - 11, n.y + 9, 22, 4);
  label(n.name, n.x, n.y - 20, '#f0d98a');
  ctx.fillStyle = '#f0d98a'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('!', n.x, n.y - 26);
}

function lerpTo(e, dt) {
  const k = Math.min(1, dt * 14);
  e.rx += (e.x - e.rx) * k; e.ry += (e.y - e.ry) * k;
}

function drawMob(m, dt) {
  lerpTo(m, dt);
  const def = G.world.mobDefs[m.t];
  const r = def.boss ? 26 : def.elite ? 18 : 13;
  ctx.fillStyle = '#00000044'; ellipse(m.rx, m.ry + r * 0.8, r, r * 0.35);
  ctx.fillStyle = m.sw ? '#ff9a72' : def.color;
  circle(m.rx, m.ry, r);
  ctx.fillStyle = '#e8e4da';
  circle(m.rx - r * 0.35, m.ry - r * 0.25, 2); circle(m.rx + r * 0.35, m.ry - r * 0.25, 2);
  hpBar(m.rx, m.ry - r - 8, m.hp / m.mhp, def.boss ? 70 : 30);
  label(def.name, m.rx, m.ry - r - 12, def.boss ? '#e08a8a' : '#c0b0c8');
}

function drawPlayer(p, dt) {
  lerpTo(p, dt);
  let x = p.rx, y = p.ry;
  if (p.id === G.myId && G.pred) { x = G.pred.x; y = G.pred.y; }
  if (p.d) { ctx.globalAlpha = 0.35; }
  ctx.fillStyle = '#00000044'; ellipse(x, y + 12, 13, 5);
  ctx.fillStyle = p.id === G.myId ? '#63a9e0' : '#7fbf6a';
  circle(x, y, 12);
  // 朝向
  ctx.fillStyle = '#dfeaf5';
  circle(x + (p.dx || 0) * 7, y + (p.dy || 0) * 7 - 2, 3.5);
  // 挥击
  if (p.sw) {
    ctx.strokeStyle = '#ffe9a3'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 30, Math.atan2(p.dy || 1, p.dx || 0) - 0.7, Math.atan2(p.dy || 1, p.dx || 0) + 0.7);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  hpBar(x, y - 22, p.hp / p.mhp, 32, '#6ac06a');
  label(`${p.n} Lv.${p.lv}`, x, y - 26, p.id === G.myId ? '#9fd0f5' : '#cfe0cd');
}

function drawEffects(dt) {
  ctx.textAlign = 'center';
  G.floaters = G.floaters.filter((f) => {
    f.life -= dt * 1.1; f.y -= dt * 30;
    if (f.life <= 0) return false;
    ctx.globalAlpha = Math.min(1, f.life * 1.5);
    ctx.fillStyle = f.p ? '#ff7b6b' : '#ffe9a3';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(f.v, f.x, f.y);
    ctx.globalAlpha = 1;
    return true;
  });
  G.swings = G.swings.filter((s) => {
    s.life -= dt * 4;
    if (s.life <= 0) return false;
    ctx.globalAlpha = s.life * 0.4; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(s.x, s.y, 20 * (1.4 - s.life), 0, 7); ctx.stroke();
    ctx.globalAlpha = 1;
    return true;
  });
}

// 绘制小工具
function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
function ellipse(x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 7); ctx.fill(); }
function label(text, x, y, color) {
  ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
  ctx.fillStyle = '#000a'; ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}
function hpBar(x, y, pct, w = 30, color = '#c0453c') {
  if (pct >= 1) return;              // 满血不画，减少画面噪音
  pct = Math.max(0, Math.min(1, pct));
  ctx.fillStyle = '#000000aa'; ctx.fillRect(x - w / 2, y, w, 4);
  ctx.fillStyle = color; ctx.fillRect(x - w / 2, y, w * pct, 4);
}

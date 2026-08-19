'use strict';
/** 游戏世界状态与主循环（服务端权威） */

const D = require('./data');
const W = require('./world');
const C = require('./combat');
const Q = require('./quests');

const TICK_MS = 50;

const state = {
  players: new Map(),
  mobs: new Map(),
  chapter: 0,
  towersLit: new Set(),
  fx: [],
  events: [], // 全服公告
  nextMobId: 1,
};

// ---------- 玩家 ----------

function createPlayer(id, name) {
  const b = D.PLAYER_BASE;
  const p = {
    id, name: name.slice(0, 12) || '守望者',
    x: W.SPAWN_POINT.x + (Math.random() * 60 - 30),
    y: W.SPAWN_POINT.y + (Math.random() * 60 - 30),
    dir: { x: 0, y: 1 }, input: { up: 0, down: 0, left: 0, right: 0 },
    lv: 1, exp: 0,
    hp: b.hp, maxHp: b.hp, atk: b.atk, def: b.def,
    speed: b.speed, attackRange: b.attackRange, attackCd: b.attackCd,
    nextAttack: 0, swingUntil: 0,
    inv: { herb: 2 }, equip: { weapon: null, armor: null },
    quests: {}, kills: {}, interacted: [],
    dead: false, respawnAt: 0, dirty: true, logs: [],
  };
  recalc(p);
  return p;
}

/** 依据等级和装备重算属性 */
function recalc(p) {
  const b = D.PLAYER_BASE;
  const wpn = p.equip.weapon ? D.ITEMS[p.equip.weapon] : null;
  const arm = p.equip.armor ? D.ITEMS[p.equip.armor] : null;
  p.maxHp = b.hp + (p.lv - 1) * 20;
  p.atk = b.atk + (p.lv - 1) * 3 + (wpn ? wpn.atk : 0);
  p.def = b.def + (p.lv - 1) * 1 + (arm ? arm.def : 0);
  if (p.hp > p.maxHp) p.hp = p.maxHp;
}

/** 加经验并处理升级，返回日志文本 */
function grantExp(p, amount) {
  p.exp += amount;
  const logs = [`获得 ${amount} 经验`];
  while (p.exp >= D.levelUpExp(p.lv)) {
    p.exp -= D.levelUpExp(p.lv);
    p.lv++;
    recalc(p);
    p.hp = p.maxHp;
    logs.push(`★ 升到 ${p.lv} 级！`);
  }
  p.dirty = true;
  return logs;
}

function killPlayer(p, byName, now) {
  p.dead = true;
  p.hp = 0;
  p.respawnAt = now + 5000;
  log(p, `你被 ${byName} 击倒了，5 秒后在营地复活。`);
}

function respawnPlayer(p) {
  p.dead = false;
  p.hp = p.maxHp;
  p.x = W.SPAWN_POINT.x;
  p.y = W.SPAWN_POINT.y;
  p.dirty = true;
}

// ---------- 怪物 ----------

function spawnMob(type, x, y, radius, respawnMs) {
  const def = D.MOBS[type];
  const id = 'm' + state.nextMobId++;
  const m = {
    id, type, x, y, homeX: x, homeY: y, radius: radius || 40,
    hp: def.hp, maxHp: def.hp, dead: false, respawnAt: 0, respawnMs,
    threat: null, contributors: new Set(), nextAttack: 0, swingUntil: 0,
  };
  state.mobs.set(id, m);
  return m;
}

function initWorld() {
  for (const s of D.SPAWNS) {
    for (let i = 0; i < s.max; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * s.radius;
      let x = s.x + Math.cos(ang) * r;
      let y = s.y + Math.sin(ang) * r;
      if (!W.walkable(x, y, 12)) { x = s.x; y = s.y; }
      spawnMob(s.mob, x, y, s.radius, s.respawnMs);
    }
  }
}

/** 章节 3 时召唤 boss */
function ensureBoss() {
  if (state.chapter < 3) return;
  for (const m of state.mobs.values()) if (m.type === 'karanthos') return;
  const b = D.BOSS_SPAWN;
  spawnMob(b.mob, b.x, b.y, 120, 120000);
  announce('蚀王的影身降临苔原中央！全服守望者，集合。');
}

// ---------- 交互 ----------

function log(p, text) { p.logs.push(text); }

function announce(text) { state.events.push(text); }

function advanceChapter(n) {
  if (n <= state.chapter) return;
  state.chapter = n;
  const ch = D.CHAPTERS[n];
  if (ch) announce(`【${ch.title}】${ch.desc}`);
  ensureBoss();
}

/** 按 E：找最近的 NPC 或塔 */
function interact(p) {
  const npc = nearest(D.NPCS, p, 90);
  if (npc) return { type: 'npc', id: npc.id, name: npc.name, options: Q.questsForNpc(p, npc.id) };

  const tower = nearest(D.TOWERS, p, 95);
  if (tower) return towerInteract(p, tower);

  return null;
}

function nearest(list, p, range) {
  let best = null, bestD = range;
  for (const o of list) {
    const d = Math.hypot(o.x - p.x, o.y - p.y);
    if (d < bestD) { best = o; bestD = d; }
  }
  return best;
}

function towerInteract(p, tower) {
  const msg = (t) => ({ type: 'npc', id: tower.id, name: tower.name, options: [{ action: 'none', text: t }] });
  if (p.quests.q4_tower !== 'active') return msg('石头凉的，什么也没发生。');
  if (!p.inv.blade_shard) return msg('塔纹亮了一下又暗下去。你缺一块风之刃碎片。');
  if (p.interacted.includes(tower.id)) return msg('这座塔已经为你亮起了。');

  p.interacted.push(tower.id);
  state.towersLit.add(tower.id);
  p.dirty = true;
  announce(`${p.name} 点亮了${tower.name}（${state.towersLit.size}/3）`);
  return msg(`碎片震了一下，${tower.name}亮起来了。（${p.interacted.length}/3）`);
}

/** 玩家点击对话选项 */
function questAction(p, questId, action) {
  const q = Q.questById(questId);
  if (!q) return;
  if (action === 'accept' && Q.accept(p, q)) {
    log(p, `【接取任务】${q.name}`);
  } else if (action === 'turnin') {
    const logs = Q.turnIn(p, q, grantExp);
    if (logs) {
      logs.forEach((t) => log(p, t));
      if (q.chapter) advanceChapter(q.chapter);
    }
  }
  p.dirty = true;
}

function useItem(p, itemId) {
  const it = D.ITEMS[itemId];
  if (!it || !p.inv[itemId]) return;
  if (it.type === 'consumable') {
    if (p.dead) return;
    Q.removeItem(p, itemId);
    p.hp = Math.min(p.maxHp, p.hp + it.heal);
    log(p, `使用 ${it.name}，回复 ${it.heal} 点生命`);
  } else if (it.type === 'weapon' || it.type === 'armor') {
    const slot = it.type;
    if (p.equip[slot] === itemId) { p.equip[slot] = null; log(p, `卸下 ${it.name}`); }
    else { p.equip[slot] = itemId; log(p, `装备 ${it.name}`); }
    recalc(p);
  }
  p.dirty = true;
}

// ---------- 主循环 ----------

const ctx = {
  players: state.players, mobs: state.mobs, fx: state.fx,
  move: W.moveWithCollision, log, grantExp, killPlayer, announce,
};

function tick(now, dt) {
  for (const p of state.players.values()) {
    if (p.dead) { if (now >= p.respawnAt) respawnPlayer(p); continue; }
    movePlayer(p, dt);
    if (p.wantAttack) { C.playerAttack(ctx, p, now); p.wantAttack = false; }
  }
  for (const m of state.mobs.values()) C.mobTick(ctx, m, dt, now);
}

function movePlayer(p, dt) {
  const i = p.input;
  let dx = (i.right ? 1 : 0) - (i.left ? 1 : 0);
  let dy = (i.down ? 1 : 0) - (i.up ? 1 : 0);
  if (!dx && !dy) return;
  const len = Math.hypot(dx, dy);
  dx /= len; dy /= len;
  p.dir = { x: dx, y: dy };
  const step = p.speed * dt;
  const [nx, ny] = W.moveWithCollision(p.x, p.y, dx * step, dy * step, 10);
  p.x = nx; p.y = ny;
}

/** 生成某玩家视野内的快照 */
function snapshotFor(p, now) {
  const R = 700;
  const inView = (o) => Math.abs(o.x - p.x) < R && Math.abs(o.y - p.y) < R;
  return {
    t: 'state',
    now,
    chapter: state.chapter,
    towers: [...state.towersLit],
    players: [...state.players.values()].filter(inView).map((o) => ({
      id: o.id, n: o.name, x: Math.round(o.x), y: Math.round(o.y),
      hp: o.hp, mhp: o.maxHp, lv: o.lv, d: o.dead ? 1 : 0,
      sw: o.swingUntil > now ? 1 : 0, dx: o.dir.x, dy: o.dir.y,
    })),
    mobs: [...state.mobs.values()].filter((m) => !m.dead && inView(m)).map((m) => ({
      id: m.id, t: m.type, x: Math.round(m.x), y: Math.round(m.y),
      hp: m.hp, mhp: m.maxHp, sw: m.swingUntil > now ? 1 : 0,
    })),
  };
}

/** 玩家自身详细数据（背包/任务，变化时才发） */
function selfView(p) {
  return {
    t: 'self',
    id: p.id, name: p.name, lv: p.lv, exp: p.exp, expNext: D.levelUpExp(p.lv),
    hp: p.hp, maxHp: p.maxHp, atk: p.atk, def: p.def, dead: p.dead,
    inv: Object.entries(p.inv).map(([id, n]) => ({ id, n, ...D.ITEMS[id] })),
    equip: p.equip,
    quests: Q.questView(p),
  };
}

module.exports = {
  state, TICK_MS, createPlayer, spawnMob, initWorld, tick,
  snapshotFor, selfView, interact, questAction, useItem, log, announce, grantExp,
};

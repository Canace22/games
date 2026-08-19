'use strict';
/** 战斗：伤害计算、攻击判定、死亡与掉落。ctx 由 game.js 注入。 */

const { MOBS, ITEMS } = require('./data');
const Q = require('./quests');

const damage = (atk, def) => Math.max(1, Math.round((atk - def * 0.6) * (0.9 + Math.random() * 0.2)));

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** 玩家攻击：命中身前一片圆形区域内的所有怪 */
function playerAttack(ctx, p, now) {
  if (p.dead || now < p.nextAttack) return;
  p.nextAttack = now + p.attackCd;
  p.swingUntil = now + 180;

  const cx = p.x + p.dir.x * p.attackRange * 0.6;
  const cy = p.y + p.dir.y * p.attackRange * 0.6;
  const radius = p.attackRange * 0.85;
  let hitAny = false;

  for (const m of ctx.mobs.values()) {
    if (m.dead) continue;
    if (Math.hypot(m.x - cx, m.y - cy) > radius) continue;
    hitAny = true;
    const dmg = damage(p.atk, MOBS[m.type].def);
    m.hp -= dmg;
    m.threat = p.id;
    m.contributors.add(p.id);
    ctx.fx.push({ type: 'hit', x: m.x, y: m.y, v: dmg });
    if (m.hp <= 0) killMob(ctx, m, p, now);
  }
  if (!hitAny) ctx.fx.push({ type: 'swing', x: cx, y: cy });
}

function killMob(ctx, m, killer, now) {
  const def = MOBS[m.type];
  m.dead = true;
  m.hp = 0;
  m.respawnAt = now + (m.respawnMs || 12000);

  const rewardTo = def.boss ? [...m.contributors] : [killer.id];
  for (const pid of rewardTo) {
    const p = ctx.players.get(pid);
    if (!p) continue;
    ctx.log(p, `击败 ${def.name}`);
    ctx.grantExp(p, def.exp).forEach((t) => ctx.log(p, t));
    Q.onKill(p, m.type);
    for (const d of def.drops || []) {
      if (Math.random() > d.rate) continue;
      Q.addItem(p, d.item);
      ctx.log(p, `拾取 ${ITEMS[d.item].name}`);
    }
    p.dirty = true;
  }
  if (def.elite || def.boss) ctx.announce(`${killer.name} 击败了 ${def.name}！`);
}

/** 怪物 AI：巡逻 / 追击 / 攻击 */
function mobTick(ctx, m, dt, now) {
  if (m.dead) {
    if (now >= m.respawnAt) respawn(m);
    return;
  }
  const def = MOBS[m.type];
  const target = findTarget(ctx, m, def);

  if (!target) {
    m.target = null;
    wander(ctx, m, def, dt, now);
    return;
  }
  m.target = target.id;
  const d = dist(m, target);

  if (d > def.attackRange) {
    const ang = Math.atan2(target.y - m.y, target.x - m.x);
    const step = def.speed * dt;
    const [nx, ny] = ctx.move(m.x, m.y, Math.cos(ang) * step, Math.sin(ang) * step, 12);
    m.x = nx; m.y = ny;
  } else if (now >= m.nextAttack) {
    m.nextAttack = now + def.attackCd;
    m.swingUntil = now + 180;
    const dmg = damage(def.atk, target.def);
    target.hp -= dmg;
    ctx.fx.push({ type: 'hit', x: target.x, y: target.y, v: dmg, p: true });
    if (target.hp <= 0) ctx.killPlayer(target, def.name, now);
  }
}

/** 优先仇恨目标，否则取仇恨范围内最近的活人 */
function findTarget(ctx, m, def) {
  let best = null, bestD = Infinity;
  for (const p of ctx.players.values()) {
    if (p.dead) continue;
    const d = dist(m, p);
    const range = m.threat === p.id ? def.aggroRange * 1.8 : def.aggroRange;
    if (d < range && d < bestD) { best = p; bestD = d; }
  }
  if (!best) m.threat = null;
  return best;
}

function wander(ctx, m, def, dt, now) {
  if (now >= (m.nextWander || 0)) {
    m.nextWander = now + 1500 + Math.random() * 2500;
    const ang = Math.random() * Math.PI * 2;
    m.wanderDir = { x: Math.cos(ang), y: Math.sin(ang) };
    if (Math.random() < 0.4) m.wanderDir = { x: 0, y: 0 };
  }
  const w = m.wanderDir || { x: 0, y: 0 };
  if (!w.x && !w.y) return;
  // 走太远就往家走
  const home = Math.hypot(m.x - m.homeX, m.y - m.homeY);
  let dx = w.x, dy = w.y;
  if (home > m.radius) {
    const ang = Math.atan2(m.homeY - m.y, m.homeX - m.x);
    dx = Math.cos(ang); dy = Math.sin(ang);
  }
  const step = def.speed * 0.5 * dt;
  const [nx, ny] = ctx.move(m.x, m.y, dx * step, dy * step, 12);
  m.x = nx; m.y = ny;
}

function respawn(m) {
  const def = MOBS[m.type];
  m.dead = false;
  m.hp = def.hp;
  m.threat = null;
  m.contributors = new Set();
  const ang = Math.random() * Math.PI * 2;
  const r = Math.random() * m.radius;
  m.x = m.homeX + Math.cos(ang) * r;
  m.y = m.homeY + Math.sin(ang) * r;
}

module.exports = { playerAttack, mobTick, damage, respawn };

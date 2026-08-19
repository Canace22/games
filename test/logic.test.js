'use strict';
/** 无框架逻辑测试：node test/logic.test.js */
const assert = require('assert');
const W = require('../server/world');
const D = require('../server/data');
const G = require('../server/game');
const C = require('../server/combat');
const Q = require('../server/quests');

let pass = 0;
const test = (name, fn) => {
  try { fn(); console.log('  ✓', name); pass++; }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; }
};

// 每个用例前重置世界
function reset() {
  G.state.players.clear();
  G.state.mobs.clear();
  G.state.chapter = 0;
  G.state.towersLit.clear();
  G.state.fx.length = 0;
  G.state.events.length = 0;
}

const ctx = {
  players: G.state.players, mobs: G.state.mobs, fx: G.state.fx,
  move: W.moveWithCollision, log: (p, t) => p.logs.push(t),
  grantExp: G.grantExp, killPlayer: () => {}, announce: (t) => G.state.events.push(t),
};

function addPlayer(name = 'T') {
  const p = G.createPlayer('p1', name);
  G.state.players.set(p.id, p);
  return p;
}

console.log('\n[1] 地图与碰撞');
test('出生点可站立', () => assert.ok(W.walkable(W.SPAWN_POINT.x, W.SPAWN_POINT.y)));
test('地图边界是墙', () => assert.ok(!W.walkable(8, 8)));
test('湖面不可站立', () => assert.ok(!W.walkable(46 * W.TILE + 16, 46 * W.TILE + 16)));
test('任意大位移都不会把角色送进障碍里', () => {
  const start = W.SPAWN_POINT;
  for (const [dx, dy] of [[-500, 0], [500, 0], [0, -500], [0, 500], [400, 400]]) {
    const [x, y] = W.moveWithCollision(start.x, start.y, dx, dy, 10);
    assert.ok(W.walkable(x, y, 10), `落点 (${x},${y}) 应可站立`);
  }
});

console.log('\n[2] 战斗与掉落');
test('攻击命中范围内的怪并造成伤害', () => {
  reset();
  const p = addPlayer();
  p.dir = { x: 1, y: 0 };
  const m = G.spawnMob('shadow_boar', p.x + 30, p.y, 40);
  C.playerAttack(ctx, p, 1000);
  assert.ok(m.hp < m.maxHp, `怪应掉血，实际 ${m.hp}`);
});
test('攻击打不到范围外的怪', () => {
  reset();
  const p = addPlayer();
  p.dir = { x: 1, y: 0 };
  const m = G.spawnMob('shadow_boar', p.x + 300, p.y, 40);
  C.playerAttack(ctx, p, 1000);
  assert.strictEqual(m.hp, m.maxHp);
});
test('攻击有冷却', () => {
  reset();
  const p = addPlayer();
  p.dir = { x: 1, y: 0 };
  const m = G.spawnMob('shadow_boar', p.x + 30, p.y, 40);
  C.playerAttack(ctx, p, 1000);
  const hpAfterFirst = m.hp;
  C.playerAttack(ctx, p, 1010); // 冷却内
  assert.strictEqual(m.hp, hpAfterFirst);
});
test('击杀后掉落进背包并获得经验', () => {
  reset();
  const p = addPlayer();
  p.dir = { x: 1, y: 0 };
  p.atk = 9999;
  const m = G.spawnMob('shadow_boar', p.x + 30, p.y, 40);
  C.playerAttack(ctx, p, 1000);
  assert.ok(m.dead, '怪应死亡');
  assert.ok(p.exp > 0 || p.lv > 1, '应获得经验');
  assert.strictEqual(p.kills.shadow_boar, 1);
});
test('怪物死亡后到时间会重生', () => {
  reset();
  const m = G.spawnMob('shadow_boar', 900, 800, 40);
  m.dead = true; m.respawnAt = 500;
  C.mobTick(ctx, m, 0.05, 600);
  assert.ok(!m.dead && m.hp === m.maxHp);
});

console.log('\n[3] 升级与装备');
test('经验够时升级并提升属性', () => {
  reset();
  const p = addPlayer();
  const atk0 = p.atk;
  G.grantExp(p, D.levelUpExp(1) + 5);
  assert.strictEqual(p.lv, 2);
  assert.ok(p.atk > atk0, '攻击力应提升');
});
test('装备武器提升攻击，再点一次卸下', () => {
  reset();
  const p = addPlayer();
  Q.addItem(p, 'rusty_sword');
  const atk0 = p.atk;
  G.useItem(p, 'rusty_sword');
  assert.strictEqual(p.atk, atk0 + D.ITEMS.rusty_sword.atk);
  G.useItem(p, 'rusty_sword');
  assert.strictEqual(p.atk, atk0);
});
test('使用草药回血且消耗物品', () => {
  reset();
  const p = addPlayer();
  p.hp = 10;
  G.useItem(p, 'herb');
  assert.strictEqual(p.hp, 40);
  assert.strictEqual(p.inv.herb, 1);
});

console.log('\n[4] 任务链');
test('未完成前置任务不能接后续任务', () => {
  reset();
  const p = addPlayer();
  assert.ok(!Q.canAccept(p, Q.questById('q2_pelt')));
});
test('接取 -> 击杀 5 只 -> 交付，拿到奖励', () => {
  reset();
  const p = addPlayer();
  const q = Q.questById('q1_awaken');
  assert.ok(Q.accept(p, q));
  assert.strictEqual(Q.turnIn(p, q, G.grantExp), null, '没打够不能交');
  for (let i = 0; i < 5; i++) Q.onKill(p, 'shadow_boar');
  const logs = Q.turnIn(p, q, G.grantExp);
  assert.ok(logs, '应能交付');
  assert.strictEqual(p.quests.q1_awaken, 'done');
  assert.ok(p.inv.rusty_sword, '应获得锈剑');
});
test('收集类任务交付后扣除材料', () => {
  reset();
  const p = addPlayer();
  p.quests.q1_awaken = 'done';
  const q = Q.questById('q2_pelt');
  Q.accept(p, q);
  Q.addItem(p, 'shadow_pelt', 4);
  Q.turnIn(p, q, G.grantExp);
  assert.strictEqual(p.inv.shadow_pelt, 1, '扣 3 张，剩 1 张');
  assert.ok(p.inv.leather_vest);
});
test('接取任务时重置该怪的历史击杀数', () => {
  reset();
  const p = addPlayer();
  p.kills.shadow_boar = 99;
  Q.accept(p, Q.questById('q1_awaken'));
  assert.strictEqual(p.kills.shadow_boar, 0);
});

console.log('\n[5] 守望塔与全服章节');
test('没有碎片时塔不会亮', () => {
  reset();
  const p = addPlayer();
  p.quests.q4_tower = 'active';
  p.x = D.TOWERS[0].x; p.y = D.TOWERS[0].y;
  G.interact(p);
  assert.strictEqual(p.interacted.length, 0);
});
test('带碎片点亮塔，重复点击不重复计数', () => {
  reset();
  const p = addPlayer();
  p.quests.q4_tower = 'active';
  Q.addItem(p, 'blade_shard');
  p.x = D.TOWERS[0].x; p.y = D.TOWERS[0].y;
  G.interact(p);
  G.interact(p);
  assert.strictEqual(p.interacted.length, 1);
  assert.strictEqual(G.state.towersLit.size, 1);
});
test('交付 q3 推进全服章节到第二章', () => {
  reset();
  const p = addPlayer();
  p.quests.q2_pelt = 'done';
  const q = Q.questById('q3_shard');
  Q.accept(p, q);
  Q.onKill(p, 'wolf_alpha');
  G.questAction(p, 'q3_shard', 'turnin');
  assert.strictEqual(G.state.chapter, 1);
  assert.ok(G.state.events.length > 0, '应有全服公告');
});

console.log('\n[6] 快照');
test('快照只包含视野内的实体', () => {
  reset();
  const p = addPlayer();
  G.spawnMob('shadow_boar', p.x + 50, p.y, 40);
  G.spawnMob('shadow_boar', p.x + 2000, p.y, 40);
  const snap = G.snapshotFor(p, Date.now());
  assert.strictEqual(snap.mobs.length, 1);
});

console.log(`\n通过 ${pass} 项\n`);
